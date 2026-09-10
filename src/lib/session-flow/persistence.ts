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
// - Autorização cross-cutting de dono de sessão (L11-T02, ainda não
//   implementada) — este módulo recebe `sessionId` já resolvido pelo
//   chamador, sem checar dono.
//
// Ordem de validação, sempre ANTES de qualquer escrita (critério de aceite
// "transição inválida não persiste nada"):
//   1. `TripSession` existe? (senão `SessionNotFoundError`)
//   2. `transitionSessionFlow(currentState, action)` decide o próximo estado
//      ou lança `InvalidTransitionError` (pular etapa, ação inválida no
//      estado atual, ação a partir de estado terminal).
//   3. Se `action === "aprovar"`: o `childData.stage` informado corresponde à
//      etapa da `TripSession.flowState` atual? Senão `InvalidChildDataError`
//      (dados ausentes ou de etapa errada).
//   Só depois desses três passos o `tx.tripSession.update` + (quando
//   aplicável) `tx.<entidadeFilha>.create(...)` acontecem, dentro da MESMA
//   transação Prisma — qualquer erro lançado antes do fim do callback do
//   `$transaction` garante rollback automático, então nada fica
//   parcialmente gravado mesmo se a checagem 3 viesse depois de alguma
//   escrita (não vem, mas a transação é a rede de segurança adicional).
//
// RN-03 ("encerrar em qualquer ponto preserva o já aprovado"): a ação
// `encerrar` NUNCA passa pelo branch de criação de entidade filha abaixo —
// só atualiza `flowState`/`status` da própria `TripSession`. Nenhuma
// `DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/
// `ItineraryItem` já gravada em aprovações anteriores é tocada.

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  transitionSessionFlow,
  type SessionFlowAction,
  type SessionFlowState,
} from "./state-machine";
import { InvalidChildDataError, SessionNotFoundError } from "./errors";

type PrismaTransactionClient = Omit<
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
  return prisma.$transaction(async (tx) => {
    const session = await tx.tripSession.findUnique({
      where: { id: input.sessionId },
      select: { flowState: true, status: true },
    });
    if (!session) {
      throw new SessionNotFoundError(input.sessionId);
    }
    const currentState = session.flowState as SessionFlowState;

    // Passo 2 — decisão pura (L4-T01). Lança `InvalidTransitionError` antes
    // de qualquer escrita para pular etapa/ação inválida/estado terminal.
    const nextState = transitionSessionFlow(currentState, input.action);

    // Passo 3 — payload da entidade filha, só para `aprovar`.
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
  });
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

// Reexportado só para permitir que testes de integração componham tipos do
// Prisma sem importar `@prisma/client` diretamente em vários lugares.
export type { Prisma };
