// @vitest-environment node
//
// L2-T02 — Server Action `getFeriadosProlongados` (RF-02.1). Critério de
// aceite: retorna lista ordenada por data, com emenda formatada, ano
// corrente e seguinte.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFeriadosProlongados } from "@/lib/actions/feriados";
import { getNationalHolidaysWithBridgeInRange } from "@/lib/holidays";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("getFeriadosProlongados", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa o ano corrente real (sem hardcode) e o ano seguinte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1)); // 2026-06-01 (mês local, mas só afeta getFullYear())

    const result = await getFeriadosProlongados();

    const years = new Set(result.map((h) => h.date.getUTCFullYear()));
    expect(years).toEqual(new Set([2026, 2027]));

    // Confere contra a fonte pura, para o mesmo range de anos.
    const expected = getNationalHolidaysWithBridgeInRange(2026, 2027);
    expect(result).toHaveLength(expected.length);
  });

  it("retorna a lista ordenada por data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 1));

    const result = await getFeriadosProlongados();

    const times = result.map((h) => h.date.getTime());
    const sortedTimes = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sortedTimes);
  });

  it("inclui nome, data formatada DD/MM e range de emenda para cada feriado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 1));

    const result = await getFeriadosProlongados();

    expect(result.length).toBeGreaterThan(0);
    for (const h of result) {
      expect(typeof h.name).toBe("string");
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.dateFormatted).toMatch(/^\d{2}\/\d{2}$/);
      expect(h.bridge.rangeStartFormatted).toMatch(/^\d{2}\/\d{2}$/);
      expect(h.bridge.rangeEndFormatted).toMatch(/^\d{2}\/\d{2}$/);
      expect(h.bridge.totalDays).toBeGreaterThan(0);
      expect(typeof h.label).toBe("string");
      expect(h.label.length).toBeGreaterThan(0);
    }
  });

  it('formata a emenda de um feriado em quinta-feira como "estende até" o domingo (exemplo do PRD-TECNICO.md/TASK.md L6-T04)', async () => {
    vi.useFakeTimers();
    // Tiradentes (21/04) cai numa terça em 2026, mas Corpus Christi cai numa
    // quinta em vários anos; usamos um ano onde sabemos a data via a própria
    // fonte pura para não hardcodar a regra de calendário aqui.
    vi.setSystemTime(new Date(2026, 0, 1));

    const result = await getFeriadosProlongados();
    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);

    const thursdayHoliday = pure.find((h) => h.bridge.weekday === "thursday");
    expect(thursdayHoliday).toBeDefined();

    const formatted = result.find(
      (h) => iso(h.date) === iso(thursdayHoliday!.date),
    );
    expect(formatted).toBeDefined();
    expect(formatted!.weekdayAbbrev).toBe("Qui");
    expect(formatted!.label).toMatch(/^Qui \d{2}\/\d{2} → estende até Dom \d{2}\/\d{2}, 4 dias$/);
  });

  it("formata um feriado em segunda-feira como emenda 'desde' o sábado anterior", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const result = await getFeriadosProlongados();
    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);

    const mondayHoliday = pure.find((h) => h.bridge.weekday === "monday");
    if (!mondayHoliday) {
      // Nem todo range de 2 anos necessariamente tem um feriado em segunda;
      // se não houver, o teste não se aplica a esse recorte de anos.
      return;
    }

    const formatted = result.find(
      (h) => iso(h.date) === iso(mondayHoliday.date),
    );
    expect(formatted).toBeDefined();
    expect(formatted!.label).toMatch(
      /^Seg \d{2}\/\d{2} → emenda desde Sáb \d{2}\/\d{2}, 3 dias$/,
    );
  });

  it("formata um feriado em quarta-feira como 'sem emenda'", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const result = await getFeriadosProlongados();
    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);

    const wednesdayHoliday = pure.find(
      (h) => h.bridge.weekday === "wednesday",
    );
    if (!wednesdayHoliday) {
      return;
    }

    const formatted = result.find(
      (h) => iso(h.date) === iso(wednesdayHoliday.date),
    );
    expect(formatted).toBeDefined();
    expect(formatted!.label).toMatch(/^Qua \d{2}\/\d{2}, sem emenda \(1 dia\)$/);
  });
});
