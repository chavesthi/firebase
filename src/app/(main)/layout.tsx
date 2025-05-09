
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
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2, Moon, Sun, Trash2, Heart } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState, useMemo } from 'react'; 
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, updateDoc, serverTimestamp, type Timestamp as FirebaseTimestamp, onSnapshot, getDocs } from 'firebase/firestore';
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
  id: string; // Using partnerId as notification ID for simplicity
  partnerId: string;
  venueName: string;
  message: string;
  createdAt: FirebaseTimestamp;
  read: boolean;
  venueType?: VenueType;
  musicStyles?: MusicStyle[];
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
  favoriteVenueIds?: string[]; // Added for favorite venues
}

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
              favoriteVenueIds: userData.favoriteVenueIds || [], // Populate favoriteVenueIds
            });
          } else {
            const defaultRoleBasedOnInitialAuthAttempt = pathname.includes('/partner') ? UserRole.PARTNER : UserRole.USER;
            setAppUser({
              uid: user.uid,
              name: user.displayName || (defaultRoleBasedOnInitialAuthAttempt === UserRole.USER ? "Usuário Fervo" : "Parceiro Fervo"),
              email: user.email,
              role: defaultRoleBasedOnInitialAuthAttempt,
              venueCoins: {},
              questionnaireCompleted: false,
              notifications: [],
              favoriteVenueIds: [], // Initialize favoriteVenueIds
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
    };
  }, [pathname, toast]); 

  return { firebaseUser, appUser, loading };
};


export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { appUser, loading } = useAuthAndUserSubscription();
  const { theme, setTheme } = useTheme();

  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isFetchingNotifications, setIsFetchingNotifications] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [isFetchingCoinDetails, setIsFetchingCoinDetails] = useState(false);


  const totalFervoCoins = useMemo(() => {
    if (!appUser || !appUser.venueCoins) return 0;
    return Object.values(appUser.venueCoins).reduce((sum, count) => sum + count, 0);
  }, [appUser]);

  const unreadNotificationsCount = useMemo(() => {
    if (!appUser || !appUser.notifications) return 0;
    return appUser.notifications.filter(n => !n.read).length;
  }, [appUser]);


  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
      const isSharedEventPage = pathname.startsWith('/shared-event');

      if (!appUser && !isAuthPage && !isSharedEventPage) {
        router.push('/login');
      } else if (appUser && !appUser.questionnaireCompleted) {
        if (appUser.role === UserRole.USER && pathname !== '/questionnaire' && !isSharedEventPage && pathname !== '/user/favorites') { // Allow favorites page
          router.push('/questionnaire');
        } else if (appUser.role === UserRole.PARTNER && pathname !== '/partner-questionnaire' && !isSharedEventPage) {
          router.push('/partner-questionnaire');
        }
      }
    }
  }, [appUser, loading, router, pathname]);


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
      const newNotifications: Notification[] = [];
      const existingNotifications = appUser.notifications || [];
      const userLastCheck = appUser.lastNotificationCheckTimestamp?.toDate() || new Date(0);

      for (const partnerDoc of querySnapshot.docs) {
        const partnerData = partnerDoc.data();
        const partnerId = partnerDoc.id;
        const partnerProfileCompletedAt = (partnerData.questionnaireCompletedAt as FirebaseTimestamp)?.toDate();

        if (!partnerProfileCompletedAt) continue;

        // Check if this partner is "new" since last check OR if it's a new partner not yet in user's notifications
        const isTrulyNewPartner = partnerProfileCompletedAt > userLastCheck;
        const alreadyNotified = existingNotifications.some(n => n.partnerId === partnerId);

        if (isTrulyNewPartner && !alreadyNotified) {
          const typeMatch = appUser.preferredVenueTypes?.includes(partnerData.venueType as VenueType);
          const styleMatch = Array.isArray(partnerData.musicStyles) && partnerData.musicStyles.some((style: MusicStyle) => appUser.preferredMusicStyles?.includes(style));

          if (typeMatch || styleMatch) {
            newNotifications.push({
              id: partnerId, // Use partnerId as a unique ID for this notification
              partnerId: partnerId,
              venueName: partnerData.venueName,
              message: `Novo Fervo que combina com você: ${partnerData.venueName}!`,
              createdAt: partnerData.questionnaireCompletedAt as FirebaseTimestamp, // Use partner completion time
              read: false,
              venueType: partnerData.venueType as VenueType,
              musicStyles: (partnerData.musicStyles || []) as MusicStyle[],
            });
          }
        }
      }

      if (newNotifications.length > 0 && appUser.uid) {
        const userDocRef = doc(firestore, "users", appUser.uid);
        // Add new notifications to existing ones, avoiding duplicates by partnerId
        const updatedNotifications = [...existingNotifications];
        newNotifications.forEach(newNotif => {
            if (!updatedNotifications.some(exNotif => exNotif.partnerId === newNotif.partnerId)) {
                updatedNotifications.push(newNotif);
            }
        });
        
        // Sort by createdAt descending before storing
        updatedNotifications.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

        await updateDoc(userDocRef, {
          notifications: updatedNotifications.slice(0, 20) // Keep only latest 20 notifications
        });
      }
    }, (error) => {
      console.error("Error listening for new partner notifications:", error);
    });

    return () => unsubscribe();
  }, [appUser, loading]);


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
    
    setShowNotificationDropdown(prev => !prev); // Toggle dropdown visibility

    if (unreadNotificationsCount > 0) {
        // Mark all as read (optimistic UI update could be done here if appUser state was local)
        const userDocRef = doc(firestore, "users", appUser.uid);
        const currentNotifications = appUser.notifications || [];
        const updatedNotifications = currentNotifications.map(n => ({ ...n, read: true }));
        await updateDoc(userDocRef, {
            notifications: updatedNotifications,
            lastNotificationCheckTimestamp: serverTimestamp() 
        });
    } else if (appUser.notifications && appUser.notifications.length === 0){
         toast({ title: "Nenhuma Notificação", description: "Você não tem novas notificações. Continue explorando!", duration: 5000 });
    }
  };

 const dismissNotification = async (notificationId: string) => {
    if (!appUser || !appUser.uid) return;
    const userDocRef = doc(firestore, "users", appUser.uid);
    const updatedNotifications = (appUser.notifications || []).filter(n => n.id !== notificationId);
    try {
        await updateDoc(userDocRef, { notifications: updatedNotifications });
        toast({ title: "Notificação Removida", variant:"default" });
    } catch (error) {
        console.error("Error dismissing notification:", error);
        toast({ title: "Erro ao Remover", description:"Não foi possível remover a notificação.", variant: "destructive" });
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

    const venueCoinsEntries = Object.entries(appUser.venueCoins).filter(([, count]) => count > 0);

    if (venueCoinsEntries.length === 0) {
      toast({ title: "Minhas FervoCoins", description: "Você ainda não tem FervoCoins em nenhum local. Compartilhe eventos para ganhar!", variant: "default", duration: 5000 });
      return;
    }
    
    setIsFetchingCoinDetails(true);
    toast({ title: "Minhas FervoCoins", description: "Carregando detalhes...", variant: "default", duration: 2000 });

    try {
      const coinDetailsPromises = venueCoinsEntries.map(async ([partnerId, coinCount]) => {
        const partnerDocRef = doc(firestore, "users", partnerId);
        const partnerDocSnap = await getDoc(partnerDocRef);
        if (partnerDocSnap.exists()) {
          return { venueName: partnerDocSnap.data().venueName || 'Local Desconhecido', coinCount };
        }
        return { venueName: 'Local Desconhecido', coinCount };
      });

      const resolvedCoinDetails = await Promise.all(coinDetailsPromises);
      
      let description = `Você tem um total de ${totalFervoCoins} FervoCoins!\n\nDetalhes por local:\n`;
      if (resolvedCoinDetails.length > 0) {
        description += resolvedCoinDetails.map(detail => `- ${detail.venueName}: ${detail.coinCount} moeda(s)`).join('\n');
      } else {
        description = "Você ainda não acumulou FervoCoins em locais específicos. Compartilhe eventos para começar!";
      }
      description += "\n\nGanhe mais compartilhando eventos e troque por cupons!";


      toast({
        title: "Suas FervoCoins!",
        description: description,
        variant: "default",
        duration: 10000, // Increased duration to allow reading
      });

    } catch (error) {
      console.error("Error fetching coin details:", error);
      toast({ title: "Erro ao Carregar Moedas", description: "Não foi possível buscar os detalhes das suas FervoCoins.", variant: "destructive" });
    } finally {
      setIsFetchingCoinDetails(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const allowedUnauthenticatedPaths = ['/login', '/questionnaire', '/partner-questionnaire', '/shared-event', '/user/favorites']; // Added /user/favorites
  const canRenderChildren = appUser || allowedUnauthenticatedPaths.some(p => pathname.startsWith(p));

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
                    disabled={isFetchingNotifications || isFetchingCoinDetails}
                  >
                    <ScanLine className="w-5 h-5" />
                    <span className="sr-only">Check-in QR Code</span>
                  </Button>
                  <DropdownMenu open={showNotificationDropdown} onOpenChange={setShowNotificationDropdown}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(activeColorClass, unreadNotificationsCount > 0 && 'animate-pulse', hoverBgClass)}
                            onClick={handleNotificationsClick}
                            disabled={isFetchingNotifications || isFetchingCoinDetails}
                            title="Notificações"
                        >
                            {isFetchingNotifications ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
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
                                <DropdownMenuItem key={notification.id} className={cn("flex justify-between items-start whitespace-normal", !notification.read && "bg-primary/10")}>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{notification.venueName}</p>
                                        <p className="text-xs text-muted-foreground">{notification.message}</p>
                                        <p className="text-xs text-muted-foreground/70 pt-1">
                                            {new Date(notification.createdAt.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="ml-2 h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); dismissNotification(notification.id);}}>
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
                        disabled={isFetchingCoinDetails || isFetchingNotifications}
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
                    <Button variant="ghost" size="icon" className={cn(activeColorClass, hoverBgClass)} title="Meus Cupons"  disabled={isFetchingNotifications || isFetchingCoinDetails}>
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
        {canRenderChildren ? children : null }
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

