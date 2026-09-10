// L6-T05 — Erro dedicado de `processarFeriadoEscolhido` (`./feriados.ts`).
//
// Extraído para um arquivo próprio (sem `"use server"`) porque Next.js só
// permite que um arquivo marcado `"use server"` exporte funções async — uma
// classe de erro exportada diretamente de `feriados.ts` quebra `npm run
// build` ("Only async functions are allowed to be exported in a 'use
// server' file"). Mesmo padrão já usado em `src/lib/gateway-ia/errors.ts`,
// `src/lib/session-flow/errors.ts` e `src/lib/actions/data-livre-errors.ts`
// (L6-T03).

/**
 * Lançado quando `holidayDate` não corresponde a nenhum feriado da listagem
 * determinística atual (RF-02.1/RF-02.2) — nunca cria `TripSession` nesse
 * caso.
 */
export class InvalidHolidaySelectionError extends Error {
  readonly holidayDate: string;

  constructor(holidayDate: string) {
    super(
      `Feriado não encontrado na listagem atual para a data informada: "${holidayDate}".`,
    );
    this.name = "InvalidHolidaySelectionError";
    this.holidayDate = holidayDate;
  }
}
