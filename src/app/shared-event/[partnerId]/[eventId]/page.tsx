
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { doc, getDoc, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MapPin as MapPinIcon, CalendarClock, Sparkles, Download, LogIn as LogInIcon, Info } from 'lucide-react';

import { firestore } from '@/lib/firebase';
import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { APP_URL } from '@/lib/constants'; // Import APP_URL

interface EventDetails {
  eventName: string;
  startDateTime: FirebaseTimestamp;
  endDateTime: FirebaseTimestamp;
  visibility?: boolean; // Added visibility
}

interface PartnerDetails {
  venueName: string;
  photoURL?: string | null;
}

const SharedEventPage: NextPage = () => {
  const router = useRouter();
  const params = useParams();
  const searchParamsHook = useSearchParams();
  const { toast } = useToast();

  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : null;
  const eventId = typeof params.eventId === 'string' ? params.eventId : null;
  const sharedByName = searchParamsHook.get('sharedByName');

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [partnerDetails, setPartnerDetails] = useState<PartnerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId || !eventId) {
      setError('Link inválido ou informações ausentes.');
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      console.log(`SharedEventPage: Fetching details for partnerId: ${partnerId}, eventId: ${eventId}`);
      try {
        const partnerDocRef = doc(firestore, 'users', partnerId);
        const partnerDocSnap = await getDoc(partnerDocRef);

        if (!partnerDocSnap.exists() || partnerDocSnap.data()?.role !== 'partner') {
          console.error("SharedEventPage: Partner not found or not a partner.");
          throw new Error('Local não encontrado ou inválido.');
        }
        const partnerData = partnerDocSnap.data();
        console.log("SharedEventPage: Partner data fetched:", partnerData);
        setPartnerDetails({
            venueName: partnerData.venueName || 'Local Desconhecido',
            photoURL: partnerData.photoURL || null,
        });

        const eventDocRef = doc(firestore, 'users', partnerId, 'events', eventId);
        const eventDocSnap = await getDoc(eventDocRef);

        if (!eventDocSnap.exists()) {
          console.error("SharedEventPage: Event not found.");
          throw new Error('Evento não encontrado.');
        }
        const eventData = eventDocSnap.data() as EventDetails; // Cast to include visibility
        console.log("SharedEventPage: Event data fetched:", eventData);

        if (eventData.visibility !== true) {
            console.warn("SharedEventPage: Event is not visible. Preventing display.");
            throw new Error('Este evento não está mais disponível publicamente.');
        }

        setEventDetails({
          eventName: eventData.eventName,
          startDateTime: eventData.startDateTime,
          endDateTime: eventData.endDateTime,
        });

      } catch (err: any) {
        console.error("SharedEventPage: Error fetching details:", err);
        setError(err.message || 'Não foi possível carregar os detalhes do evento.');
        toast({ title: "Erro", description: err.message || 'Não foi possível carregar os detalhes do evento.', variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [partnerId, eventId, toast]);

  const fervoAppLoginUrl = `${APP_URL}/login`;
  const fervoAppMapUrl = APP_URL && partnerId && eventId ? `${APP_URL}/map?venueId=${partnerId}&eventId=${eventId}` : `${APP_URL}/map`;


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
             {sharedByName && (
              <p className="text-sm text-muted-foreground mb-2">
                <Sparkles className="inline w-4 h-4 mr-1 text-accent" />
                {decodeURIComponent(sharedByName)} te convidou para este Fervo!
              </p>
            )}
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Você foi Convidado para um FERVO!
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base mt-1">
              Descubra mais sobre este evento e explore o universo Fervo App.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-4 sm:px-6 pb-6 sm:pb-8">
            {error && (
              <div className="p-4 text-center text-destructive-foreground bg-destructive/80 rounded-md">
                <p>{error}</p>
                <Button asChild className="mt-4 bg-primary hover:bg-primary/80 text-sm sm:text-base">
                  <Link href={`${APP_URL}/map`}>Explorar outros eventos</Link>
                </Button>
              </div>
            )}

            {!error && eventDetails && partnerDetails && (
              <div className="p-4 space-y-3 border rounded-lg border-border bg-background/50 shadow-md">
                {partnerDetails.photoURL && (
                    <div className="relative w-full h-48 sm:h-56 rounded-md overflow-hidden mb-3">
                        <Image src={partnerDetails.photoURL} alt={`Foto de ${partnerDetails.venueName}`} layout="fill" objectFit="cover" data-ai-hint="venue building" />
                    </div>
                )}
                <h3 className="text-xl sm:text-2xl font-semibold text-center text-accent">{eventDetails.eventName}</h3>
                <div className="flex items-center justify-center text-muted-foreground text-sm sm:text-base">
                  <MapPinIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-primary" />
                  <span>{partnerDetails.venueName}</span>
                </div>
                <div className="flex items-center justify-center text-muted-foreground text-sm sm:text-base">
                  <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-primary" />
                  <span>
                    {format(eventDetails.startDateTime.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <Button
                  asChild
                  className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base"
                >
                  <Link href={fervoAppMapUrl}>
                    Ver no Fervo App
                  </Link>
                </Button>
              </div>
            )}

            <div className="p-4 sm:p-6 space-y-4 text-center rounded-lg bg-gradient-to-tr from-primary/10 to-secondary/10 border border-border/20">
              <h4 className="text-lg sm:text-xl font-semibold text-primary">Por que usar o Fervo App?</h4>
              <ul className="space-y-1.5 text-left list-none text-foreground/90 text-sm sm:text-base">
                <li className="flex items-start"><Info className="w-5 h-5 mr-2 mt-0.5 text-accent shrink-0" />Descubra eventos incríveis e locais perto de você em tempo real.</li>
                <li className="flex items-start"><Info className="w-5 h-5 mr-2 mt-0.5 text-accent shrink-0" />Filtre por tipo de local, estilo musical e muito mais.</li>
                <li className="flex items-start"><Info className="w-5 h-5 mr-2 mt-0.5 text-accent shrink-0" />Favorite locais, receba notificações e não perca nenhum Fervo.</li>
                <li className="flex items-start"><Info className="w-5 h-5 mr-2 mt-0.5 text-accent shrink-0" />Interaja no chat regional, faça check-in, avalie eventos e ganhe FervoCoins e cupons!</li>
              </ul>
            </div>

            <div className="flex flex-col items-center gap-3 sm:gap-4 pt-4 sm:flex-row sm:justify-center">
               <Link href={fervoAppLoginUrl} passHref className="w-full sm:w-auto">
                 <Button size="lg" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-sm sm:text-base">
                    <LogInIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Acesse ou Crie sua Conta!
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-primary text-primary hover:bg-primary/10 hover:text-primary text-sm sm:text-base"
                onClick={() => {
                    toast({ title: "Em Breve!", description: "Links para download do app nas lojas serão disponibilizados aqui.", duration: 3000});
                }}
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Baixar o Fervo App
              </Button>
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
