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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'; // Added CardFooter
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
  userName: string; // Added this field
  couponCode: string;
  description: string;
  redeemedAt: FirebaseTimestamp;
  // Add the document path for deletion
  docPath: string; 
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

      // Fetch user names for each coupon
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let userName = 'Usuário Desconhecido';
        const userId = data.userId; // Get userId from data
        const docPath = docSnap.ref.path; // Get the full document path

        if (userId && typeof userId === 'string') { // Check if userId exists and is a string
            try {
              const userDocRef = doc(firestore, 'users', userId); // Use the extracted userId
              const userDoc = await getDoc(userDocRef); // Ensure getDoc is imported and used correctly
              if (userDoc.exists()) {
                userName = userDoc.data().name || userName;
              }
            } catch (error) {
              console.error(`Failed to fetch user name for userId ${userId}:`, error); // This line seems syntactically correct. Ensure surrounding blocks are okay.
            }
        } else {
             console.warn(`Missing or invalid userId for coupon ${docSnap.id}`);
        }

        // Check if all necessary data exists before pushing
        if (data.userId && data.couponCode && data.description && data.redeemedAt) {
          fetchedCoupons.push({
            id: docSnap.id,
            userId: data.userId,
            userName: userName, // Use fetched or default name
            couponCode: data.couponCode,
            description: data.description,
            redeemedAt: data.redeemedAt as FirebaseTimestamp,
            docPath: docPath, // Store the path
          });
        } else {
           console.warn(`Incomplete coupon data for ${docSnap.id}, skipping.`);
        }
      } // End of for loop
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
      if (!currentUser || redeemedCoupons.length === 0) return;
      setIsClearing(true);

      try {
          // 1. Verify password
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

          // 2. Password is correct, proceed with deletion
          const batch = writeBatch(firestore);
          
          redeemedCoupons.forEach(coupon => {
              // Use the stored docPath to reference the document for deletion
              const couponDocRef = doc(firestore, coupon.docPath); 
              batch.delete(couponDocRef);
          });

          await batch.commit();

          toast({ title: "Relatório Limpo!", description: "Todos os cupons resgatados foram removidos deste relatório.", variant: "default" });
          setRedeemedCoupons([]); // Clear local state immediately after successful deletion
          setShowClearConfirm(false); // Close the dialog
          setPassword(''); // Clear password input

      } catch (error: any) {
          console.error("Error clearing coupon report:", error);
          toast({ title: "Erro ao Limpar", description: error.message || "Não foi possível limpar o relatório.", variant: "destructive" });
      } finally {
          setIsClearing(false);
      }
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
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-60">
              <Loader2 className="w-10 h-10 text-destructive animate-spin" />
            </div>
          ) : redeemedCoupons.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">Nenhum cupom foi resgatado ainda.</p>
          ) : (
            <ScrollArea className="h-[calc(100vh-22rem)] sm:h-[calc(100vh-24rem)]">
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
             <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
               <AlertDialogTrigger asChild>
                  {/* Enable the button */}
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
                   {/* Action button also enabled */}
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
