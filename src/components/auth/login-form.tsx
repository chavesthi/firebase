
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
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const loginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
});

const signupSchema = z.object({
  name: z.string().min(3, { message: 'O nome deve ter pelo menos 3 caracteres.' }),
  email: z.string().email({ message: 'E-mail inválido.' }),
  password: z.string().min(6, { message: 'A senha deve ter pelo menos 6 caracteres.' }),
  confirmPassword: z.string().min(6, { message: 'A confirmação da senha deve ter pelo menos 6 caracteres.' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type LoginFormInputs = z.infer<typeof loginSchema>;
type SignupFormInputs = z.infer<typeof signupSchema>;

export function LoginForm() {
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.USER);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formMode, setFormMode] = useState<'login' | 'signup'>('login'); // 'login' or 'signup'
  const router = useRouter();
  const { toast } = useToast();

  const loginMethods = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const signupMethods = useForm<SignupFormInputs>({
    resolver: zodResolver(signupSchema),
  });

  const onLoginSubmit: SubmitHandler<LoginFormInputs> = async (data) => {
    loginMethods.formState.isSubmitting;
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);

      toast({
        title: "Login Bem Sucedido!",
        description: `Bem-vindo, ${activeRole === UserRole.USER ? 'Usuário' : 'Parceiro'}! Redirecionando...`,
        variant: activeRole === UserRole.USER ? "default" : "destructive",
      });

      if (activeRole === UserRole.USER) {
        router.push('/map');
      } else {
        router.push('/partner/dashboard');
      }
      loginMethods.reset();
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = "Falha no login. Verifique suas credenciais.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "E-mail ou senha inválidos.";
      }
      toast({
        title: "Erro no Login",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const onSignupSubmit: SubmitHandler<SignupFormInputs> = async (data) => {
    signupMethods.formState.isSubmitting;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      await setDoc(doc(firestore, "users", user.uid), {
        uid: user.uid,
        name: data.name,
        email: data.email,
        role: activeRole,
        createdAt: new Date(),
      });
      
      toast({
        title: "Conta Criada com Sucesso!",
        description: "Quase lá! Conte-nos um pouco mais sobre você.",
        variant: "default",
      });
      signupMethods.reset();
      
      if (activeRole === UserRole.USER) {
        router.push('/questionnaire'); // Redirect to questionnaire for new users
      } else { // For partners, redirect to dashboard
        router.push('/partner/dashboard');
      }

    } catch (error: any) {
      console.error('Signup error:', error);
      let errorMessage = "Falha ao criar conta. Tente novamente.";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Este e-mail já está em uso.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "A senha é muito fraca. Use pelo menos 6 caracteres.";
      }
      toast({
        title: "Erro no Cadastro",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const cardStyles = activeRole === UserRole.USER 
    ? 'border-primary/80 [--card-glow:hsl(var(--primary))] [--card-glow-soft:hsla(var(--primary),0.2)]' 
    : 'border-destructive/80 [--card-glow:hsl(var(--destructive))] [--card-glow-soft:hsla(var(--destructive),0.2)]';
  
  const buttonStyles = activeRole === UserRole.USER 
    ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
    : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground';

  const commonLabelStyle = activeRole === UserRole.PARTNER ? "text-destructive/80" : "text-primary/80";
  const commonErrorBorderStyle = "border-destructive focus-visible:ring-destructive";

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

      {formMode === 'login' && (
        <form onSubmit={loginMethods.handleSubmit(onLoginSubmit)}>
          <Card className={cn("transition-all duration-300 ease-in-out", cardStyles)}>
            <CardHeader/>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className={commonLabelStyle}>E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  {...loginMethods.register('email')}
                  className={cn(loginMethods.formState.errors.email && commonErrorBorderStyle)}
                />
                {loginMethods.formState.errors.email && <p className="text-sm text-destructive">{loginMethods.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className={commonLabelStyle}>Senha</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    {...loginMethods.register('password')}
                    className={cn(loginMethods.formState.errors.password && commonErrorBorderStyle)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
                {loginMethods.formState.errors.password && <p className="text-sm text-destructive">{loginMethods.formState.errors.password.message}</p>}
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className={cn("w-full", buttonStyles)} disabled={loginMethods.formState.isSubmitting}>
                {loginMethods.formState.isSubmitting ? 'Entrando...' : 'Entrar'} <LogIn size={18} className="ml-2"/>
              </Button>
              <Button variant="link" type="button" onClick={() => setFormMode('signup')} className={cn("p-0 h-auto", activeRole === UserRole.USER ? "text-primary/80 hover:text-primary" : "text-destructive/80 hover:text-destructive")}>
                Não tem uma conta? Cadastre-se
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {formMode === 'signup' && (
        <form onSubmit={signupMethods.handleSubmit(onSignupSubmit)}>
          <Card className={cn("transition-all duration-300 ease-in-out", cardStyles)}>
            <CardHeader/>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name" className={commonLabelStyle}>Nome Completo</Label>
                <Input
                  id="signup-name"
                  placeholder="Seu nome"
                  {...signupMethods.register('name')}
                  className={cn(signupMethods.formState.errors.name && commonErrorBorderStyle)}
                />
                {signupMethods.formState.errors.name && <p className="text-sm text-destructive">{signupMethods.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className={commonLabelStyle}>E-mail</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  {...signupMethods.register('email')}
                  className={cn(signupMethods.formState.errors.email && commonErrorBorderStyle)}
                />
                {signupMethods.formState.errors.email && <p className="text-sm text-destructive">{signupMethods.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password" className={commonLabelStyle}>Senha</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Crie uma senha"
                    {...signupMethods.register('password')}
                    className={cn(signupMethods.formState.errors.password && commonErrorBorderStyle)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
                {signupMethods.formState.errors.password && <p className="text-sm text-destructive">{signupMethods.formState.errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-confirmPassword" className={commonLabelStyle}>Confirmar Senha</Label>
                 <div className="relative">
                  <Input
                    id="signup-confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirme sua senha"
                    {...signupMethods.register('confirmPassword')}
                    className={cn(signupMethods.formState.errors.confirmPassword && commonErrorBorderStyle)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Esconder confirmação de senha" : "Mostrar confirmação de senha"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
                {signupMethods.formState.errors.confirmPassword && <p className="text-sm text-destructive">{signupMethods.formState.errors.confirmPassword.message}</p>}
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className={cn("w-full", buttonStyles)} disabled={signupMethods.formState.isSubmitting}>
                {signupMethods.formState.isSubmitting ? 'Criando conta...' : 'Criar Conta'} <UserPlus size={18} className="ml-2"/>
              </Button>
              <Button variant="link" type="button" onClick={() => setFormMode('login')} className={cn("p-0 h-auto", activeRole === UserRole.USER ? "text-primary/80 hover:text-primary" : "text-destructive/80 hover:text-destructive")}>
                Já tem uma conta? Faça login
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

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
        .text-primary\\/80 { color: hsla(var(--primary), 0.8); }
      `}</style>
    </Tabs>
  );
}
