
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
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

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

interface PartnerOverallRating {
    averageVenueRating?: number;
    venueRatingCount?: number;
}

const PartnerRatingsPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [eventRatings, setEventRatings] = useState<EventRating[]>([]);
  const [eventsWithRatings, setEventsWithRatings] = useState<EventDetails[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [partnerOverallRating, setPartnerOverallRating] = useState<PartnerOverallRating | null>(null);


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
    // Fetch partner's overall rating
    const partnerDocRef = doc(firestore, `users/${currentUser.uid}`);
    const unsubscribePartnerRating = onSnapshot(partnerDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setPartnerOverallRating({
                averageVenueRating: data.averageVenueRating,
                venueRatingCount: data.venueRatingCount, // This is the total number of ratings across all events
            });
        } else {
            setPartnerOverallRating(null);
        }
    }, (error) => {
        console.error("Error fetching partner overall rating:", error);
        toast({ title: "Erro ao buscar avaliação geral", variant: "destructive" });
    });


    // Fetch all events created by the partner to list them for selection
    const partnerEventsRef = collection(firestore, `users/${currentUser.uid}/events`);
    // Order by createdAt descending to show newer events first in the list
    const qEvents = query(partnerEventsRef, orderBy('createdAt', 'desc')); 

    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
        const fetchedEvents: EventDetails[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            fetchedEvents.push({
                id: doc.id,
                eventName: data.eventName,
                averageRating: data.averageRating,
                ratingCount: data.ratingCount,
            });
        });
        setEventsWithRatings(fetchedEvents);
        if (!selectedEventId && fetchedEvents.length > 0) {
            // Automatically select the first (most recent) event if none is selected
            setSelectedEventId(fetchedEvents[0].id); 
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching partner events for ratings page:", error);
        toast({ title: "Erro ao buscar eventos", variant: "destructive" });
        setIsLoading(false);
    });

    return () => {
        unsubscribeEvents();
        unsubscribePartnerRating();
    };

  }, [currentUser, toast]); // Removed selectedEventId from dependencies


  useEffect(() => {
    if (!selectedEventId || !currentUser) {
      setEventRatings([]); 
      if (isLoading && !currentUser) setIsLoading(false); // Stop loading if no user
      else if(isLoading && !selectedEventId && eventsWithRatings.length > 0) setIsLoading(false); // Stop loading if no event selected but list is there
      return;
    }
    
    setIsLoading(true);
    const ratingsRef = collection(firestore, 'eventRatings');
    const qRatings = query(
        ratingsRef, 
        where('eventId', '==', selectedEventId),
        where('partnerId', '==', currentUser.uid), 
        orderBy('createdAt', 'desc')
    );

    const unsubscribeRatings = onSnapshot(qRatings, async (snapshot) => {
        const fetchedRatings: EventRating[] = [];
        // Get eventName for display - prefer fetching once if needed
        let eventName = eventsWithRatings.find(e => e.id === selectedEventId)?.eventName;
        if (!eventName && currentUser && selectedEventId) { // Check currentUser and selectedEventId again
            try {
                const eventDoc = await getDoc(doc(firestore, `users/${currentUser.uid}/events/${selectedEventId}`));
                if (eventDoc.exists()) {
                    eventName = eventDoc.data()?.eventName;
                }
            } catch (error) {
                console.error("Error fetching event name for ratings:", error);
                // Proceed without event name if fetch fails
            }
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

  }, [selectedEventId, currentUser, toast, eventsWithRatings, isLoading]); // Add isLoading to re-evaluate if selection changes while loading


  if (!currentUser && !isLoading) { // Ensure loading stops if no user
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-destructive animate-spin" />
      </div>
    );
  }

  const selectedEventDetails = eventsWithRatings.find(e => e.id === selectedEventId);

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
            <StarIcon className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Avaliações
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Veja as avaliações e comentários dos usuários para seus eventos e a avaliação geral do seu local (média das avaliações de todos os seus eventos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-4 sm:px-6 pb-4 sm:pb-6">
            {partnerOverallRating && (
                <div className="p-3 sm:p-4 mb-6 border rounded-lg border-destructive/30 bg-card/80">
                    <h3 className="mb-2 text-md sm:text-lg font-semibold text-destructive">Avaliação Geral do Local</h3>
                    {partnerOverallRating.averageVenueRating !== undefined && partnerOverallRating.venueRatingCount !== undefined && partnerOverallRating.venueRatingCount > 0 ? (
                        <div className="flex items-center gap-2">
                            <StarRating rating={partnerOverallRating.averageVenueRating} totalStars={5} size={20} smSize={24} readOnly fillColor="hsl(var(--destructive))" />
                            <span className="text-sm sm:text-md text-muted-foreground">
                                ({partnerOverallRating.averageVenueRating.toFixed(1)} de {partnerOverallRating.venueRatingCount} {partnerOverallRating.venueRatingCount === 1 ? 'avaliação de evento' : 'avaliações de eventos'})
                            </span>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm sm:text-base">Seu local ainda não possui avaliações (nenhum de seus eventos foi avaliado).</p>
                    )}
                </div>
            )}
            <Separator className="my-4 border-destructive/20" />


            {isLoading && eventsWithRatings.length === 0 && <p className="text-center text-muted-foreground">Carregando seus eventos...</p>}
            {!isLoading && eventsWithRatings.length === 0 && <p className="text-center text-muted-foreground">Você ainda não criou nenhum evento.</p>}
            
            {eventsWithRatings.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="md:col-span-1">
                        <h3 className="mb-2 text-md sm:text-lg font-medium text-destructive/90">Eventos Avaliados</h3>
                        <ScrollArea className="h-60 md:h-72 border rounded-md border-input">
                            {eventsWithRatings.map(event => (
                                <Button
                                    key={event.id}
                                    variant={selectedEventId === event.id ? "secondary" : "ghost"}
                                    className={cn(
                                        "w-full justify-start text-left p-2 sm:p-3 rounded-none h-auto flex flex-col items-start", 
                                        selectedEventId === event.id && "bg-destructive/20 text-destructive font-semibold"
                                    )}
                                    onClick={() => setSelectedEventId(event.id)}
                                >
                                    <span className="truncate text-sm sm:text-base font-medium">{event.eventName}</span>
                                    {event.averageRating !== undefined && event.ratingCount !== undefined && event.ratingCount > 0 ? (
                                      <div className="flex items-center gap-1 mt-0.5">
                                          <StarRating rating={event.averageRating} totalStars={5} size={12} readOnly fillColor="hsl(var(--destructive))" />
                                          <span className="text-xs text-muted-foreground">({event.ratingCount})</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground mt-0.5">Sem avaliações</span>
                                    )}
                                </Button>
                            ))}
                        </ScrollArea>
                    </div>
                    <div className="md:col-span-2">
                        <h3 className="mb-2 text-md sm:text-lg font-medium text-destructive/90">
                            Comentários para: <span className="font-semibold">{selectedEventDetails?.eventName || "Selecione um Evento"}</span>
                        </h3>
                        {isLoading && selectedEventId && <div className="flex justify-center items-center h-60"><Loader2 className="w-8 h-8 text-destructive animate-spin" /></div>}
                        {!isLoading && selectedEventId && eventRatings.length === 0 && (
                             <div className="flex items-center justify-center h-60 p-4 border border-dashed rounded-md border-border">
                                <p className="text-muted-foreground text-sm sm:text-base">Nenhuma avaliação para este evento ainda.</p>
                            </div>
                        )}
                        {!isLoading && selectedEventId && eventRatings.length > 0 && (
                            <ScrollArea className="h-60 md:h-72 border rounded-md border-input p-2 sm:p-3 space-y-3">
                                {eventRatings.map(rating => (
                                    <Card key={rating.id} className="bg-card/70 p-3 sm:p-4">
                                        <div className="flex justify-between items-center mb-1">
                                            <CardTitle className="text-sm sm:text-base text-destructive/80">{rating.userName}</CardTitle>
                                            <StarRating rating={rating.rating} readOnly size={16} fillColor="hsl(var(--destructive))" />
                                        </div>
                                         <p className="text-xs text-muted-foreground mb-2">
                                            {format(rating.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </p>
                                        {rating.comment && (
                                          <p className="text-sm text-foreground/90 flex items-start">
                                             <MessageCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0 text-destructive/70" /> 
                                             <span className="italic">"{rating.comment}"</span>
                                          </p>
                                        )}
                                    </Card>
                                ))}
                            </ScrollArea>
                        )}
                         {!selectedEventId && !isLoading && eventsWithRatings.length > 0 && (
                             <div className="flex items-center justify-center h-60 p-4 border border-dashed rounded-md border-border">
                                <p className="text-muted-foreground text-sm sm:text-base">Selecione um evento à esquerda para ver os comentários e avaliações.</p>
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

// Augment StarRatingProps for smSize
interface StarRatingProps {
  rating: number;
  setRating?: React.Dispatch<React.SetStateAction<number>>;
  totalStars?: number;
  size?: number;
  smSize?: number; // Add smSize prop
  fillColor?: string;
  emptyColor?: string;
  className?: string;
  readOnly?: boolean;
  hoverColor?: string;
}

// Update StarRating component if needed to handle smSize, or ensure existing size prop is sufficient
// This example assumes existing size prop is handled well by Tailwind/CSS for responsiveness
// If specific small screen size is needed, you'd adjust the component or use responsive Tailwind classes

export default PartnerRatingsPage;

    
