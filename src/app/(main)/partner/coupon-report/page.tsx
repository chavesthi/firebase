

'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
// Ensure all necessary Firestore functions are imported
import { collectionGroup, query, where, orderBy, Timestamp as FirebaseTimestamp, onSnapshot, doc, getDoc, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { ArrowLeft, Loader2, ScrollText, Trash2 } from 'lucide-react';
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
  userName: string;
  couponCode: string;
  description: string;
  redeemedAt: FirebaseTimestamp;
  docPath: string; // Full path to the coupon document for deletion
}

const PartnerCouponReportPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true); // For auth loading
  const [isLoadingData, setIsLoadingData] = useState(true); // For coupon data loading
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
      setIsLoadingUser(false);
    });
    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (isLoadingUser || !currentUser) {
      if (!isLoadingUser) setIsLoadingData(false); // If auth is done but no user, stop data loading
      return;
    }

    setIsLoadingData(true);
    const couponsRef = collectionGroup(firestore, 'coupons');
    const q = query(
      couponsRef,
      where('status', '==', 'redeemed'),
      where('redeemedByPartnerId', '==', currentUser.uid),
      orderBy('redeemedAt', 'desc')
    );

    const unsubscribeCoupons = onSnapshot(q, async (snapshot) => {
      const fetchedCoupons: RedeemedCoupon[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let userName = 'Usuário Desconhecido';
        const userId = data.userId;
        const docPath = docSnap.ref.path;

        if (userId && typeof userId === 'string') {
            try {
              const userDocRef = doc(firestore, 'users', userId);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                userName = userDoc.data().name || userName;
              }
            } catch (error) {
              console.error(`Failed to fetch user name for userId ${userId}:`, error);
            }
        } else {
             console.warn(`Missing or invalid userId for coupon ${docSnap.id}`);
        }

        if (data.userId && data.couponCode && data.description && data.redeemedAt) {
          fetchedCoupons.push({
            id: docSnap.id,
            userId: data.userId,
            userName: userName,
            couponCode: data.couponCode,
            description: data.description,
            redeemedAt: data.redeemedAt as FirebaseTimestamp,
            docPath: docPath,
          });
        } else {
           console.warn(`Incomplete coupon data for ${docSnap.id}, skipping.`);
        }
      }
      setRedeemedCoupons(fetchedCoupons);
      setIsLoadingData(false);
    }, (error) => {
      console.error("Error fetching redeemed coupons:", error);
      toast({ title: "Erro ao Carregar Relatório", description: "Não foi possível buscar os cupons resgatados.", variant: "destructive" });
      setIsLoadingData(false);
    });

    return () => unsubscribeCoupons();
  }, [currentUser, isLoadingUser, toast]);

  const handleClearReport = async () => {
      if (!currentUser || redeemedCoupons.length === 0) return;
      setIsClearing(true);

      try {
          const partnerDocRef = doc(firestore, `users/${currentUser.uid}`);
          const partnerDocSnap = await getDoc(partnerDocRef);

          if (!partnerDocSnap.exists()) {
              throw new Error("Dados do parceiro não encontrados.");
          }
          const partnerData = partnerDocSnap.data();
          const storedPassword = partnerData.couponReportClearPassword;

          if (!storedPassword) {
              toast({ title: "Senha Não Definida", description: "Defina uma senha nas configurações da conta para limpar o relatório.", variant: "destructive", duration: 5000 });
              setIsClearing(false);
              setShowClearConfirm(false);
              setPassword('');
              return;
          }

          if (storedPassword !== password) {
              toast({ title: "Senha Incorreta", description: "A senha inserida está incorreta.", variant: "destructive" });
              setIsClearing(false);
              return;
          }

          const batch = writeBatch(firestore);
          redeemedCoupons.forEach(coupon => {
              const couponDocRef = doc(firestore, coupon.docPath);
              batch.delete(couponDocRef);
          });
          await batch.commit();

          toast({ title: "Relatório Limpo!", description: "Todos os cupons resgatados foram removidos deste relatório.", variant: "default" });
          setRedeemedCoupons([]);
          setShowClearConfirm(false);
          setPassword('');
      } catch (error: any) {
          console.error("Error clearing coupon report:", error);
          toast({ title: "Erro ao Limpar", description: error.message || "Não foi possível limpar o relatório.", variant: "destructive" });
      } finally {
          setIsClearing(false);
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
      <Card className="border-primary/50 shadow-lg shadow-primary/15">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-foreground flex items-center">
            <ScrollText className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Relatório de Cupons Resgatados
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Aqui está o histórico de cupons de usuários que foram resgatados no seu estabelecimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingData ? (
            <div className="flex justify-center items-center h-60">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : redeemedCoupons.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">Nenhum cupom foi resgatado ainda.</p>
          ) : (
            <ScrollArea className="h-[calc(100vh-22rem)] sm:h-[calc(100vh-24rem)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-foreground/90">Usuário</TableHead>
                    <TableHead className="text-foreground/90">Cupom</TableHead>
                    <TableHead className="text-foreground/90">Descrição</TableHead>
                    <TableHead className="text-foreground/90 text-right">Data Resgate</TableHead>
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
          <CardFooter className="p-4 sm:p-6 border-t border-primary/20 justify-end">
             <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
               <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" onClick={() => setShowClearConfirm(true)} >
                      <Trash2 className="w-4 h-4 mr-2" /> Limpar Relatório
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
                   <Label htmlFor="password">Senha do Relatório</Label>
                   <Input
                     id="password"
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="Senha definida nas configurações"
                   />
                 </div>
                 <AlertDialogFooter>
                   <AlertDialogCancel onClick={() => {setPassword(''); setShowClearConfirm(false)}}>Cancelar</AlertDialogCancel>
                   <AlertDialogAction
                     onClick={handleClearReport}
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

    
