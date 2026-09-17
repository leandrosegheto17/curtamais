// V2-L7-T02 — ADR-009 item 3: vínculo explícito e atômico da sessão anônima
// indicada à conta autenticada. Único ponto de escrita para este caso
// (Diretriz de Implementação 3, TASK.md Seção 1: só `session-flow` escreve
// em `TripSession`) — a Server Action `vincularSessaoAConta`
// (`@/lib/actions/vinculo-conta.ts`) delega toda a escrita para cá.
//
// Contrato exato (ADR-009 item 3, pseudocódigo):
//
//   const { count } = await tx.tripSession.updateMany({
//     where: { id: sessionId, anonSessionId, userId: null },
//     data:  { userId, anonSessionId: null, linkedAt: new Date() },
//   });
//
// - `count === 1`: vinculada agora. Se a sessão (relida na MESMA transação)
//   estiver em `destino_confirmado`, a mesma transação aplica `avancar`
//   (→ `hospedagem_pendente`) via `applySessionFlowTransitionInTx`
//   (`./persistence.ts`) — a variante que recebe o `tx` de fora, para que o
//   vínculo e a continuação de transição sejam atômicos. Em qualquer outro
//   estado, só vincula.
// - `count === 0`: a sessão é relida na MESMA transação:
//   - se `userId` já é o do solicitante, sucesso idempotente (duplo clique,
//     duas abas, retry de rede) — nenhum erro;
//   - em qualquer outro caso (sessão de outra conta, cookie anônimo
//     diferente, sessão inexistente), lança `SessionNotFoundError` (404) —
//     mesma classe de erro já usada em todo o módulo `session-flow` para
//     "sessão não encontrada"/"não pertence ao solicitante" (nunca um erro
//     403 dedicado, mesmo raciocínio de `./authorization.ts`).
// - Exclusividade mútua preservada: `anonSessionId` é zerado no mesmo
//   `UPDATE` que grava `userId` — o cookie anônimo deixa de abrir a sessão a
//   partir daí (ADR-008 item 1/2, reafirmado pelo ADR-009 item 3).
// - Só a sessão indicada muda de dono. Nenhuma outra sessão do mesmo cookie
//   é tocada.
// - Sem retry automático no servidor (ADR-009 item 3, "Sem retry automático
//   no servidor"): qualquer falha lançada dentro da transação causa rollback
//   automático do Prisma — a sessão anônima permanece intacta (RF-16.8).

import { prisma } from "@/lib/prisma";
import {
  applySessionFlowTransitionInTx,
  type PrismaTransactionClient,
} from "./persistence";
import { SessionNotFoundError } from "./errors";
import type { SessionFlowState } from "./state-machine";

export type LinkAnonymousSessionToUserInput = {
  sessionId: string;
  /** `userId` já confirmado como de um `User` existente pelo chamador
   * (`resolveRequestIdentity`, V2-L6-T02) — este módulo não revalida. */
  userId: string;
  /** Cookie `anon_session_id` da requisição corrente, nunca do corpo — lido
   * pelo chamador (`resolveRequestIdentity`) e só repassado aqui para a
   * condição do `updateMany`. */
  anonSessionId: string | null;
};

export type LinkAnonymousSessionToUserResult = {
  /** `"vinculada"` quando o `updateMany` afetou a linha agora;
   * `"idempotente"` quando a sessão já pertencia a este `userId` antes desta
   * chamada (`count === 0`, mesmo dono). */
  status: "vinculada" | "idempotente";
  sessionId: string;
  /** `flowState` FINAL — já reflete a continuação de transição aplicada
   * (`destino_confirmado` → `hospedagem_pendente`), quando aplicável. */
  flowState: SessionFlowState;
};

/**
 * Vincula, de forma atômica, a `TripSession` `input.sessionId` à conta
 * `input.userId` — ver contrato completo no cabeçalho do arquivo. Lança
 * `SessionNotFoundError` para qualquer caso que não seja vínculo bem
 * sucedido nem idempotência (posse de outra conta, cookie anônimo
 * divergente, sessão inexistente).
 */
export async function linkAnonymousSessionToUser(
  input: LinkAnonymousSessionToUserInput,
): Promise<LinkAnonymousSessionToUserResult> {
  return prisma.$transaction(async (tx: PrismaTransactionClient) => {
    const { count } = await tx.tripSession.updateMany({
      where: {
        id: input.sessionId,
        anonSessionId: input.anonSessionId,
        userId: null,
      },
      data: {
        userId: input.userId,
        anonSessionId: null,
        linkedAt: new Date(),
      },
    });

    if (count === 1) {
      const linked = await tx.tripSession.findUnique({
        where: { id: input.sessionId },
        select: { flowState: true },
      });
      // Nunca deveria ser nulo: acabamos de atualizar esta mesma linha,
      // dentro da mesma transação (read-your-writes) — guarda defensiva
      // (Diretriz de Implementação 9, TASK.md Seção 1).
      if (!linked) {
        throw new SessionNotFoundError(input.sessionId);
      }

      let flowState = linked.flowState as SessionFlowState;
      if (flowState === "destino_confirmado") {
        // Continuação no mesmo passo (ADR-009 item 3): a intenção registrada
        // quando o usuário clicou em "Confirmar e continuar" é retomada
        // agora, na MESMA transação do vínculo.
        const advanced = await applySessionFlowTransitionInTx(tx, {
          sessionId: input.sessionId,
          action: "avancar",
        });
        flowState = advanced.flowState;
      }

      return {
        status: "vinculada" as const,
        sessionId: input.sessionId,
        flowState,
      };
    }

    // count === 0 — relê a linha na MESMA transação para distinguir
    // idempotência de negação (ADR-009 item 3).
    const existing = await tx.tripSession.findUnique({
      where: { id: input.sessionId },
      select: { userId: true, flowState: true },
    });

    if (existing && existing.userId === input.userId) {
      return {
        status: "idempotente" as const,
        sessionId: input.sessionId,
        flowState: existing.flowState as SessionFlowState,
      };
    }

    throw new SessionNotFoundError(input.sessionId);
  });
}
