
'use client';

import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2, Moon, Sun, Trash2, Heart, HeartOff, HelpCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, updateDoc, serverTimestamp, type Timestamp as FirebaseTimestamp, onSnapshot, Timestamp, orderBy, runTransaction, arrayUnion, arrayRemove, writeBatch, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore, messaging } from '@/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import QrScannerModal from '@/components/checkin/qr-scanner-modal';
import { cn } from '@/lib/utils';
import { ThemeProvider, useTheme } from '@/contexts/theme-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface UserVenueCoins {
    [partnerId: string]: number;
}

interface Notification {
  id: string;
  partnerId?: string;
  eventId?: string;
  venueName?: string;
  eventName?: string;
  message: string;
  createdAt: FirebaseTimestamp;
  read: boolean;
  venueType?: VenueType;
  musicStyles?: MusicStyle[];
}

interface FavoriteVenueNotificationSettings {
  [venueId: string]: boolean;
}

interface AppUser {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole | null;
  preferredVenueTypes?: VenueType[];
  preferredMusicStyles?: MusicStyle[];
  questionnaireCompleted?: boolean;
  lastNotificationCheckTimestamp?: FirebaseTimestamp;
  venueCoins?: UserVenueCoins;
  notifications?: Notification[];
  favoriteVenueIds?: string[];
  favoriteVenueNotificationSettings?: FavoriteVenueNotificationSettings;
  venueName?: string; // For partners
  address?: {
    city?: string;
    state?: string;
  };
  createdAt?: FirebaseTimestamp; // For partners trial period
  trialExpiredNotified?: boolean; // For partners
  stripeSubscriptionActive?: boolean; // For partners
  photoURL?: string | null;
  fcmTokens?: string[];
}


const activeEventNotificationListeners: Record<string, () => void> = {};

const useAuthAndUserSubscription = () => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;
    let unsubscribeCustomerDoc: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const baseAppUser: AppUser = {
              uid: user.uid,
              name: userData.name || user.displayName || (userData.role === UserRole.USER ? "Usuário Fervo" : "Parceiro Fervo"),
              email: user.email,
              role: userData.role as UserRole || UserRole.USER,
              preferredVenueTypes: userData.preferredVenueTypes || [],
              preferredMusicStyles: userData.preferredMusicStyles || [],
              questionnaireCompleted: userData.questionnaireCompleted || false,
              lastNotificationCheckTimestamp: userData.lastNotificationCheckTimestamp as FirebaseTimestamp || undefined,
              venueCoins: userData.venueCoins || {},
              notifications: userData.notifications || [],
              favoriteVenueIds: userData.favoriteVenueIds || [],
              favoriteVenueNotificationSettings: userData.favoriteVenueNotificationSettings || {},
              venueName: userData.venueName,
              address: userData.address,
              createdAt: userData.createdAt as FirebaseTimestamp || undefined,
              trialExpiredNotified: userData.trialExpiredNotified || false,
              stripeSubscriptionActive: false, // Default to false, will be updated by customer subscription listener
              photoURL: userData.photoURL || user.photoURL || null,
              fcmTokens: userData.fcmTokens || [],
            };

            if (userData.role === UserRole.PARTNER) {
                const subscriptionsQuery = query(collection(firestore, `customers/${user.uid}/subscriptions`), where("status", "in", ["trialing", "active"]));
                if(unsubscribeCustomerDoc) unsubscribeCustomerDoc(); // Unsubscribe from previous listener if it exists
                unsubscribeCustomerDoc = onSnapshot(subscriptionsQuery, (subscriptionsSnap) => {
                    let isActive = false;
                    if (!subscriptionsSnap.empty) {
                        isActive = true;
                    }
                    setAppUser(prevUser => ({... (prevUser || baseAppUser), stripeSubscriptionActive: isActive}));
                    setLoading(false); 
                }, (error) => {
                    console.error("Error fetching Stripe subscription status:", error);
                    setAppUser(prevUser => ({... (prevUser || baseAppUser), stripeSubscriptionActive: false}));
                    setLoading(false);
                });
            } else {
                setAppUser(baseAppUser);
                setLoading(false);
            }
          } else {
            // User authenticated but no Firestore document yet
            const defaultRoleBasedOnInitialAuthAttempt = pathname.includes('/partner') ? UserRole.PARTNER : UserRole.USER;
            setAppUser({
              uid: user.uid,
              name: user.displayName || (defaultRoleBasedOnInitialAuthAttempt === UserRole.USER ? "Usuário Fervo" : "Parceiro Fervo"),
              email: user.email,
              role: defaultRoleBasedOnInitialAuthAttempt,
              questionnaireCompleted: false,
              venueCoins: {},
              notifications: [],
              favoriteVenueIds: [],
              favoriteVenueNotificationSettings: {},
              venueName: undefined,
              address: undefined,
              createdAt: undefined,
              trialExpiredNotified: false,
              stripeSubscriptionActive: false,
              photoURL: user.photoURL || null,
              fcmTokens: [],
            });
            setLoading(false);
          }
        }, (error) => {
          console.error("Error fetching user document with onSnapshot:", error);
          setAppUser(null);
          setLoading(false);
          toast({ title: "Erro ao carregar dados", description: "Não foi possível sincronizar os dados do usuário.", variant: "destructive" });
        });
      } else {
        // No user is logged in
        setAppUser(null);
        setLoading(false);
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        if (unsubscribeCustomerDoc) unsubscribeCustomerDoc();
        unsubscribeUserDoc = undefined;
        unsubscribeCustomerDoc = undefined;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
      if (unsubscribeCustomerDoc) unsubscribeCustomerDoc();
      Object.values(activeEventNotificationListeners).forEach(unsub => unsub());
      for (const key in activeEventNotificationListeners) {
           delete activeEventNotificationListeners[key];
      }
    };
  }, [pathname, toast]); // Removed appUser from dependencies to avoid re-triggering on appUser changes

  return { firebaseUser, appUser, setAppUser, loading };
};

const useNotificationSetup = (user: AppUser | null, setAppUser: React.Dispatch<React.SetStateAction<AppUser | null>>) => {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && user && messaging) {
      const requestPermissionAndToken = async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            console.log('Notification permission granted.');
            const vapidKeyToUse = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BJfuqMoIg71930bvxMlESIA55IA3bjFB7HdMbkdo3hlgoFSAiHGTjz3Sh-MACsdvu8IgNQEVaUyztm4J4kWzEaE";
            if (!vapidKeyToUse || vapidKeyToUse === "SUA_CHAVE_PUBLICA_VAPID_AQUI") {
                console.warn("VAPID key is not defined or is a placeholder. Push notifications might not work correctly.");
                toast({ title: "Configuração Incompleta", description: "A chave VAPID para notificações não está configurada.", variant: "destructive"});
            }
            const currentToken = await getToken(messaging, { vapidKey: vapidKeyToUse });

            if (currentToken) {
              console.log('FCM Token:', currentToken);
              const userDocRef = doc(firestore, 'users', user.uid);
              // Use a transaction or a server-side update for atomicity if fcmTokens is critical
              const userDocSnap = await getDoc(userDocRef);
              const existingTokens = userDocSnap.data()?.fcmTokens || [];
              if (!existingTokens.includes(currentToken)) {
                await updateDoc(userDocRef, {
                  fcmTokens: arrayUnion(currentToken),
                });
                console.log('FCM token saved to Firestore.');
                if(setAppUser) {
                  setAppUser(prev => prev ? { ...prev, fcmTokens: [...existingTokens, currentToken] } : null);
                }
              }
            } else {
              console.log('No registration token available. Request permission to generate one.');
            }
          } else {
            console.log('Unable to get permission to notify.');
          }
        } catch (err) {
          console.error('An error occurred while retrieving token. ', err);
        }
      };

      requestPermissionAndToken();

      const unsubscribeOnMessage = onMessage(messaging, (payload) => {
        console.log('Message received in foreground. ', payload);
        toast({
          title: payload.notification?.title || "Nova Notificação",
          description: payload.notification?.body || "Você tem uma nova mensagem!",
        });
      });
      return () => {
        unsubscribeOnMessage();
      };
    }
  }, [user, toast, setAppUser]);
};


export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appUser, setAppUser, loading } = useAuthAndUserSubscription();
  useNotificationSetup(appUser, setAppUser);
  const { theme, setTheme } = useTheme();

  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const prevAppUserRef = useRef<AppUser | null>(null);


  const totalFervoCoins = useMemo(() => {
    if (!appUser || !appUser.venueCoins) return 0;
    return Object.values(appUser.venueCoins).reduce((sum, count) => sum + count, 0);
  }, [appUser?.venueCoins]);

  const unreadNotificationsCount = useMemo(() => {
    if (!appUser || !appUser.notifications) return 0;
    return appUser.notifications.filter(n => !n.read).length;
  }, [appUser?.notifications]);


  useEffect(() => {
    if (loading) {
      return;
    }

    const isAuthPage = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
    const isSharedEventPage = pathname.startsWith('/shared-event');
    // More specific check for user-accessible pages that don't require full questionnaire completion yet
    const isGeneralUserAccessiblePage = ['/user/profile', '/user/coins', '/user/favorites', '/user/coupons', '/user/help'].includes(pathname);


    if (!appUser) {
      if (!isAuthPage && !isSharedEventPage && !isGeneralUserAccessiblePage ) {
        router.push('/login');
      }
    } else {
      // User is authenticated
      if (isAuthPage) { // If on an auth page (login, questionnaire)
        if (appUser.questionnaireCompleted) {
          const targetPath = appUser.role === UserRole.USER ? '/map' : '/partner/dashboard';
          router.push(targetPath);
        } else {
            // If on /login but questionnaire not complete, redirect to appropriate questionnaire
            if (pathname === '/login') {
                 const questionnairePath = appUser.role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire';
                 router.push(questionnairePath);
            }
            // Otherwise, stay on questionnaire page if they are there
        }
      } else { // If on a main app page (not auth, not shared event)
        if (!appUser.questionnaireCompleted && !isGeneralUserAccessiblePage && !isSharedEventPage) {
          // If questionnaire is not complete AND it's not a general accessible page or shared event, redirect to questionnaire
          const questionnairePath = appUser.role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire';
          router.push(questionnairePath);
        }
        // If questionnaire is complete, or it's a general accessible page/shared event, allow access
      }
    }
  }, [appUser, loading, router, pathname]);

  useEffect(() => {
    if (!loading && prevAppUserRef.current === null && appUser !== null && appUser.questionnaireCompleted) {
      let isPartnerTrialExpiredRecently = false;
      let isPartnerWithActiveSub = false;

      if (appUser.role === UserRole.PARTNER) {
        isPartnerWithActiveSub = appUser.stripeSubscriptionActive || false;
        // Check if trialExpiredNotified is true AND there's no active sub, meaning they were notified of expiration
        if (appUser.createdAt && appUser.trialExpiredNotified === true && !isPartnerWithActiveSub) {
            const createdAtDate = appUser.createdAt.toDate();
            const trialEndDate = new Date(createdAtDate.getTime() + 15 * 24 * 60 * 60 * 1000);
            const now = new Date();
            if (now > trialEndDate) { // Double check if trial is indeed over
                 isPartnerTrialExpiredRecently = true; // This flag means trial is over, they were notified, and they haven't subscribed
            }
        }
      }

      let greetingTitle = "";
      let greetingDescription = "";

      const now = new Date();
      const hour = now.getHours();
      let greetingPrefix = "";

      if (hour >= 0 && hour < 5) {
        greetingPrefix = "Boa Madrugada";
      } else if (hour >= 5 && hour < 12) {
        greetingPrefix = "Bom Dia";
      } else if (hour >= 12 && hour < 18) {
        greetingPrefix = "Boa Tarde";
      } else {
        greetingPrefix = "Boa Noite";
      }

      if (appUser.role === UserRole.USER) {
          greetingTitle = `${greetingPrefix}, ${appUser.name}!`;
          greetingDescription = "Onde vamos hoje?";
      } else if (appUser.role === UserRole.PARTNER) {
          greetingTitle = `${greetingPrefix}, ${appUser.venueName || appUser.name}!`;
          greetingDescription = "Qual Evento Vai Rolar Hoje?";
      }

      // Only show the general greeting if the partner is not in the "trial recently expired and not subscribed" state
      if (greetingTitle && (!isPartnerTrialExpiredRecently)){
          toast({
            title: greetingTitle,
            description: greetingDescription,
            variant: "default",
            duration: 3000,
          });
      }
    }
    prevAppUserRef.current = appUser;
  }, [appUser, loading, toast]);

  useEffect(() => {
    if (loading || !appUser || !appUser.uid || !appUser.questionnaireCompleted || appUser.role !== UserRole.USER) {
      return;
    }

    const partnersRef = collection(firestore, 'users');
    const q = query(partnersRef,
      where('role', '==', UserRole.PARTNER),
      where('questionnaireCompleted', '==', true)
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const potentialNewNotifications: Notification[] = [];
      const userLastCheck = appUser.lastNotificationCheckTimestamp?.toDate() || new Date(0);

      for (const partnerDoc of querySnapshot.docs) {
        const partnerData = partnerDoc.data();
        const partnerId = partnerDoc.id;
        const partnerProfileCompletedAt = (partnerData.questionnaireCompletedAt as FirebaseTimestamp)?.toDate();

        if (!partnerProfileCompletedAt) continue;

        const isPartnerConsideredNew = partnerProfileCompletedAt > userLastCheck;

        if (isPartnerConsideredNew) {
          const typeMatch = appUser.preferredVenueTypes?.includes(partnerData.venueType as VenueType);
          const styleMatch = Array.isArray(partnerData.musicStyles) && partnerData.musicStyles.some((style: MusicStyle) => appUser.preferredMusicStyles?.includes(style));

          const userCity = appUser.address?.city?.toLowerCase();
          const userState = appUser.address?.state?.toLowerCase();
          const partnerCity = partnerData.address?.city?.toLowerCase();
          const partnerState = partnerData.address?.state?.toLowerCase();
          
          const locationMatch = userCity && userState && partnerCity && partnerState &&
                                userCity === partnerCity &&
                                userState === partnerState;

          if ((typeMatch || styleMatch) && locationMatch) {
            potentialNewNotifications.push({
              id: `partner_${partnerId}_${partnerProfileCompletedAt.getTime()}`,
              partnerId: partnerId,
              venueName: partnerData.venueName || "Novo Local",
              message: `Novo Fervo em ${partnerData.address?.city || 'sua região'} que combina com você: ${partnerData.venueName || "Novo Local"}!`,
              createdAt: partnerData.questionnaireCompletedAt as FirebaseTimestamp,
              read: false,
              venueType: partnerData.venueType as VenueType,
              musicStyles: (partnerData.musicStyles || []) as MusicStyle[],
            });
          }
        }
      }

      if (potentialNewNotifications.length > 0 && appUser.uid) {
        const userDocRefToUpdate = doc(firestore, "users", appUser.uid);

        try {
            await runTransaction(firestore, async (transaction) => {
                const currentUserDocSnap = await transaction.get(userDocRefToUpdate);
                if (!currentUserDocSnap.exists()) {
                    console.warn("User document not found for updating new partner notifications.");
                    return;
                }
                const freshExistingNotificationsFromDB: Notification[] = currentUserDocSnap.data()?.notifications || [];
                const notificationsActuallyToAdd = potentialNewNotifications.filter(newNotif =>
                    !freshExistingNotificationsFromDB.some((exNotif: Notification) => exNotif.id === newNotif.id)
                );

                if (notificationsActuallyToAdd.length > 0) {
                    const finalNotifications = [...freshExistingNotificationsFromDB, ...notificationsActuallyToAdd]
                        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
                        .slice(0, 20); // Keep only the latest 20 notifications

                    let maxCreatedAt: FirebaseTimestamp | undefined = currentUserDocSnap.data()?.lastNotificationCheckTimestamp;
                    notificationsActuallyToAdd.forEach(n => {
                        if (!maxCreatedAt || n.createdAt.toMillis() > maxCreatedAt.toMillis()) {
                            maxCreatedAt = n.createdAt;
                        }
                    });
                    const updatePayload: any = { notifications: finalNotifications };
                    if (maxCreatedAt && (!appUser.lastNotificationCheckTimestamp || maxCreatedAt.toMillis() > appUser.lastNotificationCheckTimestamp.toMillis())) {
                        updatePayload.lastNotificationCheckTimestamp = maxCreatedAt;
                    }
                    transaction.update(userDocRefToUpdate, updatePayload);
                }
            });
        } catch (error) {
            console.error("Error in transaction for new partner notifications:", error);
        }
      }
    }, (error) => {
      console.error("Error listening for new partner notifications:", error);
    });

    return () => unsubscribe();
  }, [appUser, loading]); // Dependencies for new partner notifications


  useEffect(() => {
    if (loading || !appUser || !appUser.uid || !appUser.favoriteVenueIds || appUser.favoriteVenueIds.length === 0 || appUser.role !== UserRole.USER) {
      Object.keys(activeEventNotificationListeners).forEach(venueId => {
        if (activeEventNotificationListeners[venueId]) {
          activeEventNotificationListeners[venueId]();
          delete activeEventNotificationListeners[venueId];
        }
      });
      return;
    }

    const currentFavorites = appUser.favoriteVenueIds || [];
    const currentSettings = appUser.favoriteVenueNotificationSettings || {};

    currentFavorites.forEach(async (venueId) => {
      const notificationsEnabledForVenue = currentSettings[venueId] ?? true; // Default to true if not set

      if (notificationsEnabledForVenue && !activeEventNotificationListeners[venueId]) {
        // Fetch venue name once for notifications from this venue
        const venueDocRef = doc(firestore, "users", venueId);
        const venueDocSnap = await getDoc(venueDocRef);
        const venueName = venueDocSnap.exists() ? venueDocSnap.data().venueName : "Local Desconhecido";

        const eventsRef = collection(firestore, `users/${venueId}/events`);
        // Listen for new and modified events, ordered by when they were last updated
        const qEvents = query(eventsRef, where('visibility', '==', true), orderBy('updatedAt', 'desc'));

        const unsubscribe = onSnapshot(qEvents, async (snapshot) => {
          const userDocRefToUpdate = doc(firestore, "users", appUser.uid!); // Ensured appUser.uid exists
          const notificationsToAddThisCycle: Notification[] = [];

          // Fetch the latest lastNotificationCheckTimestamp for the user before processing changes
          // This is crucial to avoid re-notifying for events already seen if the appUser state is stale
          const currentAppUserDocSnap = await getDoc(userDocRefToUpdate);
          const currentAppUserLastCheck = currentAppUserDocSnap.data()?.lastNotificationCheckTimestamp?.toMillis() || 0;


          snapshot.docChanges().forEach((change) => {
            const eventData = change.doc.data();
            const eventId = change.doc.id;
            const eventCreatedAt = eventData.createdAt as FirebaseTimestamp;
            const eventUpdatedAt = eventData.updatedAt as FirebaseTimestamp; // This is the key for "modified"
            const eventEndDateTime = eventData.endDateTime as FirebaseTimestamp;

            // Skip if event has already ended
            if (eventEndDateTime && eventEndDateTime.toDate() < new Date()) {
              return;
            }

            const relevantTimestamp = eventUpdatedAt || eventCreatedAt; // Prioritize updatedAt for changes

            if (relevantTimestamp && relevantTimestamp.toMillis() > currentAppUserLastCheck) {
                let message = "";
                let notificationIdSuffix = "";

                if (change.type === "added") {
                    message = `Novo evento em ${venueName}: ${eventData.eventName}!`;
                    notificationIdSuffix = `new_${relevantTimestamp.toMillis()}`;
                } else if (change.type === "modified") {
                    // Only notify for modification if the event was created *before* the last check,
                    // but updated *after* it. This avoids double notifications for newly added events
                    // that might also appear as "modified" initially by Firestore.
                    if (eventCreatedAt && eventCreatedAt.toMillis() <= currentAppUserLastCheck) {
                        message = `Evento atualizado em ${venueName}: ${eventData.eventName}. Confira as novidades!`;
                        notificationIdSuffix = `update_${relevantTimestamp.toMillis()}`;
                    } else {
                        return; // Don't notify for "modification" of a brand new event
                    }
                } else {
                    return; // Only handle 'added' and 'modified'
                }

                if (message) {
                     notificationsToAddThisCycle.push({
                        id: `event_${venueId}_${eventId}_${notificationIdSuffix}`,
                        partnerId: venueId,
                        eventId: eventId,
                        venueName: venueName,
                        eventName: eventData.eventName,
                        message: message,
                        createdAt: relevantTimestamp, // Use the relevant timestamp for sorting
                        read: false,
                    });
                }
            }
          });

          if (notificationsToAddThisCycle.length > 0) {
            try {
                await runTransaction(firestore, async (transaction) => {
                    const currentUserDocSnapForTransaction = await transaction.get(userDocRefToUpdate);
                     if (!currentUserDocSnapForTransaction.exists()) {
                        console.warn("User document not found for updating favorite event notifications.");
                        return;
                    }
                    const freshExistingUserNotifications: Notification[] = currentUserDocSnapForTransaction.data()?.notifications || [];
                    
                    // Filter out notifications that might have already been added by another listener or tab
                    const notificationsActuallyToAdd = notificationsToAddThisCycle.filter(newNotif =>
                        !freshExistingUserNotifications.some((exNotif: Notification) => exNotif.id === newNotif.id)
                    );

                    if (notificationsActuallyToAdd.length > 0) {
                        const allNotifications = [...freshExistingUserNotifications, ...notificationsActuallyToAdd]
                          .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()) // Sort all by most recent
                          .slice(0, 20); // Keep only the latest 20

                        let maxCreatedAtOfNew: FirebaseTimestamp | null = null;
                        notificationsActuallyToAdd.forEach(n => {
                            if (!maxCreatedAtOfNew || n.createdAt.toMillis() > maxCreatedAtOfNew.toMillis()) {
                                maxCreatedAtOfNew = n.createdAt;
                            }
                        });

                        const updatePayload: any = { notifications: allNotifications };
                        const currentLastCheckFromTransaction = currentUserDocSnapForTransaction.data()?.lastNotificationCheckTimestamp;
                        if (maxCreatedAtOfNew && (!currentLastCheckFromTransaction || maxCreatedAtOfNew.toMillis() > currentLastCheckFromTransaction.toMillis())) {
                            updatePayload.lastNotificationCheckTimestamp = maxCreatedAtOfNew;
                        }
                       transaction.update(userDocRefToUpdate, updatePayload);
                    }
                });
            } catch (error) {
                 console.error("Error in transaction for favorite event notifications:", error);
            }
          }
        }, (error) => {
          console.error(`Error listening for events in venue ${venueId}:`, error);
        });
        activeEventNotificationListeners[venueId] = unsubscribe;
      } else if (!notificationsEnabledForVenue && activeEventNotificationListeners[venueId]) {
        // If notifications for this venue were disabled, stop listening
        activeEventNotificationListeners[venueId]();
        delete activeEventNotificationListeners[venueId];
      }
    });

    // Cleanup: Remove listeners for venues no longer in favorites
    Object.keys(activeEventNotificationListeners).forEach(venueId => {
      if (!currentFavorites.includes(venueId)) {
        if (activeEventNotificationListeners[venueId]) {
             activeEventNotificationListeners[venueId]();
             delete activeEventNotificationListeners[venueId];
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser?.favoriteVenueIds, appUser?.favoriteVenueNotificationSettings, loading]); // React to changes in favorites and their settings


  const handleNotificationsClick = async () => {
    if (!appUser || !appUser.uid) {
      toast({ title: "Login Necessário", description: "Faça login para ver notificações." });
      return;
    }

    if (!appUser.questionnaireCompleted) {
      toast({ title: "Complete seu Perfil", description: "Preencha suas preferências para receber sugestões de Fervos!", duration: 5000 });
      return;
    }

    if ((!appUser.preferredVenueTypes || appUser.preferredVenueTypes.length === 0) &&
        (!appUser.preferredMusicStyles || appUser.preferredMusicStyles.length === 0) &&
        (!appUser.address || !appUser.address.city || !appUser.address.state) &&
        (!appUser.favoriteVenueIds || appUser.favoriteVenueIds.length === 0)) {
       toast({ title: "Defina Preferências ou Favoritos", description: "Adicione seus tipos de locais, estilos musicais, sua cidade/estado no perfil, ou favorite locais para receber notificações e sugestões.", duration: 8000 });
       return;
    }

    setShowNotificationDropdown(prev => !prev);

    if (unreadNotificationsCount > 0 && appUser.notifications && setAppUser) {
        const userDocRef = doc(firestore, "users", appUser.uid);
        // Create a deep copy to avoid mutating state directly before Firestore update
        const currentNotificationsCopy = JSON.parse(JSON.stringify(appUser.notifications));
        const updatedNotifications = currentNotificationsCopy.map((n: Notification) => ({ ...n, read: true }));

        // Optimistically update client state
        setAppUser(prev => prev ? {...prev, notifications: updatedNotifications } : null);

        // Update Firestore in the background
        // No need to update lastNotificationCheckTimestamp here, as it's updated when notifications are added
        updateDoc(userDocRef, {
            notifications: updatedNotifications,
        }).catch(error => {
            console.error("Error updating notifications as read in Firestore:", error);
            // Revert client state on error if needed
            setAppUser(prev => prev ? {...prev, notifications: appUser.notifications } : null); // Revert
            toast({ title: "Erro ao Marcar Notificações", description: "Não foi possível marcar notificações como lidas no servidor.", variant: "destructive" });
        });
    } else if (appUser.notifications && appUser.notifications.length === 0){
         toast({ title: "Nenhuma Notificação", description: "Você não tem novas notificações. Continue explorando!", duration: 5000 });
    }
  };

 const dismissNotification = async (notificationId: string) => {
    if (!appUser || !appUser.uid || !setAppUser) {
      toast({ title: "Erro", description: "Usuário não autenticado para remover notificação.", variant: "destructive"});
      return;
    }

    const userDocRef = doc(firestore, "users", appUser.uid);
    try {
        await runTransaction(firestore, async (transaction) => {
            const userSnap = await transaction.get(userDocRef);
            if (!userSnap.exists()) {
                 throw new Error("User document not found for dismissing notification.");
            }
            const currentDbNotifications: Notification[] = userSnap.data()?.notifications || [];
            const updatedDbNotifications = currentDbNotifications.filter((n) => n.id !== notificationId);
            transaction.update(userDocRef, { notifications: updatedDbNotifications });
        });

        // The onSnapshot listener for appUser.notifications will automatically update the client state.
        // No need for optimistic update here if onSnapshot is reliable.
        // However, if immediate feedback is desired or onSnapshot has latency:
        setAppUser(prev => {
            if (!prev || !prev.notifications) return prev;
            return { ...prev, notifications: prev.notifications.filter(n => n.id !== notificationId) };
        });
        toast({ title: "Notificação Removida", description: "A notificação foi removida permanentemente.", variant: "default", duration: 3000 });

    } catch (error: any) {
        console.error("Error dismissing notification from Firestore:", error);
        toast({ title: "Erro ao Remover", description: error.message || "Não foi possível remover a notificação do sistema.", variant: "destructive" });
    }
  };


  const handleLogout = async () => {
    try {
      // Remove FCM token for this device
      if (appUser?.uid && messaging) {
        const vapidKeyToUse = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BJfuqMoIg71930bvxMlESIA55IA3bjFB7HdMbkdo3hlgoFSAiHGTjz3Sh-MACsdvu8IgNQEVaUyztm4J4kWzEaE";
        try {
          const currentToken = await getToken(messaging, { vapidKey: vapidKeyToUse });
          if (currentToken) {
            const userDocRef = doc(firestore, 'users', appUser.uid);
            await updateDoc(userDocRef, {
              fcmTokens: arrayRemove(currentToken)
            });
            console.log('FCM token removed on logout.');
          }
        } catch (tokenError) {
          console.error('Error removing FCM token on logout:', tokenError);
        }
      }
      await auth.signOut();
      router.push('/login');
      toast({ title: "Logout", description: "Você foi desconectado." });
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Erro no Logout", description: "Não foi possível desconectar.", variant: "destructive" });
    }
  };


  const handleCoinsClick = async () => {
    if (!appUser || !appUser.venueCoins) {
      toast({ title: "Minhas FervoCoins", description: "Você ainda não tem FervoCoins. Compartilhe eventos para ganhar!", variant: "default", duration: 5000 });
      return;
    }
     router.push('/user/coins');
  };

  const handleChatIconClick = () => {
    toast({
        title: "Fervo Chat nos Eventos!",
        description: "O chat agora é específico para cada evento. Para participar, primeiro faça check-in no evento desejado através do mapa.",
        duration: 7000
    });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // Determine if children should be rendered based on loading and auth state
  let renderChildrenContent = false;
  if (!loading) {
    const isAuthPg = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
    const isSharedEvtPg = pathname.startsWith('/shared-event');
    const isGeneralUserAccPg = ['/user/profile', '/user/coins', '/user/favorites', '/user/coupons', '/user/help'].includes(pathname);


    if (isAuthPg || isSharedEvtPg || isGeneralUserAccPg) {
      renderChildrenContent = true; // Always render these pages, auth state handled within them
    } else if (appUser) { // If user is authenticated
      if (appUser.questionnaireCompleted) {
        renderChildrenContent = true; // Render if questionnaire is complete
      } else {
        // If questionnaire is not complete, they should have been redirected already by the useEffect above.
        // This path should ideally not be hit often for main app pages if redirection logic is sound.
        // Render a loader as a fallback if redirection hasn't happened yet or is in progress.
        renderChildrenContent = false; 
      }
    } else {
      // No user, and not an auth/shared/general page, should have been redirected to login.
      // Render a loader as a fallback.
      renderChildrenContent = false;
    }
  }


  const activeColorClass = 'text-primary';
  const activeBorderColorClass = 'border-primary';
  const hoverBgClass = 'hover:bg-primary/10';


  return (
    <div className="flex flex-col min-h-screen">
      {appUser && (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex items-center h-16 max-w-screen-2xl">
             <Logo logoSrc="/images/fervoapp_logo_512x512.png" logoWidth={40} logoHeight={40} className="mr-auto md:mr-4" />

            <nav className="flex items-center gap-1 ml-auto sm:gap-2 md:gap-4">
              {appUser?.role === UserRole.USER && (
                <>
                  <Link href="/map" passHref>
                    <Button variant={pathname === '/map' ? 'secondary': 'ghost'} className={cn(pathname === '/map' ? activeColorClass : '', hoverBgClass)}>
                      <Map className="w-4 h-4 mr-0 md:mr-2" /> <span className="hidden md:inline">Mapa de Eventos</span>
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(activeColorClass, hoverBgClass)}
                    onClick={() => setIsQrScannerOpen(true)}
                    title="Check-in com QR Code"
                  >
                    <ScanLine className="w-5 h-5" />
                    <span className="sr-only">Check-in QR Code</span>
                  </Button>
                  <DropdownMenu open={showNotificationDropdown} onOpenChange={setShowNotificationDropdown}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              activeColorClass,
                              hoverBgClass,
                              unreadNotificationsCount > 0 && 'animate-pulse ring-2 ring-destructive ring-offset-2 ring-offset-background'
                            )}
                            onClick={handleNotificationsClick}
                            title="Notificações"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadNotificationsCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                                </span>
                            )}
                            <span className="sr-only">Notificações</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto" align="end">
                        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(appUser.notifications && appUser.notifications.length > 0) ? (
                            appUser.notifications.map((notification) => (
                                <DropdownMenuItem
                                  key={notification.id}
                                  className={cn(
                                    "flex justify-between items-start whitespace-normal cursor-pointer",
                                    !notification.read && "bg-primary/10",
                                     "hover:bg-accent/10"
                                  )}
                                  onClick={() => {
                                    if (notification.partnerId) {
                                      router.push(`/map?venueId=${notification.partnerId}${notification.eventId ? `&eventId=${notification.eventId}` : ''}`);
                                      setShowNotificationDropdown(false);
                                    }
                                  }}
                                >
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{notification.venueName || notification.eventName || "Nova Notificação"}</p>
                                        <p className="text-xs text-muted-foreground">{notification.message}</p>
                                        <p className="text-xs text-muted-foreground/70 pt-1">
                                            {new Date(notification.createdAt.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="ml-2 h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                                      onClick={(e) => { e.stopPropagation(); dismissNotification(notification.id);}}
                                      title="Remover notificação"
                                    >
                                        <Trash2 className="w-3.5 h-3.5"/>
                                    </Button>
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <DropdownMenuItem disabled>Nenhuma notificação nova.</DropdownMenuItem>
                        )}
                         {(appUser.notifications && appUser.notifications.length > 0 && unreadNotificationsCount === 0) && (
                            <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="text-center text-xs text-muted-foreground">Você está em dia!</DropdownMenuItem>
                            </>
                         )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                   <div className="relative">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(activeColorClass, hoverBgClass)}
                        onClick={handleCoinsClick}
                        title="Minhas FervoCoins"
                      >
                         <Coins className="w-5 h-5" />
                        <span className="sr-only">Moedas</span>
                      </Button>
                      {totalFervoCoins > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground text-[10px] font-bold">
                          {totalFervoCoins > 9 ? '9+' : totalFervoCoins}
                          </span>
                      )}
                  </div>
                  <Link href="/user/coupons" passHref>
                    <Button variant="ghost" size="icon" className={cn(activeColorClass, hoverBgClass)} title="Meus Cupons">
                        <TicketPercent className="w-5 h-5" />
                        <span className="sr-only">Cupons de Desconto</span>
                    </Button>
                  </Link>
                </>
              )}
              {appUser?.role === UserRole.PARTNER && (
                <Link href="/partner/dashboard" passHref>
                  <Button variant={pathname === '/partner/dashboard' ? 'secondary' : 'ghost'} className={cn(pathname === '/partner/dashboard' ? activeColorClass : '', hoverBgClass)}>
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Meu Painel
                  </Button>
                </Link>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={`relative w-10 h-10 rounded-full ${activeBorderColorClass} border-2 p-0 flex items-center justify-center`}>
                    <Avatar className="h-9 w-9">
                      {appUser?.photoURL ? (
                        <AvatarImage src={appUser.photoURL} alt={appUser.name || "User Avatar"} data-ai-hint="user avatar" />
                      ) : (
                         <AvatarFallback className={cn(activeColorClass, "bg-transparent text-lg font-semibold")}>
                            {appUser?.name ? appUser.name.charAt(0).toUpperCase() : <UserCircle className="w-6 h-6" />}
                         </AvatarFallback>
                      )}
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{appUser?.name || (appUser?.role === UserRole.USER ? "Usuário Fervo" : "Parceiro Fervo")}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {appUser?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {appUser?.role === UserRole.USER && (
                    <>
                    <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                      <UserCircle className="w-4 h-4 mr-2" />
                      Meu Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/user/coins')}>
                        <Coins className="w-4 h-4 mr-2" />
                        Minhas FervoCoins
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/user/favorites')}>
                      <Heart className="w-4 h-4 mr-2" />
                      Meus Fervos Favoritos
                    </DropdownMenuItem>
                    </>
                  )}
                  {appUser?.role === UserRole.PARTNER && (
                    <>
                    <DropdownMenuItem onClick={() => router.push('/partner-questionnaire')}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações do Local
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/partner/settings')}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações da Conta
                    </DropdownMenuItem>
                    </>
                  )}
                   <DropdownMenuItem onClick={() => router.push('/user/help')}>
                      <HelpCircle className="w-4 h-4 mr-2" />
                      Central de Ajuda
                   </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                      {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                      {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
        </header>
      )}
      <main className="flex-1">
        {renderChildrenContent ? children : (
          <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-background text-foreground"> {/* Adjusted min-height */}
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
             <p className="ml-2">Carregando...</p>
          </div>
        )}
      </main>

       {/* Floating Chat Info Button - REMOVED as per user request to remove old global chat */}
       {/*
        appUser && appUser.questionnaireCompleted && appUser.role === UserRole.USER && (
        <div className="fixed bottom-6 right-6 z-40">
            <Button
                onClick={handleChatIconClick} // This now shows a toast
                className={cn(
                    "rounded-full h-14 w-14 p-0 shadow-lg text-white flex items-center justify-center",
                    "bg-gradient-to-br from-primary to-accent hover:from-primary/80 hover:to-accent/80",
                    "animate-bounce hover:animate-none"
                )}
                aria-label="Informações sobre o Fervo Chat"
                title="Informações sobre o Fervo Chat"
            >
                <MessageSquare className="h-7 w-7" />
            </Button>
        </div>
      )*/}


      {appUser && appUser.role === UserRole.USER && appUser.uid && (
        <QrScannerModal
          isOpen={isQrScannerOpen}
          onClose={() => setIsQrScannerOpen(false)}
          userId={appUser.uid}
        />
      )}
    </div>
  );
}
