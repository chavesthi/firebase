
'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, updateEmail, EmailAuthProvider, reauthenticateWithCredential, deleteUser as deleteFirebaseAuthUser } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, deleteDoc as deleteFirestoreDoc, collection, getDocs, writeBatch, query, where, collectionGroup, onSnapshot, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import Image from 'next/image';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCircle, ArrowLeft, Save, Loader2, Eye, EyeOff, CreditCard, Trash2, ExternalLink, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { STRIPE_PRICE_ID_FERVO_PARTNER_MONTHLY } from "@/lib/constants";
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
import { format as formatDate, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';


const partnerSettingsSchema = z.object({
  contactName: z.string().min(3, { message: 'Nome do contato deve ter pelo menos 3 caracteres.' }),
  companyName: z.string().min(3, { message: 'Nome da empresa deve ter pelo menos 3 caracteres.' }),
  email: z.string().email({ message: 'E-mail inválido.' }),
  notificationsEnabled: z.boolean().default(true),
  couponReportClearPassword: z.string().optional(),
  confirmCouponReportClearPassword: z.string().optional(),
}).refine(data => {
    if (data.couponReportClearPassword || data.confirmCouponReportClearPassword) {
        return data.couponReportClearPassword === data.confirmCouponReportClearPassword &&
               (data.couponReportClearPassword?.length ?? 0) >= 6;
    }
    return true;
}, {
    message: "Senhas não coincidem ou são muito curtas (mínimo 6 caracteres). Ambas devem ser preenchidas ou ambas vazias.",
    path: ["confirmCouponReportClearPassword"],
});


type PartnerSettingsFormInputs = z.infer<typeof partnerSettingsSchema>;

interface StripeSubscription {
    id: string;
    status: 'trialing' | 'active' | 'canceled' | 'incomplete' | 'past_due' | 'unpaid';
    trial_end?: Timestamp;
    current_period_end?: Timestamp;
    created: Timestamp;
}

export default function PartnerSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialEmail, setInitialEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [activeSubscription, setActiveSubscription] = useState<StripeSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [partnerCreatedAt, setPartnerCreatedAt] = useState<Timestamp | null>(null);
  const [trialEndDateString, setTrialEndDateString] = useState<string | null>(null);


  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeletePasswordInput, setShowDeletePasswordInput] = useState(false);


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
            setPartnerCreatedAt(userData.createdAt as Timestamp || null);
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

  useEffect(() => {
    if (!currentUser) {
        setLoadingSubscription(false);
        return;
    }
    setLoadingSubscription(true);
    const subscriptionsRef = collection(firestore, `customers/${currentUser.uid}/subscriptions`);
    const q = query(subscriptionsRef, where('status', 'in', ['trialing', 'active', 'past_due', 'incomplete']), orderBy('created', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const subData = snapshot.docs[0].data() as StripeSubscription;
            setActiveSubscription(subData);
        } else {
            setActiveSubscription(null);
        }
        setLoadingSubscription(false);
    }, (error) => {
        console.error("Error fetching Stripe subscription:", error);
        setActiveSubscription(null);
        setLoadingSubscription(false);
        toast({ title: "Erro ao buscar assinatura", description: "Não foi possível verificar o status da sua assinatura.", variant: "destructive"});
    });

    return () => unsubscribe();
  }, [currentUser, toast]);

  useEffect(() => {
    if (partnerCreatedAt && (!activeSubscription || (activeSubscription.status !== 'active' && activeSubscription.status !== 'trialing'))) {
      const createdAtDate = partnerCreatedAt.toDate();
      const trialEndDate = addDays(createdAtDate, 15);
      const now = new Date();
      if (now <= trialEndDate) {
        setTrialEndDateString(formatDate(trialEndDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
      } else {
        setTrialEndDateString(null);
      }
    } else {
      setTrialEndDateString(null);
    }
  }, [partnerCreatedAt, activeSubscription]);


  const handleStartSubscriptionCheckout = async () => {
    if (!currentUser) {
        toast({ title: "Login Necessário", description: "Faça login para gerenciar sua assinatura.", variant: "destructive" });
        return;
    }
    setIsSubmittingCheckout(true);
    try {
        const checkoutSessionRef = collection(firestore, `customers/${currentUser.uid}/checkout_sessions`);
        const newSessionDoc = await addDoc(checkoutSessionRef, {
            client: 'web',
            mode: 'subscription',
            price: STRIPE_PRICE_ID_FERVO_PARTNER_MONTHLY,
            success_url: window.location.origin + '/partner/dashboard?subscription_checkout=success',
            cancel_url: window.location.origin + '/partner/settings?subscription_checkout=cancelled',
        });

        const unsubscribe = onSnapshot(doc(firestore, `customers/${currentUser.uid}/checkout_sessions/${newSessionDoc.id}`),
            (snap) => {
                const data = snap.data();
                if (data?.url) {
                    unsubscribe();
                    window.location.assign(data.url);
                } else if (data?.error) {
                    unsubscribe();
                    console.error("Stripe Checkout Session Error (full object):", data.error);
                    const errorMessage = typeof data.error === 'object' && data.error.message
                                         ? data.error.message
                                         : "Falha ao criar sessão de checkout. Verifique os logs do servidor para mais detalhes.";
                    toast({ title: "Erro ao Iniciar Checkout", description: errorMessage, variant: "destructive" });
                    setIsSubmittingCheckout(false);
                }
            },
            (error) => {
                console.error("Error listening to checkout session:", error);
                toast({ title: "Erro no Checkout", description: "Ocorreu um problema ao iniciar o pagamento.", variant: "destructive" });
                setIsSubmittingCheckout(false);
            }
        );

    } catch (error) {
        console.error("Error creating checkout session document:", error);
        toast({ title: "Erro ao Preparar Pagamento", description: "Não foi possível iniciar o processo de assinatura.", variant: "destructive" });
        setIsSubmittingCheckout(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!currentUser) return;
    setIsSubmittingCheckout(true);
    try {
        const portalSessionRef = collection(firestore, `customers/${currentUser.uid}/portals`);
        const newPortalDoc = await addDoc(portalSessionRef, {
            return_url: window.location.href,
        });

        const unsubscribe = onSnapshot(doc(firestore, `customers/${currentUser.uid}/portals/${newPortalDoc.id}`),
            (snap) => {
                const data = snap.data();
                if (data?.url) {
                    unsubscribe();
                    window.location.assign(data.url);
                } else if (data?.error) {
                    unsubscribe();
                    console.error("Stripe Portal Session Error (full object):", data.error);
                    const errorMessage = typeof data.error === 'object' && data.error.message
                                        ? data.error.message
                                        : "Ocorreu um erro desconhecido ao abrir o portal.";
                    toast({ title: "Erro ao Abrir Portal", description: errorMessage, variant: "destructive" });
                    setIsSubmittingCheckout(false);
                }
            },
            (error) => {
                console.error("Error listening to portal session:", error);
                toast({ title: "Erro no Portal", description: "Ocorreu um problema ao abrir o portal de gerenciamento.", variant: "destructive" });
                setIsSubmittingCheckout(false);
            }
        );
    } catch (error) {
        console.error("Error creating portal session document:", error);
        toast({ title: "Erro ao Abrir Portal", description: "Não foi possível abrir o portal de gerenciamento.", variant: "destructive" });
        setIsSubmittingCheckout(false);
    }
  };

  const onSettingsSubmit: SubmitHandler<PartnerSettingsFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);

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
         toast({ title: "Erro na Senha", description: "As senhas do relatório não coincidem ou são muito curtas.", variant: "destructive" });
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

      const partnerIdToDelete = currentUser.uid;
      const batch = writeBatch(firestore);

      const partnerUserDocRef = doc(firestore, "users", partnerIdToDelete);
      const partnerUserSnap = await getDoc(partnerUserDocRef);
      if (partnerUserSnap.exists()) {
          const partnerData = partnerUserSnap.data();
          if (partnerData.photoURL && partnerData.photoURL.includes("firebasestorage.googleapis.com")) {
              try {
                  await deleteObject(storageRef(storage, partnerData.photoURL));
                  console.log("Partner profile picture deleted from storage.");
              } catch (e: any) {
                  if (e.code !== 'storage/object-not-found') {
                    console.warn("Old partner profile picture couldn't be deleted on account deletion:", e);
                  }
              }
          }
      }


      const eventsRef = collection(firestore, `users/${partnerIdToDelete}/events`);
      const eventsSnapshot = await getDocs(eventsRef);
      for (const eventDoc of eventsSnapshot.docs) {
        const checkInsRef = collection(firestore, `users/${partnerIdToDelete}/events/${eventDoc.id}/checkIns`);
        const checkInsSnapshot = await getDocs(checkInsRef);
        checkInsSnapshot.forEach(checkInDoc => batch.delete(checkInDoc.ref));
        batch.delete(eventDoc.ref);
      }

      const ratingsQuery = query(collectionGroup(firestore, 'eventRatings'), where('partnerId', '==', partnerIdToDelete));
      const ratingsSnapshot = await getDocs(ratingsQuery);
      ratingsSnapshot.forEach(ratingDoc => batch.delete(ratingDoc.ref));

      // purchasedTickets logic removed

      batch.delete(partnerDocRef);

      const stripeCustomerDocRef = doc(firestore, `customers/${partnerIdToDelete}`);
      const subscriptionsRef = collection(firestore, `customers/${partnerIdToDelete}/subscriptions`);
      const activeSubscriptionsSnap = await getDocs(query(subscriptionsRef, where('status', 'in', ['active', 'trialing'])));
      if (!activeSubscriptionsSnap.empty) {
          console.warn(`Partner ${partnerIdToDelete} has active Stripe subscriptions. These should be cancelled via the Stripe dashboard or an appropriate backend mechanism if the extension doesn't handle it on customer deletion.`);
      }
      // The Firebase Stripe Extension might automatically delete subscriptions when the customer doc is deleted.
      // If not, manual cancellation in Stripe Dashboard or a separate backend function would be needed.
      // For now, we proceed with deleting the customer document which might trigger the extension's cleanup.
      batch.delete(stripeCustomerDocRef);

      await batch.commit();
      toast({ title: "Dados do Firestore Excluídos", description: "Eventos, check-ins, avaliações e dados de cliente Stripe associados foram removidos.", duration: 4000 });

      const usersCollectionRef = collection(firestore, "users");
      const usersSnapshotForCleanup = await getDocs(usersCollectionRef);
      const cleanupBatch = writeBatch(firestore);

      usersSnapshotForCleanup.forEach(userDocSnap => {
        const userData = userDocSnap.data();
        const userId = userDocSnap.id;
        let userUpdateNeeded = false;
        const updates: { [key: string]: any } = {};

        if (userData.venueCoins && typeof userData.venueCoins[partnerIdToDelete] === 'number') {
          const updatedVenueCoins = { ...userData.venueCoins };
          delete updatedVenueCoins[partnerIdToDelete];
          updates.venueCoins = updatedVenueCoins;
          userUpdateNeeded = true;
        }

        if (userData.favoriteVenueIds && userData.favoriteVenueIds.includes(partnerIdToDelete)) {
          updates.favoriteVenueIds = userData.favoriteVenueIds.filter((id: string) => id !== partnerIdToDelete);
          userUpdateNeeded = true;
        }
        if (userData.favoriteVenueNotificationSettings && userData.favoriteVenueNotificationSettings[partnerIdToDelete] !== undefined) {
          const updatedSettings = { ...userData.favoriteVenueNotificationSettings };
          delete updatedSettings[partnerIdToDelete];
          updates.favoriteVenueNotificationSettings = updatedSettings;
          userUpdateNeeded = true;
        }
        if (userData.notifications && Array.isArray(userData.notifications)) {
          updates.notifications = userData.notifications.filter((n: any) => n.partnerId !== partnerIdToDelete && (!n.eventId || !eventsSnapshot.docs.some(e => e.id === n.eventId)));
          if (updates.notifications.length < userData.notifications.length) {
            userUpdateNeeded = true;
          }
        }

        if (userUpdateNeeded) {
          cleanupBatch.update(doc(firestore, "users", userId), updates);
        }
      });
      await cleanupBatch.commit();
      toast({ title: "Limpeza de Dados de Usuários Iniciada", description: "Tentando remover referências ao local dos dados dos usuários.", duration: 4000 });

      await deleteFirebaseAuthUser(currentUser);

      toast({ title: "Conta Excluída", description: "Sua conta de parceiro e dados associados foram excluídos. A limpeza completa de dados de outros usuários pode levar algum tempo ou requerer processos de backend.", variant: "default", duration: 9000 });
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



  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
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
          <CardTitle className="text-2xl sm:text-3xl text-foreground">Configurações da Conta e Pagamentos</CardTitle>
          <CardDescription className="text-sm sm:text-base text-muted-foreground">Gerencie as informações e preferências da sua conta de parceiro.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSettingsSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-primary rounded-full flex items-center justify-center bg-muted">
                {currentUser?.photoURL ? (
                    <Image src={currentUser.photoURL} alt={watchedName || "Foto do Parceiro"} width={96} height={96} className="rounded-full object-cover w-full h-full" data-ai-hint="partner avatar"/>
                ) : watchedName ? (
                  <span className="text-2xl sm:text-3xl text-primary font-semibold">
                    {watchedName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-primary" />
                )}
              </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName" className="text-foreground">Nome do Contato</Label>
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
                  <Label htmlFor="companyName" className="text-foreground">Nome da Empresa/Estabelecimento</Label>
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
                  <Label htmlFor="email" className="text-foreground">E-mail de Login</Label>
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
                  <Label htmlFor="notificationsEnabled" className="text-foreground text-sm sm:text-base">Receber Notificações por E-mail</Label>
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

            <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">Senha para Limpar Relatório de Cupons</h3>
                <p className="text-xs text-muted-foreground">Defina uma senha (mínimo 6 caracteres) que será solicitada para limpar o histórico de cupons resgatados. Deixe em branco se não desejar definir/alterar.</p>

                 <div className="space-y-2">
                    <Label htmlFor="couponReportClearPassword" className="text-foreground">Nova Senha</Label>
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
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </Button>
                    </div>
                    {errors.couponReportClearPassword && <p className="mt-1 text-sm text-destructive">{errors.couponReportClearPassword.message}</p>}
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="confirmCouponReportClearPassword" className="text-foreground">Confirmar Nova Senha</Label>
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
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            aria-label={showConfirmPassword ? "Esconder confirmação de senha" : "Mostrar confirmação de senha"}
                        >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </Button>
                    </div>
                    {errors.confirmCouponReportClearPassword && <p className="mt-1 text-sm text-destructive">{errors.confirmCouponReportClearPassword.message}</p>}
                 </div>
            </div>
          </CardContent>
          <CardFooter className="p-4 sm:p-6">
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base" disabled={isSubmitting || isDeletingAccount}>
               {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
            </Button>
          </CardFooter>
        </form>

        <CardContent className="space-y-6 p-4 sm:p-6">
            <Separator className="border-primary/20" />

             <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground flex items-center">
                    <CreditCard className="w-5 h-5 mr-2"/> Meus Planos Fervo Parceiro
                </h3>
                <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                    Assine o Fervo App para ter acesso a todas as funcionalidades premium e destacar seu estabelecimento!
                </CardDescription>

                {trialEndDateString && (
                  <div className="p-3 border rounded-md bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 flex items-center">
                    <Info className="w-5 h-5 mr-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Seu período de teste gratuito termina em: <span className="font-semibold">{trialEndDateString}</span>.
                    </p>
                  </div>
                )}

                {loadingSubscription && (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="w-6 h-6 mr-2 animate-spin text-primary" />
                        <p className="text-muted-foreground">Verificando status da assinatura...</p>
                    </div>
                )}

                {!loadingSubscription && activeSubscription && (activeSubscription.status === 'active' || activeSubscription.status === 'trialing') && (
                    <div className="p-4 border rounded-md bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
                        <p className="text-green-700 dark:text-green-400 font-semibold">
                            Plano {activeSubscription.status === 'trialing' ? 'de Teste ' : ''}Ativo!
                        </p>
                        {activeSubscription.trial_end && activeSubscription.status === 'trialing' && (
                            <p className="text-xs text-muted-foreground">Seu teste termina em: {new Date(activeSubscription.trial_end.seconds * 1000).toLocaleDateString()}</p>
                        )}
                        {activeSubscription.current_period_end && activeSubscription.status === 'active' && (
                             <p className="text-xs text-muted-foreground">Próxima renovação em: {new Date(activeSubscription.current_period_end.seconds * 1000).toLocaleDateString()}</p>
                        )}
                        <Button
                            onClick={handleManageSubscription}
                            variant="outline"
                            className="w-full mt-3 border-primary text-primary hover:bg-primary/10"
                            disabled={isSubmittingCheckout}
                        >
                            {isSubmittingCheckout ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                            Gerenciar Assinatura
                        </Button>
                    </div>
                )}
                 {!loadingSubscription && (!activeSubscription || (activeSubscription.status !== 'active' && activeSubscription.status !== 'trialing')) && (
                    <Button
                        onClick={handleStartSubscriptionCheckout}
                        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                        disabled={isSubmittingCheckout}
                    >
                        {isSubmittingCheckout ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Assinar Plano Fervo (R$ 69,90 por mês)
                    </Button>
                )}

                <div className="mt-2 flex justify-center">
                    <Image
                        src="/images/stripe.png"
                        alt="Pagamentos processados por Stripe"
                        width={300}
                        height={120}
                        data-ai-hint="payment gateway logo"
                    />
                </div>
                 <p className="text-xs text-center text-muted-foreground mt-2">
                    Pagamentos processados de forma segura pelo Stripe.
                </p>

            </div>

            <Separator className="border-primary/20" />

            <div className="space-y-2">
                <h3 className="text-lg font-medium text-destructive">Excluir Conta</h3>
                <p className="text-sm text-muted-foreground">
                    Esta ação é permanente e não pode ser desfeita. Todos os seus dados de parceiro, incluindo eventos e configurações, serão removidos.
                    As FervoCoins que usuários possuem no seu local serão redistribuídas para outros locais.
                    Notificações sobre seu local ou eventos serão removidas dos usuários.
                </p>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto" disabled={isSubmitting || isDeletingAccount}>
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir Minha Conta de Parceiro
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle className="text-destructive">Excluir Conta de Parceiro Permanentemente?</AlertDialogTitle><AlertDialogDescription>Esta ação é irreversível. Todos os seus dados como parceiro serão removidos. As FervoCoins associadas ao seu local serão redistribuídas para os usuários. Notificações sobre seu local ou eventos serão removidas dos usuários. Para continuar, por favor, insira sua senha.</AlertDialogDescription></AlertDialogHeader>
                        <div className="space-y-2 py-2"><Label htmlFor="deletePartnerPassword">Senha</Label><div className="relative"><Input id="deletePartnerPassword" type={showDeletePasswordInput ? "text" : "password"} value={deletePasswordInput} onChange={(e) => setDeletePasswordInput(e.target.value)} placeholder="Sua senha atual" className={cn(deletePasswordInput.length > 0 && deletePasswordInput.length < 6 && 'border-yellow-500')} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-primary" onClick={() => setShowDeletePasswordInput(!showDeletePasswordInput)} aria-label={showDeletePasswordInput ? "Esconder senha" : "Mostrar senha"}>{showDeletePasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}</Button></div>{deletePasswordInput.length > 0 && deletePasswordInput.length < 6 && (<p className="text-xs text-yellow-600">A senha deve ter pelo menos 6 caracteres.</p>)}</div>
                        <AlertDialogFooter><AlertDialogCancel onClick={() => { setDeletePasswordInput(''); setShowDeletePasswordInput(false);}}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteAccount} disabled={isDeletingAccount || deletePasswordInput.length < 6} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">{isDeletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Confirmar Exclusão da Conta</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
