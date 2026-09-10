"use server";

// L7-T03 — Server Actions da tela T04 (Sugestões de destino, RF-04.3/.4/.5,
// UX-SPEC.md Seção 2 "T04 — Sugestões de destino").
//
// Consome, sem duplicar lógica:
// - `generateDestinationSuggestions` (`@/lib/stage-rules`, L7-T01) — regra
//   RF-04.1/RF-10 (chamada ao Gateway de IA + filtro de orçamento).
// - `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02) — único ponto
//   autorizado a escrever em `TripSession`/`DestinationApproval` (Diretriz de
//   Implementação 3, TASK.md Seção 1). Nenhuma função abaixo chama
//   `prisma.tripSession.update`/`prisma.destinationApproval.create`
//   diretamente.
//
// Mapeamento critério de aceite → função exportada:
// - RF-04.3 (aprovar) → `aprovarDestinoSugerido`.
// - RF-04.4 (rejeitar todas/nova rodada) → sem função dedicada: "nova
//   rodada" é a própria UI chamando `gerarSugestoesDestino` de novo (mesma
//   sessão, ainda em `destino_pendente` — nenhuma transição de estado
//   acontece ao rejeitar, só uma nova geração), e "informar manualmente" é
//   `informarDestinoManualmente` abaixo. Nenhuma ação de "rejeitar" própria é
//   necessária porque `destino_pendente` já é o estado de repouso desta tela
//   (RF-04.4 não avança nem retrocede etapa, RN-01).
// - Atalho "Já sei o destino, quero informar" (UX-SPEC.md, disponível a
//   qualquer momento em T04, não só depois de rejeitar todas) →
//   `informarDestinoManualmente`.
// - RF-04.5 ("encerrar aqui", T-END parcial) → `encerrarResolucaoDestino`.
//   IMPORTANTE (investigação desta tarefa): UX-SPEC.md deixa explícito que o
//   rodapé com a opção "encerrar aqui" só aparece "Depois de aprovar um
//   bloco" (T04, linhas 86-88) — ou seja, a partir do estado
//   `destino_confirmado`, não de `destino_pendente`. `destino_confirmado`
//   JÁ está entre os estados elegíveis para a ação `encerrar` da state
//   machine (`STATES_WITH_AT_LEAST_ONE_APPROVAL`,
//   `src/lib/session-flow/state-machine.ts`, L4-T01) — portanto, ao
//   contrário da hipótese de inconsistência levantada na atribuição desta
//   tarefa, NÃO há divergência real entre RF-04.5 e a state machine já
//   implementada: "encerrar aqui" em T04 só é oferecido/chamado DEPOIS de
//   `aprovarDestinoSugerido`/`informarDestinoManualmente` já terem avançado a
//   sessão para `destino_confirmado`. Nenhuma função abaixo tenta encerrar a
//   partir de `destino_pendente`.
//
// Fora de escopo desta tarefa: UI de cartões/estados (L7-T02, tarefa
// paralela); tela/Server Action de T05 — confirmação explícita de destino
// (RF-11, L7-T04/L7-T05) — `aprovarDestinoSugerido`/
// `informarDestinoManualmente` apenas indicam `proximaEtapa:
// "confirmacao_destino"`, a navegação/tela em si é de outra tarefa;
// autorização de dono de sessão (L11-T02) — todas as funções abaixo recebem
// `sessionId` já resolvido pelo chamador, sem checar dono.

import { prisma } from "@/lib/prisma";
import { generateDestinationSuggestions } from "@/lib/stage-rules";
import type { DestinationSuggestionResult } from "@/lib/stage-rules";
import { applySessionFlowTransition, SessionNotFoundError } from "@/lib/session-flow";
import { sanitizeFreeTextForPrompt } from "@/lib/gateway-ia/prompt-injection-guard";
import {
  DestinoContextoIncompletoError,
  DestinoEtapaInvalidaError,
  InvalidDestinoSuggestionError,
  InvalidManualDestinoError,
} from "./destino-errors";

/** Mesmo limite de tamanho para destino em texto livre já adotado por
 * `submeterDataLivre`/`processarFeriadoEscolhido` (L6-T03/L6-T05,
 * `DESTINO_MAX_LENGTH`/`MAX_DESTINO_LENGTH`) — reaproveitado aqui para
 * consistência entre os pontos do fluxo que coletam destino em texto livre
 * (TASK.md Seção 1, item 9). */
const DESTINO_MAX_LENGTH = 200;

/** Teto de sanidade de preço para o mesmo motivo documentado em
 * `src/lib/gateway-ia/validation.ts` (`MAX_PLAUSIBLE_PRICE_BRL`) — usado aqui
 * só para rejeitar um payload de sugestão obviamente adulterado vindo do
 * cliente, não para reimplementar a validação de plausibilidade do Gateway
 * de IA (essa já rodou dentro de `generateDestinationSuggestions`/L3-T03
 * antes da sugestão chegar à UI). */
const MAX_SANE_PRICE_BRL = 1_000_000;

export type { DestinationSuggestionResult };

/**
 * RF-04.1/RF-10 — gera entre 2 e 4 sugestões de destino para a sessão
 * (delegado a `generateDestinationSuggestions`, L7-T01). Usada tanto para o
 * carregamento inicial de T04 quanto para "nova rodada" após rejeitar todas
 * as sugestões (RF-04.4) — a mesma função, chamada de novo pela UI; nenhuma
 * transição de estado acontece aqui, a sessão permanece em
 * `destino_pendente`.
 */
export async function gerarSugestoesDestino(
  sessionId: string,
): Promise<DestinationSuggestionResult[]> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      budgetAmount: true,
      budgetCurrency: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  if (session.flowState !== "destino_pendente") {
    throw new DestinoEtapaInvalidaError(session.flowState);
  }

  if (!session.dateRangeStart || !session.dateRangeEnd) {
    // Nunca deveria acontecer, dado que toda sessão que chega a
    // `destino_pendente` foi criada via `createSessionWithDateRange`
    // (L6-T03/T05/T07), que sempre grava o range antes de `iniciar` —
    // guarda defensiva (Diretriz de Implementação 9).
    throw new DestinoContextoIncompletoError(sessionId);
  }

  const referenceDate = new Date().toISOString().slice(0, 10);

  return generateDestinationSuggestions({
    sessionId,
    referenceDate,
    dateRangeStart: session.dateRangeStart.toISOString().slice(0, 10),
    dateRangeEnd: session.dateRangeEnd.toISOString().slice(0, 10),
    budgetAmount: session.budgetAmount ? session.budgetAmount.toNumber() : null,
    budgetCurrency: session.budgetCurrency,
  });
}

export type AprovarDestinoResult = {
  /** RF-11 — T05 sempre aparece depois, mesmo vindo de aprovação em T04 (UX-SPEC.md). */
  proximaEtapa: "confirmacao_destino";
  sessionId: string;
  flowState: "destino_confirmado";
  destino: string;
};

/**
 * Revalida o payload de uma sugestão (defesa contra adulteração no client —
 * o valor "de origem" já foi validado pelo Gateway de IA em
 * `generateDestinationSuggestions`/L3-T03, mas volta ao servidor só depois de
 * uma viagem de ida e volta pelo cliente no momento da aprovação).
 */
function assertValidSuggestionPayload(
  suggestion: DestinationSuggestionResult,
): void {
  const name = suggestion.name?.trim();
  if (!name) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: nome ausente ou vazio.",
    );
  }
  const justification = suggestion.justification?.trim();
  if (!justification) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: justificativa ausente ou vazia.",
    );
  }
  const { priceRangeMin, priceRangeMax } = suggestion;
  if (
    typeof priceRangeMin !== "number" ||
    typeof priceRangeMax !== "number" ||
    !Number.isFinite(priceRangeMin) ||
    !Number.isFinite(priceRangeMax)
  ) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: faixa de preço não numérica.",
    );
  }
  if (priceRangeMin < 0 || priceRangeMax < 0) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: faixa de preço negativa.",
    );
  }
  if (priceRangeMin > priceRangeMax) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: faixa de preço invertida.",
    );
  }
  if (priceRangeMax > MAX_SANE_PRICE_BRL) {
    throw new InvalidDestinoSuggestionError(
      "Sugestão de destino inválida: faixa de preço fora de um limite plausível.",
    );
  }
}

/**
 * RF-04.3 — aprova uma das sugestões geradas por `gerarSugestoesDestino`.
 * Persiste via `applySessionFlowTransition("aprovar", ...)` (`source:
 * "ia_suggested"`) e avança `destino_pendente` → `destino_confirmado`. Nunca
 * confia cegamente no payload recebido do cliente — revalidado antes de
 * persistir (Diretriz de Implementação 9).
 */
export async function aprovarDestinoSugerido(input: {
  sessionId: string;
  suggestion: DestinationSuggestionResult;
}): Promise<AprovarDestinoResult> {
  assertValidSuggestionPayload(input.suggestion);

  const name = input.suggestion.name.trim();
  const justification = input.suggestion.justification.trim();

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "aprovar",
    childData: {
      stage: "destino",
      name,
      justification,
      priceRangeMin: input.suggestion.priceRangeMin,
      priceRangeMax: input.suggestion.priceRangeMax,
      source: "ia_suggested",
    },
  });

  return {
    proximaEtapa: "confirmacao_destino",
    sessionId: input.sessionId,
    flowState: "destino_confirmado",
    destino: name,
  };
}

/**
 * RF-04.3 (atalho "Já sei o destino, quero informar", UX-SPEC.md) — aprova um
 * destino digitado manualmente pelo usuário, sem passar pelo Gateway de IA.
 * Mesmo padrão de placeholder de preço já adotado por
 * `createSessionWithDateRange` (`source: "user_provided"`,
 * `justification: null`, faixa de preço `0`/`0` — TASK.md Seção 3, notas
 * L6-T03/L6-T05) para o mesmo caso de "destino sem avaliação de preço pela
 * IA". Diferente de `submeterDataLivre` (onde destino é opcional e vazio
 * significa "sem destino"), aqui o destino é OBRIGATÓRIO — vazio após
 * sanitização é erro de validação, não um ramo alternativo válido.
 *
 * L11-T03 (SDD.md Seção 7 / GUARDRAILS.md regra 18): sanitizado contra
 * prompt injection via `sanitizeFreeTextForPrompt`
 * (`@/lib/gateway-ia/prompt-injection-guard`) ANTES de persistir — este
 * valor vira `DestinationApproval.name` e, a partir de L8-T01/L9-T01/L10-T01,
 * é interpolado literalmente em `buildHospedagemPrompt`/`buildPasseiosPrompt`/
 * `buildRoteiroPrompt` (`@/lib/gateway-ia`).
 */
export async function informarDestinoManualmente(input: {
  sessionId: string;
  destino: string;
}): Promise<AprovarDestinoResult> {
  const destino = sanitizeFreeTextForPrompt(input.destino, {
    maxLength: DESTINO_MAX_LENGTH,
  });
  if (!destino) {
    throw new InvalidManualDestinoError(
      "Informe um destino antes de continuar.",
    );
  }

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "aprovar",
    childData: {
      stage: "destino",
      name: destino,
      justification: null,
      priceRangeMin: 0,
      priceRangeMax: 0,
      source: "user_provided",
    },
  });

  return {
    proximaEtapa: "confirmacao_destino",
    sessionId: input.sessionId,
    flowState: "destino_confirmado",
    destino,
  };
}

export type EncerrarResolucaoDestinoResult = {
  /** T-END(parcial), reaproveitada em todo ponto de saída (UX-SPEC.md). */
  proximaEtapa: "encerramento";
  sessionId: string;
  flowState: "encerrada_parcial";
};

/**
 * RF-04.5 — "Só queria decidir o destino — encerrar aqui", levando a
 * `T-END(parcial)`. Só oferecida pela UI (UX-SPEC.md, T04) DEPOIS de um
 * destino já ter sido aprovado (`aprovarDestinoSugerido`/
 * `informarDestinoManualmente`), ou seja, a partir de `destino_confirmado` —
 * estado já elegível para a ação `encerrar` da state machine
 * (`STATES_WITH_AT_LEAST_ONE_APPROVAL`, L4-T01). Preserva o `DestinationApproval`
 * já gravado (RN-03) — `applySessionFlowTransition("encerrar")` nunca toca
 * entidade filha, só `TripSession.flowState`/`status`.
 */
export async function encerrarResolucaoDestino(
  sessionId: string,
): Promise<EncerrarResolucaoDestinoResult> {
  await applySessionFlowTransition({
    sessionId,
    action: "encerrar",
  });

  return {
    proximaEtapa: "encerramento",
    sessionId,
    flowState: "encerrada_parcial",
  };
}
