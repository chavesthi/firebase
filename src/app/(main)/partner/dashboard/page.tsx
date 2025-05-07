'use client';

import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { GOOGLE_MAPS_API_KEY, VenueType, VENUE_TYPE_OPTIONS } from '@/lib/constants';
import { geocodeAddress, type Location } from '@/services/geocoding';
import { APIProvider, Map as GoogleMap, Marker, useMap } from '@vis.gl/react-google-maps';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Save } from 'lucide-react';

const venueSchema = z.object({
  name: z.string().min(3, { message: 'O nome do local deve ter pelo menos 3 caracteres.' }),
  address: z.string().min(5, { message: 'Endereço inválido.' }),
  type: z.nativeEnum(VenueType, { errorMap: () => ({ message: 'Selecione um tipo de local.'})}),
  description: z.string().min(10, { message: 'A descrição deve ter pelo menos 10 caracteres.' }).max(200, { message: 'Máximo de 200 caracteres.'}),
  imageUrl: z.string().url({ message: 'URL da imagem inválida.' }).optional().or(z.literal('')),
});

type VenueFormInputs = z.infer<typeof venueSchema>;

const MapUpdater = ({ center }: { center: Location | null }) => {
  const map = useMap();
  useState(() => { // Use state to trigger update when center changes
    if (map && center) {
      map.moveCamera({ center, zoom: 17 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }); 
  return null;
};

export default function PartnerDashboardPage() {
  const [venueLocation, setVenueLocation] = useState<Location | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const { toast } = useToast();

  const methods = useForm<VenueFormInputs>({
    resolver: zodResolver(venueSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = methods;

  const addressValue = watch('address');

  const handleGeocode = async () => {
    if (!addressValue) {
      toast({ title: "Erro", description: "Por favor, insira um endereço.", variant: "destructive" });
      return;
    }
    setIsGeocoding(true);
    try {
      const location = await geocodeAddress(addressValue);
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

  const onSubmit: SubmitHandler<VenueFormInputs> = async (data) => {
    if (!venueLocation) {
      toast({ title: "Localização Pendente", description: "Por favor, localize o endereço no mapa antes de salvar.", variant: "destructive"});
      return;
    }
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log('Venue data:', { ...data, location: venueLocation });
    
    toast({
      title: "Local Cadastrado!",
      description: `${data.name} foi cadastrado com sucesso.`,
      variant: "default", // Using default as "success" here which is neon blue
    });
    reset();
    setVenueLocation(null);
  };

  const initialMapCenter = { lat: -23.55052, lng: -46.633308 }; // São Paulo

  return (
    <div className="container py-8 mx-auto">
      <h1 className="mb-8 text-4xl font-bold text-center text-destructive">Painel do Parceiro</h1>
      
      <div className="grid gap-8 md:grid-cols-2">
        <Card className="border-destructive/70 shadow-lg shadow-destructive/20">
          <CardHeader>
            <CardTitle className="text-2xl text-destructive">Cadastrar Novo Local</CardTitle>
            <CardDescription>Preencha os dados para adicionar seu estabelecimento ao FervoFinder.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-destructive/90">Nome do Local</Label>
                <Input id="name" {...register('name')} placeholder="Ex: Balada FervoTop" className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}/>
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div>
                <Label htmlFor="address" className="text-destructive/90">Endereço Completo</Label>
                <div className="flex gap-2">
                  <Input id="address" {...register('address')} placeholder="Rua Exemplo, 123, Bairro, Cidade - UF" className={errors.address ? 'border-destructive focus-visible:ring-destructive' : ''}/>
                  <Button type="button" onClick={handleGeocode} disabled={isGeocoding || !addressValue} className="bg-destructive/80 hover:bg-destructive text-destructive-foreground shrink-0">
                    <MapPin className="w-4 h-4 mr-2"/> {isGeocoding ? 'Localizando...' : 'Localizar'}
                  </Button>
                </div>
                {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
              </div>
              
              <div>
                <Label htmlFor="type" className="text-destructive/90">Tipo de Local</Label>
                <Select onValueChange={(value) => setValue('type', value as VenueType)} defaultValue="">
                  <SelectTrigger id="type" className={errors.type ? 'border-destructive focus-visible:ring-destructive' : ''}>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {VENUE_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
              </div>

              <div>
                <Label htmlFor="description" className="text-destructive/90">Descrição Curta</Label>
                <Textarea id="description" {...register('description')} placeholder="Descreva seu local em poucas palavras..." className={errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}/>
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>

              <div>
                <Label htmlFor="imageUrl" className="text-destructive/90">URL da Imagem (Opcional)</Label>
                <Input id="imageUrl" {...register('imageUrl')} placeholder="https://exemplo.com/imagem.jpg" className={errors.imageUrl ? 'border-destructive focus-visible:ring-destructive' : ''}/>
                {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={isSubmitting || isGeocoding}>
                <Save className="w-4 h-4 mr-2" /> {isSubmitting ? 'Salvando...' : 'Salvar Local'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card className="border-destructive/70 shadow-lg shadow-destructive/20 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-2xl text-destructive">Pré-visualização no Mapa</CardTitle>
            <CardDescription>Veja como seu local aparecerá no mapa.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px] p-0 md:h-auto md:flex-grow">
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <GoogleMap
                defaultCenter={initialMapCenter}
                defaultZoom={venueLocation ? 17 : 12}
                mapId="partnerVenueMap"
                gestureHandling="greedy"
                disableDefaultUI={true}
                className="w-full h-full"
                options={{
                    styles: [ /* Same map styles as user map for consistency */
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
                <MapUpdater center={venueLocation || initialMapCenter} />
                {venueLocation && <Marker position={venueLocation} title={watch('name') || "Seu Local"} />}
              </GoogleMap>
            </APIProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
