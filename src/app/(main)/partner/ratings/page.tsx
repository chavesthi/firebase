
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, Timestamp as FirebaseTimestamp, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StarRating } from '@/components/ui/star-rating';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { ArrowLeft, Loader2, MessageCircle, Star as StarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface EventRating {
  id: string; // rating document id: eventId_userId
  eventId: string;
  eventName?: string; // Will be fetched separately or stored denormalized
  userId: string;
  userName: string;
  rating: number;
  comment?: string;
  createdAt: FirebaseTimestamp;
}

interface EventDetails {
  id: string;
  eventName: string;
  averageRating?: number;
  ratingCount?: number;
}

const PartnerRatingsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [eventRatings, setEventRatings] = useState<EventRating[]>([]);
  const [eventsWithRatings, setEventsWithRatings] = useState<EventDetails[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    setIsLoading(true);
    // Fetch all events created by the partner to list them for selection
    const partnerEventsRef = collection(firestore, `users/${currentUser.uid}/events`);
    const qEvents = query(partnerEventsRef, orderBy('startDateTime', 'desc'));

    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        const fetchedEvents: EventDetails[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Only include events that might have ratings or are relevant
             fetchedEvents.push({
                id: doc.id,
                eventName: data.eventName,
                averageRating: data.averageRating,
                ratingCount: data.ratingCount,
            });
        });
        setEventsWithRatings(fetchedEvents);
        if (!selectedEventId && fetchedEvents.length > 0) {
            setSelectedEventId(fetchedEvents[0].id); // Auto-select the first event
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching partner events for ratings page:", error);
        toast({ title: "Erro ao buscar eventos", variant: "destructive" });
        setIsLoading(false);
    });

    return () => unsubscribeEvents();

  }, [currentUser, toast]);


  useEffect(() => {
    if (!selectedEventId || !currentUser) {
      setEventRatings([]); // Clear ratings if no event is selected or no user
      return;
    }
    
    setIsLoading(true);
    // Fetch ratings for the selected event
    const ratingsRef = collection(firestore, 'eventRatings');
    const qRatings = query(
        ratingsRef, 
        where('eventId', '==', selectedEventId),
        where('partnerId', '==', currentUser.uid), // Ensure partner only sees their own event ratings
        orderBy('createdAt', 'desc')
    );

    const unsubscribeRatings = onSnapshot(qRatings, async (snapshot) => {
        const fetchedRatings: EventRating[] = [];
        // We might need eventName if not directly stored in eventRatings, could fetch once or denormalize
        let eventName = eventsWithRatings.find(e => e.id === selectedEventId)?.eventName;
        if (!eventName) { // Fallback if eventName not in current list (should be rare)
            const eventDoc = await getDoc(doc(firestore, `users/${currentUser.uid}/events/${selectedEventId}`));
            if (eventDoc.exists()) eventName = eventDoc.data()?.eventName;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            fetchedRatings.push({
                id: doc.id,
                eventId: data.eventId,
                eventName: eventName || "Evento Desconhecido", 
                userId: data.userId,
                userName: data.userName,
                rating: data.rating,
                comment: data.comment,
                createdAt: data.createdAt as FirebaseTimestamp,
            });
        });
        setEventRatings(fetchedRatings);
        setIsLoading(false);
    }, (error) => {
        console.error(`Error fetching ratings for event ${selectedEventId}:`, error);
        toast({ title: "Erro ao buscar avaliações", variant: "destructive" });
        setIsLoading(false);
    });
    return () => unsubscribeRatings();

  }, [selectedEventId, currentUser, toast, eventsWithRatings]);


  if (!currentUser) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto">
        <Loader2 className="w-12 h-12 text-destructive animate-spin" />
      </div>
    );
  }

  const selectedEventDetails = eventsWithRatings.find(e => e.id === selectedEventId);

  return (
    <div className="container py-8 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Painel
        </Button>
      </div>

      <Card className="mb-8 border-destructive/50 shadow-lg shadow-destructive/15">
        <CardHeader>
          <CardTitle className="text-2xl text-destructive flex items-center">
            <StarIcon className="w-7 h-7 mr-3" />
            Avaliações dos Eventos
          </CardTitle>
          <CardDescription>
            Selecione um evento para ver as avaliações e comentários dos usuários.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {isLoading && eventsWithRatings.length === 0 && <p className="text-center text-muted-foreground">Carregando seus eventos...</p>}
            {!isLoading && eventsWithRatings.length === 0 && <p className="text-center text-muted-foreground">Você ainda não criou nenhum evento.</p>}
            
            {eventsWithRatings.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="md:col-span-1">
                        <h3 className="mb-2 text-lg font-medium text-destructive/90">Seus Eventos</h3>
                        <ScrollArea className="h-72 border rounded-md border-input">
                            {eventsWithRatings.map(event => (
                                <Button
                                    key={event.id}
                                    variant={selectedEventId === event.id ? "secondary" : "ghost"}
                                    className={cn(
                                        "w-full justify-start text-left p-3 rounded-none",
                                        selectedEventId === event.id && "bg-destructive/20 text-destructive font-semibold"
                                    )}
                                    onClick={() => setSelectedEventId(event.id)}
                                >
                                    <div className="flex flex-col">
                                      <span>{event.eventName}</span>
                                      {event.averageRating !== undefined && event.ratingCount !== undefined && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <StarRating rating={event.averageRating} totalStars={5} size={12} readOnly fillColor="hsl(var(--destructive))" />
                                            <span className="text-xs text-muted-foreground">({event.ratingCount})</span>
                                        </div>
                                      )}
                                    </div>
                                </Button>
                            ))}
                        </ScrollArea>
                    </div>
                    <div className="md:col-span-2">
                        <h3 className="mb-2 text-lg font-medium text-destructive/90">
                            Avaliações para: {selectedEventDetails?.eventName || "Selecione um Evento"}
                        </h3>
                        {isLoading && selectedEventId && <div className="flex justify-center items-center h-60"><Loader2 className="w-8 h-8 text-destructive animate-spin" /></div>}
                        {!isLoading && selectedEventId && eventRatings.length === 0 && (
                             <div className="flex items-center justify-center h-60 p-4 border border-dashed rounded-md border-border">
                                <p className="text-muted-foreground">Nenhuma avaliação para este evento ainda.</p>
                            </div>
                        )}
                        {!isLoading && selectedEventId && eventRatings.length > 0 && (
                            <ScrollArea className="h-72 border rounded-md border-input p-3 space-y-3">
                                {eventRatings.map(rating => (
                                    <Card key={rating.id} className="bg-card/70">
                                        <CardHeader className="pb-2 pt-3 px-4">
                                            <div className="flex justify-between items-center">
                                                <CardTitle className="text-sm text-destructive/80">{rating.userName}</CardTitle>
                                                <StarRating rating={rating.rating} readOnly size={16} fillColor="hsl(var(--destructive))" />
                                            </div>
                                             <p className="text-xs text-muted-foreground">
                                                {format(rating.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                            </p>
                                        </CardHeader>
                                        {rating.comment && (
                                            <CardContent className="px-4 pb-3">
                                                <p className="text-sm text-foreground/90 flex items-start">
                                                   <MessageCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0 text-destructive/70" /> 
                                                   <span className="italic">"{rating.comment}"</span>
                                                </p>
                                            </CardContent>
                                        )}
                                    </Card>
                                ))}
                            </ScrollArea>
                        )}
                         {!selectedEventId && !isLoading && eventsWithRatings.length > 0 && (
                             <div className="flex items-center justify-center h-60 p-4 border border-dashed rounded-md border-border">
                                <p className="text-muted-foreground">Selecione um evento à esquerda para ver as avaliações.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnerRatingsPage;
