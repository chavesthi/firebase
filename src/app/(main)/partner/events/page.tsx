
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, deleteDoc, Timestamp, writeBatch, onSnapshot, orderBy, type FieldValue, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { MusicStyle, MUSIC_STYLE_OPTIONS, PricingType, PRICING_TYPE_OPTIONS, APP_URL } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Edit, Trash2, Eye, EyeOff, Save, CalendarDays, Clapperboard, ArrowLeft, QrCode, Loader2, Share2, Trash, Ticket, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm format

const eventFormSchema = z.object({
  eventName: z.string().min(3, { message: 'O nome do evento deve ter pelo menos 3 caracteres.' }),
  startDate: z.date({ required_error: 'Data de início é obrigatória.' }),
  startTime: z.string().regex(timeRegex, { message: 'Hora de início inválida (HH:mm).' }),
  endDate: z.date({ required_error: 'Data de fim é obrigatória.' }),
  endTime: z.string().regex(timeRegex, { message: 'Hora de fim inválida (HH:mm).' }),
  musicStyles: z.array(z.nativeEnum(MusicStyle))
    .max(4, { message: "Selecione no máximo 4 estilos musicais." })
    .optional().default([]),
  pricingType: z.nativeEnum(PricingType, { errorMap: () => ({ message: 'Selecione um tipo de preço.' }) }),
  pricingValue: z.coerce.number().positive({ message: 'Valor deve ser positivo.' }).optional(),
  description: z.string().max(500, { message: 'Descrição muito longa (máx. 500 caracteres).' }).optional(),
  visibility: z.boolean().default(true),
  shareRewardsEnabled: z.boolean().default(true),
  ticketPurchaseUrl: z.string().url({ message: "URL de compra de ingresso inválida." }).optional().or(z.literal('')),
}).refine(data => {
    if (data.pricingType !== PricingType.FREE && (data.pricingValue === undefined || data.pricingValue <= 0)) {
        return false;
    }
    return true;
}, {
    message: 'Valor é obrigatório para este tipo de preço e deve ser positivo.',
    path: ['pricingValue'],
})
.refine(data => {
    const startDateTime = new Date(data.startDate);
    const [startHours, startMinutes] = data.startTime.split(':').map(Number);
    startDateTime.setHours(startHours, startMinutes);

    const endDateTime = new Date(data.endDate);
    const [endHours, endMinutes] = data.endTime.split(':').map(Number);
    endDateTime.setHours(endHours, endMinutes);

    return endDateTime > startDateTime;
}, {
    message: 'A data/hora de fim deve ser posterior à data/hora de início.',
    path: ['endDate'],
});


type EventFormInputs = z.infer<typeof eventFormSchema>;

interface EventDocument extends EventFormInputs {
  id: string;
  partnerId: string;
  startDateTime: Timestamp;
  endDateTime: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  checkInToken?: string;
  pricingValue?: number | null;
  averageRating?: number;
  ratingCount?: number;
  shareRewardsEnabled: boolean;
  ticketPurchaseUrl?: string | null;
}

const isEventHappeningNow = (startDateTime: Timestamp, endDateTime: Timestamp): boolean => {
  const now = new Date();
  const startTime = startDateTime.toDate();
  const endTime = endDateTime.toDate();
  return now >= startTime && now <= endTime;
};

const isEventPast = (endDateTime: Timestamp): boolean => {
    const now = new Date();
    return endDateTime.toDate() < now;
}


const ManageEventsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Seu Local');
  const [loading, setLoading] = useState(true);
  const [partnerEvents, setPartnerEvents] = useState<EventDocument[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isDeletingPastEvents, setIsDeletingPastEvents] = useState(false);

  const [partnerCreatedAt, setPartnerCreatedAt] = useState<Timestamp | null>(null);
  const [isSubscribedOrTrialing, setIsSubscribedOrTrialing] = useState<boolean>(true); // Default to true to avoid brief flicker of disabled state
  const [canCreateEvents, setCanCreateEvents] = useState<boolean>(true); // Default to true

  const { control, handleSubmit, formState: { errors, isSubmitting }, watch, reset } = useForm<EventFormInputs>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventName: '',
      startDate: new Date(),
      startTime: format(new Date(), 'HH:mm'),
      endDate: new Date(),
      endTime: format(new Date(new Date().getTime() + 60 * 60 * 1000 * 2), 'HH:mm'), // 2 hours later
      musicStyles: [],
      pricingType: PricingType.FREE,
      pricingValue: undefined,
      description: '',
      visibility: true,
      shareRewardsEnabled: true,
      ticketPurchaseUrl: '',
    },
  });

  const watchedPricingType = watch('pricingType');

  useEffect(() => {
    let unsubscribeEvents: (() => void) | null = null;
    let unsubscribePartnerStatus: (() => void) | null = null;
    let unsubscribeSubscriptionStatus: (() => void) | null = null;


    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(true);

        // Fetch partner's name and creation date
        const userDocRef = doc(firestore, 'users', user.uid);
        unsubscribePartnerStatus = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                setPartnerName(userData?.venueName || 'Seu Local');
                setPartnerCreatedAt(userData?.createdAt as Timestamp || null);
            }
        });
        
        // Listen for subscription status
        const subscriptionsQuery = query(collection(firestore, `customers/${user.uid}/subscriptions`), where("status", "in", ["trialing", "active"]));
        unsubscribeSubscriptionStatus = onSnapshot(subscriptionsQuery, (subscriptionsSnap) => {
            setIsSubscribedOrTrialing(!subscriptionsSnap.empty);
        }, (error) => {
            console.error("Error fetching Stripe subscription status:", error);
            setIsSubscribedOrTrialing(false); // Assume not subscribed on error
        });


        // Fetch events
        const eventsCollectionRef = collection(firestore, 'users', user.uid, 'events');
        const q = query(eventsCollectionRef, orderBy('updatedAt', 'desc'));

        if (unsubscribeEvents) unsubscribeEvents();
        unsubscribeEvents = onSnapshot(q, (snapshot) => {
          const eventsData = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
          } as EventDocument));
          setPartnerEvents(eventsData);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching events with onSnapshot:", error);
          toast({ title: "Erro ao buscar eventos", variant: "destructive" });
          setLoading(false);
        });

      } else {
        router.push('/login');
        if (unsubscribeEvents) unsubscribeEvents();
        if (unsubscribePartnerStatus) unsubscribePartnerStatus();
        if (unsubscribeSubscriptionStatus) unsubscribeSubscriptionStatus();
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeEvents) unsubscribeEvents();
      if (unsubscribePartnerStatus) unsubscribePartnerStatus();
      if (unsubscribeSubscriptionStatus) unsubscribeSubscriptionStatus();
    };
  }, [router, toast]);

  useEffect(() => {
    if (partnerCreatedAt === null) { // Still loading or partner data not found
        setCanCreateEvents(true); // Default to allow while loading essential data
        return;
    }

    if (isSubscribedOrTrialing) {
        setCanCreateEvents(true);
    } else {
        const trialEndDate = new Date(partnerCreatedAt.toDate().getTime() + 15 * 24 * 60 * 60 * 1000);
        const isTrialStillActive = new Date() <= trialEndDate;
        setCanCreateEvents(isTrialStillActive);
    }
  }, [partnerCreatedAt, isSubscribedOrTrialing]);


  const combineDateAndTime = (date: Date, time: string): Timestamp => {
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return Timestamp.fromDate(combined);
  };

  const onSubmit: SubmitHandler<EventFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }
    if (!canCreateEvents) {
        toast({ title: "Criação de Eventos Bloqueada", description: "Seu período de teste expirou. Por favor, assine o plano para continuar criando eventos.", variant: "destructive", duration: 7000 });
        return;
    }


    const eventsCollectionRef = collection(firestore, 'users', currentUser.uid, 'events');
    const existingEvent = editingEventId ? partnerEvents.find(e => e.id === editingEventId) : null;

    if (!editingEventId && data.visibility) {
        const visibleEvents = partnerEvents.filter(event => event.visibility);
        if (visibleEvents.length >= 5) {
            toast({
                title: "Limite de Eventos Visíveis Atingido",
                description: "Você pode ter no máximo 5 eventos visíveis. Crie como não visível ou oculte um evento existente.",
                variant: "destructive",
                duration: 7000,
            });
            return;
        }
    }

    const eventDataForFirestore: any = {
      partnerId: currentUser.uid,
      eventName: data.eventName,
      startDateTime: combineDateAndTime(data.startDate, data.startTime),
      endDateTime: combineDateAndTime(data.endDate, data.endTime),
      musicStyles: data.musicStyles || [],
      pricingType: data.pricingType,
      pricingValue: data.pricingType === PricingType.FREE ? null : (data.pricingValue ?? null),
      description: data.description || '',
      visibility: data.visibility,
      shareRewardsEnabled: data.shareRewardsEnabled,
      ticketPurchaseUrl: data.ticketPurchaseUrl || null,
      checkInToken: existingEvent?.checkInToken || (doc(collection(firestore, `users/${currentUser.uid}/events`)).id.slice(0,10).toUpperCase()),
      averageRating: existingEvent?.averageRating ?? 0,
      ratingCount: existingEvent?.ratingCount ?? 0,
    };


    try {
      if (editingEventId) {
        const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', editingEventId);
        eventDataForFirestore.updatedAt = serverTimestamp();
        await updateDoc(eventDocRef, eventDataForFirestore);
        toast({ title: "Evento Atualizado!", description: "O evento foi atualizado com sucesso." });
      } else {
        eventDataForFirestore.createdAt = serverTimestamp();
        eventDataForFirestore.updatedAt = serverTimestamp();
        await addDoc(eventsCollectionRef, eventDataForFirestore);
        toast({ title: "Evento Criado!", description: "O evento foi criado com sucesso." });
      }
      reset();
      setEditingEventId(null);
    } catch (error) {
      console.error("Error saving event:", error);
      toast({ title: "Erro ao Salvar Evento", description: "Não foi possível salvar o evento.", variant: "destructive" });
    }
  };

  const handleEditEvent = (event: EventDocument) => {
    if (!canCreateEvents && !event.visibility) { // Allow editing of non-visible past events even if trial expired
        const eventEndTime = event.endDateTime.toDate();
        if (eventEndTime < new Date()) {
             // Allow editing past, non-visible events for record keeping
        } else {
            toast({ title: "Edição Bloqueada", description: "Seu período de teste expirou. Assine para editar eventos futuros ou visíveis.", variant: "destructive", duration: 7000 });
            return;
        }
    } else if (!canCreateEvents && event.visibility) {
         toast({ title: "Edição Bloqueada", description: "Seu período de teste expirou. Assine para editar eventos.", variant: "destructive", duration: 7000 });
         return;
    }


    setEditingEventId(event.id);
    reset({
      eventName: event.eventName,
      startDate: event.startDateTime.toDate(),
      startTime: format(event.startDateTime.toDate(), 'HH:mm'),
      endDate: event.endDateTime.toDate(),
      endTime: format(event.endDateTime.toDate(), 'HH:mm'),
      musicStyles: event.musicStyles,
      pricingType: event.pricingType,
      pricingValue: event.pricingValue ?? undefined,
      description: event.description,
      visibility: event.visibility,
      shareRewardsEnabled: event.shareRewardsEnabled ?? true,
      ticketPurchaseUrl: event.ticketPurchaseUrl || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!currentUser) return;

    const confirmDelete = window.confirm("Tem certeza que deseja excluir este evento? As avaliações e comentários associados a ele serão mantidos para estatísticas gerais do local, mas o evento em si será removido.");
    if (!confirmDelete) return;

    try {
      const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', eventId);
      await deleteDoc(eventDocRef);

      toast({ title: "Evento Excluído", description: "O evento foi excluído. Suas avaliações foram preservadas para estatísticas do local." });
      if (editingEventId === eventId) {
        setEditingEventId(null);
        reset();
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      toast({ title: "Erro ao Excluir", description: "Não foi possível excluir o evento.", variant: "destructive" });
    }
  };

  const handleDeletePastEvents = async () => {
    if (!currentUser) return;

    const pastEvents = partnerEvents.filter(event => isEventPast(event.endDateTime));
    if (pastEvents.length === 0) {
      toast({ title: "Nenhum Evento Encerrado", description: "Não há eventos encerrados para excluir.", variant: "default" });
      return;
    }

    setIsDeletingPastEvents(true);
    try {
      const batch = writeBatch(firestore);
      pastEvents.forEach(event => {
        const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', event.id);
        batch.delete(eventDocRef);
      });
      await batch.commit();
      toast({ title: "Eventos Encerrados Excluídos", description: `${pastEvents.length} evento(s) encerrado(s) foram excluídos com sucesso.` });
    } catch (error) {
      console.error("Error deleting past events:", error);
      toast({ title: "Erro ao Excluir Eventos", description: "Não foi possível excluir os eventos encerrados.", variant: "destructive" });
    } finally {
      setIsDeletingPastEvents(false);
    }
  };

  const toggleEventVisibility = async (event: EventDocument) => {
    if (!currentUser) return;

    if (!canCreateEvents && !event.visibility) { 
      toast({ title: "Ação Bloqueada", description: "Seu período de teste expirou. Assine para tornar eventos visíveis.", variant: "destructive", duration: 7000 });
      return;
    }

    const newVisibility = !event.visibility;

    if (newVisibility) {
        const visibleEvents = partnerEvents.filter(e => e.visibility && e.id !== event.id);
        if (visibleEvents.length >= 5) {
             toast({
                title: "Limite de Eventos Visíveis Atingido",
                description: "Você pode ter no máximo 5 eventos visíveis. Oculte outro evento para tornar este visível.",
                variant: "destructive",
                duration: 7000,
            });
            return;
        }
    }

    try {
      const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', event.id);
      await updateDoc(eventDocRef, { visibility: newVisibility, updatedAt: serverTimestamp() });
      toast({ title: `Visibilidade Alterada`, description: `Evento agora está ${newVisibility ? 'visível' : 'oculto'}.` });
    } catch (error) {
      console.error("Error toggling visibility:", error);
      toast({ title: "Erro ao Alterar Visibilidade", variant: "destructive" });
    }
  };

  const handleSharePartnerEvent = async (event: EventDocument) => {
    if (!currentUser) {
        toast({ title: "Não Autenticado", description: "Faça login para compartilhar.", variant: "destructive" });
        return;
    }
    if (isEventPast(event.endDateTime)) {
        toast({ title: "Evento Encerrado", description: "Este evento já terminou e não pode mais ser compartilhado.", variant: "destructive" });
        return;
    }

    const shareUrl = `${APP_URL}/shared-event/${event.partnerId}/${event.id}`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: `Confira este Fervo: ${partnerName} - ${event.eventName}`,
                text: `Olha esse evento que encontrei no Fervo App!`,
                url: shareUrl,
            });
            toast({ title: "Compartilhado!", description: "Link do evento compartilhado com sucesso!", variant: "default" });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link Copiado!", description: "O link do evento foi copiado para a área de transferência.", variant: "default" });
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log('Share operation cancelled by user.');
            return;
        }
        console.error("Error sharing event:", error);
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link Copiado!", description: "O compartilhamento falhou ou não está disponível. O link foi copiado para a área de transferência!", variant: "default", duration: 6000 });
        } catch (clipError) {
            console.error('Failed to copy link to clipboard (fallback):', clipError);
            toast({ title: "Erro ao Copiar Link", description: "Não foi possível copiar o link do evento.", variant: "destructive" });
        }
    }
  };


  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            Painel
        </Button>
      </div>
      <Card className="mb-8 border-primary/50 shadow-lg shadow-primary/15">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-foreground flex items-center">
            <PlusCircle className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            {editingEventId ? 'Editar Evento' : 'Adicionar Novo Evento'}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm text-muted-foreground">
            {editingEventId ? 'Modifique os detalhes do seu evento.' : 'Crie um novo evento para seu local. Você pode ter até 5 eventos visíveis simultaneamente.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
             {!canCreateEvents && !editingEventId && (
                <div className="p-3 my-4 bg-destructive/10 border border-destructive/30 rounded-md text-center">
                    <AlertCircle className="w-5 h-5 inline-block mr-2 text-destructive" />
                    <p className="text-sm text-destructive">
                        Seu período de teste expirou. Para criar novos eventos, por favor, <Button variant="link" className="p-0 h-auto text-destructive underline" onClick={() => router.push('/partner/settings')}>assine um plano</Button>.
                    </p>
                </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="eventName" className="text-foreground">Nome do Evento</Label>
                <Controller name="eventName" control={control} render={({ field }) => <Input id="eventName" placeholder="Ex: Festa Neon Anos 2000" {...field} className={errors.eventName ? 'border-destructive' : ''} />} />
                {errors.eventName && <p className="mt-1 text-sm text-destructive">{errors.eventName.message}</p>}
              </div>

              <div>
                <Label htmlFor="startDate" className="text-foreground">Data de Início</Label>
                <Controller name="startDate" control={control} render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} className={errors.startDate ? 'border-destructive' : ''} />} />
                {errors.startDate && <p className="mt-1 text-sm text-destructive">{errors.startDate.message}</p>}
              </div>
              <div>
                <Label htmlFor="startTime" className="text-foreground">Hora de Início</Label>
                <Controller name="startTime" control={control} render={({ field }) => <Input id="startTime" type="time" {...field} className={errors.startTime ? 'border-destructive' : ''} />} />
                {errors.startTime && <p className="mt-1 text-sm text-destructive">{errors.startTime.message}</p>}
              </div>

              <div>
                <Label htmlFor="endDate" className="text-foreground">Data de Fim</Label>
                <Controller name="endDate" control={control} render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} className={errors.endDate ? 'border-destructive' : ''} />} />
                {errors.endDate && <p className="mt-1 text-sm text-destructive">{errors.endDate.message}</p>}
              </div>
              <div>
                <Label htmlFor="endTime" className="text-foreground">Hora de Fim</Label>
                <Controller name="endTime" control={control} render={({ field }) => <Input id="endTime" type="time" {...field} className={errors.endTime ? 'border-destructive' : ''} />} />
                {errors.endTime && <p className="mt-1 text-sm text-destructive">{errors.endTime.message}</p>}
              </div>

              <div className="md:col-span-2">
                <Label className="text-foreground">Estilos Musicais (Máx. 4)</Label>
                <ScrollArea className="h-32 p-2 border rounded-md border-input">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {MUSIC_STYLE_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Controller
                          name="musicStyles"
                          control={control}
                          render={({ field }) => (
                            <Checkbox
                              id={`event-music-${option.value}`}
                              checked={field.value?.includes(option.value)}
                              onCheckedChange={(checked) => {
                                const currentSelection = field.value || [];
                                if (checked) {
                                  if (currentSelection.length < 4) {
                                    field.onChange([...currentSelection, option.value]);
                                  } else {
                                    toast({ title: "Limite atingido", description: "Você pode selecionar no máximo 4 estilos.", variant: "destructive", duration: 3000 });
                                    return false;
                                  }
                                } else {
                                  field.onChange(currentSelection.filter((value) => value !== option.value));
                                }
                                return checked;
                              }}
                              disabled={!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4}
                            />
                          )}
                        />
                        <Label htmlFor={`event-music-${option.value}`} className="font-normal text-foreground/80 text-xs sm:text-sm">{option.label}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {errors.musicStyles && <p className="mt-1 text-sm text-destructive">{errors.musicStyles.message}</p>}
              </div>

              <div>
                <Label htmlFor="pricingType" className="text-foreground">Tipo de Preço</Label>
                <Controller
                  name="pricingType"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger id="pricingType" className={errors.pricingType ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Selecione o tipo de preço" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICING_TYPE_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.pricingType && <p className="mt-1 text-sm text-destructive">{errors.pricingType.message}</p>}
              </div>

              {watchedPricingType !== PricingType.FREE && (
                <div>
                  <Label htmlFor="pricingValue" className="text-foreground">Valor (R$)</Label>
                  <Controller name="pricingValue" control={control} render={({ field }) => <Input id="pricingValue" type="number" step="0.01" placeholder="Ex: 25.50" {...field} value={field.value ?? ''} className={errors.pricingValue ? 'border-destructive' : ''} />} />
                  {errors.pricingValue && <p className="mt-1 text-sm text-destructive">{errors.pricingValue.message}</p>}
                </div>
              )}

              <div className="md:col-span-2">
                <Label htmlFor="ticketPurchaseUrl" className="text-foreground">Link para Compra de Ingressos (Opcional)</Label>
                <Controller name="ticketPurchaseUrl" control={control} render={({ field }) => <Input id="ticketPurchaseUrl" type="url" placeholder="https://exemplo.com/ingressos" {...field} className={errors.ticketPurchaseUrl ? 'border-destructive' : ''} />} />
                {errors.ticketPurchaseUrl && <p className="mt-1 text-sm text-destructive">{errors.ticketPurchaseUrl.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Se fornecido, este link será usado para a venda de ingressos. Se o evento não for gratuito e este campo estiver vazio, os usuários serão instruídos a pagar na entrada ou via contato direto.</p>
              </div>


              <div className="md:col-span-2">
                <Label htmlFor="description" className="text-foreground">Descrição do Evento (Opcional)</Label>
                <Controller name="description" control={control} render={({ field }) => <Textarea id="description" placeholder="Detalhes sobre o evento, atrações, etc." {...field} className={errors.description ? 'border-destructive' : ''} />} />
                {errors.description && <p className="mt-1 text-sm text-destructive">{errors.description.message}</p>}
              </div>

              <div className="md:col-span-2 flex items-center space-x-2 pt-2">
                <Controller name="shareRewardsEnabled" control={control} render={({ field }) => <Switch id="shareRewardsEnabled" checked={field.value} onCheckedChange={field.onChange} />} />
                <Label htmlFor="shareRewardsEnabled" className="text-foreground">Ativar Recompensa por Compartilhamento (FervoCoins). Quando o Usuário Compartilha o seu Evento para 10 pessoas ele ganha 20 moedas, 2 moedas por compartilhamento que valem um cupom de Cerveja ou Refrigerante 350ml. Esse Cupom pode ser Autenticado no seu painel Resgatar Cupons. Isso é um incentivo ao Usuário</Label>
              </div>
              <div className="md:col-span-2 -mt-3">
                <p className="text-xs text-muted-foreground pl-8">
                  Positivo: Usuários ganham FervoCoins ao compartilhar este evento, aumentando o alcance!
                  <br/>Se desativado, o compartilhamento não gera recompensa. (Padrão: Ativado)
                </p>
                {errors.shareRewardsEnabled && <p className="mt-1 text-sm text-destructive">{errors.shareRewardsEnabled.message}</p>}
              </div>

              <div className="md:col-span-2 flex items-center space-x-2">
                <Controller name="visibility" control={control} render={({ field }) => <Switch id="visibility" checked={field.value} onCheckedChange={field.onChange} />} />
                <Label htmlFor="visibility" className="text-foreground">Visível para usuários?</Label>
                {errors.visibility && <p className="mt-1 text-sm text-destructive">{errors.visibility.message}</p>}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 p-4 sm:p-6">
             {editingEventId && (
                <Button type="button" variant="outline" onClick={() => { setEditingEventId(null); reset(); }} className="w-full sm:w-auto border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
                    Cancelar Edição
                </Button>
            )}
            <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm" disabled={isSubmitting || (!canCreateEvents && !editingEventId) || (!canCreateEvents && editingEventId && partnerEvents.find(e=>e.id===editingEventId)?.visibility) }>
              <Save className="w-4 h-4 mr-2" /> {isSubmitting ? 'Salvando...' : (editingEventId ? 'Salvar Alterações' : 'Criar Evento')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-primary/50 shadow-lg shadow-primary/15">
        <CardHeader className="p-4 sm:p-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl sm:text-2xl text-foreground flex items-center">
                <CalendarDays className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
                Meus Eventos Cadastrados
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">Gerencie seus eventos existentes.</CardDescription>
          </div>
          {partnerEvents.some(event => isEventPast(event.endDateTime)) && (
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeletingPastEvents}>
                        {isDeletingPastEvents ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash className="w-4 h-4 mr-2" />}
                        Excluir Encerrados
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir todos os eventos já encerrados? Esta ação não pode ser desfeita.
                        As avaliações e comentários associados a eles serão mantidos para estatísticas gerais do local.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingPastEvents}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeletePastEvents}
                        disabled={isDeletingPastEvents}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        {isDeletingPastEvents ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Confirmar Exclusão
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {loading && partnerEvents.length === 0 && <p className="text-center text-muted-foreground"><Loader2 className="inline w-4 h-4 mr-2 animate-spin"/> Carregando eventos...</p>}
          {!loading && partnerEvents.length === 0 && (
            <p className="text-center text-muted-foreground">Nenhum evento cadastrado ainda.</p>
          )}
          {!loading && partnerEvents.length > 0 && (
            <ScrollArea className="h-[400px] pr-3">
              <div className="space-y-4">
                {partnerEvents.map(event => {
                  const isHappening = isEventHappeningNow(event.startDateTime, event.endDateTime);
                  const eventIsPast = isEventPast(event.endDateTime);
                  return (
                  <Card key={event.id} className={`p-3 sm:p-4 border rounded-lg ${event.id === editingEventId ? 'border-primary shadow-md' : 'border-border'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-md sm:text-lg font-semibold text-foreground truncate">{event.eventName}</h3>
                        {isHappening && (
                          <Badge className="mt-1 text-xs bg-green-500/80 text-white hover:bg-green-500 animate-pulse">
                             <Clapperboard className="w-3 h-3 mr-1" /> Acontecendo Agora
                          </Badge>
                        )}
                        {eventIsPast && !isHappening && (
                            <Badge variant="outline" className="mt-1 text-xs border-destructive text-destructive">Encerrado</Badge>
                        )}
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {format(event.startDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Preço: {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                            {event.pricingType !== PricingType.FREE && event.pricingValue ? ` (R$ ${Number(event.pricingValue).toFixed(2)})` : ''}
                        </p>
                         {event.ticketPurchaseUrl && (
                           <p className="text-xs sm:text-sm text-muted-foreground truncate">
                             Link de Venda: <a href={event.ticketPurchaseUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{event.ticketPurchaseUrl}</a>
                           </p>
                         )}
                      </div>
                      <div className="flex items-center space-x-0.5 sm:space-x-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => toggleEventVisibility(event)} title={event.visibility ? "Ocultar evento" : "Tornar evento visível"}>
                          {event.visibility ? <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" /> : <EyeOff className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEditEvent(event)} title="Editar evento" disabled={eventIsPast && event.visibility /* Allow editing past non-visible events */}>
                          <Edit className={`w-4 h-4 sm:w-5 sm:h-5 ${(eventIsPast && event.visibility) ? 'text-muted-foreground' : 'text-primary'}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(event.id)} title="Excluir evento">
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                        </Button>
                        {event.checkInToken && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push(`/partner/qr-code/${event.id}`)}
                            title={eventIsPast ? "Evento encerrado, QR Code indisponível" : "Ver QR Code do Evento"}
                            disabled={eventIsPast}
                          >
                            <QrCode className={`w-4 h-4 sm:w-5 sm:h-5 ${eventIsPast ? 'text-muted-foreground' : 'text-primary'}`} />
                          </Button>
                        )}
                         <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSharePartnerEvent(event)}
                            title={eventIsPast ? "Evento encerrado, não pode compartilhar" : "Compartilhar este evento"}
                            disabled={eventIsPast}
                          >
                            <Share2 className={`w-4 h-4 sm:w-5 sm:h-5 ${eventIsPast ? 'text-muted-foreground' : 'text-accent'}`} />
                          </Button>
                      </div>
                    </div>
                    {event.description && <p className="mt-2 text-sm text-foreground/80">{event.description}</p>}
                     {event.musicStyles && event.musicStyles.length > 0 && (
                        <div className="mt-2">
                            <span className="text-sm font-medium text-muted-foreground">Estilos: </span>
                             <span className="text-sm text-muted-foreground">{event.musicStyles.map(style => MUSIC_STYLE_OPTIONS.find(s => s.value === style)?.label).join(', ')}</span>
                        </div>
                    )}
                    {event.checkInToken && (
                      <div className="mt-2 flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                          type="text"
                          readOnly
                          value={event.checkInToken}
                          className="text-xs flex-1 bg-muted/50 border-dashed h-8"
                          onClick={(e) => {
                            (e.target as HTMLInputElement).select();
                            navigator.clipboard.writeText(event.checkInToken || "");
                            toast({ title: "Token Copiado!", description: "Token de Check-in copiado para a área de transferência." });
                          }}
                        />
                      </div>
                    )}
                  </Card>
                )})}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageEventsPage;

