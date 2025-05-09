

'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, runTransaction, collection, query, where, getDocs, documentId, Timestamp as FirebaseTimestamp, onSnapshot } from 'firebase/firestore';
import Link from 'next/link';
import { auth, firestore } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart, Loader2, MapPin as MapPinIcon, ExternalLink, Star, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { VenueType, MusicStyle, Location } from '@/lib/constants';
import { VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { StarRating } from '@/components/ui/star-rating';


interface FavoriteVenueDisplay {
  id: string;
  venueName: string;
  venueType?: VenueType;
  musicStyles?: MusicStyle[];
  address?: { city: string; state: string; street?: string; number?: string; cep?: string };
  location?: Location; 
  averageVenueRating?: number;
  venueRatingCount?: number;
}

const venueTypeLabels: Record<VenueType, string> = VENUE_TYPE_OPTIONS.reduce((acc, curr) => {
  acc[curr.value] = curr.label;
  return acc;
}, {} as Record<VenueType, string>);

const musicStyleLabels: Record<MusicStyle, string> = MUSIC_STYLE_OPTIONS.reduce((acc, curr) => {
  acc[curr.value] = curr.label;
  return acc;
}, {} as Record<MusicStyle, string>);

const UserFavoritesPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [favoriteVenueIds, setFavoriteVenueIds] = useState<string[]>([]);
  const [favoriteVenues, setFavoriteVenues] = useState<FavoriteVenueDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
    const userDocRef = doc(firestore, "users", currentUser.uid);
    const unsubscribeFavorites = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setFavoriteVenueIds(docSnap.data().favoriteVenueIds || []);
      } else {
        setFavoriteVenueIds([]);
      }
    }, (error) => {
      console.error("Error listening to favorite venue IDs:", error);
      toast({ title: "Erro ao Sincronizar Favoritos", variant: "destructive"});
    });
    return () => unsubscribeFavorites();
  }, [currentUser, toast]);

  useEffect(() => {
    if (!currentUser || favoriteVenueIds.length === 0) {
      setFavoriteVenues([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const fetchDetails = async () => {
      try {
        const venuesData: FavoriteVenueDisplay[] = [];
        // Firestore 'in' query has a limit of 30 elements. Chunk if necessary.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < favoriteVenueIds.length; i += CHUNK_SIZE) {
            const chunk = favoriteVenueIds.slice(i, i + CHUNK_SIZE);
            if (chunk.length === 0) continue;

            const venuesRef = collection(firestore, "users");
            const q = query(venuesRef, where(documentId(), 'in', chunk), where('role', '==', 'partner'));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((docSnap) => {
              const data = docSnap.data();
              venuesData.push({
                id: docSnap.id,
                venueName: data.venueName || 'Local Desconhecido',
                venueType: data.venueType as VenueType,
                musicStyles: data.musicStyles as MusicStyle[],
                address: data.address ? { 
                    city: data.address.city, 
                    state: data.address.state, 
                    street: data.address.street, 
                    number: data.address.number,
                    cep: data.address.cep,
                } : undefined,
                location: data.location as Location,
                averageVenueRating: data.averageVenueRating,
                venueRatingCount: data.venueRatingCount,
              });
            });
        }
        // Ensure order is maintained based on favoriteVenueIds if desired, or sort by name, etc.
        // For now, it will be in the order Firestore returns (which might vary across chunks).
        // To preserve order of `favoriteVenueIds`:
        const orderedVenues = favoriteVenueIds.map(id => venuesData.find(v => v.id === id)).filter(Boolean) as FavoriteVenueDisplay[];
        setFavoriteVenues(orderedVenues);

      } catch (error) {
        console.error("Error fetching favorite venue details:", error);
        toast({ title: "Erro ao Carregar Favoritos", description: "Não foi possível buscar detalhes dos locais.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [currentUser, favoriteVenueIds, toast]);


  const handleUnfavorite = async (venueId: string, venueName: string) => {
    if (!currentUser) return;
    const userDocRef = doc(firestore, "users", currentUser.uid);
    try {
      await runTransaction(firestore, async (transaction) => {
        const userSnap = await transaction.get(userDocRef);
        if (!userSnap.exists()) throw new Error("Usuário não encontrado.");
        const currentFavorites: string[] = userSnap.data().favoriteVenueIds || [];
        const updatedFavorites = currentFavorites.filter(id => id !== venueId);
        transaction.update(userDocRef, { favoriteVenueIds: updatedFavorites });
      });
      toast({ title: "Removido dos Favoritos!", description: `${venueName} não é mais um dos seus fervos favoritos.` });
    } catch (error: any) {
      console.error("Error unfavoriting:", error);
      toast({ title: "Erro ao Desfavoritar", description: error.message || "Tente novamente.", variant: "destructive" });
    }
  };

  if (isLoading && !currentUser) { // Show loader only if auth is still pending
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.back()} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Voltar
        </Button>
      </div>

      <Card className="max-w-3xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary flex items-center justify-center">
            <Heart className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3 fill-destructive" />
            Meus Fervos Favoritos
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Seus locais preferidos, sempre à mão!
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : favoriteVenues.length === 0 ? (
            <div className="text-center py-10">
              <Heart className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <p className="mt-4 text-lg text-muted-foreground">Você ainda não favoritou nenhum local.</p>
              <p className="text-sm text-muted-foreground">Explore o mapa e adicione seus fervos preferidos!</p>
              <Button onClick={() => router.push('/map')} className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                Explorar Mapa
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-22rem)] sm:h-[calc(100vh-24rem)] pr-3">
              <div className="space-y-4">
                {favoriteVenues.map((venue) => (
                  <Card key={venue.id} className="bg-card/80 border-primary/50 shadow-md hover:shadow-primary/20 transition-shadow">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg text-primary">{venue.venueName}</CardTitle>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive/80 h-8 w-8 -mt-1 -mr-1"
                          onClick={() => handleUnfavorite(venue.id, venue.venueName)}
                          title="Remover dos Favoritos"
                        >
                          <Heart className="w-5 h-5 fill-destructive" />
                        </Button>
                      </div>
                       {venue.venueType && <Badge variant="outline" className="text-xs mt-1 border-secondary text-secondary">{venueTypeLabels[venue.venueType] || venue.venueType}</Badge>}
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {venue.address && (
                        <p className="text-sm text-muted-foreground flex items-center">
                          <MapPinIcon className="w-4 h-4 mr-1.5 text-primary/80 shrink-0" />
                          {venue.address.street && venue.address.number ? `${venue.address.street}, ${venue.address.number} - ` : ''}
                          {venue.address.city}, {venue.address.state}
                        </p>
                      )}
                      {venue.musicStyles && venue.musicStyles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                           {venue.musicStyles.slice(0,3).map(style => (
                            <Badge key={style} variant="outline" className="text-xs border-accent text-accent">{musicStyleLabels[style] || style}</Badge>
                          ))}
                          {venue.musicStyles.length > 3 && <Badge variant="outline" className="text-xs border-accent text-accent">+{venue.musicStyles.length - 3} mais</Badge>}
                        </div>
                      )}
                      {venue.averageVenueRating !== undefined && venue.venueRatingCount !== undefined && venue.venueRatingCount > 0 && (
                        <div className="flex items-center gap-1 mt-1.5">
                            <StarRating rating={venue.averageVenueRating} totalStars={5} size={14} readOnly />
                            <span className="text-xs text-muted-foreground">({venue.averageVenueRating.toFixed(1)} de {venue.venueRatingCount} {venue.venueRatingCount === 1 ? 'avaliação' : 'avaliações'})</span>
                        </div>
                       )}
                    </CardContent>
                    <CardFooter className="px-4 pb-3 pt-0">
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-primary text-primary hover:bg-primary/10"
                            onClick={() => router.push(`/map?venueId=${venue.id}`)}
                        >
                           <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Ver no Mapa e Eventos
                        </Button>
                    </CardFooter>
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

export default UserFavoritesPage;


