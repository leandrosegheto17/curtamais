// L4-T01 — Erro de fronteira da state machine do Orquestrador de Sessão
// (ADR-006). Mesmo padrão de `src/lib/gateway-ia/errors.ts`: classe de erro
// dedicada com `cause` opcional, nunca um `Error` genérico nem string solta.

/**
 * Lançado quando uma transição solicitada não é válida a partir do estado
 * atual da sessão — inclui tanto "pular etapa" (ex.: `entrada_selecionada`
 * direto para `hospedagem_pendente`) quanto ações não aplicáveis ao estado
 * atual (ex.: `encerrar` antes de qualquer etapa aprovada, ou qualquer ação
 * a partir de um estado terminal). Nunca deixa uma transição inválida
 * "funcionar" silenciosamente.
 */
export class InvalidTransitionError extends Error {
  readonly cause?: unknown;
  readonly currentState: string;
  readonly action: string;

  constructor(currentState: string, action: string, cause?: unknown) {
    super(
      `Transição inválida: ação "${action}" não é permitida a partir do estado "${currentState}".`,
    );
    this.name = "InvalidTransitionError";
    this.currentState = currentState;
    this.action = action;
    this.cause = cause;
  }
}

// L4-T02 — Erros da camada de persistência (`./persistence.ts`), mesmo
// padrão de classe de erro dedicada de `InvalidTransitionError` acima.

/**
 * Lançado quando a `TripSession` referenciada por `sessionId` não existe.
 * Lançado ANTES de qualquer tentativa de decidir/gravar transição — nunca faz
 * parte de uma escrita parcial.
 */
export class SessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`TripSession não encontrada: "${sessionId}".`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

/**
 * Lançado quando a ação `aprovar` é solicitada sem o payload da entidade
 * filha correspondente à etapa atual da sessão (ausente, ou de etapa
 * diferente da esperada) — ex.: aprovar hospedagem enviando dados de
 * destino, ou nenhum dado. Sempre lançado DEPOIS de `transitionSessionFlow`
 * já ter validado que a transição em si é válida (pular etapa é
 * `InvalidTransitionError`, não este erro) e SEMPRE antes de qualquer
 * escrita no banco — nenhum estado parcialmente gravado.
 */
export class InvalidChildDataError extends Error {
  readonly currentState: string;
  readonly expectedStage: string;
  readonly receivedStage: string | undefined;

  constructor(
    currentState: string,
    expectedStage: string,
    receivedStage: string | undefined,
  ) {
    super(
      `Dados da entidade filha ausentes ou de etapa incorreta para aprovar a partir de "${currentState}": esperado stage "${expectedStage}", recebido "${receivedStage ?? "nenhum"}".`,
    );
    this.name = "InvalidChildDataError";
    this.currentState = currentState;
    this.expectedStage = expectedStage;
    this.receivedStage = receivedStage;
  }
}
