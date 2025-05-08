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
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState, useMemo } from 'react'; // Added useMemo
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

interface AppUser {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole | null;
  preferredVenueTypes?: VenueType[];
  preferredMusicStyles?: MusicStyle[];
  questionnaireCompleted?: boolean;
  lastNotificationCheckTimestamp?: FirebaseTimestamp;
  venueCoins?: UserVenueCoins; // Replaced fervoCoins with venueCoins map
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
              venueCoins: userData.venueCoins || {}, // Initialize as empty map if not present
            });
          } else {
            // Handle case where user exists in Auth but not Firestore (e.g., first Google Sign-In)
            const defaultRoleBasedOnInitialAuthAttempt = pathname.includes('/partner') ? UserRole.PARTNER : UserRole.USER;
            setAppUser({
              uid: user.uid,
              name: user.displayName || (defaultRoleBasedOnInitialAuthAttempt === UserRole.USER ? "Usuário Fervo" : "Parceiro Fervo"),
              email: user.email,
              role: defaultRoleBasedOnInitialAuthAttempt,
              venueCoins: {},
              questionnaireCompleted: false,
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
        // Ensure Firestore listener is cleaned up if user logs out
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = undefined;
        }
      }
    });

    // Cleanup function
    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, [pathname, toast]); // Dependencies for the effect

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
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

   // Calculate total coins
  const totalFervoCoins = useMemo(() => {
    if (!appUser || !appUser.venueCoins) return 0;
    return Object.values(appUser.venueCoins).reduce((sum, count) => sum + count, 0);
  }, [appUser]);


  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname.startsWith('/questionnaire') || pathname.startsWith('/partner-questionnaire');
      const isSharedEventPage = pathname.startsWith('/shared-event');

      if (!appUser && !isAuthPage && !isSharedEventPage) {
        router.push('/login');
      } else if (appUser && !appUser.questionnaireCompleted) {
        if (appUser.role === UserRole.USER && pathname !== '/questionnaire' && !isSharedEventPage) {
          router.push('/questionnaire');
        } else if (appUser.role === UserRole.PARTNER && pathname !== '/partner-questionnaire' && !isSharedEventPage) {
          router.push('/partner-questionnaire');
        }
      }
    }
  }, [appUser, loading, router, pathname]);


  useEffect(() => {
    if (loading || !appUser || !appUser.uid || !appUser.questionnaireCompleted || appUser.role !== UserRole.USER) {
      setHasNewNotifications(false);
      return;
    }

    const userLastCheck = appUser.lastNotificationCheckTimestamp?.toDate() || new Date(0);

    const partnersRef = collection(firestore, 'users');
    const q = query(partnersRef,
      where('role', '==', UserRole.PARTNER),
      where('questionnaireCompleted', '==', true)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let foundNew = false;
      for (const partnerDoc of querySnapshot.docs) {
        const partnerData = partnerDoc.data();
        const partnerProfileCompletedAt = (partnerData.questionnaireCompletedAt as FirebaseTimestamp)?.toDate();

        if (!partnerProfileCompletedAt) continue;

        if (partnerProfileCompletedAt > userLastCheck) {
          const typeMatch = appUser.preferredVenueTypes?.includes(partnerData.venueType as VenueType);
          const styleMatch = Array.isArray(partnerData.musicStyles) && partnerData.musicStyles.some((style: MusicStyle) => appUser.preferredMusicStyles?.includes(style));

          if (typeMatch || styleMatch) {
            foundNew = true;
            break;
          }
        }
      }
      setHasNewNotifications(foundNew);
    }, (error) => {
      console.error("Error listening for new partner notifications:", error);
      setHasNewNotifications(false);
    });

    return () => unsubscribe();
  }, [appUser, loading]);


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

    setIsFetchingNotifications(true);

    try {
      const partnersRef = collection(firestore, 'users');
      const q = query(partnersRef,
        where('role', '==', UserRole.PARTNER),
        where('questionnaireCompleted', '==', true),
      );
      const querySnapshot = await getDocs(q);
      const allVenues: Array<{ id: string, venueName: string, venueType: VenueType, musicStyles: MusicStyle[] }> = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if(data.venueName && data.venueType) {
            allVenues.push({
                id: doc.id,
                venueName: data.venueName,
                venueType: data.venueType as VenueType,
                musicStyles: (data.musicStyles || []) as MusicStyle[],
            });
        }
      });

      if (allVenues.length === 0) {
        toast({ title: "Nenhum Fervo Encontrado", description: "Ainda não há locais parceiros cadastrados." });
      } else {
          const matchingVenues = allVenues.filter(venue => {
            const typeMatch = userPrefs.venueTypes.includes(venue.venueType);
            const styleMatch = Array.isArray(venue.musicStyles) && venue.musicStyles.some(style => userPrefs.musicStyles.includes(style));
            return typeMatch || styleMatch;
          });

          if (matchingVenues.length > 0) {
            const venueNames = matchingVenues.slice(0, 2).map(v => v.venueName).join(', ');
            const andMore = matchingVenues.length > 2 ? ` e mais ${matchingVenues.length - 2}!` : '.';
            toast({
              title: "Novos Fervos que Combinam com Você!",
              description: `Encontramos: ${venueNames}${andMore} Explore no mapa!`,
              duration: 7000,
            });
          } else {
            toast({ title: "Nada de Novo por Enquanto", description: "Nenhum Fervo encontrado que corresponda às suas preferências atuais. Explore o mapa para descobrir mais!", duration: 7000 });
          }
      }

      const userDocRef = doc(firestore, "users", appUser.uid);
      await updateDoc(userDocRef, {
        lastNotificationCheckTimestamp: serverTimestamp()
      });

    } catch (error) {
      console.error("Error fetching notifications data or updating timestamp:", error);
      toast({ title: "Erro ao Buscar Sugestões", description: "Não foi possível verificar novos Fervos.", variant: "destructive" });
    } finally {
      setIsFetchingNotifications(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const allowedUnauthenticatedPaths = ['/login', '/questionnaire', '/partner-questionnaire', '/shared-event'];
  const canRenderChildren = appUser || allowedUnauthenticatedPaths.some(p => pathname.startsWith(p));

  const activeColorClass = appUser?.role === UserRole.PARTNER ? 'text-destructive' : 'text-primary';
  const activeBorderColorClass = appUser?.role === UserRole.PARTNER ? 'border-destructive' : 'border-primary';


  return (
    <div className="flex flex-col min-h-screen">
      {appUser && (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex items-center h-16 max-w-screen-2xl">
            <Logo iconClassName={activeColorClass} />
            <nav className="flex items-center gap-1 ml-auto sm:gap-2 md:gap-4"> {/* Reduced gap slightly */}
              {appUser?.role === UserRole.USER && (
                <>
                  <Link href="/map" passHref>
                    <Button variant={pathname === '/map' ? 'secondary': 'ghost'} className={cn(pathname === '/map' ? activeColorClass : '', 'hover:bg-primary/10')}>
                      <Map className="w-4 h-4 mr-0 md:mr-2" /> <span className="hidden md:inline">Mapa de Eventos</span>
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(activeColorClass, 'hover:bg-primary/10')}
                    onClick={() => setIsQrScannerOpen(true)}
                    title="Check-in com QR Code"
                    disabled={isFetchingNotifications}
                  >
                    <ScanLine className="w-5 h-5" />
                    <span className="sr-only">Check-in QR Code</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(activeColorClass, hasNewNotifications && 'animate-pulse', 'hover:bg-primary/10')}
                    onClick={handleNotificationsClick}
                    disabled={isFetchingNotifications}
                    title="Verificar novos Fervos"
                  >
                    {isFetchingNotifications ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
                    <span className="sr-only">Notificações</span>
                  </Button>
                   {/* Coins Button */}
                   <div className="relative">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(activeColorClass, 'hover:bg-primary/10')} 
                        onClick={() => toast({ title: "Suas FervoCoins!", description: `Você tem ${totalFervoCoins} moedas no total. Ganhe mais compartilhando eventos e troque por cupons em locais específicos!`, variant: "default", duration: 5000})}
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
                    <Button variant="ghost" size="icon" className={cn(activeColorClass, 'hover:bg-primary/10')} title="Meus Cupons">
                        <TicketPercent className="w-5 h-5" />
                        <span className="sr-only">Cupons de Desconto</span>
                    </Button>
                  </Link>
                </>
              )}
              {appUser?.role === UserRole.PARTNER && (
                <Link href="/partner/dashboard" passHref>
                  <Button variant={pathname === '/partner/dashboard' ? 'secondary' : 'ghost'} className={cn(pathname === '/partner/dashboard' ? activeColorClass : '', 'hover:bg-destructive/10')}>
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
                    <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                      <UserCircle className="w-4 h-4 mr-2" />
                      Meu Perfil
                    </DropdownMenuItem>
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