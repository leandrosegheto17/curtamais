// L4-T02 — Persistência de transição de etapa do Orquestrador de Sessão
// (ADR-006 + Adendo 1, RF-09, RN-03, SDD.md Seção 5).
//
// Este módulo é a ÚNICA fronteira autorizada a escrever em
// `TripSession`/entidades filhas (Diretriz de Implementação 3, TASK.md Seção
// 1) — nenhuma Server Action de tela grava diretamente no Prisma Client;
// toda tela chama `applySessionFlowTransition` abaixo. Ele NÃO decide qual é
// o próximo estado (isso é `transitionSessionFlow`, `./state-machine.ts`,
// L4-T01, lógica pura sem Prisma) — só valida a transição pura primeiro e,
// se válida, grava o resultado numa única transação Prisma.
//
// Escopo desta tarefa (não confundir com tarefas futuras que a CONSOMEM):
// - Server Actions de tela (L6-T03/T05/T07, L7-T03/T05, L8-T03, L9-T03,
//   L10-T03) — ainda não existem, vão chamar este módulo.
// - Regra de orçamento (RF-10, L4-T03) — ortogonal, não tratada aqui.
//
// L11-T02 (ADR-008 item 4) — Autorização cross-cutting de dono de sessão:
// `assertSessionAccess` (`./authorization.ts`) é chamada logo após a
// checagem de existência da sessão, ANTES de qualquer decisão de transição —
// nenhuma ação (mesmo uma transição estruturalmente válida) é sequer
// avaliada para uma sessão que não pertence ao solicitante da requisição
// corrente. Dono divergente lança o MESMO `SessionNotFoundError` de "sessão
// inexistente" (nunca um erro 403 dedicado) — ver `./authorization.ts` para
// o raciocínio completo.
//
// V2-L6-T04 (ADR-009 item 1/2) — verificação de conta centralizada AQUI, não
// em cada Server Action de tela: depois que a transição já foi confirmada
// estruturalmente válida (passo 3 abaixo), recalcula-se
// `transicaoExigeConta(currentState, action)` (`./account-gate.ts`) e, se
// `true`, refaz-se o guard já com `exigeConta: true` — essa segunda chamada
// reconfirma a posse (idempotente, mesmo resultado da primeira) e lança
// `ContaNecessariaError` quando a sessão ainda é anônima (ver tabela de 5
// casos em `./authorization.ts`). A PRIMEIRA chamada ao guard (passo 2)
// continua com `exigeConta: false` de propósito: computar `exigeConta` de
// verdade exige chamar `transitionSessionFlow` internamente
// (`transicaoExigeConta`), o que só é seguro DEPOIS que a posse já foi
// confirmada — senão um solicitante ilegítimo poderia distinguir
// "transição estruturalmente inválida" (`InvalidTransitionError`) de "sessão
// não é sua" (`SessionNotFoundError`) antes de provar posse. Cada Server
// Action de tela (`V2-L6-T04..T08`) só precisa capturar `ContaNecessariaError`
// e converter num resultado discriminado (`{ status: "conta_necessaria",
// sessionId }`) — nenhuma delas passa `exigeConta` para
// `applySessionFlowTransition` diretamente, o cálculo já acontece aqui para
// toda ação/etapa, uniformemente.
//
// Ordem de validação, sempre ANTES de qualquer escrita (critério de aceite
// "transição inválida não persiste nada"):
//   1. `TripSession` existe? (senão `SessionNotFoundError`)
//   2. Dono da sessão bate com o dono esperado da requisição corrente?
//      (senão `SessionNotFoundError` — L11-T02, ver acima; `exigeConta: false`
//      nesta primeira checagem, ver nota V2-L6-T04 acima)
//   3. `transitionSessionFlow(currentState, action)` decide o próximo estado
//      ou lança `InvalidTransitionError` (pular etapa, ação inválida no
//      estado atual, ação a partir de estado terminal).
//   3b. (V2-L6-T04) A transição confirmada válida exige conta
//      (`transicaoExigeConta`)? Se sim, refaz o guard com `exigeConta: true`
//      — lança `ContaNecessariaError` se a sessão ainda é anônima.
//   4. Se `action === "aprovar"`: o `childData.stage` informado corresponde à
//      etapa da `TripSession.flowState` atual? Senão `InvalidChildDataError`
//      (dados ausentes ou de etapa errada).
//   Só depois desses passos o `tx.tripSession.update` + (quando aplicável)
//   `tx.<entidadeFilha>.create(...)` acontecem, dentro da MESMA transação
//   Prisma — qualquer erro lançado antes do fim do callback do
//   `$transaction` garante rollback automático, então nada fica
//   parcialmente gravado mesmo se alguma checagem viesse depois de alguma
//   escrita (não vem, mas a transação é a rede de segurança adicional).
//
// RN-03 ("encerrar em qualquer ponto preserva o já aprovado"): a ação
// `encerrar` NUNCA passa pelo branch de criação de entidade filha abaixo —
// só atualiza `flowState`/`status` da própria `TripSession`. Nenhuma
// `DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/
// `ItineraryItem` já gravada em aprovações anteriores é tocada.
//
// L7-T05 (retomada, ADR-006 Adendo 2) — ação `revisar`: o oposto de
// `encerrar` em termos de escrita — na MESMA transação, apaga a(s) linha(s)
// da entidade filha da PRÓPRIA etapa que está sendo revisada (nunca de outra
// etapa) antes de gravar o novo `flowState` regressivo decidido por
// `transitionSessionFlow`. `DestinationApproval`/`AccommodationApproval` são
// 0..1 por sessão; `ActivityApproval`/`ItineraryItem` são 0..n — por isso o
// apagamento usa `deleteMany({ where: { sessionId } })` para as quatro
// etapas (nunca lança se não houver linha, o que também cobre o caso —
// hoje inatingível pela state machine, mas defensivo — de `revisar` ser
// chamado sem nenhuma aprovação prévia gravada).

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  transitionSessionFlow,
  type SessionFlowAction,
  type SessionFlowState,
} from "./state-machine";
import { InvalidChildDataError, SessionNotFoundError } from "./errors";
import { assertSessionAccess } from "./authorization";
import { transicaoExigeConta } from "./account-gate";

// Exportado (V2-L7-T02) para que `./link-anonymous-session-to-user.ts` possa
// tipar o `tx` que abre e repassa a `applySessionFlowTransitionInTx` sem
// duplicar esta definição.
export type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// --- Payloads de entidade filha por etapa (RF-09, `prisma/schema.prisma`) --

export type ApproveDestinationChildData = {
  stage: "destino";
  name: string;
  /** Nullable quando `source = "user_provided"` (SDD.md Seção 5, literal). */
  justification?: string | null;
  priceRangeMin: number | string;
  priceRangeMax: number | string;
  source: "ia_suggested" | "user_provided";
};

export type ApproveAccommodationChildData = {
  stage: "hospedagem";
  name: string;
  type: string;
  pricePerNightMin: number | string;
  pricePerNightMax: number | string;
  distinctiveFeature: string;
};

export type ApproveActivityItemInput = {
  name: string;
  priceMin: number | string;
  priceMax: number | string;
  isFree: boolean;
  durationApprox: string;
  orderIndex: number;
};

export type ApproveActivitiesChildData = {
  stage: "passeios";
  /** Só os itens NÃO removidos pelo usuário (RF-07.3) — 0..n por sessão. */
  activities: ApproveActivityItemInput[];
};

export type ApproveItineraryItemInput = {
  /** Nullable: nem todo item de roteiro referencia um passeio aprovado. */
  activityId?: string | null;
  dayDate: Date;
  period: "manha" | "tarde" | "noite";
  suggestedTime: string;
  /** Nullable (SDD.md Seção 5, literal). */
  timingJustification?: string | null;
  sequenceOrder: number;
};

export type ApproveItineraryChildData = {
  stage: "roteiro";
  items: ApproveItineraryItemInput[];
};

export type ApproveStageChildData =
  | ApproveDestinationChildData
  | ApproveAccommodationChildData
  | ApproveActivitiesChildData
  | ApproveItineraryChildData;

/**
 * Etapa esperada para o payload de `aprovar`, indexada pelo `flowState`
 * ATUAL da sessão (mesmos 4 estados `*_pendente` que `transitionSessionFlow`
 * aceita para a ação `aprovar`, `./state-machine.ts`).
 */
const APPROVAL_STAGE_BY_PENDING_STATE: Partial<
  Record<SessionFlowState, ApproveStageChildData["stage"]>
> = {
  destino_pendente: "destino",
  hospedagem_pendente: "hospedagem",
  passeios_pendente: "passeios",
  roteiro_pendente: "roteiro",
};

/**
 * Etapa cuja entidade filha deve ser apagada quando `revisar` é solicitada a
 * partir do estado indexado (ADR-006 Adendo 2) — o inverso de
 * `APPROVAL_STAGE_BY_PENDING_STATE` acima: aqui a chave é o estado
 * "aprovado/confirmado" de ORIGEM da transição regressiva, não o `*_pendente`
 * de destino. Mesma cobertura de `REVISAR_TRANSITIONS`
 * (`./state-machine.ts`): só `destino_confirmado` tem uma Server
 * Action/UI consumidora hoje (`trocarDestino`, L7-T05); as outras 3 ficam
 * disponíveis para L8/L9/L10.
 */
const REVISAR_STAGE_BY_APPROVED_STATE: Partial<
  Record<SessionFlowState, ApproveStageChildData["stage"]>
> = {
  destino_confirmado: "destino",
  hospedagem_aprovada: "hospedagem",
  passeios_aprovados: "passeios",
  roteiro_aprovado: "roteiro",
};

export type SessionFlowTransitionInput =
  | { sessionId: string; action: Exclude<SessionFlowAction, "aprovar"> }
  | { sessionId: string; action: "aprovar"; childData: ApproveStageChildData };

export type SessionFlowTransitionResult = {
  sessionId: string;
  flowState: SessionFlowState;
  status: "in_progress" | "partial" | "completed" | "abandoned";
};

/**
 * Aplica uma transição de etapa (RF-05/ADR-006) e persiste o resultado numa
 * única transação Prisma: `TripSession.flowState` (+ `status` sincronizado
 * nos dois terminais, ver Adendo 1 do ADR-006) e, quando `action ===
 * "aprovar"`, a entidade filha correspondente (RF-09). Nunca grava nada se a
 * transição/payload for inválido — ver ordem de validação no cabeçalho do
 * arquivo.
 */
export async function applySessionFlowTransition(
  input: SessionFlowTransitionInput,
): Promise<SessionFlowTransitionResult> {
  return prisma.$transaction((tx) =>
    applySessionFlowTransitionInTx(tx, input),
  );
}

/**
 * V2-L7-T02 (ADR-009 item 3, "`applySessionFlowTransition` ganha uma
 * variante que recebe o `tx` de fora") — mesma lógica de
 * `applySessionFlowTransition` acima, mas SEM abrir a própria transação:
 * recebe um `tx` já aberto pelo chamador, para poder compor a continuação de
 * transição (`avancar` de `destino_confirmado` → `hospedagem_pendente`) na
 * MESMA transação Prisma que já fez o `updateMany` condicional do vínculo de
 * conta (`linkAnonymousSessionToUser`, `./link-anonymous-session-to-user.ts`)
 * — atomicidade exigida pelo critério de aceite de V2-L7-T02. Único outro
 * consumidor além de `applySessionFlowTransition` (que abre a própria
 * transação e delega para cá, acima) é `linkAnonymousSessionToUser`.
 */
export async function applySessionFlowTransitionInTx(
  tx: PrismaTransactionClient,
  input: SessionFlowTransitionInput,
): Promise<SessionFlowTransitionResult> {
  const session = await tx.tripSession.findUnique({
    where: { id: input.sessionId },
    select: {
      flowState: true,
      status: true,
      userId: true,
      anonSessionId: true,
    },
  });
  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }

  // Passo 2 (L11-T02/ADR-008) — dono da sessão bate com o dono esperado da
  // requisição corrente? Lança `SessionNotFoundError` (nunca 403) antes de
  // qualquer decisão de transição/escrita. `exigeConta: false` de
  // propósito nesta primeira checagem — ver nota V2-L6-T04 no cabeçalho do
  // arquivo sobre por que a checagem real de conta só acontece no passo 3b,
  // depois que a transição já foi confirmada estruturalmente válida.
  await assertSessionAccess(input.sessionId, session, { exigeConta: false });

  const currentState = session.flowState as SessionFlowState;

  // Passo 3 — decisão pura (L4-T01). Lança `InvalidTransitionError` antes
  // de qualquer escrita para pular etapa/ação inválida/estado terminal.
  const nextState = transitionSessionFlow(currentState, input.action);

  // Passo 3b (V2-L6-T04, ADR-009 item 1/2) — a transição já confirmada
  // válida exige conta verificada? `transicaoExigeConta` é segura de
  // chamar aqui (recalcula o mesmo `nextState` internamente, sem lançar,
  // já que a validade da transição acabou de ser confirmada acima). Só
  // refaz o guard (com `exigeConta: true`) quando a resposta é `true` —
  // reconfirma a posse (idempotente) e lança `ContaNecessariaError` quando
  // a sessão ainda é anônima.
  if (transicaoExigeConta(currentState, input.action)) {
    await assertSessionAccess(input.sessionId, session, { exigeConta: true });
  }

  // Passo 4 — payload da entidade filha, só para `aprovar`.
  if (input.action === "aprovar") {
    const expectedStage = APPROVAL_STAGE_BY_PENDING_STATE[currentState];
    if (!expectedStage || input.childData?.stage !== expectedStage) {
      throw new InvalidChildDataError(
        currentState,
        expectedStage ?? "(nenhuma)",
        input.childData?.stage,
      );
    }
  }

  // L7-T05 (retomada) — `revisar`: apaga a entidade filha da PRÓPRIA etapa
  // sendo revisada ANTES de gravar o novo `flowState`, na mesma transação.
  if (input.action === "revisar") {
    const stageToDelete = REVISAR_STAGE_BY_APPROVED_STATE[currentState];
    if (stageToDelete) {
      await deleteRevisarChildData(tx, input.sessionId, stageToDelete);
    }
  }

  // Sincronização de `status` só nos dois terminais (Adendo 1 do ADR-006);
  // fora deles, `status` permanece como já estava (default `in_progress`,
  // sem escrita adicional — `abandoned` não é escrito por este módulo).
  const syncedStatus =
    nextState === "concluida"
      ? ("completed" as const)
      : nextState === "encerrada_parcial"
        ? ("partial" as const)
        : undefined;

  await tx.tripSession.update({
    where: { id: input.sessionId },
    data: {
      flowState: nextState,
      ...(syncedStatus ? { status: syncedStatus } : {}),
    },
  });

  // RN-03: `encerrar`/`iniciar`/`ajustar`/`avancar` NUNCA chegam aqui —
  // apenas `aprovar` cria a entidade filha. Nenhuma entidade filha já
  // aprovada é tocada por nenhuma outra ação.
  if (input.action === "aprovar") {
    await persistApprovedChildData(tx, input.sessionId, input.childData);
  }

  return {
    sessionId: input.sessionId,
    flowState: nextState,
    status: syncedStatus ?? session.status,
  };
}

async function persistApprovedChildData(
  tx: PrismaTransactionClient,
  sessionId: string,
  childData: ApproveStageChildData,
): Promise<void> {
  const approvedAt = new Date();

  switch (childData.stage) {
    case "destino":
      await tx.destinationApproval.create({
        data: {
          sessionId,
          name: childData.name,
          justification: childData.justification ?? null,
          priceRangeMin: childData.priceRangeMin,
          priceRangeMax: childData.priceRangeMax,
          source: childData.source,
          approvedAt,
        },
      });
      return;
    case "hospedagem":
      await tx.accommodationApproval.create({
        data: {
          sessionId,
          name: childData.name,
          type: childData.type,
          pricePerNightMin: childData.pricePerNightMin,
          pricePerNightMax: childData.pricePerNightMax,
          distinctiveFeature: childData.distinctiveFeature,
          approvedAt,
        },
      });
      return;
    case "passeios":
      await tx.activityApproval.createMany({
        data: childData.activities.map((activity) => ({
          sessionId,
          name: activity.name,
          priceMin: activity.priceMin,
          priceMax: activity.priceMax,
          isFree: activity.isFree,
          durationApprox: activity.durationApprox,
          orderIndex: activity.orderIndex,
          approvedAt,
        })),
      });
      return;
    case "roteiro":
      await tx.itineraryItem.createMany({
        data: childData.items.map((item) => ({
          sessionId,
          activityId: item.activityId ?? null,
          dayDate: item.dayDate,
          period: item.period,
          suggestedTime: item.suggestedTime,
          timingJustification: item.timingJustification ?? null,
          sequenceOrder: item.sequenceOrder,
        })),
      });
      return;
    default: {
      // Exaustividade de tipo — nunca alcançado em runtime.
      const exhaustiveCheck: never = childData;
      throw exhaustiveCheck;
    }
  }
}

/**
 * Apaga a(s) linha(s) da entidade filha da etapa sendo revisada (ação
 * `revisar`, ADR-006 Adendo 2). Usa `deleteMany` (nunca `delete`) para as
 * quatro etapas, uniformemente: cobre tanto as etapas 0..1
 * (`DestinationApproval`/`AccommodationApproval`) quanto as 0..n
 * (`ActivityApproval`/`ItineraryItem`), e nunca lança se não houver nenhuma
 * linha para a sessão. Sempre filtrado por `sessionId` — nunca apaga linha de
 * outra sessão nem de outra etapa.
 */
async function deleteRevisarChildData(
  tx: PrismaTransactionClient,
  sessionId: string,
  stage: ApproveStageChildData["stage"],
): Promise<void> {
  switch (stage) {
    case "destino":
      await tx.destinationApproval.deleteMany({ where: { sessionId } });
      return;
    case "hospedagem":
      await tx.accommodationApproval.deleteMany({ where: { sessionId } });
      return;
    case "passeios":
      await tx.activityApproval.deleteMany({ where: { sessionId } });
      return;
    case "roteiro":
      await tx.itineraryItem.deleteMany({ where: { sessionId } });
      return;
    default: {
      // Exaustividade de tipo — nunca alcançado em runtime.
      const exhaustiveCheck: never = stage;
      throw exhaustiveCheck;
    }
  }
}

// Reexportado só para permitir que testes de integração componham tipos do
// Prisma sem importar `@prisma/client` diretamente em vários lugares.
export type { Prisma };
