
'use client';

import type { NextPage } from 'next';
import { useEffect, useState, useRef } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc as deleteFirestoreDoc, serverTimestamp, collection, where, query, getDocs, writeBatch, collectionGroup } from 'firebase/firestore';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"; // Renamed storageRef to storageRefStandard
import Image from 'next/image';
import AvatarEditor from 'react-avatar-editor';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCircle, Save, Loader2, Trash2, Eye, EyeOff, UploadCloud, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore, storage } from '@/lib/firebase';
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
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';


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
  city: z.string().min(2, { message: "Nome da cidade inválido." }).optional().or(z.literal(undefined).or(z.literal(''))),
  state: z.string().min(2, { message: "Nome do estado inválido." }).optional().or(z.literal(undefined).or(z.literal(''))),
}).refine(data => {
  if ((data.city && !data.state) || (!data.city && data.state)) {
    return false;
  }
  return true;
}, {
  message: "Para usar o chat, Cidade e Estado devem ser preenchidos juntos ou ambos vazios.",
  path: ["city"],
});


type UserProfileFormInputs = z.infer<typeof userProfileSchema>;

function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: blob.type, lastModified: Date.now() });
}

const UserProfilePage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPhotoURL, setCurrentPhotoURL] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorScale, setEditorScale] = useState(1.2);
  const [editorRotation, setEditorRotation] = useState(0);
  const editorRef = useRef<AvatarEditor | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const { control, handleSubmit, formState: { errors, isSubmitting: isFormSubmitting }, reset, watch } = useForm<UserProfileFormInputs>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      name: '',
      age: undefined,
      preferredVenueTypes: [],
      preferredMusicStyles: [],
      city: undefined,
      state: undefined,
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
              city: userData.address?.city || undefined,
              state: userData.address?.state || undefined,
            });
            setCurrentPhotoURL(userData.photoURL || user.photoURL || null);
          } else {
             // If Firestore doc doesn't exist but user is authenticated (e.g., new Google sign-in)
            reset({
              name: user.displayName || '',
              age: undefined,
              preferredVenueTypes: [],
              preferredMusicStyles: [],
              city: undefined,
              state: undefined,
            });
            setCurrentPhotoURL(user.photoURL || null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          toast({ title: "Erro ao carregar perfil", description: "Não foi possível buscar seus dados.", variant: "destructive" });
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

  const onSubmit: SubmitHandler<UserProfileFormInputs> = async (data) => {
    if (!currentUser) return;

    let finalPhotoURL = currentPhotoURL;
    setIsUploading(true); // Set uploading to true at the beginning of the submit process

    console.log("Profile save initiated. Initial photoURL:", currentPhotoURL);

    if (editorFile && editorRef.current) {
      console.log("Editor file selected, starting crop and upload process.");
      setUploadProgress(0);

      const canvas = editorRef.current.getImageScaledToCanvas();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, editorFile.type, 0.90));

      if (!blob) {
        toast({ title: "Erro ao Processar Imagem", description: "Não foi possível obter a imagem recortada.", variant: "destructive" });
        setIsUploading(false);
        return;
      }
      
      const croppedImageFile = blobToFile(blob, editorFile.name);
      const imagePath = `fotosperfilusuario/${currentUser.uid}/${Date.now()}_${croppedImageFile.name}`;
      const imageStorageRef = storageRefStandard(storage, imagePath); // Use storageRefStandard
      console.log("Attempting to upload to path:", imagePath, "with file:", croppedImageFile);
      const uploadTask = uploadBytesResumable(imageStorageRef, croppedImageFile);

      try {
        // Delete old photo if it exists and is different and from Firebase Storage
        if (currentPhotoURL && currentPhotoURL.includes("firebasestorage.googleapis.com")) {
            console.log("Attempting to delete old profile picture:", currentPhotoURL);
            const oldImageRefTry = storageRefStandard(storage, currentPhotoURL); // Use storageRefStandard
            try {
                await deleteObject(oldImageRefTry);
                console.log("Old profile picture deleted successfully.");
            } catch (deleteError: any) {
                if (deleteError.code !== 'storage/object-not-found') {
                    console.warn("Could not delete old profile picture from storage:", deleteError);
                } else {
                    console.log("Old profile picture not found in storage, no deletion needed.");
                }
            }
        }
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              console.log('Upload is ' + progress + '% done');
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Firebase Storage Upload Error:", error);
              reject(error);
            },
            async () => {
              console.log("Upload successful, getting download URL.");
              finalPhotoURL = await getDownloadURL(uploadTask.snapshot.ref);
              console.log("New photo URL:", finalPhotoURL);
              resolve();
            }
          );
        });
      } catch (error: any) {
        toast({ title: "Falha no Upload", description: error.message || "Não foi possível enviar a imagem.", variant: "destructive" });
        setIsUploading(false);
        return; 
      }
    } else {
         console.log("No new editor file, keeping current photoURL:", currentPhotoURL);
    }

    setIsUploading(false);

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);
      const dataToUpdate: any = {
        name: data.name,
        age: data.age,
        preferredVenueTypes: data.preferredVenueTypes || [],
        preferredMusicStyles: data.preferredMusicStyles || [],
        questionnaireCompleted: !!data.age, // Mark as completed if age is provided (core requirement)
        photoURL: finalPhotoURL, // This will be the new URL or the existing one
        updatedAt: serverTimestamp(),
      };

      if (data.city && data.state) {
        dataToUpdate.address = { city: data.city, state: data.state };
      } else {
        // If user clears city/state, ensure address field is removed or nulled
        // Check if address exists before trying to nullify to avoid unnecessary writes
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().address) {
             dataToUpdate.address = null; // Or firebase.firestore.FieldValue.delete()
        }
      }
      console.log("Data to update in Firestore:", dataToUpdate);
      await updateDoc(userDocRef, dataToUpdate);

      setCurrentPhotoURL(finalPhotoURL); // Update local state for immediate UI reflection
      setEditorFile(null); // Clear the editor file

      toast({
        title: "Perfil Atualizado!",
        description: "Suas informações foram salvas com sucesso.",
        variant: "default",
      });
    } catch (error) {
      console.error("Error updating user profile in Firestore:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar suas alterações no perfil. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || !currentUser.email) {
      toast({ title: "Erro", description: "Usuário não autenticado ou e-mail não disponível.", variant: "destructive" });
      return;
    }
    if (!deletePassword) {
      toast({ title: "Senha Necessária", description: "Insira sua senha para excluir a conta.", variant: "destructive" });
      return;
    }

    setIsDeleting(true);
    console.log("Iniciando exclusão de conta para:", currentUser.uid);

    try {
      console.log("Tentando reautenticar...");
      const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
      await reauthenticateWithCredential(currentUser, credential);
      console.log("Reautenticação bem-sucedida.");

      const userIdToDelete = currentUser.uid;
      const batch = writeBatch(firestore);

      // 1. Delete profile picture from Storage
      if (currentPhotoURL && currentPhotoURL.includes("firebasestorage.googleapis.com")) {
        console.log("Tentando excluir foto do Storage:", currentPhotoURL);
        try {
          const photoRef = storageRefStandard(storage, currentPhotoURL); // Use storageRefStandard
          await deleteObject(photoRef);
          console.log("Foto do Storage excluída.");
        } catch (storageError: any) {
          // Log error but continue with deletion, as user might not have a photo or it might already be deleted
          console.warn("Não foi possível excluir a foto do Storage (pode não existir):", storageError);
        }
      }

      // 2. Delete user's document from 'users' collection
      const userDocRef = doc(firestore, "users", userIdToDelete);
      console.log("Marcando documento do usuário para exclusão:", userDocRef.path);
      batch.delete(userDocRef);

      // 3. Delete user's 'checkedInEvents' subcollection
      const checkedInEventsRef = collection(firestore, `users/${userIdToDelete}/checkedInEvents`);
      const checkedInEventsSnap = await getDocs(checkedInEventsRef);
      console.log(`Encontrados ${checkedInEventsSnap.size} documentos em checkedInEvents para excluir.`);
      checkedInEventsSnap.forEach(docSnap => batch.delete(docSnap.ref));

      // 4. Delete user's 'coupons' subcollection
      const couponsRef = collection(firestore, `users/${userIdToDelete}/coupons`);
      const couponsSnap = await getDocs(couponsRef);
      console.log(`Encontrados ${couponsSnap.size} cupons para excluir.`);
      couponsSnap.forEach(docSnap => batch.delete(docSnap.ref));

      // 5. Delete user's ratings from 'eventRatings' collectionGroup
      const ratingsQuery = query(collectionGroup(firestore, 'eventRatings'), where('userId', '==', userIdToDelete));
      const ratingsSnapshot = await getDocs(ratingsQuery);
      console.log(`Encontradas ${ratingsSnapshot.size} avaliações de eventos para excluir.`);
      ratingsSnapshot.forEach(ratingDoc => batch.delete(ratingDoc.ref));

      console.log("Executando batch do Firestore...");
      await batch.commit();
      console.log("Batch do Firestore executado com sucesso.");

      // 6. Delete Firebase Authentication user
      console.log("Tentando excluir usuário do Firebase Auth...");
      await deleteUser(currentUser);
      console.log("Usuário do Firebase Auth excluído.");

      toast({ title: "Conta Excluída", description: "Sua conta e todos os seus dados foram removidos.", variant: "default", duration: 7000 });
      router.push('/login');
      setShowDeleteDialog(false); // Ensure dialog closes on success

    } catch (error: any) {
      console.error("Erro ao excluir conta:", error);
      let message = "Erro ao excluir conta. Tente novamente.";
      if (error.code === 'auth/wrong-password') {
        message = "Senha incorreta. Por favor, tente novamente.";
      } else if (error.code === 'auth/requires-recent-login') {
        message = "Esta operação é sensível e requer autenticação recente. Por favor, faça login novamente e tente excluir sua conta.";
      }
      toast({ title: "Falha ao Excluir Conta", description: message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeletePassword('');
      // Only close dialog if it's still meant to be open (i.e. not closed by success path)
      // setShowDeleteDialog(false); // This might close it prematurely if an error occurred but user wants to retry password
    }
  };

  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary">Meu Perfil</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center space-y-3">
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
                  <Image src={currentPhotoURL} alt={watchedName || "Foto de Perfil"} width={160} height={160} className="rounded-full object-cover w-full h-full" data-ai-hint="profile picture" />
                ) : (
                  <UserCircle className="w-full h-full text-primary/40" data-ai-hint="avatar placeholder" />
                )}
              </div>

              {!editorFile && (
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isFormSubmitting || isDeleting}>
                  <UploadCloud className="w-4 h-4 mr-2" /> {currentPhotoURL ? "Alterar Foto" : "Enviar Foto"}
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
                    Cancelar Corte
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

            <div className="space-y-2">
              <Label htmlFor="name" className="text-primary/90">Nome</Label>
              <Controller name="name" control={control} render={({ field }) => <Input id="name" {...field} className={errors.name ? 'border-destructive' : ''} />} />
              {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-primary/90">E-mail</Label>
              <Input id="email" type="email" value={userEmail || ''} disabled className="text-muted-foreground"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="age" className="text-primary/90">Idade (para filtro de conteúdo)</Label>
              <Controller name="age" control={control} render={({ field: { onChange, onBlur, value, name, ref } }) => <Input id="age" type="number" placeholder="Sua idade" name={name} ref={ref} value={value ?? ''} onChange={e => { const val = e.target.value; onChange(val === '' ? undefined : parseInt(val, 10));}} onBlur={onBlur} className={errors.age ? 'border-destructive' : ''} />} />
              {errors.age && <p className="mt-1 text-sm text-destructive">{errors.age.message}</p>}
            </div>

            <Separator className="my-4 border-primary/20" />
            <h3 className="text-lg font-medium text-primary/90">Localização para o Chat</h3>
            <p className="text-xs text-muted-foreground -mt-1 mb-3">Preencha para participar do Fervo Chat da sua região.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="city" className="text-primary/90">Cidade</Label>
                    <Controller name="city" control={control} render={({ field }) => <Input id="city" placeholder="Sua cidade" {...field} value={field.value ?? ''} className={errors.city ? 'border-destructive' : ''} />} />
                    {errors.city && <p className="mt-1 text-sm text-destructive">{errors.city.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="state" className="text-primary/90">Estado</Label>
                    <Controller name="state" control={control} render={({ field }) => <Input id="state" placeholder="Seu estado (UF)" {...field} value={field.value ?? ''} className={errors.state ? 'border-destructive' : ''} />} />
                    {errors.state && <p className="mt-1 text-sm text-destructive">{errors.state.message}</p>}
                </div>
            </div>
             {errors.root?.message && <p className="mt-1 text-sm text-destructive">{errors.root.message}</p>}


            <Separator className="my-4 border-primary/20" />
             <h3 className="text-lg font-medium text-primary/90">Preferências de Fervo</h3>

            <div className="space-y-2">
              <Label className="text-primary/90">Tipos de Local Preferidos (Máx. 4)</Label>
              <ScrollArea className="h-32 p-2 border rounded-md border-input"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{VENUE_TYPE_OPTIONS.map((option) => (<div key={option.value} className="flex items-center space-x-2"><Controller name="preferredVenueTypes" control={control} render={({ field }) => (<Checkbox id={`venue-${option.value}`} checked={field.value?.includes(option.value)} onCheckedChange={(checked) => {const currentSelection = field.value || []; if (checked) {if (currentSelection.length < 4) {field.onChange([...currentSelection, option.value]);} else {toast({ title: "Limite atingido", description:"Máximo 4 tipos de local.", variant: "destructive", duration: 3000 }); return false;}} else {field.onChange(currentSelection.filter((value) => value !== option.value));} return checked;}} disabled={!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4} />)} /><Label htmlFor={`venue-${option.value}`} className="font-normal text-foreground/80 text-xs">{option.label}</Label></div>))}</div></ScrollArea>
              {errors.preferredVenueTypes && <p className="mt-1 text-sm text-destructive">{errors.preferredVenueTypes.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-primary/90">Estilos Musicais Preferidos (Máx. 4)</Label>
              <ScrollArea className="h-32 p-2 border rounded-md border-input"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{MUSIC_STYLE_OPTIONS.map((option) => (<div key={option.value} className="flex items-center space-x-2"><Controller name="preferredMusicStyles" control={control} render={({ field }) => (<Checkbox id={`music-${option.value}`} checked={field.value?.includes(option.value)} onCheckedChange={(checked) => {const currentSelection = field.value || []; if (checked) {if (currentSelection.length < 4) {field.onChange([...currentSelection, option.value]);} else {toast({ title: "Limite atingido", description:"Máximo 4 estilos musicais.", variant: "destructive", duration: 3000 }); return false;}} else {field.onChange(currentSelection.filter((value) => value !== option.value));} return checked;}} disabled={!field.value?.includes(option.value) && (field.value?.length ?? 0) >= 4} />)} /><Label htmlFor={`music-${option.value}`} className="font-normal text-foreground/80 text-xs">{option.label}</Label></div>))}</div></ScrollArea>
              {errors.preferredMusicStyles && <p className="mt-1 text-sm text-destructive">{errors.preferredMusicStyles.message}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 p-4 sm:p-6">
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isFormSubmitting || isUploading || isDeleting}>
              {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando Imagem...</> : (isFormSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>)}
            </Button>
            <Separator className="my-2 border-primary/20" />
            <div className="w-full space-y-2">
                <h3 className="text-md font-medium text-destructive text-center">Excluir Minha Conta</h3>
                <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setDeletePassword(''); setShowPasswordInput(false); } setShowDeleteDialog(open); }}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full" disabled={isDeleting || isFormSubmitting || isUploading}>
                            <Trash2 className="w-4 h-4 mr-2" /> Excluir Minha Conta
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-destructive">Excluir Conta Permanentemente?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação é irreversível. Todos os seus dados (perfil, moedas, cupons, favoritos, check-ins, avaliações) serão removidos. Para continuar, insira sua senha.</AlertDialogDescription>
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
                                >
                                    {showPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                                </Button>
                            </div>
                            {deletePassword.length > 0 && deletePassword.length < 6 && (
                                <p className="text-xs text-yellow-600">A senha deve ter pelo menos 6 caracteres.</p>
                            )}
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => { setDeletePassword(''); setShowPasswordInput(false); setShowDeleteDialog(false);}}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleting || deletePassword.length < 6} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Confirmar Exclusão
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default UserProfilePage;

