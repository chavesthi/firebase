
'use client';

import { APIProvider, Map as GoogleMap, Marker, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo, useCallback } from 'react';
import type { NextPage } from 'next';
import Image from 'next/image';
import { Filter, X, Music2, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GOOGLE_MAPS_API_KEY, VenueType, MusicStyle, MUSIC_STYLE_OPTIONS, VENUE_TYPE_OPTIONS, UserRole } from '@/lib/constants';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { firestore } from '@/lib/firebase';

interface Venue {
  id: string;
  name: string;
  type: VenueType;
  musicStyles?: MusicStyle[];
  location: Location;
  description: string;
  imageUrl?: string; // YouTube video ID could be stored here if we want to show thumbnails
  youtubeUrl?: string;
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
  const pinColor = venueTypeColors[type] || 'hsl(var(--primary))'; // Default color

  return (
    <div className="flex flex-col items-center cursor-pointer" title={venueName}>
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


const MapContentAndLogic = () => {
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeVenueTypeFilters, setActiveVenueTypeFilters] = useState<VenueType[]>([]);
  const [activeMusicStyleFilters, setActiveMusicStyleFilters] = useState<MusicStyle[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);

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
          setUserLocation({ lat: -23.55052, lng: -46.633308 }); // Default to São Paulo
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
      setUserLocation({ lat: -23.55052, lng: -46.633308 }); // Default to São Paulo
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
          // Basic YouTube URL to embeddable ID (very basic, improve if needed)
          let imageUrl;
          if (data.youtubeUrl) {
            try {
                const url = new URL(data.youtubeUrl);
                if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
                    const videoId = url.searchParams.get('v');
                    if (videoId) {
                        imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }
                } else if (url.hostname === 'youtu.be') {
                    const videoId = url.pathname.substring(1);
                     if (videoId) {
                        imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }
                }
            } catch (e) {
                console.warn("Could not parse YouTube URL for thumbnail: ", data.youtubeUrl);
            }
          }

          return {
            id: doc.id,
            name: data.venueName || 'Nome Indisponível',
            type: data.venueType as VenueType,
            musicStyles: data.musicStyles || [],
            location: data.location,
            description: data.venueName || 'Visite este local!',
            imageUrl: imageUrl,
            youtubeUrl: data.youtubeUrl,
          };
        }).filter(venue => venue.location && typeof venue.location.lat === 'number' && typeof venue.location.lng === 'number' && venue.type && venueTypeIcons[venue.type]); // Ensure location and type are valid
        setVenues(fetchedVenues);
      } catch (error) {
        console.error("Error fetching venues:", error);
        // Optionally, set an error state or show a toast
      } finally {
        setIsLoadingVenues(false);
      }
    };

    fetchVenues();
  }, []);


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
    else if (type === VenueType.STAND_UP) colorClass = "text-yellow-400"; // Ensure this class exists or use HSL
    else if (type === VenueType.SHOW_HOUSE) colorClass = "text-secondary";
    else if (type === VenueType.ADULT_ENTERTAINMENT) colorClass = "text-pink-500"; // Ensure this class exists or use HSL
    else if (type === VenueType.LGBT) colorClass = "text-orange-500"; // Ensure this class exists or use HSL
    
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
      <Card className={`absolute z-10 top-4 left-4 w-80 md:w-96 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]'} border-primary/50`}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg text-primary">Filtrar Locais</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-primary hover:text-primary/80">
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
              <h3 className="text-md font-semibold text-primary/80">Estilo Musical</h3>
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
        {!sidebarOpen && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="absolute z-20 p-2 rounded-full top-4 left-4 text-primary border-primary bg-background/80 hover:bg-primary/10 shadow-lg"
            aria-label="Abrir filtros"
          >
            <Filter className="w-5 h-5" />
          </Button>
        )}
        <GoogleMap
          defaultCenter={userLocation}
          defaultZoom={15}
          mapId="fervoFinderMap"
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
          
          {filteredVenues.map((venue) => (
              <AdvancedMarker
                key={venue.id}
                position={venue.location}
                onClick={() => setSelectedVenue(venue)}
              >
                <VenueCustomMapMarker type={venue.type} venueName={venue.name} />
              </AdvancedMarker>
            ))}
        </GoogleMap>
      </div>

      {selectedVenue && (
        <Popover open={!!selectedVenue} onOpenChange={(isOpen) => !isOpen && setSelectedVenue(null)}>
          <PopoverTrigger asChild>
            <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
          </PopoverTrigger>
          <PopoverContent
            className="w-80 bg-background/90 backdrop-blur-md shadow-2xl border-secondary/70"
            style={{
              position: 'fixed', 
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 100 
            }}
            onCloseAutoFocus={(e) => e.preventDefault()} 
            side="bottom" 
            align="center" 
          >
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none text-secondary">{selectedVenue.name}</h4>
                <Badge variant="outline" className="border-secondary text-secondary">{venueTypeLabels[selectedVenue.type]}</Badge>
                {selectedVenue.musicStyles && selectedVenue.musicStyles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedVenue.musicStyles.map(style => (
                       <Badge key={style} variant="outline" className="text-xs border-accent text-accent">{musicStyleLabels[style]}</Badge>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {selectedVenue.description}
                </p>
              </div>
              {selectedVenue.imageUrl && (
                <div className="relative w-full h-40 overflow-hidden rounded-md">
                  <Image src={selectedVenue.imageUrl} alt={selectedVenue.name} layout="fill" objectFit="cover" data-ai-hint="event location" />
                </div>
              )}
              {selectedVenue.youtubeUrl && !selectedVenue.imageUrl && ( // Fallback for youtube link if no specific image
                <Button 
                    variant="link" 
                    className="justify-start p-0 text-accent" 
                    onClick={() => window.open(selectedVenue.youtubeUrl, '_blank')}>
                    Ver vídeo de apresentação
                </Button>
              )}
              <Button variant="default" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                Ver Detalhes (Em breve)
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
    <APIProvider apiKey={apiKey} solutionChannel="GMP_devsite_samples_v3_rgmbasic" libraries={['marker']}>
      <MapContentAndLogic />
    </APIProvider>
  );
}

export default MapPage;

