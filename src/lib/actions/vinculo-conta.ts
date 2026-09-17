"use server";

// V2-L7-T02 — Server Action `vincularSessaoAConta({ sessionId })` (ADR-009
// item 3, "Vínculo explícito e atômico"). Chamada por T-GATE
// (`V2-L7-T04`, tarefa paralela) logo depois de `criarConta` + `signIn`, ou
// depois de `signIn` em "já tenho conta", ou pelo botão "Continuar com a
// conta {e-mail}" quando T-GATE é aberta por quem já está autenticado.
//
// Toda a escrita é delegada a `linkAnonymousSessionToUser`
// (`@/lib/session-flow`) — Diretriz de Implementação 3 (TASK.md Seção 1): só
// o módulo `session-flow` escreve em `TripSession`. Esta Server Action só
// resolve a identidade da requisição corrente e traduz o resultado/erro do
// módulo de domínio para o formato discriminado consumido pela tela.
//
// Pré-condições verificadas no servidor (ADR-009 item 3):
// 1. `userId` vem de `getServerSession`/`resolveRequestIdentity` (V2-L6-T02)
//    — nunca do corpo da requisição. Sem conta autenticada, devolve
//    `{ status: "nao_autenticado" }` SEM escrever nada (nem chama
//    `linkAnonymousSessionToUser`).
// 2. `anonSessionId` vem do cookie da requisição corrente
//    (`resolveRequestIdentity`), nunca do corpo.
// 3. `sessionId` vem do parâmetro — só SELECIONA a sessão, nunca prova posse
//    por si só (a condição do `updateMany` em `linkAnonymousSessionToUser` é
//    quem prova posse).
//
// Três desfechos (ver `linkAnonymousSessionToUser` para o contrato
// completo):
// - vínculo realizado agora ("vinculada") — inclui a continuação atômica de
//   transição `destino_confirmado` → `hospedagem_pendente`, quando aplicável.
// - sucesso idempotente ("idempotente") — a sessão já pertencia a esta
//   conta (duplo clique, duas abas, retry de rede). NUNCA um erro.
// - qualquer outro caso (sessão de outra conta, cookie anônimo divergente,
//   sessão inexistente) — `SessionNotFoundError`, deixado propagar como
//   404/exceção da Server Action (mesmo padrão já usado por
//   `destino.ts`/`hospedagem.ts`/`passeios.ts`/`roteiro.ts`: nenhuma dessas
//   ações converte `SessionNotFoundError` num resultado discriminado —
//   só `ContaNecessariaError` tem esse tratamento especial, ADR-009 item 2,
//   "Contrato com o cliente", que não se aplica aqui).
//
// A rota devolvida usa `rotaDaEtapa(flowState, sessionId)` (V2-L6-T09) —
// fonte única do mapeamento estado → tela (SDD.md §8.2.5). Sem o `destino`
// em texto livre disponível nesta Server Action (não lido por
// `linkAnonymousSessionToUser`, que só seleciona `flowState`), a
// querystring de `destino_confirmado` fica sem o parâmetro `destino`
// opcional — decisão desta tarefa (desvio pequeno, documentado): a tela de
// confirmação (T05) já sabe recarregar o nome do destino a partir da
// `DestinationApproval` da própria sessão quando o parâmetro está ausente
// (mesmo padrão de "carrega da sessão quando falta o parâmetro" já usado
// pelas telas existentes).

import { resolveRequestIdentity } from "./resolve-request-identity";
import { linkAnonymousSessionToUser, rotaDaEtapa } from "@/lib/session-flow";

export type VincularSessaoResult =
  | { status: "nao_autenticado" }
  | { status: "vinculada"; sessionId: string; rota: string }
  | { status: "idempotente"; sessionId: string; rota: string };

/**
 * Vincula a `TripSession` `sessionId` à conta autenticada da requisição
 * corrente, de forma atômica e idempotente (ADR-009 item 3). Nunca lê/aceita
 * `userId`/`anonSessionId` do parâmetro `input` — ambos resolvidos no
 * servidor via `resolveRequestIdentity`.
 */
export async function vincularSessaoAConta(input: {
  sessionId: string;
}): Promise<VincularSessaoResult> {
  const identity = await resolveRequestIdentity();

  if (!identity.userId) {
    // Pré-condição 1 (ADR-009 item 3): sem conta autenticada, nada é
    // escrito — `linkAnonymousSessionToUser` nem é chamada.
    return { status: "nao_autenticado" };
  }

  const result = await linkAnonymousSessionToUser({
    sessionId: input.sessionId,
    userId: identity.userId,
    anonSessionId: identity.anonSessionId,
  });

  return {
    status: result.status,
    sessionId: result.sessionId,
    rota: rotaDaEtapa(result.flowState, result.sessionId),
  };
}
