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
// Autorização de dono de sessão (L11-T02, ADR-008): `applySessionFlowTransition`
// já aplica o guard central internamente, antes de decidir qualquer
// transição — nenhuma chamada adicional necessária aqui. Regra de orçamento
// (RF-10, ortogonal) segue fora de escopo.
//
// V2-L6-T04 (RF-16.7, ADR-009 item 1/2) — `confirmarDestino` avança
// `destino_confirmado` → `hospedagem_pendente` (ação `avancar`), transição
// que ENTRA num estado "pós-destino" (`hospedagem_pendente`) e por isso
// sempre exige conta verificada (`transicaoExigeConta("destino_confirmado",
// "avancar")` é sempre `true` — ver `src/lib/session-flow/account-gate.ts`).
// O cálculo de `exigeConta` e o guard em si já acontecem DENTRO de
// `applySessionFlowTransition` (`src/lib/session-flow/persistence.ts`,
// passo 3b) — esta função só precisa capturar `ContaNecessariaError` e
// converter num resultado discriminado (`{ status: "conta_necessaria",
// sessionId }`) em vez de deixá-la vazar como exceção não tratada (ADR-009
// item 2, "Contrato com o cliente": em produção o Next.js apaga
// classe/mensagem de erro de Server Actions). Sem conta, nenhuma escrita
// acontece — `applySessionFlowTransition` lança `ContaNecessariaError` de
// dentro da transação Prisma, que faz rollback automático, então a sessão
// permanece em `destino_confirmado` e a `DestinationApproval` já gravada
// anteriormente (por `aprovarDestinoSugerido`/`informarDestinoManualmente`,
// `@/lib/actions/destino.ts`) não é tocada.
//
// `trocarDestino` (ação `revisar`, `destino_confirmado` → `destino_pendente`)
// NÃO precisa desse tratamento: nem o estado de origem nem o de destino são
// "pós-destino" (`transicaoExigeConta` retorna `false`), então
// `ContaNecessariaError` nunca é lançada nesse caminho — comportamento
// inalterado.

import {
  applySessionFlowTransition,
  ContaNecessariaError,
} from "@/lib/session-flow";
import { InvalidConfirmacaoDestinoInputError } from "./confirmacao-destino-errors";

export interface ConfirmarDestinoInput {
  sessionId: string;
}

export type ConfirmarDestinoResult =
  | {
      /** RF-11 — confirmar sempre avança para a etapa de hospedagem (RF-06). */
      proximaEtapa: "hospedagem";
      sessionId: string;
      flowState: "hospedagem_pendente";
    }
  | {
      /** V2-L6-T04/RF-16.7 — sessão anônima, conta necessária para continuar
       * além de `destino_confirmado` (ADR-009). Sessão permanece em
       * `destino_confirmado`; `DestinationApproval` já gravada não é
       * desfeita. */
      status: "conta_necessaria";
      sessionId: string;
    };

/**
 * Server Action de T05 (Confirmação de destino) — ação "Confirmar e
 * continuar". Revalida no servidor (nunca confia em navegação client-side) e
 * delega a transição de estado para `applySessionFlowTransition`
 * (`@/lib/session-flow`), a única fronteira autorizada a escrever em
 * `TripSession` (Diretriz de Implementação 3). Sem conta (RF-16.7), devolve
 * um resultado discriminado em vez de lançar — ver nota V2-L6-T04 acima.
 */
export async function confirmarDestino(
  input: ConfirmarDestinoInput,
): Promise<ConfirmarDestinoResult> {
  if (!input.sessionId || input.sessionId.trim().length === 0) {
    throw new InvalidConfirmacaoDestinoInputError(
      "sessionId é obrigatório para confirmar o destino.",
    );
  }

  try {
    const result = await applySessionFlowTransition({
      sessionId: input.sessionId,
      action: "avancar",
    });

    return {
      proximaEtapa: "hospedagem",
      sessionId: result.sessionId,
      flowState: "hospedagem_pendente",
    };
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return {
        status: "conta_necessaria",
        sessionId: input.sessionId,
      };
    }
    throw error;
  }
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
