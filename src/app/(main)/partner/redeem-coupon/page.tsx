
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, collectionGroup, getDoc, orderBy, type Timestamp as FirebaseTimestamp, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowLeft, Loader2, TicketCheck, AlertTriangle, History, User as UserIcon, CalendarClock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';

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
}

interface RedeemedCouponInfo {
  id: string;
  couponCode: string;
  description: string;
  userName?: string;
  partnerVenueName?: string; // Added to display which venue the coupon was for
  redeemedAt: FirebaseTimestamp;
}


const PartnerRedeemCouponPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemedCoupons, setRedeemedCoupons] = useState<RedeemedCouponInfo[]>([]);
  const [isLoadingRedeemedCoupons, setIsLoadingRedeemedCoupons] = useState(true);


  const { control, handleSubmit, formState: { errors }, reset } = useForm<RedeemCouponFormInputs>({
    resolver: zodResolver(redeemCouponSchema),
    defaultValues: {
      couponCode: '',
    },
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
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
        let userName = 'Usuário Desconhecido';
        if (data.userId) {
          try {
            const userDocRef = doc(firestore, 'users', data.userId);
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
          couponCode: data.couponCode,
          description: data.description,
          userName: userName,
          partnerVenueName: data.partnerVenueName,
          redeemedAt: data.redeemedAt as FirebaseTimestamp,
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
      let couponDocPath: string | null = null; // Store the full path to the coupon document

      if (!couponSnapshot.empty) {
        const couponDoc = couponSnapshot.docs[0];
        couponDocPath = couponDoc.ref.path; // Get the full path
        const couponData = couponDoc.data();
        const userId = couponDoc.ref.parent.parent?.id; // Correctly get userId from parent path

        if (userId && couponData.validAtPartnerId) {
           let userName = 'Usuário Desconhecido';
            try {
              const userDocRef = doc(firestore, 'users', userId);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                userName = userDoc.data().name || userName;
              }
            } catch (error) {
              console.error(`Failed to fetch user name for userId ${userId}:`, error);
            }

            foundCoupon = {
              id: couponDoc.id, // This is the coupon's document ID within its subcollection
              userId: userId,
              description: couponData.description,
              couponCode: couponData.couponCode,
              userName: userName,
              validAtPartnerId: couponData.validAtPartnerId,
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

      if (!couponDocPath) { // Should not happen if foundCoupon is true, but as a safeguard
        throw new Error("Caminho do documento do cupom não encontrado.");
      }
      
      const userCouponDocRef = doc(firestore, couponDocPath); // Use the full path to reference the coupon

      await updateDoc(userCouponDocRef, {
        status: 'redeemed',
        redeemedAt: serverTimestamp(),
        redeemedByPartnerId: currentUser.uid,
        partnerVenueName: (await getDoc(doc(firestore, 'users', currentUser.uid))).data()?.venueName || 'Local Desconhecido', // Store partner venue name
      });

      toast({
        title: "Cupom Resgatado!",
        description: `Cupom "${foundCoupon.couponCode}" (${foundCoupon.description}) de ${foundCoupon.userName} foi resgatado com sucesso.`,
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
            <CardDescription className="text-xs sm:text-sm">
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
                      className={errors.couponCode ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      autoComplete="off"
                    />
                  )}
                />
                {errors.couponCode && <p className="mt-1 text-sm text-destructive">{errors.couponCode.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  O código é sensível a maiúsculas/minúsculas (insira como exibido pelo usuário).
                </p>
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base" disabled={isRedeeming}>
                {isRedeeming ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TicketCheck className="w-4 h-4 mr-2" />}
                {isRedeeming ? 'Verificando...' : 'Resgatar Cupom'}
              </Button>

              <div className="mt-4 p-3 bg-accent/10 border border-accent/30 rounded-md text-accent-foreground">
                  <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 text-accent" />
                      <div>
                          <h4 className="font-semibold text-sm text-accent-foreground">Importante:</h4>
                          <p className="text-xs text-accent-foreground/80">
                              Ao resgatar, o cupom será marcado como utilizado e não poderá ser usado novamente.
                              Certifique-se de que o usuário está presente, o cupom é válido <span className="font-semibold">neste local</span>, e a recompensa está sendo entregue.
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
            <CardDescription className="text-xs sm:text-sm">
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
                        <p className="text-sm font-semibold text-foreground">{coupon.description}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">Código:</span> {coupon.couponCode}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center">
                          <UserIcon className="w-3 h-3 mr-1.5 text-primary/70 shrink-0" /> 
                          <span className="font-medium text-foreground/80">Usuário:</span> {coupon.userName}
                        </p>
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
           {/* TODO: Add "Clear Report" button and functionality later if password for clearing is implemented */}
        </Card>
      </div>
    </div>
  );
};

export default PartnerRedeemCouponPage;

