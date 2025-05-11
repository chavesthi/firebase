
'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, updateEmail, EmailAuthProvider, reauthenticateWithCredential, deleteUser as deleteFirebaseAuthUser } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, deleteDoc as deleteFirestoreDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { loadStripe } from "@stripe/stripe-js";
import { QRCodeCanvas } from 'qrcode.react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCircle, ArrowLeft, Save, Loader2, Eye, EyeOff, CreditCard, Trash2, Copy, Download, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { STRIPE_PUBLIC_KEY, APP_URL } from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle as QrDialogTitle, // Renamed to avoid conflict with AlertDialogTitle
  DialogDescription as QrDialogDescription, // Renamed
  DialogFooter as QrDialogFooter, // Renamed
} from '@/components/ui/dialog'; // Assuming you have a Dialog component


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
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeletePasswordInput, setShowDeletePasswordInput] = useState(false);
  
  const [showPixQrDialog, setShowPixQrDialog] = useState(false);
  const [qrValue, setQrValue] = useState('');


  const { control, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<PartnerSettingsFormInputs>({
    resolver: zodResolver(partnerSettingsSchema),
    defaultValues: {
      contactName: '',
      companyName: '',
      email: '',
      notificationsEnabled: true,
      couponReportClearPassword: '',
      confirmCouponReportClearPassword: '',
    },
  });

  const watchedName = watch('contactName');

  // Fetch current user and settings
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setInitialEmail(user.email);
        const userDocRef = doc(firestore, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            reset({
              contactName: userData.name || user.displayName || '',
              companyName: userData.venueName || '',
              email: user.email || '',
              notificationsEnabled: userData.notificationsEnabled ?? true,
              couponReportClearPassword: '',
              confirmCouponReportClearPassword: '',
            });
            setHasActiveSubscription(userData.stripeSubscriptionActive || false);
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

      const dataToUpdate: { [key: string]: any } = {
        name: data.contactName,
        venueName: data.companyName, // Assuming company name is venueName for partners
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

  const handlePixCheckout = () => {
    // Simplified PIX QR Code generation logic (example for demonstration)
    // In a real scenario, this would involve calling a PIX generation API
    // and receiving a payload (e.g., BRCode) to render as QR.
    // This example uses a static payload for demonstration.
    // Replace with your actual PIX key and a correctly formatted BRCode payload.
    const pixKey = "01791938132"; // Example CPF as PIX key
    const amount = "2.00"; // Example amount
    const merchantName = "Fervo App"; // Your merchant name
    const merchantCity = "SAO PAULO"; // Your merchant city

    // This is a VERY simplified example and likely NOT a valid BRCode.
    // You need to use a library or service to generate a compliant BRCode.
    const brCodePayload = `00020126580014BR.GOV.BCB.PIX0111${pixKey.replace(/\D/g, '')}5204000053039865404${amount.replace('.', '')}5802BR59${merchantName.length < 10 ? `0${merchantName.length}` : merchantName.length}${merchantName}60${merchantCity.length < 10 ? `0${merchantCity.length}` : merchantCity.length}${merchantCity}62070503***6304`;
    
    setQrValue(brCodePayload);
    setShowPixQrDialog(true);
    setIsSubmittingCheckout(false); // Reset as this is a different flow
  };


  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("session_id")) {
      toast({
        title: "Pagamento Processado",
        description: "Seu pagamento está sendo processado. O status da sua assinatura será atualizado em breve.",
        variant: "default",
        duration: 7000,
      });
      router.replace('/partner/settings', { scroll: false });
    }
     if (query.get("canceled")) {
      toast({
        title: "Pagamento Cancelado",
        description: "O processo de assinatura foi cancelado. Você pode tentar novamente quando desejar.",
        variant: "default",
      });
      router.replace('/partner/settings', { scroll: false });
    }
  }, [router, toast]);

  const handleDeleteAccount = async () => {
    if (!currentUser || !currentUser.email) {
      toast({ title: "Erro", description: "Parceiro não autenticado corretamente.", variant: "destructive" });
      return;
    }
    if (!deletePasswordInput) {
      toast({ title: "Senha Necessária", description: "Por favor, insira sua senha para excluir a conta.", variant: "destructive" });
      return;
    }

    setIsDeletingAccount(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, deletePasswordInput);
      await reauthenticateWithCredential(currentUser, credential);

      // --- FervoCoin Redistribution Logic ---
      // WARNING: This operation can be very slow and costly on large user bases.
      // It reads ALL user documents. Consider a server-side Cloud Function for production.
      const partnerIdToDelete = currentUser.uid;
      const usersCollectionRef = collection(firestore, "users");
      const usersSnapshot = await getDocs(usersCollectionRef);
      const batch = writeBatch(firestore);

      usersSnapshot.forEach(userDocSnap => {
        const userData = userDocSnap.data();
        const userSpecificVenueCoins = userData.venueCoins;

        if (userSpecificVenueCoins && typeof userSpecificVenueCoins[partnerIdToDelete] === 'number' && userSpecificVenueCoins[partnerIdToDelete] > 0) {
          const coinsToRedistribute = userSpecificVenueCoins[partnerIdToDelete];
          const updatedVenueCoins = { ...userSpecificVenueCoins };
          delete updatedVenueCoins[partnerIdToDelete]; // Remove coins from deleted partner

          const remainingVenueIds = Object.keys(updatedVenueCoins).filter(id => typeof updatedVenueCoins[id] === 'number' && updatedVenueCoins[id] >= 0 && updatedVenueCoins[id] > 0);

          if (remainingVenueIds.length > 0) {
            // Simple redistribution: add all to the first remaining venue with existing coins.
            // A more complex strategy (e.g., proportional) could be implemented here.
            const primaryRecipientId = remainingVenueIds[0]; // Could be improved (e.g. largest existing coin balance)
            updatedVenueCoins[primaryRecipientId] = (updatedVenueCoins[primaryRecipientId] || 0) + coinsToRedistribute;
            console.log(`Redistributed ${coinsToRedistribute} coins from ${partnerIdToDelete} to ${primaryRecipientId} for user ${userDocSnap.id}`);
          } else {
            // No other venues for this user to redistribute to. Coins are "lost" or could be moved to a general pool.
            console.log(`User ${userDocSnap.id} had ${coinsToRedistribute} coins for ${partnerIdToDelete} but no other venues to redistribute to.`);
          }
          batch.update(doc(firestore, "users", userDocSnap.id), { venueCoins: updatedVenueCoins });
        }
      });
      await batch.commit();
      toast({ title: "Redistribuição de Moedas", description: "Moedas de usuários foram reatribuídas a outros locais.", duration: 4000 });
      // --- End FervoCoin Redistribution Logic ---

      const partnerDocRef = doc(firestore, "users", currentUser.uid);
      await deleteFirestoreDoc(partnerDocRef);

      await deleteFirebaseAuthUser(currentUser);

      toast({ title: "Conta Excluída", description: "Sua conta de parceiro e dados foram excluídos.", variant: "default", duration: 7000 });
      router.push('/login');
      setShowDeleteDialog(false);
    } catch (error: any) {
      console.error("Error deleting partner account:", error);
      let message = "Erro ao excluir conta.";
      if (error.code === 'auth/wrong-password') {
        message = "Senha incorreta. Por favor, tente novamente.";
      } else if (error.code === 'auth/requires-recent-login') {
        message = "Esta operação é sensível e requer autenticação recente. Por favor, faça login novamente e tente excluir sua conta.";
      }
      toast({ title: "Falha ao Excluir Conta", description: message, variant: "destructive" });
    } finally {
      setIsDeletingAccount(false);
      setDeletePasswordInput('');
    }
  };
  
  const handlePrintQr = () => {
    const canvas = document.getElementById('pix-qr-code-canvas') as HTMLCanvasElement;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      let windowContent = '<!DOCTYPE html>';
      windowContent += '<html><head><title>Print QR Code</title></head><body>';
      windowContent += '<img src="' + dataUrl + '" style="max-width:90vw; max-height:90vh; display:block; margin:auto;">';
      windowContent += '</body></html>';
      const printWin = window.open('', '', 'width=600,height=600');
      printWin?.document.open();
      printWin?.document.write(windowContent);
      printWin?.document.close();
      printWin?.focus();
      printWin?.print();
      printWin?.close();
    }
  };

  const handleDownloadQr = () => {
    const canvas = document.getElementById('pix-qr-code-canvas') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `fervo-app-pix-pagamento.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      toast({ title: "Download Iniciado", description: "O QR Code PIX está sendo baixado." });
    }
  };


  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-foreground animate-spin" />
        <p className="ml-4 text-lg text-foreground">Carregando configurações...</p>
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
          <CardTitle className="text-2xl sm:text-3xl text-foreground">Configurações da Conta</CardTitle>
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
                  <Label htmlFor="contactName" className="text-foreground/90">Nome do Contato</Label>
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
                  <Label htmlFor="companyName" className="text-foreground/90">Nome da Empresa/Estabelecimento</Label>
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
                  <Label htmlFor="email" className="text-foreground/90">E-mail de Login</Label>
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
                  <Label htmlFor="notificationsEnabled" className="text-foreground/90 text-sm sm:text-base">Receber Notificações por E-mail</Label>
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
                <h3 className="text-lg font-medium text-foreground">Senha para Limpar Relatório de Cupons</h3>
                <p className="text-xs text-muted-foreground">Defina uma senha (mínimo 6 caracteres) que será solicitada para limpar o histórico de cupons resgatados. Deixe em branco se não desejar definir/alterar.</p>

                 <div className="space-y-2">
                    <Label htmlFor="couponReportClearPassword" className="text-foreground/90">Nova Senha</Label>
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
                    <Label htmlFor="confirmCouponReportClearPassword" className="text-foreground/90">Confirmar Nova Senha</Label>
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
                <h3 className="text-lg font-medium text-foreground flex items-center">
                    <CreditCard className="w-5 h-5 mr-2"/> Meus Planos Fervo Parceiro
                </h3>
                {hasActiveSubscription ? (
                    <div className="p-4 bg-green-100 dark:bg-green-900/30 border border-green-500 rounded-md">
                        <p className="font-semibold text-green-700 dark:text-green-400">Você tem uma assinatura ativa!</p>
                        <p className="text-sm text-muted-foreground">Detalhes da sua assinatura e opções de gerenciamento em breve.</p>
                        {/* Add link to Stripe Customer Portal if configured */}
                    </div>
                ) : (
                    <>
                        <CardDescription className="text-xs sm:text-sm">
                            Assine o Fervo App para ter acesso a todas as funcionalidades premium e destacar seu estabelecimento!
                            Valor mensal: R$ 2,00.
                        </CardDescription>
                        <Button
                            onClick={handlePixCheckout}
                            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                            disabled={isSubmittingCheckout}
                            type="button" 
                        >
                            {isSubmittingCheckout ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Assinar Plano Fervo (PIX)
                        </Button>
                    </>
                )}
            </div>


            <Separator className="my-6 border-primary/20" />

            {/* Account Deletion Section */}
            <div className="space-y-2">
                <h3 className="text-lg font-medium text-destructive">Excluir Conta</h3>
                <p className="text-sm text-muted-foreground">
                    Esta ação é permanente e não pode ser desfeita. Todos os seus dados de parceiro, incluindo eventos e configurações, serão removidos.
                    As FervoCoins que usuários possuem no seu local serão redistribuídas para outros locais.
                </p>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto">
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir Minha Conta de Parceiro
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">Excluir Conta de Parceiro Permanentemente?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação é irreversível. Todos os seus dados como parceiro serão removidos.
                            As FervoCoins associadas ao seu local serão redistribuídas para os usuários.
                            Para continuar, por favor, insira sua senha.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2 py-2">
                            <Label htmlFor="deletePartnerPassword">Senha</Label>
                            <div className="relative">
                                <Input
                                    id="deletePartnerPassword"
                                    type={showDeletePasswordInput ? "text" : "password"}
                                    value={deletePasswordInput}
                                    onChange={(e) => setDeletePasswordInput(e.target.value)}
                                    placeholder="Sua senha atual"
                                    className={cn(deletePasswordInput.length > 0 && deletePasswordInput.length < 6 && 'border-yellow-500')}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowDeletePasswordInput(!showDeletePasswordInput)}
                                    aria-label={showDeletePasswordInput ? "Esconder senha" : "Mostrar senha"}
                                >
                                    {showDeletePasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                                </Button>
                            </div>
                            {deletePasswordInput.length > 0 && deletePasswordInput.length < 6 && (
                                <p className="text-xs text-yellow-600">A senha deve ter pelo menos 6 caracteres.</p>
                            )}
                        </div>
                        <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setDeletePasswordInput(''); setShowDeletePasswordInput(false);}}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteAccount}
                            disabled={isDeletingAccount || deletePasswordInput.length < 6}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {isDeletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Confirmar Exclusão da Conta
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>


            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base mt-6" disabled={isSubmitting || isSubmittingCheckout || isDeletingAccount}>
               {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
            </Button>
          </CardContent>
        </form>
      </Card>
      
      <Dialog open={showPixQrDialog} onOpenChange={setShowPixQrDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <QrDialogTitle className="text-foreground">Pagamento via PIX - R$ 2,00</QrDialogTitle>
            <QrDialogDescription>
              Escaneie o QR Code abaixo com o aplicativo do seu banco para realizar o pagamento.
            </QrDialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <QRCodeCanvas 
                id="pix-qr-code-canvas"
                value={qrValue} 
                size={256} 
                level="M"
                imageSettings={{
                    src: "/fervo_icon.png", 
                    height: 38, // approx 15% of 256
                    width: 38,  // approx 15% of 256
                    excavate: true,
                }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground px-4">
             <p><strong>Chave PIX (CPF):</strong> 017.919.381-32</p>
             <p><strong>Valor:</strong> R$ 2,00</p>
             <p>Após o pagamento, sua assinatura será ativada em alguns instantes.</p>
             <p className="mt-2 font-semibold">Este QR Code é apenas um exemplo. Uma implementação real requer a geração de um BRCode válido por um sistema de pagamentos PIX.</p>
          </div>
          <QrDialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handlePrintQr} className="w-full sm:w-auto">
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </Button>
            <Button variant="outline" onClick={handleDownloadQr} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" /> Baixar QR
            </Button>
            <Button onClick={() => setShowPixQrDialog(false)} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">Fechar</Button>
          </QrDialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
