
// This page is no longer directly used as chat functionality has been integrated into the map page.
// It's kept here for reference or if a separate chat page is desired in the future.
// To re-enable, ensure the floating button in layout.tsx points back to /chat.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const ChatPageRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect users from the old /chat page to the map page where the chat widget now lives.
    router.replace('/map'); 
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
      <Loader2 className="w-12 h-12 text-primary animate-spin" />
      <p className="mt-4 text-lg text-muted-foreground">Redirecionando para o mapa...</p>
      <p className="text-sm text-muted-foreground">O Fervo Chat agora está integrado à página do mapa!</p>
    </div>
  );
};

export default ChatPageRedirect;
