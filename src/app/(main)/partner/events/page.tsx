
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { format, parse } from 'date-fns';
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
import { PlusCircle, Edit, Trash2, Eye, EyeOff, Save, CalendarDays } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';


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
    path: ['endDate'], // Or a more general path
});


type EventFormInputs = z.infer<typeof eventFormSchema>;

interface EventDocument extends EventFormInputs {
  id: string;
  partnerId: string;
  startDateTime: Timestamp;
  endDateTime: Timestamp;
  createdAt: Timestamp;
}


const ManageEventsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerEvents, setPartnerEvents] = useState<EventDocument[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors, isSubmitting }, watch, reset, setValue } = useForm<EventFormInputs>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventName: '',
      startDate: new Date(),
      startTime: format(new Date(), 'HH:mm'),
      endDate: new Date(),
      endTime: format(new Date(new Date().getTime() + 60 * 60 * 1000), 'HH:mm'), // 1 hour later
      musicStyles: [],
      pricingType: PricingType.FREE,
      pricingValue: undefined,
      description: '',
      visibility: true,
    },
  });

  const watchedPricingType = watch('pricingType');

  const fetchEvents = async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', userId, 'events');
      const q = query(eventsCollectionRef); // Order by creation or start date if needed
      const snapshot = await getDocs(q);
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as EventDocument)).sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis()); // Sort by most recent first
      setPartnerEvents(eventsData);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast({ title: "Erro ao buscar eventos", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        fetchEvents(user.uid);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router, toast]);


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

    if (!editingEventId) { // Creating new event
        const visibleEventsQuery = query(eventsCollectionRef, where('visibility', '==', true));
        const visibleEventsSnapshot = await getDocs(visibleEventsQuery);
        if (visibleEventsSnapshot.size >= 5 && data.visibility) {
            toast({
                title: "Limite de Eventos Visíveis Atingido",
                description: "Você pode ter no máximo 5 eventos visíveis. Crie como não visível ou oculte um evento existente.",
                variant: "destructive",
                duration: 7000,
            });
            return;
        }
    }


    const eventPayload = {
      partnerId: currentUser.uid,
      eventName: data.eventName,
      startDateTime: combineDateAndTime(data.startDate, data.startTime),
      endDateTime: combineDateAndTime(data.endDate, data.endTime),
      musicStyles: data.musicStyles || [],
      pricingType: data.pricingType,
      pricingValue: data.pricingType === PricingType.FREE ? null : data.pricingValue,
      description: data.description || '',
      visibility: data.visibility,
      createdAt: editingEventId ? partnerEvents.find(e=>e.id === editingEventId)?.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingEventId) {
        const eventDocRef = doc(firestore, 'users', currentUser.uid, 'events', editingEventId);
        await updateDoc(eventDocRef, eventPayload);
        toast({ title: "Evento Atualizado!", description: "O evento foi atualizado com sucesso." });
      } else {
        await addDoc(eventsCollectionRef, eventPayload);
        toast({ title: "Evento Criado!", description: "O evento foi criado com sucesso." });
      }
      reset(); // Reset form to default values
      setEditingEventId(null);
      fetchEvents(currentUser.uid); // Refresh list
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
      toast({ title: "Evento Excluído", description: "O evento foi excluído com sucesso." });
      fetchEvents(currentUser.uid);
      if (editingEventId === eventId) {
        setEditingEventId(null);
        reset();
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      toast({ title: "Erro ao Excluir", description: "Não foi possível excluir o evento.", variant: "destructive" });
    }
  };

  const toggleEventVisibility = async (event: EventDocument) => {
    if (!currentUser) return;

    const newVisibility = !event.visibility;

    if (newVisibility) { // Trying to make it visible
        const eventsCollectionRef = collection(firestore, 'users', currentUser.uid, 'events');
        const visibleEventsQuery = query(eventsCollectionRef, where('visibility', '==', true));
        const visibleEventsSnapshot = await getDocs(visibleEventsQuery);
        
        // Count visible events, excluding the current one if it's already in the list and about to be toggled
        let visibleCount = 0;
        visibleEventsSnapshot.docs.forEach(doc => {
            if (doc.id !== event.id) { // Don't count itself if it was previously visible
                visibleCount++;
            }
        });
        
        if (visibleCount >= 5) {
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
      fetchEvents(currentUser.uid);
    } catch (error) {
      console.error("Error toggling visibility:", error);
      toast({ title: "Erro ao Alterar Visibilidade", variant: "destructive" });
    }
  };


  if (loading && !currentUser) { // Show loading only if user is not yet determined
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto">
        <p className="text-xl text-destructive animate-pulse">Carregando...</p>
      </div>
    );
  }


  return (
    <div className="container py-8 mx-auto">
      <Card className="mb-8 border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader>
          <CardTitle className="text-2xl text-destructive flex items-center">
            <PlusCircle className="w-7 h-7 mr-3" />
            {editingEventId ? 'Editar Evento' : 'Adicionar Novo Evento'}
          </CardTitle>
          <CardDescription>
            {editingEventId ? 'Modifique os detalhes do seu evento.' : 'Crie um novo evento para seu local. Você pode ter até 5 eventos visíveis simultaneamente.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Event Name */}
              <div className="md:col-span-2">
                <Label htmlFor="eventName" className="text-destructive/90">Nome do Evento</Label>
                <Controller name="eventName" control={control} render={({ field }) => <Input id="eventName" placeholder="Ex: Festa Neon Anos 2000" {...field} className={errors.eventName ? 'border-red-500' : ''} />} />
                {errors.eventName && <p className="mt-1 text-sm text-red-500">{errors.eventName.message}</p>}
              </div>

              {/* Start Date & Time */}
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

              {/* End Date & Time */}
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
              
              {/* Music Styles */}
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
                        <Label htmlFor={`event-music-${option.value}`} className="font-normal text-foreground/80">{option.label}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {errors.musicStyles && <p className="mt-1 text-sm text-red-500">{errors.musicStyles.message}</p>}
              </div>

              {/* Pricing */}
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
              
              {/* Description */}
              <div className="md:col-span-2">
                <Label htmlFor="description" className="text-destructive/90">Descrição do Evento (Opcional)</Label>
                <Controller name="description" control={control} render={({ field }) => <Textarea id="description" placeholder="Detalhes sobre o evento, atrações, etc." {...field} className={errors.description ? 'border-red-500' : ''} />} />
                {errors.description && <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>}
              </div>

              {/* Visibility */}
              <div className="md:col-span-2 flex items-center space-x-2">
                <Controller name="visibility" control={control} render={({ field }) => <Switch id="visibility" checked={field.value} onCheckedChange={field.onChange} />} />
                <Label htmlFor="visibility" className="text-destructive/90">Visível para usuários?</Label>
                {errors.visibility && <p className="mt-1 text-sm text-red-500">{errors.visibility.message}</p>}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
             {editingEventId && (
                <Button type="button" variant="outline" onClick={() => { setEditingEventId(null); reset(); }} className="border-destructive text-destructive hover:bg-destructive/10">
                    Cancelar Edição
                </Button>
            )}
            <Button type="submit" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" /> {isSubmitting ? 'Salvando...' : (editingEventId ? 'Salvar Alterações' : 'Criar Evento')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Events List */}
      <Card className="border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader>
          <CardTitle className="text-2xl text-destructive flex items-center">
            <CalendarDays className="w-7 h-7 mr-3" />
            Meus Eventos Cadastrados
          </CardTitle>
          <CardDescription>Gerencie seus eventos existentes.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-center text-muted-foreground">Carregando eventos...</p>}
          {!loading && partnerEvents.length === 0 && (
            <p className="text-center text-muted-foreground">Nenhum evento cadastrado ainda.</p>
          )}
          {!loading && partnerEvents.length > 0 && (
            <ScrollArea className="h-[400px] pr-3">
              <div className="space-y-4">
                {partnerEvents.map(event => (
                  <Card key={event.id} className={`p-4 border rounded-lg ${event.id === editingEventId ? 'border-destructive shadow-md' : 'border-border'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{event.eventName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {format(event.startDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Preço: {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                            {event.pricingType !== PricingType.FREE && event.pricingValue ? ` (R$ ${event.pricingValue.toFixed(2)})` : ''}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => toggleEventVisibility(event)} title={event.visibility ? "Ocultar evento" : "Tornar evento visível"}>
                          {event.visibility ? <Eye className="w-5 h-5 text-green-500" /> : <EyeOff className="w-5 h-5 text-gray-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEditEvent(event)} title="Editar evento">
                          <Edit className="w-5 h-5 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteEvent(event.id)} title="Excluir evento">
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {event.description && <p className="mt-2 text-sm text-foreground/80">{event.description}</p>}
                     {event.musicStyles && event.musicStyles.length > 0 && (
                        <div className="mt-2">
                            <span className="text-sm font-medium text-muted-foreground">Estilos: </span>
                            {event.musicStyles.map(style => MUSIC_STYLE_OPTIONS.find(s => s.value === style)?.label).join(', ')}
                        </div>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageEventsPage;
