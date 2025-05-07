

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
import { auth, firestore, googleAuthProvider } from '@/lib/firebase'; // Added googleAuthProvider
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, type UserCredential } from 'firebase/auth'; // Added signInWithPopup
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'; // Added serverTimestamp

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

// Simple Google Icon SVG
const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 48 48" width="20" height="20" {...props}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
    <path fill="none" d="M0 0h48v48H0z"></path>
  </svg>
);


export function LoginForm() {
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.USER);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formMode, setFormMode] = useState<'login' | 'signup'>('login'); // 'login' or 'signup'
  const router = useRouter();
  const { toast } = useToast();
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);


  const loginMethods = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const signupMethods = useForm<SignupFormInputs>({
    resolver: zodResolver(signupSchema),
  });

  const handleSuccessfulAuth = async (userCredential: UserCredential, role: UserRole, isGoogleSignIn: boolean = false, googleName?: string) => {
    const user = userCredential.user;
    const userDocRef = doc(firestore, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // New user (either via Google first time or regular signup which should have created this)
      await setDoc(userDocRef, {
        uid: user.uid,
        name: isGoogleSignIn ? (googleName || user.displayName || "Usuário") : signupMethods.getValues("name"),
        email: user.email,
        role: role,
        createdAt: serverTimestamp(),
        questionnaireCompleted: false,
      });
      toast({
        title: isGoogleSignIn ? "Login com Google Bem Sucedido!" : "Conta Criada com Sucesso!",
        description: "Quase lá! Conte-nos um pouco mais sobre você.",
        variant: role === UserRole.USER ? "default" : "destructive",
      });
      router.push(role === UserRole.USER ? '/questionnaire' : '/partner-questionnaire');
    } else {
      // Existing user
      const userData = userDoc.data();
      const userRoleInDb = userData.role || UserRole.USER;
      const questionnaireCompleted = userData.questionnaireCompleted || false;

      if (role !== userRoleInDb) {
        toast({
          title: "Tipo de Conta Incorreto",
          description: `Este e-mail está registrado como ${userRoleInDb === UserRole.USER ? 'usuário comum' : 'parceiro'}. Por favor, use a aba correta.`,
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Login Bem Sucedido!",
        description: `Bem-vindo de volta, ${userData.name || (role === UserRole.USER ? 'Usuário' : 'Parceiro')}! Redirecionando...`,
        variant: role === UserRole.USER ? "default" : "destructive",
      });

      if (role === UserRole.USER) {
        router.push(questionnaireCompleted ? '/map' : '/questionnaire');
      } else {
        router.push(questionnaireCompleted ? '/partner/dashboard' : '/partner-questionnaire');
      }
    }
  };


  const onLoginSubmit: SubmitHandler<LoginFormInputs> = async (data) => {
    loginMethods.formState.isSubmitting; // Ensure isSubmitting is accessed
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await handleSuccessfulAuth(userCredential, activeRole);
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
    signupMethods.formState.isSubmitting; // Ensure isSubmitting is accessed
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      // Firestore document will be created in handleSuccessfulAuth
      await handleSuccessfulAuth(userCredential, activeRole, false, data.name);
      signupMethods.reset();
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

  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    try {
      const userCredential = await signInWithPopup(auth, googleAuthProvider);
      await handleSuccessfulAuth(userCredential, activeRole, true, userCredential.user.displayName || undefined);
    } catch (error: any) {
      console.error("Google Sign-In error: ", error);
      let errorMessage = "Falha ao fazer login com Google. Tente novamente.";
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = "Já existe uma conta com este e-mail usando um método de login diferente.";
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "Login com Google cancelado.";
      }
      toast({
        title: "Erro no Login com Google",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGoogleSigningIn(false);
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
              <Button type="submit" className={cn("w-full", buttonStyles)} disabled={loginMethods.formState.isSubmitting || isGoogleSigningIn}>
                {loginMethods.formState.isSubmitting ? 'Entrando...' : 'Entrar'} <LogIn size={18} className="ml-2"/>
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full border-border hover:bg-muted/50" 
                onClick={handleGoogleSignIn}
                disabled={isGoogleSigningIn || loginMethods.formState.isSubmitting}
              >
                <GoogleIcon className="mr-2"/> {isGoogleSigningIn ? 'Conectando com Google...' : 'Entrar com Google'}
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
              <Button type="submit" className={cn("w-full", buttonStyles)} disabled={signupMethods.formState.isSubmitting || isGoogleSigningIn}>
                {signupMethods.formState.isSubmitting ? 'Criando conta...' : 'Criar Conta'} <UserPlus size={18} className="ml-2"/>
              </Button>
               <Button 
                type="button" 
                variant="outline" 
                className="w-full border-border hover:bg-muted/50" 
                onClick={handleGoogleSignIn}
                disabled={isGoogleSigningIn || signupMethods.formState.isSubmitting}
              >
                 <GoogleIcon className="mr-2"/> {isGoogleSigningIn ? 'Conectando com Google...' : 'Cadastrar com Google'}
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

