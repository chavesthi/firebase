
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
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole, type VenueType, type MusicStyle } from '@/lib/constants';
import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, type Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import QrScannerModal from '@/components/checkin/qr-scanner-modal';
import { cn } from '@/lib/utils';


interface AppUser {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole | null;
  preferredVenueTypes?: VenueType[];
  preferredMusicStyles?: MusicStyle[];
  questionnaireCompleted?: boolean;
  lastNotificationCheckTimestamp?: FirebaseTimestamp;
}

const useAuth = () => {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(firestore, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        let userRole: UserRole | null = null;
        let userName: string = firebaseUser.displayName || "Usuário";
        let preferredVenueTypes: VenueType[] = [];
        let preferredMusicStyles: MusicStyle[] = [];
        let questionnaireCompleted: boolean = false;
        let lastNotificationCheckTimestamp: FirebaseTimestamp | undefined = undefined;


        if (userDoc.exists()) {
          const userData = userDoc.data();
          userRole = userData.role as UserRole || null;
          userName = userData.name || userName; 
          preferredVenueTypes = userData.preferredVenueTypes || [];
          preferredMusicStyles = userData.preferredMusicStyles || [];
          questionnaireCompleted = userData.questionnaireCompleted || false;
          lastNotificationCheckTimestamp = userData.lastNotificationCheckTimestamp as FirebaseTimestamp || undefined;
        } else {
           if (pathname.includes('/partner')) {
            userRole = UserRole.PARTNER;
            userName = "Parceiro Fervo";
          } else {
            userRole = UserRole.USER;
          }
        }
        
        setAppUser({
          uid: firebaseUser.uid,
          name: userName,
          email: firebaseUser.email,
          role: userRole,
          preferredVenueTypes,
          preferredMusicStyles,
          questionnaireCompleted,
          lastNotificationCheckTimestamp,
        });
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [pathname]);
  
  return { user: appUser, loading };
};


export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isFetchingNotifications, setIsFetchingNotifications] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      const allowedUnauthenticatedPaths = ['/login', '/questionnaire', '/partner-questionnaire', '/shared-event'];
      const isAllowedPath = allowedUnauthenticatedPaths.some(p => pathname.startsWith(p));
      
      if (!isAllowedPath) {
        router.push('/login');
      }
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    if (loading || !user || !user.uid || !user.questionnaireCompleted || user.role !== UserRole.USER) {
      setHasNewNotifications(false);
      return;
    }

    const checkNewNotifications = async () => {
      const userLastCheck = user.lastNotificationCheckTimestamp?.toDate() || new Date(0); 

      const partnersRef = collection(firestore, 'users');
      const q = query(partnersRef,
        where('role', '==', UserRole.PARTNER),
        where('questionnaireCompleted', '==', true)
      );

      try {
        const querySnapshot = await getDocs(q);
        let foundNew = false;
        for (const partnerDoc of querySnapshot.docs) {
          const partnerData = partnerDoc.data();
          const partnerProfileCompletedAt = (partnerData.questionnaireCompletedAt as FirebaseTimestamp)?.toDate();

          if (!partnerProfileCompletedAt) continue; 

          if (partnerProfileCompletedAt > userLastCheck) {
            const typeMatch = user.preferredVenueTypes?.includes(partnerData.venueType as VenueType);
            const styleMatch = Array.isArray(partnerData.musicStyles) && partnerData.musicStyles.some((style: MusicStyle) => user.preferredMusicStyles?.includes(style));

            if (typeMatch || styleMatch) {
              foundNew = true;
              break;
            }
          }
        }
        setHasNewNotifications(foundNew);
      } catch (error) {
        console.error("Error checking for new notifications:", error);
        setHasNewNotifications(false);
      }
    };

    checkNewNotifications();
  }, [user, loading]);


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
    if (!user || !user.uid) {
      toast({ title: "Login Necessário", description: "Faça login para ver notificações." });
      return;
    }

    if (!user.questionnaireCompleted) {
      toast({ title: "Complete seu Perfil", description: "Preencha suas preferências para receber sugestões de Fervos!", duration: 5000 });
      return;
    }

    const userPrefs = {
      venueTypes: user.preferredVenueTypes || [],
      musicStyles: user.preferredMusicStyles || [],
    };

    if (userPrefs.venueTypes.length === 0 && userPrefs.musicStyles.length === 0) {
       toast({ title: "Defina suas Preferências", description: "Adicione seus tipos de locais e estilos musicais favoritos no seu perfil para receber sugestões.", duration: 7000 });
       return;
    }

    setIsFetchingNotifications(true);
    let foundNewForToast = false;
    try {
      const partnersRef = collection(firestore, 'users');
      const q = query(partnersRef,
        where('role', '==', UserRole.PARTNER),
        where('questionnaireCompleted', '==', true)
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
            foundNewForToast = true;
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

      // Update last check timestamp and clear notification indicator
      const userDocRef = doc(firestore, "users", user.uid);
      await updateDoc(userDocRef, {
        lastNotificationCheckTimestamp: serverTimestamp()
      });
      setHasNewNotifications(false);

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
        Carregando...
      </div>
    );
  }

  if (!user) {
     const allowedUnauthenticatedPaths = ['/login', '/questionnaire', '/partner-questionnaire', '/shared-event'];
     const isAllowedPath = allowedUnauthenticatedPaths.some(p => pathname.startsWith(p));
     if (!isAllowedPath) {
        return (
         <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
            Redirecionando para login...
          </div>
        );
     }
  }
  
  const activeColorClass = user?.role === UserRole.PARTNER ? 'text-destructive' : 'text-primary';
  const activeBorderColorClass = user?.role === UserRole.PARTNER ? 'border-destructive' : 'border-primary';


  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex items-center h-16 max-w-screen-2xl">
          <Logo iconClassName={activeColorClass} />
          <nav className="flex items-center gap-2 ml-auto md:gap-4">
            {user?.role === UserRole.USER && (
              <>
                <Link href="/map" passHref>
                  <Button variant={pathname === '/map' ? 'secondary': 'ghost'} className={pathname === '/map' ? activeColorClass : ''}>
                    <Map className="w-4 h-4 mr-0 md:mr-2" /> <span className="hidden md:inline">Mapa de Eventos</span>
                  </Button>
                </Link>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={activeColorClass} 
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
                  className={cn(activeColorClass, hasNewNotifications && 'animate-pulse')}
                  onClick={handleNotificationsClick}
                  disabled={isFetchingNotifications}
                  title="Verificar novos Fervos"
                >
                  {isFetchingNotifications ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
                  <span className="sr-only">Notificações</span>
                </Button>
                <Button variant="ghost" size="icon" className={activeColorClass} onClick={() => toast({ title: "Suas FervoCoins!", description: "Recurso em breve! Você ganhará FervoCoins ao compartilhar eventos com amigos. Cada compartilhamento vale 2 moedas!", variant: "default"})}>
                  <Coins className="w-5 h-5" />
                  <span className="sr-only">Moedas</span>
                </Button>
                <Button variant="ghost" size="icon" className={activeColorClass} onClick={() => toast({ title: "Cupons", description: "Recurso em breve!", variant: "default"})}>
                  <TicketPercent className="w-5 h-5" />
                  <span className="sr-only">Cupons de Desconto</span>
                </Button>
              </>
            )}
            {user?.role === UserRole.PARTNER && (
              <Link href="/partner/dashboard" passHref>
                <Button variant={pathname === '/partner/dashboard' ? 'secondary' : 'ghost'} className={pathname === '/partner/dashboard' ? activeColorClass : ''}>
                 <LayoutDashboard className="w-4 h-4 mr-2" /> Meu Painel
                </Button>
              </Link>
            )}
            {user && ( 
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={`relative w-10 h-10 rounded-full ${activeBorderColorClass} border-2 p-0 flex items-center justify-center`}>
                  {user?.name ? (
                    <span className={`text-lg font-semibold ${activeColorClass}`}>
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <UserCircle className={`w-6 h-6 ${activeColorClass}`} />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || "Nome do Usuário"}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user?.role === UserRole.USER && (
                  <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                    <UserCircle className="w-4 h-4 mr-2" />
                    Meu Perfil
                  </DropdownMenuItem>
                )}
                 {user?.role === UserRole.PARTNER && (
                  <DropdownMenuItem onClick={() => router.push('/partner-questionnaire')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações do Local
                  </DropdownMenuItem>
                )}
                 {user?.role === UserRole.PARTNER && (
                  <DropdownMenuItem onClick={() => router.push('/partner/settings')}>
                    <Settings className="w-4 h-4 mr-2" /> 
                    Configurações da Conta
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{user ? children : null}</main>
      {user && user.role === UserRole.USER && user.uid && (
        <QrScannerModal 
          isOpen={isQrScannerOpen} 
          onClose={() => setIsQrScannerOpen(false)}
          userId={user.uid}
        />
      )}
    </div>
  );
}

