'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { firestore, auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

// Basic RG validation (can be improved based on specific country format)
const rgRegex = /^[a-zA-Z0-9.-]{5,20}$/;

const purchaseTicketSchema = z.object({
  userName: z.string().min(3, { message: 'O nome deve ter pelo menos 3 caracteres.' }),
  userRG: z.string().regex(rgRegex, { message: 'RG inválido. Verifique o formato.' }),
});

type PurchaseTicketFormInputs = z.infer<typeof purchaseTicketSchema>;

interface PurchaseTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  partnerId: string;
  partnerVenueName: string;
  currentUser: FirebaseUser | null;
}

export function PurchaseTicketModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  partnerId,
  partnerVenueName,
  currentUser,
}: PurchaseTicketModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);

  const { control, handleSubmit, formState: { errors }, reset, setValue } = useForm<PurchaseTicketFormInputs>({
    resolver: zodResolver(purchaseTicketSchema),
    defaultValues: {
      userName: '',
      userRG: '',
    },
  });

  useEffect(() => {
    if (isOpen && currentUser) {
      // Pre-fill name from user's profile if available
      const userDocRef = doc(firestore, "users", currentUser.uid);
      getDoc(userDocRef).then(docSnap => {
        if (docSnap.exists()) {
          setValue('userName', docSnap.data().name || currentUser.displayName || '');
        } else {
          setValue('userName', currentUser.displayName || '');
        }
      });

      // Check if user already purchased a ticket for this event
      const ticketsRef = collection(firestore, 'purchasedTickets');
      const q = query(ticketsRef, where('userId', '==', currentUser.uid), where('eventId', '==', eventId));
      getDocs(q).then(snapshot => {
        if (!snapshot.empty) {
          setHasPurchased(true);
        } else {
          setHasPurchased(false);
        }
      });
    }
    if (!isOpen) {
      reset(); // Reset form when modal closes
      setHasPurchased(false);
    }
  }, [isOpen, currentUser, eventId, setValue, reset]);

  const onSubmit: SubmitHandler<PurchaseTicketFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Você precisa estar logado para comprar um ingresso.", variant: "destructive" });
      return;
    }
    if (hasPurchased) {
      toast({ title: "Ingresso Já Adquirido", description: "Você já possui um ingresso para este evento.", variant: "default" });
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketId = doc(collection(firestore, 'purchasedTickets')).id; // Generate a new ID
      const ticketDocRef = doc(firestore, 'purchasedTickets', ticketId);

      await setDoc(ticketDocRef, {
        userId: currentUser.uid,
        userName: data.userName,
        userRG: data.userRG.toUpperCase(), // Store RG in uppercase for easier searching
        eventId: eventId,
        eventName: eventName,
        partnerId: partnerId,
        partnerVenueName: partnerVenueName,
        purchasedAt: serverTimestamp(),
        status: 'active', // 'active', 'validated', 'cancelled'
      });

      toast({
        title: "Ingresso Adquirido!",
        description: `Seu ingresso para "${eventName}" foi registrado com sucesso. Apresente seu RG na entrada.`,
        variant: "default",
        duration: 7000,
      });
      onClose();
    } catch (error) {
      console.error("Error purchasing ticket:", error);
      toast({
        title: "Erro ao Comprar Ingresso",
        description: "Não foi possível registrar seu ingresso. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comprar Ingresso para {eventName}</DialogTitle>
          <DialogDescription>
            Preencha seus dados para adquirir o ingresso. Seu RG será usado para validação na entrada do evento.
          </DialogDescription>
        </DialogHeader>
        {hasPurchased ? (
           <div className="py-4 text-center">
            <p className="text-lg font-semibold text-primary">Você já possui um ingresso para este evento!</p>
            <p className="text-sm text-muted-foreground">Apresente seu RG na entrada.</p>
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="userName">Nome Completo</Label>
            <Controller
              name="userName"
              control={control}
              render={({ field }) => <Input id="userName" {...field} className={errors.userName ? 'border-destructive' : ''} />}
            />
            {errors.userName && <p className="text-sm text-destructive mt-1">{errors.userName.message}</p>}
          </div>
          <div>
            <Label htmlFor="userRG">RG (Documento de Identidade)</Label>
            <Controller
              name="userRG"
              control={control}
              render={({ field }) => <Input id="userRG" placeholder="Ex: 12.345.678-9 ou MG12345678" {...field} className={errors.userRG ? 'border-destructive' : ''} />}
            />
            {errors.userRG && <p className="text-sm text-destructive mt-1">{errors.userRG.message}</p>}
          </div>
          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Adquirir Ingresso
            </Button>
          </DialogFooter>
        </form>
        )}
        {!hasPurchased && (
            <DialogFooter className={hasPurchased ? "pt-2" : "pt-0"}>
                 {hasPurchased && <DialogClose asChild><Button type="button" variant="outline" onClick={onClose}>Fechar</Button></DialogClose>}
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
