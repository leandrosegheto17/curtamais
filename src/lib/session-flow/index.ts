// L4-T01/L4-T02 — Ponto de reexport público do módulo de Orquestração de
// Sessão (mesmo padrão de `src/lib/gateway-ia/index.ts`): outros módulos
// devem importar via `@/lib/session-flow`, nunca
// `@/lib/session-flow/state-machine`, `@/lib/session-flow/persistence` ou
// `@/lib/session-flow/errors` diretamente.
//
// Este módulo contém a state machine pura (L4-T01), a camada de
// persistência (L4-T02, `./persistence.ts` — única fronteira autorizada a
// escrever em `TripSession`/entidades filhas, Diretriz de Implementação 3,
// TASK.md Seção 1) e a regra de orçamento (L4-T03, `./budget-filter.ts` —
// função pura, sem I/O nem dependência da state machine, consumida por
// Gateway de IA e Orquestrador de Sessão nas tarefas L7-T01/L8-T01/L9-T01).

export {
  transitionSessionFlow,
  isTerminalSessionFlowState,
  SESSION_FLOW_STATES,
  INITIAL_SESSION_FLOW_STATE,
} from "./state-machine";
export type { SessionFlowState, SessionFlowAction } from "./state-machine";
export {
  InvalidTransitionError,
  SessionNotFoundError,
  InvalidChildDataError,
} from "./errors";
export { applySessionFlowTransition } from "./persistence";
export {
  assertSessionOwnership,
  isSameSessionOwner,
} from "./authorization";
export type { TripSessionOwnerRecord } from "./authorization";
export type {
  SessionFlowTransitionInput,
  SessionFlowTransitionResult,
  ApproveStageChildData,
  ApproveDestinationChildData,
  ApproveAccommodationChildData,
  ApproveActivitiesChildData,
  ApproveActivityItemInput,
  ApproveItineraryChildData,
  ApproveItineraryItemInput,
} from "./persistence";
export { applyBudgetFilter } from "./budget-filter";
export type {
  PriceRangedSuggestion,
  BudgetInput,
  BudgetFilteredSuggestion,
} from "./budget-filter";
export { createSessionWithDateRange } from "./create-session-with-range";
export type {
  CreateSessionWithDateRangeInput,
  CreateSessionWithDateRangeResult,
  SessionOwner,
} from "./create-session-with-range";
