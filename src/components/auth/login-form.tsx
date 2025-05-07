'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { UserRole } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';


const loginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.USER);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const methods = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = methods;

  const onSubmit: SubmitHandler<LoginFormInputs> = async (data) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('Login data:', data, 'Role:', activeRole);
    
    toast({
      title: "Login Bem Sucedido!",
      description: `Bem-vindo, ${activeRole === UserRole.USER ? 'Usuário' : 'Parceiro'}! Redirecionando...`,
      variant: activeRole === UserRole.USER ? "default" : "destructive", // Default is blue-ish, destructive is red-ish
    });

    // TODO: Implement actual authentication logic here
    // For demonstration, redirect based on role
    if (activeRole === UserRole.USER) {
      router.push('/map');
    } else {
      router.push('/partner/dashboard');
    }
    reset();
  };

  const cardStyles = activeRole === UserRole.USER 
    ? 'border-primary/80 [--card-glow:hsl(var(--primary))] [--card-glow-soft:hsla(var(--primary),0.2)]' 
    : 'border-destructive/80 [--card-glow:hsl(var(--destructive))] [--card-glow-soft:hsla(var(--destructive),0.2)]';
  
  const buttonStyles = activeRole === UserRole.USER 
    ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
    : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground';

  return (
    <Tabs value={activeRole} onValueChange={(value) => setActiveRole(value as UserRole)} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6 bg-background/50">
        <TabsTrigger 
          value={UserRole.USER} 
          className={cn(
            "data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_10px_hsl(var(--primary))]",
            "hover:bg-primary/10"
          )}
        >
          Usuário
        </TabsTrigger>
        <TabsTrigger 
          value={UserRole.PARTNER}
          className={cn(
            "data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive data-[state=active]:shadow-[0_0_10px_hsl(var(--destructive))]",
            "hover:bg-destructive/10"
          )}
        >
          Parceiro
        </TabsTrigger>
      </TabsList>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className={cn("transition-all duration-300 ease-in-out", cardStyles)}>
          <CardHeader/>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className={cn(activeRole === UserRole.PARTNER && "text-destructive/80")}>E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seuemail@exemplo.com"
                {...register('email')}
                className={cn(errors.email && "border-destructive focus-visible:ring-destructive")}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className={cn(activeRole === UserRole.PARTNER && "text-destructive/80")}>Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  {...register('password')}
                  className={cn(errors.password && "border-destructive focus-visible:ring-destructive")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className={cn("w-full", buttonStyles)} disabled={isSubmitting}>
              {isSubmitting ? 'Entrando...' : 'Entrar'} <LogIn size={18} className="ml-2"/>
            </Button>
          </CardFooter>
        </Card>
      </form>
       <style jsx global>{`
        .border-primary\\/80 { border-color: hsla(var(--primary), 0.8); }
        .border-destructive\\/80 { border-color: hsla(var(--destructive), 0.8); }
        .shadow-\\[0_0_10px_hsl\\(var\\(--primary\\)\\)\\] { box-shadow: 0 0 10px hsl(var(--primary)); }
        .shadow-\\[0_0_10px_hsl\\(var\\(--destructive\\)\\)\\] { box-shadow: 0 0 10px hsl(var(--destructive)); }
        .bg-primary\\/20 { background-color: hsla(var(--primary), 0.2); }
        .bg-destructive\\/20 { background-color: hsla(var(--destructive), 0.2); }
        .text-primary { color: hsl(var(--primary)); }
        .text-destructive { color: hsl(var(--destructive)); }
        .text-destructive\\/80 { color: hsla(var(--destructive), 0.8); }
      `}</style>
    </Tabs>
  );
}
