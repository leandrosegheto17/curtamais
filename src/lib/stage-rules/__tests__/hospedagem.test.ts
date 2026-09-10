// @vitest-environment node
//
// L8-T01 — Regra RF-06: geração de 3 opções de hospedagem via Gateway de IA +
// filtro de orçamento (RF-06.1/.2). Critério de aceite: "Sempre 3 opções,
// cada uma com nome/tipo, faixa de preço por diária, característica
// distintiva."
//
// Mesmo padrão de `src/lib/stage-rules/__tests__/destino.test.ts` (L7-T01):
// `generateStructuredCompletionWithRetry` é mockada (nenhuma chamada de rede
// real / nenhuma escrita real em `LlmGenerationLog`) — os demais exports do
// módulo (`buildHospedagemPrompt`, `hospedagemOpcoesSchema`,
// `GATEWAY_IA_SCHEMA_NAMES`) permanecem reais via `importOriginal`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAccommodationSuggestions } from "@/lib/stage-rules";

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

function mockOpcoes(
  opcoes: {
    nome: string;
    tipo: string;
    precoPorDiariaMin: number;
    precoPorDiariaMax: number;
    caracteristicaDistintiva: string;
  }[],
) {
  generateStructuredCompletionWithRetryMock.mockResolvedValueOnce({
    data: { opcoes },
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });
}

const THREE_OPCOES = [
  {
    nome: "Pousada Vista Mar",
    tipo: "pousada",
    precoPorDiariaMin: 150,
    precoPorDiariaMax: 220,
    caracteristicaDistintiva: "Café da manhã incluso com vista para o mar.",
  },
  {
    nome: "Hotel Central",
    tipo: "hotel",
    precoPorDiariaMin: 300,
    precoPorDiariaMax: 450,
    caracteristicaDistintiva: "Localização a 5 minutos do centro histórico.",
  },
  {
    nome: "Hostel Mochileiro",
    tipo: "hostel",
    precoPorDiariaMin: 60,
    precoPorDiariaMax: 90,
    caracteristicaDistintiva: "Cozinha compartilhada e ambiente social.",
  },
];

const BASE_INPUT = {
  sessionId: "session-1",
  referenceDate: "2026-09-10",
  dateRangeStart: "2026-10-10",
  dateRangeEnd: "2026-10-13",
  destination: { name: "Foz do Iguaçu" },
};

describe("generateAccommodationSuggestions (L8-T01, RF-06.1/.2)", () => {
  beforeEach(() => {
    generateStructuredCompletionWithRetryMock.mockReset();
  });

  it("retorna sempre exatamente 3 opções, cada uma com nome, tipo, faixa de preço por diária e característica distintiva (critério de aceite)", async () => {
    mockOpcoes(THREE_OPCOES);

    const result = await generateAccommodationSuggestions(BASE_INPUT);

    expect(result).toHaveLength(3);
    for (const option of result) {
      expect(option.name).toEqual(expect.any(String));
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.type).toEqual(expect.any(String));
      expect(option.type.length).toBeGreaterThan(0);
      expect(typeof option.pricePerNightMin).toBe("number");
      expect(typeof option.pricePerNightMax).toBe("number");
      expect(option.distinctiveFeature).toEqual(expect.any(String));
      expect(option.distinctiveFeature.length).toBeGreaterThan(0);
    }
  });

  it("chama o Gateway de IA com retry (L3-T04) para a etapa hospedagem, com sessionId/stage corretos e destino no prompt", async () => {
    mockOpcoes(THREE_OPCOES);

    await generateAccommodationSuggestions(BASE_INPUT);

    expect(generateStructuredCompletionWithRetryMock).toHaveBeenCalledTimes(1);
    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.sessionId).toBe("session-1");
    expect(callArgs.stage).toBe("hospedagem");
    expect(callArgs.schemaName).toBe("hospedagem_opcoes");
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Foz do Iguaçu"),
        }),
      ]),
    );
  });

  it("sem orçamento informado, nunca bloqueia e devolve todas com withinBudget=true/exceedsBudget=false (RF-10.3/RN-04)", async () => {
    mockOpcoes(THREE_OPCOES);

    const result = await generateAccommodationSuggestions({
      ...BASE_INPUT,
      budgetAmount: null,
    });

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.withinBudget)).toBe(true);
    expect(result.every((r) => !r.exceedsBudget)).toBe(true);
  });

  it("com orçamento informado, reordena opções dentro da faixa primeiro (RF-10.1), mantendo as 3 opções", async () => {
    mockOpcoes(THREE_OPCOES);

    const result = await generateAccommodationSuggestions({
      ...BASE_INPUT,
      budgetAmount: 100,
      budgetCurrency: "BRL",
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual([
      "Hostel Mochileiro",
      "Pousada Vista Mar",
      "Hotel Central",
    ]);
    expect(result[0]).toMatchObject({ withinBudget: true, exceedsBudget: false });
    expect(result[1]).toMatchObject({ withinBudget: false, exceedsBudget: false });
    expect(result[2]).toMatchObject({ withinBudget: false, exceedsBudget: false });
  });

  it("quando nenhuma opção cabe no orçamento, devolve a mais barata primeiro com exceedsBudget=true, ainda com as 3 opções (RF-06.2/RF-10.2)", async () => {
    mockOpcoes(THREE_OPCOES);

    const result = await generateAccommodationSuggestions({
      ...BASE_INPUT,
      budgetAmount: 10,
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      name: "Hostel Mochileiro",
      exceedsBudget: true,
      withinBudget: false,
    });
    expect(result.filter((r) => r.exceedsBudget)).toHaveLength(1);
  });

  it("lança erro claro quando chamada sem destino já aprovado (RN-01/RF-11) — a fronteira do prompt, não deste módulo", async () => {
    await expect(
      generateAccommodationSuggestions({
        sessionId: "session-1",
        referenceDate: "2026-09-10",
        dateRangeStart: "2026-10-10",
        dateRangeEnd: "2026-10-13",
        // @ts-expect-error -- teste deliberadamente omite `destination` obrigatório
        destination: undefined,
      }),
    ).rejects.toThrow(/destination/);

    expect(generateStructuredCompletionWithRetryMock).not.toHaveBeenCalled();
  });

  it("RL8-T01: repassa adjustmentFeedback ao prompt quando informado (RF-05.3)", async () => {
    mockOpcoes(THREE_OPCOES);

    await generateAccommodationSuggestions({
      ...BASE_INPUT,
      adjustmentFeedback: "prefiro algo mais perto do centro",
    });

    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("prefiro algo mais perto do centro"),
        }),
      ]),
    );
  });

  it("RL8-T01: sem adjustmentFeedback, o prompt não menciona ajuste (sem regressão)", async () => {
    mockOpcoes(THREE_OPCOES);

    await generateAccommodationSuggestions(BASE_INPUT);

    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    const fullText = callArgs.messages.map((m: { content: string }) => m.content).join("\n");
    expect(fullText).not.toMatch(/pediu um ajuste/i);
  });

  it("propaga o erro do Gateway de IA (ex. falha após retry) sem mascarar", async () => {
    generateStructuredCompletionWithRetryMock.mockRejectedValueOnce(
      new Error("falha simulada após retry"),
    );

    await expect(
      generateAccommodationSuggestions(BASE_INPUT),
    ).rejects.toThrow(/falha simulada/);
  });
});
