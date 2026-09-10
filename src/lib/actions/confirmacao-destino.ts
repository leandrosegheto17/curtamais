"use server";

// L7-T05 — Server Actions da tela T05 (Confirmação de destino, RF-11).
//
// Duas ações: "Confirmar e continuar" (`confirmarDestino`, avança de
// `destino_confirmado` para `hospedagem_pendente`) e "Trocar destino"
// (`trocarDestino`, retomada de 2026-09-10 — ver `.md/BLOCKERS.md`, Bloqueio
// 002, resolvido como ADR-006 Adendo 2, e a nota de retomada L7-T05 em
// `.md/TASK.md`, Seção 3, Lote 7). Ambas delegam para
// `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02/retomada de
// L7-T05) — Diretriz de Implementação 3, TASK.md Seção 1: nenhuma escrita em
// `TripSession` fora do Orquestrador de Sessão, nenhuma navegação
// client-side otimista.
//
// `trocarDestino` usa a ação `revisar`, adicionada à state machine
// (`src/lib/session-flow/state-machine.ts`, `REVISAR_TRANSITIONS`) nesta
// mesma retomada: transição regressiva `destino_confirmado` →
// `destino_pendente`, que também apaga a `DestinationApproval` já aprovada
// (mesma transação — `src/lib/session-flow/persistence.ts`,
// `deleteRevisarChildData`). Quem consumir esta função (L7-T04, UI) só deve
// navegar de volta ao campo de destino da tela de origem DEPOIS da
// confirmação do servidor, nunca antes/otimisticamente.
//
// Autorização de dono de sessão (L11-T02, ainda não implementada) e regra de
// orçamento (RF-10, ortogonal) seguem fora de escopo, mesma lacuna já
// documentada em `applySessionFlowTransition`/demais Server Actions do
// projeto (ex. `submeterDataLivre`, L6-T03).

import { applySessionFlowTransition } from "@/lib/session-flow";
import { InvalidConfirmacaoDestinoInputError } from "./confirmacao-destino-errors";

export interface ConfirmarDestinoInput {
  sessionId: string;
}

export interface ConfirmarDestinoResult {
  /** RF-11 — confirmar sempre avança para a etapa de hospedagem (RF-06). */
  proximaEtapa: "hospedagem";
  sessionId: string;
  flowState: "hospedagem_pendente";
}

/**
 * Server Action de T05 (Confirmação de destino) — ação "Confirmar e
 * continuar". Revalida no servidor (nunca confia em navegação client-side) e
 * delega a transição de estado para `applySessionFlowTransition`
 * (`@/lib/session-flow`), a única fronteira autorizada a escrever em
 * `TripSession` (Diretriz de Implementação 3).
 */
export async function confirmarDestino(
  input: ConfirmarDestinoInput,
): Promise<ConfirmarDestinoResult> {
  if (!input.sessionId || input.sessionId.trim().length === 0) {
    throw new InvalidConfirmacaoDestinoInputError(
      "sessionId é obrigatório para confirmar o destino.",
    );
  }

  const result = await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "avancar",
  });

  return {
    proximaEtapa: "hospedagem",
    sessionId: result.sessionId,
    flowState: "hospedagem_pendente",
  };
}

export interface TrocarDestinoInput {
  sessionId: string;
}

export interface TrocarDestinoResult {
  /** RF-11 — trocar sempre volta ao campo de destino da tela de origem. */
  proximaEtapa: "destino";
  sessionId: string;
  flowState: "destino_pendente";
}

/**
 * Server Action de T05 (Confirmação de destino) — ação "Trocar destino"
 * (retomada de L7-T05, ADR-006 Adendo 2). Revalida no servidor e delega a
 * transição regressiva (`revisar`) para `applySessionFlowTransition`, que
 * apaga a `DestinationApproval` já aprovada e regride `flowState` para
 * `destino_pendente`, na mesma transação.
 */
export async function trocarDestino(
  input: TrocarDestinoInput,
): Promise<TrocarDestinoResult> {
  if (!input.sessionId || input.sessionId.trim().length === 0) {
    throw new InvalidConfirmacaoDestinoInputError(
      "sessionId é obrigatório para trocar o destino.",
    );
  }

  const result = await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "revisar",
  });

  return {
    proximaEtapa: "destino",
    sessionId: result.sessionId,
    flowState: "destino_pendente",
  };
}
