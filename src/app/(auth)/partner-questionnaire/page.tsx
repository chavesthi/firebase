
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { APIProvider, Map as GoogleMap, Marker, useMap } from '@vis.gl/react-google-maps';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/shared/logo';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { VenueType, MusicStyle, VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS, GOOGLE_MAPS_API_KEY } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { geocodeAddress, type Location } from '@/services/geocoding';
import { MapPin, Save, ArrowLeft } from 'lucide-react';

const cepRegex = /^\d{5}-?\d{3}$/;
// Updated phoneRegex to be more specific for Brazilian format, allowing optional country code
const phoneRegex = /^(\+?\d{1,3}\s?)?\(?[1-9]{2}\)?\s?9?\d{4,5}-?\d{4}$/;


const partnerQuestionnaireSchema = z.object({
  venueName: z.string().min(3, { message: 'O nome do local deve ter pelo menos 3 caracteres.' }),
  venueType: z.nativeEnum(VenueType, { errorMap: () => ({ message: 'Selecione um tipo de local.' }) }),
  musicStyles: z.array(z.nativeEnum(MusicStyle))
    .min(1, { message: "Selecione pelo menos 1 estilo musical."})
    .max(4, { message: "Selecione no máximo 4 estilos musicais." })
    .default([]),
  phone: z.string().min(10, { message: 'Telefone inválido. Inclua DDD.' }).optional().or(z.literal('')),

  country: z.string().min(2, { message: 'País inválido.' }),
  state: z.string().min(2, { message: 'Estado inválido.' }),
  city: z.string().min(2, { message: 'Cidade inválida.' }),
  street: z.string().min(3, { message: 'Rua inválida.' }),
  number: z.string().min(1, { message: 'Número inválido.' }),
  cep: z.string().regex(cepRegex, { message: 'CEP inválido. Formato: XXXXX ou XXXXX-XXX' }),

  instagramUrl: z.string().url({ message: 'URL do Instagram inválida.' }).optional().or(z.literal('')),
  facebookUrl: z.string().url({ message: 'URL do Facebook inválida.' }).optional().or(z.literal('')),
  youtubeUrl: z.string().url({ message: 'URL do YouTube inválida.' }).optional().or(z.literal('')),
  whatsappPhone: z.string().regex(phoneRegex, { message: 'Número do WhatsApp inválido. Formato esperado: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX.' }).optional().or(z.literal('')),
});

type PartnerQuestionnaireFormInputs = z.infer<typeof partnerQuestionnaireSchema>;

const MapUpdater = ({ center }: { center: Location | null }) => {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.moveCamera({ center, zoom: 17 });
    }
  }, [map, center]);
  return null;
};

const PartnerQuestionnairePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [venueLocation, setVenueLocation] = useState<Location | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isProfileLocked, setIsProfileLocked] = useState(false);
  const [initialQuestionnaireCompletedState, setInitialQuestionnaireCompletedState] = useState(false);


  const { control, handleSubmit, formState: { errors, isSubmitting }, watch, getValues, setValue, reset } = useForm<PartnerQuestionnaireFormInputs>({
    resolver: zodResolver(partnerQuestionnaireSchema),
    defaultValues: {
      venueName: '',
      musicStyles: [],
      phone: '',
      country: 'Brasil',
      state: '',
      city: '',
      street: '',
      number: '',
      cep: '',
      instagramUrl: '',
      facebookUrl: '',
      youtubeUrl: '',
      whatsappPhone: '',
    },
  });

  const addressFields = watch(['street', 'number', 'city', 'state', 'cep', 'country']);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setInitialQuestionnaireCompletedState(userData.questionnaireCompleted || false);
          
          reset({
            venueName: userData.venueName || '',
            venueType: userData.venueType as VenueType,
            musicStyles: userData.musicStyles || [],
            phone: userData.phone || '',
            country: userData.address?.country || 'Brasil',
            state: userData.address?.state || '',
            city: userData.address?.city || '',
            street: userData.address?.street || '',
            number: userData.address?.number || '',
            cep: userData.address?.cep || '',
            instagramUrl: userData.instagramUrl || '',
            facebookUrl: userData.facebookUrl || '',
            youtubeUrl: userData.youtubeUrl || '',
            whatsappPhone: userData.whatsappPhone || '',
          });
          
          setIsProfileLocked(userData.questionnaireCompleted || false); // Profile is locked if questionnaireCompleted is true
          if (userData.questionnaireCompleted) {
            toast({
              title: "Modo de Edição",
              description: "Você pode editar suas informações. Algumas alterações podem requerer contato com o suporte.",
              variant: "default",
              duration: 7000,
            });
          }

          if (userData.location) {
            setVenueLocation(userData.location);
          }
        } else {
          setIsProfileLocked(false);
          setInitialQuestionnaireCompletedState(false);
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, reset, toast]);

  const handleGeocode = async () => {
    // Geocoding is allowed even if profile is locked, for viewing purposes or if address fields become editable later
    // However, saving the new location would be restricted if profile is locked for address changes.
    const { street, number, city, state: formState, cep, country } = getValues();
    if (!street || !number || !city || !formState || !cep || !country) {
      toast({ title: "Endereço Incompleto", description: "Preencha todos os campos de endereço para localizar.", variant: "destructive" });
      return;
    }
    const fullAddress = `${street}, ${number}, ${city}, ${formState}, ${cep}, ${country}`;
    setIsGeocoding(true);
    try {
      const location = await geocodeAddress(fullAddress);
      setVenueLocation(location);
      toast({ title: "Sucesso!", description: "Endereço localizado no mapa." });
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({ title: "Erro de Geocodificação", description: "Não foi possível encontrar o endereço. Verifique e tente novamente.", variant: "destructive" });
      setVenueLocation(null);
    } finally {
      setIsGeocoding(false);
    }
  };

  const onSubmit: SubmitHandler<PartnerQuestionnaireFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }

    let currentVenueLocation = venueLocation;

    // Attempt geocoding if address fields are filled and no location is set yet, even if profile is "locked" for other fields.
    // The actual restriction on saving this location would happen based on isProfileLocked *for address data*.
    if (!currentVenueLocation && (data.street && data.number && data.city && data.state && data.cep && data.country)) {
        setIsGeocoding(true);
        try {
            currentVenueLocation = await geocodeAddress(`${data.street}, ${data.number}, ${data.city}, ${data.state}, ${data.cep}, ${data.country}`);
            setVenueLocation(currentVenueLocation);
        } catch (error) {
            toast({ title: "Localização Falhou", description: "Não foi possível geolocalizar o endereço fornecido. Verifique os dados.", variant: "destructive" });
            setIsGeocoding(false);
            return;
        }
        setIsGeocoding(false);
    }

    if (!currentVenueLocation && !isProfileLocked) { // Only block saving if it's the initial setup and no location
        toast({ title: "Localização Pendente", description: "Por favor, forneça um endereço válido e localize-o no mapa.", variant: "destructive" });
        return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);

      // Data that can always be updated
      let dataToUpdate: any = {
        venueName: data.venueName, // Now always editable
        venueType: data.venueType, 
        musicStyles: data.musicStyles || [], 
        instagramUrl: data.instagramUrl,
        facebookUrl: data.facebookUrl,
        youtubeUrl: data.youtubeUrl,
        whatsappPhone: data.whatsappPhone,
        phone: data.phone, // Now always editable
      };

      // Data that is only set/updated if the profile isn't locked (i.e., first time setup)
      // OR if we decide some fields remain editable even if "locked"
      if (!isProfileLocked) { // This implies initialQuestionnaireCompletedState is false
        dataToUpdate = {
          ...dataToUpdate,
          address: {
            street: data.street,
            number: data.number,
            city: data.city,
            state: data.state,
            cep: data.cep.replace(/\D/g, ''),
            country: data.country,
          },
          location: currentVenueLocation,
          averageVenueRating: 0,
          venueRatingCount: 0,
          questionnaireCompleted: true, // Mark as completed
          questionnaireCompletedAt: serverTimestamp(), // Timestamp for first completion
        };
      } else {
        // If profile is locked, but we allow address editing, update address here.
        // For now, assuming address is locked after initial setup.
        // If address becomes editable later, this logic needs to adjust.
        // For example, if we add a specific "edit address" flow.
        dataToUpdate.address = { // Example if address could be edited by a partner
            street: data.street,
            number: data.number,
            city: data.city,
            state: data.state,
            cep: data.cep.replace(/\D/g, ''),
            country: data.country,
        };
        dataToUpdate.location = currentVenueLocation;
      }


      ['phone', 'instagramUrl', 'facebookUrl', 'youtubeUrl', 'whatsappPhone'].forEach(key => {
        if (dataToUpdate[key] === '') {
          dataToUpdate[key] = null;
        }
      });

      await updateDoc(userDocRef, dataToUpdate, { merge: true }); // Use merge:true to avoid overwriting existing fields unintentionally

      toast({
        title: "Informações do Local Salvas!",
        description: "Suas informações foram atualizadas com sucesso.",
        variant: "default",
      });

      if (!isProfileLocked) { // If it was the first completion
        setIsProfileLocked(true); 
        setInitialQuestionnaireCompletedState(true); 
        router.push('/partner/dashboard');
      }
    } catch (error) {
      console.error("Error saving partner questionnaire:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar os dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const initialMapCenter = { lat: -23.55052, lng: -46.633308 };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <p className="text-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-2 sm:p-4 bg-background">
      <div className="absolute top-4 sm:top-8 left-4 sm:left-8">
        <Logo iconClassName="text-primary" />
      </div>
      {isProfileLocked && (
        <div className="w-full max-w-3xl mb-4 flex justify-end px-2 sm:px-0">
          <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-primary text-primary hover:bg-primary/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Painel
          </Button>
        </div>
      )}
      <Card className="w-full max-w-3xl p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-secondary/50">
        <Card className="w-full bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center px-4 sm:px-6">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              {isProfileLocked ? "Editar Informações do Local" : "Configure seu Local!"}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base">
              {isProfileLocked
                ? "Atualize as informações do seu local."
                : "Detalhes do seu estabelecimento para os usuários do Fervo App."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 px-4 sm:px-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="venueName" className="text-foreground">Nome do Local</Label>
                    <Controller name="venueName" control={control} render={({ field }) => <Input id="venueName" placeholder="Ex: Balada FervoTop" {...field} className={errors.venueName ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.venueName && <p className="mt-1 text-sm text-destructive">{errors.venueName.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="venueType" className="text-foreground">Tipo de Local</Label>
                    <Controller
                      name="venueType"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value} >
                          <SelectTrigger id="venueType" className={errors.venueType ? 'border-destructive focus-visible:ring-destructive' : ''} >
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {VENUE_TYPE_OPTIONS.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.venueType && <p className="mt-1 text-sm text-destructive">{errors.venueType.message}</p>}
                  </div>

                  <div>
                    <Label className="text-foreground">Estilos Musicais (Máx. 4)</Label>
                    <ScrollArea className="h-32 p-2 border rounded-md border-input">
                      <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                        {MUSIC_STYLE_OPTIONS.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Controller
                              name="musicStyles"
                              control={control}
                              render={({ field }) => (
                                <Checkbox
                                  id={`music-${option.value}`}
                                  checked={field.value?.includes(option.value)}
                                  onCheckedChange={(checked) => {
                                    const currentSelection = field.value || [];
                                    if (checked) {
                                      if (currentSelection.length < 4) {
                                        field.onChange([...currentSelection, option.value]);
                                      } else {
                                        toast({ title: "Limite atingido", description: "Você pode selecionar no máximo 4 estilos.", variant: "destructive", duration: 3000 });
                                        return false;
                                      }
                                    } else {
                                      field.onChange(currentSelection.filter((value) => value !== option.value));
                                    }
                                    return checked;
                                  }}
                                  disabled={(!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4)}
                                />
                              )}
                            />
                            <Label htmlFor={`music-${option.value}`} className="font-normal text-xs xs:text-sm text-foreground/80">{option.label}</Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    {errors.musicStyles && <p className="mt-1 text-sm text-destructive">{errors.musicStyles.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-foreground">Telefone Fixo (Opcional)</Label>
                    <Controller name="phone" control={control} render={({ field }) => <Input id="phone" type="tel" placeholder="(XX) XXXX-XXXX" {...field} className={errors.phone ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="country" className="text-foreground">País</Label>
                    <Controller name="country" control={control} render={({ field }) => <Input id="country" placeholder="Brasil" {...field} className={errors.country ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.country && <p className="mt-1 text-sm text-destructive">{errors.country.message}</p>}
                  </div>
                   <div>
                    <Label htmlFor="cep" className="text-foreground">CEP</Label>
                    <Controller name="cep" control={control} render={({ field }) => <Input id="cep" placeholder="XXXXX-XXX" {...field} className={errors.cep ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.cep && <p className="mt-1 text-sm text-destructive">{errors.cep.message}</p>}
                  </div>
                </div>

                {/* Right Column - Address */}
                <div className="space-y-4">

                  <div>
                    <Label htmlFor="state" className="text-foreground">Estado</Label>
                    <Controller name="state" control={control} render={({ field }) => <Input id="state" placeholder="Ex: São Paulo" {...field} className={errors.state ? 'border-destructive focus-visible:ring-destructive' : ''} /> } />
                    {errors.state && <p className="mt-1 text-sm text-destructive">{errors.state.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="city" className="text-foreground">Cidade</Label>
                    <Controller name="city" control={control} render={({ field }) => <Input id="city" placeholder="Ex: São Paulo" {...field} className={errors.city ? 'border-destructive focus-visible:ring-destructive' : ''} /> } />
                    {errors.city && <p className="mt-1 text-sm text-destructive">{errors.city.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="street" className="text-foreground">Rua</Label>
                    <Controller name="street" control={control} render={({ field }) => <Input id="street" placeholder="Ex: Av. Paulista" {...field} className={errors.street ? 'border-destructive focus-visible:ring-destructive' : ''} /> } />
                    {errors.street && <p className="mt-1 text-sm text-destructive">{errors.street.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="number" className="text-foreground">Número</Label>
                    <Controller name="number" control={control} render={({ field }) => <Input id="number" placeholder="Ex: 1000 ou S/N" {...field} className={errors.number ? 'border-destructive focus-visible:ring-destructive' : ''} /> } />
                    {errors.number && <p className="mt-1 text-sm text-destructive">{errors.number.message}</p>}
                  </div>

                  <Button type="button" onClick={handleGeocode} disabled={isGeocoding || !addressFields.every(f => f && f.length > 0)} className="w-full bg-primary/80 hover:bg-primary text-primary-foreground">
                    <MapPin className="w-4 h-4 mr-2"/> {isGeocoding ? 'Localizando...' : 'Localizar Endereço no Mapa'}
                  </Button>

                  {GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0" && (
                    <div className="h-40 sm:h-48 mt-2 overflow-hidden border rounded-md border-input">
                        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                            <GoogleMap
                                defaultCenter={initialMapCenter}
                                defaultZoom={venueLocation ? 17 : 3}
                                mapId="2cc43a385ccd3370d4c3b889"
                                gestureHandling="greedy"
                                disableDefaultUI={true}
                                className="w-full h-full"
                            >
                                <MapUpdater center={venueLocation || initialMapCenter} />
                                {venueLocation && <Marker position={venueLocation} title={watch('venueName') || "Seu Local"} />}
                            </GoogleMap>
                        </APIProvider>
                    </div>
                  )}
                  {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "AIzaSyByPJkEKJ-YC8eT0Q0XWcYZ9P0N5YQx3u0") && (
                    <p className="text-sm text-muted-foreground">Preview do mapa indisponível (API Key não configurada).</p>
                  )}
                </div>
              </div>

              {/* Social Links & WhatsApp - Full Width */}
              <div className="pt-4 space-y-4 border-t border-border">
                 <h3 className="text-lg font-semibold text-center text-foreground">Contatos, Redes Sociais e Vídeo</h3>
                  <div>
                    <Label htmlFor="whatsappPhone" className="text-foreground">WhatsApp (Contato Principal)</Label>
                    <Controller
                        name="whatsappPhone"
                        control={control}
                        render={({ field }) =>
                            <Input
                                id="whatsappPhone"
                                type="tel"
                                placeholder="Ex: (11) 98765-4321"
                                {...field}
                                className={errors.whatsappPhone ? 'border-destructive focus-visible:ring-destructive' : ''}
                            />
                        }
                    />
                    {errors.whatsappPhone && <p className="mt-1 text-sm text-destructive">{errors.whatsappPhone.message}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Formato: (DDD) Número. Ex: (11) 98765-4321 ou (11) 3456-7890. Código do país é opcional (Ex: +55).</p>
                  </div>
                 <div>
                    <Label htmlFor="instagramUrl" className="text-foreground">Instagram URL</Label>
                    <Controller name="instagramUrl" control={control} render={({ field }) => <Input id="instagramUrl" type="url" placeholder="https://instagram.com/seulocal" {...field} className={errors.instagramUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.instagramUrl && <p className="mt-1 text-sm text-destructive">{errors.instagramUrl.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="facebookUrl" className="text-foreground">Facebook URL</Label>
                    <Controller name="facebookUrl" control={control} render={({ field }) => <Input id="facebookUrl" type="url" placeholder="https://facebook.com/seulocal" {...field} className={errors.facebookUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.facebookUrl && <p className="mt-1 text-sm text-destructive">{errors.facebookUrl.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="youtubeUrl" className="text-foreground">Vídeo de Apresentação (YouTube URL)</Label>
                    <Controller name="youtubeUrl" control={control} render={({ field }) => <Input id="youtubeUrl" type="url" placeholder="https://youtube.com/watch?v=..." {...field} className={errors.youtubeUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.youtubeUrl && <p className="mt-1 text-sm text-destructive">{errors.youtubeUrl.message}</p>}
                  </div>
              </div>

            </CardContent>
            <CardFooter className="px-4 sm:px-6 pb-4 sm:pb-6">
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSubmitting || isGeocoding}>
                <Save className="w-4 h-4 mr-2"/>
                {isSubmitting ? 'Salvando...' : (isProfileLocked ? 'Salvar Alterações' : 'Salvar e Continuar')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </Card>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px hsl(var(--primary)), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px hsl(var(--secondary)), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
        @media (max-width: 640px) { /* xs breakpoint */}
          .grid-cols-xs-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .text-xs {
            font-size: 0.75rem; /* 12px */}
            line-height: 1rem; /* 16px */}
          }
        }
      `}</style>
    </main>
  );
};

export default PartnerQuestionnairePage;

