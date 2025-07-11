
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, collection, getDocs, query, where, collectionGroup, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Edit, PlusCircle, CalendarDays, BarChart3, Settings, MapPin, Star, Loader2, QrCode, Gift, ScrollText, CheckCircle, Users, Heart, Lightbulb, Brain, Eye, MessageSquare, Instagram, Facebook, Youtube, ExternalLink, Megaphone } from 'lucide-react';
import type { Location } from '@/services/geocoding';
import { VenueType, MusicStyle, VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS } from '@/lib/constants';
import { StarRating } from '@/components/ui/star-rating';
import { analyzeVenueFeedback, type AnalyzeVenueFeedbackInput, type AnalyzeVenueFeedbackOutput, type FeedbackItem } from '@/ai/flows/analyze-venue-feedback-flow';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import {
  IconBar,
  IconNightclub,
  IconStandUp,
  IconShowHouse,
  IconAdultEntertainment,
  IconLGBT,
} from '@/components/icons';

interface VenueData {
  venueName: string;
  venueType: VenueType;
  musicStyles: MusicStyle[];
  address: {
    street: string;
    number: string;
    city: string;
    state: string;
    cep: string;
    country: string;
  };
  location: Location;
  phone?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  questionnaireCompleted?: boolean;
  averageVenueRating?: number;
  venueRatingCount?: number;
  photoURL?: string | null;
}

interface EventRatingData {
  rating: number;
  comment?: string;
  eventName?: string;
}

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

const tipsArray = [
  "Dica: Use a 'Análise de Feedback (IA)' para entender melhor seus clientes e identificar pontos de melhoria!",
  "Dica: Mantenha seus eventos sempre atualizados para atrair mais público!",
  "Dica: Gere QR Codes para seus eventos e incentive o check-in. Isso habilita avaliações e te dá mais dados!",
  "Dica: Compartilhe o link do seu perfil Fervo App nas suas redes sociais!",
  "Dica: Responda aos feedbacks (mesmo que internamente) para planejar ações futuras.",
  "Dica: Ofereça cupons ou pequenas recompensas para quem fizer check-in ou compartilhar seus eventos.",
  "Dica: Verifique regularmente as estatísticas para acompanhar o engajamento com seu local e eventos.",
  "Dica: Um vídeo de apresentação no seu perfil pode aumentar muito o interesse dos usuários!",
  "Dica: Considere adicionar um vídeo ao seu perfil ou até mesmo um link de uma live do YouTube quando um evento estiver acontecendo. Isso pode atrair muito o interesse dos usuários!"
];

const engagementMessagesArray = [
  "Peça aos seus clientes para baixarem o Fervo App! Mais downloads significam mais visibilidade, check-ins e feedbacks para você!",
  "Incentive seus frequentadores a usar o Fervo App para avaliar seus eventos. O feedback deles é valioso!",
  "Com o Fervo App, seus clientes ficam por dentro de toda a sua programação e novidades. Divulgue!",
  "Mais clientes no Fervo App = Mais pessoas descobrindo seus eventos e seu local. Espalhe a notícia!",
  "Lembre seus clientes: no Fervo App eles podem favoritar seu local e receber notificações de novos eventos!"
];


export default function PartnerDashboardPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCheckIns, setTotalCheckIns] = useState<number | null>(null);
  const [loadingCheckIns, setLoadingCheckIns] = useState(true);
  const [totalFavorites, setTotalFavorites] = useState<number | null>(null);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  const [aiAnalysisResult, setAiAnalysisResult] = useState<AnalyzeVenueFeedbackOutput | null>(null);
  const [isAnalyzingFeedback, setIsAnalyzingFeedback] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentTip, setCurrentTip] = useState('');
  const [currentEngagementMessage, setCurrentEngagementMessage] = useState('');


  useEffect(() => {
    setCurrentTip(tipsArray[Math.floor(Math.random() * tipsArray.length)]);
    setCurrentEngagementMessage(engagementMessagesArray[Math.floor(Math.random() * engagementMessagesArray.length)]);
  }, []);


  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);

        const userDocRef = doc(firestore, "users", user.uid);
        unsubscribeSnapshot = onSnapshot(userDocRef, (userDocSnap) => {
          if (userDocSnap.exists()) {
            const rawData = userDocSnap.data();
            if (!rawData) {
                toast({ title: "Erro", description: "Dados do parceiro não encontrados de forma inesperada.", variant: "destructive" });
                router.push('/partner-questionnaire');
                setLoading(false);
                return;
            }

            if (!rawData.questionnaireCompleted) {
              toast({ title: "Questionário Pendente", description: "Complete seu perfil para acessar o painel.", variant: "destructive" });
              router.push('/partner-questionnaire');
              setLoading(false);
            } else {
              if (!rawData.venueName || !rawData.venueType || !rawData.address || typeof rawData.address !== 'object' ||
                  !rawData.address.street || !rawData.address.city || !rawData.address.state || !rawData.address.cep || !rawData.address.country ||
                  !rawData.location || typeof rawData.location.lat !== 'number' || typeof rawData.location.lng !== 'number') {
                console.error("Partner data is incomplete despite questionnaireCompleted=true. UID:", user.uid, "Data:", rawData);
                toast({ title: "Dados Incompletos", description: "Seu perfil de parceiro parece estar inconsistente. Por favor, revise o questionário.", variant: "destructive", duration: 7000 });
                router.push('/partner-questionnaire');
                setLoading(false);
                return;
              }

              setVenueData({
                venueName: rawData.venueName,
                venueType: rawData.venueType as VenueType,
                musicStyles: rawData.musicStyles || [],
                address: {
                    street: rawData.address.street,
                    number: rawData.address.number || '',
                    city: rawData.address.city,
                    state: rawData.address.state,
                    cep: rawData.address.cep,
                    country: rawData.address.country,
                },
                location: rawData.location as Location,
                phone: rawData.phone || undefined,
                instagramUrl: rawData.instagramUrl || undefined,
                facebookUrl: rawData.facebookUrl || undefined,
                youtubeUrl: rawData.youtubeUrl || undefined,
                questionnaireCompleted: rawData.questionnaireCompleted,
                averageVenueRating: rawData.averageVenueRating || 0,
                venueRatingCount: rawData.venueRatingCount || 0,
                photoURL: rawData.photoURL || null,
              });
              setLoading(false);
            }
          } else {
             toast({ title: "Erro", description: "Dados do parceiro não encontrados. Por favor, complete seu cadastro.", variant: "destructive" });
             router.push('/partner-questionnaire');
             setLoading(false);
          }
        }, (error) => {
          console.error("Error fetching partner data with onSnapshot:", error);
          toast({ title: "Erro ao Carregar Dados", description: "Não foi possível buscar os dados do painel.", variant: "destructive" });
          router.push('/login');
          setLoading(false);
        });

      } else {
        router.push('/login');
        setLoading(false);
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [router, toast]);

  useEffect(() => {
    if (!currentUser || !venueData?.questionnaireCompleted) {
      setLoadingCheckIns(false);
      setLoadingFavorites(false);
      return;
    }

    let isMounted = true;

    const fetchTotalCheckIns = async () => {
      setLoadingCheckIns(true);
      let count = 0;
      try {
        const eventsCollectionRef = collection(firestore, `users/${currentUser.uid}/events`);
        const eventsSnapshot = await getDocs(eventsCollectionRef);

        for (const eventDoc of eventsSnapshot.docs) {
          const checkInsCollectionRef = collection(firestore, `users/${currentUser.uid}/events/${eventDoc.id}/checkIns`);
          const checkInsSnapshot = await getDocs(checkInsCollectionRef);
          count += checkInsSnapshot.size;
        }
        if (isMounted) {
          setTotalCheckIns(count);
        }
      } catch (error) {
        console.error("Error fetching total check-ins:", error);
        if (isMounted) {
          setTotalCheckIns(0);
        }
      } finally {
        if (isMounted) {
          setLoadingCheckIns(false);
        }
      }
    };

    const fetchTotalFavorites = async () => {
      if (!currentUser?.uid) return;
      setLoadingFavorites(true);
      try {
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where('favoriteVenueIds', 'array-contains', currentUser.uid));
        const querySnapshot = await getDocs(q);
        if (isMounted) {
          setTotalFavorites(querySnapshot.size);
        }
      } catch (error) {
        console.error("Error fetching total favorites:", error);
        if (isMounted) {
          setTotalFavorites(0);
        }
      } finally {
        if (isMounted) {
          setLoadingFavorites(false);
        }
      }
    };

    fetchTotalCheckIns();
    fetchTotalFavorites();

    return () => {
      isMounted = false;
    };
  }, [currentUser, venueData?.questionnaireCompleted]);

  const handleGenerateFeedbackAnalysis = async () => {
    if (!currentUser || !venueData) {
      toast({ title: "Erro", description: "Dados do parceiro não disponíveis.", variant: "destructive" });
      return;
    }
    setIsAnalyzingFeedback(true);
    setAnalysisError(null);
    setAiAnalysisResult(null);

    try {
      const ratingsQuery = query(
        collectionGroup(firestore, 'eventRatings'),
        where('partnerId', '==', currentUser.uid)
      );
      const ratingsSnapshot = await getDocs(ratingsQuery);

      const feedbackItems: FeedbackItem[] = [];
      if (ratingsSnapshot.empty) {
        setAnalysisError("Nenhum feedback de evento encontrado para análise.");
        setIsAnalyzingFeedback(false);
        toast({ title: "Sem Feedback", description: "Ainda não há avaliações ou comentários para seus eventos.", variant: "default"});
        return;
      }

      const eventDetailsPromises = ratingsSnapshot.docs.map(async (ratingDoc) => {
        const ratingData = ratingDoc.data() as EventRatingData;
        let eventName = "Evento Desconhecido";
        const eventId = ratingDoc.data().eventId;
        if (eventId) {
          try {
            const eventDocRef = doc(firestore, `users/${currentUser.uid}/events/${eventId}`);
            const eventDocSnap = await getDoc(eventDocRef);
            if(eventDocSnap.exists()) {
              eventName = eventDocSnap.data().eventName || eventName;
            }
          } catch (e) {
            console.warn(`Could not fetch event name for eventId ${eventId}`, e);
          }
        }
        return {
          rating: ratingData.rating,
          comment: ratingData.comment,
          eventName: eventName,
        };
      });

      const resolvedFeedbackItems = await Promise.all(eventDetailsPromises);
      feedbackItems.push(...resolvedFeedbackItems);

      if (feedbackItems.length === 0) {
        setAnalysisError("Nenhum feedback de evento encontrado para análise após processamento.");
        setIsAnalyzingFeedback(false);
        toast({ title: "Sem Feedback", description: "Não foi possível processar o feedback dos seus eventos.", variant: "default"});
        return;
      }

      const analysisInput: AnalyzeVenueFeedbackInput = {
        venueName: venueData.venueName,
        feedbackItems: feedbackItems,
      };

      const result = await analyzeVenueFeedback(analysisInput);
      setAiAnalysisResult(result);
      toast({ title: "Análise Concluída!", description: "Seu relatório de feedback está pronto.", variant: "default" });

    } catch (error: any) {
      console.error("Error generating AI feedback analysis:", error);
      setAnalysisError(error.message || "Ocorreu um erro ao gerar a análise.");
      toast({ title: "Erro na Análise", description: error.message || "Não foi possível gerar o relatório de feedback.", variant: "destructive" });
    } finally {
      setIsAnalyzingFeedback(false);
    }
  };


  if (loading || !currentUser || !venueData) {
    return (
      <div className="container flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg text-foreground">Carregando dados do parceiro...</p>
      </div>
    );
  }

  const fullAddress = venueData.address ? `${venueData.address.street}, ${venueData.address.number || 'S/N'}, ${venueData.address.city} - ${venueData.address.state}, ${venueData.address.cep}` : 'Endereço não disponível';
  const VenueIcon = venueData.venueType ? venueTypeIcons[venueData.venueType] : MapPin;
  const showVideo = venueData.youtubeUrl && getYouTubeEmbedUrl(venueData.youtubeUrl);


  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <header className="mb-6 text-center lg:text-left">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{venueData.venueName}</h1>
        <p className="mt-2 text-sm sm:text-lg text-muted-foreground flex items-center justify-center lg:justify-start px-2">
            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 text-primary/70 shrink-0"/>
            <span className="truncate">{fullAddress}</span>
        </p>
        <Button variant="outline" size="sm" className="mt-4 border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm" onClick={() => router.push('/partner-questionnaire')}>
            <Edit className="w-3 h-3 mr-1.5" /> Editar Info. do Local
        </Button>
      </header>

       {currentEngagementMessage && (
        <Card className="mb-6 sm:mb-8 border-accent/70 shadow-lg shadow-accent/20 bg-card">
          <CardHeader className="flex flex-row items-center gap-3 p-4 sm:p-6">
            <Megaphone className="w-8 h-8 text-accent flex-shrink-0" />
            <div>
              <CardTitle className="text-md sm:text-lg text-accent">Engaje Seus Clientes!</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">{currentEngagementMessage}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="mb-6 sm:mb-8">
        <Card className="border-primary/50 shadow-lg shadow-primary/15">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl text-foreground flex items-center">
              <Eye className="w-6 h-6 mr-3" />
              Preview do Local
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">Como os usuários veem seu estabelecimento no Fervo App.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
             {showVideo ? (
                <div className="relative w-full rounded-lg overflow-hidden shadow-md" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    src={getYouTubeEmbedUrl(venueData.youtubeUrl)!}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full"
                  />
                </div>
             ) : venueData.photoURL && (
                 <div className="aspect-video w-full rounded-lg overflow-hidden shadow-md relative bg-muted mb-4">
                    <Image src={venueData.photoURL} alt={`Foto de ${venueData.venueName}`} layout="fill" objectFit="cover" data-ai-hint="venue building" />
                </div>
             )}
            <h3 className="text-lg font-semibold text-foreground pt-2">{venueData.venueName}</h3>
            {venueData.venueType && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {React.createElement(VenueIcon || MapPin, { className: "w-5 h-5 text-secondary" })}
                <span>{venueTypeLabels[venueData.venueType] || venueData.venueType}</span>
              </div>
            )}
            {venueData.averageVenueRating !== undefined && venueData.venueRatingCount !== undefined && venueData.venueRatingCount > 0 && (
              <div className="flex items-center gap-2">
                <StarRating rating={venueData.averageVenueRating} readOnly size={18} fillColor='hsl(var(--primary))' />
                <span className="text-sm text-foreground">({venueData.averageVenueRating.toFixed(1)})</span>
              </div>
            )}
            {venueData.musicStyles && venueData.musicStyles.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Estilos Musicais:</h4>
                <div className="flex flex-wrap gap-1">
                  {venueData.musicStyles.map(style => (
                    <Badge key={style} variant="outline" className="text-xs border-accent text-accent">{musicStyleLabels[style]}</Badge>
                  ))}
                </div>
              </div>
            )}
            {venueData.address && (
              <p className="text-sm text-muted-foreground flex items-center">
                <MapPin className="w-4 h-4 mr-1.5 text-secondary shrink-0" />
                {venueData.address.city}, {venueData.address.state}
              </p>
            )}
            {(venueData.instagramUrl || venueData.facebookUrl || venueData.youtubeUrl || venueData.phone) && (
              <div className="pt-3 mt-3 border-t border-border/50">
                <h4 className="text-sm font-medium text-foreground mb-2">Contatos e Redes:</h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {venueData.phone && (
                    <a
                      href={`https://wa.me/${venueData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${venueData.venueName}, te encontrei pelo Fervo App.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </a>
                  )}
                  {venueData.instagramUrl && (
                    <a href={venueData.instagramUrl} target="_blank" rel="noopener noreferrer" title="Instagram" className="text-muted-foreground hover:text-primary transition-colors">
                      <Instagram className="w-5 h-5" />
                    </a>
                  )}
                  {venueData.facebookUrl && (
                    <a href={venueData.facebookUrl} target="_blank" rel="noopener noreferrer" title="Facebook" className="text-muted-foreground hover:text-primary transition-colors">
                      <Facebook className="w-5 h-5" />
                    </a>
                  )}
                  {venueData.youtubeUrl && !getYouTubeEmbedUrl(venueData.youtubeUrl) && ( // Show only if not embedded
                    <a href={venueData.youtubeUrl} target="_blank" rel="noopener noreferrer" title="YouTube" className="text-muted-foreground hover:text-primary transition-colors">
                      <Youtube className="w-5 h-5" />
                    </a>
                  )}
                </div>
              </div>
            )}
             <div className="pt-3 mt-3 border-t border-border/50">
                <h4 className="text-sm font-medium text-foreground mb-2">Próximos Eventos (Exemplo):</h4>
                <p className="text-xs text-muted-foreground italic">
                    A lista de eventos dinâmicos aparecerá aqui para os usuários.
                    Este é um preview estático.
                </p>
             </div>
          </CardContent>
          <CardFooter className="p-4 sm:p-6 pt-0">
            <Button
              variant="outline"
              className="w-full border-primary text-primary hover:bg-primary/10"
              onClick={() => router.push(`/map?venueId=${currentUser.uid}&isPreview=true`)}
            >
              <ExternalLink className="w-4 h-4 mr-2"/> Ver Detalhes Completos no Mapa
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="space-y-6 sm:space-y-8">
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                Gerenciar Eventos
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">Crie, edite e visualize seus próximos eventos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 p-4 sm:p-6 pt-0 sm:pt-0">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base"
                onClick={() => router.push('/partner/events')}
              >
                <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Adicionar/Gerenciar Eventos
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                Estatísticas Gerais
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">Visão geral das interações no seu local.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Avaliação Geral do Local:</p>
                  {venueData.averageVenueRating !== undefined && venueData.venueRatingCount !== undefined && venueData.venueRatingCount > 0 ? (
                      <div className="flex items-center gap-2">
                          <StarRating rating={venueData.averageVenueRating} readOnly size={20} fillColor='hsl(var(--primary))'/>
                          <span className="text-sm text-foreground">({venueData.averageVenueRating.toFixed(1)})</span>
                      </div>
                  ) : (
                      <p className="text-sm text-muted-foreground italic">Nenhuma avaliação de evento registrada ainda.</p>
                  )}
              </div>
              <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Total de Avaliações Recebidas:</p>
                  <p className="text-lg font-semibold text-primary">{venueData.venueRatingCount || 0}</p>
              </div>
              <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Total de Check-ins no Local:</p>
                  {loadingCheckIns ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                      <p className="text-lg font-semibold text-primary flex items-center">
                          <Users className="w-5 h-5 mr-2"/>
                          {totalCheckIns ?? 0}
                      </p>
                  )}
              </div>
              <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Total de Favoritos:</p>
                  {loadingFavorites ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                      <p className="text-lg font-semibold text-primary flex items-center">
                          <Heart className="w-5 h-5 mr-2 text-destructive fill-destructive"/>
                          {totalFavorites ?? 0}
                      </p>
                  )}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                      variant="outline"
                      className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                      onClick={() => router.push('/partner/ratings')}
                  >
                  Ver Avaliações e Comentários
                  </Button>
                <Button
                      variant="outline"
                      className="w-full border-primary/50 text-primary/70 text-sm sm:text-base cursor-not-allowed"
                      disabled={true}
                      title="Em breve: Relatório detalhado de check-ins por evento"
                  >
                  <CheckCircle className="w-4 h-4 mr-2"/> Ver Check-ins por Evento (Em Breve)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                <Brain className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                Análise de Feedback (IA)
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                Receba insights com IA baseados nos comentários e notas dos seus eventos.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              {isAnalyzingFeedback && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mr-2" />
                  <p className="text-primary">Analisando feedback...</p>
                </div>
              )}
              {analysisError && !isAnalyzingFeedback && (
                <p className="text-destructive text-sm py-4">{analysisError}</p>
              )}
              {aiAnalysisResult && !isAnalyzingFeedback && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="summary">
                    <AccordionTrigger className="text-primary hover:text-primary/80">Resumo Geral ({aiAnalysisResult.overallSentiment})</AccordionTrigger>
                    <AccordionContent className="text-sm text-foreground/80">
                      <p className="mb-2"><strong>Média de Notas:</strong> {aiAnalysisResult.averageRatingCalculated?.toFixed(1) || 'N/A'} de 5 estrelas ({aiAnalysisResult.totalFeedbackItems} feedbacks)</p>
                      {aiAnalysisResult.summary}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="positive">
                    <AccordionTrigger className="text-green-500 hover:text-green-600">Aspectos Positivos</AccordionTrigger>
                    <AccordionContent>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                        {aiAnalysisResult.positiveAspects.map((item, index) => <li key={`pos-${index}`}>{item}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="negative">
                    <AccordionTrigger className="text-red-500 hover:text-red-600">Aspectos a Melhorar</AccordionTrigger>
                    <AccordionContent>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                        {aiAnalysisResult.negativeAspects.map((item, index) => <li key={`neg-${index}`}>{item}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="suggestions">
                    <AccordionTrigger className="text-blue-500 hover:text-blue-600">Sugestões da IA</AccordionTrigger>
                    <AccordionContent>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                        {aiAnalysisResult.improvementSuggestions.map((item, index) => <li key={`sug-${index}`}>{item}</li>)}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </CardContent>
            <CardFooter className="p-4 sm:p-6 pt-0">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base"
                onClick={handleGenerateFeedbackAnalysis}
                disabled={isAnalyzingFeedback}
              >
                {isAnalyzingFeedback ? <Loader2 className="w-5 h-5 mr-2 animate-spin"/> : <Brain className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />}
                {aiAnalysisResult ? 'Analisar Novamente' : 'Analisar Feedback com IA'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                <Settings className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                Configurações da Conta e Pagamentos
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">Ajuste suas preferências, informações de contato e gerencie pagamentos.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
              <Button
                  variant="outline"
                  className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                  onClick={() => router.push('/partner/settings')}
              >
                Acessar Configurações
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                      <QrCode className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                      QR Codes de Eventos
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">Gere e visualize os QR Codes para check-in nos seus eventos.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
                  <Button
                  variant="outline"
                  className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                  onClick={() => router.push('/partner/events')}
                  >
                  Ver Eventos e QR Codes
                  </Button>
              </CardContent>
          </Card>

          <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                      <Gift className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                      Resgatar Cupons
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">Valide cupons de usuários aqui.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center p-4 sm:p-6 pt-0 sm:pt-0">
                   <Button
                      variant="outline"
                      className="w-full border-primary text-primary hover:bg-primary/10 text-sm sm:text-base"
                      onClick={() => router.push('/partner/redeem-coupon')}
                  >
                    Resgatar Cupom
                  </Button>
              </CardContent>
          </Card>

           <Card className="border-primary/50 shadow-lg shadow-primary/15 hover:shadow-primary/30 transition-shadow">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center text-lg sm:text-xl text-foreground">
                <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-yellow-400" />
                Dicas Fervo App
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">Aproveite ao máximo nossa plataforma!</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              <p className="text-sm text-foreground/90 italic">"{currentTip || 'Carregando dica...'}"</p>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

