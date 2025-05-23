
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
        answer: "Você ganha FervoCoins ao compartilhar eventos de locais específicos. Cada 10 compartilhamentos de eventos de um mesmo local podem gerar um cupom para você usar nesse local.",
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
  },
  {
    category: "Para Parceiros",
    questions: [
      {
        question: "Como cadastro meu local?",
        answer: "Ao criar uma conta de parceiro, você será guiado por um questionário para fornecer todos os detalhes do seu estabelecimento, incluindo nome, tipo, endereço, estilos musicais e contatos.",
      },
      {
        question: "Como crio um evento?",
        answer: "No seu painel de parceiro, vá para \"Gerenciar Eventos\". Lá você pode adicionar novos eventos, definir datas, horários, preços, visibilidade e se o compartilhamento do evento gera FervoCoins para os usuários.",
      },
      {
        question: "Como gero um QR Code para check-in?",
        answer: "Na seção \"Meus Eventos Cadastrados\" do seu painel de eventos, cada evento terá um ícone de QR Code. Clique nele para visualizar e ter a opção de imprimir o código de check-in específico daquele evento.",
      },
      {
        question: "Como vejo as avaliações dos meus eventos?",
        answer: "No seu painel de parceiro, acesse \"Avaliações e Comentários\". Lá você pode ver as notas e os comentários de cada evento individualmente, além da avaliação geral do seu local (que é a média das avaliações de todos os seus eventos).",
      },
      {
        question: "Como funciona a análise de feedback com IA?",
        answer: "No painel de parceiro, na seção \"Análise de Feedback (IA)\", você pode gerar um relatório. A IA analisará todas as avaliações e comentários dos seus eventos e fornecerá um resumo dos pontos positivos, aspectos a melhorar e sugestões acionáveis.",
      },
      {
        question: "Como gerencio minha assinatura do Fervo App?",
        answer: "Vá para \"Configurações da Conta e Pagamentos\" no seu painel de parceiro. Lá você encontrará opções para assinar ou gerenciar sua assinatura mensal do Fervo App.",
      },
      {
        question: "Como valido um cupom de usuário?",
        answer: "No seu painel de parceiro, acesse \"Resgatar Cupons\". Insira o código fornecido pelo usuário para validá-lo. Cupons resgatados aparecerão no relatório.",
      },
    ],
  },
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
