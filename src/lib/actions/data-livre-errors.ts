// L6-T03 — Erro dedicado de `submeterDataLivre` (`./data-livre.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) porque Next.js só
// permite que um arquivo marcado `"use server"` exporte funções async — uma
// classe de erro exportada diretamente de `data-livre.ts` quebra
// `npm run build` ("Only async functions are allowed to be exported in a
// 'use server' file'"). Mesmo padrão de separação já usado em
// `src/lib/gateway-ia/errors.ts` e `src/lib/session-flow/errors.ts`.

export class InvalidDataLivreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDataLivreInputError";
  }
}
