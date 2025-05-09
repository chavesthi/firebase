'use client';

import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { NextPage } from 'next';
import { useRouter, useSearchParams } from 'next/navigation'; // Added useSearchParams
import { Filter, X, Music2, Loader2, CalendarClock, MapPin, Navigation2, Car, Navigation as NavigationIcon, User as UserIconLucide, Instagram, Facebook, Youtube, Bell, Share2, Clapperboard, MessageSquare, Star as StarIcon, Send, Heart } from 'lucide-react';
import { collection, getDocs, query, where, Timestamp as FirebaseTimestamp, doc, runTransaction, serverTimestamp, onSnapshot, updateDoc, orderBy, getDoc, increment, writeBatch, addDoc } from 'firebase/firestore';
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
import { Logo } from '@/components/shared/logo';

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
        const eventsCollectionRef = collection(firestore, 'users', partnerId, 'events');
        const eventsSnapshot = await getDocs(eventsCollectionRef);

        let totalWeightedSum = 0;
        let totalRatingsCount = 0;

        eventsSnapshot.forEach(eventDoc => {
            const eventData = eventDoc.data();
            // Ensure we only consider events that have been rated
            if (typeof eventData.averageRating === 'number' && typeof eventData.ratingCount === 'number' && eventData.ratingCount > 0) {
                totalWeightedSum += (eventData.averageRating * eventData.ratingCount);
                totalRatingsCount += eventData.ratingCount;
            }
        });

        const averageVenueRating = totalRatingsCount > 0 ? parseFloat((totalWeightedSum / totalRatingsCount).toFixed(2)) : 0;
        const venueRatingCount = totalRatingsCount; // This is the sum of rating counts from all events

        const partnerDocRef = doc(firestore, 'users', partnerId);
        await updateDoc(partnerDocRef, {
            averageVenueRating: averageVenueRating,
            venueRatingCount: venueRatingCount, // Store the total number of ratings
        });

        // console.log(`Partner ${partnerId} overall rating updated: ${averageVenueRating} from ${venueRatingCount} ratings.`);
    } catch (error) {
        console.error("Error updating partner overall rating:", error);
        // Optionally, inform the user or log more detailed error information
    }
};


const MapContentAndLogic = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentAppUser, setCurrentAppUser] = useState<MapPageAppUser | null>(null); // Store app user data including favorites
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
  const searchParams = useSearchParams(); // For reading query params


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
        // Use onSnapshot for real-time updates to favoriteVenueIds
        const unsubscribeUser = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data();
              setCurrentAppUser({
                uid: user.uid,
                name: userData.name || "Usuário Fervo", // Fallback name
                favoriteVenueIds: userData.favoriteVenueIds || [],
              });
            } else {
              // Handle case where user document might not exist yet (e.g., new signup)
              setCurrentAppUser({ uid: user.uid, name: "Usuário Fervo", favoriteVenueIds: [] });
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

      // Listener for user's ratings on events
      // This query fetches ratings submitted *by* the current user
      const ratingsQuery = query(collection(firestore, 'eventRatings'), where('userId', '==', currentUser.uid));
      const unsubscribeRatings = onSnapshot(ratingsQuery, (snapshot) => {
        const ratingsData: Record<string, UserRatingData> = {};
        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            ratingsData[data.eventId] = { // Key by eventId for easy lookup
                rating: data.rating,
                comment: data.comment,
                createdAt: data.createdAt as FirebaseTimestamp,
                userName: data.userName, // This is the user's name on their rating
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
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(loc);
          setActualUserLocation(loc);
        },
        (error) => {
          console.error("Error getting user location:", error);
          // Fallback to a default location (e.g., São Paulo)
          const defaultLoc = { lat: -23.55052, lng: -46.633308 };
          setUserLocation(defaultLoc);
          setActualUserLocation(defaultLoc);
        }
      );
    } else {
      // Geolocation not supported
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
      where('questionnaireCompleted', '==', true) // Only fetch partners who completed setup
    );

    // Use onSnapshot for real-time updates of venues
    const unsubscribeVenues = onSnapshot(qPartners, async (partnersSnapshot) => {
      const venuePromises = partnersSnapshot.docs.map(async (partnerDoc) => {
        const partnerData = partnerDoc.data();

        // Determine if venue has an active event
        let hasActiveEvent = false;
        let activeEventName: string | null = null;

        const eventsCollectionRef = collection(firestore, 'users', partnerDoc.id, 'events');
        const eventsQuery = query(eventsCollectionRef, where('visibility', '==', true));
        const eventsSnapshot = await getDocs(eventsQuery); // Fetch once for active event check

        if (!eventsSnapshot.empty) {
          for (const eventDoc of eventsSnapshot.docs) {
            const eventData = eventDoc.data();
            if (eventData.startDateTime && eventData.endDateTime &&
                isEventHappeningNow(eventData.startDateTime as FirebaseTimestamp, eventData.endDateTime as FirebaseTimestamp)) {
              hasActiveEvent = true;
              activeEventName = eventData.eventName as string;
              break; // Found an active event, no need to check further
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
          averageVenueRating: partnerData.averageVenueRating, // Get overall venue rating
          venueRatingCount: partnerData.venueRatingCount, // Get total ratings for venue
          hasActiveEvent,
          activeEventName,
        };
      });

      const fetchedVenues = (await Promise.all(venuePromises))
        // Filter out venues without valid location or type (essential for map display)
        .filter(venue => venue.location && typeof venue.location.lat === 'number' && typeof venue.location.lng === 'number' && venue.type && venueTypeIcons[venue.type]);

      setVenues(fetchedVenues);
      setIsLoadingVenues(false);
    }, (error) => {
      console.error("Error fetching venues with onSnapshot:", error);
      toast({ title: "Erro ao Carregar Locais", description: "Não foi possível buscar os locais em tempo real.", variant: "destructive" });
      setIsLoadingVenues(false);
    });

    return () => unsubscribeVenues(); // Cleanup listener on component unmount
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
            setUserLocation(venueToSelect.location); // Center map on venue when selected via query
          }
        } else {
          // Venue ID in query not found, clear it to avoid confusion
          if (selectedVenue?.id === venueIdFromQuery) setSelectedVenue(null); // Clear selection if it matches invalid ID
          router.replace('/map', { scroll: false }); // Remove invalid venueId from URL
          toast({ title: "Local não encontrado", description: "O Fervo especificado no link não foi encontrado.", variant: "default" });
        }
      }
    }
  }, [searchParams, venues, router, selectedVenue?.id, toast]);


  // Fetch events for a selected venue
  const fetchVenueEvents = async (venueId: string) => {
    // Avoid re-fetching if events are already loaded for this venue or if it's not the selected one
    if (!selectedVenue || selectedVenue.id !== venueId || (selectedVenue.events && selectedVenue.events.length > 0)) return;
    setIsLoadingEvents(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', venueId, 'events');
      // Query for visible events, ordered by start time
      const q = query(eventsCollectionRef, where('visibility', '==', true), orderBy('startDateTime', 'asc'));

      // Use onSnapshot for real-time event updates
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as VenueEvent)); // Cast to VenueEvent type

        setSelectedVenue(prev => prev ? { ...prev, events: eventsData } : null);
        setIsLoadingEvents(false);
      }, (error) => {
        console.error("Error fetching venue events with onSnapshot:", error);
        toast({title: "Erro ao buscar eventos", description: "Não foi possível carregar os eventos deste local.", variant: "destructive"})
        setIsLoadingEvents(false);
      });
      return unsubscribe; // Return the unsubscriber function for cleanup
    } catch (error) {
      console.error("Error fetching venue events:", error);
      toast({title: "Erro ao buscar eventos", description: "Ocorreu um problema inesperado.", variant: "destructive"})
      setIsLoadingEvents(false);
    }
  };

  // Effect to fetch events when a venue is selected or if events are not yet loaded for it
  useEffect(() => {
    let unsubscribeEvents: (() => void) | undefined;
    if (selectedVenue && !selectedVenue.events) { // Only fetch if events are not already loaded
       fetchVenueEvents(selectedVenue.id).then(unsub => unsubscribeEvents = unsub);
    } else if (selectedVenue && selectedVenue.events) {
      // Reset rating state when a new venue with events is selected, or when venue data updates
      setCurrentlyRatingEventId(null);
      setCurrentRating(0);
      setCurrentComment('');
    }
    // Cleanup function for the events listener
    return () => {
        if (unsubscribeEvents) unsubscribeEvents();
    }
  }, [selectedVenue]); // Re-run when selectedVenue changes


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

  // Memoized list of venues that match active filters (for blinking effect)
  const filteredVenuesForBlinking = useMemo(() => {
    if (!isAnyFilterActive) return []; // No filters active, so no venues should blink
    return venues.filter(venue => {
      const venueTypeMatch = activeVenueTypeFilters.length === 0 || activeVenueTypeFilters.includes(venue.type);
      const musicStyleMatch = activeMusicStyleFilters.length === 0 ||
                             (venue.musicStyles && venue.musicStyles.some(style => activeMusicStyleFilters.includes(style)));

      // Logic for combining filters:
      // If both types of filters are active, venue must match both (AND logic)
      if (activeVenueTypeFilters.length > 0 && activeMusicStyleFilters.length > 0) {
        return venueTypeMatch && musicStyleMatch;
      }
      // If only venue type filters are active, match venue type
      if (activeVenueTypeFilters.length > 0) {
        return venueTypeMatch;
      }
      // If only music style filters are active, match music style
      if (activeMusicStyleFilters.length > 0) {
        return musicStyleMatch;
      }
      return false; // Should not be reached if isAnyFilterActive is true
    });
  }, [venues, activeVenueTypeFilters, activeMusicStyleFilters, isAnyFilterActive]);

  // All venues are always displayed on the map; blinking highlights filtered ones.
  const displayedVenues = useMemo(() => {
    return venues;
  }, [venues]);


  // Helper component to display venue type icons in the filter sidebar
  const VenueIconDisplayForFilter = ({ type }: { type: VenueType }) => {
    const IconComponent = venueTypeIcons[type];
    // Dynamically assign color class based on venue type for filter buttons
    let colorClass = "text-foreground"; // Default color

    if (type === VenueType.NIGHTCLUB) colorClass = "text-primary";
    else if (type === VenueType.BAR) colorClass = "text-accent";
    else if (type === VenueType.STAND_UP) colorClass = "text-yellow-400"; // Example: yellow for stand-up
    else if (type === VenueType.SHOW_HOUSE) colorClass = "text-secondary";
    else if (type === VenueType.ADULT_ENTERTAINMENT) colorClass = "text-pink-500"; // Example: pink for adult
    else if (type === VenueType.LGBT) colorClass = "text-orange-500"; // Example: orange for LGBT

    return IconComponent ? <IconComponent className={`w-5 h-5 ${colorClass}`} /> : <div className={`w-5 h-5 rounded-full ${colorClass}`} />;
  };

  const handleRateEvent = async (eventId: string, partnerId: string) => {
    if (!currentUser || !currentAppUser?.name) { // Check currentAppUser.name
        toast({ title: "Não Autenticado", description: "Você precisa estar logado para avaliar.", variant: "destructive" });
        return;
    }
    if (currentRating === 0) {
        toast({ title: "Avaliação Incompleta", description: "Por favor, selecione uma nota (1-5 estrelas).", variant: "destructive" });
        return;
    }
    setIsSubmittingRating(true);
    setCurrentlyRatingEventId(eventId); // Keep track of which event is being rated

    try {
        const eventDocRef = doc(firestore, `users/${partnerId}/events/${eventId}`);
        // Unique ID for the rating document: eventId_userId
        const ratingDocRef = doc(firestore, 'eventRatings', `${eventId}_${currentUser.uid}`);

        // Firestore transaction to update event's average rating and rating count atomically
        await runTransaction(firestore, async (transaction) => {
            const eventSnap = await transaction.get(eventDocRef);
            if (!eventSnap.exists()) throw new Error("Evento não encontrado para atualizar avaliação.");

            const eventData = eventSnap.data();
            const oldRatingCount = eventData.ratingCount || 0;
            const oldAverageRating = eventData.averageRating || 0;

            // Check if this user has already rated this event
            const existingRatingSnap = await transaction.get(ratingDocRef);
            let newRatingCount = oldRatingCount;
            let newAverageRating = oldAverageRating;

            if (existingRatingSnap.exists()) {
                // User is updating their previous rating
                const previousUserRating = existingRatingSnap.data()?.rating || 0;
                // Adjust average: (old_avg * old_count - prev_rating + new_rating) / old_count
                // Important: newRatingCount does NOT change if user is updating their rating
                newAverageRating = oldRatingCount > 0 ? ((oldAverageRating * oldRatingCount) - previousUserRating + currentRating) / oldRatingCount : currentRating;
                 // Edge case: if only one rating existed and it's being updated
                 if (oldRatingCount === 1 && previousUserRating === oldAverageRating * oldRatingCount) { // simplified: if (oldRatingCount === 1)
                    newAverageRating = currentRating;
                }

            } else {
                // New rating from this user
                newRatingCount = oldRatingCount + 1;
                // Adjust average: (old_avg * old_count + new_rating) / new_count
                newAverageRating = newRatingCount > 0 ? ((oldAverageRating * oldRatingCount) + currentRating) / newRatingCount : currentRating;
            }

            // Update the event document with new average and count
            transaction.update(eventDocRef, {
                averageRating: parseFloat(newAverageRating.toFixed(2)), // Store with 2 decimal places
                ratingCount: newRatingCount,
            });

            // Create or update the user's rating document in 'eventRatings' collection
            transaction.set(ratingDocRef, {
                eventId: eventId,
                partnerId: partnerId, // Store partnerId for easier querying if needed
                userId: currentUser.uid,
                userName: currentAppUser.name, // Use name from currentAppUser
                rating: currentRating,
                comment: currentComment || null, // Store comment or null
                createdAt: serverTimestamp(), // Use server timestamp
            }, { merge: true }); // Use merge:true if you want to update existing rating fields selectively

            // Mark that the user has rated this event in their `checkedInEvents` subcollection
            const userCheckedInEventRef = doc(firestore, `users/${currentUser.uid}/checkedInEvents/${eventId}`);
            transaction.update(userCheckedInEventRef, { hasRated: true });
        });

        toast({ title: "Avaliação Enviada!", description: "Obrigado pelo seu feedback!", variant: "default" });
        // Reset rating form state
        setCurrentRating(0);
        setCurrentComment('');
        setCurrentlyRatingEventId(null);

        // After successfully rating an event, update the partner's overall venue rating
        if (selectedVenue) { // Ensure selectedVenue is defined
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
    if (!currentUser) {
      toast({ title: "Login Necessário", description: "Faça login para compartilhar e ganhar moedas.", variant: "destructive" });
      return;
    }

    // Prevent sharing of past events
    if (eventEndDateTime.toDate() < new Date()) {
        toast({ title: "Evento Encerrado", description: "Este evento já terminou e não pode mais ser compartilhado.", variant: "destructive" });
        return;
    }

    const shareUrl = `${window.location.origin}/shared-event/${partnerId}/${eventId}`;
    let sharedSuccessfully = false;

    // --- Share via Web Share API or Clipboard ---
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Confira este Fervo: ${partnerName} - ${selectedVenue?.events?.find(e => e.id === eventId)?.eventName || 'Evento'}`,
          text: `Olha esse evento que encontrei no Fervo App!`,
          url: shareUrl,
        });
        toast({ title: "Compartilhado!", description: "Link do evento compartilhado com sucesso!", variant: "default", duration: 4000 });
        sharedSuccessfully = true;
      } catch (shareError: any) {
        if (shareError.name === 'AbortError') {
          // User cancelled the share operation
          console.log('Share operation cancelled by user.');
          return; // Don't award coins if cancelled
        } else { // Handle other share errors by falling back to clipboard
          console.warn('navigator.share failed, falling back to clipboard:', shareError);
           try {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link Copiado!", description: "O compartilhamento falhou ou não está disponível. O link foi copiado para a área de transferência!", variant: "default", duration: 6000 });
            sharedSuccessfully = true; // Award coins even if copied
          } catch (clipError) {
            console.error('Failed to copy link to clipboard:', clipError);
            toast({ title: "Erro ao Copiar Link", description: "Não foi possível copiar o link automaticamente.", variant: "destructive"});
          }
        }
      }
    } else { // Fallback for browsers without Web Share API
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link Copiado!", description: "O link do evento foi copiado. Compartilhe-o!", variant: "default", duration: 4000 });
        sharedSuccessfully = true; // Award coins if copied
      } catch (clipError) {
        console.error('Failed to copy link to clipboard (fallback):', clipError);
        toast({ title: "Erro ao Copiar Link", description: "Não foi possível copiar o link do evento.", variant: "destructive"});
      }
    }

    // --- Award Coins and Check for Coupon ---
    if (sharedSuccessfully && currentUser) {
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

          // Update venue-specific coin count using FieldPath for the map key
          const venueCoinFieldPath = `venueCoins.${partnerId}`;
          transaction.update(userDocRef, { [venueCoinFieldPath]: increment(FERVO_COINS_SHARE_REWARD) });

          const updatedVenueCoins = currentVenueCoins + FERVO_COINS_SHARE_REWARD;
          let couponGenerated = false;

          // Check if threshold is met for THIS venue
          if (updatedVenueCoins >= FERVO_COINS_FOR_COUPON) {
            // Consume coins for this venue
            transaction.update(userDocRef, { [venueCoinFieldPath]: increment(-FERVO_COINS_FOR_COUPON) });

            // Generate coupon
            const couponCode = `${COUPON_CODE_PREFIX}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const newCouponRef = doc(couponCollectionRef); // Auto-generates ID
            transaction.set(newCouponRef, {
              userId: currentUser.uid, // Store userId on the coupon document
              couponCode: couponCode,
              description: `${COUPON_REWARD_DESCRIPTION} em ${partnerName}`, // Venue-specific description
              createdAt: serverTimestamp(),
              status: 'active', // Coupons are active by default
              validAtPartnerId: partnerId, // Store partner ID where coupon is valid
              partnerVenueName: partnerName, // Store partner name for display
            });
            couponGenerated = true;
          }
          // Return the updated state for the toast message
           return { newCoinTotal: updatedVenueCoins, newCouponGenerated: couponGenerated };
        });

        // Show appropriate toast message after transaction commits
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
    }
  };

  const handleToggleFavorite = async (venueId: string, venueName: string) => {
    if (!currentUser?.uid) {
      toast({ title: "Login Necessário", description: "Faça login para favoritar locais.", variant: "destructive" });
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
          if (currentFavorites.length >= 20) { // Example limit for favorites
              toast({ title: "Limite de Favoritos Atingido", description: "Você pode ter no máximo 20 locais favoritos.", variant: "destructive", duration: 4000 });
              return; // Stop execution if limit is reached
          }
          updatedFavorites = [...currentFavorites, venueId];
          toast({ title: "Adicionado aos Favoritos!", description: `${venueName} agora é um dos seus fervos favoritos!`, variant: "default" });
        }
        transaction.update(userDocRef, { favoriteVenueIds: updatedFavorites });
      });
      // Local state currentAppUser.favoriteVenueIds will update via the onSnapshot listener in the auth useEffect
    } catch (error: any) {
      console.error("Error toggling favorite:", error);
      toast({ title: "Erro ao Favoritar", description: error.message || "Não foi possível atualizar seus favoritos.", variant: "destructive" });
    }
  };


  if (!userLocation) { // Show loading until user location is determined
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando sua localização...</div>;
  }

  // Check if mapsApi is loaded, only if API key is valid
  if (!mapsApi && GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_DEFAULT_API_KEY_HERE") {
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
    <div className="relative flex w-full h-[calc(100vh-4rem)]"> {/* Ensure map takes full height minus header */}
      <div className="absolute top-4 left-4 z-30"> {/* Logo with higher z-index */}
          <Logo iconClassName="text-primary" />
      </div>
      {/* Filter Sidebar */}
      <Card
        className={cn(
          "absolute z-20 top-16 left-4 w-11/12 max-w-xs sm:w-80 md:w-96 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out border-primary/50", // Added primary border
          filterSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]' // Adjust for better hide on md
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <UICardTitle className="text-lg text-primary">Filtrar Locais</UICardTitle>
          <Button variant="ghost" size="icon" onClick={() => setFilterSidebarOpen(false)} className="text-primary hover:text-primary/80">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-15rem)] pr-3"> {/* Adjusted height */}
            {/* Venue Type Filters */}
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
            <Separator className="my-4 bg-primary/30" /> {/* Primary separator */}
            {/* Music Style Filters */}
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
                  <Music2 className="w-5 h-5 text-primary/70" /> {/* Primary tint for icon */}
                  <span className="ml-2">{option.label}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Main Map Area */}
      <div className="flex-1 h-full">
        {!filterSidebarOpen && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFilterSidebarOpen(true)}
            className="absolute z-20 p-2 rounded-full top-16 left-4 text-primary border-primary bg-background/80 hover:bg-primary/10 shadow-lg" // Primary styles
            aria-label="Abrir filtros"
          >
            <Filter className="w-5 h-5" />
          </Button>
        )}
        {/* Conditionally render GoogleMap based on API key and mapsApi loaded status */}
        {GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_DEFAULT_API_KEY_HERE" && mapsApi && (
            <GoogleMap
                defaultCenter={userLocation} // Use determined userLocation
                defaultZoom={15}
                mapId="ec411dbe9f75cb23" // Your Map ID
                gestureHandling="greedy"
                disableDefaultUI={true}
                className="w-full h-full" // Ensure map fills its container
            >
                {/* Component to smoothly update map camera when userLocation changes */}
                <MapUpdater center={userLocation} />

                {/* User's current location marker */}
                {actualUserLocation && ( // Display marker at actual user location regardless of map center
                    <AdvancedMarker position={actualUserLocation} title="Sua Localização">
                        <UserCustomMapMarker />
                    </AdvancedMarker>
                )}

                {/* Venue markers */}
                {displayedVenues.map((venue) => {
                    const isVenueFilteredForBlinking = filteredVenuesForBlinking.some(fv => fv.id === venue.id);

                    return (
                    <AdvancedMarker
                        key={venue.id}
                        position={venue.location}
                        onClick={() => { setSelectedVenue(venue); }} // Select venue on click
                        title={venue.name}
                        zIndex={isVenueFilteredForBlinking || venue.hasActiveEvent ? 100 : 1} // Higher zIndex for active/filtered
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
        {/* Fallback if API key is missing or mapsApi not loaded */}
        {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "YOUR_DEFAULT_API_KEY_HERE") && (
             <div className="flex items-center justify-center h-full bg-background text-destructive">
                API Key do Google Maps não configurada ou inválida.
            </div>
        )}
      </div>

      {/* Venue Details Sheet */}
      {selectedVenue && (
        <Sheet open={!!selectedVenue} onOpenChange={(isOpen) => { 
            if (!isOpen) {
                setSelectedVenue(null);
                 if (actualUserLocation) {
                    setUserLocation(actualUserLocation); // Reset map center to actual user location
                } else {
                    // Fallback if actualUserLocation is somehow null
                    setUserLocation({ lat: -23.55052, lng: -46.633308 });
                }
                router.replace('/map', { scroll: false }); // Clear venueId from URL
            }
        }}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-md p-0 bg-background/95 backdrop-blur-md shadow-2xl border-l border-border overflow-y-auto" // Allows scrolling within the sheet
            onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus trap issues
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="px-4 sm:px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-md border-b border-border flex flex-row justify-between items-start gap-x-4">
                <div className="flex-1">
                    <SheetTitle className="text-2xl font-bold text-secondary">
                    {selectedVenue.name}
                    </SheetTitle>
                    {/* Display overall venue rating */}
                    {selectedVenue.averageVenueRating !== undefined && selectedVenue.venueRatingCount !== undefined && selectedVenue.venueRatingCount > 0 ? (
                        <div className="flex items-center gap-1 mt-1">
                            <StarRating rating={selectedVenue.averageVenueRating} totalStars={5} size={16} readOnly />
                            <span className="text-xs text-muted-foreground">
                                (Avaliação Geral: {selectedVenue.averageVenueRating.toFixed(1)} de {selectedVenue.venueRatingCount} {selectedVenue.venueRatingCount === 1 ? 'avaliação de evento' : 'avaliações de eventos'})
                            </span>
                        </div>
                    ): (
                        <p className="text-xs text-muted-foreground mt-1">Este local ainda não foi avaliado.</p>
                    )}
                </div>
                <div className="flex items-center">
                   {/* Favorite Button */}
                   {currentUser && ( // Only show if user is logged in
                     <Button
                        variant={currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "destructive" : "outline"}
                        size="icon"
                        className={cn(
                           "mr-2 h-8 w-8 sm:h-9 sm:w-9",
                           !currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) && 
                             "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground", // Style for not favorited
                           currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) && 
                             "animate-pulse" // Style for favorited (destructive variant handles colors)
                        )}
                        onClick={() => handleToggleFavorite(selectedVenue.id, selectedVenue.name)}
                        title={currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                      >
                        <Heart 
                          className="w-4 h-4 sm:w-5 sm:w-5 fill-current" // fill-current uses button's text color
                        />
                      </Button>
                   )}
                   {/* Close Button */}
                   <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground flex-shrink-0 -mt-1 -mr-2 sm:-mr-0 h-8 w-8 sm:h-9 sm:w-9">
                        <X className="w-4 h-4 sm:w-5 sm:w-5" />
                        <span className="sr-only">Fechar</span>
                    </Button>
                   </SheetClose>
                </div>
                <SheetDescription className="sr-only">Detalhes sobre {selectedVenue.name}</SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-6rem)]"> {/* Adjust height based on header */}
              <div className="px-4 sm:px-6 pb-6 pt-4 space-y-6">
                  {/* YouTube Video Embed */}
                  {getYouTubeEmbedUrl(selectedVenue.youtubeUrl) ? (
                    <div className="mb-4">
                      <div className="relative w-full rounded-lg overflow-hidden shadow-lg" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}
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

                  {/* Venue Type */}
                  <div className="space-y-1">
                    <Badge variant="outline" className="border-secondary text-secondary">{venueTypeLabels[selectedVenue.type]}</Badge>
                  </div>

                  {/* Music Styles */}
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

                  {/* Social Links & WhatsApp */}
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
                        {selectedVenue.youtubeUrl && ( // Ensure YouTube link is also shown here if it exists and is not the main video
                          <a href={selectedVenue.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="YouTube do local" title="YouTube" className="text-muted-foreground hover:text-primary transition-colors">
                            <Youtube className="w-6 h-6" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Events List */}
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
                          const userHasRated = userHasCheckedIn && !!userCheckedInData.hasRated; // Check if user has rated THIS event
                          const existingRatingForEvent = userRatings[event.id]; // Get user's own rating for this event

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
                                      {/* Share Button */}
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="text-accent hover:text-accent/80 -mr-2 -mt-1"
                                          onClick={() => handleShareEvent(selectedVenue.id, event.id, selectedVenue.name, event.endDateTime)}
                                          title={eventHasEnded ? "Evento encerrado" : "Compartilhar evento e ganhar moedas!"}
                                          disabled={!currentUser || eventHasEnded} // Disable if not logged in or event ended
                                      >
                                          <Share2 className="w-5 h-5" />
                                      </Button>
                                      {/* Notification Button */}
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
                               {/* Display average event rating and count */}
                               {event.averageRating !== undefined && event.ratingCount !== undefined && event.ratingCount > 0 ? (
                                <div className="flex items-center gap-1 mt-1">
                                    <StarRating rating={event.averageRating} totalStars={5} size={14} readOnly />
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

                              {/* Rating section - only if user is logged in AND has checked in AND has NOT rated yet */}
                              {currentUser && userHasCheckedIn && !userHasRated && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                  <h4 className="text-sm font-semibold text-primary mb-1.5">Avalie este evento:</h4>
                                  <StarRating
                                    rating={currentlyRatingEventId === event.id ? currentRating : 0}
                                    setRating={setCurrentRating} // Pass the setter
                                    readOnly={isSubmittingRating && currentlyRatingEventId === event.id}
                                    totalStars={5}
                                    size={20} // Larger stars for rating input
                                  />
                                  <Textarea
                                    placeholder="Deixe um comentário (opcional)..."
                                    value={currentlyRatingEventId === event.id ? currentComment : ''}
                                    onChange={(e) => {
                                      setCurrentlyRatingEventId(event.id); // Set this event as the one being rated
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
                                        // Ensure rating state is for THIS event before submitting
                                        if(currentlyRatingEventId !== event.id) {
                                            // This can happen if user interacts with another rating form then clicks submit on this one
                                            // Ideally, each event's rating form would manage its own state, or we clear global state when switching
                                            setCurrentRating(0); // Reset if context switched
                                            setCurrentComment('');
                                        }
                                        setCurrentlyRatingEventId(event.id); // Confirm context
                                        handleRateEvent(event.id, selectedVenue.id)
                                    }}
                                    disabled={isSubmittingRating && currentlyRatingEventId === event.id || (currentlyRatingEventId === event.id && currentRating === 0)}
                                  >
                                    {(isSubmittingRating && currentlyRatingEventId === event.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Enviar Avaliação
                                  </Button>
                                </div>
                              )}
                              {/* Display user's existing rating if they have already rated */}
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
                  {/* Navigation Button */}
                   {selectedVenue.location && ( // Only show if location exists
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
                              const venueName = encodeURIComponent(selectedVenue.name); // URL encode venue name
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

  // Check if API key is valid and configured
  if (!apiKey || apiKey === "YOUR_DEFAULT_API_KEY_HERE") {
    return <div className="flex items-center justify-center h-screen bg-background text-destructive">API Key do Google Maps não configurada corretamente. Verifique as configurações (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).</div>;
  }
  return (
    // Wrap the map content with APIProvider
    <APIProvider apiKey={apiKey} solutionChannel="GMP_devsite_samples_v3_rgmbasic" libraries={['marker', 'maps']}>
      <MapContentAndLogic />
    </APIProvider>
  );
}

export default MapPage;
