
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
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2, Moon, Sun, Trash2, Heart, HeartOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, updateDoc, serverTimestamp, type Timestamp as FirebaseTimestamp, onSnapshot, getDocs, Timestamp, orderBy, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import QrScannerModal from '@/components/checkin/qr-scanner-modal';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/theme-provider';

// Data structure for venue-specific coins on user document
interface UserVenueCoins {
    [partnerId: string]: number;
}

interface Notification {
  id: string;
  partnerId?: string; // Optional: if it's a venue-specific notification
  eventId?: string; // Optional: if it's an event-specific notification
  venueName?: string;
  eventName?: string;
  message: string;
  createdAt: FirebaseTimestamp; // Timestamp of the event or notification creation
  read: boolean;
  venueType?: VenueType;
  musicStyles?: MusicStyle[];
}

interface FavoriteVenueNotificationSettings {
  [venueId: string]: boolean; // true if notifications are enabled, false or undefined if disabled
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
  venueName?: string; // For partner role, to show in greeting
  address?: {
    city?: string;
    state?: string;
  };
  createdAt?: FirebaseTimestamp; // For partner trial period
  trialExpiredNotified?: boolean; // For partner trial period
}

// Keep track of active listeners to avoid duplicates and for cleanup
const activeEventNotificationListeners: Record<string, () => void> = {};

const useAuthAndUserSubscription = () => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setAppUser({
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
            });
          } else {
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
            });
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching user document with onSnapshot:", error);
          setAppUser(null);
          setLoading(false);
          toast({ title: "Erro ao carregar dados", description: "Não foi possível sincronizar os dados do usuário.", variant: "destructive" });
        });
      } else {
        setAppUser(null);
        setLoading(false);
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = undefined;
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
       Object.values(activeEventNotificationListeners).forEach(unsub => unsub());
       for (const key in activeEventNotificationListeners) {
           delete activeEventNotificationListeners[key];
       }
    };
  }, [pathname, toast]);

  return { firebaseUser, appUser, setAppUser, loading };
};


export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appUser, setAppUser, loading } = useAuthAndUserSubscription();
  const { theme, setTheme } = useTheme();

  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [isFetchingCoinDetails, setIsFetchingCoinDetails] = useState(false);

  const prevAppUserRef = useRef<AppUser | null>(null);


  const totalFervoCoins = useMemo(() => {
    if (!appUser || !appUser.venueCoins) return 0;
    return Object.values(appUser.venueCoins).reduce((sum, count) => sum + count, 0);
  }, [appUser]);

  const unreadNotificationsCount = useMemo(() => {
    if (!appUser || !appUser.notifications) return 0;
    return appUser.notifications.filter(n => !n.read).length;
  }, [appUser]);


  useEffect(() => {
    if (loading) {
      return;
    }

    const isAuthPage = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
    const isSharedEventPage = pathname.startsWith('/shared-event');
    const isGeneralUserAccessiblePage = pathname.startsWith('/user/profile') || pathname.startsWith('/user/coins') || pathname.startsWith('/user/favorites') || pathname.startsWith('/user/coupons');

    if (!appUser) {
      if (!isAuthPage && !isSharedEventPage && !isGeneralUserAccessiblePage) {
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
        if (!appUser.questionnaireCompleted && !isSharedEventPage && !isGeneralUserAccessiblePage) {
          const questionnairePath = appUser.role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire';
          router.push(questionnairePath);
        }
      }
    }
  }, [appUser, loading, router, pathname]);

  useEffect(() => {
    if (!loading && prevAppUserRef.current === null && appUser !== null && appUser.questionnaireCompleted) {
      // Skip greeting toast if trial expiration toast was (or will be) shown
      let trialExpiredRecently = false;
      if (appUser.role === UserRole.PARTNER && appUser.createdAt && appUser.trialExpiredNotified === true) {
        const createdAtDate = appUser.createdAt.toDate();
        const trialEndDate = new Date(createdAtDate.getTime() + 15 * 24 * 60 * 60 * 1000);
        const now = new Date();
        // Check if trial expired recently (e.g., within the last few logins, or if notification was just set)
        // This logic might need refinement if trialExpiredNotified is set async and might not be fresh in appUser here
        if (now > trialEndDate) {
            // Check if this is the first login *after* trialExpiredNotified became true
            // This is tricky; for now, if trialExpiredNotified is true and trial is past, assume it was just shown.
            // A more robust way would be to pass a flag from login form or use a temporary state.
            // For simplicity, if trialExpiredNotified is true for a partner, we assume the trial toast handled it.
            // This might mean the welcome toast sometimes doesn't show when it could.
             trialExpiredRecently = true;
        }
      }

      if (appUser.role === UserRole.PARTNER && trialExpiredRecently) {
        // Do nothing, trial toast was handled by login form
      } else {
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

        let greetingTitle = "";
        let greetingDescription = "";

        if (appUser.role === UserRole.USER) {
            greetingTitle = `${greetingPrefix}, ${appUser.name}!`;
            greetingDescription = "Onde vamos hoje?";
        } else if (appUser.role === UserRole.PARTNER) {
            greetingTitle = `${greetingPrefix}, ${appUser.venueName || appUser.name}!`;
            greetingDescription = "Qual Evento Vai Rolar Hoje?";
        }

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

          const userCity = appUser.address?.city;
          const userState = appUser.address?.state;
          const partnerCity = partnerData.address?.city;
          const partnerState = partnerData.address?.state;

          const locationMatch = userCity && userState && partnerCity && partnerState &&
                                userCity.toLowerCase() === partnerCity.toLowerCase() &&
                                userState.toLowerCase() === partnerState.toLowerCase();

          if ((typeMatch || styleMatch) && locationMatch) {
            potentialNewNotifications.push({
              id: `partner_${partnerId}_${partnerProfileCompletedAt.getTime()}`,
              partnerId: partnerId,
              venueName: partnerData.venueName,
              message: `Novo Fervo em ${partnerData.address?.city || 'sua região'} que combina com você: ${partnerData.venueName}!`,
              createdAt: partnerData.questionnaireCompletedAt as FirebaseTimestamp,
              read: false,
              venueType: partnerData.venueType as VenueType,
              musicStyles: (partnerData.musicStyles || []) as MusicStyle[],
            });
          }
        }
      }

      if (potentialNewNotifications.length > 0 && appUser.uid) {
        const userDocRef = doc(firestore, "users", appUser.uid);
        const currentUserDocSnap = await getDoc(userDocRef);
        const freshExistingNotificationsFromDB: Notification[] = currentUserDocSnap.data()?.notifications || [];

        const notificationsActuallyToAdd = potentialNewNotifications.filter(newNotif =>
            !freshExistingNotificationsFromDB.some((exNotif: Notification) => exNotif.id === newNotif.id)
        );

        if (notificationsActuallyToAdd.length > 0) {
            const finalNotifications = [...freshExistingNotificationsFromDB, ...notificationsActuallyToAdd]
                .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
                .slice(0, 20);

            let maxCreatedAt: FirebaseTimestamp | undefined = appUser.lastNotificationCheckTimestamp;
            notificationsActuallyToAdd.forEach(n => {
                if (!maxCreatedAt || n.createdAt.toMillis() > maxCreatedAt.toMillis()) {
                    maxCreatedAt = n.createdAt;
                }
            });

            const updatePayload:any = { notifications: finalNotifications };
            if (maxCreatedAt && (!appUser.lastNotificationCheckTimestamp || maxCreatedAt.toMillis() > appUser.lastNotificationCheckTimestamp.toMillis())) {
                updatePayload.lastNotificationCheckTimestamp = maxCreatedAt;
            }
            await updateDoc(userDocRef, updatePayload);
        }
      }
    }, (error) => {
      console.error("Error listening for new partner notifications:", error);
    });

    return () => unsubscribe();
  }, [appUser?.uid, appUser?.questionnaireCompleted, appUser?.role, appUser?.preferredVenueTypes, appUser?.preferredMusicStyles, appUser?.address, appUser?.lastNotificationCheckTimestamp, loading]);


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

          snapshot.docChanges().forEach((change) => {
            const eventData = change.doc.data();
            const eventId = change.doc.id;
            const eventCreatedAt = eventData.createdAt as FirebaseTimestamp;
            const eventUpdatedAt = eventData.updatedAt as FirebaseTimestamp;
            const eventEndDateTime = eventData.endDateTime as FirebaseTimestamp;
            const lastUserCheck = appUser.lastNotificationCheckTimestamp?.toMillis() || 0;

            if (eventEndDateTime && eventEndDateTime.toDate() < new Date()) {
              return;
            }

            if (change.type === "added") {
              if (eventCreatedAt && eventCreatedAt.toMillis() > lastUserCheck) {
                notificationsToAddThisCycle.push({
                  id: `event_new_${venueId}_${eventId}_${eventCreatedAt.toMillis()}`,
                  partnerId: venueId,
                  eventId: eventId,
                  venueName: venueName,
                  eventName: eventData.eventName,
                  message: `Novo evento em ${venueName}: ${eventData.eventName}!`,
                  createdAt: eventCreatedAt,
                  read: false,
                });
              }
            } else if (change.type === "modified") {
              if (eventUpdatedAt && eventUpdatedAt.toMillis() > lastUserCheck) {
                notificationsToAddThisCycle.push({
                  id: `event_update_${venueId}_${eventId}_${eventUpdatedAt.toMillis()}`,
                  partnerId: venueId,
                  eventId: eventId,
                  venueName: venueName,
                  eventName: eventData.eventName,
                  message: `Evento atualizado em ${venueName}: ${eventData.eventName}. Confira as novidades!`,
                  createdAt: eventUpdatedAt,
                  read: false,
                });
              }
            }
          });

          if (notificationsToAddThisCycle.length > 0) {
            const currentUserDocSnap = await getDoc(userDocRefToUpdate);
            const freshExistingUserNotifications: Notification[] = currentUserDocSnap.data()?.notifications || [];

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
                if (maxCreatedAtOfNew && (!appUser.lastNotificationCheckTimestamp || maxCreatedAtOfNew.toMillis() > appUser.lastNotificationCheckTimestamp.toMillis())) {
                    updatePayload.lastNotificationCheckTimestamp = maxCreatedAtOfNew;
                }
                await updateDoc(userDocRefToUpdate, updatePayload);
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
  }, [appUser?.uid, appUser?.favoriteVenueIds, appUser?.favoriteVenueNotificationSettings, loading, appUser?.lastNotificationCheckTimestamp]);


  const handleNotificationsClick = async () => {
    if (!appUser || !appUser.uid) {
      toast({ title: "Login Necessário", description: "Faça login para ver notificações." });
      return;
    }

    if (!appUser.questionnaireCompleted) {
      toast({ title: "Complete seu Perfil", description: "Preencha suas preferências para receber sugestões de Fervos!", duration: 5000 });
      return;
    }

    const userPrefs = {
      venueTypes: appUser.preferredVenueTypes || [],
      musicStyles: appUser.preferredMusicStyles || [],
    };

    if (userPrefs.venueTypes.length === 0 && userPrefs.musicStyles.length === 0) {
       toast({ title: "Defina suas Preferências", description: "Adicione seus tipos de locais e estilos musicais favoritos no seu perfil para receber sugestões.", duration: 7000 });
       return;
    }

    setShowNotificationDropdown(prev => !prev);

    if (unreadNotificationsCount > 0 && appUser.notifications) {
        const userDocRef = doc(firestore, "users", appUser.uid);
        const currentNotifications = appUser.notifications;
        const updatedNotifications = currentNotifications.map(n => ({ ...n, read: true }));


        if (setAppUser) {
          setAppUser(prev => prev ? {...prev, notifications: updatedNotifications, lastNotificationCheckTimestamp: Timestamp.now()} : null);
        }

        await updateDoc(userDocRef, {
            notifications: updatedNotifications,
            lastNotificationCheckTimestamp: serverTimestamp()
        }).catch(error => {
            console.error("Error updating notifications in Firestore:", error);
            toast({ title: "Erro ao atualizar notificações", description: "Não foi possível marcar notificações como lidas no servidor.", variant: "destructive" });
        });
    } else if (appUser.notifications && appUser.notifications.length === 0){
         toast({ title: "Nenhuma Notificação", description: "Você não tem novas notificações. Continue explorando!", duration: 5000 });
    }
  };

 const dismissNotification = async (notificationId: string) => {
    if (!appUser || !appUser.uid) {
      toast({ title: "Erro", description: "Usuário não autenticado para remover notificação.", variant: "destructive"});
      return;
    }

    const originalNotifications = appUser.notifications ? [...appUser.notifications] : [];

    if (setAppUser && appUser.notifications) {
      const updatedLocalNotifications = appUser.notifications.filter(n => n.id !== notificationId);
      setAppUser(prev => prev ? {...prev, notifications: updatedLocalNotifications} : null);
    }

    try {
        const userDocRef = doc(firestore, "users", appUser.uid);

        await runTransaction(firestore, async (transaction) => {
            const userSnap = await transaction.get(userDocRef);
            if (!userSnap.exists()) {
                throw new Error("User document not found for dismissing notification.");
            }
            const currentDbNotifications: Notification[] = userSnap.data()?.notifications || [];
            const updatedDbNotifications = currentDbNotifications.filter((n) => n.id !== notificationId);
            transaction.update(userDocRef, { notifications: updatedDbNotifications });
        });

        toast({ title: "Notificação Removida", description: "A notificação foi removida permanentemente.", variant: "default" });

    } catch (error: any) {
        console.error("Error dismissing notification from Firestore:", error);
        if (setAppUser) {
            setAppUser(prev => prev ? {...prev, notifications: originalNotifications} : null);
        }
        toast({ title: "Erro ao Remover", description: error.message || "Não foi possível remover a notificação do sistema.", variant: "destructive" });
    }
  };


  const handleLogout = async () => {
    try {
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
    const isGeneralUserAccPg = pathname.startsWith('/user/profile') || pathname.startsWith('/user/coins') || pathname.startsWith('/user/favorites') || pathname.startsWith('/user/coupons');

    if (isAuthPg || isSharedEvtPg || isGeneralUserAccPg) {
      renderChildrenContent = true;
    } else if (appUser) {
      if (appUser.questionnaireCompleted) {
        renderChildrenContent = true;
      } else {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="ml-2">Redirecionando para questionário...</p>
          </div>
        );
      }
    } else {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="ml-2">Verificando autenticação...</p>
        </div>
      );
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
            <Logo iconClassName={activeColorClass} />
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
                    disabled={isFetchingCoinDetails}
                  >
                    <ScanLine className="w-5 h-5" />
                    <span className="sr-only">Check-in QR Code</span>
                  </Button>
                  <DropdownMenu open={showNotificationDropdown} onOpenChange={setShowNotificationDropdown}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(activeColorClass, unreadNotificationsCount > 0 && 'animate-pulse ring-2 ring-destructive ring-offset-2 ring-offset-background', hoverBgClass)}
                            onClick={handleNotificationsClick}
                            disabled={isFetchingCoinDetails}
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
                                    "flex justify-between items-start whitespace-normal",
                                    !notification.read && "bg-primary/10",
                                    (notification.partnerId || notification.eventId) && "cursor-pointer hover:bg-accent/10"
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
                        disabled={isFetchingCoinDetails}
                      >
                         {isFetchingCoinDetails ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
                        <span className="sr-only">Moedas</span>
                      </Button>
                      {totalFervoCoins > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground text-[10px] font-bold">
                          {totalFervoCoins > 9 ? '9+' : totalFervoCoins}
                          </span>
                      )}
                  </div>
                  <Link href="/user/coupons" passHref>
                    <Button variant="ghost" size="icon" className={cn(activeColorClass, hoverBgClass)} title="Meus Cupons"  disabled={isFetchingCoinDetails}>
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
                    {appUser?.name ? (
                      <span className={`text-lg font-semibold ${activeColorClass}`}>
                        {appUser.name.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <UserCircle className={`w-6 h-6 ${activeColorClass}`} />
                    )}
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
                    <DropdownMenuItem onClick={() => router.push('/partner-questionnaire')}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações do Local
                    </DropdownMenuItem>
                  )}
                  {appUser?.role === UserRole.PARTNER && (
                    <DropdownMenuItem onClick={() => router.push('/partner/settings')}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configurações da Conta
                    </DropdownMenuItem>
                  )}
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
        {renderChildrenContent ? children : null }
      </main>
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
