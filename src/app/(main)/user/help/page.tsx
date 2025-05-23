
'use client';

import type { NextPage } from 'next';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, HelpCircle } from 'lucide-react';

const faqData = [
  {
    category: "Para Usuários",
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
        answer: "No menu principal (na barra de navegação superior), clique no ícone de QR Code (parece um quadrado com um leitor) e escaneie o código fornecido pelo local do evento. Após o check-in, você poderá avaliar o evento.",
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
  // Partner FAQ section removed
];

const HelpPage: NextPage = () => {
  const router = useRouter();

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
          <Accordion type="multiple" className="w-full space-y-4">
            {faqData.map((categoryItem, index) => (
              <div key={index}>
                <h2 className="text-xl font-semibold text-secondary mb-3 mt-4 first:mt-0">{categoryItem.category}</h2>
                {categoryItem.questions.map((faq, qIndex) => (
                  <AccordionItem value={`${categoryItem.category}-${qIndex}`} key={qIndex} className="border-b-primary/20 last:border-b-0">
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
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpPage;
