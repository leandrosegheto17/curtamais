// L7-T03 — Erros dedicados das Server Actions de T04 (`./destino.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `src/lib/actions/data-livre-errors.ts`/
// `src/lib/actions/feriados-errors.ts`: Next.js só permite que um arquivo
// marcado `"use server"` exporte funções async — uma classe exportada
// diretamente de `destino.ts` quebra `npm run build`.

/**
 * Lançado quando a sessão não está na etapa `destino_pendente` no momento em
 * que uma ação de T04 que exige essa etapa é chamada (ex.: gerar sugestões
 * para uma sessão cujo destino já foi confirmado, ou ainda não foi
 * iniciada). Evita gastar uma chamada ao Gateway de IA (RF-04.1) fora de
 * propósito; a ação `aprovar`/`encerrar` em si já é validada estruturalmente
 * por `transitionSessionFlow` (`InvalidTransitionError`,
 * `@/lib/session-flow`), este erro cobre só o caso de leitura/geração.
 */
export class DestinoEtapaInvalidaError extends Error {
  readonly flowState: string;

  constructor(flowState: string) {
    super(
      `Ação de resolução de destino (T04) não aplicável ao estado atual da sessão: "${flowState}".`,
    );
    this.name = "DestinoEtapaInvalidaError";
    this.flowState = flowState;
  }
}

/**
 * Lançado quando a `TripSession` ainda não tem `dateRangeStart`/
 * `dateRangeEnd` resolvidos — invariante que nunca deveria ser violada pelos
 * caminhos de criação de sessão já implementados (L6-T03/L6-T05/L6-T07,
 * `createSessionWithDateRange`, que sempre grava o range antes de `iniciar`),
 * mas guardada defensivamente aqui em vez de deixar `generateDestinationSuggestions`
 * (L7-T01) falhar com um erro genérico de tipo.
 */
export class DestinoContextoIncompletoError extends Error {
  constructor(sessionId: string) {
    super(
      `TripSession "${sessionId}" ainda não tem range de datas resolvido — não é possível gerar sugestões de destino.`,
    );
    this.name = "DestinoContextoIncompletoError";
  }
}

/**
 * Lançado quando o payload de uma sugestão de destino recebido de volta do
 * cliente (aprovação de uma sugestão gerada por `gerarSugestoesDestino`) não
 * passa na revalidação server-side (Diretriz de Implementação 9, TASK.md
 * Seção 1: nenhum dado de tela é confiado sem revalidação no servidor) —
 * nome/justificativa vazios, faixa de preço não numérica/negativa/invertida.
 * Nunca confia que o payload devolvido pelo cliente é exatamente o que foi
 * gerado (poderia ter sido adulterado no client antes do submit).
 */
export class InvalidDestinoSuggestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDestinoSuggestionError";
  }
}

/**
 * Lançado quando o texto de destino informado manualmente (RF-04.3 atalho
 * "Já sei o destino, quero informar") é inválido após sanitização — vazio
 * (só espaços) ou nenhum caractere após o trim. Diferente do campo opcional
 * de `submeterDataLivre` (L6-T03), aqui o destino é OBRIGATÓRIO: o próprio
 * propósito da ação é o usuário fornecer um destino.
 */
export class InvalidManualDestinoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidManualDestinoError";
  }
}
