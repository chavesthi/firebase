'use server';
/**
 * @fileOverview AI flow for analyzing venue feedback from event ratings and comments.
 *
 * - analyzeVenueFeedback - A function that processes event feedback and returns an analysis.
 * - AnalyzeVenueFeedbackInput - The input type for the analyzeVenueFeedback function.
 * - AnalyzeVenueFeedbackOutput - The return type for the analyzeVenueFeedback function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FeedbackItemSchema = z.object({
  rating: z.number().min(1).max(5).describe('The numerical rating from 1 to 5 stars.'),
  comment: z.string().optional().describe('The text comment provided by the user, if any.'),
  eventName: z.string().optional().describe('The name of the event the feedback pertains to.'),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const AnalyzeVenueFeedbackInputSchema = z.object({
  venueName: z.string().describe('The name of the venue being analyzed.'),
  feedbackItems: z.array(FeedbackItemSchema).min(1, {message: "Pelo menos um item de feedback é necessário para análise."}).describe('An array of feedback items, each containing a rating and an optional comment.'),
});
export type AnalyzeVenueFeedbackInput = z.infer<typeof AnalyzeVenueFeedbackInputSchema>;

export const AnalyzeVenueFeedbackOutputSchema = z.object({
  positiveAspects: z.array(z.string()).describe('List of key positive themes or frequently mentioned compliments.'),
  negativeAspects: z.array(z.string()).describe('List of key negative themes or frequently mentioned complaints.'),
  improvementSuggestions: z.array(z.string()).describe('Actionable suggestions for the venue to improve based on the feedback.'),
  overallSentiment: z.enum(['Muito Positivo', 'Positivo', 'Neutro', 'Negativo', 'Muito Negativo', 'Misto']).describe('Overall sentiment category based on the feedback.'),
  summary: z.string().describe('A brief 2-3 sentence summary of the overall feedback.'),
  averageRatingCalculated: z.number().optional().describe('The calculated average rating from the provided feedback items.'),
  totalFeedbackItems: z.number().describe('The total number of feedback items processed.'),
});
export type AnalyzeVenueFeedbackOutput = z.infer<typeof AnalyzeVenueFeedbackOutputSchema>;


export async function analyzeVenueFeedback(input: AnalyzeVenueFeedbackInput): Promise<AnalyzeVenueFeedbackOutput> {
  if (input.feedbackItems.length === 0) {
    return {
      positiveAspects: ["Nenhum feedback fornecido para análise."],
      negativeAspects: [],
      improvementSuggestions: [],
      overallSentiment: 'Neutro',
      summary: 'Não há feedback suficiente para gerar uma análise detalhada.',
      totalFeedbackItems: 0,
    };
  }
  return analyzeVenueFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeVenueFeedbackPrompt',
  input: { schema: AnalyzeVenueFeedbackInputSchema.extend({ feedbackSummaryString: z.string() }) },
  output: { schema: AnalyzeVenueFeedbackOutputSchema },
  prompt: `
Você é um consultor especialista em análise de feedback para estabelecimentos de entretenimento.
Sua tarefa é processar uma lista de avaliações (notas de 1 a 5 estrelas) e comentários textuais para o local "{{venueName}}" e gerar um relatório conciso.

Com base no feedback fornecido, identifique:
1.  **Aspectos Positivos**: Liste de 3 a 5 temas positivos chave ou elogios frequentemente mencionados. Se houver poucos, liste os que encontrar.
2.  **Aspectos Negativos**: Liste de 3 a 5 temas negativos chave ou reclamações frequentemente mencionadas. Se houver poucos, liste os que encontrar.
3.  **Sugestões de Melhoria**: Forneça de 3 a 5 sugestões acionáveis para o local melhorar com base no feedback. Concentre-se em conselhos específicos e práticos.
4.  **Sentimento Geral**: Categorize o sentimento geral como 'Muito Positivo', 'Positivo', 'Neutro', 'Negativo', 'Muito Negativo' ou 'Misto'. Considere a média das notas e o tom dos comentários.
5.  **Resumo**: Escreva um breve resumo de 2-3 frases sobre o feedback geral.
6.  **averageRatingCalculated**: Calcule a média das notas de todos os 'feedbackItems' e inclua aqui.
7.  **totalFeedbackItems**: Conte o número total de 'feedbackItems' processados.

Contexto do Local: {{{venueName}}}

Feedback Detalhado:
{{{feedbackSummaryString}}}

Por favor, forneça seu relatório no formato JSON estruturado especificado pelo esquema de saída.
Certifique-se de que todos os campos obrigatórios do esquema de saída sejam preenchidos.
Se não houver comentários suficientes para extrair 3-5 itens para aspectos positivos/negativos/sugestões, liste quantos forem identificados.
Se não houver comentários, baseie-se apenas nas notas para o sentimento geral e o resumo.
O campo 'averageRatingCalculated' deve ser a média numérica das notas.
O campo 'totalFeedbackItems' deve ser o número total de itens de feedback processados.
`,
  config: {
    temperature: 0.3, // Lower temperature for more factual, less creative report
     safetySettings: [ // Adjusted safety settings for more permissive generation regarding venue feedback
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
});

const analyzeVenueFeedbackFlow = ai.defineFlow(
  {
    name: 'analyzeVenueFeedbackFlow',
    inputSchema: AnalyzeVenueFeedbackInputSchema,
    outputSchema: AnalyzeVenueFeedbackOutputSchema,
  },
  async (input) => {
    const feedbackSummaryString = input.feedbackItems.map(item =>
      `Evento: ${item.eventName || 'Não especificado'}, Nota: ${item.rating}/5${item.comment ? ` | Comentário: "${item.comment}"` : ''}`
    ).join('\n');

    const totalFeedbackItems = input.feedbackItems.length;
    const averageRatingCalculated = totalFeedbackItems > 0
      ? parseFloat((input.feedbackItems.reduce((sum, item) => sum + item.rating, 0) / totalFeedbackItems).toFixed(2))
      : 0;
    
    const { output } = await prompt({
      venueName: input.venueName,
      feedbackItems: input.feedbackItems, // Pass original items for any internal processing if needed, though prompt uses summary
      feedbackSummaryString: feedbackSummaryString,
    });

    if (!output) {
      throw new Error("A análise da IA não retornou um resultado válido.");
    }
    
    // Ensure the output includes the calculated values, as the LLM might not always fill them perfectly
    return {
      ...output,
      averageRatingCalculated: output.averageRatingCalculated ?? averageRatingCalculated,
      totalFeedbackItems: output.totalFeedbackItems ?? totalFeedbackItems,
    };
  }
);