
'use client';

import type { NextPage } from 'next';
import { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { firestore, auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { QRCodeCanvas } from 'qrcode.react';
import { Loader2, ArrowLeft, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Card components might not be needed for the A4 layout directly but keep if used for structure
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Logo } from '@/components/shared/logo'; // Import Logo component

interface EventDetails {
  id: string;
  eventName: string;
  startDateTime: Timestamp;
  partnerId: string;
  checkInToken?: string;
}

interface PartnerDetails {
  venueName: string;
}

interface EventQrCodePageProps {
  params: { eventId: string };
}

const EventQrCodePage: NextPage<EventQrCodePageProps> = ({ params }) => {
  const router = useRouter();
  const { toast } = useToast();
  const eventIdParam = params.eventId; // Directly access params in RSC/Client Component boundary

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [partnerDetails, setPartnerDetails] = useState<PartnerDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [eventLoading, setEventLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qrCodeCanvasRef = useRef<HTMLDivElement>(null);

  const PRINT_QR_SIZE = 400; // Larger QR code size for printing

  const eventId = typeof eventIdParam === 'string' ? eventIdParam : null;

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

    const fetchDetails = async () => {
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
        
        const actualPartnerDocRef = doc(firestore, 'users', data.partnerId);
        const actualPartnerDocSnap = await getDoc(actualPartnerDocRef);
        if (!actualPartnerDocSnap.exists()) {
            throw new Error('Dados do local do evento não encontrados.');
        }
        setPartnerDetails({ venueName: actualPartnerDocSnap.data()?.venueName || 'Local Desconhecido'});


        setEventDetails({
          id: eventDocSnap.id,
          eventName: data.eventName,
          startDateTime: data.startDateTime,
          partnerId: data.partnerId,
          checkInToken: data.checkInToken,
        });

      } catch (err: any) {
        console.error("Error fetching details for QR code page:", err);
        const errorMessage = err.message || 'Não foi possível carregar os detalhes do evento.';
        setError(errorMessage);
        toast({ title: "Erro", description: `Não foi possível carregar o QR Code: ${errorMessage}`, variant: "destructive" });
      } finally {
        setEventLoading(false);
      }
    };

    fetchDetails();
  }, [currentUser, eventId, toast, authLoading]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const canvas = qrCodeCanvasRef.current?.querySelector('canvas');
    if (canvas) {
      const pngUrl = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `${eventDetails?.eventName || 'evento'}_${partnerDetails?.venueName || 'local'}-qrcode.png`;
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
        <Loader2 className="w-12 h-12 mb-4 text-primary animate-spin" />
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
    <main className="qr-page-container bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="print-header-actions print:hidden p-4 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="outline" onClick={() => router.push('/partner/events')} className="border-primary text-primary hover:bg-primary/10">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Eventos
        </Button>
        {!error && eventDetails && eventDetails.checkInToken && (
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </Button>
            <Button onClick={handleDownload} variant="outline" className="border-primary text-primary hover:bg-primary/10">
              <Download className="w-4 h-4 mr-2" /> Baixar PNG
            </Button>
          </div>
        )}
      </div>

      <div className="printable-a4-content flex flex-col items-center justify-between p-6 sm:p-8 md:p-12 text-center">
        <header className="w-full mb-4 md:mb-6">
          <div className="mb-4 md:mb-6 flex justify-center">
            <Logo logoSrc="/images/fervoapp_logo_512x512.png" logoWidth={80} logoHeight={80} data-ai-hint="app logo" />
          </div>
          {eventDetails && partnerDetails && (
            <>
              <h1 className="text-xl md:text-2xl font-bold text-black">Check-in no Evento!</h1>
              <p className="text-md md:text-lg text-black mt-2">
                Este é o QR Code para fazer check-in no evento <strong className="text-black">{eventDetails.eventName}</strong> no local <strong className="text-black">{partnerDetails.venueName}</strong>.
              </p>
              <p className="text-sm md:text-md text-gray-800 mt-1">
                Data do Evento: {format(eventDetails.startDateTime.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </>
          )}
           {error && (
             <div className="p-3 my-3 text-center text-red-700 bg-red-100 rounded-md border border-red-300">
                <p className="font-semibold">Erro ao carregar QR Code:</p>
                <p>{error}</p>
              </div>
           )}
        </header>

        <section className="qr-code-section flex-grow flex items-center justify-center w-full my-4 md:my-6">
          {!error && eventDetails && eventDetails.checkInToken && (
            <div ref={qrCodeCanvasRef} className="p-3 md:p-4 bg-white rounded-lg shadow-lg border border-gray-300 inline-block">
              <QRCodeCanvas
                id="qr-code-canvas-element"
                value={qrCodeValue}
                size={PRINT_QR_SIZE}
                level={"H"}
                imageSettings={{
                  src: "/fervo_icon.png",
                  height: Math.floor(PRINT_QR_SIZE * 0.15),
                  width: Math.floor(PRINT_QR_SIZE * 0.15),
                  excavate: true,
                }}
              />
            </div>
          )}
          {!error && eventDetails && !eventDetails.checkInToken && !eventLoading && (
            <p className="text-red-600 text-center text-lg">Token de check-in não encontrado para este evento.</p>
          )}
        </section>

        <footer className="text-center w-full mt-4 md:mt-6">
          <p className="text-md md:text-lg font-semibold text-black">
            Baixe o Fervo App para comentar, dar nota ao evento, ao local e muito mais!
          </p>
          <p className="text-xs sm:text-sm text-gray-700 mt-2">
            &copy; {new Date().getFullYear()} Fervo App. Todos os direitos reservados.
          </p>
        </footer>
      </div>

      <style jsx global>{`
        .qr-page-container {
          /* Full screen for viewing */
          width: 100%;
          min-height: 100vh;
          /* Default text color set here, overridden by specific classes or print styles */
        }
        .printable-a4-content {
          /* A4 aspect ratio for screen preview, actual size handled by @media print */
          width: 210mm;
          min-height: 290mm; /* Slightly less than 297 to ensure it fits with padding */
          margin-left: auto;
          margin-right: auto;
          box-shadow: 0 0 0.5cm rgba(0,0,0,0.5); /* Shadow for screen */
          background-color: white; /* Explicitly white */
        }
        @media print {
          body, html {
            margin: 0 !important;
            padding: 0 !important;
            background-color: white !important; /* Ensure no body background color interferes */
            -webkit-print-color-adjust: exact !important; /* Chrome, Safari */
            color-adjust: exact !important; /* Firefox */
          }
          .qr-page-container {
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background-color: white !important;
          }
          .print-header-actions {
            display: none !important;
          }
          .printable-a4-content {
            width: 100% !important; /* Use full printable width */
            height: 100% !important; /* Use full printable height */
            min-height: 0 !important; /* Reset min-height for print */
            box-sizing: border-box;
            margin: 0 !important;
            padding: 15mm !important; /* Typical print margin */
            box-shadow: none !important;
            border: none !important;
            page-break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important; /* Distribute content for print */
          }
           .qr-code-section canvas#qr-code-canvas-element {
            max-width: 100% !important;
            max-height: 50vh !important; /* Limit QR code height in print */
            width: auto !important;
            height: auto !important;
            object-fit: contain;
          }
          /* Ensure text colors are print-friendly if they rely on CSS vars */
          .printable-a4-content, .printable-a4-content * {
            color: black !important; /* Force black for print simplicity */
          }
          .printable-a4-content strong {
             font-weight: bold !important; /* Ensure strong tag works */
          }
        }
      `}</style>
    </main>
  );
};

export default EventQrCodePage;

    