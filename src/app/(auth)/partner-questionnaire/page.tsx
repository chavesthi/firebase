
'use client';

import type { NextPage } from 'next';
import { useEffect, useState, useRef } from 'react'; // Added useRef
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"; // Renamed storageRef
import Image from 'next/image';
import AvatarEditor from 'react-avatar-editor';

import { APIProvider, Map as GoogleMap, Marker, useMap } from '@vis.gl/react-google-maps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/shared/logo';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore, storage } from '@/lib/firebase';
import { VenueType, MusicStyle, VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS, GOOGLE_MAPS_API_KEY } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { geocodeAddress, type Location } from '@/services/geocoding';
import { MapPin, Save, ArrowLeft, UploadCloud, UserCircle, RotateCcw, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const cepRegex = /^\d{5}-?\d{3}$/;
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
  // No photoURL field in schema, as it's handled separately
});

type PartnerQuestionnaireFormInputs = z.infer<typeof partnerQuestionnaireSchema>;

function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: blob.type, lastModified: Date.now() });
}

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

  const [currentPhotoURL, setCurrentPhotoURL] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorScale, setEditorScale] = useState(1.2);
  const [editorRotation, setEditorRotation] = useState(0);
  const editorRef = useRef<AvatarEditor | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const { control, handleSubmit, formState: { errors, isSubmitting: isFormSubmitting }, watch, getValues, setValue, reset } = useForm<PartnerQuestionnaireFormInputs>({
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

  const watchedVenueName = watch('venueName');
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
          
          setCurrentPhotoURL(userData.photoURL || null); // Use Firestore photoURL primarily
          setIsProfileLocked(userData.questionnaireCompleted || false);
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
          // User authenticated but no Firestore document yet (e.g., new Google Sign-In before questionnaire step for partner)
          setCurrentPhotoURL(null); // No Firestore photoURL yet
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

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "Arquivo Muito Grande", description: "A imagem deve ter no máximo 5MB.", variant: "destructive"});
        return;
      }
      setEditorFile(file);
      setEditorScale(1.2); 
      setEditorRotation(0); 
    }
  };

  const handleGeocode = async () => {
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
    let finalPhotoURL = currentPhotoURL;

    // Handle photo upload
    if (editorFile && editorRef.current) {
      setIsUploading(true);
      setUploadProgress(0);
      console.log("onSubmit: Editor file selected, starting crop and upload process.");
      const canvas = editorRef.current.getImageScaledToCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, editorFile.type, 0.90));

      if (!blob) {
        toast({ title: "Erro ao Processar Imagem", description: "Não foi possível obter a imagem recortada.", variant: "destructive" });
        setIsUploading(false);
        return;
      }
      
      const croppedImageFile = blobToFile(blob, editorFile.name);
      const imagePath = `fotoperfilparceiros/${currentUser.uid}/${Date.now()}_${croppedImageFile.name}`;
      const imageStorageRef = storageRefStandard(storage, imagePath);
      console.log("onSubmit: Attempting to upload to path:", imagePath);
      const uploadTask = uploadBytesResumable(imageStorageRef, croppedImageFile);

      try {
        if (currentPhotoURL && currentPhotoURL.includes("firebasestorage.googleapis.com")) {
            console.log("onSubmit: Attempting to delete old profile picture:", currentPhotoURL);
            const oldImageRefTry = storageRefStandard(storage, currentPhotoURL);
            try {
                await deleteObject(oldImageRefTry);
                console.log("onSubmit: Old profile picture deleted successfully.");
            } catch (deleteError: any) {
                if (deleteError.code !== 'storage/object-not-found') {
                    console.warn("onSubmit: Could not delete old partner profile picture:", deleteError);
                } else {
                    console.log("onSubmit: Old profile picture not found in storage, no deletion needed.");
                }
            }
        }
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log('onSubmit: Upload is ' + progress + '% done');
            },
            (error) => { 
                console.error("onSubmit: Upload failed in task:", error);
                toast({ title: "Falha no Upload da Foto", description: error.message || "Não foi possível enviar a imagem.", variant: "destructive" });
                reject(error);
            },
            async () => { 
                finalPhotoURL = await getDownloadURL(uploadTask.snapshot.ref);
                console.log("onSubmit: New photo URL:", finalPhotoURL);
                resolve();
            }
          );
        });
      } catch (error:any) {
        console.error("onSubmit: Error during photo upload promise:", error);
        // Toast already shown in the promise reject or error handler
        setIsUploading(false);
        return; 
      }
    } else {
        console.log("onSubmit: No new editor file, keeping current photoURL:", currentPhotoURL);
    }
    setIsUploading(false);


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

    if (!currentVenueLocation && !initialQuestionnaireCompletedState) {
        toast({ title: "Localização Pendente", description: "Por favor, forneça um endereço válido e localize-o no mapa.", variant: "destructive" });
        return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);
      let dataToUpdate: any = {
        venueName: data.venueName,
        venueType: data.venueType,
        musicStyles: data.musicStyles || [],
        instagramUrl: data.instagramUrl,
        facebookUrl: data.facebookUrl,
        youtubeUrl: data.youtubeUrl,
        whatsappPhone: data.whatsappPhone,
        phone: data.phone,
        address: {
            street: data.street,
            number: data.number,
            city: data.city,
            state: data.state,
            cep: data.cep.replace(/\D/g, ''),
            country: data.country,
        },
        location: currentVenueLocation,
        photoURL: finalPhotoURL,
      };

      if (!initialQuestionnaireCompletedState) {
        dataToUpdate = {
          ...dataToUpdate,
          averageVenueRating: 0,
          venueRatingCount: 0,
          questionnaireCompleted: true,
          questionnaireCompletedAt: serverTimestamp(),
          // createdAt would have been set during initial account creation (handleSuccessfulAuth)
        };
        toast({
          title: "Bem-vindo ao Fervo App, Parceiro!",
          description: "Seu local agora está no mapa! Explore funcionalidades como criação de eventos, QR codes para check-in, análise de feedback com IA e muito mais. Você tem 15 dias de acesso gratuito para testar tudo!",
          duration: 10000,
          variant: "default"
        });
      } else {
        dataToUpdate.updatedAt = serverTimestamp();
      }

      ['phone', 'instagramUrl', 'facebookUrl', 'youtubeUrl', 'whatsappPhone'].forEach(key => {
        if (dataToUpdate[key] === '') dataToUpdate[key] = null;
      });

      await updateDoc(userDocRef, dataToUpdate, { merge: true });
      
      setCurrentPhotoURL(finalPhotoURL);
      setEditorFile(null); // Clear editor file after successful save

      toast({
        title: "Informações do Local Salvas!",
        description: "Suas informações foram atualizadas com sucesso.",
        variant: "default",
      });

      if (!initialQuestionnaireCompletedState) {
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
  const genericPlaceholder = "YOUR_DEFAULT_API_KEY_HERE";
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
            
            {/* Profile Picture Section */}
            <div className="flex flex-col items-center space-y-3 pt-4 border-t border-border">
                <Label className="text-lg font-semibold text-foreground">Foto de Perfil do Local</Label>
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-primary bg-muted flex items-center justify-center overflow-hidden">
                  {editorFile ? (
                    <AvatarEditor
                      ref={editorRef}
                      image={editorFile}
                      width={200} 
                      height={200} 
                      border={25} 
                      borderRadius={125} 
                      color={[0, 0, 0, 0.6]} 
                      scale={editorScale}
                      rotate={editorRotation}
                      className="rounded-full"
                    />
                  ) : currentPhotoURL ? (
                    <Image src={currentPhotoURL} alt={watchedVenueName || "Foto do Local"} width={160} height={160} className="rounded-full object-cover w-full h-full" data-ai-hint="venue building" />
                  ) : (
                    <UserCircle className="w-full h-full text-primary/40" data-ai-hint="avatar placeholder" />
                  )}
                </div>
                
                {!editorFile && (
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isFormSubmitting}>
                    <UploadCloud className="w-4 h-4 mr-2" /> {currentPhotoURL ? "Alterar Foto" : "Enviar Foto do Local"}
                  </Button>
                )}

                {editorFile && (
                  <div className="w-full max-w-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <ZoomOut className="w-5 h-5 text-muted-foreground" />
                      <Slider
                        min={1} max={3} step={0.05}
                        value={[editorScale]}
                        onValueChange={(value) => setEditorScale(value[0])}
                        className="flex-1"
                      />
                      <ZoomIn className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-5 h-5 text-muted-foreground"/>
                      <Slider
                          min={0} max={360} step={1}
                          value={[editorRotation]}
                          onValueChange={(value) => setEditorRotation(value[0])}
                          className="flex-1"
                        />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditorFile(null)} className="w-full text-destructive hover:text-destructive/80">
                      Cancelar Edição da Foto
                    </Button>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />
                {isUploading && <Progress value={uploadProgress} className="w-full h-2 mt-2" />}
                {uploadProgress > 0 && uploadProgress < 100 && <p className="text-xs text-muted-foreground">{Math.round(uploadProgress)}% enviado</p>}
                <p className="text-xs text-muted-foreground">Tamanho máx: 5MB (PNG, JPG, WEBP)</p>
              </div>


              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-4 border-t border-border">
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
                    <div className="mt-1.5 flex items-start text-xs text-amber-600 dark:text-amber-500">
                      <AlertCircle className="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0" />
                      <span>Atenção: O tipo de local só poderá ser alterado a cada 30 dias. Escolha com cuidado.</span>
                    </div>
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

                  <Button type="button" onClick={handleGeocode} disabled={isGeocoding || !addressFields.every(f => f && f.length > 0) || isUploading || isFormSubmitting} className="w-full bg-primary/80 hover:bg-primary text-primary-foreground">
                    <MapPin className="w-4 h-4 mr-2"/> {isGeocoding ? 'Localizando...' : 'Localizar Endereço no Mapa'}
                  </Button>

                  {GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== genericPlaceholder && (
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
                  {(!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === genericPlaceholder) && (
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isFormSubmitting || isGeocoding || isUploading}>
                <Save className="w-4 h-4 mr-2"/>
                {isUploading ? 'Enviando Foto...' : (isFormSubmitting ? 'Salvando...' : (isProfileLocked ? 'Salvar Alterações' : 'Salvar e Continuar'))}
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

