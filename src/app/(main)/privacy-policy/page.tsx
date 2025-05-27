
'use client';

import type { NextPage } from 'next';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const PrivacyPolicyPage: NextPage = () => {
  const router = useRouter();

  // **IMPORTANTE: Este é um texto de política de privacidade genérico e NÃO é legalmente suficiente.**
  // **Você DEVE substituí-lo por uma política de privacidade real, elaborada por um profissional jurídico,
  // que reflita as práticas de coleta e uso de dados do Fervo App.**
  const placeholderPolicyText = `
    Bem-vindo à Política de Privacidade do Fervo App.
    Última atualização: 25 de maio de 2025

    Esta Política de Privacidade descreve como o Fervo App (doravante "nós", "nosso" ou "Fervo App") coleta, usa e compartilha informações sobre você através de nossos aplicativos móveis, websites e serviços relacionados (coletivamente, os "Serviços"). Ao usar nossos Serviços, você concorda com a coleta, uso e compartilhamento de suas informações conforme descrito nesta Política de Privacidade.

    1. Informações que Coletamos
    -----------------------------
    Podemos coletar os seguintes tipos de informações:
    * Informações que Você nos Fornece:
        * Informações da Conta: Quando você cria uma conta, coletamos seu nome, endereço de e-mail, senha e, opcionalmente, idade, preferências de locais e estilos musicais, cidade e estado. Para parceiros, coletamos nome do estabelecimento, tipo de local, estilos musicais, informações de contato (telefone, redes sociais), endereço completo e detalhes de eventos.
        * Foto de Perfil: Se você optar por adicionar uma foto de perfil (usuário ou parceiro), essa imagem será coletada e armazenada.
        * Comunicações: Se você entrar em contato conosco diretamente, podemos receber informações adicionais sobre você.
    * Informações Coletadas Automaticamente:
        * Dados de Uso e Logs: Informações sobre sua interação com nossos Serviços, como endereços IP, tipo de navegador, sistema operacional, páginas visitadas, datas e horários de acesso.
        * Informações do Dispositivo: Informações sobre o dispositivo que você usa para acessar nossos Serviços, como modelo do hardware, sistema operacional e identificadores únicos do dispositivo.
        * Informações de Localização: Com sua permissão, podemos coletar informações de localização aproximada (baseada no perfil) ou precisa (se implementado e consentido) do seu dispositivo.
    * Informações de Terceiros:
        * Login Social: Se você fizer login usando um serviço de terceiros (como Google), receberemos informações desse serviço, como seu nome e endereço de e-mail, conforme permitido por você.

    2. Como Usamos Suas Informações
    --------------------------------
    Usamos suas informações para:
    * Fornecer, operar e melhorar nossos Serviços.
    * Personalizar sua experiência, como sugerir eventos ou locais.
    * Processar transações (ex: assinaturas de parceiros).
    * Comunicar com você, incluindo responder a seus comentários, perguntas e fornecer suporte ao cliente.
    * Enviar notificações push e e-mails (com seu consentimento), como atualizações de eventos, novos locais e informações promocionais.
    * Para fins de segurança, para prevenir fraudes e proteger os direitos e a segurança do Fervo App e de seus usuários.
    * Analisar tendências de uso e atividades em conexão com nossos Serviços.

    3. Como Compartilhamos Suas Informações
    --------------------------------------
    Não compartilhamos suas informações pessoais com terceiros, exceto nas seguintes circunstâncias ou conforme descrito nesta Política:
    * Com seu Consentimento.
    * Provedores de Serviço: Podemos compartilhar informações com fornecedores terceirizados, consultores e outros prestadores de serviços que executam tarefas em nosso nome (ex: processamento de pagamentos, hospedagem de dados, análise).
    * Informações Públicas: Seu nome de usuário e foto de perfil (se fornecida) podem ser visíveis para outros usuários no chat. Informações sobre locais parceiros e eventos (exceto dados administrativos) são públicas para os usuários do app.
    * Requisitos Legais: Podemos divulgar suas informações se acreditarmos que a divulgação é exigida por lei, processo legal ou solicitação governamental.
    * Transferências de Negócios: Em conexão com, ou durante negociações de, qualquer fusão, venda de ativos da empresa, financiamento ou aquisição de toda ou parte de nossos negócios por outra empresa.

    4. Suas Escolhas e Direitos
    ----------------------------
    * Informações da Conta: Você pode acessar e atualizar certas informações da sua conta através das configurações do seu perfil.
    * Comunicações por E-mail e Notificações: Você pode optar por não receber e-mails promocionais seguindo as instruções de cancelamento de inscrição nesses e-mails. Você pode gerenciar as preferências de notificação push nas configurações do seu dispositivo ou do aplicativo.
    * Exclusão da Conta: Você pode solicitar a exclusão da sua conta através das configurações do aplicativo.

    5. Segurança de Dados
    --------------------
    Tomamos medidas razoáveis para ajudar a proteger suas informações contra perda, roubo, uso indevido e acesso não autorizado, divulgação, alteração e destruição.

    6. Retenção de Dados
    -------------------
    Reteremos suas informações pessoais pelo tempo necessário para cumprir os propósitos descritos nesta Política de Privacidade, a menos que um período de retenção mais longo seja exigido ou permitido por lei.

    7. Privacidade de Crianças
    ------------------------
    Nossos Serviços não são direcionados a crianças menores de 13 anos (ou idade mínima equivalente na jurisdição relevante), e não coletamos intencionalmente informações pessoais de crianças.

    8. Alterações a esta Política de Privacidade
    ------------------------------------------
    Podemos atualizar esta Política de Privacidade de tempos em tempos. Se fizermos alterações, notificaremos você revisando a data no topo da política e, em alguns casos, podemos fornecer um aviso adicional.

    9. Contate-Nos
    -------------
    Se você tiver alguma dúvida sobre esta Política de Privacidade, entre em contato conosco em: [SEU_EMAIL_DE_CONTATO_AQUI]
  `;

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
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 mr-2 sm:mr-3" />
            Política de Privacidade
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Como o Fervo App coleta, usa e protege suas informações.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <ScrollArea className="h-[calc(100vh-20rem)] sm:h-[calc(100vh-22rem)] pr-3">
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none whitespace-pre-wrap">
              {placeholderPolicyText}
              <p className="mt-6 font-bold text-destructive">
                AVISO LEGAL: O texto acima é um placeholder genérico e não constitui aconselhamento jurídico.
                Você DEVE substituí-lo por uma política de privacidade real, elaborada por um profissional jurídico,
                adequada às leis aplicáveis e às práticas de coleta de dados do seu aplicativo Fervo App.
              </p>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyPolicyPage;
