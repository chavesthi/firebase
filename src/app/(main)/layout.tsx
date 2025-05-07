
'use client';

import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, LogOut, Map, UserCircle, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole } from '@/lib/constants';
import { useEffect, useState } from 'react';
import { auth, firestore } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';


interface AppUser {
  name: string;
  email: string | null;
  role: UserRole | null;
  photoURL?: string | null;
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
          name: userName,
          email: firebaseUser.email,
          role: userRole,
          photoURL: firebaseUser.photoURL,
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

  const handleLogout = async () => {
    try {
      await auth.signOut();
      router.push('/login');
      // toast({ title: "Logout", description: "Você foi desconectado." });
    } catch (error) {
      console.error("Logout error:", error);
      // toast({ title: "Erro no Logout", description: "Não foi possível desconectar.", variant: "destructive" });
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
    // Redirect to login if user is not authenticated and not already on a public/auth page.
    // This check might need refinement based on which paths are considered public.
    if (!pathname.startsWith('/login') && !pathname.startsWith('/questionnaire') && !pathname.startsWith('/partner-questionnaire')) {
      router.push('/login');
    }
    return (
       <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        Redirecionando para login...
      </div>
    );
  }
  
  // Determine active color based on role
  const activeColorClass = user.role === UserRole.PARTNER ? 'text-destructive' : 'text-primary';
  const activeBorderColorClass = user.role === UserRole.PARTNER ? 'border-destructive' : 'border-primary';


  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex items-center h-16 max-w-screen-2xl">
          <Logo iconClassName={activeColorClass} />
          <nav className="flex items-center gap-4 ml-auto">
            {user.role === UserRole.USER && (
              <Link href="/map" passHref>
                <Button variant={pathname === '/map' ? 'secondary': 'ghost'} className={pathname === '/map' ? activeColorClass : ''}>
                  <Map className="w-4 h-4 mr-2" /> Mapa de Eventos
                </Button>
              </Link>
            )}
            {user.role === UserRole.PARTNER && (
              <Link href="/partner/dashboard" passHref>
                <Button variant={pathname === '/partner/dashboard' ? 'secondary' : 'ghost'} className={pathname === '/partner/dashboard' ? activeColorClass : ''}>
                 <LayoutDashboard className="w-4 h-4 mr-2" /> Meu Painel
                </Button>
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={`relative w-10 h-10 rounded-full ${activeBorderColorClass} border-2`}>
                  <Avatar className="w-9 h-9">
                    <AvatarImage 
                      src={user?.photoURL || `https://picsum.photos/seed/${user?.email}/40/40`} 
                      alt="coloque aqui um icone de configurações" 
                      data-ai-hint="configurações icone" />
                    <AvatarFallback className={activeColorClass}>
                      {user?.name ? user.name.charAt(0).toUpperCase() : <UserCircle />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || "aqui deve aparecer o nome do usuario"}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role === UserRole.USER && (
                  <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                    <UserCircle className="w-4 h-4 mr-2" />
                    Meu Perfil
                  </DropdownMenuItem>
                )}
                 {user.role === UserRole.PARTNER && (
                  <DropdownMenuItem onClick={() => router.push('/partner-questionnaire')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações do Local
                  </DropdownMenuItem>
                )}
                 {user.role === UserRole.PARTNER && (
                  <DropdownMenuItem onClick={() => router.push('/partner/settings')}>
                    <UserCircle className="w-4 h-4 mr-2" />
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
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

