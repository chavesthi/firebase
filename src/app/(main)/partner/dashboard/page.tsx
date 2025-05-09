
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore'; // Added query, where
import { useRouter } from 'next/navigation';
import { Edit, PlusCircle, CalendarDays, BarChart3, Settings, MapPin, Star, Loader2, QrCode, Gift, ScrollText, CheckCircle, Users, Heart } from 'lucide-react'; // Added Heart
import type { Location } from '@/services/geocoding';
import { VenueType, MusicStyle } from '@/lib/constants';
import { StarRating } from '@/components/ui/star-rating';

interface VenueData {
  venueName: string;
  venueType: VenueType;
  musicStyles: MusicStyle[];
  address: {
    street: string;
    number: string;
    city: string;
    state: string;
    cep: string;
    country: string;
  };
  location: Location;
  phone?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  questionnaireCompleted?: boolean;
  averageVenueRating?: number;
  venueRatingCount?: number;
}


export default function PartnerDashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCheckIns, setTotalCheckIns] = useState<number | null>(null);
  const [loadingCheckIns, setLoadingCheckIns] = useState(true);
  const [totalFavorites, setTotalFavorites] = useState<number | null>(null); // New state for favorites count
  const [loadingFavorites, setLoadingFavorites] = useState(true); // New loading state for favorites

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(true);
        const userDocRef = doc(firestore, "users", user.uid);

        unsubscribeSnapshot = onSnapshot(userDocRef, (userDocSnap) => {
          if (userDocSnap.exists()) {
            const data = userDocSnap.data() as VenueData;
            if (!data.questionnaireCompleted) {
              toast({ title: "Questionário Pendente", description: "Complete seu perfil para acessar o painel.", variant: "destructive" });
              router.push('/partner-questionnaire');
              setLoading(false);
            } else {
              setVenueData({
                venueName: data.venueName,
                venueType: data.venueType,
                musicStyles: data.musicStyles,
                address: data.address,
                location: data.location,
                phone: data.phone,
                instagramUrl: data.instagramUrl,
                facebookUrl: data.facebookUrl,
                youtubeUrl: data.youtubeUrl,
                questionnaireCompleted: data.questionnaireCompleted,
                averageVenueRating: data.averageVenueRating,
                venueRatingCount: data.venueRatingCount,
              });
              setLoading(false);
            }
          } else {
             toast({ title: "Erro", description: "Dados do parceiro não encontrados. Por favor, complete seu cadastro.", variant: "destructive" });
             router.push('/partner-questionnaire');
             setLoading(false);
          }
        }, (error) => {
          console.error("Error fetching partner data with onSnapshot:", error);
          toast({ title: "Erro ao Carregar Dados", description: "Não foi possível buscar os dados do painel.", variant: "destructive" });
          router.push('/login');
          setLoading(false);
        });

      } else {
        router.push('/login');
        setLoading(false);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [router, toast]);

  useEffect(() => {
    if (!currentUser || !venueData?.questionnaireCompleted) {
      setLoadingCheckIns(false);
      setLoadingFavorites(false); // Ensure favorites loading is also stopped
      return;
    }

    let isMounted = true;

    const fetchTotalCheckIns = async () => {
      setLoadingCheckIns(true);
      let count = 0;
      try {
        const eventsCollectionRef = collection(firestore, `users/${currentUser.uid}/events`);
        const eventsSnapshot = await getDocs(eventsCollectionRef);

        for (const eventDoc of eventsSnapshot.docs) {
          const checkInsCollectionRef = collection(firestore, `users/${currentUser.uid}/events/${eventDoc.id}/checkIns`);
          const checkInsSnapshot = await getDocs(checkInsCollectionRef);
          count += checkInsSnapshot.size;
        }
        if (isMounted) {
          setTotalCheckIns(count);
        }
      } catch (error) {
        console.error("Error fetching total check-ins:", error);
        if (isMounted) {
          setTotalCheckIns(0);
          toast({ title: "Erro ao buscar total de check-ins", variant: "destructive", duration: 3000 });
        }
      } finally {
        if (isMounted) {
          setLoadingCheckIns(false);
        }
      }
    };

    const fetchTotalFavorites = async () => {
      if (!currentUser?.uid) return;
      setLoadingFavorites(true);
      try {
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where('favoriteVenueIds', 'array-contains', currentUser.uid));
        const querySnapshot = await getDocs(q);
        if (isMounted) {
          setTotalFavorites(querySnapshot.size);
        }
      } catch (error) {
        console.error("Error fetching total favorites:", error);
        if (isMounted) {
          setTotalFavorites(0);
          toast({ title: "Erro ao buscar total de favoritos", variant: "destructive", duration: 3000 });
        }
      } finally {
        if (isMounted) {
          setLoadingFavorites(false);
        }
      }
    };


    fetchTotalCheckIns();
    fetchTotalFavorites(); // Fetch favorites count

    return () => {
      isMounted = false;
    };
  }, [currentUser, venueData?.questionnaireCompleted, toast]);


  if (loading || !currentUser || !venueData) {
    return (
      <div className="container flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg text-primary">Carregando dados do parceiro...</p>
      </div>
    );
  }

  const fullAddress = `${venueData.address.street}, ${venueData.address.number}, ${venueData.address.city} - ${venueData.address.state}, ${venueData.address.cep}`;

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <header className="mb-8 sm:mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-primary">{venueData.venueName}</h1>
        <p className="mt-2 text-sm sm:text-lg text-muted-foreground flex items-center justify-center px-2">
            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 text-primary/70 shrink-0"/>
            <span className="truncate">{fullAddress}</span>
        </p>
         <Button variant="outline" size="sm" className="mt-4 border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm" onClick={() => router.push('/partner-questionnaire')}>
            <Edit className="w-3 h-3 mr-1.5" /> Editar Info. do Local
        </Button>
      </header>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
              <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Gerenciar Eventos
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Crie, edite e visualize seus próximos eventos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 p-4 sm:p-6 pt-0 sm:pt-0">
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base"
              onClick={() => router.push('/partner/events')}
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Adicionar/Gerenciar Eventos
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Estatísticas Gerais
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Visão geral das interações no seu local.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Avaliação Geral do Local:</p>
                {venueData.averageVenueRating !== undefined && venueData.venueRatingCount !== undefined && venueData.venueRatingCount > 0 ? (
                    <div className="flex items-center gap-2">
                        <StarRating rating={venueData.averageVenueRating} readOnly size={20}/>
                        <span className="text-sm text-foreground">({venueData.averageVenueRating.toFixed(1)})</span>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">Nenhuma avaliação de evento registrada ainda.</p>
                )}
            </div>
             <div className="space-y-1">
                 <p className="text-sm font-medium text-muted-foreground">Total de Avaliações Recebidas:</p>
                 <p className="text-lg font-semibold text-primary">{venueData.venueRatingCount || 0}</p>
            </div>
            <div className="space-y-1">
                 <p className="text-sm font-medium text-muted-foreground">Total de Check-ins no Local:</p>
                 {loadingCheckIns ? (
                     <Loader2 className="w-5 h-5 text-primary animate-spin" />
                 ) : (
                    <p className="text-lg font-semibold text-primary flex items-center">
                        <Users className="w-5 h-5 mr-2"/>
                        {totalCheckIns ?? 0}
                    </p>
                 )}
            </div>
            <div className="space-y-1">
                 <p className="text-sm font-medium text-muted-foreground">Total de Favoritos:</p>
                 {loadingFavorites ? (
                     <Loader2 className="w-5 h-5 text-primary animate-spin" />
                 ) : (
                    <p className="text-lg font-semibold text-primary flex items-center">
                        <Heart className="w-5 h-5 mr-2 text-destructive fill-destructive"/>
                        {totalFavorites ?? 0}
                    </p>
                 )}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                    variant="outline"
                    className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                    onClick={() => router.push('/partner/ratings')}
                >
                 Ver Avaliações e Comentários
                </Button>
               <Button
                    variant="outline"
                    className="w-full border-primary/50 text-primary/70 text-sm sm:text-base cursor-not-allowed"
                    disabled={true}
                    title="Em breve: Relatório detalhado de check-ins por evento"
                >
                 <CheckCircle className="w-4 h-4 mr-2"/> Ver Check-ins por Evento (Em Breve)
               </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
              <Gift className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Resgatar Cupons
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Valide cupons de usuários aqui.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
             <Button
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/redeem-coupon')}
            >
              Resgatar Cupom
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
                <ScrollText className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                Relatório de Cupons
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Visualize os cupons que você resgatou.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
                <Button
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/coupon-report')}
                >
                Ver Relatório
                </Button>
            </CardContent>
        </Card>

        <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Configurações da Conta
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Ajuste suas preferências e informações de contato.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
             <Button
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/settings')}
            >
              Acessar Configurações
            </Button>
          </CardContent>
        </Card>

         <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center text-lg sm:text-xl text-primary">
                    <QrCode className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                    QR Codes de Eventos
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Gere e visualize os QR Codes para check-in nos seus eventos.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
                <Button
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/events')} 
                >
                Ver Eventos e QR Codes
                </Button>
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
