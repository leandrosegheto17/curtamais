// L9-T01 — Regra RF-07: geração de lista de passeios/atividades via Gateway
// de IA + filtro de orçamento (RF-07.1/.2/RF-10).
//
// Mesmo padrão de `./hospedagem.ts` (L8-T01) e `./destino.ts` (L7-T01):
// ponto de junção entre as duas camadas já prontas (Lotes 3 e 4). Chama o
// Gateway de IA para a etapa "passeios" (`generateStructuredCompletionWithRetry`,
// L3-T04 — retry único + `LlmGenerationLog`, nunca `generateStructuredCompletion`
// direto, TASK.md Seção 3 nota L3-T04) usando o mesmo registro central de
// prompt/schema da etapa (`buildPasseiosPrompt`/`passeiosOpcoesSchema`,
// `src/lib/gateway-ia/prompts.ts`/`schemas.ts`, L3-T02), e então aplica
// `applyBudgetFilter` (RF-10, L4-T03, `src/lib/session-flow/budget-filter.ts`)
// sobre o resultado — nunca bloqueia, apenas reordena/sinaliza excedente
// (RN-04/RF-10.3).
//
// Diferença chave de hospedagem: `passeiosOpcoesSchema.passeios` é uma lista
// de tamanho VARIÁVEL (`.min(1)`, sem teto superior, `src/lib/gateway-ia/
// schemas.ts`), não uma quantidade fixa — esta função não impõe nenhum
// tamanho de lista além do mínimo já garantido pelo schema.
//
// RF-07.2 ("ao menos 1 item gratuito quando existir/relevante ao destino") é
// responsabilidade do PROMPT (`buildPasseiosPrompt`, instrução textual ao
// LLM pedindo pelo menos uma opção gratuita "quando existir algo relevante e
// gratuito... nunca invente gratuidade só para cumprir isso"), não desta
// regra de negócio — esta função NUNCA inventa/força um item gratuito
// artificial quando o LLM não retorna nenhum; a garantia aqui é "quando
// existir", não incondicional (mesmo raciocínio documentado em
// `passeiosOpcoesSchema`, `src/lib/gateway-ia/schemas.ts`).
//
// RF-10 + itens gratuitos: um item com `precoMin = 0` (gratuito) sempre
// satisfaz `precoMin <= budget.amount` para qualquer orçamento não-negativo
// informado — `applyBudgetFilter` (L4-T03) já trata isso corretamente sem
// nenhuma alteração necessária neste módulo ou em `budget-filter.ts` (ver
// teste "item gratuito sempre withinBudget=true" em
// `src/lib/stage-rules/__tests__/passeios.test.ts`): itens gratuitos nunca
// são sinalizados como excedentes (`exceedsBudget`), mesmo quando nenhum item
// pago cabe no orçamento.
//
// Fronteira desta tarefa (RN-01, TASK.md Seção 1 item 4): só a REGRA de
// geração — não é uma Server Action de tela (essa é L9-T03), não persiste
// `ActivityApproval` (também L9-T03/`applySessionFlowTransition`, Lote 4), e
// não faz parte da UI (L9-T02). O chamador (Server Action de L9-T03) é quem
// resolve `sessionId`/contexto a partir de `TripSession` e decide o que
// fazer com a lista retornada.
//
// Sanitização de texto livre (L11-T03, TASK.md Seção 1 item 9):
// `input.destination.name`/`input.accommodation.name`/`.type` já chegam
// sanitizados contra prompt injection ANTES de serem persistidos como
// `DestinationApproval`/`AccommodationApproval` (ver `sanitizeFreeTextForPrompt`
// aplicada nos pontos de captura em `src/lib/actions/destino.ts`/
// `data-livre.ts`/`feriados.ts` e em `assertValidAccommodationPayload`,
// `src/lib/actions/hospedagem.ts`, RL8-T02) — esta função consome dado já
// aprovado da sessão, não texto livre bruto do usuário, então não sanitiza
// de novo (mesmo raciocínio já adotado por `buildPasseiosPrompt`, que só
// interpola `context.destination.name`/`context.accommodation.name`/`.type`
// em frases fixas em português, nunca como instrução).

import {
  GATEWAY_IA_SCHEMA_NAMES,
  buildPasseiosPrompt,
  passeiosOpcoesSchema,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import type { StageContext } from "@/lib/gateway-ia";
import { applyBudgetFilter } from "@/lib/session-flow";
import type { BudgetInput, PriceRangedSuggestion } from "@/lib/session-flow";

/**
 * Contexto necessário para gerar sugestões de passeios (RF-07.1) —
 * subconjunto de `StageContext` relevante a esta etapa (datas + orçamento +
 * destino já aprovado, RF-11, mais hospedagem já aprovada quando existir,
 * RF-06) mais o `sessionId` exigido por `generateStructuredCompletionWithRetry`
 * para `LlmGenerationLog` (ADR-004/RNF-05, TASK.md Seção 1 item 8).
 */
export type GeneratePasseiosSuggestionsInput = {
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
   * Hospedagem já aprovada (RF-06) — opcional: `buildPasseiosPrompt` funciona
   * mesmo sem ela (contexto que só ajuda o modelo a não sugerir algo
   * redundante, nunca obrigatório para esta etapa gerar conteúdo coerente).
   */
  accommodation?: {
    name: string;
    type: string;
  } | null;
};

/**
 * Um item de passeio/atividade já pronto para exibição: dado gerado pelo LLM
 * (nome, faixa de preço podendo ser R$ 0, se é gratuito, duração aproximada,
 * RF-07.1/.2) mais o resultado de RF-10 (`withinBudget`/`exceedsBudget`,
 * mesmo shape de `BudgetFilteredSuggestion` de `applyBudgetFilter`, achatado
 * num único objeto para o chamador não precisar conhecer o formato interno
 * de `session-flow`).
 */
export type PasseiosSuggestionResult = {
  name: string;
  priceMin: number;
  priceMax: number;
  /** Espelha `passeiosOpcoesSchema.passeios[].gratuito` (RF-07.2). */
  isFree: boolean;
  durationApprox: string;
  /** `true` quando o item cabe no orçamento informado (RF-10.1), ou quando não há orçamento informado (RF-10.3, sempre `true` nesse caso). Itens gratuitos (`priceMin = 0`) são sempre `true`. */
  withinBudget: boolean;
  /** `true` apenas no item mais barato quando NENHUM item cabe no orçamento (RF-10.2) — ver `applyBudgetFilter`. Nunca `true` num item gratuito, já que `precoMin = 0` sempre cabe em qualquer orçamento não-negativo. */
  exceedsBudget: boolean;
};

/**
 * Gera uma lista de passeios/atividades (RF-07.1, tamanho variável — ao
 * menos 1 item, garantido por `passeiosOpcoesSchema.passeios.min(1)`) via
 * Gateway de IA e aplica o filtro/priorização de orçamento (RF-10) quando
 * `budgetAmount` está presente. Nunca lança por causa do orçamento (RN-04) —
 * a lista continua com o mesmo tamanho mesmo quando nenhum item pago cabe no
 * orçamento, apenas com o mais barato sinalizado como excedente (itens
 * gratuitos nunca são sinalizados como excedentes). Só propaga
 * `GatewayIaError` (`@/lib/gateway-ia`) se a chamada ao provider falhar após
 * o retry único (L3-T04), o que já inclui a validação de plausibilidade de
 * preço/grounding de data (L3-T03), ou o `Error` lançado por
 * `buildPasseiosPrompt` quando `input.destination` está ausente (RN-01).
 */
export async function generatePasseiosSuggestions(
  input: GeneratePasseiosSuggestionsInput,
): Promise<PasseiosSuggestionResult[]> {
  const context: StageContext = {
    referenceDate: input.referenceDate,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    budgetAmount: input.budgetAmount ?? null,
    budgetCurrency: input.budgetCurrency ?? null,
    destination: input.destination,
    accommodation: input.accommodation ?? null,
  };

  const result = await generateStructuredCompletionWithRetry({
    sessionId: input.sessionId,
    stage: "passeios",
    schemaName: GATEWAY_IA_SCHEMA_NAMES.passeios,
    schema: passeiosOpcoesSchema,
    messages: buildPasseiosPrompt(context),
  });

  // Adapta o shape do schema da etapa (`precoMin`/`precoMax` já batem com o
  // vocabulário de `applyBudgetFilter`, diferente de hospedagem/destino que
  // usam nomes específicos da etapa) para o shape genérico exigido por
  // `applyBudgetFilter` (`src/lib/session-flow/budget-filter.ts`) — mesmo
  // padrão de `./destino.ts`/`./hospedagem.ts`, esta função é quem conhece
  // os dois vocabulários.
  const priceRangedSuggestions: (PriceRangedSuggestion & {
    nome: string;
    gratuito: boolean;
    duracaoAproximada: string;
  })[] = result.data.passeios.map((passeio) => ({
    nome: passeio.nome,
    precoMin: passeio.precoMin,
    precoMax: passeio.precoMax,
    gratuito: passeio.gratuito,
    duracaoAproximada: passeio.duracaoAproximada,
  }));

  const budget: BudgetInput | null =
    input.budgetAmount != null ? { amount: input.budgetAmount } : null;

  const filtered = applyBudgetFilter(priceRangedSuggestions, budget);

  return filtered.map(({ suggestion, withinBudget, exceedsBudget }) => ({
    name: suggestion.nome,
    priceMin: suggestion.precoMin,
    priceMax: suggestion.precoMax,
    isFree: suggestion.gratuito,
    durationApprox: suggestion.duracaoAproximada,
    withinBudget,
    exceedsBudget,
  }));
}
