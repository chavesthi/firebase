
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { collectionGroup, query, where, orderBy, Timestamp as FirebaseTimestamp, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { ArrowLeft, Loader2, ScrollText, Trash2 } from 'lucide-react'; // Added Trash2 for future use
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RedeemedCoupon {
  id: string; // coupon document id
  userId: string;
  userName: string; // Added this field
  couponCode: string;
  description: string;
  redeemedAt: FirebaseTimestamp;
}

const PartnerCouponReportPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redeemedCoupons, setRedeemedCoupons] = useState<RedeemedCoupon[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [isClearing, setIsClearing] = useState(false);


  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false); // Stop loading if user is not available
      return;
    }

    setIsLoading(true);
    const couponsRef = collectionGroup(firestore, 'coupons');
    const q = query(
      couponsRef,
      where('status', '==', 'redeemed'),
      where('redeemedByPartnerId', '==', currentUser.uid),
      orderBy('redeemedAt', 'desc')
    );

    const unsubscribeCoupons = onSnapshot(q, async (snapshot) => {
      const fetchedCoupons: RedeemedCoupon[] = [];

      // Fetch user names for each coupon - This can be inefficient for many coupons
      // Consider storing userName denormalized on the coupon upon redemption if performance becomes an issue.
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let userName = 'Usuário Desconhecido';
        try {
          const userDocRef = doc(firestore, 'users', data.userId);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            userName = userDoc.data().name || userName;
          }
        } catch (error) {
          console.error(`Failed to fetch user name for userId ${data.userId}:`, error);
        }

        fetchedCoupons.push({
          id: docSnap.id,
          userId: data.userId,
          userName: userName,
          couponCode: data.couponCode,
          description: data.description,
          redeemedAt: data.redeemedAt as FirebaseTimestamp,
        });
      }
      setRedeemedCoupons(fetchedCoupons);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching redeemed coupons:", error);
      toast({ title: "Erro ao Carregar Relatório", description: "Não foi possível buscar os cupons resgatados.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribeCoupons();
  }, [currentUser, toast]);


  // Placeholder for Clear Report functionality
  const handleClearReport = async () => {
      // **Important:** This functionality is complex due to security (re-auth)
      // and deciding *what* to delete (user data vs. partner view).
      // Deleting user coupon data is generally not recommended from the partner side.
      // A safer approach might involve marking coupons as 'cleared_by_partner'
      // or having a separate partner-specific redemption log.

      // For now, just show a message that it's not implemented.
      toast({
          title: "Funcionalidade Indisponível",
          description: "A limpeza do relatório de cupons ainda não está implementada.",
          variant: "default",
          duration: 5000,
      });
      setShowClearConfirm(false); // Close the dialog if it were open
      setPassword(''); // Clear password field
      // setIsClearing(true); // Keep button disabled if needed for visual feedback

      // --- Future Implementation Notes ---
      // 1. Get current user's email for re-authentication.
      // 2. Use `EmailAuthProvider.credential(email, password)`
      // 3. Use `reauthenticateWithCredential(auth.currentUser, credential)`
      // 4. If successful:
      //    a. Query the coupons again (as in useEffect).
      //    b. Create a WriteBatch.
      //    c. Iterate through fetched coupons and add `batch.delete(doc(firestore, `users/${coupon.userId}/coupons/${coupon.id}`))` (RISKY)
      //       OR `batch.update(docRef, { partnerClearedAt: serverTimestamp() })` (SAFER)
      //    d. `await batch.commit()`
      // 5. Handle errors for re-authentication and batch write.
      // 6. Reset state, show success toast.
      // 7. setIsClearing(false);
  };


  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Painel
        </Button>
      </div>

      <Card className="border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-destructive flex items-center">
            <ScrollText className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Relatório de Cupons Resgatados
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Aqui está o histórico de cupons de usuários que foram resgatados no seu estabelecimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0"> {/* Remove padding for full-width table */}
          {isLoading ? (
            <div className="flex justify-center items-center h-60">
              <Loader2 className="w-10 h-10 text-destructive animate-spin" />
            </div>
          ) : redeemedCoupons.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">Nenhum cupom foi resgatado ainda.</p>
          ) : (
            <ScrollArea className="h-[calc(100vh-22rem)] sm:h-[calc(100vh-24rem)]"> {/* Adjust height */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-destructive/90">Usuário</TableHead>
                    <TableHead className="text-destructive/90">Cupom</TableHead>
                    <TableHead className="text-destructive/90">Descrição</TableHead>
                    <TableHead className="text-destructive/90 text-right">Data Resgate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redeemedCoupons.map((coupon) => (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-medium">{coupon.userName}</TableCell>
                      <TableCell>{coupon.couponCode}</TableCell>
                      <TableCell>{coupon.description}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {format(coupon.redeemedAt.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
         {redeemedCoupons.length > 0 && (
          <CardFooter className="p-4 sm:p-6 border-t border-destructive/20 justify-end">
            {/* AlertDialog Trigger */}
             <AlertDialog>
               <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled /* Disable delete for now */ >
                      <Trash2 className="w-4 h-4 mr-2" /> Limpar Relatório (Indisponível)
                  </Button>
               </AlertDialogTrigger>
               <AlertDialogContent>
                 <AlertDialogHeader>
                   <AlertDialogTitle>Confirmar Limpeza do Relatório</AlertDialogTitle>
                   <AlertDialogDescription>
                     Esta ação <span className="font-bold">excluirá permanentemente</span> todos os registros de cupons resgatados deste relatório. Esta ação não pode ser desfeita. Por favor, insira sua senha para confirmar.
                   </AlertDialogDescription>
                 </AlertDialogHeader>
                 <div className="space-y-2">
                   <Label htmlFor="password">Senha</Label>
                   <Input
                     id="password"
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="Sua senha de login"
                   />
                 </div>
                 <AlertDialogFooter>
                   <AlertDialogCancel onClick={() => setPassword('')}>Cancelar</AlertDialogCancel>
                   <AlertDialogAction
                     onClick={handleClearReport} // Will call the placeholder function
                     disabled={!password || isClearing}
                     className="bg-destructive hover:bg-destructive/90"
                   >
                     {isClearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                     Limpar Relatório
                   </AlertDialogAction>
                 </AlertDialogFooter>
               </AlertDialogContent>
             </AlertDialog>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export default PartnerCouponReportPage;
```]></content>
  </change>
  <change>
    <file>src/app/(main)/partner/redeem-coupon/page.tsx</file>
    <description>Fix Firestore query logic in redeem coupon page to correctly find the coupon across all users.</description>
    <content><![CDATA[
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
        // Note: Firestore does not allow querying by document ID in collectionGroup directly.
        // We query by couponCode and status, then verify details if found.
      );

      const couponSnapshot = await getDocs(q);
      let foundCoupon: CouponToRedeem | null = null;

      if (!couponSnapshot.empty) {
        // Assuming coupon codes are unique across all users (as they should be)
        const couponDoc = couponSnapshot.docs[0];
        const couponData = couponDoc.data();
        const userId = couponDoc.ref.parent.parent?.id; // Get the userId from the path

        if (userId) {
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
            };
        } else {
            console.error("Could not extract userId from coupon path:", couponDoc.ref.path);
            throw new Error("Erro ao identificar o usuário do cupom.");
        }
      }

      if (!foundCoupon) {
        toast({ title: "Cupom Inválido", description: "Este código de cupom não foi encontrado, já foi utilizado ou está inativo.", variant: "destructive" });
        setIsRedeeming(false);
        return;
      }

      // Proceed to redeem
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
        <Loader2 className="w-12 h-12 text-destructive animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Painel
        </Button>
      </div>

      <Card className="max-w-lg mx-auto border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-destructive flex items-center justify-center">
            <TicketCheck className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Resgatar Cupom de Usuário
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Insira o código do cupom fornecido pelo usuário para validá-lo e marcá-lo como utilizado.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6 px-4 sm:px-6">
            <div>
              <Label htmlFor="couponCode" className="text-destructive/90">Código do Cupom</Label>
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

            <Button type="submit" className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm sm:text-base" disabled={isRedeeming}>
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
                            Certifique-se de que o usuário está presente e a recompensa está sendo entregue.
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
