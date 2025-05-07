
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Edit, PlusCircle, CalendarDays, BarChart3, Settings, MapPin } from 'lucide-react';
import type { Location } from '@/services/geocoding'; // For type consistency
import { VenueType, MusicStyle } from '@/lib/constants'; // For type consistency

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
}


export default function PartnerDashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDocRef = doc(firestore, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (!data.questionnaireCompleted) {
            toast({ title: "Questionário Pendente", description: "Complete seu perfil para acessar o painel.", variant: "destructive" });
            router.push('/partner-questionnaire');
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
            });
          }
        } else {
           toast({ title: "Erro", description: "Dados do parceiro não encontrados.", variant: "destructive" });
           router.push('/login'); // Or some error page
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, toast]);

  if (loading || !currentUser || !venueData) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto">
        <p className="text-xl text-destructive animate-pulse">Carregando dados do parceiro...</p>
      </div>
    );
  }
  
  const fullAddress = `${venueData.address.street}, ${venueData.address.number}, ${venueData.address.city} - ${venueData.address.state}, ${venueData.address.cep}`;

  return (
    <div className="container py-8 mx-auto">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-destructive">{venueData.venueName}</h1>
        <p className="mt-2 text-lg text-muted-foreground flex items-center justify-center">
            <MapPin className="w-5 h-5 mr-2 text-destructive/70"/>
            {fullAddress}
        </p>
         <Button variant="outline" size="sm" className="mt-4 border-destructive text-destructive hover:bg-destructive/10" onClick={() => router.push('/partner-questionnaire')}>
            <Edit className="w-3 h-3 mr-1.5" /> Editar Informações do Local
        </Button>
      </header>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-destructive">
              <CalendarDays className="w-6 h-6 mr-3" />
              Gerenciar Eventos
            </CardTitle>
            <CardDescription>Crie, edite e visualize seus próximos eventos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button 
              className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => router.push('/partner/events')}
            >
              <PlusCircle className="w-5 h-5 mr-2" /> Adicionar/Gerenciar Eventos
            </Button>
            {/* 
            <Button 
                variant="outline" 
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => router.push('/partner/events')} // Can also go to same page or a dedicated view page
            >
              Ver Meus Eventos
            </Button>
             */}
          </CardContent>
        </Card>

        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-destructive">
              <BarChart3 className="w-6 h-6 mr-3" />
              Estatísticas (Em Breve)
            </CardTitle>
            <CardDescription>Acompanhe o desempenho dos seus eventos e visualizações.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <p className="text-muted-foreground">Funcionalidade em desenvolvimento.</p>
          </CardContent>
        </Card>
        
        <Card className="border-destructive/50 shadow-lg shadow-destructive/15 hover:shadow-destructive/30 transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-destructive">
              <Settings className="w-6 h-6 mr-3" />
              Configurações da Conta
            </CardTitle>
            <CardDescription>Ajuste suas preferências e informações de contato.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
             <Button 
                variant="outline" 
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
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
