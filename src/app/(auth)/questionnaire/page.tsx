
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/shared/logo';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { VenueType, MusicStyle, VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';

const questionnaireSchema = z.object({
  age: z.coerce
    .number({ invalid_type_error: 'Idade deve ser um número.' })
    .int({ message: 'Idade deve ser um número inteiro.' })
    .positive({ message: 'Idade deve ser um número positivo.' })
    .min(12, { message: 'Você deve ter pelo menos 12 anos.' })
    .max(120, { message: 'Idade inválida.' })
    .optional() // Allow undefined to clear errors when input is empty
    .or(z.literal(undefined)), // Explicitly allow undefined for initial state
  preferredVenueTypes: z.array(z.nativeEnum(VenueType))
    .max(4, { message: "Selecione no máximo 4 tipos de local." })
    .optional().default([]),
  preferredMusicStyles: z.array(z.nativeEnum(MusicStyle))
    .max(4, { message: "Selecione no máximo 4 estilos musicais." })
    .optional().default([]),
});

type QuestionnaireFormInputs = z.infer<typeof questionnaireSchema>;

const QuestionnairePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const { control, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<QuestionnaireFormInputs>({
    resolver: zodResolver(questionnaireSchema),
    defaultValues: {
      age: undefined,
      preferredVenueTypes: [],
      preferredMusicStyles: [],
    },
  });

  const watchedVenueTypes = watch('preferredVenueTypes');
  const watchedMusicStyles = watch('preferredMusicStyles');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const onSubmit: SubmitHandler<QuestionnaireFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }
    if (data.age === undefined) { // Ensure age is provided if schema doesn't make it optional for submission
        toast({ title: "Erro", description: "Idade é obrigatória.", variant: "destructive" });
        return;
    }


    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);
      await updateDoc(userDocRef, {
        age: data.age,
        preferredVenueTypes: data.preferredVenueTypes || [],
        preferredMusicStyles: data.preferredMusicStyles || [],
        questionnaireCompleted: true,
      });

      toast({
        title: "Preferências Salvas!",
        description: "Seu perfil foi atualizado com sucesso.",
        variant: "default",
      });
      router.push('/map');
    } catch (error) {
      console.error("Error saving questionnaire:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar suas preferências. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <p className="text-foreground">Carregando...</p>
      </div>
    );
  }

  if (!currentUser) {
     // Should be handled by the effect, but as a fallback
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <p className="text-foreground">Redirecionando para login...</p>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-2 sm:p-4 bg-background">
      <div className="absolute top-4 sm:top-8 left-4 sm:left-8">
        <Logo />
      </div>
      <Card className="w-full max-w-lg p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-secondary/50">
        <Card className="w-full bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center px-4 sm:px-6">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Conte-nos mais sobre você!
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base">
              Suas preferências nos ajudarão a recomendar os melhores fervos.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6 px-4 sm:px-6">
              <div>
                <Label htmlFor="age" className="text-primary/90">Qual sua idade?</Label>
                <Controller
                  name="age"
                  control={control}
                  render={({ field: { onChange, onBlur, value, name, ref } }) => (
                    <Input
                      id="age"
                      type="number"
                      placeholder="Sua idade"
                      name={name}
                      ref={ref}
                      value={value ?? ''} // Ensures value is never undefined for the input element
                      onChange={e => {
                        const val = e.target.value;
                        // Pass undefined to RHF if empty, otherwise parse to int
                        onChange(val === '' ? undefined : parseInt(val, 10));
                      }}
                      onBlur={onBlur}
                      className={errors.age ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                  )}
                />
                {errors.age && <p className="mt-1 text-sm text-destructive">{errors.age.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-primary/90">Quais locais você mais gosta? (Máx. 4)</Label>
                <ScrollArea className="h-32 sm:h-40 p-2 border rounded-md border-input">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {VENUE_TYPE_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Controller
                          name="preferredVenueTypes"
                          control={control}
                          render={({ field }) => (
                            <Checkbox
                              id={`venue-${option.value}`}
                              checked={field.value?.includes(option.value)}
                              onCheckedChange={(checked) => {
                                const currentSelection = field.value || [];
                                if (checked) {
                                  if (currentSelection.length < 4) {
                                    field.onChange([...currentSelection, option.value]);
                                  } else {
                                    toast({ title: "Limite atingido", description: "Você pode selecionar no máximo 4 tipos de local.", variant: "destructive", duration: 3000 });
                                    return false; // Prevent checking
                                  }
                                } else {
                                  field.onChange(currentSelection.filter((value) => value !== option.value));
                                }
                                return checked;
                              }}
                              disabled={!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4}
                            />
                          )}
                        />
                        <Label htmlFor={`venue-${option.value}`} className="font-normal text-foreground/80 text-xs sm:text-sm">{option.label}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {errors.preferredVenueTypes && <p className="mt-1 text-sm text-destructive">{errors.preferredVenueTypes.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label className="text-primary/90">Quais estilos musicais você curte? (Máx. 4)</Label>
                <ScrollArea className="h-32 sm:h-40 p-2 border rounded-md border-input">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MUSIC_STYLE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Controller
                        name="preferredMusicStyles"
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
                                  toast({ title: "Limite atingido", description: "Você pode selecionar no máximo 4 estilos musicais.", variant: "destructive", duration: 3000 });
                                  return false; // Prevent checking
                                }
                              } else {
                                field.onChange(currentSelection.filter((value) => value !== option.value));
                              }
                              return checked;
                            }}
                            disabled={!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4}
                          />
                        )}
                      />
                      <Label htmlFor={`music-${option.value}`} className="font-normal text-foreground/80 text-xs sm:text-sm">{option.label}</Label>
                    </div>
                  ))}
                  </div>
                </ScrollArea>
                {errors.preferredMusicStyles && <p className="mt-1 text-sm text-destructive">{errors.preferredMusicStyles.message}</p>}
              </div>

            </CardContent>
            <CardFooter className="px-4 sm:px-6 pb-4 sm:pb-6">
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar e Continuar'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </Card>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px hsl(var(--primary)), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px hsl(var(--secondary)), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
      `}</style>
    </main>
  );
};

export default QuestionnairePage;
