// L11-T02 — Guard central de autorização cross-cutting (ADR-008 item 4,
// SDD.md Seção 7): resolve o dono ESPERADO da requisição corrente (mesma
// regra de precedência do item 3 do ADR-008, reaproveitada via
// `resolveSessionOwner`, `L11-T02a`) e compara contra o dono PERSISTIDO na
// `TripSession` alvo (`userId`/`anonSessionId`, gravados exclusivamente por
// `createSessionWithDateRange`, `./create-session-with-range.ts`).
//
// Decisão de organização de módulo (fora de escopo do ADR-008 em si, "fica a
// critério do Executor" — ver TASK.md, atribuição de L11-T02): este arquivo
// vive dentro de `session-flow` (para ser reexportado pelo barrel único do
// módulo, `./index.ts`, mesma convenção de "importar só via
// `@/lib/session-flow`" já documentada em `./index.ts`) mas importa
// `resolveSessionOwner` de `@/lib/actions/resolve-session-owner` — o único
// lugar onde essa função pode viver, já que depende de `next/headers`/
// `next-auth` (camada de Server Action), indisponíveis dentro de
// `session-flow` (módulo de domínio/persistência puro, sem acoplamento a
// Next.js App Router). Esse import é só de VALOR (não de tipo) e não cria
// ciclo real em runtime: `resolve-session-owner.ts` importa de volta só o
// TIPO `SessionOwner` (`import type`, apagado na compilação).
//
// Regra de autorização (ADR-008 item 4, replicada aqui ao pé da letra):
// - `record.userId` não nulo E dono esperado é autenticado E os dois `userId`
//   batem; OU
// - `record.anonSessionId` não nulo E dono esperado é anônimo E os dois
//   `anonSessionId` batem.
// - Qualquer outro caso — dono divergente, `record` nulo (sessão inexistente)
//   OU `record` sem nenhum dos dois campos gravado (edge case defensivo, ex.:
//   dado legado de antes de L11-T02a) — é negado.
// - Negação SEMPRE lança `SessionNotFoundError` (nunca um erro de
//   403/"Forbidden" dedicado): mesmo erro já usado pela camada de
//   persistência para "sessão inexistente", propositalmente reaproveitado
//   aqui para que um solicitante ilegítimo nunca consiga distinguir "sessão
//   não existe" de "sessão existe mas não é sua" — ADR-008 item 4, "Toda
//   negação retorna 404, nunca 403".

import { resolveSessionOwner } from "@/lib/actions/resolve-session-owner";
import { SessionNotFoundError } from "./errors";
import type { SessionOwner } from "./create-session-with-range";

/**
 * Subconjunto de colunas de `TripSession` relevantes para a checagem de
 * dono — o mesmo shape que qualquer `select`/`findUnique` que já busca a
 * sessão só precisa estender com `userId`/`anonSessionId` para reaproveitar
 * o guard sem uma segunda ida ao banco.
 */
export type TripSessionOwnerRecord = {
  userId: string | null;
  anonSessionId: string | null;
};

/**
 * Comparação pura (sem I/O) entre o registro persistido e o dono esperado da
 * requisição corrente — extraída separadamente de `assertSessionOwnership`
 * para ser testável sem mockar `resolveSessionOwner`/Next.js.
 */
export function isSameSessionOwner(
  record: TripSessionOwnerRecord | null | undefined,
  expectedOwner: SessionOwner,
): boolean {
  if (!record) {
    return false;
  }
  if (expectedOwner.type === "user") {
    return record.userId !== null && record.userId === expectedOwner.userId;
  }
  return (
    record.anonSessionId !== null &&
    record.anonSessionId === expectedOwner.anonSessionId
  );
}

/**
 * Guard central: resolve o dono esperado da requisição corrente
 * (`resolveSessionOwner`) e valida contra o `record` já buscado pelo
 * chamador (evita uma segunda query redundante em quem já fez o
 * `findUnique`/`findUniqueOrThrow` da própria sessão). Lança
 * `SessionNotFoundError` — nunca retorna `false`/erro dedicado — para que
 * todo chamador trate autorização e "não encontrada" de forma uniforme (a
 * mesma reação de UI/Server Action para os dois casos, sem branch extra).
 *
 * Chamado no início de `applySessionFlowTransition`
 * (`./persistence.ts`) e de toda leitura direta de `TripSession` fora do
 * módulo `session-flow` (`gerarSugestoesDestino`/`gerarSugestoesHospedagem`/
 * `gerarSugestoesPasseios`, `@/lib/actions`).
 */
export async function assertSessionOwnership(
  sessionId: string,
  record: TripSessionOwnerRecord | null | undefined,
): Promise<void> {
  const expectedOwner = await resolveSessionOwner();
  if (!isSameSessionOwner(record, expectedOwner)) {
    throw new SessionNotFoundError(sessionId);
  }
}
