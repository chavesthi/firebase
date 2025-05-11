'use client';

import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback, use } from 'react';
import type { NextPage } from 'next';
import { useRouter, useSearchParams, useParams } from 'next/navigation'; // Added useParams
import { Filter, X, Music2, Loader2, CalendarClock, MapPin, Navigation2, Car, Navigation as NavigationIcon, User as UserIconLucide, Instagram, Facebook, Youtube, Bell, Share2, Clapperboard, MessageSquare, Star as StarIcon, Send, Heart, BellOff } from 'lucide-react';
import { collection, getDocs, query, where, Timestamp as FirebaseTimestamp, doc, runTransaction, serverTimestamp, onSnapshot, updateDoc, orderBy, getDoc, increment, writeBatch, addDoc, collectionGroup } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle as UICardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GOOGLE_MAPS_API_KEY, VenueType, MusicStyle, MUSIC_STYLE_OPTIONS, VENUE_TYPE_OPTIONS, UserRole, PricingType, PRICING_TYPE_OPTIONS, FERVO_COINS_SHARE_REWARD, FERVO_COINS_FOR_COUPON, COUPON_REWARD_DESCRIPTION, COUPON_CODE_PREFIX } from '@/lib/constants';
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
  shareRewardsEnabled?: boolean; // Added for FervoCoin sharing rewards
}

interface Venue {
  id: string;
  name: string;
  type: VenueType;
  musicStyles?: MusicStyle[];
  location: Location;
  youtubeUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  whatsappPhone?: string;
  events?: VenueEvent[];
  hasActiveEvent?: boolean;
  activeEventName?: string | null;
  averageVenueRating?: number;
  venueRatingCount?: number;
}

interface UserRatingData {
  rating: number;
  comment?: string;
  createdAt: FirebaseTimestamp;
  userName: string;
  eventName?: string; // Added for denormalization
}

// Data structure for venue-specific coins on user document
interface UserVenueCoins {
    [partnerId: string]: number;
}

// This AppUser interface is specific to this page, might differ from MainAppLayout's one
interface MapPageAppUser {
    uid: string;
    name: string;
    favoriteVenueIds?: string[];
    role: UserRole; // Added role
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
  [VenueType.STAND_UP]: '#FACC15', // Yellow-ish for standup
  [VenueType.SHOW_HOUSE]: 'hsl(var(--secondary))',
  [VenueType.ADULT_ENTERTAINMENT]: '#EC4899', // Pink for adult ent.
  [VenueType.LGBT]: '#F97316', // Orange for LGBT
};

const MapUpdater = ({ center }: { center: Location | null }) => { // center can be null
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
  const basePinColor = venueTypeColors[type] || 'hsl(var(--primary))'; // Default to primary if type unknown

  // Ensure blink highlight color is distinct from base pin color
  let effectiveBlinkHighlightColor = '#FACC15'; // Default bright yellow
  const normalizeHex = (hex: string) => hex.startsWith('#') ? hex.substring(1).toUpperCase() : hex.toUpperCase();
  const normalizedBasePinColor = basePinColor.startsWith('hsl') ? basePinColor : normalizeHex(basePinColor);


  // If basePinColor is too similar to yellow, pick another highlight (e.g., white or a light primary shade)
  if (normalizedBasePinColor === normalizeHex(effectiveBlinkHighlightColor)) {
    effectiveBlinkHighlightColor = 'white'; // Or another contrasting color like 'hsl(var(--primary), 0.7)'
  }

  // Create a unique animation name per type to avoid style conflicts if multiple types blink
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
            Acontecendo Agora!
          </div>
        )}
        <div
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full z-10",
            isFilterActive ? 'shadow-xl' : 'shadow-lg', // Keep shadow subtle if not blinking
          )}
          style={{
            backgroundColor: basePinColor,
            ...(isFilterActive && { animation: `${animationName} 1.5s infinite ease-in-out` })
          }}
        >
          {IconComponent ? <IconComponent className="w-6 h-6 text-black" /> : <div className="w-6 h-6 bg-white rounded-full"/>}
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
        className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full shadow-md" // Blue color for user marker
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
      // For youtu.be links, the video ID is part of the pathname
      const pathParts = urlObj.pathname.substring(1).split('/');
      videoId = pathParts[0];
    }
  } catch (e) {
    // Log error or handle gracefully if URL parsing fails
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

// Function to update partner's overall rating based on their event ratings
const updatePartnerOverallRating = async (partnerId: string) => {
    try {
        // Query all ratings for this partner from the 'eventRatings' collection group
        const ratingsQuery = query(
            collectionGroup(firestore, 'eventRatings'),
            where('partnerId', '==', partnerId)
        );
        const ratingsSnapshot = await getDocs(ratingsQuery);

        let totalRatingSum = 0;
        let totalRatingsCount = 0;

        ratingsSnapshot.forEach(ratingDoc => {
            const ratingData = ratingDoc.data();
            if (typeof ratingData.rating === 'number') {
                totalRatingSum += ratingData.rating;
                totalRatingsCount++;
            }
        });

        const averageVenueRating = totalRatingsCount > 0 ? parseFloat((totalRatingSum / totalRatingsCount).toFixed(2)) : 0;
        const venueRatingCount = totalRatingsCount;

        const partnerDocRef = doc(firestore, 'users', partnerId);
        await updateDoc(partnerDocRef, {
            averageVenueRating: averageVenueRating,
            venueRatingCount: venueRatingCount,
        });

        // console.log(`Partner ${partnerId} overall rating updated: ${averageVenueRating} from ${venueRatingCount} ratings.`);
    } catch (error) {
        console.error("Error updating partner overall rating:", error);
    }
};


const MapContentAndLogic = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentAppUser, setCurrentAppUser] = useState<MapPageAppUser | null>(null); // Store app user data including favorites and role
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [actualUserLocation, setActualUserLocation] = useState<Location | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeVenueTypeFilters, setActiveVenueTypeFilters] = useState<VenueType[]>([]);
  const [activeMusicStyleFilters, setActiveMusicStyleFilters] = useState<MusicStyle[]>([]);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreviewMode = searchParams.get('isPreview') === 'true';


  const [userCheckIns, setUserCheckIns] = useState<Record<string, { eventId: string; partnerId: string; eventName: string; checkedInAt: FirebaseTimestamp; hasRated?: boolean }>>({});
  const [userRatings, setUserRatings] = useState<Record<string, UserRatingData>>({}); // Store user's own ratings: { eventId: UserRatingData }

  const [currentRating, setCurrentRating] = useState(0);
  const [currentComment, setCurrentComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [currentlyRatingEventId, setCurrentlyRatingEventId] = useState<string | null>(null);


  const mapsApi = useMapsLibrary('maps'); // Use the hook to get maps API

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        // Use onSnapshot for real-time updates to favoriteVenueIds and role
        const unsubscribeUser = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              setCurrentAppUser({
                uid: user.uid,
                name: userData.name || (userData.role === UserRole.PARTNER ? "Parceiro Fervo" : "Usuário Fervo"),
                favoriteVenueIds: userData.favoriteVenueIds || [],
                role: userData.role as UserRole || UserRole.USER, // Assign role
              });
            } else {
              // Handle case where user document might not exist yet
              setCurrentAppUser({ uid: user.uid, name: "Usuário Fervo", favoriteVenueIds: [], role: UserRole.USER });
            }
        });
        return () => unsubscribeUser(); // Cleanup user snapshot listener
      } else {
        setCurrentAppUser(null);
      }
    });
    return () => unsubscribeAuth(); // Cleanup auth listener
  }, []);


  useEffect(() => {
    if (currentUser) {
      // Listener for user's checked-in events
      const checkInsRef = collection(firestore, `users/${currentUser.uid}/checkedInEvents`);
      const unsubscribeCheckIns = onSnapshot(checkInsRef, (snapshot) => {
        const checkInsData: Record<string, { eventId: string; partnerId: string; eventName: string; checkedInAt: FirebaseTimestamp; hasRated?: boolean }> = {};
        snapshot.docs.forEach(docSnap => {
          checkInsData[docSnap.id] = docSnap.data() as { eventId: string; partnerId: string; eventName: string; checkedInAt: FirebaseTimestamp; hasRated?: boolean };
        });
        setUserCheckIns(checkInsData);
      });

      return () => {
        unsubscribeCheckIns();
      };
    }
  }, [currentUser]);

  // New useEffect to fetch current user's ratings for the selected venue's events
  useEffect(() => {
    if (!currentUser || !selectedVenue || !selectedVenue.events || selectedVenue.events.length === 0) {
      return;
    }

    const fetchUserRatingsForVenueEvents = async () => {
      const newRatingsData: Record<string, UserRatingData> = {};
      for (const event of selectedVenue.events!) {
        try {
          const ratingDocRef = doc(firestore, 'eventRatings', `${event.id}_${currentUser.uid}`);
          const ratingDocSnap = await getDoc(ratingDocRef);
          if (ratingDocSnap.exists()) {
            const data = ratingDocSnap.data();
            newRatingsData[event.id] = {
              rating: data.rating,
              comment: data.comment,
              createdAt: data.createdAt as FirebaseTimestamp,
              userName: data.userName,
              eventName: data.eventName, 
            };
          }
        } catch (error) {
          console.warn(`Could not fetch user rating for event ${event.id}:`, error);
        }
      }
      setUserRatings(prevRatings => ({ ...prevRatings, ...newRatingsData }));
    };

    fetchUserRatingsForVenueEvents();
  }, [currentUser, selectedVenue, selectedVenue?.events]);


  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          setActualUserLocation(loc);
        },
        (error) => {
          console.error("Error getting user location:", error);
          const defaultLoc = { lat: -23.55052, lng: -46.633308 };
          setUserLocation(defaultLoc);
          setActualUserLocation(defaultLoc);
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
      const defaultLoc = { lat: -23.55052, lng: -46.633308 };
      setUserLocation(defaultLoc);
      setActualUserLocation(defaultLoc);
    }
  }, []);

  useEffect(() => {
    setIsLoadingVenues(true);
    const usersCollectionRef = collection(firestore, 'users');
    const qPartners = query(
      usersCollectionRef,
      where('role', '==', UserRole.PARTNER),
      where('questionnaireCompleted', '==', true) 
    );

    const unsubscribeVenues = onSnapshot(qPartners, async (partnersSnapshot) => {
      const venuePromises = partnersSnapshot.docs.map(async (partnerDoc) => {
        const partnerData = partnerDoc.data();
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
          youtubeUrl: partnerData.youtubeUrl,
          instagramUrl: partnerData.instagramUrl,
          facebookUrl: partnerData.facebookUrl,
          whatsappPhone: partnerData.whatsappPhone,
          averageVenueRating: partnerData.averageVenueRating, 
          venueRatingCount: partnerData.venueRatingCount, 
          hasActiveEvent,
          activeEventName,
        };
      });

      const fetchedVenues = (await Promise.all(venuePromises))
        .filter(venue => venue.location && typeof venue.location.lat === 'number' && typeof venue.location.lng === 'number' && venue.type && venueTypeIcons[venue.type]);

      setVenues(fetchedVenues);
      setIsLoadingVenues(false);
    }, (error) => {
      console.error("Error fetching venues with onSnapshot:", error);
      toast({ title: "Erro ao Carregar Locais", description: "Não foi possível buscar os locais em tempo real.", variant: "destructive" });
      setIsLoadingVenues(false);
    });

    return () => unsubscribeVenues(); 
  }, [toast]);

   // Effect to handle selecting venue from query parameter
   useEffect(() => {
    const venueIdFromQuery = searchParams.get('venueId');
    if (venueIdFromQuery && venues.length > 0) {
      if (selectedVenue?.id !== venueIdFromQuery) {
        const venueToSelect = venues.find(v => v.id === venueIdFromQuery);
        if (venueToSelect) {
          setSelectedVenue(venueToSelect);
          if (venueToSelect.location) {
            setUserLocation(venueToSelect.location); 
          }
        } else {
          if (selectedVenue?.id === venueIdFromQuery) setSelectedVenue(null);
          router.replace('/map', { scroll: false });
          toast({ title: "Local não encontrado", description: "O Fervo especificado no link não foi encontrado.", variant: "default" });
        }
      }
    }
  }, [searchParams, venues, router, selectedVenue?.id, toast, isPreviewMode]);


  // Fetch events for a selected venue
  const fetchVenueEvents = async (venueId: string) => {
    if (!selectedVenue || selectedVenue.id !== venueId || (selectedVenue.events && selectedVenue.events.length > 0)) return;
    setIsLoadingEvents(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', venueId, 'events');
      const q = query(eventsCollectionRef, where('visibility', '==', true), orderBy('startDateTime', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as VenueEvent)); 

        setSelectedVenue(prev => prev ? { ...prev, events: eventsData } : null);
        setIsLoadingEvents(false);
      }, (error) => {
        console.error("Error fetching venue events with onSnapshot:", error);
        toast({title: "Erro ao buscar eventos", description: "Não foi possível carregar os eventos deste local.", variant: "destructive"})
        setIsLoadingEvents(false);
      });
      return unsubscribe; 
    } catch (error) {
      console.error("Error fetching venue events:", error);
      toast({title: "Erro ao buscar eventos", description: "Ocorreu um problema inesperado.", variant: "destructive"})
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    let unsubscribeEvents: (() => void) | undefined;
    if (selectedVenue && !selectedVenue.events) { 
       fetchVenueEvents(selectedVenue.id).then(unsub => unsubscribeEvents = unsub);
    } else if (selectedVenue && selectedVenue.events) {
      setCurrentlyRatingEventId(null);
      setCurrentRating(0);
      setCurrentComment('');
    }
    return () => {
        if (unsubscribeEvents) unsubscribeEvents();
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
      prev.includes(style) ? prev.filter(s => s !== style) : [...prev, s]
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
    if (!currentUser || !currentAppUser?.name) { 
        toast({ title: "Não Autenticado", description: "Você precisa estar logado para avaliar.", variant: "destructive" });
        return;
    }
    if (currentRating === 0) {
        toast({ title: "Avaliação Incompleta", description: "Por favor, selecione uma nota (1-5 estrelas).", variant: "destructive" });
        return;
    }
    setIsSubmittingRating(true);
    setCurrentlyRatingEventId(eventId); 

    const eventNameForRating = selectedVenue?.events?.find(e => e.id === eventId)?.eventName || "Evento Desconhecido";

    try {
        const eventDocRef = doc(firestore, `users/${partnerId}/events/${eventId}`);
        const ratingDocRef = doc(firestore, 'eventRatings', `${eventId}_${currentUser.uid}`);

        await runTransaction(firestore, async (transaction) => {
            const eventSnap = await transaction.get(eventDocRef);
            if (!eventSnap.exists()) throw new Error("Evento não encontrado para atualizar avaliação.");

            const eventData = eventSnap.data();
            const oldRatingCount = eventData.ratingCount || 0;
            const oldAverageRating = eventData.averageRating || 0;

            const existingRatingSnap = await transaction.get(ratingDocRef);
            let newRatingCount = oldRatingCount;
            let newAverageRating = oldAverageRating;

            if (existingRatingSnap.exists()) {
                const previousUserRating = existingRatingSnap.data()?.rating || 0;
                newAverageRating = oldRatingCount > 0 ? ((oldAverageRating * oldRatingCount) - previousUserRating + currentRating) / oldRatingCount : currentRating;
                 if (oldRatingCount === 1 && previousUserRating === oldAverageRating * oldRatingCount) {
                    newAverageRating = currentRating;
                }

            } else {
                newRatingCount = oldRatingCount + 1;
                newAverageRating = newRatingCount > 0 ? ((oldAverageRating * oldRatingCount) + currentRating) / newRatingCount : currentRating;
            }

            transaction.update(eventDocRef, {
                averageRating: parseFloat(newAverageRating.toFixed(2)),
                ratingCount: newRatingCount,
            });

            transaction.set(ratingDocRef, {
                eventId: eventId,
                partnerId: partnerId,
                userId: currentUser.uid,
                userName: currentAppUser.name,
                rating: currentRating,
                comment: currentComment || null,
                createdAt: serverTimestamp(),
                eventName: eventNameForRating, 
            }, { merge: true });

            const userCheckedInEventRef = doc(firestore, `users/${currentUser.uid}/checkedInEvents/${eventId}`);
            transaction.update(userCheckedInEventRef, { hasRated: true });
        });

        toast({ title: "Avaliação Enviada!", description: "Obrigado pelo seu feedback!", variant: "default" });
        setCurrentRating(0);
        setCurrentComment('');
        setCurrentlyRatingEventId(null);

        if (selectedVenue) {
            await updatePartnerOverallRating(selectedVenue.id);
        }

    } catch (error: any) {
        console.error("Error submitting rating:", error);
        toast({ title: "Erro ao Avaliar", description: error.message || "Não foi possível enviar sua avaliação.", variant: "destructive" });
    } finally {
        setIsSubmittingRating(false);
    }
};

 const handleShareEvent = async (partnerId: string, eventId: string, partnerName: string, eventEndDateTime: FirebaseTimestamp) => {
    if (isPreviewMode) {
        toast({ title: "Modo Preview", description: "Compartilhamento de eventos desabilitado no modo de preview.", variant: "default" });
        return;
    }
    if (!currentUser) {
      toast({ title: "Login Necessário", description: "Faça login para compartilhar e ganhar moedas.", variant: "destructive" });
      return;
    }

    if (eventEndDateTime.toDate() < new Date()) {
        toast({ title: "Evento Encerrado", description: "Este evento já terminou e não pode mais ser compartilhado.", variant: "destructive" });
        return;
    }

    let eventDataForShare: VenueEvent | undefined;
    if (selectedVenue && selectedVenue.id === partnerId) {
        eventDataForShare = selectedVenue.events?.find(e => e.id === eventId);
    } else {
        try {
            const eventDocRef = doc(firestore, `users/${partnerId}/events/${eventId}`);
            const eventDocSnap = await getDoc(eventDocRef);
            if (eventDocSnap.exists()) {
                eventDataForShare = { id: eventDocSnap.id, ...eventDocSnap.data() } as VenueEvent;
            } else {
                toast({ title: "Erro ao Compartilhar", description: "Detalhes do evento não encontrados.", variant: "destructive" });
                return;
            }
        } catch (fetchError) {
            console.error("Error fetching event details for sharing:", fetchError);
            toast({ title: "Erro ao Compartilhar", description: "Não foi possível carregar detalhes do evento.", variant: "destructive" });
            return;
        }
    }

    if (!eventDataForShare) {
        toast({ title: "Evento não Encontrado", description: "Não foi possível encontrar os detalhes deste evento.", variant: "destructive" });
        return;
    }

    const shareUrl = `${window.location.origin}/shared-event/${partnerId}/${eventId}`;
    let sharedSuccessfully = false;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Confira este Fervo: ${partnerName} - ${eventDataForShare.eventName || 'Evento'}`,
          text: `Olha esse evento que encontrei no Fervo App!`,
          url: shareUrl,
        });
        toast({ title: "Compartilhado!", description: "Link do evento compartilhado com sucesso!", variant: "default", duration: 4000 });
        sharedSuccessfully = true;
      } catch (shareError: any) {
        if (shareError.name === 'AbortError') {
          console.log('Share operation cancelled by user.');
          return;
        } else {
          console.warn('navigator.share failed, falling back to clipboard:', shareError);
           try {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link Copiado!", description: "O compartilhamento falhou ou não está disponível. O link foi copiado para a área de transferência!", variant: "default", duration: 6000 });
            sharedSuccessfully = true;
          } catch (clipError) {
            console.error('Failed to copy link to clipboard:', clipError);
            toast({ title: "Erro ao Copiar Link", description: "Não foi possível copiar o link automaticamente.", variant: "destructive"});
          }
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link Copiado!", description: "O link do evento foi copiado. Compartilhe-o!", variant: "default", duration: 4000 });
        sharedSuccessfully = true;
      } catch (clipError) {
        console.error('Failed to copy link to clipboard (fallback):', clipError);
        toast({ title: "Erro ao Copiar Link", description: "Não foi possível copiar o link do evento.", variant: "destructive"});
      }
    }

    if (sharedSuccessfully && currentUser && (eventDataForShare.shareRewardsEnabled ?? true)) { 
      const userDocRef = doc(firestore, "users", currentUser.uid);
      const couponCollectionRef = collection(firestore, `users/${currentUser.uid}/coupons`);

      try {
        const { newCoinTotal, newCouponGenerated } = await runTransaction(firestore, async (transaction) => {
          const userSnap = await transaction.get(userDocRef);
          if (!userSnap.exists()) {
            throw new Error("Usuário não encontrado para premiar moedas.");
          }
          const userData = userSnap.data();
          const venueCoinsMap: UserVenueCoins = userData.venueCoins || {};
          const currentVenueCoins = venueCoinsMap[partnerId] || 0;

          const venueCoinFieldPath = `venueCoins.${partnerId}`;
          transaction.update(userDocRef, { [venueCoinFieldPath]: increment(FERVO_COINS_SHARE_REWARD) });

          const updatedVenueCoins = currentVenueCoins + FERVO_COINS_SHARE_REWARD;
          let couponGenerated = false;

          if (updatedVenueCoins >= FERVO_COINS_FOR_COUPON) {
            transaction.update(userDocRef, { [venueCoinFieldPath]: increment(-FERVO_COINS_FOR_COUPON) });

            const couponCode = `${COUPON_CODE_PREFIX}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const newCouponRef = doc(couponCollectionRef);
            transaction.set(newCouponRef, {
              userId: currentUser.uid,
              couponCode: couponCode,
              description: `${COUPON_REWARD_DESCRIPTION} em ${partnerName}`,
              createdAt: serverTimestamp(),
              status: 'active',
              validAtPartnerId: partnerId,
              partnerVenueName: partnerName,
            });
            couponGenerated = true;
          }
           return { newCoinTotal: updatedVenueCoins, newCouponGenerated: couponGenerated };
        });

        let rewardMessage = `Você ganhou ${FERVO_COINS_SHARE_REWARD} FervoCoins para ${partnerName}! Total neste local: ${newCoinTotal}.`;
        if (newCouponGenerated) {
          rewardMessage += ` E um novo cupom: ${COUPON_REWARD_DESCRIPTION} em ${partnerName}!`;
          toast({ title: "Recompensa Turbinada!", description: rewardMessage, variant: "default", duration: 7000 });
        } else {
          toast({ title: "Recompensa!", description: rewardMessage, variant: "default", duration: 5000 });
        }

      } catch (error) {
        console.error("Error in Venue-Specific FervoCoins/Coupon transaction:", error);
        toast({
          title: "Erro na Recompensa",
          description: `Não foi possível processar sua recompensa de moedas/cupom. Tente novamente.`,
          variant: "destructive",
          duration: 5000
        });
      }
    } else if (sharedSuccessfully && currentUser && !(eventDataForShare.shareRewardsEnabled ?? true)) {
        console.log(`Event ${eventId} shared successfully, but FervoCoin rewards are disabled for this event.`);
    }
  };

  const handleToggleFavorite = async (venueId: string, venueName: string) => {
    if (isPreviewMode) {
        toast({ title: "Modo Preview", description: "Ação de favoritar desabilitada no modo de preview.", variant: "default" });
        return;
    }
    if (!currentUser?.uid || !currentAppUser) {
      toast({ title: "Login Necessário", description: "Faça login para favoritar locais.", variant: "destructive" });
      return;
    }

    if (currentAppUser.role === UserRole.PARTNER) {
        toast({ title: "Ação não permitida", description: "Parceiros não podem favoritar locais.", variant: "default" });
        return;
    }


    const userDocRef = doc(firestore, "users", currentUser.uid);
    try {
      await runTransaction(firestore, async (transaction) => {
        const userSnap = await transaction.get(userDocRef);
        if (!userSnap.exists()) throw new Error("Usuário não encontrado.");

        const userData = userSnap.data();
        const currentFavorites: string[] = userData.favoriteVenueIds || [];
        let updatedFavorites: string[];

        if (currentFavorites.includes(venueId)) {
          updatedFavorites = currentFavorites.filter(id => id !== venueId);
          toast({ title: "Removido dos Favoritos!", description: `${venueName} não é mais um dos seus fervos favoritos.` });
        } else {
          if (currentFavorites.length >= 20) {
              toast({ title: "Limite de Favoritos Atingido", description: "Você pode ter no máximo 20 locais favoritos.", variant: "destructive", duration: 4000 });
              return;
          }
          updatedFavorites = [...currentFavorites, venueId];
          toast({ title: "Adicionado aos Favoritos!", description: `${venueName} agora é um dos seus fervos favoritos!`, variant: "default" });
        }
        transaction.update(userDocRef, { favoriteVenueIds: updatedFavorites });
      });
    } catch (error: any) {
      console.error("Error toggling favorite:", error);
      toast({ title: "Erro ao Favoritar", description: error.message || "Não foi possível atualizar seus favoritos.", variant: "destructive" });
    }
  };


  if (!userLocation) {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando sua localização...</div>;
  }

  if (!mapsApi && GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando API do Mapa... Se demorar, verifique sua conexão ou a configuração da API Key.</div>;
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
          <ScrollArea className="h-[calc(100vh-15rem)] pr-3">
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

      <div className="flex-1 h-full relative"> 
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
        
        {GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0" && mapsApi && (
            <GoogleMap
                defaultCenter={userLocation}
                defaultZoom={15}
                mapId="2cc43a385ccd3370d4c3b889"
                gestureHandling="greedy"
                disableDefaultUI={true}
                className="w-full h-full"
            >
                <MapUpdater center={userLocation} />

                {actualUserLocation && (
                    <AdvancedMarker position={actualUserLocation} title="Sua Localização">
                        <UserCustomMapMarker />
                    </AdvancedMarker>
                )}

                {displayedVenues.map((venue) => {
                    const isVenueFilteredForBlinking = filteredVenuesForBlinking.some(fv => fv.id === venue.id);

                    return (
                    <AdvancedMarker
                        key={venue.id}
                        position={venue.location}
                        onClick={() => { setSelectedVenue(venue); }}
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
        )}
        {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") && (
             <div className="flex items-center justify-center h-full bg-background text-destructive">
                API Key do Google Maps não configurada ou inválida.
            </div>
        )}
      </div>

      {selectedVenue && (
        <Sheet open={!!selectedVenue} onOpenChange={(isOpen) => {
            if (!isOpen) { 
                const venueIdInParams = searchParams.get('venueId');
                setSelectedVenue(null); 

                if (isPreviewMode && venueIdInParams) {
                    router.replace('/map', { scroll: false });
                    if (actualUserLocation) {
                        setUserLocation(actualUserLocation);
                    } else {
                        setUserLocation({ lat: -23.55052, lng: -46.633308 }); 
                    }
                } else if (!isPreviewMode) {
                    if (actualUserLocation) {
                        setUserLocation(actualUserLocation);
                    } else {
                        setUserLocation({ lat: -23.55052, lng: -46.633308 }); 
                    }
                    if (venueIdInParams) {
                        router.replace('/map', { scroll: false });
                    }
                }
            }
        }}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-md p-0 bg-background/95 backdrop-blur-md shadow-2xl border-l border-border overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="px-4 sm:px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-md border-b border-border flex flex-row justify-between items-start gap-x-4">
                <div className="flex-1">
                    <SheetTitle className="text-2xl font-bold text-secondary">
                    {selectedVenue.name}
                    </SheetTitle>
                    {selectedVenue.averageVenueRating !== undefined && selectedVenue.venueRatingCount !== undefined && selectedVenue.venueRatingCount > 0 ? (
                        <div className="flex items-center gap-2 mt-1"> 
                            <StarRating rating={selectedVenue.averageVenueRating} totalStars={5} size={16} fillColor="#FFD700" readOnly />
                            <span className="text-sm text-foreground font-semibold"> 
                                {selectedVenue.averageVenueRating.toFixed(1)}
                            </span>
                        </div>
                    ): (
                        <p className="text-xs text-muted-foreground mt-1">Este local ainda não foi avaliado.</p>
                    )}
                </div>
                <div className="flex items-center">
                   {currentUser && currentAppUser && currentAppUser.role === UserRole.USER && (
                     <Button
                        variant={currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "destructive" : "outline"}
                        size="icon"
                        className={cn(
                           "mr-2 h-8 w-8 sm:h-9 sm:w-9",
                           !currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) &&
                             "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
                           currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) &&
                             "animate-pulse"
                        )}
                        onClick={() => handleToggleFavorite(selectedVenue.id, selectedVenue.name)}
                        title={isPreviewMode ? "Favoritar desabilitado em modo preview" : (currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "Remover dos Favoritos" : "Adicionar aos Favoritos")}
                        disabled={isPreviewMode}
                      >
                        <Heart
                          className="w-4 h-4 sm:w-5 sm:w-5 fill-current"
                        />
                      </Button>
                   )}
                   <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground flex-shrink-0 -mt-1 -mr-2 sm:-mr-0 h-8 w-8 sm:h-9 sm:w-9">
                        <X className="w-4 h-4 sm:w-5 sm:w-5" />
                        <span className="sr-only">Fechar</span>
                    </Button>
                   </SheetClose>
                </div>
                <SheetDescription className="sr-only">Detalhes sobre {selectedVenue.name}</SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-6rem)]">
              <div className="px-4 sm:px-6 pb-6 pt-4 space-y-6">
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
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                          const eventHasEnded = event.endDateTime.toDate() < new Date();
                          const userCheckedInData = userCheckIns[event.id];
                          const userHasCheckedIn = !!userCheckedInData;
                          const userHasRated = userHasCheckedIn && !!userCheckedInData.hasRated;
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
                                          onClick={() => handleShareEvent(selectedVenue.id, event.id, selectedVenue.name, event.endDateTime)}
                                          title={isPreviewMode ? "Compartilhamento desabilitado no modo de preview" : (eventHasEnded ? "Evento encerrado" : "Compartilhar evento e ganhar moedas!")}
                                          disabled={!currentUser || eventHasEnded || isPreviewMode}
                                      >
                                          <Share2 className="w-5 h-5" />
                                      </Button>
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="text-primary hover:text-primary/80 -mr-2 -mt-1"
                                          onClick={() => toast({ title: "Notificação Ativada!", description: `Você será notificado sobre ${event.eventName}. (Recurso em breve)`, duration: 3000})}
                                          title={eventHasEnded ? "Evento encerrado" : "Ativar notificação para este evento"}
                                          disabled={eventHasEnded}
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
                               {event.averageRating !== undefined && event.ratingCount !== undefined && event.ratingCount > 0 ? (
                                <div className="flex items-center gap-1 mt-1">
                                    <StarRating rating={event.averageRating} totalStars={5} size={14} fillColor="#FFD700" readOnly />
                                    <span className="text-xs text-muted-foreground">({event.ratingCount} {event.ratingCount === 1 ? 'avaliação' : 'avaliações'})</span>
                                </div>
                               ): (
                                <p className="text-xs text-muted-foreground mt-1">Nenhuma avaliação ainda.</p>
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
                                  <StarRating
                                    rating={currentlyRatingEventId === event.id ? currentRating : 0}
                                    setRating={setCurrentRating}
                                    readOnly={isSubmittingRating && currentlyRatingEventId === event.id}
                                    totalStars={5}
                                    size={20}
                                    fillColor="#FFD700"
                                  />
                                  <Textarea
                                    placeholder="Deixe um comentário (opcional)..."
                                    value={currentlyRatingEventId === event.id ? currentComment : ''}
                                    onChange={(e) => {
                                      setCurrentlyRatingEventId(event.id);
                                      setCurrentComment(e.target.value);
                                    }}
                                    className="mt-2 text-xs"
                                    rows={2}
                                    disabled={isSubmittingRating && currentlyRatingEventId === event.id}
                                  />
                                  <Button
                                    size="sm"
                                    className="mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    onClick={() => {
                                        if(currentlyRatingEventId !== event.id) {
                                            setCurrentRating(0);
                                            setCurrentComment('');
                                        }
                                        setCurrentlyRatingEventId(event.id);
                                        handleRateEvent(event.id, selectedVenue.id)
                                    }}
                                    disabled={isSubmittingRating && currentlyRatingEventId === event.id || (currentlyRatingEventId === event.id && currentRating === 0)}
                                  >
                                    {(isSubmittingRating && currentlyRatingEventId === event.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Enviar Avaliação
                                  </Button>
                                </div>
                              )}
                              {currentUser && userHasCheckedIn && userHasRated && existingRatingForEvent && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                    <h4 className="text-sm font-semibold text-primary mb-1.5">Sua avaliação:</h4>
                                    <StarRating rating={existingRatingForEvent.rating} totalStars={5} size={16} fillColor="#FFD700" readOnly />
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

  if (!apiKey || apiKey === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") { // Check against the actual placeholder key
    return <div className="flex items-center justify-center h-screen bg-background text-destructive">API Key do Google Maps não configurada corretamente. Verifique as configurações (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).</div>;
  }
  return (
    <APIProvider apiKey={apiKey} solutionChannel="GMP_devsite_samples_v3_rgmbasic" libraries={['marker', 'maps']}>
      <MapContentAndLogic />
    </APIProvider>
  );
}

export default MapPage;
