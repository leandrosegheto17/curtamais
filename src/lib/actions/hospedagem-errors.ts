// L8-T03 — Erros dedicados das Server Actions de T06 (`./hospedagem.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `src/lib/actions/destino-errors.ts`/
// `src/lib/actions/data-livre-errors.ts`: Next.js só permite que um arquivo
// marcado `"use server"` exporte funções async — uma classe exportada
// diretamente de `hospedagem.ts` quebra `npm run build`.

/**
 * Lançado quando a sessão não está na etapa `hospedagem_pendente` no momento
 * em que uma ação de T06 que exige essa etapa é chamada (ex.: gerar opções
 * para uma sessão cuja hospedagem já foi aprovada, ou ainda não chegou nessa
 * etapa). Evita gastar uma chamada ao Gateway de IA (RF-06.1) fora de
 * propósito — mesmo raciocínio de `DestinoEtapaInvalidaError`
 * (`./destino-errors.ts`, L7-T03); a ação `aprovar`/`encerrar` em si já é
 * validada estruturalmente por `transitionSessionFlow`
 * (`InvalidTransitionError`, `@/lib/session-flow`), este erro cobre só o
 * caso de leitura/geração.
 */
export class HospedagemEtapaInvalidaError extends Error {
  readonly flowState: string;

  constructor(flowState: string) {
    super(
      `Ação de resolução de hospedagem (T06) não aplicável ao estado atual da sessão: "${flowState}".`,
    );
    this.name = "HospedagemEtapaInvalidaError";
    this.flowState = flowState;
  }
}

/**
 * Lançado quando a `TripSession` ainda não tem o contexto mínimo exigido
 * para gerar opções de hospedagem: range de datas (invariante que nunca
 * deveria ser violada — mesma guarda defensiva de
 * `DestinoContextoIncompletoError`) ou o destino já aprovado (RF-11 — uma
 * sessão só chega a `hospedagem_pendente` depois de `destino_confirmado` +
 * `avancar`, que exige uma `DestinationApproval` já gravada; se ela não
 * existir aqui é uma violação de invariante, não um caso de uso válido).
 */
export class HospedagemContextoIncompletoError extends Error {
  constructor(sessionId: string) {
    super(
      `TripSession "${sessionId}" ainda não tem o contexto mínimo (range de datas + destino aprovado) para gerar opções de hospedagem.`,
    );
    this.name = "HospedagemContextoIncompletoError";
  }
}

/**
 * Lançado quando o payload de uma opção de hospedagem recebido de volta do
 * cliente (aprovação de uma opção gerada por `gerarSugestoesHospedagem`) não
 * passa na revalidação server-side (Diretriz de Implementação 9, TASK.md
 * Seção 1: nenhum dado de tela é confiado sem revalidação no servidor) —
 * nome/tipo/característica distintiva vazios, faixa de preço não numérica/
 * negativa/invertida. Mesmo raciocínio de `InvalidDestinoSuggestionError`
 * (`./destino-errors.ts`, L7-T03).
 */
export class InvalidHospedagemSuggestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHospedagemSuggestionError";
  }
}
