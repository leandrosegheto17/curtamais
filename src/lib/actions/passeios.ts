"use server";

// L9-T03 — Server Actions da tela T07 (Sugestões de passeios, RF-07.3,
// UX-SPEC.md Seção 2 "T07 — Sugestões de passeios").
//
// Consome, sem duplicar lógica:
// - `generatePasseiosSuggestions` (`@/lib/stage-rules`, L9-T01) — regra
//   RF-07.1/RF-07.2/RF-10 (chamada ao Gateway de IA + filtro de orçamento).
// - `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02) — único ponto
//   autorizado a escrever em `TripSession`/`ActivityApproval` (Diretriz de
//   Implementação 3, TASK.md Seção 1). Nenhuma função abaixo chama
//   `prisma.tripSession.update`/`prisma.activityApproval.createMany`
//   diretamente.
//
// Mesmo padrão exato já estabelecido por `src/lib/actions/hospedagem.ts`
// (L8-T03) e `src/lib/actions/destino.ts` (L7-T03) — mesma forma de resolver
// sessão/etapa, mesma forma de revalidar payload antes de persistir. Mesmo
// desvio estrutural de hospedagem em relação a destino (INTENCIONAL,
// confirmado nesta tarefa lendo UX-SPEC.md T07: "Rodapé de decisão igual às
// etapas anteriores" reaproveita o mesmo rodapé de T04/T06 — continuar para
// roteiro, ou encerrar aqui — e não há nenhuma tela de confirmação
// intermediária própria de passeios equivalente a T05/destino): passeios NÃO
// tem uma tela de confirmação separada entre aprovar e avançar de etapa. Por
// isso `aprovarSelecaoPasseios` abaixo encadeia as DUAS ações da state
// machine (`aprovar` seguida de `avancar`) na mesma Server Action,
// exatamente como `aprovarHospedagem` (`hospedagem.ts`).
//
// Diferença chave de hospedagem/destino (investigação desta tarefa,
// `prisma/schema.prisma`/`persistence.ts`, L4-T02): `ActivityApproval` é uma
// lista 0..n por sessão, não um único registro 0..1. `persistence.ts` já
// espera `childData: { stage: "passeios", activities: [...] }` e persiste via
// `tx.activityApproval.createMany` — nenhuma mudança necessária em
// `persistence.ts` para esta tarefa, ele já foi desenhado em L4-T02 prevendo
// exatamente este shape.
//
// Decisão de contrato de payload (RF-07.3 — "podendo remover itens
// individuais da lista sugerida antes de aprovar"): `aprovarSelecaoPasseios`
// recebe só os itens JÁ FILTRADOS pelo client (checkbox desmarcado/removido
// nunca entra no array `selecionados`) — mesmo padrão de `aprovarHospedagem`/
// `aprovarDestinoSugerido`, que recebem só o que já foi decidido pela UI, não
// a lista completa mais uma flag por item. Isso não abre mão de revalidação:
// cada item do array recebido é revalidado individualmente (nome/duração
// vazios, faixa de preço inválida) antes de persistir, mesmo raciocínio de
// `assertValidAccommodationPayload` (`hospedagem.ts`, RL8-T02) — o vetor de
// risco não é "o client mentiu sobre o que foi removido" (isso é uma decisão
// de produto legítima do usuário, sem consequência de segurança), é "o
// client adulterou o conteúdo de um item que sobreviveu à remoção".
//
// Sanitização L11-T03/RL8-T02 (aplicada nesta tarefa desde o início, não
// como débito futuro — ver atribuição desta tarefa): `name`/`durationApprox`
// de cada item são texto livre gerado pelo LLM que volta ao servidor via
// client no momento da aprovação e é interpolado literalmente em
// `buildRoteiroPrompt` (`@/lib/gateway-ia/prompts.ts`) assim que a sessão
// avança — mesmo vetor já mitigado para hospedagem em RL8-T02. Sanitizados
// via `sanitizeFreeTextForPrompt` ANTES de qualquer validação de "vazio", e é
// o valor sanitizado (nunca o original) que chega a
// `applySessionFlowTransition`/`ActivityApproval`.
//
// Fora de escopo desta tarefa: UI de lista/checkbox (L9-T02, tarefa
// paralela — a remoção client-side em si não é responsabilidade desta Server
// Action, só a revalidação do que sobra).
//
// V2-L6-T06 (ADR-009 item 2, RF-16.7) — Verificação de conta no servidor:
// `gerarSugestoesPasseios`/`aprovarSelecaoPasseios` chamam
// `assertSessionAccess(sessionId, session, { exigeConta: true })`
// explicitamente (a primeira lê `TripSession` diretamente, fora do módulo
// `session-flow`; a segunda passou a buscar o registro de posse por conta
// própria, ANTES de qualquer persistência, já que
// `applySessionFlowTransition` internamente continua chamando
// `assertSessionOwnership`/`exigeConta: false` — checagem de POSSE, não de
// CONTA — ver `@/lib/session-flow/authorization.ts`). Em ambas, uma sessão
// anônima ainda não vinculada a uma conta lança `ContaNecessariaError`,
// capturada aqui e convertida num resultado discriminado
// (`{ status: "conta_necessaria", sessionId }`) — nunca deixada vazar como
// exceção não tratada (contrato documentado em `ContaNecessariaError`,
// `authorization.ts`). Em `gerarSugestoesPasseios` essa checagem acontece
// ANTES de qualquer leitura de `DestinationApproval`/`AccommodationApproval`
// e, portanto, antes de `generatePasseiosSuggestions` (Gateway de IA) ser
// chamado — critério de aceite desta tarefa. Casos de sucesso (`status:
// "ok"`) mantêm exatamente o mesmo payload que as funções já devolviam antes
// desta tarefa, só envelopado no discriminante.
//
// Consumidores destes dois novos formatos de retorno discriminado
// (`PasseiosSugestoesScreen`/`app/passeios/page.tsx`) ainda não foram
// adaptados — fora de escopo desta tarefa (BE), é o escopo de V2-L7-T07
// (FE, já dependente de V2-L6-T05/T06/T07 no TASK.md). Até lá, o
// type-check desses dois arquivos fica quebrado nesta branch/lote — esperado
// pela sequência de tarefas documentada, sinalizado aqui para quem revisar o
// `npx tsc --noEmit` deste lote.

import { prisma } from "@/lib/prisma";
import { generatePasseiosSuggestions } from "@/lib/stage-rules";
import type { PasseiosSuggestionResult } from "@/lib/stage-rules";
import {
  applySessionFlowTransition,
  assertSessionAccess,
  ContaNecessariaError,
  SessionNotFoundError,
} from "@/lib/session-flow";
import { sanitizeFreeTextForPrompt } from "@/lib/gateway-ia/prompt-injection-guard";
import {
  EmptyPasseiosSelectionError,
  InvalidPasseioSuggestionError,
  PasseiosContextoIncompletoError,
  PasseiosEtapaInvalidaError,
} from "./passeios-errors";

/**
 * RL8-T02 (mesmo raciocínio aplicado a hospedagem, aplicado aqui desde o
 * início desta tarefa): teto de sanidade para os dois campos de texto livre
 * de um item de passeio que são interpolados literalmente em
 * `buildRoteiroPrompt` (`@/lib/gateway-ia/prompts.ts`) assim que a sessão
 * avança para roteiro.
 */
const ACTIVITY_NAME_MAX_LENGTH = 200;
const ACTIVITY_DURATION_MAX_LENGTH = 100;

/** Mesmo teto de sanidade de preço já adotado por `destino.ts`/`hospedagem.ts`
 * (`MAX_SANE_PRICE_BRL`) — usado aqui só para rejeitar um payload de item de
 * passeio obviamente adulterado vindo do cliente, não para reimplementar a
 * validação de plausibilidade do Gateway de IA (essa já rodou dentro de
 * `generatePasseiosSuggestions`/L3-T03 antes do item chegar à UI). */
const MAX_SANE_PRICE_BRL = 1_000_000;

export type { PasseiosSuggestionResult };

/** Resultado discriminado comum aos dois pontos de entrada de T07 que exigem
 * conta (V2-L6-T06, ADR-009 item 2) — ver nota no cabeçalho do arquivo. */
export type PasseiosContaNecessariaResult = {
  status: "conta_necessaria";
  sessionId: string;
};

export type GerarSugestoesPasseiosResult =
  | { status: "ok"; passeios: PasseiosSuggestionResult[] }
  | PasseiosContaNecessariaResult;

/**
 * RF-07.1/RF-07.2/RF-10 — gera a lista de passeios/atividades para a sessão
 * (delegado a `generatePasseiosSuggestions`, L9-T01). Usada tanto para o
 * carregamento inicial de T07 quanto para "Ajustar" (mesmo rodapé de
 * decisão das etapas anteriores) — a mesma função, chamada de novo pela UI;
 * nenhuma transição de estado acontece aqui, a sessão permanece em
 * `passeios_pendente`.
 *
 * V2-L6-T06 (RF-16.7) — devolve `{ status: "conta_necessaria", sessionId }`
 * sem chamar `generatePasseiosSuggestions`/Gateway de IA quando a sessão
 * ainda é anônima (posse confirmada, mas sem conta vinculada).
 */
export async function gerarSugestoesPasseios(
  sessionId: string,
): Promise<GerarSugestoesPasseiosResult> {
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

  // V2-L6-T06/ADR-009 item 2 — leitura direta de `TripSession` fora do
  // módulo `session-flow`: guard central chamado explicitamente aqui, ANTES
  // de qualquer chamada ao Gateway de IA. `exigeConta: true` substitui o
  // antigo `assertSessionOwnership` (que continua existindo só como alias de
  // `exigeConta: false`, `@/lib/session-flow/authorization.ts`).
  try {
    await assertSessionAccess(sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return { status: "conta_necessaria", sessionId };
    }
    throw error;
  }

  if (session.flowState !== "passeios_pendente") {
    throw new PasseiosEtapaInvalidaError(session.flowState);
  }

  if (!session.dateRangeStart || !session.dateRangeEnd) {
    // Nunca deveria acontecer — guarda defensiva, mesmo raciocínio de
    // `HospedagemContextoIncompletoError` (Diretriz de Implementação 9).
    throw new PasseiosContextoIncompletoError(sessionId);
  }

  const destination = await prisma.destinationApproval.findUnique({
    where: { sessionId },
    select: { name: true, priceRangeMin: true, priceRangeMax: true },
  });

  if (!destination) {
    // Nunca deveria acontecer: uma sessão só chega a `passeios_pendente`
    // depois de `hospedagem_aprovada` + `avancar` (RF-11), que por sua vez
    // exige `destino_confirmado` — uma `DestinationApproval` já gravada
    // (guarda defensiva).
    throw new PasseiosContextoIncompletoError(sessionId);
  }

  // Hospedagem é opcional para o contexto (`generatePasseiosSuggestions`,
  // L9-T01) — uma sessão em `passeios_pendente` sempre TEM uma
  // `AccommodationApproval` gravada (RF-11), mas o `stage-rules` não exige
  // isso, então a ausência aqui não é tratada como violação de invariante.
  const accommodation = await prisma.accommodationApproval.findUnique({
    where: { sessionId },
    select: { name: true, type: true },
  });

  const referenceDate = new Date().toISOString().slice(0, 10);

  const passeios = await generatePasseiosSuggestions({
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
    accommodation: accommodation
      ? { name: accommodation.name, type: accommodation.type }
      : null,
  });

  return { status: "ok", passeios };
}

/** Mesmo shape de `AprovarSelecaoPasseiosResult` esperado por
 * `PasseiosScreenActions` (`passeios-sugestoes-screen.tsx`, L9-T02), agora
 * envelopado em `status: "ok"` (V2-L6-T06) — ver nota no cabeçalho do
 * arquivo. */
export type AprovarPasseiosResult =
  | {
      status: "ok";
      /** RF-07.3 — aprovar passeios sempre avança para roteiro (RF-08). */
      proximaEtapa: "roteiro";
      sessionId: string;
      flowState: "roteiro_pendente";
      /** Nomes já sanitizados dos itens persistidos, na mesma ordem enviada. */
      passeios: string[];
    }
  | PasseiosContaNecessariaResult;
export type { AprovarPasseiosResult as AprovarSelecaoPasseiosResult };

/** Retorno de `assertValidActivityPayload` — os dois campos de texto já
 * sanitizados (RL8-T02) e prontos para persistir/retornar; nunca os valores
 * originais do payload do cliente. */
type SanitizedActivityText = {
  name: string;
  durationApprox: string;
};

/**
 * Revalida o payload de um item de passeio (defesa contra adulteração no
 * client — o valor "de origem" já foi validado pelo Gateway de IA em
 * `generatePasseiosSuggestions`/L3-T03, mas volta ao servidor só depois de
 * uma viagem de ida e volta pelo cliente no momento da aprovação). Mesmo
 * raciocínio de `assertValidAccommodationPayload` (`hospedagem.ts`, RL8-T02).
 *
 * Sanitiza `name`/`durationApprox` contra prompt injection via
 * `sanitizeFreeTextForPrompt` (`@/lib/gateway-ia/prompt-injection-guard`,
 * L11-T03) ANTES de qualquer validação de "vazio" — o valor sanitizado (não
 * o original) é o único que chega a `applySessionFlowTransition`/
 * `ActivityApproval`.
 */
function assertValidActivityPayload(
  item: PasseiosSuggestionResult,
): SanitizedActivityText {
  const name = sanitizeFreeTextForPrompt(item.name, {
    maxLength: ACTIVITY_NAME_MAX_LENGTH,
  });
  if (!name) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: nome ausente ou vazio.",
    );
  }
  const durationApprox = sanitizeFreeTextForPrompt(item.durationApprox, {
    maxLength: ACTIVITY_DURATION_MAX_LENGTH,
  });
  if (!durationApprox) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: duração aproximada ausente ou vazia.",
    );
  }
  const { priceMin, priceMax } = item;
  if (
    typeof priceMin !== "number" ||
    typeof priceMax !== "number" ||
    !Number.isFinite(priceMin) ||
    !Number.isFinite(priceMax)
  ) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: faixa de preço não numérica.",
    );
  }
  if (priceMin < 0 || priceMax < 0) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: faixa de preço negativa.",
    );
  }
  if (priceMin > priceMax) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: faixa de preço invertida.",
    );
  }
  if (priceMax > MAX_SANE_PRICE_BRL) {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: faixa de preço fora de um limite plausível.",
    );
  }
  if (typeof item.isFree !== "boolean") {
    throw new InvalidPasseioSuggestionError(
      "Item de passeio inválido: indicador de gratuidade ausente.",
    );
  }

  return { name, durationApprox };
}

/**
 * RF-07.3 — aprova a seleção de passeios (`selecionados`: itens já filtrados
 * pelo client — ver nota de payload no cabeçalho do arquivo — nunca
 * removidos/desmarcados) e avança direto para roteiro. Persiste via
 * `applySessionFlowTransition` (`action: "aprovar"`, grava um
 * `ActivityApproval` por item via `createMany`, `passeios_pendente` →
 * `passeios_aprovados`) e, na sequência, avança a etapa (`action: "avancar"`,
 * `passeios_aprovados` → `roteiro_pendente`) — duas chamadas sequenciais,
 * mesmo padrão de `aprovarHospedagem` (`hospedagem.ts`, L8-T03) e mesma razão
 * (nenhuma tela de confirmação intermediária própria de passeios). Nunca
 * confia cegamente no payload recebido do cliente — cada item é revalidado
 * antes de persistir (Diretriz de Implementação 9).
 *
 * Nome do parâmetro (`selecionados`) e da própria função
 * (`aprovarSelecaoPasseios`) seguem o contrato já assumido por
 * `PasseiosScreenActions`/`passeios-sugestoes-screen.tsx` (L9-T02, tarefa
 * paralela) — ver bloco "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no
 * cabeçalho daquele arquivo.
 *
 * Lança `EmptyPasseiosSelectionError` se `selecionados` vier vazio (todos os
 * itens removidos/desmarcados) — guarda server-side equivalente ao botão
 * "Aprovar seleção" ficar indisponível na UI (UX-SPEC.md T07).
 *
 * V2-L6-T06 (RF-16.7) — busca o registro de posse (`userId`/`anonSessionId`)
 * e chama `assertSessionAccess(sessionId, session, { exigeConta: true })`
 * explicitamente, ANTES de revalidar/persistir qualquer item: devolve
 * `{ status: "conta_necessaria", sessionId }` sem tocar
 * `applySessionFlowTransition` quando a sessão ainda é anônima.
 * `applySessionFlowTransition` continua chamando `assertSessionOwnership`
 * (`exigeConta: false`) internamente — checagem de POSSE, redundante mas
 * inofensiva aqui, já que a posse já foi confirmada por este guard explícito
 * (ver nota no cabeçalho do arquivo).
 */
export async function aprovarSelecaoPasseios(input: {
  sessionId: string;
  selecionados: PasseiosSuggestionResult[];
}): Promise<AprovarPasseiosResult> {
  const session = await prisma.tripSession.findUnique({
    where: { id: input.sessionId },
    select: { userId: true, anonSessionId: true },
  });

  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }

  try {
    await assertSessionAccess(input.sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return { status: "conta_necessaria", sessionId: input.sessionId };
    }
    throw error;
  }

  if (input.selecionados.length === 0) {
    throw new EmptyPasseiosSelectionError();
  }

  const sanitizedItems = input.selecionados.map((item, index) => {
    const { name, durationApprox } = assertValidActivityPayload(item);
    return {
      name,
      priceMin: item.priceMin,
      priceMax: item.priceMax,
      isFree: item.isFree,
      durationApprox,
      orderIndex: index,
    };
  });

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "aprovar",
    childData: {
      stage: "passeios",
      activities: sanitizedItems,
    },
  });

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "avancar",
  });

  return {
    status: "ok",
    proximaEtapa: "roteiro",
    sessionId: input.sessionId,
    flowState: "roteiro_pendente",
    passeios: sanitizedItems.map((item) => item.name),
  };
}

export type EncerrarResolucaoPasseiosResult = {
  /** T-END(parcial), reaproveitada em todo ponto de saída (UX-SPEC.md). */
  proximaEtapa: "encerramento";
  sessionId: string;
  flowState: "encerrada_parcial";
};

/**
 * "Encerrar aqui" a partir de T07 (mesmo rodapé de decisão das etapas
 * anteriores, UX-SPEC.md T07), levando a `T-END(parcial)`. Disponível a
 * partir de `passeios_pendente` (destino + hospedagem já aprovados, RN-03)
 * ou `passeios_aprovados` — ambos já elegíveis para a ação `encerrar` da
 * state machine (`STATES_WITH_AT_LEAST_ONE_APPROVAL`, L4-T01). Preserva os
 * `DestinationApproval`/`AccommodationApproval`/`ActivityApproval` já
 * gravados (RN-03) — `applySessionFlowTransition("encerrar")` nunca toca
 * entidade filha, só `TripSession.flowState`/`status`. Mesmo raciocínio de
 * `encerrarResolucaoHospedagem` (`hospedagem.ts`, L8-T03).
 */
export async function encerrarResolucaoPasseios(
  sessionId: string,
): Promise<EncerrarResolucaoPasseiosResult> {
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
