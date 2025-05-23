
'use client';

import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, HelpCircle, Loader2 } from 'lucide-react';
import { auth, firestore } from '@/lib/firebase';
import { UserRole } from '@/lib/constants';

interface FAQ {
  question: string;
  answer: string;
}

interface FAQCategory {
  categoryName: string;
  questions: FAQ[];
}

const userFaqData: FAQCategory[] = [
  {
    categoryName: "Para Usuários",
    questions: [
      {
        question: "Como faço para encontrar eventos?",
        answer: "Navegue pelo mapa! Use os filtros de tipo de local e estilo musical para refinar sua busca. Clique em um local para ver os eventos agendados.",
      },
      {
        question: "Como funcionam as FervoCoins?",
        answer: "Você ganha FervoCoins ao compartilhar eventos de locais específicos. Cada 10 compartilhamentos de eventos de um mesmo local podem gerar um cupom para você usar nesse local. Você ganha 2 moedas por compartilhamento.",
      },
      {
        question: "Como uso um cupom?",
        answer: "Vá para \"Meus Cupons\" no seu perfil. Apresente o código do cupom no estabelecimento parceiro para resgate.",
      },
      {
        question: "Como faço check-in em um evento?",
        answer: "No menu principal (na barra de navegação superior), clique no ícone de QR Code (ScanLine) e escaneie o código fornecido pelo local do evento. Após o check-in, você poderá avaliar o evento.",
      },
      {
        question: "Como avalio um evento?",
        answer: "Após fazer check-in em um evento, a opção de avaliação (estrelas e comentário) aparecerá nos detalhes do evento, dentro da janela de informações do local no mapa.",
      },
      {
        question: "Como favorito um local?",
        answer: "Ao visualizar os detalhes de um local no mapa, clique no ícone de coração. Você pode gerenciar seus favoritos e as notificações para eles em \"Meus Fervos Favoritos\" no seu perfil.",
      },
      {
        question: "Como funciona o Fervo Chat?",
        answer: "O Fervo Chat conecta você com outros usuários que estão na mesma cidade e estado que você (conforme definido no seu perfil). Abra o chat pelo botão flutuante \"Fervo Chat\" na página do mapa.",
      },
      {
        question: "Como altero minhas preferências ou localização para o chat?",
        answer: "Acesse \"Meu Perfil\" no menu do usuário. Lá você pode atualizar sua idade, preferências de locais, estilos musicais, cidade e estado.",
      },
    ],
  }
];

const partnerFaqData: FAQCategory[] = [
   {
    categoryName: "Para Parceiros",
    questions: [
      {
        question: "Como cadastro meu local?",
        answer: "Após criar sua conta como parceiro, você será direcionado para um questionário onde poderá fornecer todos os detalhes do seu estabelecimento, incluindo nome, tipo, endereço, estilos musicais, contatos e foto de perfil do local.",
      },
      {
        question: "Como crio e gerencio eventos?",
        answer: "No seu painel de parceiro, acesse a seção 'Gerenciar Eventos'. Lá você pode adicionar novos eventos, editar existentes, definir visibilidade, preços e mais. Lembre-se que você tem um limite de 5 eventos visíveis simultaneamente e que a criação de novos eventos pode ser bloqueada se seu período de teste expirar e você não tiver uma assinatura ativa.",
      },
      {
        question: "Como funciona o QR Code para check-in?",
        answer: "Para cada evento, você pode gerar um QR Code único na seção 'Gerenciar Eventos'. Os usuários escaneiam este código com o app Fervo para fazer check-in, o que os habilita a avaliar o evento posteriormente.",
      },
      {
        question: "Como vejo as avaliações e comentários dos meus eventos?",
        answer: "No seu painel, vá para 'Avaliações e Comentários'. Você poderá ver as notas e os comentários deixados pelos usuários para cada um dos seus eventos. Além disso, pode usar a ferramenta de 'Análise de Feedback (IA)' para obter insights e sugestões de melhoria.",
      },
      {
        question: "Como funciona a \"Análise de Feedback (IA)\" e como posso usá-la?",
        answer: "A ferramenta de Análise de Feedback com IA processa todas as avaliações (notas e comentários) que seus eventos receberam. Ela gera um relatório conciso que inclui: resumo geral do sentimento dos usuários, os principais aspectos positivos mencionados, os principais aspectos negativos ou reclamações, e sugestões acionáveis para você melhorar seu local. Para usar, vá ao seu Painel de Parceiro, encontre o card \"Análise de Feedback (IA)\" e clique no botão \"Analisar Feedback com IA\". Isso pode levar alguns instantes para processar, especialmente se houver muitos comentários.",
      },
      {
        question: "Como funciona o sistema de cupons?",
        answer: "Quando usuários compartilham seus eventos (se a opção de recompensa estiver ativa), eles ganham FervoCoins específicas para o seu local. Ao acumularem 20 FervoCoins do seu estabelecimento, eles recebem um cupom. Vá para 'Resgatar Cupom' no seu painel para validar os cupons apresentados pelos usuários.",
      },
      {
        question: "Como gerencio minha assinatura do Fervo App?",
        answer: "Acesse 'Configurações da Conta e Pagamentos' no seu painel. Lá você poderá ver o status da sua assinatura e, se necessário, gerenciá-la.",
      },
      {
        question: "Posso editar as informações do meu local após o cadastro?",
        answer: "Sim, você pode editar a maioria das informações do seu local (como nome, contatos, foto, estilos musicais, tipo de local) a qualquer momento através do questionário de parceiro acessível pelas 'Configurações do Local'. Algumas informações mais sensíveis, como o endereço principal após a primeira configuração, podem ter restrições.",
      },
    ],
  }
];

const HelpPage: NextPage = () => {
  const router = useRouter();
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(firestore, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setCurrentUserRole(userDocSnap.data().role as UserRole);
          } else {
            setCurrentUserRole(UserRole.USER); // Default to user if doc not found
          }
        } catch (error) {
          console.error("Error fetching user role for help page:", error);
          setCurrentUserRole(UserRole.USER); // Default on error
        }
      } else {
        // Not logged in, default to user FAQs or handle as guest
        setCurrentUserRole(UserRole.USER);
      }
      setIsLoadingRole(false);
    });
    return () => unsubscribeAuth();
  }, []);

  const displayedFaqData = currentUserRole === UserRole.PARTNER ? partnerFaqData : userFaqData;

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Button variant="outline" onClick={() => router.back()} className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
          Voltar
        </Button>
      </div>

      <Card className="max-w-3xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary flex items-center justify-center">
            <HelpCircle className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3" />
            Central de Ajuda
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Encontre respostas para as perguntas mais frequentes sobre o Fervo App.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {isLoadingRole ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="ml-2 text-muted-foreground">Carregando ajuda...</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-4">
              {displayedFaqData.map((categoryItem, index) => (
                <div key={index}>
                  <h2 className="text-xl font-semibold text-secondary mb-3 mt-4 first:mt-0">{categoryItem.categoryName}</h2>
                  {categoryItem.questions.map((faq, qIndex) => (
                    <AccordionItem value={`${categoryItem.categoryName}-${qIndex}`} key={qIndex} className="border-b-primary/20 last:border-b-0">
                      <AccordionTrigger className="text-left hover:text-primary/80 py-3 text-sm sm:text-base">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="pt-1 pb-3 text-xs sm:text-sm text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </div>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpPage;

