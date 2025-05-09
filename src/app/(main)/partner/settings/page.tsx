
'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, updateEmail } from 'firebase/auth'; // Import updateEmail
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCircle, ArrowLeft, Save, Loader2, Eye, EyeOff, CreditCard } from 'lucide-react'; // Added Eye, EyeOff and CreditCard
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator'; // Import Separator

// Schema for partner settings form
const partnerSettingsSchema = z.object({
  contactName: z.string().min(3, { message: 'Nome do contato deve ter pelo menos 3 caracteres.' }),
  companyName: z.string().min(3, { message: 'Nome da empresa deve ter pelo menos 3 caracteres.' }),
  email: z.string().email({ message: 'E-mail inválido.' }),
  notificationsEnabled: z.boolean().default(true),
  // Optional password fields for coupon report clearing
  couponReportClearPassword: z.string().optional(),
  confirmCouponReportClearPassword: z.string().optional(),
}).refine(data => {
    // If one password field is filled, the other must be too, and they must match
    if (data.couponReportClearPassword || data.confirmCouponReportClearPassword) {
        return data.couponReportClearPassword === data.confirmCouponReportClearPassword &&
               (data.couponReportClearPassword?.length ?? 0) >= 6;
    }
    return true; // If both are empty, it's valid
}, {
    message: "Senhas não coincidem ou são muito curtas (mínimo 6 caracteres). Ambas devem ser preenchidas ou ambas vazias.",
    path: ["confirmCouponReportClearPassword"], // Apply error message to the confirmation field
});


type PartnerSettingsFormInputs = z.infer<typeof partnerSettingsSchema>;

export default function PartnerSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialEmail, setInitialEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const { control, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<PartnerSettingsFormInputs>({
    resolver: zodResolver(partnerSettingsSchema),
    defaultValues: {
      contactName: '',
      companyName: '',
      email: '',
      notificationsEnabled: true,
      couponReportClearPassword: '', // Initialize as empty
      confirmCouponReportClearPassword: '', // Initialize as empty
    },
  });

  const watchedName = watch('contactName');

  // Fetch current user and settings
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setInitialEmail(user.email); // Store initial email from auth object
        const userDocRef = doc(firestore, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            reset({
              contactName: userData.name || user.displayName || '', // Use 'name' field from Firestore
              companyName: userData.venueName || '', // Use venueName for company name
              email: user.email || '', // Primarily use auth email
              notificationsEnabled: userData.notificationsEnabled ?? true,
              // Do not load the password itself for security
              couponReportClearPassword: '',
              confirmCouponReportClearPassword: '',
            });
          } else {
            reset({
              contactName: user.displayName || '',
              companyName: '',
              email: user.email || '',
              notificationsEnabled: true,
              couponReportClearPassword: '',
              confirmCouponReportClearPassword: '',
            });
             toast({ title: "Perfil Incompleto", description: "Dados não encontrados. Preencha e salve para criar.", variant: "destructive" });
          }
        } catch (error) {
          console.error("Error fetching partner data:", error);
          toast({ title: "Erro ao Carregar Dados", description: "Não foi possível buscar suas configurações.", variant: "destructive" });
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, [router, reset, toast]);

  // Handle form submission
  const onSubmit: SubmitHandler<PartnerSettingsFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);

       // Prepare data for Firestore update
      const dataToUpdate: { [key: string]: any } = {
        name: data.contactName,
        venueName: data.companyName,
        notificationsEnabled: data.notificationsEnabled,
        settingsUpdatedAt: serverTimestamp(),
      };

      if (data.couponReportClearPassword && data.couponReportClearPassword === data.confirmCouponReportClearPassword) {
          dataToUpdate.couponReportClearPassword = data.couponReportClearPassword; 
          toast({ title: "Senha do Relatório Definida", description: "Senha para limpar relatório de cupons foi definida/atualizada.", variant: "default" });
      } else if (data.couponReportClearPassword || data.confirmCouponReportClearPassword) {
         toast({ title: "Erro na Senha", description: "As senhas do relatório não coincidem ou estão incompletas.", variant: "destructive" });
         return; 
      }


      await updateDoc(userDocRef, dataToUpdate);

      let emailUpdateMessage = "";
      if (data.email !== initialEmail) {
        if (window.confirm(`Deseja realmente alterar seu e-mail de login de ${initialEmail} para ${data.email}? Esta ação pode exigir reverificação.`)) {
          try {
            await updateEmail(currentUser, data.email);
            setInitialEmail(data.email); 
            emailUpdateMessage = "Seu e-mail de login foi alterado com sucesso.";
          } catch (authError: any) {
            console.error("Error updating auth email:", authError);
            let authErrorMessage = "Não foi possível atualizar o e-mail de login. Verifique a senha ou tente novamente.";
            if (authError.code === 'auth/requires-recent-login') {
              authErrorMessage = "Esta operação requer login recente. Por favor, faça login novamente e tente atualizar o e-mail.";
            } else if (authError.code === 'auth/email-already-in-use') {
              authErrorMessage = "Este e-mail já está em uso por outra conta.";
            }
            toast({ title: "Erro ao Atualizar E-mail", description: authErrorMessage, variant: "destructive", duration: 7000 });
            reset({ ...data, email: initialEmail || '', couponReportClearPassword: '', confirmCouponReportClearPassword: '' }); 
             return;
          }
        } else {
           reset({ ...data, email: initialEmail || '', couponReportClearPassword: '', confirmCouponReportClearPassword: '' }); 
           emailUpdateMessage = "Alteração de e-mail cancelada.";
        }
      }

      toast({
        title: "Configurações Salvas!",
        description: `Suas informações foram atualizadas. ${emailUpdateMessage}`,
        variant: "default", 
      });

      reset({ ...data, email: data.email, couponReportClearPassword: '', confirmCouponReportClearPassword: '' });


    } catch (error) {
      console.error("Error updating partner settings:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar suas alterações. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="ml-4 text-lg text-primary">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
        <div className="flex items-center justify-between mb-4 sm:mb-6 max-w-2xl mx-auto">
            <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
                <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
                Painel
            </Button>
        </div>
      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary">Configurações da Conta</CardTitle>
          <CardDescription className="text-sm sm:text-base">Gerencie as informações e preferências da sua conta de parceiro.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-primary rounded-full flex items-center justify-center bg-muted">
                {watchedName ? (
                  <span className="text-2xl sm:text-3xl text-primary font-semibold">
                    {watchedName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-primary" />
                )}
              </div>
               <p className="text-xs sm:text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
            </div>

            {/* Basic Info Section */}
            <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName" className="text-primary/90">Nome do Contato</Label>
                   <Controller
                    name="contactName"
                    control={control}
                    render={({ field }) => (
                      <Input id="contactName" {...field} className={cn(errors.contactName && 'border-red-500 focus-visible:ring-red-500')} />
                    )}
                  />
                  {errors.contactName && <p className="mt-1 text-sm text-destructive">{errors.contactName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-primary/90">Nome da Empresa/Estabelecimento</Label>
                   <Controller
                    name="companyName"
                    control={control}
                    render={({ field }) => (
                      <Input id="companyName" {...field} className={cn(errors.companyName && 'border-red-500 focus-visible:ring-red-500')} />
                    )}
                  />
                   {errors.companyName && <p className="mt-1 text-sm text-destructive">{errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-primary/90">E-mail de Login</Label>
                   <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                       <Input id="email" type="email" {...field} className={cn(errors.email && 'border-red-500 focus-visible:ring-red-500')} />
                    )}
                  />
                  {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email.message}</p>}
                   <p className="mt-1 text-xs text-muted-foreground">Alterar este e-mail muda seu acesso. Pode ser necessário reverificar.</p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Label htmlFor="notificationsEnabled" className="text-primary/90 text-sm sm:text-base">Receber Notificações por E-mail</Label>
                   <Controller
                      name="notificationsEnabled"
                      control={control}
                      render={({ field }) => (
                         <Switch
                          id="notificationsEnabled"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                        />
                      )}
                    />
                </div>
                 {errors.notificationsEnabled && <p className="mt-1 text-sm text-destructive">{errors.notificationsEnabled.message}</p>}
            </div>

            <Separator className="my-6 border-primary/20" />

            {/* Coupon Report Password Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-primary">Senha para Limpar Relatório de Cupons</h3>
                <p className="text-xs text-muted-foreground">Defina uma senha (mínimo 6 caracteres) que será solicitada para limpar o histórico de cupons resgatados. Deixe em branco se não desejar definir/alterar.</p>

                 <div className="space-y-2">
                    <Label htmlFor="couponReportClearPassword" className="text-primary/90">Nova Senha</Label>
                    <div className="relative">
                        <Controller
                            name="couponReportClearPassword"
                            control={control}
                            render={({ field }) => (
                            <Input
                                id="couponReportClearPassword"
                                type={showPassword ? "text" : "password"}
                                placeholder="Deixe em branco para não alterar"
                                {...field}
                                className={cn(errors.couponReportClearPassword && 'border-red-500 focus-visible:ring-red-500')}
                            />
                            )}
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
                    {errors.couponReportClearPassword && <p className="mt-1 text-sm text-destructive">{errors.couponReportClearPassword.message}</p>}
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="confirmCouponReportClearPassword" className="text-primary/90">Confirmar Nova Senha</Label>
                     <div className="relative">
                        <Controller
                            name="confirmCouponReportClearPassword"
                            control={control}
                            render={({ field }) => (
                            <Input
                                id="confirmCouponReportClearPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirme a senha"
                                {...field}
                                className={cn(errors.confirmCouponReportClearPassword && 'border-red-500 focus-visible:ring-red-500')}
                            />
                            )}
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
                    {errors.confirmCouponReportClearPassword && <p className="mt-1 text-sm text-destructive">{errors.confirmCouponReportClearPassword.message}</p>}
                 </div>
            </div>

            <Separator className="my-6 border-primary/20" />

            {/* Subscription Plans Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-primary flex items-center">
                    <CreditCard className="w-5 h-5 mr-2"/> Meus Planos Fervo Parceiro
                </h3>
                <CardDescription className="text-xs sm:text-sm">
                    Aqui você poderá gerenciar sua assinatura e acessar as funcionalidades premium do Fervo App.
                    Detalhes sobre os planos e opções de pagamento serão disponibilizados em breve.
                </CardDescription>
                <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10" disabled>
                    Gerenciar Assinatura (Em Breve)
                </Button>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base mt-6" disabled={isSubmitting}>
               {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

