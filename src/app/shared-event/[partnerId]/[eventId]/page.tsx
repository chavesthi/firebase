
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { doc, getDoc, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MapPin as MapPinIcon, CalendarClock, Sparkles, Download, LogIn as LogInIcon } from 'lucide-react';

import { firestore } from '@/lib/firebase';
import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface EventDetails {
  eventName: string;
  startDateTime: FirebaseTimestamp;
  endDateTime: FirebaseTimestamp;
}

interface PartnerDetails {
  venueName: string;
}

const SharedEventPage: NextPage = () => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { partnerId, eventId } = params;

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [partnerDetails, setPartnerDetails] = useState<PartnerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId || !eventId || typeof partnerId !== 'string' || typeof eventId !== 'string') {
      setError('Link inválido ou informações ausentes.');
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        // Fetch partner details (venue name)
        const partnerDocRef = doc(firestore, 'users', partnerId);
        const partnerDocSnap = await getDoc(partnerDocRef);

        if (!partnerDocSnap.exists()) {
          throw new Error('Local não encontrado.');
        }
        const partnerData = partnerDocSnap.data();
        setPartnerDetails({ venueName: partnerData.venueName || 'Local Desconhecido' });

        // Fetch event details
        const eventDocRef = doc(firestore, 'users', partnerId, 'events', eventId);
        const eventDocSnap = await getDoc(eventDocRef);

        if (!eventDocSnap.exists()) {
          throw new Error('Evento não encontrado.');
        }
        const eventData = eventDocSnap.data() as Omit<EventDetails, 'id'>; // Assuming structure matches
        setEventDetails({
          eventName: eventData.eventName,
          startDateTime: eventData.startDateTime,
          endDateTime: eventData.endDateTime,
        });

      } catch (err: any) {
        console.error("Error fetching shared event details:", err);
        setError(err.message || 'Não foi possível carregar os detalhes do evento.');
        toast({ title: "Erro", description: err.message || 'Não foi possível carregar os detalhes do evento.', variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [partnerId, eventId, toast]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
        <Loader2 className="w-12 h-12 mb-4 text-primary animate-spin" />
        Carregando detalhes do Fervo...
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen p-4 bg-gradient-to-br from-background to-card">
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Logo iconClassName="text-primary" />
      </div>

      <div className="flex flex-col items-center justify-center w-full max-w-2xl mt-20 sm:mt-24 space-y-6 sm:space-y-8">
        <Card className="w-full shadow-2xl bg-card/90 backdrop-blur-sm border-primary/30">
          <CardHeader className="text-center px-4 sm:px-6 pt-6 sm:pt-8">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Você foi Convidado para um FERVO!
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base">
              Descubra mais sobre este evento e explore o universo Fervo App.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-4 sm:px-6 pb-6 sm:pb-8">
            {error && (
              <div className="p-4 text-center text-destructive-foreground bg-destructive/80 rounded-md">
                <p>{error}</p>
                <Button onClick={() => router.push('/map')} className="mt-4 bg-primary hover:bg-primary/80 text-sm sm:text-base">
                  Explorar outros eventos
                </Button>
              </div>
            )}

            {!error && eventDetails && partnerDetails && (
              <div className="p-4 space-y-3 border rounded-lg border-border bg-background/50">
                <h3 className="text-xl sm:text-2xl font-semibold text-center text-accent">{eventDetails.eventName}</h3>
                <div className="flex items-center justify-center text-muted-foreground text-sm sm:text-base">
                  <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-primary" />
                  <span>
                    {format(eventDetails.startDateTime.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-center justify-center text-muted-foreground text-sm sm:text-base">
                  <MapPinIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-primary" />
                  <span>{partnerDetails.venueName}</span>
                </div>
                <p className="text-xs sm:text-sm text-center text-foreground/80">
                  Para ver todos os detalhes, como preços, outros eventos no local, rotas e muito mais, baixe o Fervo App ou faça login!
                </p>
              </div>
            )}

            <div className="p-4 sm:p-6 space-y-4 text-center rounded-lg bg-gradient-to-tr from-primary/10 to-secondary/10">
              <h4 className="text-lg sm:text-xl font-semibold text-primary">Benefícios do Fervo App:</h4>
              <ul className="space-y-1 text-left list-disc list-inside text-foreground/90 text-sm sm:text-base">
                <li><Sparkles className="inline w-4 h-4 mr-2 text-accent" />Descubra eventos incríveis perto de você.</li>
                <li><Sparkles className="inline w-4 h-4 mr-2 text-accent" />Filtre por tipo de local e estilo musical.</li>
                <li><Sparkles className="inline w-4 h-4 mr-2 text-accent" />Receba notificações sobre seus eventos favoritos.</li>
                <li><Sparkles className="inline w-4 h-4 mr-2 text-accent" />Compartilhe com amigos e ganhe FervoCoins!</li>
              </ul>
            </div>

            <div className="flex flex-col items-center gap-3 sm:gap-4 pt-4 sm:flex-row sm:justify-center">
              <Button 
                size="lg" 
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base"
                onClick={() => {
                    // Replace with actual app store links or PWA install prompt
                    toast({ title: "Em Breve!", description: "Links para download do app serão disponibilizados aqui.", duration: 3000});
                }}
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Baixar o Fervo App
              </Button>
              <Link href="/login" passHref className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full border-accent text-accent hover:bg-accent/10 hover:text-accent text-sm sm:text-base">
                  <LogInIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Já tenho conta!
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        
        <footer className="py-6 sm:py-8 text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Fervo App. Todos os direitos reservados.
          </p>
        </footer>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 6px hsl(var(--primary)), 0 0 30px 10px hsla(var(--primary), 0.25), 0 0 15px 6px hsl(var(--secondary)), 0 0 30px 10px hsla(var(--secondary), 0.25);
        }
      `}</style>
    </main>
  );
};

export default SharedEventPage;
