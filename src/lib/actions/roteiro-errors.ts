// L10-T03 — Erros dedicados das Server Actions de T08 (`./roteiro.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `src/lib/actions/passeios-errors.ts`/
// `src/lib/actions/hospedagem-errors.ts`: Next.js só permite que um arquivo
// marcado `"use server"` exporte funções async — uma classe exportada
// diretamente de `roteiro.ts` quebra `npm run build`.

/**
 * Lançado quando a sessão não está na etapa `roteiro_pendente` no momento em
 * que uma ação de T08 que exige essa etapa é chamada (ex.: gerar/aprovar o
 * roteiro para uma sessão que já concluiu, ou ainda não chegou nessa etapa).
 * Evita gastar uma chamada ao Gateway de IA (RF-08.1) fora de propósito —
 * mesmo raciocínio de `PasseiosEtapaInvalidaError`
 * (`./passeios-errors.ts`, L9-T03); a ação `aprovar`/`avancar` em si já é
 * validada estruturalmente por `transitionSessionFlow`
 * (`InvalidTransitionError`, `@/lib/session-flow`), este erro cobre só o caso
 * de leitura/geração.
 */
export class RoteiroEtapaInvalidaError extends Error {
  readonly flowState: string;

  constructor(flowState: string) {
    super(
      `Ação de resolução de roteiro (T08) não aplicável ao estado atual da sessão: "${flowState}".`,
    );
    this.name = "RoteiroEtapaInvalidaError";
    this.flowState = flowState;
  }
}

/**
 * Lançado quando a `TripSession` ainda não tem o contexto mínimo exigido para
 * gerar o roteiro final: range de datas (invariante que nunca deveria ser
 * violada — mesma guarda defensiva de `PasseiosContextoIncompletoError`) ou
 * destino/hospedagem já aprovados (RF-11 — uma sessão só chega a
 * `roteiro_pendente` depois de `passeios_aprovados` + `avancar`, que exige
 * `DestinationApproval`/`AccommodationApproval` já gravados; se algum deles
 * não existir aqui é uma violação de invariante, não um caso de uso válido).
 * Passeios aprovados são opcionais para o contexto (RN-04, `generateRoteiro`,
 * L10-T01), então sua ausência nunca lança este erro.
 */
export class RoteiroContextoIncompletoError extends Error {
  constructor(sessionId: string) {
    super(
      `TripSession "${sessionId}" ainda não tem o contexto mínimo (range de datas + destino/hospedagem aprovados) para gerar o roteiro final.`,
    );
    this.name = "RoteiroContextoIncompletoError";
  }
}

/**
 * Lançado quando o payload de um item do roteiro recebido de volta do
 * cliente (aprovação do roteiro gerado por `gerarRoteiro`) não passa na
 * revalidação server-side (Diretriz de Implementação 9, TASK.md Seção 1:
 * nenhum dado de tela é confiado sem revalidação no servidor) — atividade/
 * horário sugerido vazios, data de dia inválida/fora do range da sessão,
 * período fora do enum, `sequenceOrder` não numérico. Mesmo raciocínio de
 * `InvalidPasseioSuggestionError` (`./passeios-errors.ts`, L9-T03).
 */
export class InvalidRoteiroItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoteiroItemError";
  }
}
