
'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle, Loader2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL?: string | null;
  text: string;
  timestamp: FirebaseTimestamp;
}

interface ChatMessageListProps {
  chatRoomId: string;
  currentUserId: string;
  isChatSoundMuted: boolean;
  chatClearedTimestamp: number | null; // This prop is kept for potential future use but current clear logic deletes from DB
}

export function ChatMessageList({ chatRoomId, currentUserId, isChatSoundMuted }: ChatMessageListProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlayedMessageIdRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true); 

  useEffect(() => {
    setIsLoading(true);
    const messagesRef = collection(firestore, `chatRooms/${chatRoomId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    initialLoadRef.current = true; 

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let fetchedMessages: ChatMessage[] = [];
      querySnapshot.forEach((doc) => {
        fetchedMessages.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      
      setMessages(fetchedMessages);
      setIsLoading(false);

      if (fetchedMessages.length > 0) {
        if (initialLoadRef.current) {
          lastPlayedMessageIdRef.current = fetchedMessages[fetchedMessages.length - 1].id;
          initialLoadRef.current = false;
        }
      } else {
        initialLoadRef.current = false; 
      }

    }, (error) => {
      console.error("Error fetching messages: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [chatRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  useEffect(() => {
    if (isLoading || isChatSoundMuted || messages.length === 0 || initialLoadRef.current) {
      return;
    }

    const latestMessage = messages[messages.length - 1];

    if (latestMessage && latestMessage.id !== lastPlayedMessageIdRef.current && latestMessage.userId !== currentUserId) {
      audioRef.current?.play().catch(error => console.warn("Chat sound play failed:", error));
      lastPlayedMessageIdRef.current = latestMessage.id;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isChatSoundMuted, currentUserId, isLoading]); 


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="ml-2 text-muted-foreground">Carregando mensagens...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-full">
        <MessageSquare className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-center">
          Nenhuma mensagem ainda.<br/>Seja o primeiro a iniciar a conversa!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
        const isCurrentUser = msg.userId === currentUserId;
        return (
          <div
            key={msg.id}
            className={cn(
              'flex items-start gap-2 sm:gap-3 max-w-[85%] sm:max-w-[75%]',
              isCurrentUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
            )}
          >
            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-primary/50">
              <AvatarImage src={msg.userPhotoURL || undefined} alt={msg.userName} data-ai-hint="user avatar" />
              <AvatarFallback className="text-xs sm:text-sm bg-muted text-muted-foreground">
                {msg.userName ? msg.userName.charAt(0).toUpperCase() : <UserCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
                'rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 shadow-md break-words',
                isCurrentUser ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card text-card-foreground rounded-bl-none border border-border'
            )}>
              {!isCurrentUser && (
                <p className="text-xs sm:text-sm font-semibold text-accent mb-0.5">{msg.userName}</p>
              )}
              <p className="text-sm sm:text-base leading-relaxed">{msg.text}</p>
              <p className={cn(
                  "text-xs mt-1 opacity-70",
                  isCurrentUser ? "text-primary-foreground/80 text-right" : "text-muted-foreground text-left"
              )}>
                {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm', { locale: ptBR }) : ''}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
      <audio ref={audioRef} src="/audio/livechat-129007.mp3" preload="auto" />
    </div>
  );
}
