// L3-T01 — Erro de fronteira do Gateway de IA.
//
// Extraído para arquivo próprio em L3-T03 (sem mudança de comportamento)
// para permitir que `./validation.ts` (L3-T03) e `./index.ts` (L3-T01)
// compartilhem o mesmo tipo sem criar um ciclo de import entre eles — a
// classe em si é a mesma desde L3-T01, só mudou de arquivo. `./index.ts`
// continua sendo o único ponto de reexport público (`export { GatewayIaError }
// from "./errors"`); nenhum outro módulo do projeto deve importar
// `./errors.ts` diretamente, só via `@/lib/gateway-ia`.

/**
 * Erro de fronteira do Gateway de IA. Todo erro de chamada ao provider
 * (rede, timeout, recusa, resposta que não bate com o schema) ou de
 * validação semântica pós-schema (plausibilidade de preço/grounding de
 * data, L3-T03) é normalizado para este tipo antes de sair do módulo — o
 * chamador nunca precisa conhecer o formato de erro nativo do SDK da OpenAI
 * nem os detalhes internos de cada validação. Tratamento de retry/log fica
 * em L3-T04.
 */
export class GatewayIaError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GatewayIaError";
    this.cause = cause;
  }
}
