import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-8 left-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md shadow-2xl border-primary/50" style={{'--card-glow': 'hsl(var(--primary))'} as React.CSSProperties}>
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">Bem-vindo ao FervoFinder!</CardTitle>
          <CardDescription className="text-muted-foreground">
            Encontre os melhores fervos ou cadastre seu estabelecimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px var(--card-glow), 0 0 30px 10px var(--card-glow-soft, hsla(var(--primary), 0.3));
        }
      `}</style>
    </main>
  );
}
