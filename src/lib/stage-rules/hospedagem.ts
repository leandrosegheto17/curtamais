// L8-T01 — Regra RF-06: geração de 3 opções de hospedagem via Gateway de IA +
// filtro de orçamento (RF-06.1/.2).
//
// Mesmo padrão de `./destino.ts` (L7-T01): ponto de junção entre as duas
// camadas já prontas (Lotes 3 e 4). Chama o Gateway de IA para a etapa
// "hospedagem" (`generateStructuredCompletionWithRetry`, L3-T04 — retry
// único + `LlmGenerationLog`, nunca `generateStructuredCompletion` direto,
// TASK.md Seção 3 nota L3-T04) usando o mesmo registro central de prompt/
// schema da etapa (`buildHospedagemPrompt`/`hospedagemOpcoesSchema`,
// `src/lib/gateway-ia/prompts.ts`/`schemas.ts`, L3-T02), e então aplica
// `applyBudgetFilter` (RF-10, L4-T03, `src/lib/session-flow/budget-filter.ts`)
// sobre o resultado — nunca bloqueia, apenas reordena/sinaliza excedente
// (RN-04/RF-10.3). `hospedagemOpcoesSchema` já garante exatamente 3 opções
// na saída do Gateway de IA (`.length(3)`, `src/lib/gateway-ia/schemas.ts`) —
// `applyBudgetFilter` apenas reordena essa lista de 3, nunca remove item
// (mesma regra de RF-10.1 documentada em `budget-filter.ts`), então o
// resultado desta função também tem sempre 3 opções (RF-06.1/critério de
// aceite desta tarefa).
//
// Fronteira desta tarefa (RN-01, TASK.md Seção 1 item 4): só a REGRA de
// geração — não é uma Server Action de tela (essa é L8-T03), não persiste
// `AccommodationApproval` (também L8-T03/`applySessionFlowTransition`, Lote
// 4), e não faz parte da UI (L8-T02). O chamador (Server Action de L8-T03)
// é quem resolve `sessionId`/contexto a partir de `TripSession` e decide o
// que fazer com a lista retornada.
//
// Sanitização de texto livre (L11-T03, TASK.md Seção 1 item 9): o nome do
// destino que compõe `input.destination.name` aqui já chegou sanitizado
// contra prompt injection ANTES de ser persistido como `DestinationApproval`
// (ver `sanitizeFreeTextForPrompt` aplicada no ponto de captura em
// `src/lib/actions/destino.ts`/`data-livre.ts`/`feriados.ts`) — esta função
// consome o dado já aprovado da sessão, não texto livre bruto do usuário,
// então não sanitiza de novo (mesmo raciocínio já adotado por
// `buildHospedagemPrompt`, que só interpola `context.destination.name` numa
// frase fixa em português, nunca como instrução).

import {
  GATEWAY_IA_SCHEMA_NAMES,
  buildHospedagemPrompt,
  hospedagemOpcoesSchema,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import type { StageContext } from "@/lib/gateway-ia";
import { applyBudgetFilter } from "@/lib/session-flow";
import type { BudgetInput, PriceRangedSuggestion } from "@/lib/session-flow";

/**
 * Contexto necessário para gerar opções de hospedagem (RF-06.1) — subconjunto
 * de `StageContext` relevante a esta etapa (datas + orçamento + destino já
 * aprovado, RF-11; `accommodation`/`approvedActivities` não existem ainda
 * neste ponto do fluxo) mais o `sessionId` exigido por
 * `generateStructuredCompletionWithRetry` para `LlmGenerationLog`
 * (ADR-004/RNF-05, TASK.md Seção 1 item 8).
 */
export type GenerateAccommodationSuggestionsInput = {
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
  /** Destino já aprovado (RF-11/RN-01) — obrigatório: esta etapa não pode ser chamada sem ele. */
  destination: {
    name: string;
    priceRangeMin?: number;
    priceRangeMax?: number;
  };
  /**
   * RL8-T01 (RF-05.3, UX-SPEC.md T06 — "Ajustar" com campo de feedback
   * textual curto) — repassado literalmente a `StageContext.adjustmentFeedback`
   * (`@/lib/gateway-ia`). JÁ DEVE chegar aqui sanitizado contra prompt
   * injection (`sanitizeFreeTextForPrompt`, L11-T03) — esta função não
   * sanitiza, só repassa (a sanitização acontece no ponto de captura, na
   * Server Action chamadora, mesmo padrão de `destination.name` documentado
   * no cabeçalho deste arquivo).
   */
  adjustmentFeedback?: string | null;
};

/**
 * Uma opção de hospedagem já pronta para exibição: dado gerado pelo LLM
 * (nome, tipo, faixa de preço por diária, característica distintiva,
 * RF-06.1) mais o resultado de RF-10 (`withinBudget`/`exceedsBudget`, mesmo
 * shape de `BudgetFilteredSuggestion` de `applyBudgetFilter`, achatado num
 * único objeto para o chamador não precisar conhecer o formato interno de
 * `session-flow`).
 */
export type AccommodationSuggestionResult = {
  name: string;
  type: string;
  pricePerNightMin: number;
  pricePerNightMax: number;
  distinctiveFeature: string;
  /** `true` quando a opção cabe no orçamento informado (RF-10.1), ou quando não há orçamento informado (RF-10.3, sempre `true` nesse caso). */
  withinBudget: boolean;
  /** `true` apenas na opção mais barata quando NENHUMA opção cabe no orçamento (RF-06.2/RF-10.2) — ver `applyBudgetFilter`. */
  exceedsBudget: boolean;
};

/**
 * Gera exatamente 3 opções de hospedagem (RF-06.1) via Gateway de IA e
 * aplica o filtro/priorização de orçamento (RF-06.2/RF-10) quando
 * `budgetAmount` está presente. Nunca lança por causa do orçamento (RN-04) —
 * a lista continua com 3 opções mesmo quando nenhuma cabe no orçamento,
 * apenas com a mais barata sinalizada como excedente. Só propaga
 * `GatewayIaError` (`@/lib/gateway-ia`) se a chamada ao provider falhar após
 * o retry único (L3-T04), o que já inclui a validação de plausibilidade de
 * preço/grounding de data (L3-T03), ou o `Error` lançado por
 * `buildHospedagemPrompt` quando `input.destination` está ausente (RN-01).
 */
export async function generateAccommodationSuggestions(
  input: GenerateAccommodationSuggestionsInput,
): Promise<AccommodationSuggestionResult[]> {
  const context: StageContext = {
    referenceDate: input.referenceDate,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    budgetAmount: input.budgetAmount ?? null,
    budgetCurrency: input.budgetCurrency ?? null,
    destination: input.destination,
    adjustmentFeedback: input.adjustmentFeedback ?? null,
  };

  const result = await generateStructuredCompletionWithRetry({
    sessionId: input.sessionId,
    stage: "hospedagem",
    schemaName: GATEWAY_IA_SCHEMA_NAMES.hospedagem,
    schema: hospedagemOpcoesSchema,
    messages: buildHospedagemPrompt(context),
  });

  // Adapta o shape do schema da etapa (`precoPorDiariaMin`/
  // `precoPorDiariaMax`, `src/lib/gateway-ia/schemas.ts`) para o shape
  // genérico exigido por `applyBudgetFilter` (`precoMin`/`precoMax`,
  // `src/lib/session-flow/budget-filter.ts`) — os dois módulos permanecem
  // desacoplados um do outro, esta função é quem conhece os dois
  // vocabulários (mesmo padrão de `./destino.ts`).
  const priceRangedSuggestions: (PriceRangedSuggestion & {
    nome: string;
    tipo: string;
    caracteristicaDistintiva: string;
  })[] = result.data.opcoes.map((opcao) => ({
    nome: opcao.nome,
    tipo: opcao.tipo,
    precoMin: opcao.precoPorDiariaMin,
    precoMax: opcao.precoPorDiariaMax,
    caracteristicaDistintiva: opcao.caracteristicaDistintiva,
  }));

  const budget: BudgetInput | null =
    input.budgetAmount != null ? { amount: input.budgetAmount } : null;

  const filtered = applyBudgetFilter(priceRangedSuggestions, budget);

  return filtered.map(({ suggestion, withinBudget, exceedsBudget }) => ({
    name: suggestion.nome,
    type: suggestion.tipo,
    pricePerNightMin: suggestion.precoMin,
    pricePerNightMax: suggestion.precoMax,
    distinctiveFeature: suggestion.caracteristicaDistintiva,
    withinBudget,
    exceedsBudget,
  }));
}
