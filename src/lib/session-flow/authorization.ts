// L11-T02 — Guard central de autorização cross-cutting (ADR-008 item 4,
// SDD.md Seção 7): resolve o dono ESPERADO da requisição corrente (mesma
// regra de precedência do item 3 do ADR-008, reaproveitada via
// `resolveSessionOwner`, `L11-T02a`) e compara contra o dono PERSISTIDO na
// `TripSession` alvo (`userId`/`anonSessionId`, gravados exclusivamente por
// `createSessionWithDateRange`, `./create-session-with-range.ts`).
//
// V2-L6-T03 — ADR-009 item 2 ("substitui em parte o ADR-008", cabeçalho do
// ADR-009) SUBSTITUI a regra de autorização acima por `assertSessionAccess`/
// `resolveSessionAccess`, abaixo. `assertSessionOwnership` e
// `isSameSessionOwner` (a lógica original de L11-T02, ADR-008 item 4)
// continuam neste arquivo, inalteradas em comportamento próprio, mas
// `assertSessionOwnership` deixa de ter corpo independente: passa a ser um
// ALIAS fino de `assertSessionAccess(sessionId, record, { exigeConta: false })`
// (retrocompatibilidade durante a transição — TASK.md V2-L6-T03 — sai quando
// os ~10 chamadores existentes migrarem para `assertSessionAccess` diretamente
// em `V2-L6-T04..T08`). `isSameSessionOwner` continua exportada e testada tal
// qual estava (nenhum chamador de produção a usa fora deste módulo hoje —
// mantida por retrocompatibilidade de import e cobertura de teste existente).
//
// Decisão de organização de módulo (fora de escopo do ADR-008 em si, "fica a
// critério do Executor" — ver TASK.md, atribuição de L11-T02): este arquivo
// vive dentro de `session-flow` (para ser reexportado pelo barrel único do
// módulo, `./index.ts`, mesma convenção de "importar só via
// `@/lib/session-flow`" já documentada em `./index.ts`) mas importa
// `resolveSessionOwner`/`resolveRequestIdentity` de `@/lib/actions/*` — o
// único lugar onde essas funções podem viver, já que dependem de
// `next/headers`/`next-auth`/Prisma (camada de Server Action), indisponíveis
// dentro de `session-flow` (módulo de domínio/persistência puro, sem
// acoplamento a Next.js App Router). Esses imports são só de VALOR (não de
// tipo) e não criam ciclo real em runtime: `resolve-session-owner.ts` importa
// de volta só o TIPO `SessionOwner` (`import type`, apagado na compilação);
// `resolve-request-identity.ts` não importa nada de `session-flow`.
//
// Regra de autorização ORIGINAL (ADR-008 item 4, mantida ao pé da letra só
// para `isSameSessionOwner`, hoje usada apenas pelos próprios testes deste
// arquivo — não mais pelo caminho de produção de `assertSessionOwnership`):
// - `record.userId` não nulo E dono esperado é autenticado E os dois `userId`
//   batem; OU
// - `record.anonSessionId` não nulo E dono esperado é anônimo E os dois
//   `anonSessionId` batem.
// - Qualquer outro caso — dono divergente, `record` nulo (sessão inexistente)
//   OU `record` sem nenhum dos dois campos gravado (edge case defensivo, ex.:
//   dado legado de antes de L11-T02a) — é negado.
//
// Regra de autorização ATUAL (ADR-009 item 2, tabela de 5 casos — é a que
// `assertSessionAccess`/`assertSessionOwnership` aplicam de fato hoje):
//
// | Situação do registro | Identidade da requisição | exigeConta: false | exigeConta: true |
// |---|---|---|---|
// | `userId = U` | `userId = U` | permite | permite |
// | `userId = U` | qualquer outra (inclusive o mesmo cookie de antes do vínculo) | 404 | 404 |
// | `anonSessionId = A` | cookie `A` (com ou sem conta autenticada) | permite | `ContaNecessariaError` |
// | `anonSessionId = A` | cookie diferente de `A` | 404 | 404 |
// | nenhum dos dois gravado (inclusive `record` nulo/indefinido) | qualquer | 404 | 404 |
//
// - A ordem é SEMPRE posse primeiro, conta depois: `ContaNecessariaError` só
//   é considerada depois que a posse (linha 3 da tabela) já foi confirmada.
//   Uma negação de posse (linhas 2, 4, 5) nunca vira `ContaNecessariaError`,
//   mesmo com `exigeConta: true` — continua `SessionNotFoundError`.
// - Negação de posse SEMPRE lança `SessionNotFoundError` (nunca um erro de
//   403/"Forbidden" dedicado): mesmo erro já usado pela camada de
//   persistência para "sessão inexistente", propositalmente reaproveitado
//   aqui para que um solicitante ilegítimo nunca consiga distinguir "sessão
//   não existe" de "sessão existe mas não é sua" — ADR-008 item 4/ADR-009
//   item 2, "Toda negação de posse retorna 404, nunca 403".
// - `ContaNecessariaError` NÃO é negação de posse — só é lançada para quem já
//   provou ser o dono anônimo (cookie confere), então não revela nada a
//   terceiros. Servidores/Server Actions que chamam `assertSessionAccess`
//   DEVEM capturar `ContaNecessariaError` e convertê-la num resultado
//   discriminado (`{ status: "conta_necessaria", sessionId }`) antes de
//   devolver ao cliente — em produção o Next.js apaga classe/mensagem de
//   erros lançados por Server Actions, então deixá-la vazar como exceção não
//   tratada quebra silenciosamente a experiência em vez de mostrar o convite
//   de cadastro (ADR-009 item 2, "Contrato com o cliente"). Essa conversão é
//   escopo dos CHAMADORES (`V2-L6-T04..T08`/`V2-L7-T06`/`T07`), não deste
//   módulo — aqui só garantimos que o erro é lançado de forma testável.

import { resolveRequestIdentity } from "@/lib/actions/resolve-request-identity";
import type { RequestIdentity } from "@/lib/actions/resolve-request-identity";
import { SessionNotFoundError } from "./errors";
import type { SessionOwner } from "./create-session-with-range";

/**
 * Lançado por `assertSessionAccess` quando a posse da sessão já foi
 * confirmada (o solicitante É o dono anônimo gravado), mas a transição/leitura
 * exige conta (`options.exigeConta === true`) e a identidade da requisição
 * não tem `userId` — ADR-009 item 2. NUNCA é lançada antes da posse ser
 * confirmada (ver tabela acima: negação de posse é sempre
 * `SessionNotFoundError`, nunca este erro).
 *
 * Contrato com quem chama `assertSessionAccess`/`assertSessionOwnership`:
 * esta classe NUNCA deve vazar como exceção não tratada de uma Server Action
 * até o cliente (em produção o Next.js apaga classe/mensagem de qualquer
 * erro lançado por uma Server Action de qualquer forma, mas a UI perde a
 * chance de navegar para o convite de cadastro). Quem chama o guard numa
 * transição/leitura que passa `exigeConta: true` deve envolver a chamada num
 * `try/catch` e, ao capturar `ContaNecessariaError`, devolver um resultado
 * discriminado (`{ status: "conta_necessaria", sessionId }`) em vez de deixar
 * o erro propagar. Essa captura é escopo das tarefas que usam
 * `exigeConta: true` (`V2-L6-T04..T08`), não deste módulo.
 */
export class ContaNecessariaError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(
      `Conta necessária para continuar a TripSession "${sessionId}" (ADR-009 item 2).`,
    );
    this.name = "ContaNecessariaError";
    this.sessionId = sessionId;
  }
}

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
 * Resultado da checagem pura (sem I/O) de `resolveSessionAccess` — três
 * saídas em vez de um booleano porque a tabela de 5 casos do ADR-009 item 2
 * tem três desfechos possíveis, não dois: acesso concedido, posse negada
 * (404) ou posse confirmada mas conta exigida (`ContaNecessariaError`).
 */
export type SessionAccessDecision = "granted" | "denied" | "conta_necessaria";

/**
 * Comparação pura (sem I/O) do registro persistido contra o PAR bruto de
 * identidade da requisição (`RequestIdentity`, `resolveRequestIdentity`,
 * V2-L6-T02) — ADR-009 item 2, tabela de 5 casos. Extraída separadamente de
 * `assertSessionAccess` para ser testável sem mockar
 * `resolveRequestIdentity`/Next.js, mesmo raciocínio de `isSameSessionOwner`
 * para a regra antiga (ADR-008 item 4).
 *
 * | Situação do registro | Identidade da requisição | exigeConta: false | exigeConta: true |
 * |---|---|---|---|
 * | `userId = U` | `userId = U` | granted | granted |
 * | `userId = U` | qualquer outra | denied | denied |
 * | `anonSessionId = A` | cookie `A` (com ou sem conta autenticada) | granted | conta_necessaria |
 * | `anonSessionId = A` | cookie diferente de `A` | denied | denied |
 * | nenhum dos dois gravado (inclusive `record` nulo/indefinido) | qualquer | denied | denied |
 *
 * Ordem de checagem: posse PRIMEIRO (linhas 1/2 e 3/4, e o fallback da linha
 * 5), `exigeConta` só é avaliado DEPOIS que a posse da linha 3 já foi
 * confirmada — nunca antes. Por isso `record.userId` é checado antes de
 * `record.anonSessionId`: os dois nunca vêm preenchidos ao mesmo tempo
 * (exclusividade mútua, ADR-008 item 1/2), então a ordem entre eles não muda
 * o resultado, mas resolve a linha 1/2 sem olhar `identity.anonSessionId`
 * (irrelevante quando o registro já pertence a uma conta — inclusive "o
 * mesmo cookie de antes do vínculo", linha 2).
 */
export function resolveSessionAccess(
  record: TripSessionOwnerRecord | null | undefined,
  identity: RequestIdentity,
  exigeConta: boolean,
): SessionAccessDecision {
  if (!record) {
    return "denied"; // sessão inexistente — mesmo desfecho da linha 5
  }
  if (record.userId !== null) {
    // Linhas 1/2 da tabela: registro pertence a uma conta.
    return record.userId === identity.userId ? "granted" : "denied";
  }
  if (record.anonSessionId !== null) {
    // Linhas 3/4 da tabela: registro ainda é anônimo.
    if (record.anonSessionId !== identity.anonSessionId) {
      return "denied"; // linha 4 — cookie não confere
    }
    // Linha 3 — posse confirmada pelo cookie: só agora `exigeConta` entra.
    return exigeConta ? "conta_necessaria" : "granted";
  }
  return "denied"; // linha 5 — nenhum dono gravado (edge case defensivo)
}

/**
 * Guard central (ADR-009 item 2 — substitui a regra do ADR-008 item 4):
 * resolve o PAR bruto de identidade da requisição corrente
 * (`resolveRequestIdentity`, V2-L6-T02) e valida contra o `record` já
 * buscado pelo chamador (evita uma segunda query redundante em quem já fez o
 * `findUnique`/`findUniqueOrThrow` da própria sessão), via
 * `resolveSessionAccess` acima.
 *
 * Lança `SessionNotFoundError` para toda negação de posse (nunca 403) e
 * `ContaNecessariaError` quando a posse já foi confirmada mas
 * `options.exigeConta` é `true` e a identidade não tem `userId` — nessa
 * ordem, nunca a segunda antes da primeira. Ver o contrato de
 * `ContaNecessariaError` acima: quem chama este guard com
 * `exigeConta: true` deve capturar essa exceção e converter num resultado
 * discriminado antes de devolver ao cliente.
 *
 * Chamado no início de `applySessionFlowTransition`
 * (`./persistence.ts`) e de toda leitura direta de `TripSession` fora do
 * módulo `session-flow` (`gerarSugestoesDestino`/`gerarSugestoesHospedagem`/
 * `gerarSugestoesPasseios`, `@/lib/actions`) — hoje, na prática, só via
 * `assertSessionOwnership` (alias abaixo), migração chamador-a-chamador para
 * `exigeConta: true` é V2-L6-T04..T08.
 */
export async function assertSessionAccess(
  sessionId: string,
  record: TripSessionOwnerRecord | null | undefined,
  options: { exigeConta: boolean },
): Promise<void> {
  const identity = await resolveRequestIdentity();
  const decision = resolveSessionAccess(record, identity, options.exigeConta);
  if (decision === "denied") {
    throw new SessionNotFoundError(sessionId);
  }
  if (decision === "conta_necessaria") {
    throw new ContaNecessariaError(sessionId);
  }
}

/**
 * ALIAS de retrocompatibilidade (V2-L6-T03, ADR-009 item 2: "o nome antigo
 * continua como alias de `exigeConta: false` durante a transição e sai no
 * fim do lote"). Os ~10 chamadores existentes (`persistence.ts`,
 * `@/lib/actions/destino|hospedagem|passeios|roteiro|encerramento`)
 * continuam funcionando sem nenhuma alteração própria até migrarem,
 * individualmente, para `assertSessionAccess(sessionId, record, { exigeConta
 * })` nas tarefas `V2-L6-T04..T08`. Nunca lança `ContaNecessariaError`
 * (`exigeConta: false` fixo).
 */
export async function assertSessionOwnership(
  sessionId: string,
  record: TripSessionOwnerRecord | null | undefined,
): Promise<void> {
  return assertSessionAccess(sessionId, record, { exigeConta: false });
}
