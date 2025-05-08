'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, updateEmail } from 'firebase/auth'; // Import updateEmail
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCircle, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { cn } from '@/lib/utils';

// Schema for partner settings form
const partnerSettingsSchema = z.object({
  contactName: z.string().min(3, { message: 'Nome do contato deve ter pelo menos 3 caracteres.' }),
  companyName: z.string().min(3, { message: 'Nome da empresa deve ter pelo menos 3 caracteres.' }),
  email: z.string().email({ message: 'E-mail inválido.' }),
  notificationsEnabled: z.boolean().default(true),
});

type PartnerSettingsFormInputs = z.infer<typeof partnerSettingsSchema>;

export default function PartnerSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialEmail, setInitialEmail] = useState<string | null>(null); // Store initial email for comparison

  const { control, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<PartnerSettingsFormInputs>({
    resolver: zodResolver(partnerSettingsSchema),
    defaultValues: {
      contactName: '',
      companyName: '',
      email: '',
      notificationsEnabled: true,
    },
  });

  const watchedName = watch('contactName');

  // Fetch current user and settings
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setInitialEmail(user.email); // Store initial email from auth object
        const userDocRef = doc(firestore, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            reset({
              contactName: userData.name || user.displayName || '', // Use 'name' field from Firestore
              companyName: userData.venueName || '', // Use venueName for company name? Adjust if different field
              email: user.email || '', // Primarily use auth email, fallback to Firestore if needed
              notificationsEnabled: userData.notificationsEnabled ?? true, // Use ?? for default
            });
          } else {
            // Handle case where Firestore doc might be missing unexpectedly
            reset({
              contactName: user.displayName || '',
              companyName: '', // No venue name if doc is missing
              email: user.email || '',
              notificationsEnabled: true,
            });
             toast({ title: "Perfil Incompleto", description: "Dados não encontrados. Preencha e salve para criar.", variant: "destructive" });
          }
        } catch (error) {
          console.error("Error fetching partner data:", error);
          toast({ title: "Erro ao Carregar Dados", description: "Não foi possível buscar suas configurações.", variant: "destructive" });
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribeAuth();
  }, [router, reset, toast]);

  // Handle form submission
  const onSubmit: SubmitHandler<PartnerSettingsFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      return;
    }

    try {
      const userDocRef = doc(firestore, "users", currentUser.uid);

      // Update Firestore document
      await updateDoc(userDocRef, {
        name: data.contactName, // Update 'name' field in Firestore
        venueName: data.companyName, // Assuming venueName holds the company name
        notificationsEnabled: data.notificationsEnabled,
        settingsUpdatedAt: serverTimestamp(), // Track when settings were last updated
      });

      // Update auth email ONLY if it changed and user confirms
      if (data.email !== initialEmail) {
        if (window.confirm(`Deseja realmente alterar seu e-mail de login de ${initialEmail} para ${data.email}? Esta ação pode exigir reverificação.`)) {
          try {
            await updateEmail(currentUser, data.email);
            setInitialEmail(data.email); // Update initialEmail after successful change
            toast({ title: "E-mail Atualizado", description: "Seu e-mail de login foi alterado. Pode ser necessário fazer login novamente.", variant: "default" });
            // Potentially force re-authentication here if needed
          } catch (authError: any) {
            console.error("Error updating auth email:", authError);
            let authErrorMessage = "Não foi possível atualizar o e-mail de login. Verifique a senha ou tente novamente.";
            if (authError.code === 'auth/requires-recent-login') {
              authErrorMessage = "Esta operação requer login recente. Por favor, faça login novamente e tente atualizar o e-mail.";
              // Consider redirecting to login here
            } else if (authError.code === 'auth/email-already-in-use') {
              authErrorMessage = "Este e-mail já está em uso por outra conta.";
            }
            toast({ title: "Erro ao Atualizar E-mail", description: authErrorMessage, variant: "destructive", duration: 7000 });
            // Revert email in the form if auth update fails
            reset({ ...data, email: initialEmail || '' });
             // Skip the success toast below if email update failed
             return;
          }
        } else {
           // User cancelled email change, revert in form
           reset({ ...data, email: initialEmail || '' });
           toast({ title: "Alteração de E-mail Cancelada", description: "Seu e-mail de login não foi alterado.", variant: "default" });
        }
      }

      toast({
        title: "Configurações Salvas!",
        description: "Suas informações foram atualizadas com sucesso.",
        variant: "default", // Use default (blue) for partner success
      });

    } catch (error) {
      console.error("Error updating partner settings:", error);
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar suas alterações. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-destructive animate-spin" />
        <p className="ml-4 text-lg text-destructive">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
        <div className="flex items-center justify-between mb-4 sm:mb-6 max-w-2xl mx-auto">
            <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm">
                <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
                Painel
            </Button>
        </div>
      <Card className="max-w-2xl mx-auto border-destructive/70 shadow-lg shadow-destructive/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-destructive">Configurações da Conta</CardTitle>
          <CardDescription className="text-sm sm:text-base">Gerencie as informações e preferências da sua conta de parceiro.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-destructive rounded-full flex items-center justify-center bg-muted">
                {watchedName ? (
                  <span className="text-2xl sm:text-3xl text-destructive font-semibold">
                    {watchedName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-destructive" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName" className="text-destructive/90">Nome do Contato</Label>
               <Controller
                name="contactName"
                control={control}
                render={({ field }) => (
                  <Input id="contactName" {...field} className={cn(errors.contactName && 'border-red-500 focus-visible:ring-red-500')} />
                )}
              />
              {errors.contactName && <p className="mt-1 text-sm text-destructive">{errors.contactName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-destructive/90">Nome da Empresa/Estabelecimento</Label>
               <Controller
                name="companyName"
                control={control}
                render={({ field }) => (
                  <Input id="companyName" {...field} className={cn(errors.companyName && 'border-red-500 focus-visible:ring-red-500')} />
                )}
              />
               {errors.companyName && <p className="mt-1 text-sm text-destructive">{errors.companyName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-destructive/90">E-mail de Login</Label>
               <Controller
                name="email"
                control={control}
                render={({ field }) => (
                   <Input id="email" type="email" {...field} className={cn(errors.email && 'border-red-500 focus-visible:ring-red-500')} />
                )}
              />
              {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email.message}</p>}
               <p className="mt-1 text-xs text-muted-foreground">Alterar este e-mail muda seu acesso. Pode ser necessário reverificar.</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Label htmlFor="notificationsEnabled" className="text-destructive/90 text-sm sm:text-base">Receber Notificações por E-mail</Label>
               <Controller
                  name="notificationsEnabled"
                  control={control}
                  render={({ field }) => (
                     <Switch
                      id="notificationsEnabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="data-[state=checked]:bg-destructive data-[state=unchecked]:bg-input"
                    />
                  )}
                />
            </div>
            {errors.notificationsEnabled && <p className="mt-1 text-sm text-destructive">{errors.notificationsEnabled.message}</p>}


            <Button type="submit" className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm sm:text-base" disabled={isSubmitting}>
               {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}