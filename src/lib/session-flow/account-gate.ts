// V2-L6-T01 — Regra de "exige conta" (ADR-009, item 1: "Regra de 'exige
// conta' (função pura, sem mudar a state machine)").
//
// Escopo desta tarefa: SÓ a função pura abaixo. Nenhuma leitura de cookie,
// nenhuma chamada a `getServerSession`/NextAuth, nenhum acesso ao Prisma —
// isso é V2-L6-T02 (`resolveRequestIdentity`) e V2-L6-T03
// (`assertSessionAccess`), tarefas distintas. Este módulo não importa nada
// além da state machine pura já existente (`./state-machine`).
//
// Regra (RF-16.7/RN-12, ADR-009 item 1):
// - `encerrar` nunca exige conta, em nenhum estado (RN-12, INT-16) — cobre
//   inclusive sessões anônimas antigas que já passaram do destino (RF-16.9).
// - Toda transição que entra ou sai de um estado "pós-destino" exige conta.
//   "Pós-destino" (ADR-009 item 1, `ESTADOS_POS_DESTINO`) é o conjunto a
//   partir de `hospedagem_pendente` (inclusive) até `concluida` (inclusive):
//   `hospedagem_pendente`, `hospedagem_aprovada`, `passeios_pendente`,
//   `passeios_aprovados`, `roteiro_pendente`, `roteiro_aprovado`,
//   `concluida`. `destino_confirmado` NÃO entra nesse conjunto — é o ponto de
//   gate, não um estado pós-destino: a transição `avancar` que SAI de
//   `destino_confirmado` PARA `hospedagem_pendente` já exige conta porque o
//   estado de CHEGADA (`hospedagem_pendente`) está no conjunto, não porque
//   `destino_confirmado` estivesse. `encerrada_parcial` também não entra no
//   conjunto (segue literalmente o exemplo de código do ADR-009) — isso é
//   inofensivo na prática, porque o único jeito de chegar a
//   `encerrada_parcial` é via `encerrar`, que já retorna `false` antes de
//   qualquer consulta ao conjunto.
// - Transições antes do gate (`entrada_selecionada` → ... →
//   `destino_confirmado`, incluindo `revisar` entre `destino_confirmado` e
//   `destino_pendente`) não exigem conta.
import {
  transitionSessionFlow,
  type SessionFlowAction,
  type SessionFlowState,
} from "./state-machine";

/**
 * Estados "pós-destino" (ADR-009 item 1). Conjunto literal do ADR — não
 * inclui `encerrada_parcial` (ver nota de cabeçalho acima sobre por que essa
 * omissão é inofensiva).
 */
const ESTADOS_POS_DESTINO: ReadonlySet<SessionFlowState> = new Set<SessionFlowState>([
  "hospedagem_pendente",
  "hospedagem_aprovada",
  "passeios_pendente",
  "passeios_aprovados",
  "roteiro_pendente",
  "roteiro_aprovado",
  "concluida",
]);

/**
 * Decide, de forma pura, se a transição solicitada (estado atual + ação)
 * exige conta verificada no servidor (RF-16.7). Reaproveita
 * `transitionSessionFlow` para calcular o estado de chegada — lança
 * `InvalidTransitionError` (não um `Error` genérico) se a transição em si já
 * for inválida, mesma semântica de `transitionSessionFlow`.
 */
export function transicaoExigeConta(
  estadoAtual: SessionFlowState,
  acao: SessionFlowAction,
): boolean {
  if (acao === "encerrar") return false; // RN-12/RF-16.9

  const proximoEstado = transitionSessionFlow(estadoAtual, acao);
  return (
    ESTADOS_POS_DESTINO.has(estadoAtual) || ESTADOS_POS_DESTINO.has(proximoEstado)
  );
}
