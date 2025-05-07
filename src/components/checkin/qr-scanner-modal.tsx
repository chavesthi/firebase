
'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Loader2, XCircle, CheckCircle2, CameraOff } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [scanResult, setScanResult] = useState<string | null>(null); // To hold raw scan data, not directly used for UI display anymore
  const [isLoading, setIsLoading] = useState(false); // Combined loading for permission and processing
  const [processingResult, setProcessingResult] = useState<{success: boolean, message: string} | null>(null);
  const { toast } = useToast();
  const [scanner, setScanner] = useState<any>(null); // Using any for QrScanner type

  useEffect(() => {
    let qrScannerInstance: any = null;
    let streamInstance: MediaStream | null = null;

    if (isOpen) {
      setScanResult(null);
      setProcessingResult(null);
      setIsLoading(true); // Start with loading true to request permission
      setHasCameraPermission(null);
      
      import('qr-scanner').then(module => {
        const QrScanner = module.default;
        const getCameraPermissionAndStartScanner = async () => {
          if (!videoRef.current) {
            // This should ideally not happen if video tag is always rendered
            toast({ variant: 'destructive', title: 'Erro Interno', description: 'Referência do vídeo não encontrada.' });
            setIsLoading(false);
            setHasCameraPermission(false);
            return;
          }

          try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              setHasCameraPermission(false);
              toast({ variant: 'destructive', title: 'Câmera não suportada', description: 'Seu navegador não suporta acesso à câmera.' });
              setIsLoading(false);
              return;
            }
            streamInstance = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setHasCameraPermission(true);
            setIsLoading(false); // Permission granted, stop initial loading

            if (videoRef.current) {
              videoRef.current.srcObject = streamInstance;
              qrScannerInstance = new QrScanner(
                videoRef.current,
                result => handleScan(result.data),
                { 
                  highlightScanRegion: false, // Custom overlay will handle this
                  highlightCodeOutline: true,
                  onDecodeError: error => {
                    if (error !== 'No QR code found') { 
                      // console.warn('QR Scan Error:', error);
                    }
                  }
                 }
              );
              setScanner(qrScannerInstance);
              qrScannerInstance.start().catch(err => {
                console.error("Failed to start QR Scanner: ", err);
                setHasCameraPermission(false); // Scanner failed to start
                setIsLoading(false);
                toast({ variant: 'destructive', title: 'Erro ao Iniciar Scanner', description: 'Não foi possível iniciar o scanner de QR.' });
              });
            }
          } catch (error) {
            console.error('Error accessing camera:', error);
            setHasCameraPermission(false);
            setIsLoading(false);
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
        setIsLoading(false);
        setHasCameraPermission(false);
        toast({ variant: 'destructive', title: 'Erro no Scanner', description: 'Não foi possível carregar o módulo de scanner.' });
      });

      return () => { 
        if (qrScannerInstance) {
          qrScannerInstance.stop();
          qrScannerInstance.destroy();
          setScanner(null);
        }
        if (streamInstance) {
          streamInstance.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleScan = async (data: string) => {
    if (isLoading || processingResult) return; 

    setScanResult(data); // Store raw scan data
    setIsLoading(true);  // Set loading for processing
    setProcessingResult(null);

    if (scanner) scanner.stop(); // Stop scanner once a QR is found and processing starts

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
      
      await setDoc(partnerCheckInDocRef, {
        userId: userId,
        checkedInAt: serverTimestamp(),
        eventId: parsedData.eventId,
        partnerId: parsedData.partnerId,
        eventName: eventData.eventName, 
      });
      
      const userCheckedInEventRef = doc(firestore, `users/${userId}/checkedInEvents/${parsedData.eventId}`);
      await setDoc(userCheckedInEventRef, {
          eventId: parsedData.eventId,
          partnerId: parsedData.partnerId,
          eventName: eventData.eventName, 
          checkedInAt: serverTimestamp(),
          hasRated: false, 
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
      setIsLoading(false); // Processing finished
    }
  };

  const handleCloseModal = () => {
    // Cleanup is handled by useEffect return statement when isOpen changes
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
          <div className="relative w-full aspect-square overflow-hidden rounded-md border bg-muted">
            <video 
              ref={videoRef} 
              className={cn(
                "w-full h-full object-cover",
                // Hide video element visually if camera not active or processing result is shown
                (!hasCameraPermission || isLoading || processingResult) && "opacity-0"
              )} 
              autoPlay 
              playsInline 
              muted 
            />

            {/* Scan Region Overlay - show only when camera is active and not processing */}
            {hasCameraPermission && !isLoading && !processingResult && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-3/4 border-4 border-dashed border-primary/50 rounded-lg opacity-75"/>
              </div>
            )}

            {/* Loading Overlay (for permission request or QR processing) */}
            {isLoading && !processingResult && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90">
                <Loader2 className="w-10 h-10 mb-3 animate-spin text-primary" />
                <p className="text-foreground">
                  {hasCameraPermission === null ? 'Solicitando acesso à câmera...' : 'Processando QR Code...'}
                </p>
              </div>
            )}
            
            {/* Initial state or camera denied explicitly (but not processing result) */}
            {hasCameraPermission === null && !isLoading && !processingResult && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90">
                    <Loader2 className="w-10 h-10 mb-3 animate-spin text-primary" />
                    <p className="text-foreground">Iniciando câmera...</p>
                 </div>
            )}


            {/* Processing Result Overlay */}
            {processingResult && (
              <div className={cn(
                "absolute inset-0 flex flex-col items-center justify-center p-4 rounded-md",
                processingResult.success ? 'bg-green-100/90 dark:bg-green-900/80' : 'bg-red-100/90 dark:bg-red-900/80'
              )}>
                  {processingResult.success ? 
                      <CheckCircle2 className="w-16 h-16 mb-4 text-green-600" /> : 
                      <XCircle className="w-16 h-16 mb-4 text-red-600" />
                  }
                  <p className={cn(
                    "text-lg font-semibold text-center",
                    processingResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                  )}>
                      {processingResult.message}
                  </p>
                  {processingResult.success && (
                      <Button variant="link" className="mt-2 text-primary" onClick={handleCloseModal}>
                          Ver eventos e avaliar
                      </Button>
                  )}
                   {!processingResult.success && (
                      <Button variant="outline" className="mt-4" onClick={() => {
                          setProcessingResult(null);
                          setScanResult(null);
                          setIsLoading(false); // Reset loading state
                          if (scanner) scanner.start().catch(console.error); // Attempt to restart scanner
                          else if (isOpen) { // If scanner is null, try to re-init (edge case)
                             // This re-triggers the useEffect if isOpen changes, so just set hasCameraPermission back to null
                             setHasCameraPermission(null);
                             setIsLoading(true); // Trigger loading state for re-init attempt via useEffect
                             // The useEffect dependency on isOpen will handle re-init if it's closed and reopened.
                             // For now, just clearing result is main goal.
                          }
                      }}>
                          Tentar Novamente
                      </Button>
                  )}
              </div>
            )}
          </div>

          {/* Alert for camera permission denied (when not loading and not showing a processing result) */}
          {hasCameraPermission === false && !isLoading && !processingResult && (
            <Alert variant="destructive" className="mt-4">
              <CameraOff className="h-4 w-4" /> {/* Included from original AlertDialog, good for visual cue */}
              <AlertTitle>Acesso à Câmera Necessário</AlertTitle>
              <AlertDescription>
                Por favor, permita o acesso à câmera nas configurações do seu navegador para escanear o QR Code.
                Pode ser necessário recarregar a página após conceder a permissão.
              </AlertDescription>
            </Alert>
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
