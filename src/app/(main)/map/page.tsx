
'use client';

import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback, type ReactElement, useRef } from 'react';
import type { NextPage } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, X, Music2, Loader2, CalendarClock, MapPin as MapPinIcon, Navigation2, Car, Navigation as NavigationIcon, User as UserIconLucide, Instagram, Facebook, Youtube, Bell, Share2, Clapperboard, MessageSquare, Star as StarIcon, Send, Heart, BellOff, Ticket, HeartOff, XCircle as XCircleIcon, Volume2, VolumeX, AlertCircle, Trash2, ExternalLink } from 'lucide-react';
import { collection, getDocs, query, where, Timestamp as FirebaseTimestamp, doc, runTransaction, serverTimestamp, onSnapshot, updateDoc, orderBy, getDoc, increment, writeBatch, addDoc, collectionGroup, documentId } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GOOGLE_MAPS_API_KEY, VenueType, MusicStyle, MUSIC_STYLE_OPTIONS, VENUE_TYPE_OPTIONS, UserRole, PricingType, PRICING_TYPE_OPTIONS, FERVO_COINS_SHARE_REWARD, FERVO_COINS_FOR_COUPON, COUPON_REWARD_DESCRIPTION, COUPON_CODE_PREFIX, APP_URL } from '@/lib/constants';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle as SheetPrimitiveTitle, SheetDescription as SheetPrimitiveDescription, SheetClose } from '@/components/ui/sheet';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as RadixAlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { User as FirebaseUser } from 'firebase/auth';
import { Logo } from '@/components/shared/logo';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatInputForm } from '@/components/chat/chat-input-form';


interface VenueEvent {
  id: string;
  eventName: string;
  startDateTime: FirebaseTimestamp;
  endDateTime: FirebaseTimestamp;
  musicStyles?: MusicStyle[];
  pricingType: PricingType;
  pricingValue?: number;
  visibility: boolean;
  averageRating?: number;
  ratingCount?: number;
  shareRewardsEnabled?: boolean;
  description?: string;
  ticketPurchaseUrl?: string | null;
  checkInToken?: string;
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
  eventName?: string;
}

interface UserVenueCoins {
    [partnerId: string]: number;
}

interface EventShareCount {
  [eventId: string]: number;
}

interface UserEventShareCounts {
  shareCounts?: EventShareCount;
}


interface MapPageAppUser {
    uid: string;
    name: string;
    favoriteVenueIds?: string[];
    role: UserRole;
    photoURL?: string | null;
    address?: {
        city?: string;
        state?: string;
    };
    questionnaireCompleted?: boolean;
    eventShareCounts?: EventShareCount;
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
  [VenueType.STAND_UP]: '#FACC15', // Amarelo Ouro
  [VenueType.SHOW_HOUSE]: 'hsl(var(--secondary))',
  [VenueType.ADULT_ENTERTAINMENT]: '#EC4899', // Rosa choque
  [VenueType.LGBT]: '#F97316', // Laranja
};

const MapUpdater = ({ center }: { center: Location | null }) => {
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

  let effectiveBlinkHighlightColor = 'hsl(var(--secondary))'; // Default roxo
  const normalizeHex = (hex: string) => hex.startsWith('#') ? hex.substring(1).toUpperCase() : hex.toUpperCase();

  const normalizedBasePinColor = basePinColor.startsWith('hsl') ? basePinColor : `#${normalizeHex(basePinColor)}`;

  if (normalizedBasePinColor === normalizeHex(effectiveBlinkHighlightColor) || basePinColor === effectiveBlinkHighlightColor) {
    effectiveBlinkHighlightColor = 'hsl(var(--destructive))'; // Se o roxo for igual à cor base, usa vermelho como blink
  }


  const animationName = `blinkingMarkerAnimation_${type.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <>
      {isFilterActive && (
        <style jsx global>{`
          @keyframes ${animationName} {
            0% { background-color: ${basePinColor}; box-shadow: 0 0 8px 2px ${basePinColor}; transform: scale(1.05); }
            50% { background-color: ${effectiveBlinkHighlightColor}; box-shadow: 0 0 12px 4px ${effectiveBlinkHighlightColor}; transform: scale(1.15); }
            100% { background-color: ${basePinColor}; box-shadow: 0 0 8px 2px ${basePinColor}; transform: scale(1.05); }
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
            "flex items-center justify-center w-10 h-10 rounded-full z-10 border-2 border-black/30",
            isFilterActive ? 'shadow-xl' : 'shadow-lg',
          )}
          style={{
            backgroundColor: basePinColor,
            ...(isFilterActive && { animation: `${animationName} 1.5s infinite ease-in-out` })
          }}
        >
          {IconComponent ? <IconComponent className="w-6 h-6 text-black" /> : <div className="w-6 h-6 bg-black rounded-full"/>}
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
        className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full shadow-md border-2 border-white"
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

const isEventPast = (endDateTime: FirebaseTimestamp): boolean => {
    const now = new Date();
    return endDateTime.toDate() < now;
}


const updatePartnerOverallRating = async (partnerId: string) => {
    try {
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
    } catch (error) {
        console.error("Error updating partner overall rating:", error);
    }
};


const MapContentAndLogic = () => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentAppUser, setCurrentAppUser] = useState<MapPageAppUser | null>(null);
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
  const [userRatings, setUserRatings] = useState<Record<string, UserRatingData>>({});

  const [currentRating, setCurrentRating] = useState(0);
  const [currentComment, setCurrentComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [currentlyRatingEventId, setCurrentlyRatingEventId] = useState<string | null>(null);

  // Event-Specific Chat States (moved from removed chat page, managed by map page now when event chat is opened)
  const [selectedEventForChat, setSelectedEventForChat] = useState<VenueEvent | null>(null);
  const [isEventChatWidgetOpen, setIsEventChatWidgetOpen] = useState(false);
  const [isEventChatSoundMuted, setIsEventChatSoundMuted] = useState(false);
  const [showClearEventChatDialog, setShowClearEventChatDialog] = useState(false);
  const [isDeletingEventChat, setIsDeletingEventChat] = useState(false); // For potential delete logic
  const [eventChatClearedTimestamp, setEventChatClearedTimestamp] = useState<number | null>(null);


  const nightclubAudioRef = useRef<HTMLAudioElement>(null);
  const barAudioRef = useRef<HTMLAudioElement>(null);
  const adultEntertainmentAudioRef = useRef<HTMLAudioElement>(null);


  const mapsApi = useMapsLibrary('maps');

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
              const userData = userDocSnap.data() as MapPageAppUser; // Cast to include eventShareCounts
              setCurrentAppUser(userData);
            } else {
              // This case might happen if a user is authenticated but their Firestore doc is somehow missing
              // Or for a very new user before their doc is fully populated by login-form's handleSuccessfulAuth
              const basicProfile: MapPageAppUser = { uid: user.uid, name: "Usuário Fervo", favoriteVenueIds: [], role: UserRole.USER, questionnaireCompleted: false, photoURL: null, eventShareCounts: {} };
              setCurrentAppUser(basicProfile);
            }
        }, (error) => {
            console.error("MapContentAndLogic: Error fetching user document with onSnapshot:", error);
            setCurrentAppUser(null);
        });
        return () => unsubscribeUser();
      } else {
        setCurrentAppUser(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);


  useEffect(() => {
    if (currentUser) {
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
          setActualUserLocation(loc);
          // Only set userLocation (for map centering) if no specific venue is targeted by query params
          if (!searchParams.get('venueId')) {
            setUserLocation(loc);
          }
        },
        (error) => {
          console.error("Error getting user location:", error);
          const defaultLoc = { lat: -23.55052, lng: -46.633308 }; // São Paulo default
          setUserLocation(defaultLoc); // Center map on default if geolocation fails
          setActualUserLocation(null); // No actual user location obtained
          if (!isPreviewMode) {
            toast({ title: "Localização Desativada", description: "Não foi possível obter sua localização. Usando localização padrão de SP.", variant: "default" });
          }
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
      const defaultLoc = { lat: -23.55052, lng: -46.633308 };
      setUserLocation(defaultLoc);
      setActualUserLocation(null);
       if (!isPreviewMode) {
          toast({ title: "Geolocalização Indisponível", description: "Seu navegador não suporta geolocalização. Usando localização padrão de SP.", variant: "default" });
       }
    }
  }, [toast, isPreviewMode, searchParams]); // searchParams dependency added

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

   useEffect(() => {
    const venueIdFromQuery = searchParams.get('venueId');
    if (venueIdFromQuery && venues.length > 0) {
      if (selectedVenue?.id !== venueIdFromQuery) { // Prevent re-selection if already selected
        const venueToSelect = venues.find(v => v.id === venueIdFromQuery);
        if (venueToSelect) {
          setSelectedVenue(venueToSelect);
          if (venueToSelect.location) { // Center map on the selected venue
            setUserLocation(venueToSelect.location);
          }
        } else {
          // If venue not found, clear selection and query params to avoid stale state
          if (selectedVenue?.id === venueIdFromQuery) setSelectedVenue(null); // Clear only if it was the one being searched
          router.replace('/map', { scroll: false }); // Remove query params
          if (!isPreviewMode) {
            toast({ title: "Local não encontrado", description: "O Fervo especificado no link não foi encontrado.", variant: "default" });
          }
        }
      }
    }
  }, [searchParams, venues, selectedVenue?.id, router, toast, isPreviewMode]);


  const fetchVenueEvents = async (venueId: string) => {
    // Only fetch if it's a new venue or events are not yet loaded for the current selectedVenue
    if (!selectedVenue || selectedVenue.id !== venueId || (selectedVenue.events && selectedVenue.events.length > 0)) return;
    setIsLoadingEvents(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', venueId, 'events');
      const q = query(eventsCollectionRef, where('visibility', '==', true), orderBy('startDateTime', 'asc'));

      // Using getDocs for initial load when venue is selected, onSnapshot can be added if real-time event updates are critical for an open sheet
      const snapshot = await getDocs(q);
      const eventsData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as VenueEvent));

      setSelectedVenue(prev => prev ? { ...prev, events: eventsData } : null);
    } catch (error) {
      console.error("Error fetching venue events:", error);
      toast({title: "Erro ao buscar eventos", description: "Ocorreu um problema inesperado.", variant: "destructive"})
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (selectedVenue && !selectedVenue.events) { // Fetch events only if not already fetched
       fetchVenueEvents(selectedVenue.id);
    } else if (selectedVenue && selectedVenue.events) {
      // Reset rating state when a new venue's events are loaded or venue changes
      setCurrentlyRatingEventId(null);
      setCurrentRating(0);
      setCurrentComment('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenue]); // Only re-run if selectedVenue object itself changes


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

  useEffect(() => {
    const playAudio = (audioRef: React.RefObject<HTMLAudioElement>) => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => console.warn("Error playing audio:", error));
      }
    };
    const pauseAudio = (audioRef: React.RefObject<HTMLAudioElement>) => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };

    if (activeVenueTypeFilters.includes(VenueType.NIGHTCLUB)) playAudio(nightclubAudioRef);
    else pauseAudio(nightclubAudioRef);

    if (activeVenueTypeFilters.includes(VenueType.BAR)) playAudio(barAudioRef);
    else pauseAudio(barAudioRef);

    if (activeVenueTypeFilters.includes(VenueType.ADULT_ENTERTAINMENT)) playAudio(adultEntertainmentAudioRef);
    else pauseAudio(adultEntertainmentAudioRef);

    // Cleanup: pause all when component unmounts or filters change significantly
    return () => {
      pauseAudio(nightclubAudioRef);
      pauseAudio(barAudioRef);
      pauseAudio(adultEntertainmentAudioRef);
    };
  }, [activeVenueTypeFilters]);

  const isAnyFilterActive = activeVenueTypeFilters.length > 0 || activeMusicStyleFilters.length > 0;

  const filteredVenues = useMemo(() => {
    if (!isAnyFilterActive) return venues;

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
      return false; // Should not happen if isAnyFilterActive is true
    });
  }, [venues, activeVenueTypeFilters, activeMusicStyleFilters, isAnyFilterActive]);


  const VenueIconDisplayForFilter = ({ type }: { type: VenueType }) => {
    const IconComponent = venueTypeIcons[type];
    let colorClass = "text-foreground"; // Default
    let hoverColorClass = "hover:text-secondary"; // Default hover

    if (activeVenueTypeFilters.includes(type)) {
      colorClass = "text-primary"; // Active filter color
      hoverColorClass = "hover:text-primary/80";
    }

    return IconComponent ? <IconComponent className={`w-5 h-5 ${colorClass} ${hoverColorClass}`} /> : <div className={`w-5 h-5 rounded-full ${colorClass} ${hoverColorClass}`} />;
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
                // Corrected logic for updating average rating
                newAverageRating = oldRatingCount > 0 ? ((oldAverageRating * oldRatingCount) - previousUserRating + currentRating) / oldRatingCount : currentRating;
                 if (oldRatingCount === 1 && previousUserRating === oldAverageRating * oldRatingCount) { // Avoid division by zero if only one rating and it's being changed
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
                eventName: eventNameForRating, // Storing event name for context in ratings collection
            }, { merge: true }); // Use merge true to create if not exists, update if it does

            // Mark in user's check-in data that they have rated this event
            const userCheckedInEventRef = doc(firestore, `users/${currentUser.uid}/checkedInEvents/${eventId}`);
            transaction.update(userCheckedInEventRef, { hasRated: true });
        });

        toast({ title: "Avaliação Enviada!", description: "Obrigado pelo seu feedback!", variant: "default" });
        setCurrentRating(0);
        setCurrentComment('');
        setCurrentlyRatingEventId(null);

        // After a successful event rating, trigger an update to the partner's overall venue rating
        if (selectedVenue) {
            await updatePartnerOverallRating(selectedVenue.id); // Make sure this function correctly calculates and updates
        }

    } catch (error: any) {
        console.error("Error submitting rating:", error);
        toast({ title: "Erro ao Avaliar", description: error.message || "Não foi possível enviar sua avaliação.", variant: "destructive" });
    } finally {
        setIsSubmittingRating(false);
    }
};

const handleShareEvent = async (partnerId: string, eventId: string, partnerName: string, eventEndDateTime: FirebaseTimestamp, eventNameForShare?: string, shareRewardsEnabledForEvent?: boolean) => {
  console.log("handleShareEvent: Iniciando compartilhamento para evento:", eventId, "Parceiro:", partnerId);
  if (!currentUser || !currentAppUser) {
    toast({ title: "Login Necessário", description: "Faça login para compartilhar.", variant: "destructive" });
    return;
  }

  if (isPreviewMode && currentAppUser?.role === UserRole.PARTNER) {
    toast({ title: "Modo Preview", description: "Compartilhamento desabilitado para parceiros no modo de preview.", variant: "default" });
    return;
  }

  if (isEventPast(eventEndDateTime)) {
    toast({ title: "Evento Encerrado", description: "Este evento já terminou e não pode mais ser compartilhado.", variant: "destructive" });
    return;
  }

  const effectiveEventName = eventNameForShare || selectedVenue?.events?.find(e => e.id === eventId)?.eventName || 'Evento';
  const effectiveShareRewardsEnabled = shareRewardsEnabledForEvent ?? selectedVenue?.events?.find(e => e.id === eventId)?.shareRewardsEnabled ?? true;


  // Check share limit before attempting to share
  const userShareEventDataRef = doc(firestore, `users/${currentUser.uid}/eventShareCounts/${eventId}`);
  try {
      const userShareSnap = await getDoc(userShareEventDataRef);
      const currentShareCountForEvent = userShareSnap.exists() ? (userShareSnap.data()?.shareCount || 0) : 0;

      if (currentShareCountForEvent >= 10) {
          toast({ title: "Limite Atingido", description: "Você já compartilhou este evento o número máximo de vezes (10).", variant: "default", duration: 6000 });
          return; // Stop further execution
      }
  } catch (error) {
      console.error("Error fetching share count before sharing:", error);
      toast({ title: "Erro ao Verificar Compartilhamentos", description: "Não foi possível verificar seus compartilhamentos anteriores.", variant: "destructive" });
      return; // Stop if we can't verify the limit
  }


  const encodedUserName = currentAppUser.name ? encodeURIComponent(currentAppUser.name) : '';
  const webShareUrl = `${APP_URL}/shared-event/${partnerId}/${eventId}?sharedByName=${encodedUserName}`;
  const customSchemeShareUrl = `shareevent://${partnerId}/${eventId}?sharedByName=${encodedUserName}`;

  const title = `Confira este Fervo: ${partnerName} - ${effectiveEventName}`;
  const text = `Olha esse evento que encontrei no Fervo App! ${currentAppUser.name ? 'Enviado por ' + currentAppUser.name : ''}. Veja mais em:`;

  let finalSharedSuccessfully = false;
  console.log("handleShareEvent: Tentando compartilhar. URL Web:", webShareUrl, "URL Custom:", customSchemeShareUrl);

  if (typeof window !== 'undefined' && (window as any).AndroidInterface && typeof (window as any).AndroidInterface.shareLinkFromWeb === 'function') {
      try {
          console.log("Tentando compartilhar via AndroidInterface.shareLinkFromWeb com URL Web:", webShareUrl);
          (window as any).AndroidInterface.shareLinkFromWeb(webShareUrl); // Pass the web URL for content
          finalSharedSuccessfully = true;
          console.log("AndroidInterface.shareLinkFromWeb chamado com sucesso.");
          toast({ title: "Compartilhando...", description: "Use o seletor de compartilhamento do Android.", variant: "default", duration: 3000});
      } catch (nativeShareError: any) {
          console.warn('AndroidInterface.shareLinkFromWeb falhou:', nativeShareError);
      }
  }
  // Removed other fallbacks like navigator.share and clipboard to prioritize custom scheme.

  if (finalSharedSuccessfully && currentUser && effectiveShareRewardsEnabled && currentAppUser?.role === UserRole.USER) {
    console.log("handleShareEvent: Compartilhamento bem-sucedido E DENTRO DO LIMITE, processando recompensa com atraso de 15 segundos.");
    setTimeout(async () => {
        console.log("handleShareEvent: Executando lógica de recompensa após 15 segundos.");
        const userDocRef = doc(firestore, "users", currentUser.uid);
        const couponCollectionRef = collection(firestore, `users/${currentUser.uid}/coupons`);

        try {
            // All reads must happen before any writes in a transaction.
            const freshUserShareSnap = await getDoc(userShareEventDataRef); // Read current share count
            const userSnapFromTransaction = await getDoc(userDocRef); // Read current user data

            if (!userSnapFromTransaction.exists()) {
                throw new Error("Usuário não encontrado para premiar moedas (durante a leitura inicial).");
            }

            const shareCountInTransaction = freshUserShareSnap.exists() ? (freshUserShareSnap.data()?.shareCount || 0) : 0;
            const userDataFromTransaction = userSnapFromTransaction.data();
            const venueCoinsMapFromTransaction: UserVenueCoins = userDataFromTransaction.venueCoins || {};
            const currentVenueCoinsForPartnerFromTransaction = venueCoinsMapFromTransaction[partnerId] || 0;

            // Now, run the transaction with the data read above.
            const { newCoinTotal, newCouponGenerated, limitReachedInTransaction } = await runTransaction(firestore, async (transaction) => {
                // Note: We already read shareCountInTransaction and currentVenueCoinsForPartnerFromTransaction outside.
                // We might re-read userShareEventDataRef if strict atomicity on shareCount is needed *against other shares*.
                // For simplicity, we'll use the count read just before this transaction for the limit check of *this* share.

                if (shareCountInTransaction >= 10) {
                    console.log("handleShareEvent Transaction: Limite de compartilhamento (10) já atingido para evento", eventId, "antes de incrementar.");
                    // Still log the share attempt if desired, but no reward.
                    // If you strictly want to prevent even incrementing the count beyond 10, this transaction part for shareCount set can be conditional too.
                    transaction.set(userShareEventDataRef, { shareCount: increment(1), eventId: eventId, partnerId: partnerId }, { merge: true });
                    return { newCoinTotal: currentVenueCoinsForPartnerFromTransaction, newCouponGenerated: false, limitReachedInTransaction: true };
                }

                const shareCountAfterThisIncrement = shareCountInTransaction + 1;
                transaction.set(userShareEventDataRef, { shareCount: shareCountAfterThisIncrement, eventId: eventId, partnerId: partnerId }, { merge: true });

                const coinsGained = FERVO_COINS_SHARE_REWARD;
                let coinsSpentOnCoupon = 0;
                let couponGeneratedThisTransaction = false;
                const potentialTotalCoinsForPartner = currentVenueCoinsForPartnerFromTransaction + coinsGained;

                if (potentialTotalCoinsForPartner >= FERVO_COINS_FOR_COUPON) {
                    coinsSpentOnCoupon = FERVO_COINS_FOR_COUPON;
                    couponGeneratedThisTransaction = true;
                }
                const finalCoinTotalForThisPartner = currentVenueCoinsForPartnerFromTransaction + coinsGained - coinsSpentOnCoupon;

                const updatesForUserDoc: Record<string, any> = {
                    [`venueCoins.${partnerId}`]: finalCoinTotalForThisPartner,
                    // updatedAt: serverTimestamp() // serverTimestamp() cannot be used directly in transaction.update's data
                };
                transaction.update(userDocRef, updatesForUserDoc);

                if (couponGeneratedThisTransaction) {
                    const couponCode = `${COUPON_CODE_PREFIX}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
                    const newCouponRef = doc(couponCollectionRef);
                    transaction.set(newCouponRef, {
                        userId: currentUser.uid,
                        couponCode: couponCode,
                        description: `${COUPON_REWARD_DESCRIPTION} em ${partnerName}`,
                        eventName: effectiveEventName,
                        createdAt: serverTimestamp(), // This is fine in transaction.set
                        status: 'active',
                        validAtPartnerId: partnerId,
                        partnerVenueName: partnerName,
                    });
                }
                return { newCoinTotal: finalCoinTotalForThisPartner, newCouponGenerated: couponGeneratedThisTransaction, limitReachedInTransaction: (shareCountAfterThisIncrement >= 10) };
            });


            if (limitReachedInTransaction && !newCouponGenerated) {
                 toast({ title: "Limite de Compartilhamento Atingido", description: `Você atingiu o limite de 10 compartilhamentos recompensados para este evento.`, variant: "default", duration: 6000 });
            } else if (newCouponGenerated) {
                let rewardMessage = `Você ganhou ${FERVO_COINS_SHARE_REWARD} FervoCoins para ${partnerName}! Total neste local: ${newCoinTotal}. E um novo cupom: ${COUPON_REWARD_DESCRIPTION} em ${partnerName}!`;
                 if(limitReachedInTransaction) rewardMessage += " Você atingiu o limite de compartilhamentos recompensados para este evento.";
                toast({ title: "Recompensa Turbinada!", description: rewardMessage, variant: "default", duration: 7000 });
            } else if (newCoinTotal > (currentAppUser.venueCoins?.[partnerId] || 0) ) { // Check if coins actually increased
                let rewardMessage = `Você ganhou ${FERVO_COINS_SHARE_REWARD} FervoCoins para ${partnerName}! Total neste local: ${newCoinTotal}.`;
                if(limitReachedInTransaction) rewardMessage += " Você atingiu o limite de compartilhamentos recompensados para este evento.";
                toast({ title: "Recompensa!", description: rewardMessage, variant: "default", duration: 5000 });
            }

        } catch (error: any) {
            console.error("Error in Venue-Specific FervoCoins/Coupon transaction (detailed):", error);
            toast({
                title: "Erro na Recompensa",
                description: error.message || `Não foi possível processar sua recompensa de moedas/cupom.`,
                variant: "destructive",
                duration: 7000
            });
        }
    }, 15000); // 15 segundos de atraso
  } else if (finalSharedSuccessfully && currentUser && !effectiveShareRewardsEnabled && currentAppUser?.role === UserRole.USER) {
      console.log(`handleShareEvent: Evento ${eventId} compartilhado com sucesso, mas recompensas de FervoCoin estão desabilitadas para este evento.`);
  }
};


  const handleToggleFavorite = async (venueId: string, venueName: string) => {
    if (isPreviewMode && currentAppUser?.role === UserRole.PARTNER) {
        toast({ title: "Modo Preview", description: "Ação de favoritar desabilitada para parceiros no modo de preview.", variant: "default" });
        return;
    }
    if (!currentUser?.uid || !currentAppUser) {
      toast({ title: "Login Necessário", description: "Faça login para favoritar locais.", variant: "destructive" });
      return;
    }

    if (currentAppUser.role === UserRole.PARTNER && !isPreviewMode) { // Ensure non-preview partners also cannot favorite
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
          if (currentFavorites.length >= 20) { // Max 20 favorites
              toast({ title: "Limite de Favoritos Atingido", description: "Você pode ter no máximo 20 locais favoritos.", variant: "destructive", duration: 4000 });
              return; // Exit transaction logic if limit reached
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

  const handleClearEventChat = async () => {
    if (!currentUser || !selectedEventForChat) {
      toast({ title: "Erro", description: "Não foi possível identificar o chat ou o evento.", variant: "destructive" });
      return;
    }

    // Confirm deletion with user
    const confirmDelete = window.confirm("Tem certeza que deseja apagar TODAS as mensagens deste chat permanentemente para TODOS os usuários? Esta ação não pode ser desfeita.");
    if (!confirmDelete) {
        setShowClearEventChatDialog(false); // Ensure dialog closes if cancel
        return;
    }

    setIsDeletingEventChat(true);
    const messagesRef = collection(firestore, `chatRooms/${selectedEventForChat.id}/messages`);
    try {
        const querySnapshot = await getDocs(messagesRef);
        if (querySnapshot.empty) {
            toast({ title: "Chat Já Vazio", description: "Não há mensagens para apagar.", variant: "default"});
            setShowClearEventChatDialog(false);
            setIsDeletingEventChat(false);
            return;
        }

        const batch = writeBatch(firestore);
        querySnapshot.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();
        toast({ title: "Chat Limpo!", description: "Todas as mensagens foram apagadas permanentemente.", variant: "default"});
    } catch (error) {
        console.error("Error clearing event chat from Firestore:", error);
        toast({ title: "Erro ao Limpar Chat", description: "Não foi possível apagar as mensagens do servidor.", variant: "destructive"});
    } finally {
        setShowClearEventChatDialog(false);
        setIsDeletingEventChat(false);
    }
  };


  const openEventSpecificChat = (event: VenueEvent) => {
    if (!currentUser || !currentAppUser) {
        toast({ title: "Login Necessário", description: "Faça login para acessar o chat do evento.", variant: "destructive"});
        return;
    }
    if (!userCheckIns[event.id]) {
        toast({ title: "Check-in Necessário", description: "Faça check-in neste evento para participar do chat!", variant: "default", duration: 4000});
        return;
    }
    setSelectedEventForChat(event);
    setIsEventChatWidgetOpen(true);
    console.log("Opening event-specific chat for event:", event.eventName, "Room ID:", event.id);
  };


  if (!userLocation) {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground"><Loader2 className="w-10 h-10 animate-spin text-primary mr-2" /> Carregando sua localização...</div>;
  }

  if (!mapsApi && GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") { // Default key for check
    return <div className="flex items-center justify-center h-screen bg-background text-foreground"><Loader2 className="w-10 h-10 animate-spin text-primary mr-2" />Carregando API do Mapa... Se demorar, verifique sua conexão ou a configuração da API Key.</div>;
  }

  const apiKey = GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_DEFAULT_API_KEY_HERE" || apiKey === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0" /* Stricter check for a known placeholder */ ) {
    return (
        <div className="flex items-center justify-center h-screen bg-background text-destructive p-4 text-center">
            API Key do Google Maps não configurada corretamente.
            Verifique as configurações (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
        </div>
    );
  }


  return (
    <div className="relative flex w-full h-[calc(100vh-4rem)]">
      <audio ref={nightclubAudioRef} src="/audio/night-club-music-196359.mp3" preload="auto" />
      <audio ref={barAudioRef} src="/audio/general-chatter-in-bar-14816.mp3" preload="auto" />
      <audio ref={adultEntertainmentAudioRef} src="/audio/Sound Effcet Sexy Sax - Efeitos Sonoros.mp3" preload="auto" />
      <Card
        className={cn(
          "absolute z-20 top-4 left-4 w-11/12 max-w-xs sm:w-80 md:w-96 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out border-primary/50 rounded-r-lg",
          filterSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]'
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg text-primary">Filtrar Locais</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setFilterSidebarOpen(false)} className="text-primary hover:text-secondary hover:bg-secondary/10">
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
                  className={cn(
                    "w-full justify-start",
                    activeVenueTypeFilters.includes(option.value)
                      ? 'bg-primary/30 text-primary border-primary hover:bg-primary/40'
                      : 'hover:bg-secondary hover:text-secondary-foreground hover:border-secondary/50'
                  )}
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
                  className={cn(
                    "w-full justify-start",
                     activeMusicStyleFilters.includes(option.value)
                       ? 'bg-primary/30 text-primary border-primary hover:bg-primary/40'
                       : 'hover:bg-secondary hover:text-secondary-foreground hover:border-secondary/50'
                   )}
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
         <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            {!filterSidebarOpen && (
            <Button
                variant="outline"
                size="icon"
                onClick={() => setFilterSidebarOpen(true)}
                className="p-2 rounded-full text-primary border-primary bg-background/80 hover:bg-primary/10 shadow-lg"
                aria-label="Abrir filtros"
            >
                <Filter className="w-5 h-5" />
            </Button>
            )}
             <Logo logoSrc="/images/fervoapp_logo_512x512.png" logoWidth={50} logoHeight={50} className="hidden sm:flex" />
        </div>

        {/* Event-Specific Chat Widget */}
        {isEventChatWidgetOpen && currentUser && currentAppUser && selectedEventForChat && (
            <Card className={cn(
                "fixed bottom-4 right-4 z-[60] w-[90vw] max-w-sm h-auto max-h-[70vh] flex flex-col border-primary/50 bg-background/90 backdrop-blur-sm shadow-2xl rounded-lg",
                "transition-all duration-300 ease-in-out",
                isEventChatWidgetOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full"
            )}>
                <CardHeader className="p-3 sm:p-4 border-b border-border flex-row items-center justify-between sticky top-0 bg-background/95 z-10">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-md sm:text-lg text-primary leading-tight truncate max-w-[150px] sm:max-w-[200px] font-semibold">Chat: {selectedEventForChat.eventName}</CardTitle>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <AlertDialog open={showClearEventChatDialog} onOpenChange={setShowClearEventChatDialog}>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:h-8 text-muted-foreground hover:text-destructive" title="Limpar mensagens deste chat">
                                    <Trash2 className="h-4 w-4 sm:h-5 sm:h-5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <RadixAlertDialogTitle>Limpar Chat do Evento</RadixAlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja apagar TODAS as mensagens deste chat permanentemente para TODOS os usuários? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setShowClearEventChatDialog(false)} disabled={isDeletingEventChat}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleClearEventChat} disabled={isDeletingEventChat} className="bg-destructive hover:bg-destructive/90">
                                        {isDeletingEventChat ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
                                        Apagar Mensagens
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="ghost" size="icon" onClick={() => setIsEventChatSoundMuted(prev => !prev)} className="h-7 w-7 sm:h-8 sm:h-8 text-muted-foreground hover:text-primary" title={isEventChatSoundMuted ? "Ativar som do chat" : "Silenciar som do chat"}>
                            {isEventChatSoundMuted ? <VolumeX className="h-4 w-4 sm:h-5 sm:h-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:h-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsEventChatWidgetOpen(false)} className="h-7 w-7 sm:h-8 sm:h-8 text-muted-foreground hover:text-destructive" title="Fechar chat">
                            <XCircleIcon className="h-4 w-4 sm:h-5 sm:h-5"/>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-3 sm:p-4 bg-background/30">
                    <ChatMessageList
                        chatRoomId={selectedEventForChat.id}
                        currentUserId={currentUser.uid}
                        isChatSoundMuted={isEventChatSoundMuted}
                        chatClearedTimestamp={eventChatClearedTimestamp} // This prop is for client-side visual clear now
                    />
                </CardContent>
                <div className="p-3 sm:p-4 border-t border-border bg-card">
                    <ChatInputForm
                        chatRoomId={selectedEventForChat.id}
                        userId={currentUser.uid}
                        userName={currentAppUser.name} // Use currentAppUser here
                        userPhotoURL={currentAppUser.photoURL} // Use currentAppUser here
                    />
                </div>
            </Card>
        )}


        {GOOGLE_MAPS_API_KEY && mapsApi && (
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

                {filteredVenues.map((venue) => {
                    const isVenueInBlinkingList = filteredVenues.some(fv => fv.id === venue.id && isAnyFilterActive);

                    return (
                    <AdvancedMarker
                        key={venue.id}
                        position={venue.location}
                        onClick={() => { setSelectedVenue(venue); setUserLocation(venue.location); }}
                        title={venue.name}
                        zIndex={isVenueInBlinkingList || venue.hasActiveEvent ? 100 : 1}
                    >
                        <VenueCustomMapMarker
                            type={venue.type}
                            venueName={venue.name}
                            isFilterActive={isVenueInBlinkingList}
                            hasActiveEvent={venue.hasActiveEvent}
                        />
                    </AdvancedMarker>
                    );
                })}
            </GoogleMap>
        )}
        {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "YOUR_DEFAULT_API_KEY_HERE" || GOOGLE_MAPS_API_KEY === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") && (
             <div className="flex items-center justify-center h-full bg-background text-destructive">
                API Key do Google Maps não configurada corretamente. Verifique NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
            </div>
        )}
      </div>

      {selectedVenue && (
        <Sheet open={!!selectedVenue} onOpenChange={(isOpen) => {
            if (!isOpen) {
                const venueIdInParams = searchParams.get('venueId');
                setSelectedVenue(null);
                setSelectedEventForChat(null); // Close event chat when sheet closes
                setIsEventChatWidgetOpen(false); // Ensure widget is marked as closed

                if (isPreviewMode && venueIdInParams) {
                    router.replace('/map', { scroll: false }); // Remove query params
                    if (actualUserLocation) {
                        setUserLocation(actualUserLocation); // Reset map to user's actual location
                    } else {
                        // Fallback to default if actual location isn't available
                        setUserLocation({ lat: -23.55052, lng: -46.633308 });
                    }
                } else if (!isPreviewMode) {
                    if (actualUserLocation) {
                        setUserLocation(actualUserLocation);
                    } else {
                        setUserLocation({ lat: -23.55052, lng: -46.633308 });
                    }
                    if (venueIdInParams) { // If we were viewing a specific venue via query param
                        router.replace('/map', { scroll: false }); // Clear the query param
                    }
                }
            }
        }}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-md p-0 bg-background/95 backdrop-blur-md shadow-2xl border-l border-border overflow-y-auto rounded-tl-lg rounded-bl-lg"
            onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus on first element
            onCloseAutoFocus={(e) => e.preventDefault()} // Prevent focus on trigger after close
          >
            <SheetHeader className="px-4 sm:px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-md border-b border-border flex flex-row justify-between items-start gap-x-4 z-10">
                <div className="flex-1">
                    <SheetPrimitiveTitle className="text-2xl font-bold text-secondary">
                    {selectedVenue.name}
                    </SheetPrimitiveTitle>
                    {selectedVenue.averageVenueRating !== undefined && selectedVenue.venueRatingCount !== undefined && selectedVenue.venueRatingCount > 0 ? (
                        <div className="flex items-center gap-1 mt-1">
                            <StarRating rating={selectedVenue.averageVenueRating} totalStars={5} size={16} fillColor="hsl(var(--primary))" readOnly />
                            <span className="text-sm text-foreground font-semibold">
                                {selectedVenue.averageVenueRating.toFixed(1)}
                            </span>
                        </div>
                    ): (
                        <p className="text-xs text-muted-foreground mt-1">Este local ainda não foi avaliado.</p>
                    )}
                </div>
                <div className="flex items-center">
                   {currentUser && currentAppUser && currentAppUser.role === UserRole.USER && (!isPreviewMode) && (
                     <Button
                        variant={currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "destructive" : "outline"}
                        size="icon"
                        className={cn(
                           "mr-2 h-8 w-8 sm:h-9 sm:w-9",
                           !currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) &&
                             "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
                           currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) &&
                             "animate-pulse" // Example: pulse if favorited
                        )}
                        onClick={() => handleToggleFavorite(selectedVenue.id, selectedVenue.name)}
                        title={currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
                        disabled={!currentAppUser || (isPreviewMode && currentAppUser?.role === UserRole.PARTNER)}
                      >
                        {currentAppUser?.favoriteVenueIds?.includes(selectedVenue.id) ? (
                            <HeartOff className="w-4 h-4 sm:w-5 sm:w-5 fill-current" />
                        ) : (
                            <Heart className="w-4 h-4 sm:w-5 sm:w-5" />
                        )}
                      </Button>
                   )}
                   <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground flex-shrink-0 -mt-1 -mr-2 sm:-mr-0 h-8 w-8 sm:h-9 sm:w-9">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="sr-only">Fechar</span>
                    </Button>
                   </SheetClose>
                </div>
                {/* SheetPrimitiveDescription is required for accessibility, even if sr-only */}
                <SheetPrimitiveDescription className="sr-only">Detalhes sobre {selectedVenue.name}</SheetPrimitiveDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-6rem)]"> {/* Adjust height as needed */}
              <div className="px-4 sm:px-6 pb-6 pt-4 space-y-6">
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
                        {selectedVenue.youtubeUrl && !getYouTubeEmbedUrl(selectedVenue.youtubeUrl) && ( // Show only if not embedded
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
                          const eventHasEnded = isEventPast(event.endDateTime);
                          const userCheckedInData = userCheckIns[event.id];
                          const userHasCheckedIn = !!userCheckedInData;
                          const userHasRated = userHasCheckedIn && !!userCheckedInData.hasRated;
                          const existingRatingForEvent = userRatings[event.id];

                          return (
                            <Card key={event.id} className="p-3 sm:p-4 bg-card/50 border-border/50">
                              <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <CardTitle className="text-md text-secondary mb-1 font-semibold">{event.eventName}</CardTitle>
                                    {isHappening && (
                                      <Badge className="mt-1 text-xs bg-green-500/80 text-white hover:bg-green-500 animate-pulse">
                                        <Clapperboard className="w-3 h-3 mr-1" /> Acontecendo Agora
                                      </Badge>
                                    )}
                                    {eventHasEnded && !isHappening && (
                                        <Badge variant="outline" className="mt-1 text-xs border-destructive text-destructive">Encerrado</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-0.5">
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="text-accent hover:text-accent/80 -mr-1 -mt-1 h-7 w-7"
                                          onClick={() => handleShareEvent(selectedVenue.id, event.id, selectedVenue.name, event.endDateTime, event.eventName, event.shareRewardsEnabled)}
                                          title={eventHasEnded ? "Evento encerrado" : "Compartilhar evento e ganhar moedas!"}
                                          disabled={eventHasEnded || (isPreviewMode && currentAppUser?.role === UserRole.PARTNER)}
                                      >
                                          <Share2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          className="text-primary hover:text-primary/80 -mr-1 -mt-1 h-7 w-7"
                                          onClick={() => toast({ title: "Notificação Ativada!", description: `Você será notificado sobre ${event.eventName}. (Recurso em breve)`, duration: 3000})}
                                          title={eventHasEnded || event.startDateTime.toDate() < new Date() ? "Evento já começou ou encerrou" : "Ativar notificação para este evento"}
                                          disabled={eventHasEnded || event.startDateTime.toDate() < new Date()}
                                      >
                                          <Bell className="w-4 h-4" />
                                      </Button>
                                  </div>
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center mt-1">
                                <CalendarClock className="w-3 h-3 mr-1.5"/>
                                {format(event.startDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                                {event.pricingType !== PricingType.FREE && event.pricingValue ? `: R$ ${Number(event.pricingValue).toFixed(2)}` : ''}
                              </p>
                               {event.averageRating !== undefined && event.ratingCount !== undefined && event.ratingCount > 0 ? (
                                <div className="flex items-center gap-1 mt-1">
                                    <StarRating rating={event.averageRating} totalStars={5} size={14} fillColor="hsl(var(--primary))" readOnly />
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

                              {currentUser && currentAppUser?.role === UserRole.USER && !eventHasEnded && event.ticketPurchaseUrl && (
                                  <Button
                                    asChild
                                    className="w-full mt-3 bg-accent hover:bg-accent/90 text-accent-foreground text-xs"
                                    size="sm"
                                  >
                                    <a href={event.ticketPurchaseUrl} target="_blank" rel="noopener noreferrer">
                                      <Ticket className="w-3.5 h-3.5 mr-1.5" />
                                      Compre Aqui o Seu Ingresso Saia Na frente!!!
                                    </a>
                                  </Button>
                              )}

                              {/* Event-Specific Chat Button - only if user is checked in */}
                              {currentUser && currentAppUser?.role === UserRole.USER && userCheckIns[event.id] && !isEventPast(event.endDateTime) && (
                                <Button
                                  onClick={() => openEventSpecificChat(event)}
                                  variant="outline"
                                  className="w-full mt-3 border-primary text-primary hover:bg-primary/10"
                                  size="sm"
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Entrar no Chat do Evento
                                </Button>
                              )}


                              {currentUser && userHasCheckedIn && !userHasRated && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                  <h4 className="text-sm font-semibold text-primary mb-1.5">Avalie este evento:</h4>
                                  <StarRating
                                    rating={currentlyRatingEventId === event.id ? currentRating : 0}
                                    setRating={(newRating) => {
                                        setCurrentlyRatingEventId(event.id); // Ensure context is set when star is clicked
                                        setCurrentRating(newRating);
                                    }}
                                    readOnly={isSubmittingRating && currentlyRatingEventId === event.id}
                                    totalStars={5}
                                    size={20}
                                    fillColor="hsl(var(--primary))"
                                  />
                                  <Textarea
                                    placeholder="Deixe um comentário (opcional)..."
                                    value={currentlyRatingEventId === event.id ? currentComment : ''}
                                    onChange={(e) => {
                                      setCurrentlyRatingEventId(event.id); // Ensure context is set when typing
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
                                        if(currentlyRatingEventId !== event.id && !isSubmittingRating) {
                                            // If user clicks send on an event they haven't interacted with for rating yet
                                            setCurrentRating(0);
                                            setCurrentComment('');
                                        }
                                        setCurrentlyRatingEventId(event.id); // Ensure context before submission
                                        handleRateEvent(event.id, selectedVenue.id)
                                    }}
                                    disabled={(isSubmittingRating && currentlyRatingEventId === event.id) || (currentlyRatingEventId === event.id && currentRating === 0 && !existingRatingForEvent) || (currentlyRatingEventId !== event.id && currentRating === 0 && !existingRatingForEvent)}
                                  >
                                    {(isSubmittingRating && currentlyRatingEventId === event.id) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Enviar Avaliação
                                  </Button>
                                </div>
                              )}
                              {currentUser && userHasCheckedIn && userHasRated && existingRatingForEvent && (
                                <div className="mt-3 pt-3 border-t border-border/30">
                                    <h4 className="text-sm font-semibold text-primary mb-1.5">Sua avaliação:</h4>
                                    <StarRating rating={existingRatingForEvent.rating} totalStars={5} size={16} fillColor="hsl(var(--primary))" readOnly />
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
                              if (typeof window !== 'undefined' && (window as any).AndroidInterface && typeof (window as any).AndroidInterface.launchNavigation === 'function') {
                                (window as any).AndroidInterface.launchNavigation('googlemaps', lat, lng, selectedVenue.name);
                              } else {
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
                              }
                            }}
                          >
                            <MapPinIcon className="w-4 h-4 mr-2 text-primary" /> Google Maps
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
                            onClick={() => {
                              const { lat, lng } = selectedVenue.location!;
                               if (typeof window !== 'undefined' && (window as any).AndroidInterface && typeof (window as any).AndroidInterface.launchNavigation === 'function') {
                                (window as any).AndroidInterface.launchNavigation('waze', lat, lng, selectedVenue.name);
                              } else {
                                window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
                              }
                            }}
                          >
                            <Navigation2 className="w-4 h-4 mr-2 text-primary" /> Waze
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="hover:bg-accent/20 focus:bg-accent/20 cursor-pointer"
                            onClick={() => {
                              const { lat, lng } = selectedVenue.location!;
                              const venueName = encodeURIComponent(selectedVenue.name);
                               if (typeof window !== 'undefined' && (window as any).AndroidInterface && typeof (window as any).AndroidInterface.launchNavigation === 'function') {
                                (window as any).AndroidInterface.launchNavigation('uber', lat, lng, selectedVenue.name);
                              } else {
                                window.open(`https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[formatted_address]=${venueName}`, '_blank');
                              }
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
  // Stricter check for known placeholder values
  if (!apiKey || apiKey === "YOUR_DEFAULT_API_KEY_HERE" || apiKey === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0" ) {
    return (
        <div className="flex items-center justify-center h-screen bg-background text-destructive p-4 text-center">
            API Key do Google Maps não configurada corretamente.
            Verifique as configurações (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
        </div>
    );
  }
  return (
    <APIProvider apiKey={apiKey} solutionChannel="GMP_devsite_samples_v3_rgmbasic" libraries={['marker', 'maps']}>
      <MapContentAndLogic />
    </APIProvider>
  );
}

export default MapPage;
