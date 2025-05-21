
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatInputForm } from '@/components/chat/chat-input-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, AlertCircle } from 'lucide-react';

interface AppUserProfile {
  uid: string;
  name?: string;
  email?: string | null;
  photoURL?: string | null;
  address?: {
    city?: string;
    state?: string;
  };
  questionnaireCompleted?: boolean;
}

const ChatPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appUserProfile, setAppUserProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDocRef = doc(firestore, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const profile: AppUserProfile = {
              uid: user.uid,
              name: userData.name || user.displayName,
              email: user.email,
              photoURL: userData.photoURL || user.photoURL,
              address: userData.address,
              questionnaireCompleted: userData.questionnaireCompleted,
            };
            setAppUserProfile(profile);

            if (userData.address?.city && userData.address?.state) {
              const city = userData.address.city.toUpperCase().replace(/\s+/g, '_');
              const state = userData.address.state.toUpperCase().replace(/\s+/g, '_');
              setChatRoomId(`${state}_${city}`);
            } else {
              setChatRoomId(null);
            }
          } else {
            toast({ title: "Perfil não encontrado", description: "Complete seu perfil para usar o chat.", variant: "destructive" });
            setAppUserProfile({ uid: user.uid }); // Basic profile
          }
        } catch (error) {
          console.error("Error fetching user profile for chat:", error);
          toast({ title: "Erro ao carregar perfil", variant: "destructive" });
          setAppUserProfile({ uid: user.uid }); // Basic profile
        }
      } else {
        router.push('/login');
      }
      setIsLoading(false);
    });
    return () => unsubscribeAuth();
  }, [router, toast]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="mt-4 text-lg text-muted-foreground">Carregando Fervo Chat...</p>
      </div>
    );
  }

  if (!currentUser || !appUserProfile) {
    // This case should ideally be handled by the redirect in useEffect, but as a fallback
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-lg">Você precisa estar logado para acessar o chat.</p>
        <Button onClick={() => router.push('/login')} className="mt-4">Fazer Login</Button>
      </div>
    );
  }

  if (!appUserProfile.questionnaireCompleted || !appUserProfile.address?.city || !appUserProfile.address?.state) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-primary">Complete seu Perfil</CardTitle>
            <CardDescription>
              Para usar o Fervo Chat, precisamos que você defina sua Cidade e Estado em seu perfil. O chat conecta você com outros fervorosos da região que você cadastrar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user/profile">
              <Button className="w-full">Completar Perfil Agora</Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-3">
              O chat é agrupado por Estado e Cidade para conectar você com Fervorosos próximos!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }


  if (!chatRoomId) {
     return (
      <div className="container mx-auto py-8 px-4 text-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
             <AlertCircle className="w-12 h-12 text-destructive mb-4 mx-auto" />
            <CardTitle className="text-destructive">Localização Não Definida</CardTitle>
            <CardDescription>
              Não foi possível determinar sua cidade e estado para o chat.
              Por favor, verifique seu perfil.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user/profile">
              <Button className="w-full" variant="outline">Ir para o Perfil</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const chatRoomDisplayName = `${appUserProfile.address.city}, ${appUserProfile.address.state}`;

  return (
    <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4 flex flex-col h-[calc(100vh-5rem)] max-h-[calc(100vh-5rem)]">
      <Card className="flex-1 flex flex-col overflow-hidden border-primary/30 shadow-lg">
        <CardHeader className="p-3 sm:p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            <div>
                <CardTitle className="text-lg sm:text-xl text-primary">Fervo Chat: {chatRoomDisplayName}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Conecte-se com outros Fervorosos na sua área!</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 bg-background/30">
          <ChatMessageList chatRoomId={chatRoomId} currentUserId={currentUser.uid} />
        </CardContent>
        <div className="p-3 sm:p-4 border-t border-border bg-card">
          <ChatInputForm
            chatRoomId={chatRoomId}
            userId={currentUser.uid}
            userName={appUserProfile.name || 'Usuário Anônimo'}
            userPhotoURL={appUserProfile.photoURL || null}
          />
        </div>
      </Card>
    </div>
  );
};

export default ChatPage;
