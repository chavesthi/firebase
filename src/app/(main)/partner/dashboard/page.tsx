
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore'; // Changed getDoc to onSnapshot
import { useRouter } from 'next/navigation';
import { Edit, PlusCircle, CalendarDays, BarChart3, Settings, MapPin, Star, Loader2 } from 'lucide-react';
import type { Location } from '@/services/geocoding';
import { VenueType, MusicStyle } from '@/lib/constants';

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
  questionnaireCompleted?: boolean; // Added to ensure we can check this from snapshot
}


export default function PartnerDashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(true);
        const userDocRef = doc(firestore, "users", user.uid);
        
        unsubscribeSnapshot = onSnapshot(userDocRef, (userDocSnap) => {
          if (userDocSnap.exists()) {
            const data = userDocSnap.data() as VenueData; // Cast to VenueData
            if (!data.questionnaireCompleted) {
              toast({ title: "Questionário Pendente", description: "Complete seu perfil para acessar o painel.", variant: "destructive" });
              router.push('/partner-questionnaire');
              setLoading(false); // Stop loading if redirecting
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
              });
              setLoading(false);
            }
          } else {
             toast({ title: "Erro", description: "Dados do parceiro não encontrados. Por favor, complete seu cadastro.", variant: "destructive" });
             router.push('/partner-questionnaire'); // Redirect to questionnaire if doc doesn't exist
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
          unsubscribeSnapshot(); // Clean up snapshot listener if user logs out
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

  if (loading || !currentUser || !venueData) {
    return (
      <div className="container flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-destructive animate-spin mb-4" />
        <p className="text-lg text-destructive">Carregando dados do parceiro...</p>
      </div>
    );
  }
  
  const fullAddress = `${venueData.address.street}, ${venueData.address.number}, ${venueData.address.city} - ${venueData.address.state}, ${venueData.address.cep}`;

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <header className="mb-8 sm:mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-destructive">{venueData.venueName}</h1>
        <p className="mt-2 text-sm sm:text-lg text-muted-foreground flex items-center justify-center px-2">
            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 text-destructive/70 shrink-0"/>
            <span className="truncate">{fullAddress}</span>
        </p>
         <Button variant="outline" size="sm" className="mt-4 border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm" onClick={() => router.push('/partner-questionnaire')}>
            <Edit className="w-3 h-3 mr-1.5" /> Editar Info. do Local
        </Button>
      </header>
      
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-destructive">
              <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Gerenciar Eventos
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Crie, edite e visualize seus próximos eventos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 p-4 sm:p-6 pt-0 sm:pt-0">
            <Button 
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm sm:text-base"
              onClick={() => router.push('/partner/events')}
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Adicionar/Gerenciar Eventos
            </Button>
          </CardContent>
        </Card>
        
        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-destructive">
              <Star className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Avaliações e Comentários
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Veja o que os usuários acharam dos seus eventos.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
             <Button 
                variant="outline" 
                className="w-full border-destructive text-destructive hover:bg-destructive/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/ratings')}
            >
              Ver Avaliações
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-destructive">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Estatísticas (Em Breve)
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Acompanhe o desempenho dos seus eventos e visualizações.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-4 sm:p-6 pt-0 sm:pt-0">
            <p className="text-muted-foreground text-xs sm:text-sm">Funcionalidade em desenvolvimento.</p>
          </CardContent>
        </Card>
        
        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow md:col-start-1 lg:col-start-2">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center text-lg sm:text-xl text-destructive">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
              Configurações da Conta
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Ajuste suas preferências e informações de contato.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
             <Button 
                variant="outline" 
                className="w-full border-destructive text-destructive hover:bg-destructive/10 text-sm sm:text-base"
                onClick={() => router.push('/partner/settings')}
            >
              Acessar Configurações
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
