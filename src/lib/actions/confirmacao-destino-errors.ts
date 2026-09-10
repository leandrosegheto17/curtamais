// L7-T05 — Erro dedicado de `confirmarDestino` (`./confirmacao-destino.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) pelo mesmo motivo já
// documentado em `src/lib/actions/data-livre-errors.ts`: Next.js só permite
// que um arquivo marcado `"use server"` exporte funções async — uma classe de
// erro exportada diretamente de `confirmacao-destino.ts` quebra `npm run
// build`.

export class InvalidConfirmacaoDestinoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfirmacaoDestinoInputError";
  }
}
