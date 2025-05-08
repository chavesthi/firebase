
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, deleteDoc, Timestamp, writeBatch, onSnapshot, orderBy } from 'firebase/firestore';
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
import { MusicStyle, MUSIC_STYLE_OPTIONS, PricingType, PRICING_TYPE_OPTIONS } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Edit, Trash2, Eye, EyeOff, Save, CalendarDays, Clapperboard, ArrowLeft, QrCode, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';


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
  // checkInToken is not part of form input, generated on save
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
  pricingValue?: number | null; // Allow null for Firestore
  averageRating?: number; // Added for potential future use or display
  ratingCount?: number;   // Added for potential future use or display
}

const isEventHappeningNow = (startDateTime: Timestamp, endDateTime: Timestamp): boolean => {
  const now = new Date();
  const startTime = startDateTime.toDate();
  const endTime = endDateTime.toDate();
  return now >= startTime && now <= endTime;
};


const ManageEventsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerEvents, setPartnerEvents] = useState<EventDocument[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

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
    },
  });

  const watchedPricingType = watch('pricingType');

  // Listener for real-time event updates
  useEffect(() => {
    let unsubscribeEvents: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setLoading(true); // Start loading when user is confirmed

        const eventsCollectionRef = collection(firestore, 'users', user.uid, 'events');
        const q = query(eventsCollectionRef, orderBy('createdAt', 'desc')); // Order by creation time

        // Detach previous listener if exists
        if (unsubscribeEvents) {
          unsubscribeEvents();
        }

        unsubscribeEvents = onSnapshot(q, (snapshot) => {
          const eventsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as EventDocument));
          setPartnerEvents(eventsData);
          setLoading(false); // Stop loading after initial data load or update
        }, (error) => {
          console.error("Error fetching events with onSnapshot:", error);
          toast({ title: "Erro ao buscar eventos", variant: "destructive" });
          setLoading(false); // Stop loading on error
        });

      } else {
        router.push('/login');
        // Cleanup listener if user logs out
        if (unsubscribeEvents) {
          unsubscribeEvents();
        }
      }
    });

    return () => {
      unsubscribeAuth();
      // Cleanup listener on component unmount
      if (unsubscribeEvents) {
        unsubscribeEvents();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, toast]); // currentUser dependency removed as auth state handles it

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

    const eventsCollectionRef = collection(firestore, 'users', currentUser.uid, 'events');
    
    // Check visible event limit only when adding a new visible event
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

    const existingEvent = editingEventId ? partnerEvents.find(e => e.id === editingEventId) : null;
    const checkInToken = existingEvent?.checkInToken || doc(collection(firestore, `users/${currentUser.uid}/events`)).id.slice(0,10);

    const eventPayload: Omit<EventDocument, 'id' | 'createdAt' | 'averageRating' | 'ratingCount'> & { createdAt?: Timestamp, pricingValue?: number | null, updatedAt?: Timestamp, averageRating?: number, ratingCount?: number } = {
      partnerId: currentUser.uid,
      eventName: data.eventName,
      startDateTime: combineDateAndTime(data.startDate, data.startTime),
      endDateTime: combineDateAndTime(data.endDate, data.endTime),
      musicStyles: data.musicStyles || [],
      pricingType: data.pricingType,
      pricingValue: data.pricingType === PricingType.FREE ? null : (data.pricingValue ?? null),
      description: data.description || '',
      visibility: data.visibility,
      checkInToken: checkInToken,
    };

    try {
      if (editingEventId) {
        const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', editingEventId);
        eventPayload.createdAt = existingEvent?.createdAt; // Preserve original createdAt
        eventPayload.updatedAt = serverTimestamp(); 
        await updateDoc(eventDocRef, eventPayload as any); 
        toast({ title: "Evento Atualizado!", description: "O evento foi atualizado com sucesso." });
      } else {
        eventPayload.createdAt = serverTimestamp();
        eventPayload.averageRating = 0; // Initialize rating fields for new events
        eventPayload.ratingCount = 0;
        await addDoc(eventsCollectionRef, eventPayload as any); 
        toast({ title: "Evento Criado!", description: "O evento foi criado com sucesso." });
      }
      reset(); 
      setEditingEventId(null);
      // No need to call fetchEvents manually, onSnapshot will update the list
    } catch (error) {
      console.error("Error saving event:", error);
      toast({ title: "Erro ao Salvar Evento", description: "Não foi possível salvar o evento.", variant: "destructive" });
    }
  };

  const handleEditEvent = (event: EventDocument) => {
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
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!currentUser) return;
    try {
      const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', eventId);
      await deleteDoc(eventDocRef);

      // Delete associated ratings
      const ratingsQuery = query(collection(firestore, 'eventRatings'), where('eventId', '==', eventId), where('partnerId', '==', currentUser.uid));
      const ratingsSnapshot = await getDocs(ratingsQuery);
      
      const batch = writeBatch(firestore);
      ratingsSnapshot.forEach(ratingDoc => {
        batch.delete(ratingDoc.ref);
      });
      await batch.commit();
      
      toast({ title: "Evento Excluído", description: "O evento e suas avaliações foram excluídos com sucesso." });
      // No need to call fetchEvents, onSnapshot handles update
      if (editingEventId === eventId) {
        setEditingEventId(null);
        reset();
      }
    } catch (error) {
      console.error("Error deleting event and ratings:", error);
      toast({ title: "Erro ao Excluir", description: "Não foi possível excluir o evento e/ou suas avaliações.", variant: "destructive" });
    }
  };

  const toggleEventVisibility = async (event: EventDocument) => {
    if (!currentUser) return;

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
      // No need to call fetchEvents, onSnapshot handles update
    } catch (error) {
      console.error("Error toggling visibility:", error);
      toast({ title: "Erro ao Alterar Visibilidade", variant: "destructive" });
    }
  };

  if (loading && !currentUser) { 
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-destructive animate-spin" />
      </div>
    );
  }


  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            Painel
        </Button>
      </div>
      <Card className="mb-8 border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-destructive flex items-center">
            <PlusCircle className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            {editingEventId ? 'Editar Evento' : 'Adicionar Novo Evento'}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {editingEventId ? 'Modifique os detalhes do seu evento.' : 'Crie um novo evento para seu local. Você pode ter até 5 eventos visíveis simultaneamente.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="eventName" className="text-destructive/90">Nome do Evento</Label>
                <Controller name="eventName" control={control} render={({ field }) => <Input id="eventName" placeholder="Ex: Festa Neon Anos 2000" {...field} className={errors.eventName ? 'border-red-500' : ''} />} />
                {errors.eventName && <p className="mt-1 text-sm text-red-500">{errors.eventName.message}</p>}
              </div>

              <div>
                <Label htmlFor="startDate" className="text-destructive/90">Data de Início</Label>
                <Controller name="startDate" control={control} render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} className={errors.startDate ? 'border-red-500' : ''} />} />
                {errors.startDate && <p className="mt-1 text-sm text-red-500">{errors.startDate.message}</p>}
              </div>
              <div>
                <Label htmlFor="startTime" className="text-destructive/90">Hora de Início</Label>
                <Controller name="startTime" control={control} render={({ field }) => <Input id="startTime" type="time" {...field} className={errors.startTime ? 'border-red-500' : ''} />} />
                {errors.startTime && <p className="mt-1 text-sm text-red-500">{errors.startTime.message}</p>}
              </div>

              <div>
                <Label htmlFor="endDate" className="text-destructive/90">Data de Fim</Label>
                <Controller name="endDate" control={control} render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} className={errors.endDate ? 'border-red-500' : ''} />} />
                {errors.endDate && <p className="mt-1 text-sm text-red-500">{errors.endDate.message}</p>}
              </div>
              <div>
                <Label htmlFor="endTime" className="text-destructive/90">Hora de Fim</Label>
                <Controller name="endTime" control={control} render={({ field }) => <Input id="endTime" type="time" {...field} className={errors.endTime ? 'border-red-500' : ''} />} />
                {errors.endTime && <p className="mt-1 text-sm text-red-500">{errors.endTime.message}</p>}
              </div>
              
              <div className="md:col-span-2">
                <Label className="text-destructive/90">Estilos Musicais (Máx. 4)</Label>
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
                {errors.musicStyles && <p className="mt-1 text-sm text-red-500">{errors.musicStyles.message}</p>}
              </div>

              <div>
                <Label htmlFor="pricingType" className="text-destructive/90">Tipo de Preço</Label>
                <Controller
                  name="pricingType"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger id="pricingType" className={errors.pricingType ? 'border-red-500' : ''}>
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
                {errors.pricingType && <p className="mt-1 text-sm text-red-500">{errors.pricingType.message}</p>}
              </div>
              
              {watchedPricingType !== PricingType.FREE && (
                <div>
                  <Label htmlFor="pricingValue" className="text-destructive/90">Valor (R$)</Label>
                  <Controller name="pricingValue" control={control} render={({ field }) => <Input id="pricingValue" type="number" step="0.01" placeholder="Ex: 25.50" {...field} value={field.value ?? ''} className={errors.pricingValue ? 'border-red-500' : ''} />} />
                  {errors.pricingValue && <p className="mt-1 text-sm text-red-500">{errors.pricingValue.message}</p>}
                </div>
              )}
              
              <div className="md:col-span-2">
                <Label htmlFor="description" className="text-destructive/90">Descrição do Evento (Opcional)</Label>
                <Controller name="description" control={control} render={({ field }) => <Textarea id="description" placeholder="Detalhes sobre o evento, atrações, etc." {...field} className={errors.description ? 'border-red-500' : ''} />} />
                {errors.description && <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>}
              </div>

              <div className="md:col-span-2 flex items-center space-x-2">
                <Controller name="visibility" control={control} render={({ field }) => <Switch id="visibility" checked={field.value} onCheckedChange={field.onChange} />} />
                <Label htmlFor="visibility" className="text-destructive/90">Visível para usuários?</Label>
                {errors.visibility && <p className="mt-1 text-sm text-red-500">{errors.visibility.message}</p>}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 p-4 sm:p-6">
             {editingEventId && (
                <Button type="button" variant="outline" onClick={() => { setEditingEventId(null); reset(); }} className="w-full sm:w-auto border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm">
                    Cancelar Edição
                </Button>
            )}
            <Button type="submit" className="w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs sm:text-sm" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" /> {isSubmitting ? 'Salvando...' : (editingEventId ? 'Salvar Alterações' : 'Criar Evento')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-destructive flex items-center">
            <CalendarDays className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Meus Eventos Cadastrados
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Gerencie seus eventos existentes.</CardDescription>
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
                  return (
                  <Card key={event.id} className={`p-3 sm:p-4 border rounded-lg ${event.id === editingEventId ? 'border-destructive shadow-md' : 'border-border'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex-1 min-w-0"> {/* Ensure text truncates */}
                        <h3 className="text-md sm:text-lg font-semibold text-foreground truncate">{event.eventName}</h3>
                        {isHappening && (
                          <Badge className="mt-1 text-xs bg-green-500/80 text-white hover:bg-green-500 animate-pulse">
                             <Clapperboard className="w-3 h-3 mr-1" /> Acontecendo Agora
                          </Badge>
                        )}
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {format(event.startDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Preço: {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                            {event.pricingType !== PricingType.FREE && event.pricingValue ? ` (R$ ${Number(event.pricingValue).toFixed(2)})` : ''}
                        </p>
                      </div>
                      <div className="flex items-center space-x-0.5 sm:space-x-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => toggleEventVisibility(event)} title={event.visibility ? "Ocultar evento" : "Tornar evento visível"}>
                          {event.visibility ? <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" /> : <EyeOff className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEditEvent(event)} title="Editar evento">
                          <Edit className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(event.id)} title="Excluir evento">
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                        </Button>
                        {event.checkInToken && (
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/partner/qr-code/${event.id}`)} title="Ver QR Code do Evento">
                            <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                          </Button>
                        )}
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

