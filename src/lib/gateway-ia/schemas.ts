// L3-T02 — JSON schema de saída por etapa (ADR-003).
//
// Cada etapa do fluxo guiado (destino/hospedagem/passeios/roteiro, RF-04/
// RF-06/RF-07/RF-08) tem um schema Zod fixo, usado como `response_format`
// (JSON mode/structured outputs) nas chamadas ao Gateway de IA — nunca
// parsing de texto livre (TASK.md Seção 1, item 2). Os campos espelham o
// modelo de dados de cada entidade filha de `TripSession` (SDD.md Seção 5/
// `prisma/schema.prisma`), o que torna a resposta do LLM verificável
// automaticamente (ADR-003: "mesmos campos do modelo de dados").
//
// Fora de escopo desta tarefa (L3-T02): validação de plausibilidade de preço/
// grounding de data (isso roda sobre o `data` já validado por este schema —
// implementada em L3-T03, ver `./validation.ts`), retry/log (L3-T04), e a
// extração da regra de negócio completa de cada etapa — filtro de
// orçamento, seleção final de itens, persistência
// (L7-T01/L8-T01/L9-T01/L10-T01). Estes schemas só descrevem o "shape" da
// saída esperada do provider.

import { z } from "zod";

/**
 * Nome curto e estável de cada schema (usado como `schemaName` nas chamadas
 * ao Gateway de IA — ver `StructuredCompletionRequest.schemaName` em
 * `./index.ts` — e, futuramente, como parte de `LlmGenerationLog.promptVersion`
 * em L3-T04).
 */
export const GATEWAY_IA_SCHEMA_NAMES = {
  destino: "destino_sugestoes",
  hospedagem: "hospedagem_opcoes",
  passeios: "passeios_opcoes",
  roteiro: "roteiro_estruturado",
} as const;

/**
 * Etapa RF-04: 2 a 4 sugestões de destino, cada uma com nome, justificativa
 * curta e faixa de preço aproximada (RNF-01/RN-05: toda faixa é "aproximada",
 * nunca um valor único — a rotulagem visual em si é responsabilidade da UI,
 * `PriceRangeBadge`, Lote 5).
 */
export const destinoSugestoesSchema = z.object({
  destinos: z
    .array(
      z.object({
        nome: z.string().min(1),
        justificativa: z.string().min(1),
        faixaPrecoMin: z.number().nonnegative(),
        faixaPrecoMax: z.number().nonnegative(),
      }),
    )
    .min(2)
    .max(4),
});
export type DestinoSugestoes = z.infer<typeof destinoSugestoesSchema>;

/**
 * Etapa RF-06: exatamente 3 opções de hospedagem, cada uma com nome, tipo,
 * faixa de preço por diária e uma característica distintiva (RF-06.1/.2).
 */
export const hospedagemOpcoesSchema = z.object({
  opcoes: z
    .array(
      z.object({
        nome: z.string().min(1),
        tipo: z.string().min(1),
        precoPorDiariaMin: z.number().nonnegative(),
        precoPorDiariaMax: z.number().nonnegative(),
        caracteristicaDistintiva: z.string().min(1),
      }),
    )
    .length(3),
});
export type HospedagemOpcoes = z.infer<typeof hospedagemOpcoesSchema>;

/**
 * Etapa RF-07: lista de passeios/atividades, cada um com nome, faixa de
 * preço (podendo ser R$ 0 — `gratuito`), e duração aproximada. A garantia de
 * "ao menos 1 item gratuito quando relevante ao destino" (RF-07.2) é regra de
 * negócio de L9-T01, não deste schema — este schema só valida o shape.
 */
export const passeiosOpcoesSchema = z.object({
  passeios: z
    .array(
      z.object({
        nome: z.string().min(1),
        precoMin: z.number().nonnegative(),
        precoMax: z.number().nonnegative(),
        gratuito: z.boolean(),
        duracaoAproximada: z.string().min(1),
      }),
    )
    .min(1),
});
export type PasseiosOpcoes = z.infer<typeof passeiosOpcoesSchema>;

/** Um bloco de atividade dentro de um período (manhã/tarde/noite) do roteiro (RF-08.1). */
const roteiroBlocoSchema = z.object({
  atividade: z.string().min(1),
  horarioSugerido: z.string().min(1),
  /** Nullable: nem toda atividade tem justificativa de timing (RF-08.3, espelha `ItineraryItem.timingJustification`). */
  justificativaTiming: z.string().nullable(),
});

/**
 * Etapa RF-08: roteiro estruturado por dia, dividido em manhã/tarde/noite
 * (RF-08.1). Sequenciamento por proximidade geográfica (RF-08.2) e horário
 * ideal (RF-08.3) são responsabilidade do prompt + do próprio modelo — este
 * schema só garante que a estrutura por dia/período está presente.
 */
export const roteiroEstruturadoSchema = z.object({
  dias: z
    .array(
      z.object({
        data: z.string().min(1),
        manha: z.array(roteiroBlocoSchema),
        tarde: z.array(roteiroBlocoSchema),
        noite: z.array(roteiroBlocoSchema),
      }),
    )
    .min(1),
});
export type RoteiroEstruturado = z.infer<typeof roteiroEstruturadoSchema>;
