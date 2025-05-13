
'use client';

import type { NextPage } from 'next';
import { useEffect, useState, use, useRef } from 'react'; // Added use
import { useRouter } from 'next/navigation'; 
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { firestore, auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { QRCodeCanvas } from 'qrcode.react';
import { Loader2, ArrowLeft, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EventDetails {
  id: string;
  eventName: string;
  startDateTime: Timestamp;
  partnerId: string;
  checkInToken?: string;
}

interface EventQrCodePageProps {
  params: { eventId: string };
}

const EventQrCodePage: NextPage<EventQrCodePageProps> = ({ params }) => {
  const resolvedParams = use(params as any); // Use React.use to unwrap params if it's a Promise
  const router = useRouter();
  const { toast } = useToast();
  const eventIdParam = resolvedParams.eventId;

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [eventLoading, setEventLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(256); // Default size

  const eventId = typeof eventIdParam === 'string' ? eventIdParam : null;

  useEffect(() => {
    const handleResize = () => {
        const width = window.innerWidth;
        if (width < 400) {
            setQrSize(192); 
        } else if (width < 640) {
             setQrSize(224); 
        } else {
            setQrSize(256); 
        }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setError("Usuário não autenticado. Faça login para continuar.");
        router.push('/login'); 
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (authLoading || !currentUser || !eventId) {
      if (!authLoading && !currentUser && !error) { 
        setError("Usuário não autenticado. Faça login para continuar.");
      }
      if (!authLoading && !eventId && !error) {
        setError("ID do evento inválido.");
      }
      if (!authLoading) setEventLoading(false); 
      return;
    }

    const fetchEventDetails = async () => {
      setEventLoading(true);
      setError(null);
      try {
        const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', eventId);
        const eventDocSnap = await getDoc(eventDocRef);

        if (!eventDocSnap.exists()) {
          throw new Error('Evento não encontrado ou você não tem permissão para acessá-lo.');
        }

        const data = eventDocSnap.data();
        if (data.partnerId !== currentUser.uid) {
            throw new Error('Você não tem permissão para visualizar o QR code deste evento.');
        }

        if (!data.checkInToken) {
          throw new Error('Este evento não possui um token de check-in configurado.');
        }
        
        const eventEndDateTime = data.endDateTime as Timestamp;
        if (eventEndDateTime.toDate() < new Date()) {
            throw new Error('Este evento já terminou e o QR code não está mais disponível.');
        }


        setEventDetails({
          id: eventDocSnap.id,
          eventName: data.eventName,
          startDateTime: data.startDateTime,
          partnerId: data.partnerId,
          checkInToken: data.checkInToken,
        });

      } catch (err: any) {
        console.error("Error fetching event details for QR code:", err);
        const errorMessage = err.message || 'Não foi possível carregar os detalhes do evento.';
        setError(errorMessage);
        toast({ title: "Erro", description: `Não foi possível carregar o QR Code do evento: ${errorMessage}`, variant: "destructive" });
      } finally {
        setEventLoading(false);
      }
    };

    fetchEventDetails();
  }, [currentUser, eventId, toast, authLoading]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const canvas = document.getElementById('qr-code-canvas') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `${eventDetails?.eventName || 'evento'}-qrcode.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      toast({ title: "Download Iniciado", description: "O QR Code está sendo baixado."});
    } else {
      toast({ title: "Erro no Download", description: "Não foi possível encontrar o QR Code para download.", variant: "destructive"});
    }
  };


  if (authLoading || eventLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
        <Loader2 className="w-12 h-12 mb-4 text-foreground animate-spin" />
        Carregando QR Code do Evento...
      </div>
    );
  }

  const qrCodeValue = eventDetails ? JSON.stringify({
    eventId: eventDetails.id,
    partnerId: eventDetails.partnerId,
    token: eventDetails.checkInToken,
  }) : "";


  return (
    <main className="flex flex-col items-center min-h-screen p-4 bg-background">
       <div className="absolute top-4 left-4 sm:top-8 sm:left-8 print:hidden">
         <Button variant="outline" onClick={() => router.push('/partner/events')} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            Eventos
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center w-full max-w-md mt-20 sm:mt-24 space-y-6 sm:space-y-8">
        <Card className="w-full shadow-2xl bg-card/95 backdrop-blur-sm border-primary/30 print:shadow-none print:border-none">
          <CardHeader className="text-center px-4 sm:px-6">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent print:text-black">
              QR Code de Check-in
            </CardTitle>
             {eventDetails && (
                <CardDescription className="text-muted-foreground text-sm sm:text-base print:text-gray-600">
                    Evento: {eventDetails.eventName} <br className="sm:hidden"/> 
                    Data: {format(eventDetails.startDateTime.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4 sm:space-y-6 px-4 sm:px-6 pb-4 sm:pb-6">
            {error && !eventDetails && ( 
              <div className="p-4 text-center text-destructive-foreground bg-destructive/80 rounded-md print:hidden">
                <p>{error}</p>
              </div>
            )}

            {!error && eventDetails && eventDetails.checkInToken && (
              <div className="p-4 sm:p-6 bg-white rounded-lg shadow-inner"> 
                <QRCodeCanvas
                    id="qr-code-canvas"
                    value={qrCodeValue}
                    size={qrSize}
                    level={"H"}
                    imageSettings={{
                        src: "/fervo_icon.png", 
                        height: Math.floor(qrSize * 0.15), 
                        width: Math.floor(qrSize * 0.15),
                        excavate: true,
                    }}
                 />
              </div>
            )}
            {!error && eventDetails && !eventDetails.checkInToken && (
                 <p className="text-destructive text-center">Token de check-in não encontrado para este evento.</p>
            )}

            <p className="text-xs sm:text-sm text-center text-muted-foreground print:hidden">
                Apresente este QR Code na entrada do evento para realizar o check-in dos participantes através do Fervo App (função de scanner do usuário).
            </p>

            {!error && eventDetails && eventDetails.checkInToken && (
                <div className="flex flex-col w-full gap-3 pt-4 sm:flex-row sm:justify-center print:hidden">
                    <Button onClick={handlePrint} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm">
                        <Printer className="w-4 h-4 mr-2" /> Imprimir
                    </Button>
                    <Button onClick={handleDownload} variant="outline" className="w-full sm:w-auto border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
                        <Download className="w-4 h-4 mr-2" /> Baixar PNG
                    </Button>
                </div>
            )}

          </CardContent>
        </Card>

        <footer className="py-6 sm:py-8 text-center print:hidden">
          <p className="text-xs sm:text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Fervo App. Todos os direitos reservados.
          </p>
        </footer>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 6px hsl(var(--primary)), 0 0 30px 10px hsla(var(--primary), 0.25), 0 0 15px 6px hsl(var(--accent)), 0 0 30px 10px hsla(var(--accent), 0.25);
        }
        @media print {
          body * {
            visibility: hidden;
          }
          main, main * {
            visibility: visible;
          }
          main {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 1rem; 
          }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:text-black { color: black !important; }
          .print\\:text-gray-600 { color: #4B5563 !important; } 
          #qr-code-canvas {
             max-width: 80vw; 
             height: auto;
          }
        }
      `}</style>
    </main>
  );
};

export default EventQrCodePage;


