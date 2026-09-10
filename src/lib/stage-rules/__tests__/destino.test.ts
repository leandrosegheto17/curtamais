// @vitest-environment node
//
// L7-T01 — Regra RF-04: geração de 2-4 sugestões de destino via Gateway de
// IA + filtro de orçamento (RF-04.1/RF-10). Critério de aceite: "Cada
// sugestão tem nome, justificativa curta, faixa de preço; respeita orçamento
// quando informado."
//
// `generateStructuredCompletionWithRetry` é mockada (nenhuma chamada de rede
// real / nenhuma escrita real em `LlmGenerationLog`, mesmo padrão de
// `src/lib/gateway-ia/__tests__/index.test.ts`) — os demais exports do
// módulo (`buildDestinoPrompt`, `destinoSugestoesSchema`,
// `GATEWAY_IA_SCHEMA_NAMES`) permanecem reais via `importOriginal`, para que
// o teste continue exercitando o prompt/schema de verdade, não um dublê.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDestinationSuggestions } from "@/lib/stage-rules";

const generateStructuredCompletionWithRetryMock = vi.fn();

vi.mock("@/lib/gateway-ia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway-ia")>();
  return {
    ...actual,
    generateStructuredCompletionWithRetry: (
      ...args: Parameters<typeof actual.generateStructuredCompletionWithRetry>
    ) => generateStructuredCompletionWithRetryMock(...args),
  };
});

function mockDestinos(
  destinos: {
    nome: string;
    justificativa: string;
    faixaPrecoMin: number;
    faixaPrecoMax: number;
  }[],
) {
  generateStructuredCompletionWithRetryMock.mockResolvedValueOnce({
    data: { destinos },
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });
}

describe("generateDestinationSuggestions (L7-T01, RF-04.1/RF-10)", () => {
  beforeEach(() => {
    generateStructuredCompletionWithRetryMock.mockReset();
  });

  it("retorna cada sugestão com nome, justificativa e faixa de preço (critério de aceite)", async () => {
    mockDestinos([
      {
        nome: "Foz do Iguaçu",
        justificativa: "Clima ameno no período e boa relação custo-benefício.",
        faixaPrecoMin: 1500,
        faixaPrecoMax: 2500,
      },
      {
        nome: "Gramado",
        justificativa: "Sazonalidade favorável para o período informado.",
        faixaPrecoMin: 1800,
        faixaPrecoMax: 2800,
      },
    ]);

    const result = await generateDestinationSuggestions({
      sessionId: "session-1",
      referenceDate: "2026-09-10",
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-13",
    });

    expect(result).toHaveLength(2);
    for (const suggestion of result) {
      expect(suggestion.name).toEqual(expect.any(String));
      expect(suggestion.name.length).toBeGreaterThan(0);
      expect(suggestion.justification).toEqual(expect.any(String));
      expect(suggestion.justification.length).toBeGreaterThan(0);
      expect(typeof suggestion.priceRangeMin).toBe("number");
      expect(typeof suggestion.priceRangeMax).toBe("number");
    }
  });

  it("chama o Gateway de IA com retry (L3-T04) para a etapa destino, com sessionId/stage corretos", async () => {
    mockDestinos([
      { nome: "A", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
      { nome: "B", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
    ]);

    await generateDestinationSuggestions({
      sessionId: "session-42",
      referenceDate: "2026-09-10",
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-13",
    });

    expect(generateStructuredCompletionWithRetryMock).toHaveBeenCalledTimes(1);
    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.sessionId).toBe("session-42");
    expect(callArgs.stage).toBe("destino");
    expect(callArgs.schemaName).toBe("destino_sugestoes");
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user" }),
      ]),
    );
  });

  it("sem orçamento informado, nunca bloqueia e devolve todas com withinBudget=true/exceedsBudget=false (RF-10.3/RN-04)", async () => {
    mockDestinos([
      { nome: "Caro", justificativa: "J", faixaPrecoMin: 5000, faixaPrecoMax: 8000 },
      { nome: "Barato", justificativa: "J", faixaPrecoMin: 500, faixaPrecoMax: 1000 },
    ]);

    const result = await generateDestinationSuggestions({
      sessionId: "session-1",
      referenceDate: "2026-09-10",
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-13",
      budgetAmount: null,
    });

    expect(result.map((r) => r.name)).toEqual(["Caro", "Barato"]);
    expect(result.every((r) => r.withinBudget)).toBe(true);
    expect(result.every((r) => !r.exceedsBudget)).toBe(true);
  });

  it("com orçamento informado, reordena sugestões dentro da faixa primeiro (RF-10.1)", async () => {
    mockDestinos([
      { nome: "Caro", justificativa: "J", faixaPrecoMin: 5000, faixaPrecoMax: 8000 },
      { nome: "Barato", justificativa: "J", faixaPrecoMin: 500, faixaPrecoMax: 1000 },
    ]);

    const result = await generateDestinationSuggestions({
      sessionId: "session-1",
      referenceDate: "2026-09-10",
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-13",
      budgetAmount: 1200,
      budgetCurrency: "BRL",
    });

    expect(result.map((r) => r.name)).toEqual(["Barato", "Caro"]);
    expect(result[0]).toMatchObject({ withinBudget: true, exceedsBudget: false });
    expect(result[1]).toMatchObject({ withinBudget: false, exceedsBudget: false });
  });

  it("quando nenhuma sugestão cabe no orçamento, devolve a mais barata primeiro com exceedsBudget=true, sem lançar erro nem esvaziar a lista (RF-10.2)", async () => {
    mockDestinos([
      { nome: "Caríssimo", justificativa: "J", faixaPrecoMin: 9000, faixaPrecoMax: 12000 },
      { nome: "Caro", justificativa: "J", faixaPrecoMin: 5000, faixaPrecoMax: 8000 },
    ]);

    const result = await generateDestinationSuggestions({
      sessionId: "session-1",
      referenceDate: "2026-09-10",
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-13",
      budgetAmount: 1000,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Caro", exceedsBudget: true, withinBudget: false });
    expect(result[1]).toMatchObject({ name: "Caríssimo", exceedsBudget: false, withinBudget: false });
  });

  it("propaga o erro do Gateway de IA (ex. falha após retry) sem mascarar", async () => {
    generateStructuredCompletionWithRetryMock.mockRejectedValueOnce(
      new Error("falha simulada após retry"),
    );

    await expect(
      generateDestinationSuggestions({
        sessionId: "session-1",
        referenceDate: "2026-09-10",
        dateRangeStart: "2026-10-10",
        dateRangeEnd: "2026-10-13",
      }),
    ).rejects.toThrow(/falha simulada/);
  });
});
