"use server";

// L8-T03 — Server Actions da tela T06 (Sugestões de hospedagem, RF-06.3/
// RF-05.3/RF-05.4, UX-SPEC.md Seção 2 "T06 — Sugestões de hospedagem").
//
// Consome, sem duplicar lógica:
// - `generateAccommodationSuggestions` (`@/lib/stage-rules`, L8-T01) — regra
//   RF-06.1/RF-06.2/RF-10 (chamada ao Gateway de IA + filtro de orçamento).
// - `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02) — único ponto
//   autorizado a escrever em `TripSession`/`AccommodationApproval` (Diretriz
//   de Implementação 3, TASK.md Seção 1). Nenhuma função abaixo chama
//   `prisma.tripSession.update`/`prisma.accommodationApproval.create`
//   diretamente.
//
// Mesmo padrão exato já estabelecido por `src/lib/actions/destino.ts`
// (L7-T03) — mesma forma de resolver sessão/etapa, mesma forma de revalidar
// payload de sugestão antes de persistir, mesmo raciocínio de escopo. Único
// desvio estrutural, e ele É INTENCIONAL (RF-06.3, ver abaixo): destino tem
// uma tela de confirmação própria entre a aprovação e o avanço de etapa (T05,
// `confirmarDestino`/L7-T05); hospedagem NÃO tem uma tela equivalente
// (UX-SPEC.md, T06: "'Aprovar' por bloco avança" — direto, sem uma etapa de
// confirmação intermediária). Por isso `aprovarHospedagem` abaixo encadeia as
// DUAS ações da state machine (`aprovar` seguida de `avancar`) na mesma
// Server Action, em vez de delegar o `avancar` para uma Server Action de tela
// separada — mesmo padrão de duas chamadas sequenciais a
// `applySessionFlowTransition` já usado em
// `src/lib/session-flow/__tests__/persistence.integration.test.ts` (L4-T02).
//
// Mapeamento critério de aceite → função exportada:
// - RF-06.1/.2 (gerar opções, inclui "nova rodada" ao ajustar) →
//   `gerarSugestoesHospedagem`.
// - RF-06.3 (aprovar avança para passeios) → `aprovarHospedagem`.
// - RF-05.3 ("Ajustar", UX-SPEC.md T06) → sem função dedicada, mesmo padrão
//   já adotado por `gerarSugestoesDestino`/RF-04.4 em `destino.ts` (L7-T03):
//   a própria UI chama `gerarSugestoesHospedagem` de novo (mesma sessão,
//   ainda em `hospedagem_pendente` — a ação `ajustar` da state machine é um
//   self-loop nesse estado, `./state-machine.ts`, então nenhuma chamada a
//   `applySessionFlowTransition` é necessária para "não avançar": o estado já
//   não muda por não ter havido `aprovar`) — agora passando o texto do campo
//   de feedback como segundo argumento (RL8-T01, ver nota abaixo).
// - RF-05.4 ("encerrar aqui") → `encerrarResolucaoHospedagem`.
//
// GAP RESOLVIDO por RL8-T01 (débito registrado pelo Validador — ver nota de
// implementação RL8-T01 no TASK.md, Refatoração Lote-8): RF-05.3
// (PRD-TECNICO.md) descreve "ajustar" como "gerar uma nova sugestão...
// incorporando o feedback do usuário", e UX-SPEC.md T06 menciona um "campo de
// feedback textual curto" na ação Ajustar. `StageContext`/
// `buildHospedagemPrompt` (`@/lib/gateway-ia`, L3-T02) e
// `generateAccommodationSuggestions` (`@/lib/stage-rules`, L8-T01) agora
// aceitam `adjustmentFeedback` opcional, e `gerarSugestoesHospedagem` abaixo
// repassa o segundo parâmetro `feedback` (sanitizado contra prompt injection
// via `sanitizeFreeTextForPrompt`, L11-T03, ANTES de compor o prompt) para lá.
// GAP AINDA ABERTO, fora do escopo de RL8-T01 (mesma lacuna, outra etapa): o
// "nova rodada" de T04 (RF-04.4, `gerarSugestoesDestino`/`destino.ts`,
// L7-T03) continua sem campo de feedback textual — T04 nunca teve um campo de
// feedback na UX-SPEC (só "nova rodada"/"informar manualmente"), então não é
// o mesmo gap, mas fica registrado aqui pela mesma razão de precedente.
//
// Fora de escopo desta tarefa: UI de cartões/estados (L8-T02, tarefa
// paralela).
//
// Autorização de dono de sessão: `applySessionFlowTransition` já aplica o
// guard internamente (L11-T02, `@/lib/session-flow/authorization.ts`) —
// cobre `aprovarHospedagem`/`encerrarResolucaoHospedagem` abaixo, ambas
// delegadas. `gerarSugestoesHospedagem` lê `TripSession` diretamente (fora do
// módulo `session-flow`), então chama `assertSessionOwnership` explicitamente
// logo após a checagem de existência.

import { prisma } from "@/lib/prisma";
import { generateAccommodationSuggestions } from "@/lib/stage-rules";
import type { AccommodationSuggestionResult } from "@/lib/stage-rules";
import {
  applySessionFlowTransition,
  assertSessionOwnership,
  SessionNotFoundError,
} from "@/lib/session-flow";
import { sanitizeFreeTextForPrompt } from "@/lib/gateway-ia/prompt-injection-guard";
import {
  HospedagemContextoIncompletoError,
  HospedagemEtapaInvalidaError,
  InvalidHospedagemSuggestionError,
} from "./hospedagem-errors";

/**
 * RL8-T02 (achado de segurança do Validador/DevSecOps, `.md/BLOCKERS.md`) —
 * mesmos limites de tamanho de `DESTINO_MAX_LENGTH` (`destino.ts`, L11-T03),
 * aplicados aos três campos de texto livre de uma opção de hospedagem que já
 * são interpolados literalmente em `buildPasseiosPrompt`/`buildRoteiroPrompt`
 * (`@/lib/gateway-ia/prompts.ts`) assim que a sessão avança — `name`/`type`
 * hoje, `distinctiveFeature` sanitizado por defesa em profundidade mesmo sem
 * consumidor de prompt atual (evita reabrir o mesmo gap se um prompt futuro
 * passar a interpolá-lo, mesmo raciocínio "neutralização, não rejeição" de
 * `prompt-injection-guard.ts`).
 */
const ACCOMMODATION_NAME_MAX_LENGTH = 200;
const ACCOMMODATION_TYPE_MAX_LENGTH = 100;
const ACCOMMODATION_DISTINCTIVE_FEATURE_MAX_LENGTH = 500;

/**
 * RL8-T01 (RF-05.3, UX-SPEC.md T06 — "campo de feedback textual curto") —
 * mesmo raciocínio de tamanho de `DESTINO_MAX_LENGTH` (`destino.ts`,
 * L7-T03/L11-T03): teto de sanidade para um campo descrito como "curto" pela
 * UX-SPEC, aplicado ANTES de o texto entrar em `StageContext`/ser
 * interpolado em `buildHospedagemPrompt` (`@/lib/gateway-ia/prompts.ts`) —
 * mesmo padrão de `sanitizeFreeTextForPrompt` já usado por
 * `informarDestinoManualmente` (`destino.ts`).
 */
const FEEDBACK_MAX_LENGTH = 300;

/** Mesmo teto de sanidade de preço já adotado por `destino.ts`
 * (`MAX_SANE_PRICE_BRL`, L7-T03) e por `src/lib/gateway-ia/validation.ts`
 * (`MAX_PLAUSIBLE_PRICE_BRL`) — usado aqui só para rejeitar um payload de
 * sugestão obviamente adulterado vindo do cliente, não para reimplementar a
 * validação de plausibilidade do Gateway de IA (essa já rodou dentro de
 * `generateAccommodationSuggestions`/L3-T03 antes da opção chegar à UI). */
const MAX_SANE_PRICE_BRL = 1_000_000;

export type { AccommodationSuggestionResult };

/**
 * RF-06.1/RF-06.2/RF-10 — gera exatamente 3 opções de hospedagem para a
 * sessão (delegado a `generateAccommodationSuggestions`, L8-T01). Usada tanto
 * para o carregamento inicial de T06 quanto para "Ajustar" (RF-05.3) — a
 * mesma função, chamada de novo pela UI; nenhuma transição de estado
 * acontece aqui, a sessão permanece em `hospedagem_pendente`.
 *
 * RL8-T01 (RF-05.3, UX-SPEC.md T06 — resolve o gap antes documentado neste
 * arquivo): `feedback` opcional — texto livre digitado pelo usuário no campo
 * de ajuste. Sanitizado via `sanitizeFreeTextForPrompt`
 * (`@/lib/gateway-ia/prompt-injection-guard`, L11-T03) ANTES de ser repassado
 * a `generateAccommodationSuggestions`/`StageContext.adjustmentFeedback` —
 * mesmo padrão já usado por `informarDestinoManualmente` (`destino.ts`).
 * `undefined`/vazio após sanitização: nenhum feedback é repassado (mesmo
 * comportamento de antes desta tarefa).
 */
export async function gerarSugestoesHospedagem(
  sessionId: string,
  feedback?: string,
): Promise<AccommodationSuggestionResult[]> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      budgetAmount: true,
      budgetCurrency: true,
      userId: true,
      anonSessionId: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // L11-T02/ADR-008 — leitura direta de `TripSession` fora do módulo
  // `session-flow`: guard central chamado explicitamente aqui.
  await assertSessionOwnership(sessionId, session);

  if (session.flowState !== "hospedagem_pendente") {
    throw new HospedagemEtapaInvalidaError(session.flowState);
  }

  if (!session.dateRangeStart || !session.dateRangeEnd) {
    // Nunca deveria acontecer — guarda defensiva, mesmo raciocínio de
    // `DestinoContextoIncompletoError` (Diretriz de Implementação 9).
    throw new HospedagemContextoIncompletoError(sessionId);
  }

  const destination = await prisma.destinationApproval.findUnique({
    where: { sessionId },
    select: { name: true, priceRangeMin: true, priceRangeMax: true },
  });

  if (!destination) {
    // Nunca deveria acontecer: uma sessão só chega a `hospedagem_pendente`
    // depois de `destino_confirmado` + `avancar` (RF-11), que exige uma
    // `DestinationApproval` já gravada (guarda defensiva).
    throw new HospedagemContextoIncompletoError(sessionId);
  }

  const referenceDate = new Date().toISOString().slice(0, 10);

  const adjustmentFeedback = sanitizeFreeTextForPrompt(feedback, {
    maxLength: FEEDBACK_MAX_LENGTH,
  });

  return generateAccommodationSuggestions({
    sessionId,
    referenceDate,
    dateRangeStart: session.dateRangeStart.toISOString().slice(0, 10),
    dateRangeEnd: session.dateRangeEnd.toISOString().slice(0, 10),
    budgetAmount: session.budgetAmount ? session.budgetAmount.toNumber() : null,
    budgetCurrency: session.budgetCurrency,
    destination: {
      name: destination.name,
      priceRangeMin: destination.priceRangeMin.toNumber(),
      priceRangeMax: destination.priceRangeMax.toNumber(),
    },
    adjustmentFeedback: adjustmentFeedback || null,
  });
}

export type AprovarHospedagemResult = {
  /** RF-06.3 — aprovar hospedagem sempre avança para passeios (RF-07). */
  proximaEtapa: "passeios";
  sessionId: string;
  flowState: "passeios_pendente";
  hospedagem: string;
};

/** Retorno de `assertValidAccommodationPayload` — os três campos de texto já
 * sanitizados (RL8-T02) e prontos para persistir/retornar; nunca os valores
 * originais do payload do cliente. */
type SanitizedAccommodationText = {
  name: string;
  type: string;
  distinctiveFeature: string;
};

/**
 * Revalida o payload de uma opção de hospedagem (defesa contra adulteração
 * no client — o valor "de origem" já foi validado pelo Gateway de IA em
 * `generateAccommodationSuggestions`/L3-T03, mas volta ao servidor só depois
 * de uma viagem de ida e volta pelo cliente no momento da aprovação). Mesmo
 * raciocínio de `assertValidSuggestionPayload` em `destino.ts` (L7-T03).
 *
 * RL8-T02 (achado de segurança do Validador/DevSecOps): além da faixa de
 * preço, `name`/`type`/`distinctiveFeature` agora também são sanitizados
 * contra prompt injection via `sanitizeFreeTextForPrompt`
 * (`@/lib/gateway-ia/prompt-injection-guard`, L11-T03) ANTES de qualquer
 * validação de "vazio" — o valor sanitizado (não o original) é o único que
 * chega a `applySessionFlowTransition`/`AccommodationApproval`. Antes desta
 * tarefa só a faixa de preço era revalidada; um payload adulterado com uma
 * instrução embutida em `name`/`type` sobrevivia intacto e virava instrução
 * de prompt assim que `buildPasseiosPrompt`/`buildRoteiroPrompt`
 * interpolassem `context.accommodation.name`/`.type` de volta (mesmo vetor
 * já mitigado para destino manual em L11-T03).
 */
function assertValidAccommodationPayload(
  suggestion: AccommodationSuggestionResult,
): SanitizedAccommodationText {
  const name = sanitizeFreeTextForPrompt(suggestion.name, {
    maxLength: ACCOMMODATION_NAME_MAX_LENGTH,
  });
  if (!name) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: nome ausente ou vazio.",
    );
  }
  const type = sanitizeFreeTextForPrompt(suggestion.type, {
    maxLength: ACCOMMODATION_TYPE_MAX_LENGTH,
  });
  if (!type) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: tipo ausente ou vazio.",
    );
  }
  const distinctiveFeature = sanitizeFreeTextForPrompt(
    suggestion.distinctiveFeature,
    { maxLength: ACCOMMODATION_DISTINCTIVE_FEATURE_MAX_LENGTH },
  );
  if (!distinctiveFeature) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: característica distintiva ausente ou vazia.",
    );
  }
  const { pricePerNightMin, pricePerNightMax } = suggestion;
  if (
    typeof pricePerNightMin !== "number" ||
    typeof pricePerNightMax !== "number" ||
    !Number.isFinite(pricePerNightMin) ||
    !Number.isFinite(pricePerNightMax)
  ) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: faixa de preço não numérica.",
    );
  }
  if (pricePerNightMin < 0 || pricePerNightMax < 0) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: faixa de preço negativa.",
    );
  }
  if (pricePerNightMin > pricePerNightMax) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: faixa de preço invertida.",
    );
  }
  if (pricePerNightMax > MAX_SANE_PRICE_BRL) {
    throw new InvalidHospedagemSuggestionError(
      "Opção de hospedagem inválida: faixa de preço fora de um limite plausível.",
    );
  }

  return { name, type, distinctiveFeature };
}

/**
 * RF-06.3 — aprova uma das opções geradas por `gerarSugestoesHospedagem` e
 * avança direto para passeios. Persiste via `applySessionFlowTransition`
 * (`action: "aprovar"`, grava `AccommodationApproval`,
 * `hospedagem_pendente` → `hospedagem_aprovada`) e, na sequência, avança a
 * etapa (`action: "avancar"`, `hospedagem_aprovada` → `passeios_pendente`) —
 * duas chamadas sequenciais, ver nota no cabeçalho do arquivo sobre por que
 * não há uma Server Action de "confirmar" separada para hospedagem (diferente
 * de destino/T05). Nunca confia cegamente no payload recebido do cliente —
 * revalidado antes de persistir (Diretriz de Implementação 9).
 */
export async function aprovarHospedagem(input: {
  sessionId: string;
  suggestion: AccommodationSuggestionResult;
}): Promise<AprovarHospedagemResult> {
  const { name, type, distinctiveFeature } = assertValidAccommodationPayload(
    input.suggestion,
  );

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "aprovar",
    childData: {
      stage: "hospedagem",
      name,
      type,
      pricePerNightMin: input.suggestion.pricePerNightMin,
      pricePerNightMax: input.suggestion.pricePerNightMax,
      distinctiveFeature,
    },
  });

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "avancar",
  });

  return {
    proximaEtapa: "passeios",
    sessionId: input.sessionId,
    flowState: "passeios_pendente",
    hospedagem: name,
  };
}

export type EncerrarResolucaoHospedagemResult = {
  /** T-END(parcial), reaproveitada em todo ponto de saída (UX-SPEC.md). */
  proximaEtapa: "encerramento";
  sessionId: string;
  flowState: "encerrada_parcial";
};

/**
 * RF-05.4 — "encerrar aqui" a partir de T06, levando a `T-END(parcial)`.
 * Disponível a partir de `hospedagem_pendente` (destino já aprovado, RN-03)
 * ou `hospedagem_aprovada` — ambos já elegíveis para a ação `encerrar` da
 * state machine (`STATES_WITH_AT_LEAST_ONE_APPROVAL`, L4-T01, já que destino
 * está confirmado em qualquer estado de hospedagem). Preserva os
 * `DestinationApproval`/`AccommodationApproval` já gravados (RN-03) —
 * `applySessionFlowTransition("encerrar")` nunca toca entidade filha, só
 * `TripSession.flowState`/`status`. Mesmo raciocínio de
 * `encerrarResolucaoDestino` (`destino.ts`, L7-T03).
 */
export async function encerrarResolucaoHospedagem(
  sessionId: string,
): Promise<EncerrarResolucaoHospedagemResult> {
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
