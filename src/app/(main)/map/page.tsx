
'use client';

import { APIProvider, Map as GoogleMap, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GOOGLE_MAPS_API_KEY, VenueType } from '@/lib/constants';
import type { Location } from '@/services/geocoding';
import { 
  IconBar, 
  IconNightclub, 
  IconStandUp, 
  IconShowHouse, 
  IconAdultEntertainment, 
  IconLGBT,
  // IconMapPin is not used directly for path anymore, path string is used
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Image from 'next/image';
import { Filter, X } from 'lucide-react';

interface Venue {
  id: string;
  name: string;
  type: VenueType;
  location: Location;
  description: string;
  imageUrl?: string;
}

const mockVenues: Venue[] = [
  { id: '1', name: 'Balada Neon Dreams', type: VenueType.NIGHTCLUB, location: { lat: -23.5505, lng: -46.6333 }, description: 'A melhor balada da cidade com luzes neon!', imageUrl: 'https://picsum.photos/seed/nightclub1/300/200' },
  { id: '2', name: 'Bar do Zé', type: VenueType.BAR, location: { lat: -23.5550, lng: -46.6300 }, description: 'Cerveja gelada e bons petiscos.', imageUrl: 'https://picsum.photos/seed/bar1/300/200' },
  { id: '3', name: 'Risada Garantida Club', type: VenueType.STAND_UP, location: { lat: -23.5480, lng: -46.6390 }, description: 'Shows de stand-up todas as sextas.', imageUrl: 'https://picsum.photos/seed/standup1/300/200' },
  { id: '4', name: 'Arena Shows SP', type: VenueType.SHOW_HOUSE, location: { lat: -23.5600, lng: -46.6400 }, description: 'Grandes shows nacionais e internacionais.', imageUrl: 'https://picsum.photos/seed/showhouse1/300/200' },
  { id: '5', name: 'Cabaret Rouge', type: VenueType.ADULT_ENTERTAINMENT, location: { lat: -23.5450, lng: -46.6250 }, description: 'Entretenimento adulto com discrição e elegância.', imageUrl: 'https://picsum.photos/seed/adult1/300/200' },
  { id: '6', name: 'Point Arco-Íris', type: VenueType.LGBT, location: { lat: -23.5520, lng: -46.6350 }, description: 'O point da comunidade LGBTQIA+.', imageUrl: 'https://picsum.photos/seed/lgbt1/300/200' },
];

const venueTypeIcons: Record<VenueType, React.ElementType> = {
  [VenueType.NIGHTCLUB]: IconNightclub,
  [VenueType.BAR]: IconBar,
  [VenueType.STAND_UP]: IconStandUp,
  [VenueType.SHOW_HOUSE]: IconShowHouse,
  [VenueType.ADULT_ENTERTAINMENT]: IconAdultEntertainment,
  [VenueType.LGBT]: IconLGBT,
};

const venueTypeLabels: Record<VenueType, string> = {
  [VenueType.NIGHTCLUB]: 'Balada',
  [VenueType.BAR]: 'Bar',
  [VenueType.STAND_UP]: 'Stand Up',
  [VenueType.SHOW_HOUSE]: 'Casa de Show',
  [VenueType.ADULT_ENTERTAINMENT]: 'Entretenimento Adulto',
  [VenueType.LGBT]: 'LGBTQIA+',
};

// SVG path for the map pin icon (teardrop shape)
const MAP_PIN_SVG_PATH = "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z";

const MapUpdater = ({ center }: { center: Location }) => {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.moveCamera({ center, zoom: 15 });
    }
  }, [map, center]);
  return null;
};

export default function MapPage() {
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activeFilters, setActiveFilters] = useState<VenueType[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Default open on desktop

  const mapsApi = useMapsLibrary('maps'); // Get the google.maps namespace

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
          // Default to São Paulo if geolocation fails or is denied
          setUserLocation({ lat: -23.55052, lng: -46.633308 });
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
      setUserLocation({ lat: -23.55052, lng: -46.633308 });
    }
  }, []);

  const toggleFilter = (type: VenueType) => {
    setActiveFilters(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const filteredVenues = useMemo(() => {
    if (activeFilters.length === 0) return mockVenues;
    return mockVenues.filter(venue => activeFilters.includes(venue.type));
  }, [activeFilters]);

  const VenueIcon = ({ type }: { type: VenueType }) => {
    const IconComponent = venueTypeIcons[type];
    let colorClass = "text-foreground"; // Default color
    switch (type) {
      case VenueType.NIGHTCLUB: colorClass = "text-primary"; break; // Neon Blue
      case VenueType.BAR: colorClass = "text-accent"; break; // Neon Green
      case VenueType.STAND_UP: colorClass = "text-yellow-400"; break; // A bright yellow
      case VenueType.SHOW_HOUSE: colorClass = "text-secondary"; break; // Neon Purple
      case VenueType.ADULT_ENTERTAINMENT: colorClass = "text-pink-500"; break; // A vibrant pink
      case VenueType.LGBT: colorClass = "text-orange-400"; break; // Use orange for LGBT, actual SVG is rainbow
    }
    return <IconComponent className={`w-5 h-5 ${colorClass}`} />;
  };

  if (!userLocation) {
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando sua localização...</div>;
  }

  if (!mapsApi) {
    // mapsApi (google.maps namespace) is not yet available
    return <div className="flex items-center justify-center h-screen bg-background text-foreground">Carregando API do Mapa...</div>;
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="relative flex w-full h-[calc(100vh-4rem)]"> {/* Adjust height based on header */}
        {/* Filter Sidebar */}
        <Card className={`absolute z-10 top-4 left-4 w-72 bg-background/80 backdrop-blur-md shadow-xl transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-[calc(100%+1rem)]'} border-primary/50`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg text-primary">Filtrar Eventos</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="md:hidden text-primary hover:text-primary/80">
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-14rem)]"> {/* Adjust height */}
              <div className="space-y-3">
                {(Object.keys(venueTypeIcons) as VenueType[]).map((type) => (
                  <Button
                    key={type}
                    variant={activeFilters.includes(type) ? "secondary" : "outline"}
                    onClick={() => toggleFilter(type)}
                    className={`w-full justify-start ${activeFilters.includes(type) ? 'bg-primary/30 text-primary border-primary hover:bg-primary/40' : 'hover:bg-primary/10 hover:border-primary/50'}`}
                  >
                    <VenueIcon type={type} />
                    <span className="ml-2">{venueTypeLabels[type]}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Map Area */}
        <div className="flex-1 h-full">
          {!sidebarOpen && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setSidebarOpen(true)} 
              className="absolute z-20 top-4 left-4 md:hidden text-primary border-primary bg-background/80 hover:bg-primary/10"
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
              styles: [ // Minimalist dark theme for map
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                {
                  featureType: "administrative.locality",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "geometry",
                  stylers: [{ color: "#263c3f" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#6b9a76" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry",
                  stylers: [{ color: "#38414e" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#212a37" }],
                },
                {
                  featureType: "road",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#9ca5b3" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry",
                  stylers: [{ color: "#746855" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#1f2835" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#f3d19c" }],
                },
                {
                  featureType: "transit",
                  elementType: "geometry",
                  stylers: [{ color: "#2f3948" }],
                },
                {
                  featureType: "transit.station",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "water",
                  elementType: "geometry",
                  stylers: [{ color: "#17263c" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#515c6d" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#17263c" }],
                },
              ],
            }}
          >
            <MapUpdater center={userLocation} />
            <Marker position={userLocation} title="Sua Localização">
                {/* Custom user marker if needed, otherwise default Google marker */}
            </Marker>
            {filteredVenues.map((venue) => {
              const anchorPoint = new mapsApi.Point(12, 24); // Use mapsApi.Point

              return (
                <Marker
                  key={venue.id}
                  position={venue.location}
                  onClick={() => setSelectedVenue(venue)}
                  title={venue.name}
                  icon={{ 
                    path: MAP_PIN_SVG_PATH, // Use defined SVG path string
                    fillColor: venueTypeColors[venue.type] || '#7DF9FF', // Neon Blue default
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: '#000000',
                    scale: 1.5,
                    anchor: anchorPoint, // Adjust anchor as needed
                  }}
                />
              );
            })}
          </GoogleMap>
        </div>

        {/* Selected Venue Popover */}
        {selectedVenue && (
          <Popover open={!!selectedVenue} onOpenChange={() => setSelectedVenue(null)}>
            <PopoverTrigger asChild>
              {/* This is a dummy trigger, the popover is controlled by selectedVenue state */}
              <div style={{ position: 'fixed', top: selectedVenue.location.lat, left: selectedVenue.location.lng, pointerEvents: 'none' }} />
            </PopoverTrigger>
            <PopoverContent 
              className="w-80 bg-background/90 backdrop-blur-md shadow-2xl border-secondary/70"
              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              side="bottom" // This won't really apply due to absolute positioning
              align="center" // This won't really apply
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none text-secondary">{selectedVenue.name}</h4>
                  <Badge variant="outline" className="border-secondary text-secondary">{venueTypeLabels[selectedVenue.type]}</Badge>
                  <p className="text-sm text-muted-foreground">
                    {selectedVenue.description}
                  </p>
                </div>
                {selectedVenue.imageUrl && (
                  <div className="relative w-full h-40 rounded-md overflow-hidden">
                    <Image src={selectedVenue.imageUrl} alt={selectedVenue.name} layout="fill" objectFit="cover" data-ai-hint="event location"/>
                  </div>
                )}
                <Button variant="default" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                  Ver Detalhes
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </APIProvider>
  );
}

const venueTypeColors: Record<VenueType, string> = {
  [VenueType.NIGHTCLUB]: '#7DF9FF', // Neon Blue
  [VenueType.BAR]: '#1F51FF', // Neon Green for interactive elements, but used as Bar color here
  [VenueType.STAND_UP]: '#FFFF00', // Neon Yellow
  [VenueType.SHOW_HOUSE]: '#D400FF', // Neon Purple
  [VenueType.ADULT_ENTERTAINMENT]: '#FF4136', // Neon Red (using for variety)
  [VenueType.LGBT]: '#FFA500', // Orange (as part of rainbow colors)
};
