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
import { UserRole } from '@/lib/constants'; // Assuming UserRole is defined
import { useEffect, useState } from 'react';


// Mock auth state - replace with actual auth context/logic
const useAuth = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching user role
    // In a real app, this would come from your auth provider
    const currentPath = window.location.pathname;
    if (currentPath.includes('/partner')) {
      setRole(UserRole.PARTNER);
    } else if (currentPath.includes('/map')) {
      setRole(UserRole.USER);
    } else {
      // If on a generic (main) path without specific role, default or handle as needed
      // For now, let's assume user if not partner
      // This logic needs to be robust based on your auth flow
      setRole(UserRole.USER); 
    }
    setLoading(false);
  }, []);
  
  return { role: role, loading: loading, user: { name: role === UserRole.PARTNER ? "Parceiro Fervo" : "Usuário Fervo", email: `${role}@fervo.com` } };
};


export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    // TODO: Implement actual logout logic
    console.log('Logging out...');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        Carregando...
      </div>
    );
  }
  
  // Determine active color based on role
  const activeColorClass = role === UserRole.PARTNER ? 'text-destructive' : 'text-primary';
  const activeBorderColorClass = role === UserRole.PARTNER ? 'border-destructive' : 'border-primary';


  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex items-center h-16 max-w-screen-2xl">
          <Logo iconClassName={activeColorClass} />
          <nav className="flex items-center gap-4 ml-auto">
            {role === UserRole.USER && (
              <Link href="/map" passHref>
                <Button variant={pathname === '/map' ? 'secondary': 'ghost'} className={pathname === '/map' ? activeColorClass : ''}>
                  <Map className="w-4 h-4 mr-2" /> Mapa de Eventos
                </Button>
              </Link>
            )}
            {role === UserRole.PARTNER && (
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
                    <AvatarImage src={`https://picsum.photos/seed/${user?.email}/40/40`} alt={user?.name || 'Avatar'} data-ai-hint="user avatar" />
                    <AvatarFallback className={activeColorClass}>
                      {user?.name ? user.name.charAt(0).toUpperCase() : <UserCircle />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {role === UserRole.USER && (
                  <DropdownMenuItem onClick={() => router.push('/user/profile')}>
                    <UserCircle className="w-4 h-4 mr-2" />
                    Meu Perfil
                  </DropdownMenuItem>
                )}
                 {role === UserRole.PARTNER && (
                  <DropdownMenuItem onClick={() => router.push('/partner/settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações
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
