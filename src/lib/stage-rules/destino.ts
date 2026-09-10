// L7-T01 — Regra RF-04: geração de 2-4 sugestões de destino via Gateway de
// IA + filtro de orçamento (RF-04.1/RF-10).
//
// Ponto de junção entre as duas camadas já prontas (Lotes 3 e 4): chama o
// Gateway de IA para a etapa "destino" (`generateStructuredCompletionWithRetry`,
// L3-T04 — retry único + `LlmGenerationLog`, nunca `generateStructuredCompletion`
// direto, TASK.md Seção 3 nota L3-T04) usando o mesmo registro central de
// prompt/schema da etapa (`buildDestinoPrompt`/`destinoSugestoesSchema`,
// `src/lib/gateway-ia/prompts.ts`, L3-T02), e então aplica `applyBudgetFilter`
// (RF-10, L4-T03, `src/lib/session-flow/budget-filter.ts`) sobre o resultado
// — nunca bloqueia, apenas reordena/sinaliza excedente (RN-04/RF-10.3).
//
// Fronteira desta tarefa (RN-01, TASK.md Seção 1 item 4): só a REGRA de
// geração — não é uma Server Action de tela (essa é L7-T03), não persiste
// `DestinationApproval` (também L7-T03/`applySessionFlowTransition`, Lote 4),
// e não faz parte da UI (L7-T02). O chamador (Server Action de L7-T03, ou um
// Route Handler futuro) é quem resolve `sessionId`/contexto a partir de
// `TripSession` e decide o que fazer com a lista retornada.
//
// Localização: novo diretório `src/lib/stage-rules/` (decisão de escopo
// pequena, documentada na nota de implementação L7-T01 do TASK.md) para as
// regras de negócio por etapa (destino aqui; hospedagem/passeios/roteiro em
// L8-T01/L9-T01/L10-T01 futuramente, cada uma em seu próprio arquivo) — nem
// `gateway-ia` (que é agnóstico ao domínio de viagens, ver comentário em
// `src/lib/gateway-ia/index.ts`) nem `session-flow` (que é a camada de
// persistência/state machine, não de geração) são o lugar certo para esta
// combinação específica de "chamar o LLM + aplicar RF-10".

import {
  GATEWAY_IA_SCHEMA_NAMES,
  buildDestinoPrompt,
  destinoSugestoesSchema,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import type { StageContext } from "@/lib/gateway-ia";
import { applyBudgetFilter } from "@/lib/session-flow";
import type { BudgetInput, PriceRangedSuggestion } from "@/lib/session-flow";

/**
 * Contexto necessário para gerar sugestões de destino (RF-04.1) — subconjunto
 * de `StageContext` relevante a esta etapa (datas + orçamento; `destination`/
 * `accommodation`/`approvedActivities` não existem ainda neste ponto do
 * fluxo, é o que está sendo decidido) mais o `sessionId` exigido por
 * `generateStructuredCompletionWithRetry` para `LlmGenerationLog`
 * (ADR-004/RNF-05, TASK.md Seção 1 item 8).
 */
export type GenerateDestinationSuggestionsInput = {
  /** `TripSession.id` — resolução/checagem de dono do registro é responsabilidade do chamador (TASK.md Seção 1 item 9; L11-T02). */
  sessionId: string;
  /** Data corrente (grounding de calendário, ADR-003). Formato ISO (`YYYY-MM-DD`). */
  referenceDate: string;
  /** Range de datas já resolvido da sessão (RF-01/RF-02/RF-03). Formato ISO (`YYYY-MM-DD`). */
  dateRangeStart: string;
  dateRangeEnd: string;
  /** `TripSession.budgetAmount`/`budgetCurrency` — ausência nunca bloqueia a geração (RF-10.3). */
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
};

/**
 * Uma sugestão de destino já pronta para exibição: dado gerado pelo LLM
 * (nome, justificativa, faixa de preço, RF-04.1) mais o resultado de RF-10
 * (`withinBudget`/`exceedsBudget`, mesmo shape de `BudgetFilteredSuggestion`
 * de `applyBudgetFilter`, achatado num único objeto para o chamador não
 * precisar conhecer o formato interno de `session-flow`).
 */
export type DestinationSuggestionResult = {
  name: string;
  justification: string;
  priceRangeMin: number;
  priceRangeMax: number;
  /** `true` quando a sugestão cabe no orçamento informado (RF-10.1), ou quando não há orçamento informado (RF-10.3, sempre `true` nesse caso). */
  withinBudget: boolean;
  /** `true` apenas na sugestão mais barata quando NENHUMA sugestão cabe no orçamento (RF-10.2) — ver `applyBudgetFilter`. */
  exceedsBudget: boolean;
};

/**
 * Gera entre 2 e 4 sugestões de destino (RF-04.1) via Gateway de IA e aplica
 * o filtro/priorização de orçamento (RF-10) quando `budgetAmount` está
 * presente. Nunca lança por causa do orçamento (RN-04) — só propaga
 * `GatewayIaError` (`@/lib/gateway-ia`) se a chamada ao provider falhar após
 * o retry único (L3-T04), o que já inclui a validação de plausibilidade de
 * preço/grounding de data (L3-T03).
 */
export async function generateDestinationSuggestions(
  input: GenerateDestinationSuggestionsInput,
): Promise<DestinationSuggestionResult[]> {
  const context: StageContext = {
    referenceDate: input.referenceDate,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    budgetAmount: input.budgetAmount ?? null,
    budgetCurrency: input.budgetCurrency ?? null,
  };

  const result = await generateStructuredCompletionWithRetry({
    sessionId: input.sessionId,
    stage: "destino",
    schemaName: GATEWAY_IA_SCHEMA_NAMES.destino,
    schema: destinoSugestoesSchema,
    messages: buildDestinoPrompt(context),
  });

  // Adapta o shape do schema da etapa (`faixaPrecoMin`/`faixaPrecoMax`,
  // `src/lib/gateway-ia/schemas.ts`) para o shape genérico exigido por
  // `applyBudgetFilter` (`precoMin`/`precoMax`, `src/lib/session-flow/
  // budget-filter.ts`) — os dois módulos permanecem desacoplados um do
  // outro, esta função é quem conhece os dois vocabulários.
  const priceRangedSuggestions: (PriceRangedSuggestion & {
    nome: string;
    justificativa: string;
  })[] = result.data.destinos.map((destino) => ({
    nome: destino.nome,
    justificativa: destino.justificativa,
    precoMin: destino.faixaPrecoMin,
    precoMax: destino.faixaPrecoMax,
  }));

  const budget: BudgetInput | null =
    input.budgetAmount != null ? { amount: input.budgetAmount } : null;

  const filtered = applyBudgetFilter(priceRangedSuggestions, budget);

  return filtered.map(({ suggestion, withinBudget, exceedsBudget }) => ({
    name: suggestion.nome,
    justification: suggestion.justificativa,
    priceRangeMin: suggestion.precoMin,
    priceRangeMax: suggestion.precoMax,
    withinBudget,
    exceedsBudget,
  }));
}
