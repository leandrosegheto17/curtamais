// RL6-T01 — Erro dedicado compartilhado pelos pontos de captura de destino em
// texto livre do Lote 6 (`submeterDataLivre`, `./data-livre.ts`;
// `processarFeriadoEscolhido`, `./feriados.ts`) quando o destino informado
// excede o tamanho máximo aceito.
//
// Antes desta tarefa os dois pontos divergiam: `processarFeriadoEscolhido`
// rejeitava (lançando `Error` genérico) enquanto `submeterDataLivre` truncava
// silenciosamente via `sanitizeFreeTextForPrompt(..., { maxLength })`
// (`String.prototype.slice`). RL6-T01 padroniza os dois no comportamento de
// REJEIÇÃO — escolhido porque truncar silenciosamente esconde do usuário que
// parte do texto que ele digitou nunca chegou a ser salva/usada (risco maior
// de confusão do que um erro de validação explícito), e porque a rejeição já
// era o comportamento pré-existente e documentado de um dos dois pontos, não
// exigindo introduzir um caso novo de "sucesso parcial" no contrato das
// Server Actions.
//
// Extraída para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `data-livre-errors.ts`/`feriados-errors.ts`: Next.js só
// permite que um arquivo marcado `"use server"` exporte funções async — uma
// classe de erro exportada diretamente de `data-livre.ts`/`feriados.ts`
// quebra `npm run build`. Compartilhada entre os dois arquivos (em vez de uma
// cópia em cada `*-errors.ts`) de propósito: os dois pontos de captura tratam
// exatamente a mesma condição, com a mesma classe de erro, reforçando no
// próprio tipo que o contrato é único.
//
// O terceiro ponto de captura de destino do Lote 6 (quiz, RF-03.1/RF-03.2,
// `./quiz.ts`) nunca coleta/persiste destino — confirmado no cabeçalho de
// `quiz.ts` (L6-T07) — então não há hoje um terceiro lugar a alinhar; se o
// quiz um dia passar a coletar destino em texto livre, deve reusar esta
// mesma classe.
export class InvalidDestinoLengthError extends Error {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super(
      `Destino excede o tamanho máximo permitido (${maxLength} caracteres).`,
    );
    this.name = "InvalidDestinoLengthError";
    this.maxLength = maxLength;
  }
}
