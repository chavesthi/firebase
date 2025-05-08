
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth'; // Import onAuthStateChanged
import { collection, query, where, onSnapshot, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TicketIcon, Copy, Loader2, AlertCircle, MapPin } from 'lucide-react'; // Added MapPin
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface Coupon {
  id: string;
  couponCode: string;
  description: string;
  createdAt: FirebaseTimestamp;
  status: 'active' | 'redeemed';
  validAtPartnerId: string; // Partner ID where the coupon is valid
  partnerVenueName: string; // Name of the partner venue
  // Potentially add: redeemedAt, redeemedByPartnerId if needed for display
}

const UserCouponsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const couponsRef = collection(firestore, `users/${currentUser.uid}/coupons`);
    // Query only for active coupons belonging to the current user
    const q = query(couponsRef, where('status', '==', 'active'), where('userId', '==', currentUser.uid));

    const unsubscribeCoupons = onSnapshot(q, (snapshot) => {
      const fetchedCoupons: Coupon[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Ensure all required fields exist before pushing
        if (data.couponCode && data.description && data.createdAt && data.status && data.validAtPartnerId && data.partnerVenueName) {
          fetchedCoupons.push({ id: doc.id, ...data } as Coupon);
        } else {
          console.warn("Incomplete coupon data found, skipping:", doc.id, data);
        }
      });
      setCoupons(fetchedCoupons.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())); // Show newest first
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching user coupons:", error);
      toast({ title: "Erro ao Carregar Cupons", description: "Não foi possível buscar seus cupons.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribeCoupons();
  }, [currentUser, toast]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast({ title: "Código Copiado!", description: "O código do cupom foi copiado para a área de transferência." });
    }).catch(err => {
      toast({ title: "Erro ao Copiar", description: "Não foi possível copiar o código.", variant: "destructive" });
    });
  };

  if (!currentUser && !isLoading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }


  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.back()} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Voltar
        </Button>
      </div>

      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary flex items-center justify-center">
            <TicketIcon className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3" />
            Meus Cupons Ativos
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Use estes cupons nos locais parceiros indicados!
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-10">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg text-muted-foreground">Você ainda não possui cupons ativos.</p>
              <p className="text-sm text-muted-foreground">Compartilhe eventos para ganhar FervoCoins em locais específicos e trocá-las por cupons!</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-20rem)] sm:h-[calc(100vh-22rem)] pr-3"> {/* Adjust height as needed */}
              <div className="space-y-4">
                {coupons.map((coupon) => (
                  <Card key={coupon.id} className="bg-card/80 border-primary/50 shadow-md">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-lg text-primary">{coupon.description}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      <div className="flex items-center text-sm text-muted-foreground">
                         <MapPin className="w-4 h-4 mr-1.5 text-primary/80 shrink-0"/> Válido em: <span className="font-medium ml-1 text-foreground/90">{coupon.partnerVenueName}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
                        <Badge variant="secondary" className="text-base px-3 py-1.5 bg-accent text-accent-foreground">
                          {coupon.couponCode}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary text-primary hover:bg-primary/10 mt-2 sm:mt-0 w-full sm:w-auto"
                          onClick={() => handleCopyCode(coupon.couponCode)}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar Código
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserCouponsPage;
