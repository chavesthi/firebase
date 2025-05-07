
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

const EventQrCodePage: NextPage = () => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const eventIdParam = params.eventId; // Can be string or string[]

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [eventLoading, setEventLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventId = typeof eventIdParam === 'string' ? eventIdParam : null;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setError("Usuário não autenticado. Faça login para continuar.");
        router.push('/login'); // Redirect if not authenticated
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (authLoading || !currentUser || !eventId) {
      if (!authLoading && !currentUser && !error) { // if auth is done, no user, and no prior error
        setError("Usuário não autenticado. Faça login para continuar.");
      }
      if (!authLoading && !eventId && !error) {
        setError("ID do evento inválido.");
      }
      if (!authLoading) setEventLoading(false); // Stop event loading if prerequisites fail
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
        <Loader2 className="w-12 h-12 mb-4 text-destructive animate-spin" />
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
       <div className="absolute top-8 left-8 print:hidden">
         <Button variant="outline" onClick={() => router.push('/partner/events')} className="border-destructive text-destructive hover:bg-destructive/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Eventos
        </Button>
      </div>
      
      <div className="flex flex-col items-center justify-center w-full max-w-md mt-20 space-y-8">
        <Card className="w-full shadow-2xl bg-card/95 backdrop-blur-sm border-destructive/30 print:shadow-none print:border-none">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-destructive to-accent print:text-black">
              QR Code de Check-in
            </CardTitle>
             {eventDetails && (
                <CardDescription className="text-muted-foreground print:text-gray-600">
                    Evento: {eventDetails.eventName} <br />
                    Data: {format(eventDetails.startDateTime.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            {error && !eventDetails && ( // Only show general error if no event details could be loaded
              <div className="p-4 text-center text-destructive-foreground bg-destructive/80 rounded-md print:hidden">
                <p>{error}</p>
              </div>
            )}

            {!error && eventDetails && eventDetails.checkInToken && (
              <div className="p-6 bg-white rounded-lg shadow-inner"> {/* White background for QR code */}
                <QRCodeCanvas 
                    id="qr-code-canvas"
                    value={qrCodeValue} 
                    size={256} 
                    level={"H"}
                    imageSettings={{
                        src: "/fervo_icon.png", // Path to your logo in public folder
                        height: 40,
                        width: 40,
                        excavate: true,
                    }}
                 />
              </div>
            )}
            {/* Specific error for missing token if event was loaded but token is missing */}
            {!error && eventDetails && !eventDetails.checkInToken && ( 
                 <p className="text-destructive text-center">Token de check-in não encontrado para este evento.</p>
            )}

            <p className="text-sm text-center text-muted-foreground print:hidden">
                Apresente este QR Code na entrada do evento para realizar o check-in dos participantes através do Fervo App (função de scanner do usuário).
            </p>

            {!error && eventDetails && eventDetails.checkInToken && (
                <div className="flex flex-col w-full gap-3 pt-4 sm:flex-row sm:justify-center print:hidden">
                    <Button onClick={handlePrint} className="w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        <Printer className="w-4 h-4 mr-2" /> Imprimir
                    </Button>
                    <Button onClick={handleDownload} variant="outline" className="w-full sm:w-auto border-destructive text-destructive hover:bg-destructive/10">
                        <Download className="w-4 h-4 mr-2" /> Baixar PNG
                    </Button>
                </div>
            )}

          </CardContent>
        </Card>
        
        <footer className="py-8 text-center print:hidden">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Fervo App. Todos os direitos reservados.
          </p>
        </footer>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 20px 8px hsl(var(--destructive)), 0 0 40px 15px hsla(var(--destructive), 0.3), 0 0 20px 8px hsl(var(--accent)), 0 0 40px 15px hsla(var(--accent), 0.3);
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
          }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:text-black { color: black !important; }
          .print\\:text-gray-600 { color: #4B5563 !important; } /* Tailwind gray-600 */

        }
      `}</style>
    </main>
  );
};

export default EventQrCodePage;

