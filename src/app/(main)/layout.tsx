
'use client';

import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
// Removed Avatar, AvatarFallback, AvatarImage imports
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, LogOut, Map, UserCircle, Settings, Bell, Coins, TicketPercent, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole } from '@/lib/constants';
import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import QrScannerModal from '@/components/checkin/qr-scanner-modal';


interface AppUser {
  name: string;
  email: string | null;
  role: UserRole | null;
  uid: string; // Add UID for check-in
  // photoURL removed
}

// Updated auth hook to use Firebase
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

        if (userDoc.exists()) {
          const userData = userDoc.data();
          userRole = userData.role as UserRole || null;
          userName = userData.name || userName; // Prefer Firestore name if available
        } else {
          // Fallback if user doc doesn't exist, try to infer from path or default
           if (pathname.includes('/partner')) {
            userRole = UserRole.PARTNER;
            userName = "Parceiro Fervo";
          } else {
            userRole = UserRole.USER;
            // userName will be "Usuário Fervoso" or similar if set during signup, else "Usuário"
          }
        }
        
        setAppUser({
          uid: firebaseUser.uid,
          name: userName,
          email: firebaseUser.email,
          role: userRole,
          // photoURL removed
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

  useEffect(() => {
    if (!loading && !user) {
      // Redirect to login if user is not authenticated and not already on a public/auth page.
      const allowedUnauthenticatedPaths = ['/login', '/questionnaire', '/partner-questionnaire', '/shared-event'];
      const isAllowedPath = allowedUnauthenticatedPaths.some(p => pathname.startsWith(p));
      
      if (!isAllowedPath) {
        router.push('/login');
      }
    }
  }, [user, loading, router, pathname]);


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
                <Button variant="ghost" size="icon" className={activeColorClass} onClick={() => setIsQrScannerOpen(true)} title="Check-in com QR Code">
                  <ScanLine className="w-5 h-5" />
                  <span className="sr-only">Check-in QR Code</span>
                </Button>
                <Button variant="ghost" size="icon" className={activeColorClass} onClick={() => toast({ title: "Notificações", description: "Aqui ficaram as notificações ativadas pelo usuário. Se não tiver nenhuma, mostre Nada Por aqui Ainda.", variant: "default"})}>
                  <Bell className="w-5 h-5" />
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
