// V2-L6-T09 — `rotaDaEtapa(flowState, sessionId, destino?)`, função pura e
// fonte única do mapeamento estado → tela (SDD.md §8.2.5, tabela de 7 casos).
// Consumida por `vincularSessaoAConta` (V2-L7-T02), `retomarSessao`
// (V2-L8-T02) e "meus roteiros" (V2-L8-T04/T05) — nenhuma dessas tarefas
// existe ainda nesta rodada; este módulo só define a função, sem integrar os
// chamadores futuros.
//
// Nome de arquivo: o SDD.md (§8.2.5, linha "função pura em
// `src/lib/session-flow/rotas.ts`") documenta o caminho `rotas.ts`, mas a
// tarefa V2-L6-T09 do TASK.md pede explicitamente
// `src/lib/session-flow/rota-da-etapa.ts`. Mantido o nome pedido pela tarefa
// (desvio pequeno de nomenclatura, não de comportamento) — registrado aqui
// para quem for integrar V2-L7-T02/V2-L8-T02 e procurar pelo caminho do SDD.
//
// Função PURA: só monta a string de URL a partir dos parâmetros recebidos.
// Sem Prisma, sem `next/navigation`, sem chamada de rede. A única dependência
// de outro módulo é `transitionSessionFlow` (state-machine.ts), também pura,
// usada para resolver os 3 estados transitórios `*_aprovad*` (ver abaixo).
//
// Mapeamento (SDD.md §8.2.5, 7 casos — os 11 estados reais de
// `SessionFlowState` colapsam nestas 7 rotas):
//   1. `entrada_selecionada`, `destino_pendente` → `/destino?sessionId=`
//   2. `destino_confirmado` → `/destino/confirmacao?sessionId=&destino=&flowState=`
//   3. `hospedagem_pendente` → `/hospedagem?sessionId=`
//   4. `passeios_pendente` → `/passeios?sessionId=`
//   5. `roteiro_pendente` → `/roteiro?sessionId=`
//   6. `hospedagem_aprovada`, `passeios_aprovados`, `roteiro_aprovado`
//      (transitórios, SDD.md §8.2.5): "retomarSessao aplica `avancar` antes e
//      usa a rota do estado seguinte". Esta função pura reproduz esse mesmo
//      resultado internamente — chama `transitionSessionFlow(flowState,
//      "avancar")` (mesma decisão pura já usada pelo Orquestrador) e resolve
//      a rota do estado obtido, sem exigir que o chamador já tenha aplicado a
//      transição. Isso mantém `rotaDaEtapa` como fonte única mesmo para os 3
//      casos transitórios, sem duplicar a tabela de transições aqui.
//   7. `concluida`, `encerrada_parcial` → `/meus-roteiros/{sessionId}`.
//      SDD.md §8.2.5 lista também uma alternativa "sem conta" para este caso
//      (`/encerramento?sessionId&flowState`), mas os 3 chamadores
//      documentados de `rotaDaEtapa` (vínculo de conta, `retomarSessao` e
//      "meus roteiros", SDD.md §8.2.7) só operam em contexto já autenticado
//      — `retomarSessao` só é acionável a partir de `/meus-roteiros`, que já
//      exige conta antes de chamar `getServerSession`. Por isso, sem um
//      parâmetro de "tem conta" na assinatura pedida pela tarefa
//      (`rotaDaEtapa(flowState, sessionId, destino?)`), esta função sempre
//      devolve a rota autenticada `/meus-roteiros/{sessionId}` para
//      `concluida`/`encerrada_parcial`. O fluxo anônimo de `/encerramento`
//      (RN-12, já implementado no MVP por L12-T05) não passa por
//      `rotaDaEtapa` — continua resolvido diretamente pela rota existente.
//      Interpretação registrada aqui como decisão desta tarefa (desvio
//      pequeno, documentado por não haver parâmetro de conta na assinatura).

import {
  transitionSessionFlow,
  type SessionFlowState,
} from "./state-machine";

const ESTADOS_APROVADOS_TRANSITORIOS: ReadonlySet<SessionFlowState> =
  new Set<SessionFlowState>([
    "hospedagem_aprovada",
    "passeios_aprovados",
    "roteiro_aprovado",
  ]);

const ESTADOS_TERMINAIS: ReadonlySet<SessionFlowState> = new Set<
  SessionFlowState
>(["concluida", "encerrada_parcial"]);

/**
 * Devolve a URL relativa para retomar uma sessão no estado `flowState`
 * informado (SDD.md §8.2.5). Função pura — mesmo `flowState`/`sessionId`/
 * `destino` sempre produzem a mesma URL, sem I/O.
 */
export function rotaDaEtapa(
  flowState: SessionFlowState,
  sessionId: string,
  destino?: string,
): string {
  // Casos 6: estados transitórios `*_aprovad*` — resolve como se `avancar`
  // já tivesse sido aplicado (mesmo resultado que `retomarSessao` produz ao
  // chamar o Orquestrador antes de pedir a rota).
  if (ESTADOS_APROVADOS_TRANSITORIOS.has(flowState)) {
    const proximoEstado = transitionSessionFlow(flowState, "avancar");
    return rotaDaEtapa(proximoEstado, sessionId, destino);
  }

  // Caso 7: estados terminais.
  if (ESTADOS_TERMINAIS.has(flowState)) {
    return `/meus-roteiros/${sessionId}`;
  }

  // Caso 2: único estado que carrega `destino`/`flowState` na querystring.
  if (flowState === "destino_confirmado") {
    const params = new URLSearchParams({ sessionId, flowState });
    if (destino) {
      params.set("destino", destino);
    }
    return `/destino/confirmacao?${params.toString()}`;
  }

  // Caso 3: hospedagem_pendente.
  if (flowState === "hospedagem_pendente") {
    return `/hospedagem?${new URLSearchParams({ sessionId }).toString()}`;
  }

  // Caso 4: passeios_pendente.
  if (flowState === "passeios_pendente") {
    return `/passeios?${new URLSearchParams({ sessionId }).toString()}`;
  }

  // Caso 5: roteiro_pendente.
  if (flowState === "roteiro_pendente") {
    return `/roteiro?${new URLSearchParams({ sessionId }).toString()}`;
  }

  // Caso 1: entrada_selecionada, destino_pendente (e qualquer estado não
  // coberto explicitamente acima — não deveria ocorrer com os 11 estados
  // reais de `SessionFlowState`, mas mantém uma rota segura em vez de
  // lançar).
  return `/destino?${new URLSearchParams({ sessionId }).toString()}`;
}
