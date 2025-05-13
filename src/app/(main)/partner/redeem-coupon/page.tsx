'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, collectionGroup, getDoc, orderBy, type Timestamp as FirebaseTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowLeft, Loader2, TicketCheck, AlertTriangle, History, User as UserIcon, CalendarClock, ScrollText, Trash2, Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
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
import { cn } from '@/lib/utils';


const redeemCouponSchema = z.object({
  couponCode: z.string().min(6, { message: 'Código do cupom deve ter pelo menos 6 caracteres.' }).regex(/^[A-Z0-9-]+$/, { message: 'Código do cupom inválido (somente letras maiúsculas, números e hífens).'})
});

type RedeemCouponFormInputs = z.infer<typeof redeemCouponSchema>;

interface CouponToRedeem {
  id: string;
  userId: string;
  description: string;
  couponCode: string;
  userName?: string;
  validAtPartnerId: string;
  eventName?: string;
}

interface RedeemedCouponInfo {
  id: string; // Document ID of the coupon in the user's subcollection
  userId: string; // ID of the user who owned the coupon
  couponCode: string;
  description: string;
  userName?: string;
  partnerVenueName?: string;
  redeemedAt: FirebaseTimestamp;
  eventName?: string;
}


const PartnerRedeemCouponPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemedCoupons, setRedeemedCoupons] = useState<RedeemedCouponInfo[]>([]);
  const [isLoadingRedeemedCoupons, setIsLoadingRedeemedCoupons] = useState(true);

  const [couponToDelete, setCouponToDelete] = useState<RedeemedCouponInfo | null>(null);
  const [showDeleteCouponDialog, setShowDeleteCouponDialog] = useState(false);
  const [deleteCouponPasswordInput, setDeleteCouponPasswordInput] = useState('');
  const [isDeletingCoupon, setIsDeletingCoupon] = useState(false);
  const [partnerClearPassword, setPartnerClearPassword] = useState<string | null>(null);
  const [showDeletePasswordInput, setShowDeletePasswordInput] = useState(false);


  const { control, handleSubmit, formState: { errors }, reset } = useForm<RedeemCouponFormInputs>({
    resolver: zodResolver(redeemCouponSchema),
    defaultValues: {
      couponCode: '',
    },
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Fetch partner's clear password setting
        const partnerDocRef = doc(firestore, 'users', user.uid);
        const partnerDocSnap = await getDoc(partnerDocRef);
        if (partnerDocSnap.exists()) {
          setPartnerClearPassword(partnerDocSnap.data()?.couponReportClearPassword || null);
        }
      } else {
        router.push('/login');
      }
      setIsLoadingUser(false);
    });
    return () => unsubscribeAuth();
  }, [router]);

  // Fetch redeemed coupons for the current partner
  useEffect(() => {
    if (!currentUser) {
      setIsLoadingRedeemedCoupons(false);
      return;
    }

    setIsLoadingRedeemedCoupons(true);
    const couponsQuery = query(
      collectionGroup(firestore, 'coupons'),
      where('redeemedByPartnerId', '==', currentUser.uid),
      where('status', '==', 'redeemed'),
      orderBy('redeemedAt', 'desc')
    );

    const unsubscribe = onSnapshot(couponsQuery, async (snapshot) => {
      const fetchedCoupons: RedeemedCouponInfo[] = [];
      for (const couponDoc of snapshot.docs) {
        const data = couponDoc.data();
        const userId = couponDoc.ref.parent.parent?.id; // Correctly get the user ID
        let userName = 'Usuário Desconhecido';
        if (userId) {
          try {
            const userDocRef = doc(firestore, 'users', userId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              userName = userDocSnap.data()?.name || userName;
            }
          } catch (e) {
            console.error("Failed to fetch user name for redeemed coupon:", e);
          }
        }
        fetchedCoupons.push({
          id: couponDoc.id,
          userId: userId || 'unknown_user', // Store userId
          couponCode: data.couponCode,
          description: data.description,
          userName: userName,
          partnerVenueName: data.partnerVenueName,
          redeemedAt: data.redeemedAt as FirebaseTimestamp,
          eventName: data.eventName,
        });
      }
      setRedeemedCoupons(fetchedCoupons);
      setIsLoadingRedeemedCoupons(false);
    }, (error) => {
      console.error("Error fetching redeemed coupons:", error);
      toast({ title: "Erro ao Carregar Relatório", description: "Não foi possível buscar os cupons resgatados.", variant: "destructive" });
      setIsLoadingRedeemedCoupons(false);
    });

    return () => unsubscribe();
  }, [currentUser, toast]);


  const onSubmit: SubmitHandler<RedeemCouponFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Parceiro não autenticado.", variant: "destructive" });
      return;
    }
    setIsRedeeming(true);

    const enteredCouponCode = data.couponCode.toUpperCase();

    try {
      const couponsRef = collectionGroup(firestore, 'coupons');
      const q = query(
        couponsRef,
        where('couponCode', '==', enteredCouponCode),
        where('status', '==', 'active')
      );

      const couponSnapshot = await getDocs(q);
      let foundCoupon: CouponToRedeem | null = null;
      let couponDocPath: string | null = null;

      if (!couponSnapshot.empty) {
        const couponDoc = couponSnapshot.docs[0];
        couponDocPath = couponDoc.ref.path;
        const couponData = couponDoc.data();
        const userId = couponDoc.ref.parent.parent?.id;

        if (userId && couponData.validAtPartnerId) {
           let userName = 'Usuário Desconhecido';
            try {
              const userDocRef = doc(firestore, 'users', userId);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                userName = userDocSnap.data().name || userName;
              }
            } catch (error) {
              console.error(`Failed to fetch user name for userId ${userId}:`, error);
            }

            foundCoupon = {
              id: couponDoc.id,
              userId: userId,
              description: couponData.description,
              couponCode: couponData.couponCode,
              userName: userName,
              validAtPartnerId: couponData.validAtPartnerId,
              eventName: couponData.eventName,
            };
        }
      }


      if (!foundCoupon) {
        toast({ title: "Cupom Inválido", description: "Este código de cupom não foi encontrado, já foi utilizado ou está inativo.", variant: "destructive" });
        setIsRedeeming(false);
        return;
      }

      if (foundCoupon.validAtPartnerId !== currentUser.uid) {
          toast({
              title: "Cupom Inválido Neste Local",
              description: `Este cupom (${foundCoupon.couponCode}) não é válido neste estabelecimento.`,
              variant: "destructive"
          });
          setIsRedeeming(false);
          return;
      }

      if (!couponDocPath) {
        throw new Error("Caminho do documento do cupom não encontrado.");
      }

      const userCouponDocRef = doc(firestore, couponDocPath);

      await updateDoc(userCouponDocRef, {
        status: 'redeemed',
        redeemedAt: serverTimestamp(),
        redeemedByPartnerId: currentUser.uid,
        partnerVenueName: (await getDoc(doc(firestore, 'users', currentUser.uid))).data()?.venueName || 'Local Desconhecido',
        eventName: foundCoupon.eventName,
      });

      toast({
        title: "Cupom Resgatado!",
        description: `Cupom "${foundCoupon.couponCode}" (${foundCoupon.description}) de ${foundCoupon.userName} para o evento "${foundCoupon.eventName || 'Não especificado'}" foi resgatado com sucesso.`,
        variant: "default",
        duration: 7000,
      });
      reset();

    } catch (error: any) {
      console.error("Error redeeming coupon:", error);
      toast({ title: "Erro ao Resgatar", description: error.message || "Não foi possível resgatar o cupom. Tente novamente.", variant: "destructive" });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleDeleteSingleCoupon = async () => {
    if (!currentUser || !couponToDelete) {
      toast({ title: "Erro", description: "Não foi possível identificar o cupom para exclusão.", variant: "destructive" });
      return;
    }

    if (partnerClearPassword && deleteCouponPasswordInput !== partnerClearPassword) {
      toast({ title: "Senha Incorreta", description: "A senha para apagar o relatório de cupons está incorreta.", variant: "destructive" });
      setIsDeletingCoupon(false); // Keep dialog open if password wrong
      return;
    }
    setIsDeletingCoupon(true);

    try {
      // The coupon document lives in the user's subcollection: users/{userId}/coupons/{couponId}
      const couponDocRef = doc(firestore, `users/${couponToDelete.userId}/coupons/${couponToDelete.id}`);
      await deleteDoc(couponDocRef);
      toast({ title: "Cupom Apagado", description: `O cupom ${couponToDelete.couponCode} foi apagado do histórico.`, variant: "default" });
      setShowDeleteCouponDialog(false); // Close dialog on success
      setCouponToDelete(null);
      setDeleteCouponPasswordInput(''); // Clear password input
    } catch (error: any) {
      console.error("Error deleting coupon:", error);
      toast({ title: "Erro ao Apagar", description: error.message || "Não foi possível apagar o cupom.", variant: "destructive" });
    } finally {
      setIsDeletingCoupon(false);
    }
  };


  if (isLoadingUser) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Painel
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border-primary/50 shadow-lg shadow-primary/15">
          <CardHeader className="text-center p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl text-primary flex items-center justify-center">
              <TicketCheck className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
              Resgatar Cupom de Usuário
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">
              Insira o código do cupom fornecido pelo usuário para validá-lo e marcá-lo como utilizado neste estabelecimento.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 px-4 sm:px-6">
              <div>
                <Label htmlFor="couponCode" className="text-primary/90">Código do Cupom</Label>
                <Controller
                  name="couponCode"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="couponCode"
                      placeholder="FERVO-XXXXXX"
                      {...field}
                      value={field.value.toUpperCase()}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      className={errors.couponCode ? 'border-destructive focus-visible:ring-destructive' : ''}
                      autoComplete="off"
                    />
                  )}
                />
                {errors.couponCode && <p className="mt-1 text-sm text-destructive">{errors.couponCode.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  O código é sensível a maiúsculas/minúsculas (insira como exibido pelo usuário, mas será convertido para maiúsculas para busca).
                </p>
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base" disabled={isRedeeming}>
                {isRedeeming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TicketCheck className="w-4 h-4 mr-2" />}
                {isRedeeming ? 'Verificando...' : 'Resgatar Cupom'}
              </Button>

              <div className="mt-4 p-3 bg-background/80 border border-border/50 rounded-md">
                  <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 text-accent" />
                      <div>
                          <h4 className="font-semibold text-sm text-foreground">Importante:</h4>
                          <p className="text-xs text-foreground/80">
                              Ao resgatar, o cupom será marcado como utilizado e não poderá ser usado novamente.
                              Certifique-se de que o usuário está presente, o cupom é válido <span className="font-semibold text-foreground">neste local</span>, e a recompensa está sendo entregue.
                          </p>
                      </div>
                  </div>
              </div>
            </CardContent>
          </form>
        </Card>

        <Card className="border-primary/50 shadow-lg shadow-primary/15">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl text-primary flex items-center">
              <History className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
              Relatório de Cupons Resgatados
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">
              Histórico de todos os cupons validados neste estabelecimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            {isLoadingRedeemedCoupons ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : redeemedCoupons.length === 0 ? (
              <div className="text-center py-10">
                <History className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <p className="mt-4 text-lg text-muted-foreground">Nenhum cupom resgatado ainda.</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] sm:h-[400px] pr-3">
                <div className="space-y-3">
                  {redeemedCoupons.map((coupon) => (
                    <Card key={coupon.id} className="bg-card/80 border-border/50 shadow-sm">
                      <CardContent className="p-3 sm:p-4 space-y-1.5">
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-semibold text-foreground flex-1 mr-2">{coupon.description}</p>
                            <AlertDialog open={couponToDelete?.id === coupon.id && showDeleteCouponDialog} onOpenChange={(open) => {
                                if (!open) {
                                    setCouponToDelete(null);
                                    setShowDeleteCouponDialog(false);
                                    setDeleteCouponPasswordInput('');
                                    setShowDeletePasswordInput(false); // Reset password visibility
                                }
                            }}>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:bg-destructive/10 h-7 w-7 flex-shrink-0"
                                        onClick={() => { setCouponToDelete(coupon); setShowDeleteCouponDialog(true);}}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirmar Exclusão do Histórico</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tem certeza que deseja apagar o cupom "{coupon.couponCode}" ({coupon.description}) do histórico de resgates? Esta ação não pode ser desfeita.
                                        </AlertDialogDescription>
                                        {partnerClearPassword && (
                                            <div className="pt-2 space-y-1">
                                                <Label htmlFor="deleteCouponPass" className="text-xs">Senha para Apagar do Relatório</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="deleteCouponPass"
                                                        type={showDeletePasswordInput ? "text" : "password"}
                                                        value={deleteCouponPasswordInput}
                                                        onChange={(e) => setDeleteCouponPasswordInput(e.target.value)}
                                                        placeholder="Senha configurada"
                                                        className="text-sm"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                        onClick={() => setShowDeletePasswordInput(!showDeletePasswordInput)}
                                                    >
                                                        {showDeletePasswordInput ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => {setShowDeleteCouponDialog(false); setCouponToDelete(null); setDeleteCouponPasswordInput(''); setShowDeletePasswordInput(false);}}>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleDeleteSingleCoupon}
                                            disabled={isDeletingCoupon || (!!partnerClearPassword && deleteCouponPasswordInput.length < 1)}
                                            className="bg-destructive hover:bg-destructive/90"
                                        >
                                            {isDeletingCoupon ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                            Confirmar Exclusão do Histórico
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">Código:</span> {coupon.couponCode}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center">
                          <UserIcon className="w-3 h-3 mr-1.5 text-primary/70 shrink-0" />
                          <span className="font-medium text-foreground/80">Usuário:</span> {coupon.userName}
                        </p>
                        {coupon.eventName && (
                            <p className="text-xs text-muted-foreground flex items-center">
                                <ScrollText className="w-3 h-3 mr-1.5 text-primary/70 shrink-0" />
                                <span className="font-medium text-foreground/80">Evento:</span> {coupon.eventName}
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground flex items-center">
                           <CalendarClock className="w-3 h-3 mr-1.5 text-primary/70 shrink-0" />
                           <span className="font-medium text-foreground/80">Validado em:</span> {format(coupon.redeemedAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                         {coupon.partnerVenueName && (
                            <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">Local:</span> {coupon.partnerVenueName}
                            </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PartnerRedeemCouponPage;
