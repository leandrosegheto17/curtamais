"use server";

// V2-L8-T02 — Server Action `retomarSessao(sessionId)` (SDD.md §8.2.7,
// "Meus roteiros", RF-17): botão "Continuar roteiro" de T-MEUS
// (`V2-L8-T04`, tarefa paralela) chama esta Server Action com o
// `sessionId` da linha clicada e navega para a rota devolvida.
//
// "Meus roteiros" já exige conta autenticada (RF-17 é feature exclusiva de
// quem tem cadastro — a listagem em si, `listarMeusRoteiros`, V2-L8-T01, só
// busca por `userId` da sessão do servidor). Por isso esta Server Action
// chama `assertSessionAccess(sessionId, session, { exigeConta: true })`
// (ADR-009 item 2) — não só `exigeConta: false`: mesmo que a sessão alvo
// ainda estivesse anônima (não deveria acontecer vindo de `/meus-roteiros`,
// mas o guard central não assume isso), a captura de `ContaNecessariaError`
// abaixo cobre esse caso defensivamente em vez de deixar a exceção vazar.
//
// Efeito colateral (a parte mais sutil desta tarefa, ver nota de cabeçalho
// de `rota-da-etapa.ts`, V2-L6-T09): `rotaDaEtapa` é uma função PURA — ela
// só CALCULA a rota como se `avancar` já tivesse sido aplicado aos 3 estados
// transitórios `*_aprovad*` (`hospedagem_aprovada`/`passeios_aprovados`/
// `roteiro_aprovado`), sem gravar nada. Quem precisa GRAVAR essa transição de
// verdade é este módulo — senão a sessão ficaria com `flowState` desalinhado
// da rota devolvida (a próxima leitura de tela, ex. `/passeios`, encontraria
// a sessão ainda em `hospedagem_aprovada` em vez de `passeios_pendente`).
// Mesmo padrão já usado por `linkAnonymousSessionToUser`
// (`V2-L7-T02`, `./link-anonymous-session-to-user.ts`): "aplica a transição
// de verdade, não só calcula a rota resultante". Diferença: o vínculo de
// conta faz isso na MESMA transação Prisma do `updateMany` (atomicidade
// exigida pelo critério de aceite daquela tarefa); aqui não há uma segunda
// escrita atômica com a qual compor — a chamada a `applySessionFlowTransition`
// (que abre a própria transação, `@/lib/session-flow`) é suficiente.
//
// Diretriz de Implementação 3 (TASK.md Seção 1): só o módulo `session-flow`
// escreve em `TripSession` — esta Server Action nunca chama
// `prisma.tripSession.update` diretamente, só `applySessionFlowTransition`.
//
// POST, nunca GET com efeito colateral: por ser uma Server Action (`"use
// server"`), o Next.js só permite invocação via `action`/`formAction`
// (POST) ou chamada direta a partir de Client/Server Components — não existe
// nenhum `route.ts` GET associado a este módulo que pudesse expor o mesmo
// efeito colateral por um link/prefetch.
//
// Sem `destino` passado a `rotaDaEtapa`: mesma decisão já registrada em
// `vinculo-conta.ts` (V2-L7-T02) — esta Server Action não lê
// `DestinationApproval` (só `flowState`/`userId`/`anonSessionId`), então a
// querystring de `destino_confirmado` fica sem o parâmetro `destino`
// opcional; a tela de confirmação já sabe recarregar o nome do destino a
// partir da própria sessão quando o parâmetro está ausente. Decisão mantida
// consistente com o precedente já estabelecido, não reaberta aqui.

import { prisma } from "@/lib/prisma";
import {
  applySessionFlowTransition,
  assertSessionAccess,
  ContaNecessariaError,
  rotaDaEtapa,
  type SessionFlowState,
} from "@/lib/session-flow";

/**
 * Estados transitórios `*_aprovad*` (mesmo conjunto documentado em
 * `rota-da-etapa.ts`, V2-L6-T09) — únicos em que `retomarSessao` precisa
 * aplicar e persistir `avancar` antes de calcular a rota.
 */
const ESTADOS_APROVADOS_TRANSITORIOS: ReadonlySet<SessionFlowState> =
  new Set<SessionFlowState>([
    "hospedagem_aprovada",
    "passeios_aprovados",
    "roteiro_aprovado",
  ]);

export type RetomarSessaoResult =
  | { status: "ok"; sessionId: string; rota: string }
  | { status: "conta_necessaria"; sessionId: string };

/**
 * Retoma a `TripSession` `sessionId` a partir de "Meus roteiros": aplica
 * (e persiste) `avancar` se o `flowState` atual for um dos 3 estados
 * transitórios `*_aprovad*`, e devolve a rota correspondente
 * (`rotaDaEtapa`, V2-L6-T09). Sessão de outra conta, cookie anônimo
 * divergente ou sessão inexistente — `SessionNotFoundError` (404), deixado
 * propagar como exceção da Server Action (mesmo padrão já usado por
 * `vincularSessaoAConta`/`destino.ts`/`hospedagem.ts`/`passeios.ts`/
 * `roteiro.ts`).
 */
export async function retomarSessao(
  sessionId: string,
): Promise<RetomarSessaoResult> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, anonSessionId: true, flowState: true },
  });

  try {
    await assertSessionAccess(sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      // Defensivo (ver nota de cabeçalho): não deveria ocorrer vindo de
      // "Meus roteiros" (já exige conta antes de listar), mas o guard
      // central não assume o contexto de quem chama — captura aqui em vez
      // de deixar a exceção vazar sem tratamento (ADR-009 item 2, "Contrato
      // com o cliente").
      return { status: "conta_necessaria", sessionId };
    }
    throw error;
  }

  // `session` não é nulo aqui: `assertSessionAccess` já teria lançado
  // `SessionNotFoundError` (capturado acima como `throw error` se não fosse
  // `ContaNecessariaError`) para `record` nulo/indefinido.
  let flowState = session!.flowState as SessionFlowState;

  if (ESTADOS_APROVADOS_TRANSITORIOS.has(flowState)) {
    // Grava de verdade a transição `avancar` — `rotaDaEtapa` abaixo só
    // calcula a URL, não persiste nada (ver nota de cabeçalho do arquivo).
    const advanced = await applySessionFlowTransition({
      sessionId,
      action: "avancar",
    });
    flowState = advanced.flowState;
  }

  return {
    status: "ok",
    sessionId,
    rota: rotaDaEtapa(flowState, sessionId),
  };
}
