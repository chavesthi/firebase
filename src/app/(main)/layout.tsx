
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
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2, Moon, Sun, Trash2, Heart, HeartOff, HelpCircle, MessageSquare, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, updateDoc, serverTimestamp, type Timestamp as FirebaseTimestamp, onSnapshot, Timestamp, orderBy, runTransaction, arrayUnion, arrayRemove, writeBatch, deleteDoc, increment } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore, messaging } from '@/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import QrScannerModal from '@/components/checkin/qr-scanner-modal';
import { cn } from '@/lib/utils';
import { ThemeProvider, useTheme } from '@/contexts/theme-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle as WidgetCardTitle } from '@/components/ui/card'; // Renamed CardTitle to avoid conflict with Radix
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatInputForm } from '@/components/chat/chat-input-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as RadixAlertDialogTitle, // Renamed to avoid conflict
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


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

interface CheckedInEvent {
  eventId: string;
  partnerId: string;
  eventName: string;
  checkedInAt: FirebaseTimestamp;
  hasRated?: boolean;
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
  checkedInEvents?: Record<string, CheckedInEvent>;
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
    let unsubscribeCheckedInEvents: (() => void) | undefined;


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
              stripeSubscriptionActive: false, // Will be updated by customerDoc listener
              photoURL: userData.photoURL || user.photoURL || null,
              fcmTokens: userData.fcmTokens || [],
              checkedInEvents: {}, // Will be updated by checkedInEvents listener
            };

            let isCustomerDocListenerNeeded = true;
            let areCheckedInEventsListenerNeeded = true;

            if (userData.role === UserRole.PARTNER) {
                const subscriptionsQuery = query(collection(firestore, `customers/${user.uid}/subscriptions`), where("status", "in", ["trialing", "active"]));
                if(unsubscribeCustomerDoc) unsubscribeCustomerDoc();
                unsubscribeCustomerDoc = onSnapshot(subscriptionsQuery, (subscriptionsSnap) => {
                    let isActive = !subscriptionsSnap.empty;
                    setAppUser(prevUser => ({... (prevUser || baseAppUser), stripeSubscriptionActive: isActive}));
                    isCustomerDocListenerNeeded = false; // Mark as done
                    if (!areCheckedInEventsListenerNeeded) setLoading(false);
                }, (error) => {
                    console.error("Error fetching Stripe subscription status:", error);
                    setAppUser(prevUser => ({... (prevUser || baseAppUser), stripeSubscriptionActive: false}));
                    isCustomerDocListenerNeeded = false;
                    if (!areCheckedInEventsListenerNeeded) setLoading(false);
                });
            } else {
                 isCustomerDocListenerNeeded = false; // Not a partner, no need for this listener
            }

            const checkedInEventsRef = collection(firestore, `users/${user.uid}/checkedInEvents`);
            if(unsubscribeCheckedInEvents) unsubscribeCheckedInEvents();
            unsubscribeCheckedInEvents = onSnapshot(checkedInEventsRef, (snapshot) => {
                const checkInsData: Record<string, CheckedInEvent> = {};
                snapshot.docs.forEach(docSnap => {
                    checkInsData[docSnap.id] = docSnap.data() as CheckedInEvent;
                });
                setAppUser(prevUser => ({ ... (prevUser || baseAppUser), checkedInEvents: checkInsData }));
                areCheckedInEventsListenerNeeded = false; // Mark as done
                if (!isCustomerDocListenerNeeded) setLoading(false);
            }, (error) => {
                console.error("Error fetching checked-in events:", error);
                setAppUser(prevUser => ({ ... (prevUser || baseAppUser), checkedInEvents: {} }));
                areCheckedInEventsListenerNeeded = false;
                if (!isCustomerDocListenerNeeded) setLoading(false);
            });


            // Initial set, will be refined by listeners
            setAppUser(baseAppUser);
            if (!isCustomerDocListenerNeeded && !areCheckedInEventsListenerNeeded) {
                setLoading(false);
            }


          } else {
            // User authenticated but no Firestore document yet
            console.warn("User document not found for UID:", user.uid);
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
              checkedInEvents: {},
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
        setAppUser(null);
        setLoading(false);
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        if (unsubscribeCustomerDoc) unsubscribeCustomerDoc();
        if (unsubscribeCheckedInEvents) unsubscribeCheckedInEvents();
        unsubscribeUserDoc = undefined;
        unsubscribeCustomerDoc = undefined;
        unsubscribeCheckedInEvents = undefined;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
      if (unsubscribeCustomerDoc) unsubscribeCustomerDoc();
      if (unsubscribeCheckedInEvents) unsubscribeCheckedInEvents();
      Object.values(activeEventNotificationListeners).forEach(unsub => unsub());
      for (const key in activeEventNotificationListeners) {
           delete activeEventNotificationListeners[key];
      }
    };
  }, [pathname, toast]);

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
            }
            const currentToken = await getToken(messaging, { vapidKey: vapidKeyToUse });

            if (currentToken && user?.uid) {
              console.log('FCM Token:', currentToken);
              const userDocRef = doc(firestore, 'users', user.uid);
              // Check against local state first to avoid unnecessary Firestore read if token already exists
              if (!user.fcmTokens?.includes(currentToken)) {
                await updateDoc(userDocRef, {
                  fcmTokens: arrayUnion(currentToken),
                });
                console.log('FCM token saved to Firestore.');
                // Optimistically update local state via the main onSnapshot listener for AppUser
              }
            } else {
              console.log('No registration token available or user not available. Request permission to generate one.');
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

  // States for global chat widget
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [chatEventName, setChatEventName] = useState<string | null>(null);
  const [isChatSoundMuted, setIsChatSoundMuted] = useState(false);
  const [showClearEventChatDialog, setShowClearEventChatDialog] = useState(false);
  const [eventChatClearedTimestamp, setEventChatClearedTimestamp] = useState<number | null>(null);


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
    const isGeneralUserAccessiblePage = ['/user/profile', '/user/coins', '/user/favorites', '/user/coupons', '/user/help', '/privacy-policy'].includes(pathname);


    if (!appUser) {
      if (!isAuthPage && !isSharedEventPage && !isGeneralUserAccessiblePage ) {
        router.push('/login');
      }
    } else {
      if (isAuthPage) {
        if (appUser.questionnaireCompleted) {
          const targetPath = appUser.role === UserRole.USER ? '/map' : '/partner/dashboard';
          router.push(targetPath);
        } else {
            if (pathname === '/login') {
                 const questionnairePath = appUser.role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire';
                 router.push(questionnairePath);
            }
        }
      } else {
        if (!appUser.questionnaireCompleted && !isGeneralUserAccessiblePage && !isSharedEventPage) {
          const questionnairePath = appUser.role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire';
          router.push(questionnairePath);
        }
      }
    }
  }, [appUser, loading, router, pathname]);

  useEffect(() => {
    if (!loading && prevAppUserRef.current === null && appUser !== null && appUser.questionnaireCompleted) {
      let isPartnerTrialExpiredRecently = false;
      let isPartnerWithActiveSub = false;

      if (appUser.role === UserRole.PARTNER) {
        isPartnerWithActiveSub = appUser.stripeSubscriptionActive || false;
        if (appUser.createdAt && appUser.trialExpiredNotified === true && !isPartnerWithActiveSub) {
            const createdAtDate = appUser.createdAt.toDate();
            const trialEndDate = new Date(createdAtDate.getTime() + 15 * 24 * 60 * 60 * 1000);
            const now = new Date();
            if (now > trialEndDate) {
                 isPartnerTrialExpiredRecently = true;
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
    if (loading || !appUser || !appUser.uid || !appUser.questionnaireCompleted || appUser.role !== UserRole.USER || !setAppUser) {
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

          const userCity = appUser.address?.city?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const userState = appUser.address?.state?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const partnerCity = partnerData.address?.city?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const partnerState = partnerData.address?.state?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

      if (potentialNewNotifications.length > 0 && appUser.uid && setAppUser) {
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
                        .slice(0, 20);

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
  }, [appUser, loading, setAppUser]);


  useEffect(() => {
    if (loading || !appUser || !appUser.uid || !appUser.favoriteVenueIds || appUser.favoriteVenueIds.length === 0 || appUser.role !== UserRole.USER || !setAppUser) {
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
      const notificationsEnabledForVenue = currentSettings[venueId] ?? true;

      if (notificationsEnabledForVenue && !activeEventNotificationListeners[venueId]) {
        const venueDocRef = doc(firestore, "users", venueId);
        const venueDocSnap = await getDoc(venueDocRef);
        const venueName = venueDocSnap.exists() ? venueDocSnap.data().venueName : "Local Desconhecido";

        const eventsRef = collection(firestore, `users/${venueId}/events`);
        const qEvents = query(eventsRef, where('visibility', '==', true), orderBy('updatedAt', 'desc'));

        const unsubscribe = onSnapshot(qEvents, async (snapshot) => {
          const userDocRefToUpdate = doc(firestore, "users", appUser.uid!);
          const notificationsToAddThisCycle: Notification[] = [];

          const currentAppUserDocSnap = await getDoc(userDocRefToUpdate);
          const currentAppUserLastCheck = currentAppUserDocSnap.data()?.lastNotificationCheckTimestamp?.toMillis() || 0;


          snapshot.docChanges().forEach((change) => {
            const eventData = change.doc.data();
            const eventId = change.doc.id;
            const eventCreatedAt = eventData.createdAt as FirebaseTimestamp;
            const eventUpdatedAt = eventData.updatedAt as FirebaseTimestamp;
            const eventEndDateTime = eventData.endDateTime as FirebaseTimestamp;

            if (eventEndDateTime && eventEndDateTime.toDate() < new Date()) {
              return;
            }

            const relevantTimestamp = eventUpdatedAt || eventCreatedAt;

            if (relevantTimestamp && relevantTimestamp.toMillis() > currentAppUserLastCheck) {
                let message = "";
                let notificationIdSuffix = "";

                if (change.type === "added") {
                    message = `Novo evento em ${venueName}: ${eventData.eventName}!`;
                    notificationIdSuffix = `new_${relevantTimestamp.toMillis()}`;
                } else if (change.type === "modified") {
                    if (eventCreatedAt && eventCreatedAt.toMillis() <= currentAppUserLastCheck) {
                        message = `Evento atualizado em ${venueName}: ${eventData.eventName}. Confira as novidades!`;
                        notificationIdSuffix = `update_${relevantTimestamp.toMillis()}`;
                    } else {
                        return;
                    }
                } else {
                    return;
                }

                if (message) {
                     notificationsToAddThisCycle.push({
                        id: `event_${venueId}_${eventId}_${notificationIdSuffix}`,
                        partnerId: venueId,
                        eventId: eventId,
                        venueName: venueName,
                        eventName: eventData.eventName,
                        message: message,
                        createdAt: relevantTimestamp,
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

                    const notificationsActuallyToAdd = notificationsToAddThisCycle.filter(newNotif =>
                        !freshExistingUserNotifications.some((exNotif: Notification) => exNotif.id === newNotif.id)
                    );

                    if (notificationsActuallyToAdd.length > 0) {
                        const allNotifications = [...freshExistingUserNotifications, ...notificationsActuallyToAdd]
                          .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
                          .slice(0, 20);

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
        activeEventNotificationListeners[venueId]();
        delete activeEventNotificationListeners[venueId];
      }
    });

    Object.keys(activeEventNotificationListeners).forEach(venueId => {
      if (!currentFavorites.includes(venueId)) {
        if (activeEventNotificationListeners[venueId]) {
             activeEventNotificationListeners[venueId]();
             delete activeEventNotificationListeners[venueId];
        }
      }
    });
  }, [appUser?.favoriteVenueIds, appUser?.favoriteVenueNotificationSettings, loading, appUser?.uid, appUser?.role, setAppUser]);


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
        const currentNotificationsCopy = JSON.parse(JSON.stringify(appUser.notifications));
        const updatedNotifications = currentNotificationsCopy.map((n: Notification) => ({ ...n, read: true }));

        try {
            await updateDoc(userDocRef, {
                notifications: updatedNotifications,
            });
        } catch (error) {
            console.error("Error updating notifications as read in Firestore:", error);
            toast({ title: "Erro ao Marcar Notificações", description: "Não foi possível marcar notificações como lidas no servidor.", variant: "destructive" });
        }
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
        toast({ title: "Notificação Removida", description: "A notificação foi removida permanentemente.", variant: "default", duration: 3000 });
    } catch (error: any) {
        console.error("Error dismissing notification from Firestore:", error);
        toast({ title: "Erro ao Remover", description: error.message || "Não foi possível remover a notificação do sistema.", variant: "destructive" });
    }
  };


  const handleLogout = async () => {
    try {
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

  const handleFloatingChatIconClick = () => {
    if (!appUser) return;

    if (!appUser.address?.city || !appUser.address?.state) {
      toast({
        title: "Complete seu Perfil",
        description: "Por favor, adicione sua cidade e estado no seu perfil para usar o Fervo Chat regional.",
        duration: 5000,
        action: <Button onClick={() => router.push('/user/profile')}>Ir para Perfil</Button>
      });
      return;
    }

    const checkedInEventsArray = appUser.checkedInEvents ? Object.values(appUser.checkedInEvents) : [];
    const activeCheckIn = checkedInEventsArray.find(event =>
        event.checkedInAt && // Ensure checkedInAt exists
        // Add logic to determine if event is currently active if needed, e.g., compare with event.endDateTime
        true // For now, any check-in makes it "active" for chat purposes
    );


    if (activeCheckIn) {
        setChatRoomId(activeCheckIn.eventId);
        setChatEventName(activeCheckIn.eventName);
        setIsChatWidgetOpen(true);
    } else {
        toast({
            title: "Fervo Chat nos Eventos!",
            description: "O chat agora é específico para cada evento. Para participar, primeiro faça check-in no evento desejado através do mapa.",
            duration: 7000
        });
    }
  };

  const handleClearEventChat = async () => {
    if (!appUser || !chatRoomId) {
      toast({ title: "Erro", description: "Não foi possível identificar o chat ou o evento.", variant: "destructive" });
      return;
    }
    setEventChatClearedTimestamp(Date.now());
    toast({ title: "Chat Limpo!", description: "Sua visualização das mensagens do chat foi limpa.", variant: "default"});
    setShowClearEventChatDialog(false); // Close dialog after setting timestamp
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  let renderChildrenContent = false;
  if (!loading) {
    const isAuthPg = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
    const isSharedEvtPg = pathname.startsWith('/shared-event');
    const isGeneralUserAccPg = ['/user/profile', '/user/coins', '/user/favorites', '/user/coupons', '/user/help', '/privacy-policy'].includes(pathname);


    if (isAuthPg || isSharedEvtPg || isGeneralUserAccPg) {
      renderChildrenContent = true;
    } else if (appUser) {
      if (appUser.questionnaireCompleted) {
        renderChildrenContent = true;
      } else {
        renderChildrenContent = false;
      }
    } else {
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
                    <DropdownMenuItem onClick={() => router.push('/privacy-policy')}>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Política de Privacidade
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
          <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-background text-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
             <p className="ml-2">Carregando...</p>
          </div>
        )}
      </main>

      {/* Floating Chat Button - Now managed globally by Layout */}
      {appUser && appUser.questionnaireCompleted && appUser.role === UserRole.USER && (
        <div className="fixed bottom-6 right-6 z-40">
            <Button
                onClick={handleFloatingChatIconClick}
                className={cn(
                    "rounded-full h-14 w-14 p-0 shadow-lg flex items-center justify-center",
                    "bg-gradient-to-br from-primary to-accent hover:from-primary/80 hover:to-accent/80",
                    "animate-bounce hover:animate-none"
                )}
                aria-label="Abrir Fervo Chat do Evento"
                title="Abrir Fervo Chat do Evento"
            >
                <MessageSquare className="h-7 w-7 text-primary-foreground" />
            </Button>
        </div>
      )}

      {/* Global Event Chat Widget - Rendered by Layout */}
        {isChatWidgetOpen && appUser && appUser.uid && chatRoomId && chatEventName && appUser.address?.city && appUser.address?.state && (
            <Card className={cn(
                "fixed bottom-4 right-4 z-[60] w-[90vw] max-w-sm h-auto max-h-[70vh] flex flex-col border-primary/50 bg-background/90 backdrop-blur-sm shadow-2xl rounded-lg",
                "transition-all duration-300 ease-in-out",
                isChatWidgetOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full"
            )}>
                <CardHeader className="p-3 sm:p-4 border-b border-border flex-row items-center justify-between sticky top-0 bg-background/95 z-10">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <div>
                            <WidgetCardTitle className="text-md sm:text-lg text-primary leading-tight truncate max-w-[150px] sm:max-w-[200px] font-semibold">Chat: {chatEventName}</WidgetCardTitle>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <AlertDialog open={showClearEventChatDialog} onOpenChange={setShowClearEventChatDialog}>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive" title="Limpar mensagens deste chat (apenas visualização)">
                                    <Trash2 className="h-4 w-4 sm:h-5 sm:h-5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                  <RadixAlertDialogTitle>Limpar Visualização do Chat</RadixAlertDialogTitle>
                                </AlertDialogHeader>
                                <AlertDialogDescription>
                                    Tem certeza que deseja limpar as mensagens desta visualização? As mensagens não serão excluídas permanentemente.
                                </AlertDialogDescription>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearEventChat}>
                                        Limpar Minha Visualização
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" onClick={() => setIsChatSoundMuted(prev => !prev)} className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary" title={isChatSoundMuted ? "Ativar som do chat" : "Silenciar som do chat"}>
                            {isChatSoundMuted ? <LogOut className="h-4 w-4 sm:h-5 sm:h-5" /> : <Sun className="h-4 w-4 sm:h-5 sm:h-5" />} {/* Placeholder icons, replace with VolumeX/Volume2 */}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsChatWidgetOpen(false)} className="h-7 w-7 sm:h-8 sm:h-8 text-muted-foreground hover:text-destructive" title="Fechar chat">
                            <X className="h-4 w-4 sm:h-5 sm:h-5"/>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 bg-background/30">
                    <ChatMessageList
                        chatRoomId={chatRoomId}
                        currentUserId={appUser.uid}
                        isChatSoundMuted={isChatSoundMuted}
                        chatClearedTimestamp={eventChatClearedTimestamp}
                    />
                </CardContent>
                <div className="p-3 sm:p-4 border-t border-border bg-card">
                    <ChatInputForm
                        chatRoomId={chatRoomId}
                        userId={appUser.uid}
                        userName={appUser.name}
                        userPhotoURL={appUser.photoURL}
                    />
                </div>
            </Card>
        )}

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
