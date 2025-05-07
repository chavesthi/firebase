
'use client';

import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { NextPage } from 'next';
import Image from 'next/image';
import { useRouter } from 'next/navigation'; 
import { Filter, X, Music2, Loader2, CalendarClock, MapPin, Navigation2, Car, Navigation as NavigationIcon, User as UserIconLucide, Instagram, Facebook, Youtube, Bell, Share2, Clapperboard, MessageSquare, Star as StarIcon, Send } from 'lucide-react';
import { collection, getDocs, query, where, Timestamp as FirebaseTimestamp, doc, runTransaction, setDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle as UICardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GOOGLE_MAPS_API_KEY, VenueType, MusicStyle, MUSIC_STYLE_OPTIONS, VENUE_TYPE_OPTIONS, UserRole, PricingType, PRICING_TYPE_OPTIONS } from '@/lib/constants';
import type { Location } from '@/services/geocoding';
import { 
  IconBar, 
  IconNightclub, 
  IconStandUp, 
  IconShowHouse, 
  IconAdultEntertainment, 
  IconLGBT,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { firestore, auth } from '@/lib/firebase';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/ui/star-rating';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { User as FirebaseUser } from 'firebase/auth';

interface VenueEvent {
  id: string;
  eventName: string;
  startDateTime: FirebaseTimestamp;
  endDateTime: FirebaseTimestamp;
  musicStyles?: MusicStyle[];
  pricingType: PricingType;
  pricingValue?: number;
  description?: string;
  visibility: boolean;
  averageRating?: number;
  ratingCount?: number;
}

interface Venue {
  id: string; 
  name: string;
  type: VenueType;
  musicStyles?: MusicStyle[]; 
  location: Location;
  description: string; 
  imageUrl?: string; 
  youtubeUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  whatsappPhone?: string; 
  events?: VenueEvent[]; 
  hasActiveEvent?: boolean; 
  activeEventName?: string | null; 
}

interface UserRating {
  rating: number;
  comment?: string;
  createdAt: FirebaseTimestamp;
  userName: string;
}


const venueTypeIcons: Record<VenueType, React.ElementType> = {
  [VenueType.NIGHTCLUB]: IconNightclub,
  [VenueType.BAR]: IconBar,
  [VenueType.STAND_UP]: IconStandUp,
  [VenueType.SHOW_HOUSE]: IconShowHouse,
  [VenueType.ADULT_ENTERTAINMENT]: IconAdultEntertainment,
  [VenueType.LGBT]: IconLGBT,
};

const venueTypeLabels: Record<VenueType, string> = VENUE_TYPE_OPTIONS.reduce((acc, curr) => {
  acc[curr.value] = curr.label;
  return acc;
}, {} as Record<VenueType, string>);


const musicStyleLabels: Record<MusicStyle, string> = MUSIC_STYLE_OPTIONS.reduce((acc, curr) => {
  acc[curr.value] = curr.label;
  return acc;
}, {} as Record<MusicStyle, string>);

const venueTypeColors: Record<VenueType, string> = {
  [VenueType.NIGHTCLUB]: 'hsl(var(--primary))', 
  [VenueType.BAR]: 'hsl(var(--accent))',       
  [VenueType.STAND_UP]: '#FACC15', 
  [VenueType.SHOW_HOUSE]: 'hsl(var(--secondary))',
  [VenueType.ADULT_ENTERTAINMENT]: '#EC4899', 
  [VenueType.LGBT]: '#F97316',      
};

const MapUpdater = ({ center }: { center: Location }) => {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.moveCamera({ center, zoom: 15 });
    }
  }, [map, center]);
  return null;
};

const VenueCustomMapMarker = ({ 
  type, 
  venueName, 
  isFilterActive,
  hasActiveEvent 
}: { 
  type: VenueType, 
  venueName: string, 
  isFilterActive: boolean,
  hasActiveEvent?: boolean 
}) => {
  const IconComponent = venueTypeIcons[type];
  const basePinColor = venueTypeColors[type] || 'hsl(var(--primary))';
  
  let effectiveBlinkHighlightColor = '#FACC15'; 
  const normalizeHex = (hex: string) => hex.startsWith('#') ? hex.substring(1).toUpperCase() : hex.toUpperCase();

  if (normalizeHex(basePinColor) === normalizeHex(effectiveBlinkHighlightColor)) {
    effectiveBlinkHighlightColor = 'white'; 
  }

  const animationName = `blinkingMarkerAnimation_${type.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <>
      {isFilterActive && (
        <style jsx global>{`
          @keyframes ${animationName} {
            0% { background-color: ${basePinColor}; box-shadow: 0 0 8px 2px ${basePinColor};}
            50% { background-color: ${effectiveBlinkHighlightColor}; box-shadow: 0 0 12px 4px ${effectiveBlinkHighlightColor}; transform: scale(1.1);}
            100% { background-color: ${basePinColor}; box-shadow: 0 0 8px 2px ${basePinColor};}
          }
        `}</style>
      )}
      <div className="flex flex-col items-center cursor-pointer relative" title={venueName} style={{ transform: 'translate(-50%, -100%)' }}>
        {hasActiveEvent && (
          <div 
            className="absolute -top-8 mb-1 px-2 py-1 text-xs font-semibold text-white bg-green-600 rounded-md shadow-lg whitespace-nowrap z-20 animate-pulse"
            style={{ transform: 'translateX(-50%)', left: '50%' }} 
          >
            Acontecendo Um Evento Agora!!!
          </div>
        )}
        <div
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full z-10", 
            isFilterActive ? 'shadow-xl' : 'shadow-lg', 
          )}
          style={{ 
            backgroundColor: basePinColor, 
            ...(isFilterActive && { animation: `${animationName} 1.5s infinite ease-in-out` }) 
          }}
        >
          {IconComponent ? <IconComponent className="w-6 h-6 text-white" /> : <div className="w-6 h-6 bg-white rounded-full"/>}
        </div>
        <div
          className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px]"
          style={{ borderTopColor: basePinColor }}
        />
      </div>
    </>
  );
};

const UserCustomMapMarker = () => {
  return (
    <div className="flex flex-col items-center" title="Sua Localização" style={{ transform: 'translate(-50%, -100%)' }}>
      <div
        className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full shadow-md" 
      >
        <UserIconLucide className="w-5 h-5 text-white" />
      </div>
      <div
        className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-blue-500"
      />
    </div>
  );
};


const getYouTubeEmbedUrl = (url?: string): string | null => {
  if (!url) return null;
  let videoId = null;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
      videoId = urlObj.searchParams.get('v');
    } else if (urlObj.hostname === 'youtu.be') {
      const pathParts = urlObj.pathname.substring(1).split('/');
      videoId = pathParts[0]; 
    }
  } catch (e) {
    console.warn("Could not parse YouTube URL for embed: ", url, e);
    return null;
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0` : null; 
};

const isEventHappeningNow = (startDateTime: FirebaseTimestamp, endDateTime: FirebaseTimestamp): boolean => {
  const now = new Date();
  const startTime = startDateTime.toDate();
  const endTime = endDateTime.toDate();
  return now >= startTime && now <= endTime;
};


const MapContentAndLogic = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeVenueTypeFilters, setActiveVenueTypeFilters] = useState<VenueType[]>([]);
  const [activeMusicStyleFilters, setActiveMusicStyleFilters] = useState<MusicStyle[]>([]);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false); 
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  
  const [userCheckIns, setUserCheckIns] = useState<Record<string, boolean>>({}); // { eventId: true }
  const [userRatings, setUserRatings] = useState<Record<string, UserRating>>({}); // { eventId: UserRating }

  const [currentRating, setCurrentRating] = useState(0);
  const [currentComment, setCurrentComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const mapsApi = useMapsLibrary('maps'); 

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserName(userDocSnap.data().name || "Usuário Fervo");
        } else {
          setCurrentUserName("Usuário Fervo");
        }
      } else {
        setCurrentUserName(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);


  useEffect(() => {
    if (currentUser) {
      const checkInsRef = collection(firestore, `users/${currentUser.uid}/checkedInEvents`);
      const unsubscribeCheckIns = onSnapshot(checkInsRef, (snapshot) => {
        const checkInsData: Record<string, boolean> = {};
        snapshot.docs.forEach(doc => {
          checkInsData[doc.id] = true; 
        });
        setUserCheckIns(checkInsData);
      });
      
      // Listener for user's ratings to update UI if they rate elsewhere or to load existing ratings
      const ratingsQuery = query(collection(firestore, 'eventRatings'), where('userId', '==', currentUser.uid));
      const unsubscribeRatings = onSnapshot(ratingsQuery, (snapshot) => {
        const ratingsData: Record<string, UserRating> = {};
        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            ratingsData[data.eventId] = {
                rating: data.rating,
                comment: data.comment,
                createdAt: data.createdAt,
                userName: data.userName, // Though this is their own rating, good to have consistent structure
            };
        });
        setUserRatings(ratingsData);
      });

      return () => {
        unsubscribeCheckIns();
        unsubscribeRatings();
      };
    }
  }, [currentUser]);


  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting user location:", error);
          setUserLocation({ lat: -23.55052, lng: -46.633308 }); 
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
      setUserLocation({ lat: -23.55052, lng: -46.633308 }); 
    }
  }, []);

  useEffect(() => {
    const fetchVenues = async () => {
      setIsLoadingVenues(true);
      try {
        const usersCollectionRef = collection(firestore, 'users');
        const qPartners = query(
          usersCollectionRef,
          where('role', '==', UserRole.PARTNER),
          where('questionnaireCompleted', '==', true)
        );
        const partnersSnapshot = await getDocs(qPartners);
        
        const venuePromises = partnersSnapshot.docs.map(async (partnerDoc) => {
          const partnerData = partnerDoc.data();
          let imageUrl;
          if (partnerData.youtubeUrl) {
            try {
                const embedUrl = getYouTubeEmbedUrl(partnerData.youtubeUrl);
                if (embedUrl) {
                    const videoId = embedUrl.split('/').pop()?.split('?')[0];
                    if (videoId) imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                }
            } catch (e) { console.warn("Could not parse YouTube URL for thumbnail: ", partnerData.youtubeUrl); }
          }

          let hasActiveEvent = false;
          let activeEventName: string | null = null;

          const eventsCollectionRef = collection(firestore, 'users', partnerDoc.id, 'events');
          const eventsQuery = query(eventsCollectionRef, where('visibility', '==', true));
          const eventsSnapshot = await getDocs(eventsQuery);

          if (!eventsSnapshot.empty) {
            for (const eventDoc of eventsSnapshot.docs) {
              const eventData = eventDoc.data();
              if (eventData.startDateTime && eventData.endDateTime && 
                  isEventHappeningNow(eventData.startDateTime as FirebaseTimestamp, eventData.endDateTime as FirebaseTimestamp)) {
                hasActiveEvent = true;
                activeEventName = eventData.eventName as string;
                break; 
              }
            }
          }

          return {
            id: partnerDoc.id,
            name: partnerData.venueName || 'Nome Indisponível',
            type: partnerData.venueType as VenueType,
            musicStyles: partnerData.musicStyles || [],
            location: partnerData.location,
            description: partnerData.venueName || 'Visite este local!', 
            imageUrl: imageUrl,
            youtubeUrl: partnerData.youtubeUrl,
            instagramUrl: partnerData.instagramUrl,
            facebookUrl: partnerData.facebookUrl,
            whatsappPhone: partnerData.whatsappPhone,
            hasActiveEvent,
            activeEventName,
          };
        });

        const fetchedVenues = (await Promise.all(venuePromises))
          .filter(venue => venue.location && typeof venue.location.lat === 'number' && typeof venue.location.lng === 'number' && venue.type && venueTypeIcons[venue.type]);
        
        setVenues(fetchedVenues);
      } catch (error) {
        console.error("Error fetching venues:", error);
      } finally {
        setIsLoadingVenues(false);
      }
    };

    fetchVenues();
  }, []);

  const fetchVenueEvents = async (venueId: string) => {
    if (!selectedVenue || selectedVenue.id !== venueId || selectedVenue.events) return; 
    setIsLoadingEvents(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', venueId, 'events');
      const q = query(eventsCollectionRef, where('visibility', '==', true));
      // Add listener for real-time event updates (including ratings)
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as VenueEvent)).sort((a,b) => a.startDateTime.toMillis() - b.startDateTime.toMillis()); 
        
        setSelectedVenue(prev => prev ? { ...prev, events: eventsData } : null);
        setIsLoadingEvents(false); 
      }, (error) => {
        console.error("Error fetching venue events with onSnapshot:", error);
        setIsLoadingEvents(false);
      });
      // Store unsubscribe function to call on cleanup if needed, though sheet closure handles this.
      return unsubscribe; 
    } catch (error) {
      console.error("Error fetching venue events:", error);
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (selectedVenue && !selectedVenue.events) {
      fetchVenueEvents(selectedVenue.id);
    } else if (selectedVenue && selectedVenue.events) {
      // If events are already loaded, reset rating form for the selected venue
      setCurrentRating(0);
      setCurrentComment('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenue]);


  const toggleVenueTypeFilter = useCallback((type: VenueType) => {
    setActiveVenueTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const toggleMusicStyleFilter = useCallback((style: MusicStyle) => {
    setActiveMusicStyleFilters(prev =>
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]
    );
  }, []);

  const isAnyFilterActive = activeVenueTypeFilters.length > 0 || activeMusicStyleFilters.length > 0;

  const filteredVenuesForBlinking = useMemo(() => {
    if (!isAnyFilterActive) return [];
    return venues.filter(venue => {
      const venueTypeMatch = activeVenueTypeFilters.length === 0 || activeVenueTypeFilters.includes(venue.type);
      const musicStyleMatch = activeMusicStyleFilters.length === 0 || 
                             (venue.musicStyles && venue.musicStyles.some(style => activeMusicStyleFilters.includes(style)));
      
      if (activeVenueTypeFilters.length > 0 && activeMusicStyleFilters.length > 0) {
        return venueTypeMatch && musicStyleMatch;
      }
      if (activeVenueTypeFilters.length > 0) {
        return venueTypeMatch;
      }
      if (activeMusicStyleFilters.length > 0) {
        return musicStyleMatch;
      }
      return false;
    });
  }, [venues, activeVenueTypeFilters, activeMusicStyleFilters, isAnyFilterActive]);

  const displayedVenues = useMemo(() => {
    return venues;
  }, [venues]);


  const VenueIconDisplayForFilter = ({ type }: { type: VenueType }) => {
    const IconComponent = venueTypeIcons[type];
    let colorClass = "text-foreground"; 
    
    if (type === VenueType.NIGHTCLUB) colorClass = "text-primary";
    else if (type === VenueType.BAR) colorClass = "text-accent";
    else if (type === VenueType.STAND_UP) colorClass = "text-yellow-400"; 
    else if (type === VenueType.SHOW_HOUSE) colorClass = "text-secondary";
    else if (type === VenueType.ADULT_ENTERTAINMENT) colorClass = "text-pink-500"; 
    else if (type === VenueType.LGBT) colorClass = "text-orange-500"; 
    
    return IconComponent ? <IconComponent className={`w-5 h-5 ${colorClass}`} /> : <div className={`w-5 h-5 rounded-full ${colorClass}`} />;
  };

  const handleRateEvent = async (eventId: string, partnerId: string) => {
    if (!currentUser || !currentUserName) {
        toast({ title: "Não Autenticado", description: "Você precisa estar logado para avaliar.", variant: "destructive" });
        return;
    }
    if (currentRating === 0) {
        toast({ title: "Avaliação Incompleta", description: "Por favor, selecione uma nota (1-5 estrelas).", variant: "destructive" });
        return;
    }
    setIsSubmittingRating(true);
    try {
        const eventDocRef = doc(firestore, `users/${partnerId}/events/${eventId}`);
        // Store user's rating in a top-level collection for easier querying by eventId later by partner
        const ratingDocRef = doc(collection(firestore, 'eventRatings'), `${eventId}_${currentUser.uid}`);
        
        // Update aggregated rating on event document
        await runTransaction(firestore, async (transaction) => {
            const eventSnap = await transaction.get(eventDocRef);
            if (!eventSnap.exists()) throw new Error("Evento não encontrado para atualizar avaliação.");
            
            const eventData = eventSnap.data();
            const oldRatingCount = eventData.ratingCount || 0;
            const oldAverageRating = eventData.averageRating || 0;

            const newRatingCount = oldRatingCount + 1;
            const newAverageRating = ((oldAverageRating * oldRatingCount) + currentRating) / newRatingCount;
            
            transaction.update(eventDocRef, {
                averageRating: newAverageRating,
                ratingCount: newRatingCount,
            });

            transaction.set(ratingDocRef, {
                eventId: eventId,
                partnerId: partnerId,
                userId: currentUser.uid,
                userName: currentUserName,
                rating: currentRating,
                comment: currentComment || null,
                createdAt: serverTimestamp(),
            });

            // Mark as rated in user's personal check-in log
            const userCheckedInEventRef = doc(firestore, `users/${currentUser.uid}/checkedInEvents/${eventId}`);
            transaction.update(userCheckedInEventRef, { hasRated: true });
        });

        toast({ title: "Avaliação Enviada!", description: "Obrigado pelo seu feedback!", variant: "default" });
        setCurrentRating(0);
        setCurrentComment('');
        // UI should update due to onSnapshot listeners
    } catch (error: any) {
        console.error("Error submitting rating:", error);
        toast({ title: "Erro ao Avaliar", description: error.message || "Não foi possível enviar sua avaliação.", variant: "destructive" });
    } finally {
        setIsSubmittingRating(false);
    }
};


  if (!userLocation) {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando sua localização...</div>;
  }

  if (!mapsApi && GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_DEFAULT_API_KEY_HERE") {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando API do Mapa...</div>;
  }

  if (isLoadingVenues) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <Loader2 className="w-12 h-12 mb-4 text-primary animate-spin" />
        Carregando locais...
      </div>
    );
  }


  return (
    <div className="relative flex w-full h-[calc(100vh-4rem)]"> 
      <Card 
        className={cn(
          "absolute z-20 top-4 left-4 w-11/12 max-w-xs sm:w-80 md:w-96 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out border-primary/50",
          filterSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]'
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <UICardTitle className="text-lg text-primary">Filtrar Locais</UICardTitle>
          <Button variant="ghost" size="icon" onClick={() => setFilterSidebarOpen(false)} className="text-primary hover:text-primary/80">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-12rem)] pr-3"> 
            <div className="space-y-3">
              <h3 className="text-md font-semibold text-primary/80">Tipo de Local</h3>
              {VENUE_TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={activeVenueTypeFilters.includes(option.value) ? "secondary" : "outline"}
                  onClick={() => toggleVenueTypeFilter(option.value)}
                  className={`w-full justify-start ${activeVenueTypeFilters.includes(option.value) ? 'bg-primary/30 text-primary border-primary hover:bg-primary/40' : 'hover:bg-primary/10 hover:border-primary/50'}`}
                  aria-pressed={activeVenueTypeFilters.includes(option.value)}
                >
                  <VenueIconDisplayForFilter type={option.value} />
                  <span className="ml-2">{option.label}</span>
                </Button>
              ))}
            </div>
            <Separator className="my-4 bg-primary/30" />
            <div className="space-y-3">
              <h3 className="text-md font-semibold text-primary/80">Estilo Musical do Local</h3>
              {MUSIC_STYLE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={activeMusicStyleFilters.includes(option.value) ? "secondary" : "outline"}
                  onClick={() => toggleMusicStyleFilter(option.value)}
                  className={`w-full justify-start ${activeMusicStyleFilters.includes(option.value) ? 'bg-primary/30 text-primary border-primary hover:bg-primary/40' : 'hover:bg-primary/10 hover:border-primary/50'}`}
                  aria-pressed={activeMusicStyleFilters.includes(option.value)}
                >
                  <Music2 className="w-5 h-5 text-primary/70" />
                  <span className="ml-2">{option.label}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex-1 h-full">
        {!filterSidebarOpen && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFilterSidebarOpen(true)}
            className="absolute z-20 p-2 rounded-full top-4 left-4 text-primary border-primary bg-background/80 hover:bg-primary/10 shadow-lg"
            aria-label="Abrir filtros"
          >
            <Filter className="w-5 h-5" />
          </Button>
        )}
        <GoogleMap
          defaultCenter={userLocation}
          defaultZoom={15}
          mapId="fervoAppMap"
          gestureHandling="greedy"
          disableDefaultUI={true}
          className="w-full h-full"
          options={{
            styles: [ 
              { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
              { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
              { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
              { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
              { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
              { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
              { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
              { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
              { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
              { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
              { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
              { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
              { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
              { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
              { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
              { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
              { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
              { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
            ],
          }}
        >
          <MapUpdater center={userLocation} />
          
          {mapsApi && userLocation && (
            <AdvancedMarker
              position={userLocation}
              title="Sua Localização"
            >
              <UserCustomMapMarker />
            </AdvancedMarker>
          )}
          
          {mapsApi && displayedVenues.map((venue) => {
            const isVenueFilteredForBlinking = filteredVenuesForBlinking.some(fv => fv.id === venue.id);
            
            return (
              <AdvancedMarker
                key={venue.id}
                position={venue.location}
                onClick={() => {
                  setSelectedVenue(venue);
                }}
                title={venue.name}
                zIndex={isVenueFilteredForBlinking || venue.hasActiveEvent ? 100 : 1} 
              >
                <VenueCustomMapMarker 
                  type={venue.type} 
                  venueName={venue.name} 
                  isFilterActive={isVenueFilteredForBlinking}
                  hasActiveEvent={venue.hasActiveEvent}
                />
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </div>

      {selectedVenue && (
        <Sheet open={!!selectedVenue} onOpenChange={(isOpen) => { if (!isOpen) setSelectedVenue(null); }}>
          <SheetContent 
            side="right" 
            className="w-full sm:max-w-md p-0 bg-background/95 backdrop-blur-md shadow-2xl border-l border-border overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()} 
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-md border-b border-border flex flex-row justify-between items-center gap-x-4">
                <SheetTitle className="text-2xl font-bold text-secondary">
                  {selectedVenue.name}
                </SheetTitle>
                 <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                    <span className="sr-only">Fechar</span>
                  </Button>
                </SheetClose>
                <SheetDescription className="sr-only">Detalhes sobre {selectedVenue.name}</SheetDescription>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-6rem)]"> 
              <div className="px-6 pb-6 pt-4 space-y-6">
                  {getYouTubeEmbedUrl(selectedVenue.youtubeUrl) ? (
                    <div className="mb-4">
                      <div className="relative w-full rounded-lg overflow-hidden shadow-lg" style={{ paddingTop: '56.25%' }}>
                        <iframe
                          src={getYouTubeEmbedUrl(selectedVenue.youtubeUrl)!}
                          title="YouTube video player"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          className="absolute top-0 left-0 w-full h-full"
                        ></iframe>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Badge variant="outline" className="border-secondary text-secondary">{venueTypeLabels[selectedVenue.type]}</Badge>
                  </div>

                  {selectedVenue.musicStyles && selectedVenue.musicStyles.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Estilos Musicais do Local</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedVenue.musicStyles.map(style => (
                           <Badge key={style} variant="outline" className="text-xs border-accent text-accent">{musicStyleLabels[style]}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedVenue.instagramUrl || selectedVenue.facebookUrl || selectedVenue.youtubeUrl || selectedVenue.whatsappPhone) && (
                    <div className="pt-4 mt-4 border-t border-border">
                      <h3 className="text-lg font-semibold text-foreground mb-3">Contatos e Redes Sociais</h3>
                      <div className="flex items-center space-x-4">
                        {selectedVenue.whatsappPhone && (
                           <a 
                            href={`https://wa.me/${selectedVenue.whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${selectedVenue.name}, te encontrei pelo Fervo App. Gostaria de informações adicionais sobre vocês.`)}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            aria-label="WhatsApp do local" 
                            title="WhatsApp" 
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <MessageSquare className="w-6 h-6" /> 
                          </a>
                        )}
                        {selectedVenue.instagramUrl && (
                          <a href={selectedVenue.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram do local" title="Instagram" className="text-muted-foreground hover:text-primary transition-colors">
                            <Instagram className="w-6 h-6" />
                          </a>
                        )}
                        {selectedVenue.facebookUrl && (
                          <a href={selectedVenue.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook do local" title="Facebook" className="text-muted-foreground hover:text-primary transition-colors">
                            <Facebook className="w-6 h-6" />
                          </a>
                        )}
                        {selectedVenue.youtubeUrl && ( 
                          <a href={selectedVenue.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="YouTube do local" title="YouTube" className="text-muted-foreground hover:text-primary transition-colors">
                            <Youtube className="w-6 h-6" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Próximos Eventos</h3>
                    {isLoadingEvents && <p className="text-muted-foreground text-center"><Loader2 className="inline w-4 h-4 mr-2 animate-spin"/> Carregando eventos...</p>}
                    {!isLoadingEvents && (!selectedVenue.events || selectedVenue.events.length === 0) && (
                      <div className="p-4 border border-dashed rounded-md border-border">
                        <p className="text-muted-foreground text-center">Sem Eventos Agendados</p>
                      </div>
                    )}
                    {!isLoadingEvents && selectedVenue.events && selectedVenue.events.length > 0 && (
                      <div className="space-y-3">
                        {selectedVenue.events.map(event => {
                          const isHappening = isEventHappeningNow(event.startDateTime, event.endDateTime);
                          const userHasCheckedIn = !!userCheckIns[event.id];
                          const userHasRated = !!userRatings[event.id];
                          const existingRatingForEvent = userRatings[event.id];

                          return (
                            <Card key={event.id} className="p-3 bg-card/50 border-border/50">
                              <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <UICardTitle className="text-md text-secondary mb-1">{event.eventName}</UICardTitle>
                                    {isHappening && (
                                      <Badge className="mt-1 text-xs bg-green-500/80 text-white hover:bg-green-500 animate-pulse">
                                        <Clapperboard className="w-3 h-3 mr-1" /> Acontecendo Agora
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-1">
                                      <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="text-accent hover:text-accent/80 -mr-2 -mt-1"
                                          onClick={() => {
                                            router.push(`/shared-event/${selectedVenue.id}/${event.id}`);
                                            toast({ title: "Link Copiado!", description: "Compartilhe este link e ganhe 2 FervoCoins! (Recurso em breve)", duration: 4000, variant: "default"});
                                          }}
                                          title="Compartilhar evento"
                                      >
                                          <Share2 className="w-5 h-5" />
                                      </Button>
                                      <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="text-primary hover:text-primary/80 -mr-2 -mt-1"
                                          onClick={() => toast({ title: "Notificação Ativada!", description: `Você será notificado sobre ${event.eventName}. (Recurso em breve)`, duration: 3000})}
                                          title="Ativar notificação para este evento"
                                      >
                                          <Bell className="w-5 h-5" />
                                      </Button>
                                  </div>
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <CalendarClock className="w-3 h-3 mr-1.5"/>
                                {format(event.startDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                                {event.pricingType !== PricingType.FREE && event.pricingValue ? `: R$ ${event.pricingValue.toFixed(2)}` : ''}
                              </p>
                               {event.averageRating !== undefined && event.ratingCount !== undefined && (
                                <div className="flex items-center gap-1 mt-1">
                                    <StarRating rating={event.averageRating} totalStars={5} size={14} readOnly />
                                    <span className="text-xs text-muted-foreground">({event.ratingCount} {event.ratingCount === 1 ? 'avaliação' : 'avaliações'})</span>
                                </div>
                               )}
                              {event.musicStyles && event.musicStyles.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Músicas: {event.musicStyles.map(style => musicStyleLabels[style]).join(', ')}
                                </p>
                              )}
                              {event.description && <p className="mt-1.5 text-xs text-foreground/80">{event.description}</p>}
                              
                              {currentUser && userHasCheckedIn && !userHasRated && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                  <h4 className="text-sm font-semibold text-primary mb-1.5">Avalie este evento:</h4>
                                  <StarRating rating={currentRating} setRating={setCurrentRating} />
                                  <Textarea 
                                    placeholder="Deixe um comentário (opcional)..."
                                    value={currentComment}
                                    onChange={(e) => setCurrentComment(e.target.value)}
                                    className="mt-2 text-xs"
                                    rows={2}
                                  />
                                  <Button 
                                    size="sm" 
                                    className="mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    onClick={() => handleRateEvent(event.id, selectedVenue.id)}
                                    disabled={isSubmittingRating || currentRating === 0}
                                  >
                                    {isSubmittingRating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Enviar Avaliação
                                  </Button>
                                </div>
                              )}
                              {currentUser && userHasCheckedIn && userHasRated && existingRatingForEvent && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                    <h4 className="text-sm font-semibold text-primary mb-1.5">Sua avaliação:</h4>
                                    <StarRating rating={existingRatingForEvent.rating} totalStars={5} size={16} readOnly />
                                    {existingRatingForEvent.comment && <p className="mt-1 text-xs text-muted-foreground italic">"{existingRatingForEvent.comment}"</p>}
                                </div>
                              )}


                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                   {selectedVenue.location && (
                    <div className="pt-6 mt-6 border-t border-border">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                            <NavigationIcon className="w-5 h-5 mr-2" />
                            Vamos Lá!
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-popover border-border shadow-md">
                          <DropdownMenuLabel className="text-muted-foreground">Abrir rota em:</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            className="hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
                            onClick={() => {
                              const { lat, lng } = selectedVenue.location!;
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
                            }}
                          >
                            <MapPin className="w-4 h-4 mr-2 text-primary" /> Google Maps
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
                            onClick={() => {
                              const { lat, lng } = selectedVenue.location!;
                              window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
                            }}
                          >
                            <Navigation2 className="w-4 h-4 mr-2 text-primary" /> Waze
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
                            onClick={() => {
                              const { lat, lng } = selectedVenue.location!;
                              const venueName = encodeURIComponent(selectedVenue.name);
                              window.open(`https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[formatted_address]=${venueName}`, '_blank');
                              toast({
                                title: "Uber (Redirecionando)",
                                description: "Você será redirecionado para o app Uber. Confirme os detalhes da viagem lá.",
                                variant: "default",
                                duration: 5000,
                              });
                            }}
                          >
                            <Car className="w-4 h-4 mr-2 text-primary" /> Uber
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};


const MapPage: NextPage = () => {
  const apiKey = GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_DEFAULT_API_KEY_HERE") {
    return <div className="flex items-center justify-center h-screen bg-background text-destructive">API Key do Google Maps não configurada corretamente. Verifique as configurações em next.config.ts (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).</div>;
  }
  return (
    <APIProvider apiKey={apiKey} solutionChannel="GMP_devsite_samples_v3_rgmbasic" libraries={['marker', 'maps']}>
      <MapContentAndLogic />
    </APIProvider>
  );
}

export default MapPage;

