
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


const ChatInfoPage = () => {
  const router = useRouter();

  // Redirect to map page as chat is now event-specific there
  useEffect(() => {
    router.replace('/map');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-background">
      <Card className="w-full max-w-md text-center border-primary/50 shadow-xl">
        <CardHeader>
          <div className="mx-auto p-3 bg-primary/10 rounded-full w-fit mb-4">
            <MessageSquare className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-2xl text-primary">Fervo Chat nos Eventos!</CardTitle>
          <CardDescription className="text-muted-foreground">
            Redirecionando para o mapa... O chat agora é específico para cada evento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-foreground">
            Para participar do chat exclusivo de um evento, primeiro faça check-in nele através do mapa.
          </p>
          <p className="text-sm text-muted-foreground">
            Lá você poderá interagir com outros fervoreiros que também estão curtindo o mesmo evento que você!
          </p>
          <Button onClick={() => router.push('/map')} className="mt-6 w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Ir para o Mapa de Eventos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatInfoPage;
