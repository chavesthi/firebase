
'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Loader2, XCircle, CheckCircle2 } from 'lucide-react';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface QrCodePayload {
  eventId: string;
  partnerId: string;
  token: string;
}

const QrScannerModal = ({ isOpen, onClose, userId }: QrScannerModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingResult, setProcessingResult] = useState<{success: boolean, message: string} | null>(null);
  const { toast } = useToast();
  const [scanner, setScanner] = useState<any>(null); // Using any for QrScanner type

  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      setProcessingResult(null);
      setIsLoading(false);
      
      import('qr-scanner').then(module => {
        const QrScanner = module.default;
        const getCameraPermissionAndStartScanner = async () => {
          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              setHasCameraPermission(false);
              toast({ variant: 'destructive', title: 'Câmera não suportada', description: 'Seu navegador não suporta acesso à câmera.' });
              return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setHasCameraPermission(true);

            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              const qrScannerInstance = new QrScanner(
                videoRef.current,
                result => handleScan(result.data),
                { 
                  highlightScanRegion: true,
                  highlightCodeOutline: true,
                  onDecodeError: error => {
                    if (error !== 'No QR code found') { 
                      // console.warn('QR Scan Error:', error); // Optionally log non-critical errors
                    }
                  }
                 }
              );
              setScanner(qrScannerInstance);
              qrScannerInstance.start().catch(err => {
                console.error("Failed to start QR Scanner: ", err);
                setHasCameraPermission(false);
                 toast({ variant: 'destructive', title: 'Erro ao Iniciar Scanner', description: 'Não foi possível iniciar o scanner de QR.' });
              });
            }
          } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
            toast({
              variant: 'destructive',
              title: 'Acesso à Câmera Negado',
              description: 'Por favor, habilite a permissão da câmera nas configurações do seu navegador.',
            });
          }
        };
        getCameraPermissionAndStartScanner();
      }).catch(err => {
        console.error("Failed to load qr-scanner module", err);
        toast({ variant: 'destructive', title: 'Erro no Scanner', description: 'Não foi possível carregar o módulo de scanner.' });
      });

      return () => { 
        if (scanner) {
          scanner.stop();
          scanner.destroy();
          setScanner(null);
        }
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleScan = async (data: string) => {
    if (isLoading || processingResult) return; 

    setScanResult(data);
    setIsLoading(true);
    setProcessingResult(null);

    if (scanner) scanner.stop();

    try {
      const parsedData: QrCodePayload = JSON.parse(data);
      if (!parsedData.eventId || !parsedData.partnerId || !parsedData.token) {
        throw new Error("QR Code inválido ou mal formatado.");
      }

      const eventDocRef = doc(firestore, `users/${parsedData.partnerId}/events/${parsedData.eventId}`);
      const eventDocSnap = await getDoc(eventDocRef);

      if (!eventDocSnap.exists()) {
        throw new Error("Evento não encontrado.");
      }
      const eventData = eventDocSnap.data();
      if (eventData.checkInToken !== parsedData.token) {
        throw new Error("Token de check-in inválido para este evento.");
      }

      const partnerCheckInDocRef = doc(firestore, `users/${parsedData.partnerId}/events/${parsedData.eventId}/checkIns/${userId}`);
      const partnerCheckInDocSnap = await getDoc(partnerCheckInDocRef);

      if (partnerCheckInDocSnap.exists()) {
         setProcessingResult({success: false, message: "Você já fez check-in neste evento."});
         setIsLoading(false);
         return;
      }
      
      // Record check-in for the partner
      await setDoc(partnerCheckInDocRef, {
        userId: userId,
        checkedInAt: serverTimestamp(),
        eventId: parsedData.eventId,
        partnerId: parsedData.partnerId,
        eventName: eventData.eventName, 
      });
      
      // Record check-in for the user
      const userCheckedInEventRef = doc(firestore, `users/${userId}/checkedInEvents/${parsedData.eventId}`);
      await setDoc(userCheckedInEventRef, {
          eventId: parsedData.eventId,
          partnerId: parsedData.partnerId,
          eventName: eventData.eventName, 
          checkedInAt: serverTimestamp(),
          hasRated: false, // Initialize hasRated to false
      });

      setProcessingResult({success: true, message: `Check-in realizado com sucesso no evento: ${eventData.eventName}!`});
      toast({
        title: "Check-in Confirmado!",
        description: `Você fez check-in em: ${eventData.eventName}. Agora você pode avaliar este evento!`,
        variant: "default",
        duration: 5000,
      });

    } catch (error: any) {
      console.error("Check-in error:", error);
      let displayMessage = "Erro ao processar QR Code. Tente novamente.";
      if (error.message.includes("JSON")) {
        displayMessage = "Formato de QR Code inválido.";
      } else if (error.message) {
        displayMessage = error.message;
      }
      setProcessingResult({success: false, message: displayMessage});
      toast({
        variant: 'destructive',
        title: 'Falha no Check-in',
        description: displayMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    if (scanner) {
        scanner.stop();
    }
     if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
    setHasCameraPermission(null); 
    onClose();
  }


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Check-in com QR Code</DialogTitle>
          <DialogDescription>
            Aponte a câmera para o QR Code do evento para confirmar sua presença.
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-4">
          {hasCameraPermission === null && !processingResult && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Loader2 className="w-8 h-8 mb-2 animate-spin" />
              Solicitando acesso à câmera...
            </div>
          )}
          {hasCameraPermission === false && !processingResult &&(
            <Alert variant="destructive">
              <AlertTitle>Acesso à Câmera Necessário</AlertTitle>
              <AlertDescription>
                Por favor, permita o acesso à câmera nas configurações do seu navegador para escanear o QR Code.
                Recarregue a página após conceder a permissão, se necessário.
              </AlertDescription>
            </Alert>
          )}
          
          {hasCameraPermission && !scanResult && !processingResult && (
            <div className="relative w-full aspect-square overflow-hidden rounded-md border bg-muted">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-3/4 h-3/4 border-4 border-dashed border-primary/50 rounded-lg opacity-75"/>
              </div>
            </div>
          )}

          {isLoading && (
             <div className="flex flex-col items-center justify-center h-64 text-foreground">
                <Loader2 className="w-10 h-10 mb-3 animate-spin text-primary" />
                Processando QR Code...
            </div>
          )}

          {processingResult && (
            <div className={`flex flex-col items-center justify-center h-64 p-4 rounded-md ${processingResult.success ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {processingResult.success ? 
                    <CheckCircle2 className="w-16 h-16 mb-4 text-green-600" /> : 
                    <XCircle className="w-16 h-16 mb-4 text-red-600" />
                }
                <p className={`text-lg font-semibold text-center ${processingResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {processingResult.message}
                </p>
                 {processingResult.success && (
                    <Button variant="link" className="mt-2 text-primary" onClick={handleCloseModal}>
                        Ver eventos e avaliar
                    </Button>
                 )}
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseModal}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QrScannerModal;
