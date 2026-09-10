// L9-T03 — Erros dedicados das Server Actions de T07 (`./passeios.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `src/lib/actions/hospedagem-errors.ts`/
// `src/lib/actions/destino-errors.ts`: Next.js só permite que um arquivo
// marcado `"use server"` exporte funções async — uma classe exportada
// diretamente de `passeios.ts` quebra `npm run build`.

/**
 * Lançado quando a sessão não está na etapa `passeios_pendente` no momento em
 * que uma ação de T07 que exige essa etapa é chamada (ex.: gerar opções para
 * uma sessão cujos passeios já foram aprovados, ou ainda não chegou nessa
 * etapa). Evita gastar uma chamada ao Gateway de IA (RF-07.1) fora de
 * propósito — mesmo raciocínio de `HospedagemEtapaInvalidaError`
 * (`./hospedagem-errors.ts`, L8-T03); a ação `aprovar`/`encerrar` em si já é
 * validada estruturalmente por `transitionSessionFlow`
 * (`InvalidTransitionError`, `@/lib/session-flow`), este erro cobre só o caso
 * de leitura/geração.
 */
export class PasseiosEtapaInvalidaError extends Error {
  readonly flowState: string;

  constructor(flowState: string) {
    super(
      `Ação de resolução de passeios (T07) não aplicável ao estado atual da sessão: "${flowState}".`,
    );
    this.name = "PasseiosEtapaInvalidaError";
    this.flowState = flowState;
  }
}

/**
 * Lançado quando a `TripSession` ainda não tem o contexto mínimo exigido para
 * gerar opções de passeios: range de datas (invariante que nunca deveria ser
 * violada — mesma guarda defensiva de `HospedagemContextoIncompletoError`) ou
 * o destino já aprovado (RF-11 — uma sessão só chega a `passeios_pendente`
 * depois de `hospedagem_aprovada` + `avancar`, que exige uma
 * `DestinationApproval` já gravada; se ela não existir aqui é uma violação de
 * invariante, não um caso de uso válido). Hospedagem é opcional para o
 * contexto (`generatePasseiosSuggestions`, L9-T01), então sua ausência nunca
 * lança este erro.
 */
export class PasseiosContextoIncompletoError extends Error {
  constructor(sessionId: string) {
    super(
      `TripSession "${sessionId}" ainda não tem o contexto mínimo (range de datas + destino aprovado) para gerar opções de passeios.`,
    );
    this.name = "PasseiosContextoIncompletoError";
  }
}

/**
 * Lançado quando o payload de um item de passeio recebido de volta do
 * cliente (aprovação de itens gerados por `gerarSugestoesPasseios`) não passa
 * na revalidação server-side (Diretriz de Implementação 9, TASK.md Seção 1:
 * nenhum dado de tela é confiado sem revalidação no servidor) — nome/duração
 * vazios, faixa de preço não numérica/negativa/invertida. Mesmo raciocínio de
 * `InvalidHospedagemSuggestionError` (`./hospedagem-errors.ts`, L8-T03).
 */
export class InvalidPasseioSuggestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPasseioSuggestionError";
  }
}

/**
 * Lançado quando `aprovarPasseios` recebe uma lista vazia (todos os itens
 * removidos pelo usuário antes de aprovar). RF-07.3/UX-SPEC.md T07: o botão
 * "Aprovar seleção" já fica indisponível na UI nesse caso — este erro é a
 * guarda server-side equivalente (Diretriz de Implementação 9: nunca confiar
 * cegamente que a UI impediu o estado inválido de chegar ao servidor).
 */
export class EmptyPasseiosSelectionError extends Error {
  constructor() {
    super(
      "Ao menos um passeio precisa permanecer selecionado para aprovar e seguir ao roteiro.",
    );
    this.name = "EmptyPasseiosSelectionError";
  }
}
