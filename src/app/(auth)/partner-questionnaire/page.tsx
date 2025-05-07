
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore'; // Added getDoc
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

const partnerQuestionnaireSchema = z.object({
  venueName: z.string().min(3, { message: 'O nome do local deve ter pelo menos 3 caracteres.' }),
  venueType: z.nativeEnum(VenueType, { errorMap: () => ({ message: 'Selecione um tipo de local.' }) }),
  musicStyles: z.array(z.nativeEnum(MusicStyle))
    .min(1, { message: "Selecione pelo menos 1 estilo musical."})
    .max(4, { message: "Selecione no máximo 4 estilos musicais." })
    .default([]),
  phone: z.string().min(10, { message: 'Telefone inválido. Inclua DDD.' }).optional().or(z.literal('')), // Example: (XX) XXXXX-XXXX
  
  country: z.string().min(2, { message: 'País inválido.' }),
  state: z.string().min(2, { message: 'Estado inválido.' }),
  city: z.string().min(2, { message: 'Cidade inválida.' }),
  street: z.string().min(3, { message: 'Rua inválida.' }),
  number: z.string().min(1, { message: 'Número inválido.' }),
  cep: z.string().regex(cepRegex, { message: 'CEP inválido. Formato: XXXXX ou XXXXX-XXX' }),

  instagramUrl: z.string().url({ message: 'URL do Instagram inválida.' }).optional().or(z.literal('')),
  facebookUrl: z.string().url({ message: 'URL do Facebook inválida.' }).optional().or(z.literal('')),
  youtubeUrl: z.string().url({ message: 'URL do YouTube inválida.' }).optional().or(z.literal('')),
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
  const [isProfileLocked, setIsProfileLocked] = useState(false); // New state for locking fields

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
          if (userData.questionnaireCompleted) {
            setIsProfileLocked(true);
            toast({
              title: "Modo de Edição Limitado",
              description: "Você só pode editar as redes sociais. Para outras alterações, contate o suporte.",
              variant: "default",
              duration: 5000,
            });
          } else {
            setIsProfileLocked(false);
          }
          // Pre-fill form with existing data
          reset({
            venueName: userData.venueName || '',
            venueType: userData.venueType as VenueType, // Ensure type safety
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
          });
          if (userData.location) {
            setVenueLocation(userData.location);
          }

        } else {
          setIsProfileLocked(false);
          // This case might indicate a new user who hasn't gone through signup properly
          // or an issue with data consistency.
          // For now, we allow them to fill the form.
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, reset, toast]);

  const handleGeocode = async () => {
    if (isProfileLocked) {
      toast({ title: "Endereço Bloqueado", description: "O endereço não pode ser alterado após a configuração inicial.", variant: "destructive" });
      return;
    }
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

    // If profile is not locked and location isn't set, try to geocode
    if (!isProfileLocked && !currentVenueLocation && (data.street && data.number && data.city && data.state && data.cep && data.country)) {
        setIsGeocoding(true);
        try {
            currentVenueLocation = await geocodeAddress(`${data.street}, ${data.number}, ${data.city}, ${data.state}, ${data.cep}, ${data.country}`);
            setVenueLocation(currentVenueLocation); // Update state
        } catch (error) {
            toast({ title: "Localização Falhou", description: "Não foi possível geolocalizar o endereço fornecido. Verifique os dados.", variant: "destructive" });
            setIsGeocoding(false);
            return;
        }
        setIsGeocoding(false);
    }
    
    if (!isProfileLocked && !currentVenueLocation) {
        toast({ title: "Localização Pendente", description: "Por favor, forneça um endereço válido e localize-o no mapa.", variant: "destructive" });
        return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);
      
      const updateData: Partial<PartnerQuestionnaireFormInputs & { questionnaireCompleted: boolean, location?: Location | null, address?: any }> = {
        instagramUrl: data.instagramUrl,
        facebookUrl: data.facebookUrl,
        youtubeUrl: data.youtubeUrl,
      };

      if (!isProfileLocked) {
        updateData.venueName = data.venueName;
        updateData.venueType = data.venueType;
        updateData.musicStyles = data.musicStyles || [];
        updateData.phone = data.phone;
        updateData.address = {
          street: data.street,
          number: data.number,
          city: data.city,
          state: data.state,
          cep: data.cep.replace(/\D/g, ''),
          country: data.country,
        };
        updateData.location = currentVenueLocation; // Use the geocoded or existing location
        updateData.questionnaireCompleted = true; // Mark as completed on first save
      } else {
        // If profile is locked, we still need to ensure `questionnaireCompleted` remains true
        // and other fields are not accidentally unset if they are not part of `data`
        // However, `updateDoc` only updates specified fields.
        // Fetch existing data to ensure we don't overwrite critical fields if they are not in `data`
         const userDocSnap = await getDoc(userDocRef);
         if (userDocSnap.exists()) {
            const existingData = userDocSnap.data();
             // These fields are not editable, so we ensure they are preserved
            updateData.venueName = existingData.venueName;
            updateData.venueType = existingData.venueType;
            updateData.musicStyles = existingData.musicStyles;
            updateData.phone = existingData.phone;
            updateData.address = existingData.address;
            updateData.location = existingData.location;
            updateData.questionnaireCompleted = true;
         }
      }
      
      await updateDoc(userDocRef, updateData);

      toast({
        title: isProfileLocked ? "Redes Sociais Salvas!" : "Perfil do Local Salvo!",
        description: isProfileLocked ? "Suas URLs de redes sociais foram atualizadas." : "Seu estabelecimento foi configurado com sucesso.",
        variant: "default", 
      });
      
      if (!isProfileLocked) { // Only navigate to dashboard if it was the initial setup
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
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-8 left-8">
        <Logo iconClassName="text-destructive" />
      </div>
      {isProfileLocked && (
        <div className="w-full max-w-3xl mb-4">
          <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Painel
          </Button>
        </div>
      )}
      <Card className="w-full max-w-3xl p-px rounded-lg shadow-2xl bg-gradient-to-b from-destructive/50 to-secondary/50">
        <Card className="w-full bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-destructive to-accent">
              {isProfileLocked ? "Editar Redes Sociais" : "Configure seu Local!"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {isProfileLocked 
                ? "Atualize os links das suas redes sociais e vídeo de apresentação." 
                : "Detalhes do seu estabelecimento para os usuários do Fervo App."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="venueName" className="text-destructive/90">Nome do Local</Label>
                    <Controller name="venueName" control={control} render={({ field }) => <Input id="venueName" placeholder="Ex: Balada FervoTop" {...field} className={errors.venueName ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked} />} />
                    {errors.venueName && <p className="mt-1 text-sm text-destructive">{errors.venueName.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="venueType" className="text-destructive/90">Tipo de Local</Label>
                    <Controller
                      name="venueType"
                      control={control}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value} disabled={isProfileLocked}>
                          <SelectTrigger id="venueType" className={errors.venueType ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}>
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
                    <Label className="text-destructive/90">Estilos Musicais (Máx. 4)</Label>
                    <ScrollArea className="h-32 p-2 border rounded-md border-input">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                                    if (isProfileLocked) return false;
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
                                  disabled={isProfileLocked || (!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4)}
                                />
                              )}
                            />
                            <Label htmlFor={`music-${option.value}`} className={`font-normal ${isProfileLocked ? 'text-muted-foreground' : 'text-foreground/80'}`}>{option.label}</Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    {errors.musicStyles && <p className="mt-1 text-sm text-destructive">{errors.musicStyles.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-destructive/90">Telefone (Opcional)</Label>
                    <Controller name="phone" control={control} render={({ field }) => <Input id="phone" type="tel" placeholder="(XX) XXXXX-XXXX" {...field} className={errors.phone ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked} />} />
                    {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="country" className="text-destructive/90">País</Label>
                    <Controller name="country" control={control} render={({ field }) => <Input id="country" placeholder="Brasil" {...field} className={errors.country ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}/>} />
                    {errors.country && <p className="mt-1 text-sm text-destructive">{errors.country.message}</p>}
                  </div>
                   <div>
                    <Label htmlFor="cep" className="text-destructive/90">CEP</Label>
                    <Controller name="cep" control={control} render={({ field }) => <Input id="cep" placeholder="XXXXX-XXX" {...field} className={errors.cep ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked} />} />
                    {errors.cep && <p className="mt-1 text-sm text-destructive">{errors.cep.message}</p>}
                  </div>
                </div>

                {/* Right Column - Address */}
                <div className="space-y-4">
                 
                  <div>
                    <Label htmlFor="state" className="text-destructive/90">Estado</Label>
                    <Controller name="state" control={control} render={({ field }) => <Input id="state" placeholder="Ex: São Paulo" {...field} className={errors.state ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}/>} />
                    {errors.state && <p className="mt-1 text-sm text-destructive">{errors.state.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="city" className="text-destructive/90">Cidade</Label>
                    <Controller name="city" control={control} render={({ field }) => <Input id="city" placeholder="Ex: São Paulo" {...field} className={errors.city ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}/>} />
                    {errors.city && <p className="mt-1 text-sm text-destructive">{errors.city.message}</p>}
                  </div>
                  
                  <div>
                    <Label htmlFor="street" className="text-destructive/90">Rua</Label>
                    <Controller name="street" control={control} render={({ field }) => <Input id="street" placeholder="Ex: Av. Paulista" {...field} className={errors.street ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}/>} />
                    {errors.street && <p className="mt-1 text-sm text-destructive">{errors.street.message}</p>}
                  </div>

                  <div>
                    <Label htmlFor="number" className="text-destructive/90">Número</Label>
                    <Controller name="number" control={control} render={({ field }) => <Input id="number" placeholder="Ex: 1000 ou S/N" {...field} className={errors.number ? 'border-destructive focus-visible:ring-destructive' : ''} disabled={isProfileLocked}/>} />
                    {errors.number && <p className="mt-1 text-sm text-destructive">{errors.number.message}</p>}
                  </div>
                  
                  <Button type="button" onClick={handleGeocode} disabled={isProfileLocked || isGeocoding || !addressFields.every(f => f && f.length > 0)} className="w-full bg-destructive/80 hover:bg-destructive text-destructive-foreground">
                    <MapPin className="w-4 h-4 mr-2"/> {isGeocoding ? 'Localizando...' : 'Localizar Endereço no Mapa'}
                  </Button>

                  {GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_DEFAULT_API_KEY_HERE" && (
                    <div className="h-48 mt-2 overflow-hidden border rounded-md border-input">
                        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                            <GoogleMap
                                defaultCenter={initialMapCenter}
                                defaultZoom={venueLocation ? 17 : 3}
                                mapId="partnerQuestionnaireMap"
                                gestureHandling="greedy"
                                disableDefaultUI={true}
                                className="w-full h-full"
                                options={{ styles: [ { elementType: "geometry", stylers: [{ color: "#242f3e" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] } ]}} 
                            >
                                <MapUpdater center={venueLocation || initialMapCenter} />
                                {venueLocation && <Marker position={venueLocation} title={watch('venueName') || "Seu Local"} />}
                            </GoogleMap>
                        </APIProvider>
                    </div>
                  )}
                  {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "YOUR_DEFAULT_API_KEY_HERE") && (
                    <p className="text-sm text-muted-foreground">Preview do mapa indisponível (API Key não configurada).</p>
                  )}
                </div>
              </div>
              
              {/* Social Links - Full Width */}
              <div className="pt-4 space-y-4 border-t border-border">
                 <h3 className="text-lg font-semibold text-center text-destructive/90">Redes Sociais e Vídeo</h3>
                 <div>
                    <Label htmlFor="instagramUrl" className="text-destructive/90">Instagram URL</Label>
                    <Controller name="instagramUrl" control={control} render={({ field }) => <Input id="instagramUrl" type="url" placeholder="https://instagram.com/seulocal" {...field} className={errors.instagramUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.instagramUrl && <p className="mt-1 text-sm text-destructive">{errors.instagramUrl.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="facebookUrl" className="text-destructive/90">Facebook URL</Label>
                    <Controller name="facebookUrl" control={control} render={({ field }) => <Input id="facebookUrl" type="url" placeholder="https://facebook.com/seulocal" {...field} className={errors.facebookUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.facebookUrl && <p className="mt-1 text-sm text-destructive">{errors.facebookUrl.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="youtubeUrl" className="text-destructive/90">Vídeo de Apresentação (YouTube URL)</Label>
                    <Controller name="youtubeUrl" control={control} render={({ field }) => <Input id="youtubeUrl" type="url" placeholder="https://youtube.com/watch?v=..." {...field} className={errors.youtubeUrl ? 'border-destructive focus-visible:ring-destructive' : ''} />} />
                    {errors.youtubeUrl && <p className="mt-1 text-sm text-destructive">{errors.youtubeUrl.message}</p>}
                  </div>
              </div>

            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSubmitting || isGeocoding}>
                <Save className="w-4 h-4 mr-2"/> 
                {isSubmitting ? 'Salvando...' : (isProfileLocked ? 'Salvar Redes Sociais' : 'Salvar e Continuar')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </Card>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px hsl(var(--destructive)), 0 0 30px 10px hsla(var(--destructive), 0.3), 0 0 15px 5px hsl(var(--secondary)), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
      `}</style>
    </main>
  );
};

export default PartnerQuestionnairePage;

