
'use client';

import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const messageSchema = z.object({
  text: z.string().min(1, { message: "A mensagem não pode estar vazia." }).max(500, { message: "Mensagem muito longa (máx. 500 caracteres)." }),
});

type MessageFormInputs = z.infer<typeof messageSchema>;

interface ChatInputFormProps {
  chatRoomId: string;
  userId: string;
  userName: string;
  userPhotoURL?: string | null;
}

export function ChatInputForm({ chatRoomId, userId, userName, userPhotoURL }: ChatInputFormProps) {
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MessageFormInputs>({
    resolver: zodResolver(messageSchema),
  });

  const onSubmit: SubmitHandler<MessageFormInputs> = async (data) => {
    if (!data.text.trim()) return;

    const messagesRef = collection(firestore, `chatRooms/${chatRoomId}/messages`);
    try {
      await addDoc(messagesRef, {
        userId,
        userName,
        userPhotoURL: userPhotoURL || null,
        text: data.text.trim(),
        timestamp: serverTimestamp(),
      });
      reset();
    } catch (error) {
      console.error("Error sending message: ", error);
      toast({
        title: "Erro ao Enviar Mensagem",
        description: "Não foi possível enviar sua mensagem. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex items-center gap-2 sm:gap-3">
      <Input
        {...register('text')}
        placeholder="Digite sua mensagem..."
        className={`flex-1 ${errors.text ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        autoComplete="off"
        disabled={isSubmitting}
      />
      <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        <span className="sr-only">Enviar</span>
      </Button>
      {errors.text && <p className="text-xs text-destructive absolute -bottom-5 left-0">{errors.text.message}</p>}
    </form>
  );
}
