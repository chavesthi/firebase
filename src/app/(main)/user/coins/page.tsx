
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Coins, Loader2, Building } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UserVenueCoins {
  [partnerId: string]: number;
}

interface VenueCoinDetail {
  partnerId: string;
  venueName: string;
  coinCount: number;
}

const UserCoinsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userVenueCoins, setUserVenueCoins] = useState<UserVenueCoins | null>(null);
  const [venueCoinDetails, setVenueCoinDetails] = useState<VenueCoinDetail[]>([]);
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
    const userDocRef = doc(firestore, `users/${currentUser.uid}`);
    const unsubscribeUserCoins = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserVenueCoins(data.venueCoins || {});
      } else {
        setUserVenueCoins({});
        toast({ title: "Informação não encontrada", description: "Não foi possível carregar seus dados de moedas.", variant: "destructive" });
      }
    }, (error) => {
      console.error("Error fetching user coins data:", error);
      toast({ title: "Erro ao Carregar Moedas", description: "Não foi possível buscar suas FervoCoins.", variant: "destructive" });
      setUserVenueCoins({}); 
    });

    return () => unsubscribeUserCoins();
  }, [currentUser, toast]);


  useEffect(() => {
    if (userVenueCoins === null) return; // Wait for userVenueCoins to be loaded

    const fetchVenueDetails = async () => {
      setIsLoading(true);
      const details: VenueCoinDetail[] = [];
      const partnerIds = Object.keys(userVenueCoins).filter(partnerId => (userVenueCoins[partnerId] ?? 0) > 0);

      if (partnerIds.length === 0) {
        setVenueCoinDetails([]);
        setIsLoading(false);
        return;
      }

      for (const partnerId of partnerIds) {
        try {
          const partnerDocRef = doc(firestore, "users", partnerId);
          const partnerDocSnap = await getDoc(partnerDocRef);
          if (partnerDocSnap.exists()) {
            details.push({
              partnerId,
              venueName: partnerDocSnap.data().venueName || 'Local Desconhecido',
              coinCount: userVenueCoins[partnerId],
            });
          } else {
            details.push({
              partnerId,
              venueName: 'Local Desconhecido (Dados Indisponíveis)',
              coinCount: userVenueCoins[partnerId],
            });
          }
        } catch (error) {
          console.error(`Failed to fetch venue name for partnerId ${partnerId}:`, error);
          details.push({
            partnerId,
            venueName: 'Erro ao Carregar Nome',
            coinCount: userVenueCoins[partnerId],
          });
        }
      }
      setVenueCoinDetails(details.sort((a,b) => b.coinCount - a.coinCount)); // Sort by most coins
      setIsLoading(false);
    };

    fetchVenueDetails();
  }, [userVenueCoins]);


  if (!currentUser && !isLoading) { // Show loader until auth check is complete
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const totalCoins = venueCoinDetails.reduce((sum, detail) => sum + detail.coinCount, 0);

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
            <Coins className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3" />
            Minhas FervoCoins
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Veja seu saldo de FervoCoins por local. Compartilhe eventos para ganhar mais!
          </CardDescription>
           {totalCoins > 0 && (
             <p className="text-lg font-semibold text-accent mt-2">Total de Moedas: {totalCoins}</p>
           )}
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : venueCoinDetails.length === 0 ? (
            <div className="text-center py-10">
              <Coins className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <p className="mt-4 text-lg text-muted-foreground">Você ainda não possui FervoCoins.</p>
              <p className="text-sm text-muted-foreground">Compartilhe eventos para começar a ganhar!</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-24rem)] sm:h-[calc(100vh-26rem)] pr-3">
              <div className="space-y-3">
                {venueCoinDetails.map((detail) => (
                  <Card key={detail.partnerId} className="bg-card/80 border-primary/30 shadow-sm">
                    <CardContent className="p-3 sm:p-4 flex justify-between items-center">
                      <div className="flex items-center">
                        <Building className="w-5 h-5 mr-3 text-primary/70 shrink-0" />
                        <div>
                          <p className="text-md font-medium text-foreground">{detail.venueName}</p>
                          <p className="text-xs text-muted-foreground">ID do Local: {detail.partnerId.substring(0,8)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center text-lg font-semibold text-accent">
                        <Coins className="w-5 h-5 mr-1.5" />
                        {detail.coinCount}
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

export default UserCoinsPage;
