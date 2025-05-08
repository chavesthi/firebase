
'use client';

import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Logo />
      </div>
      {/* Wrapper Card for the main glow effect, LoginForm will contain its own card for content */}
       {/* Changed outer gradient from primary/destructive to primary/secondary */}
      <div className="w-full max-w-md p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-secondary/50"
            /* Updated CSS variables to use primary/secondary */
           style={{'--card-glow-primary': 'hsl(var(--primary))', '--card-glow-secondary': 'hsl(var(--secondary))'} as React.CSSProperties}>
        <Card className="w-full bg-card/95 backdrop-blur-sm"> {/* Slightly transparent card inside */}
          <CardHeader className="text-center px-4 sm:px-6 pt-6 sm:pt-8">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Bem-vindo ao Fervo App!</CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base">
              Encontre os melhores fervos ou cadastre seu estabelecimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <LoginForm />
          </CardContent>
        </Card>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          /* Dynamic glow based on primary/secondary */
          box-shadow: 0 0 15px 5px var(--card-glow-primary), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px var(--card-glow-secondary), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
        .bg-gradient-to-b {
          /* This ensures the border itself has a gradient if needed, useful if card inside is fully opaque */
        }
      `}</style>
    </main>
  );
}

