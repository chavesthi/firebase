
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc as deleteFirestoreDoc } from 'firebase/firestore'; // Renamed to avoid conflict

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCircle, Save, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { VenueType, MusicStyle, VENUE_TYPE_OPTIONS, MUSIC_STYLE_OPTIONS } from '@/lib/constants';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const userProfileSchema = z.object({
  name: z.string().min(3, { message: 'O nome deve ter pelo menos 3 caracteres.' }),
  age: z.coerce
    .number({ invalid_type_error: 'Idade deve ser um número.' })
    .int({ message: 'Idade deve ser um número inteiro.' })
    .positive({ message: 'Idade deve ser um número positivo.' })
    .min(12, { message: 'Você deve ter pelo menos 12 anos.' })
    .max(120, { message: 'Idade inválida.' })
    .optional()
    .or(z.literal(undefined)),
  preferredVenueTypes: z.array(z.nativeEnum(VenueType))
    .max(4, { message: "Selecione no máximo 4 tipos de local." })
    .optional().default([]),
  preferredMusicStyles: z.array(z.nativeEnum(MusicStyle))
    .max(4, { message: "Selecione no máximo 4 estilos musicais." })
    .optional().default([]),
});

type UserProfileFormInputs = z.infer<typeof userProfileSchema>;

const UserProfilePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);


  const { control, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<UserProfileFormInputs>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      name: '',
      age: undefined,
      preferredVenueTypes: [],
      preferredMusicStyles: [],
    },
  });
  
  const watchedName = watch('name');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserEmail(user.email);
        const userDocRef = doc(firestore, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            reset({
              name: userData.name || user.displayName || '',
              age: userData.age || undefined,
              preferredVenueTypes: userData.preferredVenueTypes || [],
              preferredMusicStyles: userData.preferredMusicStyles || [],
            });
          } else {
            reset({ 
              name: user.displayName || '',
              age: undefined,
              preferredVenueTypes: [],
              preferredMusicStyles: [],
            });
            toast({ title: "Perfil Incompleto", description: "Alguns dados não foram carregados. Por favor, complete e salve seu perfil.", variant: "default" });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          toast({ title: "Erro ao Carregar Perfil", description: "Não foi possível buscar seus dados.", variant: "destructive" });
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, reset, toast]);

  const onSubmit: SubmitHandler<UserProfileFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }
     if (data.age === undefined) { 
        toast({ title: "Erro de Validação", description: "Idade é obrigatória.", variant: "destructive" });
        return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);
      await updateDoc(userDocRef, {
        name: data.name,
        age: data.age,
        preferredVenueTypes: data.preferredVenueTypes || [],
        preferredMusicStyles: data.preferredMusicStyles || [],
        questionnaireCompleted: !!data.age, 
      });

      toast({
        title: "Perfil Atualizado!",
        description: "Suas informações foram salvas com sucesso.",
        variant: "default",
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar suas alterações. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !currentUser.email) {
      toast({ title: "Erro", description: "Usuário não autenticado corretamente.", variant: "destructive" });
      return;
    }
    if (!deletePassword) {
      toast({ title: "Senha Necessária", description: "Por favor, insira sua senha para excluir a conta.", variant: "destructive" });
      return;
    }

    setIsDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Attempt to delete the main user document in Firestore.
      // Full data cleanup (subcollections, related data in other collections)
      // is best handled by a Firebase Cloud Function triggered on user deletion.
      const userDocRef = doc(firestore, "users", currentUser.uid);
      await deleteFirestoreDoc(userDocRef); 
      // console.log(`User document for ${currentUser.uid} deleted from Firestore.`);

      await deleteUser(currentUser);

      toast({ title: "Conta Excluída", description: "Sua conta e dados principais foram excluídos. Dados residuais como avaliações podem ser removidos por processos de backend.", variant: "default", duration: 7000 });
      router.push('/login'); 
      setShowDeleteDialog(false);
    } catch (error: any) {
      console.error("Error deleting account:", error);
      let message = "Erro ao excluir conta.";
      if (error.code === 'auth/wrong-password') {
        message = "Senha incorreta. Por favor, tente novamente.";
      } else if (error.code === 'auth/requires-recent-login') {
        message = "Esta operação é sensível e requer autenticação recente. Por favor, faça login novamente e tente excluir sua conta.";
      } else if (error.code === 'auth/network-request-failed') {
        message = "Falha de rede. Verifique sua conexão e tente novamente.";
      }
      toast({ title: "Falha ao Excluir Conta", description: message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeletePassword(''); 
    }
  };


  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="ml-4 text-xl text-primary">Carregando perfil...</p>
      </div>
    );
  }


  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary">Meu Perfil</CardTitle>
          <CardDescription className="text-sm sm:text-base">Gerencie suas informações e preferências.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-primary rounded-full flex items-center justify-center bg-muted">
                {watchedName ? (
                  <span className="text-2xl sm:text-3xl text-primary font-semibold">
                    {watchedName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-primary" />
                )}
              </div>
               <p className="text-xs sm:text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-primary/90">Nome</Label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input id="name" {...field} className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''} />
                )}
              />
              {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-primary/90">E-mail</Label>
              <Input id="email" type="email" value={userEmail || ''} disabled className="text-muted-foreground"/>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age" className="text-primary/90">Idade</Label>
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
                    value={value ?? ''}
                    onChange={e => {
                      const val = e.target.value;
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
              <Label className="text-primary/90">Tipos de Local Preferidos (Máx. 4)</Label>
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
                                  toast({ title: "Limite atingido", description: "Máximo de 4 tipos de local.", variant: "destructive", duration: 3000 });
                                  return false;
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
              <Label className="text-primary/90">Estilos Musicais Preferidos (Máx. 4)</Label>
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
                                toast({ title: "Limite atingido", description: "Máximo de 4 estilos musicais.", variant: "destructive", duration: 3000 });
                                return false;
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
             <Separator className="my-6 border-primary/20" />
            {/* Account Deletion Section */}
            <div className="space-y-2">
                <h3 className="text-lg font-medium text-destructive">Excluir Conta</h3>
                <p className="text-sm text-muted-foreground">
                    Esta ação é permanente e não pode ser desfeita. Todos os seus dados serão removidos.
                </p>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full sm:w-auto">
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir Minha Conta
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">Excluir Conta Permanentemente?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação é irreversível. Todos os seus dados, incluindo perfil, preferências, check-ins e cupons serão removidos.
                            Para continuar, por favor, insira sua senha.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-2 py-2">
                            <Label htmlFor="deletePassword">Senha</Label>
                            <div className="relative">
                                <Input
                                    id="deletePassword"
                                    type={showPasswordInput ? "text" : "password"}
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    placeholder="Sua senha atual"
                                    className={cn(deletePassword.length > 0 && deletePassword.length < 6 && 'border-yellow-500')}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowPasswordInput(!showPasswordInput)}
                                    aria-label={showPasswordInput ? "Esconder senha" : "Mostrar senha"}
                                >
                                    {showPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                                </Button>
                            </div>
                            {deletePassword.length > 0 && deletePassword.length < 6 && (
                                <p className="text-xs text-yellow-600">A senha deve ter pelo menos 6 caracteres.</p>
                            )}
                        </div>
                        <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setDeletePassword(''); setShowPasswordInput(false);}}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteAccount}
                            disabled={isDeleting || deletePassword.length < 6}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Confirmar Exclusão
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

          </CardContent>
          <CardFooter className="px-4 sm:px-6 pb-4 sm:pb-6">
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base" disabled={isSubmitting}>
               {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default UserProfilePage;

    