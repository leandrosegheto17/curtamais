// @vitest-environment node
//
// L2-T01 — Cálculo determinístico de feriados nacionais BR (ADR-007, RF-02.2,
// RNF-07). Critério de aceite: testes unitários cobrindo feriado em cada dia
// da semana; nenhuma chamada a LLM no caminho de cálculo.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateBridge,
  calculateEaster,
  getFixedHolidays,
  getMovableHolidays,
  getNationalHolidays,
  getNationalHolidaysInRange,
  getNationalHolidaysWithBridge,
  getNationalHolidaysWithBridgeInRange,
} from "@/lib/holidays";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("calculateEaster (base dos feriados móveis, algoritmo de Gauss)", () => {
  it.each([
    [2023, "2023-04-09"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
  ])("calcula a Páscoa de %i corretamente", (year, expected) => {
    expect(iso(calculateEaster(year))).toBe(expected);
  });
});

describe("getFixedHolidays", () => {
  it("retorna os 8 feriados nacionais fixos, na data certa, para qualquer ano", () => {
    const holidays = getFixedHolidays(2030);

    expect(holidays).toHaveLength(8);
    expect(holidays.every((h) => h.type === "fixed")).toBe(true);
    expect(holidays.map((h) => iso(h.date))).toEqual([
      "2030-01-01",
      "2030-04-21",
      "2030-05-01",
      "2030-09-07",
      "2030-10-12",
      "2030-11-02",
      "2030-11-15",
      "2030-12-25",
    ]);
  });

  it("não tem nenhum ano hardcoded — o mesmo dia/mês se repete em anos diferentes", () => {
    const y1 = getFixedHolidays(2024);
    const y2 = getFixedHolidays(2031);

    expect(y1.map((h) => h.date.getUTCMonth())).toEqual(
      y2.map((h) => h.date.getUTCMonth()),
    );
    expect(y1.map((h) => h.date.getUTCDate())).toEqual(
      y2.map((h) => h.date.getUTCDate()),
    );
  });
});

describe("getMovableHolidays (calculados via Páscoa, não hardcoded)", () => {
  it("2024: Carnaval, Sexta-feira Santa e Corpus Christi na data correta", () => {
    const holidays = getMovableHolidays(2024);
    const byName = Object.fromEntries(
      holidays.map((h) => [h.name, iso(h.date)]),
    );

    expect(byName["Carnaval"]).toBe("2024-02-13");
    expect(byName["Sexta-feira Santa"]).toBe("2024-03-29");
    expect(byName["Corpus Christi"]).toBe("2024-05-30");
    expect(holidays.every((h) => h.type === "movable")).toBe(true);
  });

  it("2025: datas móveis diferentes de 2024, sempre derivadas da Páscoa daquele ano", () => {
    const holidays = getMovableHolidays(2025);
    const byName = Object.fromEntries(
      holidays.map((h) => [h.name, iso(h.date)]),
    );

    expect(byName["Carnaval"]).toBe("2025-03-04");
    expect(byName["Sexta-feira Santa"]).toBe("2025-04-18");
    expect(byName["Corpus Christi"]).toBe("2025-06-19");
  });
});

describe("getNationalHolidays / getNationalHolidaysInRange", () => {
  it("combina fixos + móveis, ordenados por data, sem duplicatas", () => {
    const holidays = getNationalHolidays(2025);

    expect(holidays).toHaveLength(11); // 8 fixos + 3 móveis
    const dates = holidays.map((h) => h.date.getTime());
    const sorted = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(sorted);
  });

  it("range de anos (ano corrente + seguinte, RF-02.1) retorna feriados dos dois anos", () => {
    const holidays = getNationalHolidaysInRange(2025, 2026);

    expect(holidays).toHaveLength(22); // 11 por ano * 2 anos
    expect(holidays.some((h) => h.date.getUTCFullYear() === 2025)).toBe(true);
    expect(holidays.some((h) => h.date.getUTCFullYear() === 2026)).toBe(true);
    // ordenado globalmente por data, não agrupado por ano
    const dates = holidays.map((h) => h.date.getTime());
    const sorted = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(sorted);
  });

  it("rejeita range invertido", () => {
    expect(() => getNationalHolidaysInRange(2026, 2025)).toThrow();
  });
});

describe("calculateBridge — emenda de feriado (RF-02.2), um caso por dia da semana", () => {
  it("segunda-feira: já contíguo ao fim de semana anterior, sem dia de emenda (2024-01-01)", () => {
    const holiday = new Date(Date.UTC(2024, 0, 1));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("monday");
    expect(iso(bridge.rangeStart)).toBe("2023-12-30"); // sábado anterior
    expect(iso(bridge.rangeEnd)).toBe("2024-01-01");
    expect(bridge.totalDays).toBe(3);
    expect(bridge.bridgeDays).toHaveLength(0);
  });

  it("terça-feira: emenda a segunda-feira anterior, conectando ao fim de semana (2026-04-21)", () => {
    const holiday = new Date(Date.UTC(2026, 3, 21));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("tuesday");
    expect(iso(bridge.rangeStart)).toBe("2026-04-18"); // sábado anterior
    expect(iso(bridge.rangeEnd)).toBe("2026-04-21");
    expect(bridge.totalDays).toBe(4);
    expect(bridge.bridgeDays.map(iso)).toEqual(["2026-04-20"]); // segunda-feira
  });

  it("quarta-feira: no meio da semana, sem emenda de fim de semana adjacente (2024-05-01)", () => {
    const holiday = new Date(Date.UTC(2024, 4, 1));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("wednesday");
    expect(iso(bridge.rangeStart)).toBe("2024-05-01");
    expect(iso(bridge.rangeEnd)).toBe("2024-05-01");
    expect(bridge.totalDays).toBe(1);
    expect(bridge.bridgeDays).toHaveLength(0);
  });

  it("quinta-feira: emenda a sexta-feira seguinte, estendendo até domingo (exemplo do PRD-TECNICO.md, 2025-05-01)", () => {
    const holiday = new Date(Date.UTC(2025, 4, 1));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("thursday");
    expect(iso(bridge.rangeStart)).toBe("2025-05-01");
    expect(iso(bridge.rangeEnd)).toBe("2025-05-04"); // domingo seguinte
    expect(bridge.totalDays).toBe(4);
    expect(bridge.bridgeDays.map(iso)).toEqual(["2025-05-02"]); // sexta-feira
  });

  it("sexta-feira: já contíguo ao fim de semana seguinte, sem dia de emenda (2026-05-01)", () => {
    const holiday = new Date(Date.UTC(2026, 4, 1));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("friday");
    expect(iso(bridge.rangeStart)).toBe("2026-05-01");
    expect(iso(bridge.rangeEnd)).toBe("2026-05-03"); // domingo seguinte
    expect(bridge.totalDays).toBe(3);
    expect(bridge.bridgeDays).toHaveLength(0);
  });

  it("sábado: cai no fim de semana, sem dia útil a economizar (2024-09-07)", () => {
    const holiday = new Date(Date.UTC(2024, 8, 7));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("saturday");
    expect(iso(bridge.rangeStart)).toBe("2024-09-07");
    expect(iso(bridge.rangeEnd)).toBe("2024-09-08"); // domingo
    expect(bridge.totalDays).toBe(2);
    expect(bridge.bridgeDays).toHaveLength(0);
  });

  it("domingo: cai no fim de semana, sem dia útil a economizar (2025-09-07)", () => {
    const holiday = new Date(Date.UTC(2025, 8, 7));
    const bridge = calculateBridge(holiday);

    expect(bridge.weekday).toBe("sunday");
    expect(iso(bridge.rangeStart)).toBe("2025-09-06"); // sábado
    expect(iso(bridge.rangeEnd)).toBe("2025-09-07");
    expect(bridge.totalDays).toBe(2);
    expect(bridge.bridgeDays).toHaveLength(0);
  });
});

describe("getNationalHolidaysWithBridge / …InRange (RF-02.1 — listagem com emenda)", () => {
  it("cada feriado do ano vem acompanhado da emenda calculada", () => {
    const holidays = getNationalHolidaysWithBridge(2025);

    expect(holidays).toHaveLength(11);
    for (const h of holidays) {
      expect(h.bridge.holiday.getTime()).toBe(h.date.getTime());
      expect(h.bridge.totalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("range de anos também retorna emenda por feriado, ordenado por data", () => {
    const holidays = getNationalHolidaysWithBridgeInRange(2025, 2026);

    expect(holidays).toHaveLength(22);
    const dates = holidays.map((h) => h.date.getTime());
    const sorted = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(sorted);
  });
});

describe("Determinismo / independência de LLM (RNF-07)", () => {
  it("o código-fonte de holidays.ts não referencia gateway de IA/LLM/rede", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../holidays.ts"),
      "utf-8",
    );

    expect(source).not.toMatch(/gateway-ia|openai|fetch\(|await fetch/i);
  });

  // RL2-T01 — mesma checagem estendida a todo o módulo de feriados em
  // src/lib/actions/ (feriados.ts e arquivos correlatos, ex.: feriados-errors.ts),
  // para que um futuro arquivo do módulo que passe a chamar LLM/rede quebre este
  // guardrail sem precisar de nova tarefa para "lembrar" de cobri-lo.
  it("o módulo de feriados em src/lib/actions/ não referencia gateway de IA/LLM/rede", () => {
    const actionsDir = path.resolve(__dirname, "../actions");
    const feriadosFiles = readdirSync(actionsDir).filter(
      (file) => file.startsWith("feriados") && file.endsWith(".ts"),
    );

    // Garante que a varredura está de fato encontrando arquivos — se o módulo
    // for renomeado/movido, o teste deve falhar em vez de passar vazio.
    expect(feriadosFiles.length).toBeGreaterThan(0);

    for (const file of feriadosFiles) {
      const source = readFileSync(path.join(actionsDir, file), "utf-8");
      // Remove comentários antes de checar: arquivos deste módulo documentam,
      // em comentário, o padrão análogo usado por outros arquivos do projeto
      // (ex.: "mesmo padrão usado em src/lib/gateway-ia/errors.ts") — isso é
      // uma referência de documentação, não uma chamada real a LLM/rede, e não
      // deve reprovar o guardrail.
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      // Allowlist: `@/lib/gateway-ia/prompt-injection-guard` é sanitização
      // pura de string (sem fetch/rede/chamada a LLM — ver
      // src/lib/gateway-ia/prompt-injection-guard.ts), importada por
      // feriados.ts só para tratar texto livre do usuário antes de compor um
      // prompt em outro módulo. Mora em `gateway-ia/` por organização de
      // pasta, não por fazer parte do caminho de chamada ao LLM — daí o
      // regex genérico abaixo (mesmo de holidays.test.ts) precisar ignorar só
      // esta linha específica, sem deixar de pegar qualquer outro uso real de
      // `gateway-ia` (ex.: um client/chamada de LLM futura no módulo).
      const withoutSafeImports = withoutComments.replace(
        /import\s*\{[^}]*\}\s*from\s*["']@\/lib\/gateway-ia\/prompt-injection-guard["'];?/g,
        "",
      );

      expect(withoutSafeImports).not.toMatch(
        /gateway-ia|openai|fetch\(|await fetch/i,
      );
    }
  });

  it("é puro: chamar duas vezes com o mesmo ano produz o mesmo resultado (deep equal)", () => {
    const first = getNationalHolidaysWithBridge(2027);
    const second = getNationalHolidaysWithBridge(2027);

    expect(first).toEqual(second);
  });
});
