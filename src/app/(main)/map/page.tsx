
'use client';

import { APIProvider, Map as GoogleMap, Marker, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { NextPage } from 'next';
import Image from 'next/image';
import { Filter, X, Music2, Loader2, CalendarClock } from 'lucide-react';
import { collection, getDocs, query, where, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle as FilterCardTitle } from '@/components/ui/card'; // Renamed CardTitle to avoid conflict
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
import { firestore } from '@/lib/firebase';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

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
}

interface Venue {
  id: string; // User ID of the partner
  name: string;
  type: VenueType;
  musicStyles?: MusicStyle[]; // Venue's general music styles
  location: Location;
  description: string; // Could be venue description
  imageUrl?: string; 
  youtubeUrl?: string;
  events?: VenueEvent[]; // Loaded dynamically
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
  [VenueType.STAND_UP]: '#FACC15', // Tailwind yellow-400
  [VenueType.SHOW_HOUSE]: 'hsl(var(--secondary))',
  [VenueType.ADULT_ENTERTAINMENT]: '#EC4899', // Tailwind pink-500
  [VenueType.LGBT]: '#F97316',      // Tailwind orange-500
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

// Custom marker component for venues
const VenueCustomMapMarker = ({ type, venueName }: { type: VenueType, venueName: string }) => {
  const IconComponent = venueTypeIcons[type];
  const pinColor = venueTypeColors[type] || 'hsl(var(--primary))'; 
  
  return (
    <div className="flex flex-col items-center cursor-pointer" title={venueName} style={{ transform: 'translate(-50%, -100%)' }}>
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full shadow-lg"
        style={{ backgroundColor: pinColor }}
      >
        {IconComponent ? <IconComponent className="w-6 h-6 text-white" /> : <div className="w-6 h-6 bg-white rounded-full"/>}
      </div>
      <div
        className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px]"
        style={{ borderTopColor: pinColor }}
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
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
};


const MapContentAndLogic = () => {
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeVenueTypeFilters, setActiveVenueTypeFilters] = useState<VenueType[]>([]);
  const [activeMusicStyleFilters, setActiveMusicStyleFilters] = useState<MusicStyle[]>([]);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true); 
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);


  const mapsApi = useMapsLibrary('maps'); 

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
        const q = query(
          usersCollectionRef,
          where('role', '==', UserRole.PARTNER),
          where('questionnaireCompleted', '==', true)
        );
        const querySnapshot = await getDocs(q);
        const fetchedVenues: Venue[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          let imageUrl;
          if (data.youtubeUrl) {
            try {
                const embedUrl = getYouTubeEmbedUrl(data.youtubeUrl);
                if (embedUrl) {
                    const videoId = embedUrl.split('/').pop()?.split('?')[0];
                    if (videoId) imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                }
            } catch (e) {
                console.warn("Could not parse YouTube URL for thumbnail: ", data.youtubeUrl);
            }
          }

          return {
            id: doc.id, // This is the partner's user ID
            name: data.venueName || 'Nome Indisponível',
            type: data.venueType as VenueType,
            musicStyles: data.musicStyles || [],
            location: data.location,
            description: data.venueName || 'Visite este local!', 
            imageUrl: imageUrl,
            youtubeUrl: data.youtubeUrl,
          };
        }).filter(venue => venue.location && typeof venue.location.lat === 'number' && typeof venue.location.lng === 'number' && venue.type && venueTypeIcons[venue.type]);
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
    if (!selectedVenue || selectedVenue.id !== venueId || selectedVenue.events) return; // Already fetched or different venue
    setIsLoadingEvents(true);
    try {
      const eventsCollectionRef = collection(firestore, 'users', venueId, 'events');
      const q = query(eventsCollectionRef, where('visibility', '==', true)); // Only fetch visible events
      const snapshot = await getDocs(q);
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as VenueEvent)).sort((a,b) => a.startDateTime.toMillis() - b.startDateTime.toMillis()); // Sort by upcoming
      
      setSelectedVenue(prev => prev ? { ...prev, events: eventsData } : null);
    } catch (error) {
      console.error("Error fetching venue events:", error);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (selectedVenue && !selectedVenue.events) {
      fetchVenueEvents(selectedVenue.id);
    }
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

  const filteredVenues = useMemo(() => {
    return venues.filter(venue => {
      const venueTypeMatch = activeVenueTypeFilters.length === 0 || activeVenueTypeFilters.includes(venue.type);
      const musicStyleMatch = activeMusicStyleFilters.length === 0 || 
                             (venue.musicStyles && venue.musicStyles.some(style => activeMusicStyleFilters.includes(style)));
      return venueTypeMatch && musicStyleMatch;
    });
  }, [venues, activeVenueTypeFilters, activeMusicStyleFilters]);

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
      {/* Filter Sidebar */}
      <Card 
        className={`absolute z-10 top-4 left-4 w-80 md:w-96 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out ${filterSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]'} border-primary/50`}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <FilterCardTitle className="text-lg text-primary">Filtrar Locais</FilterCardTitle>
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

      {/* Map Area */}
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
          <Marker position={userLocation} title="Sua Localização" />
          
          {mapsApi && filteredVenues.map((venue) => {
            return (
              <AdvancedMarker
                key={venue.id}
                position={venue.location}
                onClick={() => {
                  setSelectedVenue(venue);
                  // Event fetching will be triggered by useEffect watching selectedVenue
                }}
                title={venue.name}
              >
                <VenueCustomMapMarker type={venue.type} venueName={venue.name} />
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </div>

      {/* Venue Details Sidebar */}
      {selectedVenue && (
        <Sheet open={!!selectedVenue} onOpenChange={(isOpen) => { if (!isOpen) setSelectedVenue(null); }}>
          <SheetContent 
            side="right" 
            className="w-full sm:max-w-md p-0 bg-background/95 backdrop-blur-md shadow-2xl border-l border-border overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()} 
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader className="px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-md z-10 border-b border-border">
                <SheetTitle className="text-2xl font-bold text-secondary mr-8">
                  {selectedVenue.name}
                </SheetTitle>
                <SheetDescription className="sr-only">Detalhes sobre {selectedVenue.name}</SheetDescription>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-6rem)]"> {/* Adjusted for header height */}
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
                        {selectedVenue.events.map(event => (
                          <Card key={event.id} className="p-3 bg-card/50 border-border/50">
                            <CardTitle className="text-md text-secondary mb-1">{event.eventName}</CardTitle>
                            <p className="text-xs text-muted-foreground flex items-center">
                              <CalendarClock className="w-3 h-3 mr-1.5"/>
                              {format(event.startDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })} - {format(event.endDateTime.toDate(), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {PRICING_TYPE_OPTIONS.find(p => p.value === event.pricingType)?.label}
                              {event.pricingType !== PricingType.FREE && event.pricingValue ? `: R$ ${event.pricingValue.toFixed(2)}` : ''}
                            </p>
                            {event.musicStyles && event.musicStyles.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Músicas: {event.musicStyles.map(style => musicStyleLabels[style]).join(', ')}
                              </p>
                            )}
                            {event.description && <p className="mt-1.5 text-xs text-foreground/80">{event.description}</p>}
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
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
