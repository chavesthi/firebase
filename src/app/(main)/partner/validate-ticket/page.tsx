'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, firestore } from '@/lib/firebase';
import { ArrowLeft, Loader2, TicketCheck, AlertTriangle, CheckCircle, XCircle, Search } from 'lucide-react';

const validateTicketSchema = z.object({
  userRG: z.string().min(3, { message: 'RG deve ter pelo menos 3 caracteres.' }),
});

type ValidateTicketFormInputs = z.infer<typeof validateTicketSchema>;

interface FoundTicket {
  id: string; // ticket document id
  userId: string;
  userName: string;
  userRG: string;
  eventId: string;
  eventName: string;
  partnerId: string;
  partnerVenueName: string;
  purchasedAt: FirebaseTimestamp;
  status: 'active' | 'validated';
}

const PartnerValidateTicketPage: NextPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [foundTicket, setFoundTicket] = useState<FoundTicket | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [lastValidatedTicket, setLastValidatedTicket] = useState<{ name: string, event: string, time: string} | null>(null);


  const { control, handleSubmit, formState: { errors }, reset, getValues } = useForm<ValidateTicketFormInputs>({
    resolver: zodResolver(validateTicketSchema),
    defaultValues: {
      userRG: '',
    },
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        router.push('/login');
      }
      setIsLoadingUser(false);
    });
    return () => unsubscribeAuth();
  }, [router]);

  const onSearchSubmit: SubmitHandler<ValidateTicketFormInputs> = async (data) => {
    if (!currentUser) {
      toast({ title: "Erro", description: "Parceiro não autenticado.", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setFoundTicket(null);
    setSearchAttempted(true);
    setLastValidatedTicket(null);

    const rgToSearch = data.userRG.toUpperCase();

    try {
      const ticketsRef = collection(firestore, 'purchasedTickets');
      const q = query(
        ticketsRef,
        where('userRG', '==', rgToSearch),
        where('partnerId', '==', currentUser.uid),
        where('status', '==', 'active')
        // Potentially add orderBy('purchasedAt', 'asc') if multiple active tickets for same RG is possible and you want the oldest
      );

      const ticketSnapshot = await getDocs(q);

      if (ticketSnapshot.empty) {
        toast({ title: "Nenhum Ingresso Encontrado", description: "Nenhum ingresso ativo encontrado para este RG neste local.", variant: "default" });
        setFoundTicket(null);
      } else {
        // For simplicity, take the first one. Handle multiple if necessary.
        const ticketDoc = ticketSnapshot.docs[0];
        setFoundTicket({ id: ticketDoc.id, ...ticketDoc.data() } as FoundTicket);
      }
    } catch (error: any) {
      console.error("Error searching for ticket:", error);
      toast({ title: "Erro na Busca", description: error.message || "Não foi possível buscar o ingresso.", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleValidateTicket = async () => {
    if (!currentUser || !foundTicket) return;

    setIsValidating(true);
    try {
      const ticketDocRef = doc(firestore, 'purchasedTickets', foundTicket.id);
      await updateDoc(ticketDocRef, {
        status: 'validated',
        validatedAt: serverTimestamp(),
        validatedByPartnerId: currentUser.uid,
      });
      
      const validationTime = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      setLastValidatedTicket({
        name: foundTicket.userName,
        event: foundTicket.eventName,
        time: validationTime,
      });
      toast({
        title: "Ingresso Validado!",
        description: `Ingresso de ${foundTicket.userName} para "${foundTicket.eventName}" validado com sucesso.`,
        variant: "default",
        duration: 7000,
      });
      setFoundTicket(null); // Clear found ticket after validation
      reset(); // Reset form
      setSearchAttempted(false);

    } catch (error: any) {
      console.error("Error validating ticket:", error);
      toast({ title: "Erro ao Validar", description: error.message || "Não foi possível validar o ingresso.", variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoadingUser) {
    return (
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] mx-auto px-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.push('/partner/dashboard')} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Painel
        </Button>
      </div>

      <Card className="max-w-lg mx-auto border-primary/50 shadow-lg shadow-primary/15">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl text-primary flex items-center justify-center">
            <TicketCheck className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3" />
            Autenticação de Ingressos
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Insira o RG do usuário para buscar e validar o ingresso para um evento no seu local.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSearchSubmit)}>
          <CardContent className="space-y-6 px-4 sm:px-6">
            <div>
              <Label htmlFor="userRG" className="text-primary/90">RG do Usuário</Label>
              <div className="flex gap-2">
                <Controller
                  name="userRG"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="userRG"
                      placeholder="Digite o RG"
                      {...field}
                      value={field.value.toUpperCase()}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      className={errors.userRG ? 'border-destructive' : ''}
                      autoComplete="off"
                    />
                  )}
                />
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSearching}>
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="sr-only sm:not-sr-only sm:ml-2">Buscar</span>
                </Button>
              </div>
              {errors.userRG && <p className="mt-1 text-sm text-destructive">{errors.userRG.message}</p>}
            </div>
            
            {isSearching && (
                <div className="text-center py-4">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="text-muted-foreground mt-2">Buscando ingresso...</p>
                </div>
            )}

            {searchAttempted && !isSearching && !foundTicket && !lastValidatedTicket && (
                <Card className="p-4 bg-secondary/10 border-secondary/30">
                    <CardHeader className="p-0 mb-2">
                        <CardTitle className="text-md text-secondary flex items-center">
                            <XCircle className="w-5 h-5 mr-2"/> Nenhum Ingresso Encontrado
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <p className="text-sm text-muted-foreground">
                            Nenhum ingresso ativo encontrado para o RG "{getValues("userRG")}" neste local. Verifique o RG ou se o ingresso já foi validado.
                        </p>
                    </CardContent>
                </Card>
            )}

            {foundTicket && !isSearching && (
              <Card className="p-4 bg-primary/10 border-primary/30">
                <CardHeader className="p-0 mb-2">
                    <CardTitle className="text-md text-primary flex items-center">
                        <TicketCheck className="w-5 h-5 mr-2"/> Ingresso Encontrado!
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 p-0 text-sm">
                  <p><strong className="text-foreground/80">Usuário:</strong> {foundTicket.userName}</p>
                  <p><strong className="text-foreground/80">RG:</strong> {foundTicket.userRG}</p>
                  <p><strong className="text-foreground/80">Evento:</strong> {foundTicket.eventName}</p>
                  <p><strong className="text-foreground/80">Comprado em:</strong> {format(foundTicket.purchasedAt.toDate(), "dd/MM/yy HH:mm", { locale: ptBR })}</p>
                  <p><strong className="text-foreground/80">Status:</strong> <span className="text-green-500 font-semibold">ATIVO</span></p>
                </CardContent>
                <CardFooter className="p-0 pt-3">
                    <Button onClick={handleValidateTicket} className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={isValidating}>
                        {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        Validar Ingresso
                    </Button>
                </CardFooter>
              </Card>
            )}
            
            {lastValidatedTicket && (
                <Card className="p-4 bg-green-100 dark:bg-green-900/30 border-green-500">
                     <CardHeader className="p-0 mb-2">
                        <CardTitle className="text-md text-green-700 dark:text-green-400 flex items-center">
                            <CheckCircle className="w-5 h-5 mr-2"/> Ingresso Validado com Sucesso!
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 text-sm">
                        <p><strong className="text-foreground/80">Usuário:</strong> {lastValidatedTicket.name}</p>
                        <p><strong className="text-foreground/80">Evento:</strong> {lastValidatedTicket.event}</p>
                        <p><strong className="text-foreground/80">Validado em:</strong> {lastValidatedTicket.time}</p>
                    </CardContent>
                </Card>
            )}

             <div className="mt-6 p-3 bg-accent/10 border border-accent/30 rounded-md text-accent-foreground">
                <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 text-accent" />
                    <div>
                        <h4 className="font-semibold text-sm">Importante:</h4>
                        <p className="text-xs">
                            Ao validar, o ingresso será marcado como utilizado e não poderá ser validado novamente.
                            Certifique-se de que o usuário está presente e o RG corresponde.
                        </p>
                    </div>
                </div>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};

export default PartnerValidateTicketPage;
