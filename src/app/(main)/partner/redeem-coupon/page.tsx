

'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, collectionGroup, getDoc } from 'firebase/firestore'; // Added collectionGroup, getDoc
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, TicketCheck, AlertTriangle } from 'lucide-react';

const redeemCouponSchema = z.object({
  couponCode: z.string().min(6, { message: 'Código do cupom deve ter pelo menos 6 caracteres.' }).regex(/^[A-Z0-9-]+$/, { message: 'Código do cupom inválido (somente letras maiúsculas, números e hífens).'})
});

type RedeemCouponFormInputs = z.infer<typeof redeemCouponSchema>;

interface CouponToRedeem {
  id: string; // Document ID of the coupon in the user's subcollection
  userId: string; // ID of the user who owns the coupon
  description: string;
  couponCode: string;
  userName?: string; // Name of the user for display after redemption
  validAtPartnerId: string; // Partner ID where the coupon is valid
}

const PartnerRedeemCouponPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);

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

  const onSubmit: SubmitHandler<RedeemCouponFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Parceiro não autenticado.", variant: "destructive" });
      return;
    }
    setIsRedeeming(true);

    const enteredCouponCode = data.couponCode.toUpperCase();

    try {
      // Use collection group query to find the coupon across all users.
      const couponsRef = collectionGroup(firestore, 'coupons');
      const q = query(
        couponsRef,
        where('couponCode', '==', enteredCouponCode),
        where('status', '==', 'active')
      );

      const couponSnapshot = await getDocs(q);
      let foundCoupon: CouponToRedeem | null = null;

      if (!couponSnapshot.empty) {
        const couponDoc = couponSnapshot.docs[0];
        const couponData = couponDoc.data();
        const userId = couponDoc.ref.parent.parent?.id;

        if (userId && couponData.validAtPartnerId) { // Check if validAtPartnerId exists
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
              id: couponDoc.id,
              userId: userId,
              description: couponData.description,
              couponCode: couponData.couponCode,
              userName: userName,
              validAtPartnerId: couponData.validAtPartnerId, // Store validAtPartnerId
            };
        } else {
            if (!userId) console.error("Could not extract userId from coupon path:", couponDoc.ref.path);
            if (!couponData.validAtPartnerId) console.error("Coupon missing validAtPartnerId field:", couponDoc.id);
            // Don't throw error here, let the !foundCoupon check handle it
        }
      }

      if (!foundCoupon) {
        toast({ title: "Cupom Inválido", description: "Este código de cupom não foi encontrado, já foi utilizado ou está inativo.", variant: "destructive" });
        setIsRedeeming(false);
        return;
      }

      // *** Check if the coupon is valid at THIS partner's venue ***
      if (foundCoupon.validAtPartnerId !== currentUser.uid) {
          toast({
              title: "Cupom Inválido Neste Local",
              description: `Este cupom (${foundCoupon.couponCode}) não é válido neste estabelecimento.`,
              variant: "destructive"
          });
          setIsRedeeming(false);
          return;
      }

      // Proceed to redeem (coupon is valid and active at this location)
      const userCouponDocRef = doc(firestore, `users/${foundCoupon.userId}/coupons/${foundCoupon.id}`);

      await updateDoc(userCouponDocRef, {
        status: 'redeemed',
        redeemedAt: serverTimestamp(),
        redeemedByPartnerId: currentUser.uid, // Store which partner redeemed it
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
        <Loader2 className="w-12 h-12 text-foreground animate-spin" />
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

      <Card className="max-w-lg mx-auto border-primary/50 shadow-lg shadow-primary/15">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-foreground flex items-center justify-center">
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
              <Label htmlFor="couponCode" className="text-foreground/90">Código do Cupom</Label>
              <Controller
                name="couponCode"
                control={control}
                render={({ field }) => (
                  <Input
                    id="couponCode"
                    placeholder="FERVO-XXXXXX"
                    {...field}
                    value={field.value.toUpperCase()} // Force uppercase display
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())} // Store as uppercase
                    className={errors.couponCode ? 'border-red-500 focus-visible:ring-red-500' : ''}
                    autoComplete="off"
                  />
                )}
              />
              {errors.couponCode && <p className="mt-1 text-sm text-red-500">{errors.couponCode.message}</p>}
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
                        <h4 className="font-semibold text-sm">Importante:</h4>
                        <p className="text-xs">
                            Ao resgatar, o cupom será marcado como utilizado e não poderá ser usado novamente.
                            Certifique-se de que o usuário está presente, o cupom é válido <span className="font-semibold">neste local</span>, e a recompensa está sendo entregue.
                        </p>
                    </div>
                </div>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};

export default PartnerRedeemCouponPage;

