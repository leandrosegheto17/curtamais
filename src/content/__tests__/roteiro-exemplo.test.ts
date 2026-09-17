// V2-L3-T01 — testes de estrutura de `src/content/roteiro-exemplo.ts`
// (RF-14, ADR-011). Critério de aceite: "dias rotulados 'Dia N — {dia da
// semana}', sem data de calendário" + o arquivo tipa com os mesmos tipos do
// roteiro real (`RoteiroDayResult`/`RoteiroItemResult`,
// `src/lib/stage-rules/roteiro.ts`, L10-T01).
//
// Este teste NÃO valida o conteúdo em si (preços, nomes, tom de voz) — essa
// é a revisão humana do dono do produto, pendente antes do commit definitivo
// (ver `.md/TASK.md`, V2-L3-T01, e `.md/BLOCKERS.md`). Só valida que a
// ESTRUTURA gerada pelo script bate com o contrato de tipos exigido.
import { describe, expect, it } from "vitest";

import { roteiroExemplo } from "@/content/roteiro-exemplo";

describe("roteiroExemplo (V2-L3-T01)", () => {
  it("tem exatamente 3 dias (Gramado, fim de semana de 3 dias)", () => {
    expect(roteiroExemplo.days).toHaveLength(3);
  });

  it("cada dia é rotulado 'Dia N — {dia da semana}', nunca com data de calendário", () => {
    roteiroExemplo.days.forEach((day, index) => {
      // Formato exato: "Dia N — <dia da semana por extenso>", N = posição 1-based.
      expect(day.dayLabel).toMatch(/^Dia \d+ — [a-zà-ú-]+$/u);
      expect(day.dayLabel.startsWith(`Dia ${index + 1} — `)).toBe(true);
      // Nenhum dígito de calendário (DD/MM, DD-MM, ano) escapa no rótulo —
      // só o número sequencial do dia ("Dia 1", "Dia 2"...).
      expect(day.dayLabel.replace(/^Dia \d+/, "")).not.toMatch(/\d/);
      // Nunca carrega um campo `date` (ISO) — tipo é `Omit<RoteiroDayResult, "date">`.
      expect(day).not.toHaveProperty("date");
    });
  });

  it("cada dia sempre tem os 3 blocos presentes (manhã/tarde/noite), mesmo vazios", () => {
    for (const day of roteiroExemplo.days) {
      expect(Array.isArray(day.morning)).toBe(true);
      expect(Array.isArray(day.afternoon)).toBe(true);
      expect(Array.isArray(day.evening)).toBe(true);
    }
  });

  it("todo item de todo bloco bate com o shape de RoteiroItemResult (activity/suggestedTime/timingJustification/sequenceOrder)", () => {
    const allItems = roteiroExemplo.days.flatMap((day) => [
      ...day.morning,
      ...day.afternoon,
      ...day.evening,
    ]);

    expect(allItems.length).toBeGreaterThan(0);

    for (const item of allItems) {
      expect(typeof item.activity).toBe("string");
      expect(item.activity.length).toBeGreaterThan(0);
      expect(typeof item.suggestedTime).toBe("string");
      expect(item.suggestedTime.length).toBeGreaterThan(0);
      expect(
        item.timingJustification === null ||
          typeof item.timingJustification === "string",
      ).toBe(true);
      expect(typeof item.sequenceOrder).toBe("number");
    }
  });

  it("sequenceOrder é cronológico e sem repetição em todo o roteiro (dia > manhã/tarde/noite > ordem dentro do bloco)", () => {
    const allItems = roteiroExemplo.days.flatMap((day) => [
      ...day.morning,
      ...day.afternoon,
      ...day.evening,
    ]);
    const sequenceOrders = allItems.map((item) => item.sequenceOrder);
    const expected = sequenceOrders
      .slice()
      .sort((a, b) => a - b)
      .map((_, index) => index);

    expect(sequenceOrders).toEqual(expected);
  });

  it("resumo (destino/hospedagem/passeios) tem faixa de preço numérica compatível com PriceRangeBadge", () => {
    const resumoItems = [
      roteiroExemplo.destination,
      roteiroExemplo.accommodation,
      ...roteiroExemplo.activities,
    ];

    expect(resumoItems.length).toBeGreaterThanOrEqual(3);

    for (const resumoItem of resumoItems) {
      expect(typeof resumoItem.label).toBe("string");
      expect(typeof resumoItem.value).toBe("string");
      expect(typeof resumoItem.priceRangeMin).toBe("number");
      expect(typeof resumoItem.priceRangeMax).toBe("number");
      expect(resumoItem.priceRangeMin).toBeGreaterThanOrEqual(0);
      expect(resumoItem.priceRangeMax).toBeGreaterThanOrEqual(
        resumoItem.priceRangeMin,
      );
    }
  });

  it("slug bate com o catálogo de destinos (V2-L2-T01, usado pelo CTA de T-EX)", () => {
    expect(roteiroExemplo.slug).toBe("gramado");
  });

  it("registra proveniência explícita e sinaliza pendência de revisão humana (ADR-011)", () => {
    expect(roteiroExemplo.generatedFrom.sessionId.length).toBeGreaterThan(0);
    expect(typeof roteiroExemplo.generatedFrom.reviewedByOwner).toBe(
      "boolean",
    );
    expect(roteiroExemplo.generatedFrom.note.length).toBeGreaterThan(0);
  });
});
