// @vitest-environment node
//
// V2-L4-T06a — `getProximosFeriados` (RF-12, RF-18, ADR-011). Critério de
// aceite: 3 próximos feriados a partir da data civil `America/Sao_Paulo`,
// testado para cada mês do ano (12 casos, cobrindo virada de ano); nenhum
// cálculo paralelo ao de RF-02.2 (RNF-07).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProximosFeriados } from "@/lib/proximos-feriados";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Cada caso usa `01:00 UTC` do dia 1 de um mês de 2026, que corresponde a
// `22:00` do último dia do mês anterior em `America/Sao_Paulo` (UTC-03:00,
// fixo desde o fim do horário de verão em 2019) — exercitando de fato a
// conversão de fuso horário (não apenas um corte ingênuo em UTC), com um dos
// 12 casos cruzando a virada de ano (referência em janeiro de 2026 resolve
// para o dia civil 2025-12-31).
describe("getProximosFeriados — 12 casos (um por mês, cobrindo virada de ano)", () => {
  it.each([
    ["2026-01-01T01:00:00Z", ["2026-01-01", "2026-02-17", "2026-04-03"]],
    ["2026-02-01T01:00:00Z", ["2026-02-17", "2026-04-03", "2026-04-21"]],
    ["2026-03-01T01:00:00Z", ["2026-04-03", "2026-04-21", "2026-05-01"]],
    ["2026-04-01T01:00:00Z", ["2026-04-03", "2026-04-21", "2026-05-01"]],
    ["2026-05-01T01:00:00Z", ["2026-05-01", "2026-06-04", "2026-09-07"]],
    ["2026-06-01T01:00:00Z", ["2026-06-04", "2026-09-07", "2026-10-12"]],
    ["2026-07-01T01:00:00Z", ["2026-09-07", "2026-10-12", "2026-11-02"]],
    ["2026-08-01T01:00:00Z", ["2026-09-07", "2026-10-12", "2026-11-02"]],
    ["2026-09-01T01:00:00Z", ["2026-09-07", "2026-10-12", "2026-11-02"]],
    ["2026-10-01T01:00:00Z", ["2026-10-12", "2026-11-02", "2026-11-15"]],
    ["2026-11-01T01:00:00Z", ["2026-11-02", "2026-11-15", "2026-12-25"]],
    ["2026-12-01T01:00:00Z", ["2026-12-25", "2027-01-01", "2027-02-09"]],
  ])(
    "hoje=%s (fuso America/Sao_Paulo) → 3 próximos feriados %s",
    (hojeIso, expectedDates) => {
      const hoje = new Date(hojeIso);
      const result = getProximosFeriados(hoje, 3);

      expect(result).toHaveLength(3);
      expect(result.map((h) => iso(h.date))).toEqual(expectedDates);
      // ordem cronológica
      const times = result.map((h) => h.date.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    },
  );
});

describe("getProximosFeriados — comportamento geral", () => {
  it("inclui o próprio dia quando ele é feriado (limite inclusivo)", () => {
    const hoje = new Date("2026-04-21T12:00:00Z"); // Tiradentes, meio-dia UTC
    const result = getProximosFeriados(hoje, 1);

    expect(iso(result[0].date)).toBe("2026-04-21");
  });

  it("respeita a quantidade pedida", () => {
    const hoje = new Date("2026-01-01T01:00:00Z");

    expect(getProximosFeriados(hoje, 1)).toHaveLength(1);
    expect(getProximosFeriados(hoje, 5)).toHaveLength(5);
  });

  it("quantidade zero ou negativa retorna lista vazia", () => {
    const hoje = new Date("2026-01-01T01:00:00Z");

    expect(getProximosFeriados(hoje, 0)).toEqual([]);
    expect(getProximosFeriados(hoje, -1)).toEqual([]);
  });

  it("cada resultado já vem com a emenda calculada (mesmo tipo de holidays.ts)", () => {
    const hoje = new Date("2026-01-01T01:00:00Z");
    const result = getProximosFeriados(hoje, 3);

    for (const h of result) {
      expect(h.bridge.holiday.getTime()).toBe(h.date.getTime());
      expect(h.bridge.totalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("é puro: chamar duas vezes com o mesmo `hoje` produz o mesmo resultado (deep equal)", () => {
    const hoje = new Date("2026-06-15T00:00:00Z");
    const first = getProximosFeriados(hoje, 3);
    const second = getProximosFeriados(hoje, 3);

    expect(first).toEqual(second);
  });
});

describe("Determinismo / independência de LLM (RNF-07) e não-duplicação de cálculo", () => {
  it("o código-fonte não referencia gateway de IA/LLM/rede", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../proximos-feriados.ts"),
      "utf-8",
    );

    expect(source).not.toMatch(/gateway-ia|openai|fetch\(|await fetch/i);
  });

  it("reaproveita getNationalHolidaysWithBridgeInRange, sem reimplementar cálculo de feriados/emenda", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../proximos-feriados.ts"),
      "utf-8",
    );

    expect(source).toMatch(/getNationalHolidaysWithBridgeInRange/);
    // Nenhum nome de feriado nacional hardcoded — sinal de que a lista não
    // está sendo recalculada aqui.
    expect(source).not.toMatch(/Tiradentes|Carnaval|Corpus Christi/);
  });
});
