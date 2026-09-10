// L4-T03 — Regra RF-10 (filtro/priorização de orçamento nas sugestões,
// RF-10.1/.2/.3), RN-04.
//
// Função pura, sem I/O: recebe uma lista de sugestões já geradas (destino/
// hospedagem/passeios — Gateway de IA, Lote 7/8/9, ainda não implementado) e
// um orçamento opcional, e devolve a lista pronta para exibição, sempre sem
// bloquear (RN-04/RF-10.3). Não integra com a state machine nem com
// persistência (isso é `./state-machine.ts`/`./persistence.ts`) — é
// consumida por ambos os lados (Gateway de IA e Orquestrador de Sessão) nas
// tarefas futuras L7-T01/L8-T01/L9-T01.
//
// Formato do orçamento: teto único (`budgetAmount`), não uma faixa min/max —
// espelha `TripSession.budgetAmount` (`prisma/schema.prisma`), o único campo
// de orçamento persistido (`Decimal? @map("budget_amount")`). RF-03.1(4)
// coleta o valor como "texto livre em faixa de valor", mas o dado já chega
// resolvido a um teto único neste ponto (a normalização de texto livre para
// esse teto é responsabilidade de quem popula `TripSession.budgetAmount`,
// fora do escopo desta tarefa). RF-10 não se aplica a roteiro (RF-08): a
// etapa de roteiro não tem preço próprio (SDD.md/PRD-TECNICO.md — nenhum
// campo de faixa de preço em `roteiroEstruturadoSchema`), logo esta regra só
// cobre destino/hospedagem/passeios.
//
// Interpretação adotada para "fora da faixa não aparece como prioritária"
// (RF-10.1, TASK.md Seção 3 L4-T03): REORDENAÇÃO, não remoção. As sugestões
// dentro do orçamento vêm primeiro na lista (prioridade), e as fora do
// orçamento continuam presentes, apenas depois. Motivos: (1) a redação do
// critério de aceite diz literalmente "não aparecem como prioritárias", não
// "são removidas" — texto compatível com reordenação, não com remoção; (2)
// RN-04 estabelece que orçamento "funciona só como filtro/priorização, nunca
// como impeditivo de avançar" — remover opções reduziria as alternativas
// disponíveis ao usuário sem necessidade, o que se aproxima mais de um
// "bloqueio parcial" do que RN-04 tolera; (3) RF-10.2 já cobre explicitamente
// o único caso em que uma opção fora da faixa precisa de tratamento especial
// (nenhuma dentro da faixa) — não há necessidade adicional de remover opções
// fora da faixa quando já existe ao menos uma dentro dela.

/** Qualquer sugestão com faixa de preço (destino/hospedagem/passeios). */
export interface PriceRangedSuggestion {
  precoMin: number;
  precoMax: number;
}

/** Orçamento opcional informado pelo usuário (RF-03.1 item 4 ou outra etapa). */
export interface BudgetInput {
  /** Teto de orçamento — espelha `TripSession.budgetAmount`. */
  amount: number;
}

/**
 * Resultado da regra de orçamento para uma sugestão: preserva a sugestão
 * original e adiciona a informação de compatibilidade com o orçamento,
 * necessária para a UI (`BudgetInsufficientBanner`/`PriceRangeBadge`, Lote 5)
 * sinalizar corretamente o excedente (RF-10.2) sem nunca bloquear (RN-04).
 */
export interface BudgetFilteredSuggestion<T extends PriceRangedSuggestion> {
  suggestion: T;
  /** `true` quando a sugestão cabe no orçamento informado (RF-10.1). */
  withinBudget: boolean;
  /**
   * `true` apenas na sugestão mais barata escolhida como alternativa quando
   * NENHUMA sugestão cabe no orçamento (RF-10.2) — usado pela UI para exibir
   * o aviso explícito de excedente. Sempre `false` quando há ao menos uma
   * sugestão dentro do orçamento, ou quando não há orçamento informado.
   */
  exceedsBudget: boolean;
}

/**
 * Aplica RF-10 a uma lista de sugestões com faixa de preço.
 *
 * - Sem orçamento informado (RF-10.3/RN-04): no-op — devolve a lista na
 *   mesma ordem recebida, todas com `withinBudget: true` (não filtrada) e
 *   `exceedsBudget: false`, nunca bloqueando nem distorcendo o resultado.
 * - Com orçamento informado e ao menos uma sugestão dentro da faixa
 *   (RF-10.1): reordena, sugestões dentro do orçamento primeiro (ordem
 *   estável dentro de cada grupo).
 * - Com orçamento informado e NENHUMA sugestão dentro da faixa (RF-10.2):
 *   devolve a lista completa reordenada com a mais barata primeiro,
 *   marcada com `exceedsBudget: true` — nunca lança erro, nunca retorna
 *   lista vazia.
 * - Lista de entrada vazia: devolve lista vazia (edge case, sem erro).
 *
 * Critério de "dentro do orçamento": o preço mínimo da faixa (`precoMin`) não
 * excede o teto informado — a opção é alcançável a partir do seu preço de
 * entrada, mesmo que o topo da faixa (`precoMax`) ultrapasse o teto (faixas
 * são sempre aproximadas, RN-05).
 */
export function applyBudgetFilter<T extends PriceRangedSuggestion>(
  suggestions: readonly T[],
  budget: BudgetInput | null | undefined,
): BudgetFilteredSuggestion<T>[] {
  if (suggestions.length === 0) {
    return [];
  }

  if (budget == null) {
    return suggestions.map((suggestion) => ({
      suggestion,
      withinBudget: true,
      exceedsBudget: false,
    }));
  }

  const withinBudget: T[] = [];
  const outsideBudget: T[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.precoMin <= budget.amount) {
      withinBudget.push(suggestion);
    } else {
      outsideBudget.push(suggestion);
    }
  }

  if (withinBudget.length > 0) {
    return [
      ...withinBudget.map((suggestion) => ({
        suggestion,
        withinBudget: true,
        exceedsBudget: false,
      })),
      ...outsideBudget.map((suggestion) => ({
        suggestion,
        withinBudget: false,
        exceedsBudget: false,
      })),
    ];
  }

  // RF-10.2: nenhuma sugestão cabe no orçamento — a mais barata (menor
  // `precoMin`, empate resolvido pela ordem original/estável) vai primeiro,
  // sinalizada como excedente; as demais seguem depois, sem a flag.
  const cheapestIndex = outsideBudget.reduce(
    (bestIndex, suggestion, index) =>
      suggestion.precoMin < outsideBudget[bestIndex].precoMin
        ? index
        : bestIndex,
    0,
  );
  const cheapest = outsideBudget[cheapestIndex];
  const rest = outsideBudget.filter((_, index) => index !== cheapestIndex);

  return [
    { suggestion: cheapest, withinBudget: false, exceedsBudget: true },
    ...rest.map((suggestion) => ({
      suggestion,
      withinBudget: false,
      exceedsBudget: false,
    })),
  ];
}
