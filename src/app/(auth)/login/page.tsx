
'use client';

import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-8 left-8">
        <Logo />
      </div>
      {/* Wrapper Card for the main glow effect, LoginForm will contain its own card for content */}
      <div className="w-full max-w-md p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-destructive/50" 
           style={{'--card-glow-primary': 'hsl(var(--primary))', '--card-glow-destructive': 'hsl(var(--destructive))'} as React.CSSProperties}>
        <Card className="w-full bg-card/95 backdrop-blur-sm"> {/* Slightly transparent card inside */}
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Bem-vindo ao FervoFinder!</CardTitle>
            <CardDescription className="text-muted-foreground">
              Encontre os melhores fervos ou cadastre seu estabelecimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          /* Dynamic glow based on which form/role might be active, or a mix */
          /* For simplicity, this example uses a static mix or one primary glow */
          box-shadow: 0 0 15px 5px var(--card-glow-primary), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px var(--card-glow-destructive), 0 0 30px 10px hsla(var(--destructive), 0.3);
        }
        .bg-gradient-to-b {
          /* This ensures the border itself has a gradient if needed, useful if card inside is fully opaque */
        }
      `}</style>
    </main>
  );
}
