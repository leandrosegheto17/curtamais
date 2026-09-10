// L6-T07 — Testes unitários (sem banco) de `resolveSuggestedDateRange`
// (RF-03.2), a parte pura desta tarefa. `submitQuizAnswers` (integração real
// com Postgres) é coberta separadamente em `quiz.integration.test.ts`.
import { describe, expect, it } from "vitest";
import { getNationalHolidaysWithBridgeInRange } from "@/lib/holidays";
import { resolveSuggestedDateRange } from "@/lib/actions/quiz-date-range";

/** Ano fixo e arbitrário (futuro), só para determinismo dos testes — o
 * cálculo de feriados é puro em função do ano, então usar um ano literal
 * fixo torna os testes 100% reproduzíveis, sem depender de "hoje". */
const FIXED_YEAR = 2030;

function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("resolveSuggestedDateRange (RF-03.2)", () => {
  it("fim_de_semana: prioriza o feriado prolongado compatível mais próximo quando existe", () => {
    const holidays = getNationalHolidaysWithBridgeInRange(
      FIXED_YEAR,
      FIXED_YEAR + 1,
    );
    // Exclui 1º de janeiro para não depender de o ano virar no meio da
    // janela de busca (edge case irrelevante ao que este teste quer provar).
    const candidate = holidays.find(
      (h) =>
        h.bridge.totalDays >= 2 &&
        h.bridge.totalDays <= 4 &&
        h.date.getUTCMonth() !== 0,
    );
    expect(candidate).toBeDefined();

    const referenceDate = addDaysUtc(candidate!.bridge.rangeStart, -10);
    const result = resolveSuggestedDateRange("fim_de_semana", referenceDate);

    expect(result.source).toBe("feriado_prolongado");
    expect(isoDay(result.start)).toBe(isoDay(candidate!.bridge.rangeStart));
    expect(isoDay(result.end)).toBe(isoDay(candidate!.bridge.rangeEnd));
  });

  it("3_a_5_dias: prioriza o feriado prolongado compatível mais próximo quando existe", () => {
    const holidays = getNationalHolidaysWithBridgeInRange(
      FIXED_YEAR,
      FIXED_YEAR + 1,
    );
    const candidate = holidays.find(
      (h) =>
        h.bridge.totalDays >= 3 &&
        h.bridge.totalDays <= 5 &&
        h.date.getUTCMonth() !== 0,
    );
    expect(candidate).toBeDefined();

    const referenceDate = addDaysUtc(candidate!.bridge.rangeStart, -10);
    const result = resolveSuggestedDateRange("3_a_5_dias", referenceDate);

    expect(result.source).toBe("feriado_prolongado");
    expect(isoDay(result.start)).toBe(isoDay(candidate!.bridge.rangeStart));
    expect(isoDay(result.end)).toBe(isoDay(candidate!.bridge.rangeEnd));
  });

  it("1_semana: nunca há feriado compatível (bridge máximo é 4 dias) — usa range padrão de 7 dias", () => {
    const referenceDate = new Date("2030-03-01T00:00:00.000Z");
    const result = resolveSuggestedDateRange("1_semana", referenceDate);

    expect(result.source).toBe("periodo_padrao");
    expect(isoDay(result.start)).toBe("2030-03-31"); // +30 dias
    expect(isoDay(result.end)).toBe("2030-04-06"); // +7 dias corridos (inclusive)
    const durationDays =
      Math.round((result.end.getTime() - result.start.getTime()) / 86_400_000) +
      1;
    expect(durationDays).toBe(7);
  });

  it("mais_de_1_semana: nunca há feriado compatível — usa range padrão de 10 dias", () => {
    const referenceDate = new Date("2030-03-01T00:00:00.000Z");
    const result = resolveSuggestedDateRange(
      "mais_de_1_semana",
      referenceDate,
    );

    expect(result.source).toBe("periodo_padrao");
    const durationDays =
      Math.round((result.end.getTime() - result.start.getTime()) / 86_400_000) +
      1;
    expect(durationDays).toBe(10);
    expect(result.start.getTime()).toBeGreaterThan(referenceDate.getTime());
  });

  it("range sugerido nunca começa antes da data de referência, em nenhum período", () => {
    const referenceDate = new Date("2030-06-15T00:00:00.000Z");
    const periodos = [
      "fim_de_semana",
      "3_a_5_dias",
      "1_semana",
      "mais_de_1_semana",
    ] as const;

    for (const periodo of periodos) {
      const result = resolveSuggestedDateRange(periodo, referenceDate);
      expect(result.start.getTime()).toBeGreaterThanOrEqual(
        referenceDate.getTime(),
      );
      expect(result.end.getTime()).toBeGreaterThanOrEqual(
        result.start.getTime(),
      );
    }
  });
});
