// L4-T01 — State machine server-side do Orquestrador de Sessão (ADR-006,
// SDD.md Seção 2/§1 "Orquestração de Sessão").
//
// Escopo desta tarefa: SÓ a decisão pura de estados/transições (dado um
// estado atual + uma ação solicitada, decide o próximo estado ou rejeita).
// Nenhuma persistência em `TripSession`/entidades filhas acontece aqui —
// isso é L4-T02 (próxima tarefa do lote). Nenhuma regra de orçamento (RF-10)
// acontece aqui — isso é L4-T03. Este módulo não importa o Prisma Client nem
// qualquer coisa do runtime do Next.js: é lógica pura, testável sem banco.
//
// Estados modelados (ADR-006, seção "Consequências"):
//   entrada_selecionada → destino_pendente/destino_confirmado →
//   hospedagem_pendente/hospedagem_aprovada → passeios_pendente/
//   passeios_aprovados → roteiro_pendente/roteiro_aprovado → concluida,
//   com encerrada_parcial como estado terminal alternativo a partir de
//   qualquer etapa já aprovada (RN-03).
//
// IMPORTANTE (achado durante esta tarefa, ver `.md/BLOCKERS.md`, Bloqueio
// 001): o schema Prisma já migrado em L1-T02 (`TripSessionStatus`) só cobre
// 4 valores coarse-grained (`in_progress`/`partial`/`completed`/`abandoned`),
// sem nenhum campo/enum que cubra literalmente estes 11 estados granulares.
// Este módulo deliberadamente NÃO tenta mapear os estados abaixo para
// `TripSessionStatus` nem para qualquer campo do schema — isso é uma decisão
// de L4-T02 (persistência), que depende de uma resposta do Coordenador ao
// Bloqueio 001 antes de começar. `SessionFlowState` abaixo é um tipo
// autônomo, não um enum do Prisma.
//
// Regra de `encerrada_parcial` (interpretação adotada, ver nota de
// implementação L4-T01 em `.md/TASK.md` para o raciocínio completo): RF-05.4
// exige "encerramento em qualquer etapa preservando o que já foi aprovado"
// e RN-03 trata uma sessão encerrada com só uma etapa aprovada como
// "concluída com valor". Por isso, a ação `encerrar` é válida a partir de
// QUALQUER estado em que pelo menos uma etapa já tenha sido aprovada —
// inclusive um estado `*_pendente` posterior a uma aprovação (ex.:
// `hospedagem_pendente`, onde destino já está confirmado mas hospedagem
// ainda não foi decidida) — não só a partir dos estados cujo nome termina em
// "confirmado"/"aprovada(o)"/"aprovados". `encerrar` NÃO é válido a partir de
// `entrada_selecionada`/`destino_pendente` (nada foi aprovado ainda — esse
// caso é o conceito de sessão "abandonada", `TripSessionStatus.abandoned`,
// fora do escopo desta state machine) nem a partir de um estado já terminal
// (`concluida`/`encerrada_parcial`).

/** Todos os estados possíveis da state machine (ADR-006). */
export const SESSION_FLOW_STATES = [
  "entrada_selecionada",
  "destino_pendente",
  "destino_confirmado",
  "hospedagem_pendente",
  "hospedagem_aprovada",
  "passeios_pendente",
  "passeios_aprovados",
  "roteiro_pendente",
  "roteiro_aprovado",
  "concluida",
  "encerrada_parcial",
] as const;

import { InvalidTransitionError } from "./errors";

export type SessionFlowState = (typeof SESSION_FLOW_STATES)[number];

/**
 * Ações que podem ser solicitadas em qualquer etapa (RF-05):
 * - `iniciar`: sai de `entrada_selecionada` para a primeira sugestão pendente.
 * - `aprovar`: aprova a sugestão pendente da etapa atual.
 * - `ajustar`: pede regeneração da sugestão pendente, sem avançar de etapa.
 * - `avancar`: avança de uma etapa já aprovada/confirmada para a sugestão
 *   pendente da etapa seguinte (ou para `concluida`, no caso do roteiro).
 * - `encerrar`: encerra a sessão preservando o que já foi aprovado (RN-03).
 * - `revisar` (ADR-006, Adendo 2 — retomada de L7-T05/Bloqueio 002):
 *   transição regressiva de uma etapa já aprovada/confirmada de volta para o
 *   `*_pendente` da MESMA etapa (nunca pula para uma etapa anterior). Quem
 *   grava/apaga a entidade filha correspondente é a camada de persistência
 *   (`./persistence.ts`), não esta função pura — aqui só a decisão de estado.
 */
export type SessionFlowAction =
  | "iniciar"
  | "aprovar"
  | "ajustar"
  | "avancar"
  | "encerrar"
  | "revisar";

export const INITIAL_SESSION_FLOW_STATE: SessionFlowState =
  "entrada_selecionada";

const TERMINAL_STATES: ReadonlySet<SessionFlowState> = new Set<SessionFlowState>([
  "concluida",
  "encerrada_parcial",
]);

/**
 * Estados em que pelo menos uma etapa já foi aprovada — precondição para a
 * ação `encerrar` (RF-05.4/RN-03). Ver nota acima sobre a interpretação
 * adotada.
 */
const STATES_WITH_AT_LEAST_ONE_APPROVAL: ReadonlySet<SessionFlowState> =
  new Set<SessionFlowState>([
    "destino_confirmado",
    "hospedagem_pendente",
    "hospedagem_aprovada",
    "passeios_pendente",
    "passeios_aprovados",
    "roteiro_pendente",
    "roteiro_aprovado",
  ]);

/**
 * Tabela de transições válidas para as ações "sequenciais" (iniciar/aprovar/
 * ajustar/avancar). `encerrar` é tratada à parte (ver
 * `STATES_WITH_AT_LEAST_ONE_APPROVAL` acima), por ser válida a partir de
 * vários estados ao mesmo tempo, não de um único estado por ação.
 */
const SEQUENTIAL_TRANSITIONS: Readonly<
  Record<
    SessionFlowState,
    Partial<Record<Exclude<SessionFlowAction, "encerrar" | "revisar">, SessionFlowState>>
  >
> = {
  entrada_selecionada: {
    iniciar: "destino_pendente",
  },
  destino_pendente: {
    aprovar: "destino_confirmado",
    ajustar: "destino_pendente",
  },
  destino_confirmado: {
    avancar: "hospedagem_pendente",
  },
  hospedagem_pendente: {
    aprovar: "hospedagem_aprovada",
    ajustar: "hospedagem_pendente",
  },
  hospedagem_aprovada: {
    avancar: "passeios_pendente",
  },
  passeios_pendente: {
    aprovar: "passeios_aprovados",
    ajustar: "passeios_pendente",
  },
  passeios_aprovados: {
    avancar: "roteiro_pendente",
  },
  roteiro_pendente: {
    aprovar: "roteiro_aprovado",
    ajustar: "roteiro_pendente",
  },
  roteiro_aprovado: {
    avancar: "concluida",
  },
  concluida: {},
  encerrada_parcial: {},
};

/**
 * Tabela de transições regressivas da ação `revisar` (ADR-006, Adendo 2).
 * Cada entrada leva um estado "aprovado/confirmado" de volta ao `*_pendente`
 * DA MESMA etapa — nunca pula para uma etapa anterior. Só
 * `destino_confirmado` → `destino_pendente` tem hoje uma Server Action/UI
 * consumidora (`trocarDestino`, L7-T05); as outras 3 ficam disponíveis para
 * L8/L9/L10 sem tarefa própria nesta rodada (ver nota de retomada L7-T05 em
 * `.md/TASK.md`, Seção 3, Lote 7).
 */
const REVISAR_TRANSITIONS: Readonly<
  Partial<Record<SessionFlowState, SessionFlowState>>
> = {
  destino_confirmado: "destino_pendente",
  hospedagem_aprovada: "hospedagem_pendente",
  passeios_aprovados: "passeios_pendente",
  roteiro_aprovado: "roteiro_pendente",
};

/** true para `concluida`/`encerrada_parcial` — nenhuma ação é válida a partir daqui. */
export function isTerminalSessionFlowState(state: SessionFlowState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Decide, de forma pura, o próximo estado dado o estado atual e a ação
 * solicitada. Lança `InvalidTransitionError` (nunca um `Error` genérico) para
 * qualquer transição inválida — inclui pular etapa (ex.: `aprovar`/`avancar`
 * a partir de `entrada_selecionada` direto para um estado de hospedagem) e
 * qualquer ação a partir de um estado terminal.
 */
export function transitionSessionFlow(
  currentState: SessionFlowState,
  action: SessionFlowAction,
): SessionFlowState {
  if (action === "encerrar") {
    if (!STATES_WITH_AT_LEAST_ONE_APPROVAL.has(currentState)) {
      throw new InvalidTransitionError(currentState, action);
    }
    return "encerrada_parcial";
  }

  if (action === "revisar") {
    const revisarTarget = REVISAR_TRANSITIONS[currentState];
    if (!revisarTarget) {
      throw new InvalidTransitionError(currentState, action);
    }
    return revisarTarget;
  }

  const nextState = SEQUENTIAL_TRANSITIONS[currentState]?.[action];
  if (!nextState) {
    throw new InvalidTransitionError(currentState, action);
  }
  return nextState;
}
