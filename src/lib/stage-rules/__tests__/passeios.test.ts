// @vitest-environment node
//
// L9-T01 — Regra RF-07: geração de lista de passeios/atividades via Gateway
// de IA + filtro de orçamento (RF-07.1/.2). Critério de aceite: "Cada item
// com nome, faixa de preço (podendo ser R$ 0), duração aproximada; ao menos 1
// item gratuito quando relevante ao destino."
//
// Mesmo padrão de `src/lib/stage-rules/__tests__/hospedagem.test.ts`
// (L8-T01): `generateStructuredCompletionWithRetry` é mockada (nenhuma
// chamada de rede real / nenhuma escrita real em `LlmGenerationLog`) — os
// demais exports do módulo (`buildPasseiosPrompt`, `passeiosOpcoesSchema`,
// `GATEWAY_IA_SCHEMA_NAMES`) permanecem reais via `importOriginal`.
//
// Diferença chave de hospedagem: a lista de passeios tem tamanho variável
// (`passeiosOpcoesSchema.passeios` = `.min(1)`, sem teto, `src/lib/gateway-ia/
// schemas.ts`) — não há "sempre N itens" a testar aqui. A garantia de "ao
// menos 1 item gratuito quando relevante" (RF-07.2) é responsabilidade do
// PROMPT (`buildPasseiosPrompt`, instrução textual ao LLM), não desta regra —
// esta regra não inventa/força um item gratuito artificial quando o LLM não
// retorna nenhum.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePasseiosSuggestions } from "@/lib/stage-rules";

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

function mockPasseios(
  passeios: {
    nome: string;
    precoMin: number;
    precoMax: number;
    gratuito: boolean;
    duracaoAproximada: string;
  }[],
) {
  generateStructuredCompletionWithRetryMock.mockResolvedValueOnce({
    data: { passeios },
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });
}

const PASSEIOS_COM_GRATUITO = [
  {
    nome: "Trilha da Cachoeira",
    precoMin: 0,
    precoMax: 0,
    gratuito: true,
    duracaoAproximada: "2 horas",
  },
  {
    nome: "Passeio de barco",
    precoMin: 80,
    precoMax: 150,
    gratuito: false,
    duracaoAproximada: "3 horas",
  },
  {
    nome: "Tour gastronômico",
    precoMin: 120,
    precoMax: 200,
    gratuito: false,
    duracaoAproximada: "meio período",
  },
];

const BASE_INPUT = {
  sessionId: "session-1",
  referenceDate: "2026-09-10",
  dateRangeStart: "2026-10-10",
  dateRangeEnd: "2026-10-13",
  destination: { name: "Foz do Iguaçu" },
};

describe("generatePasseiosSuggestions (L9-T01, RF-07.1/.2)", () => {
  beforeEach(() => {
    generateStructuredCompletionWithRetryMock.mockReset();
  });

  it("retorna lista com ao menos 1 item, cada um com nome, faixa de preço e duração aproximada (critério de aceite)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions(BASE_INPUT);

    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const item of result) {
      expect(item.name).toEqual(expect.any(String));
      expect(item.name.length).toBeGreaterThan(0);
      expect(typeof item.priceMin).toBe("number");
      expect(typeof item.priceMax).toBe("number");
      expect(item.durationApprox).toEqual(expect.any(String));
      expect(item.durationApprox.length).toBeGreaterThan(0);
      expect(typeof item.isFree).toBe("boolean");
    }
  });

  it("preserva o item gratuito devolvido pelo LLM com isFree=true e preço 0 (RF-07.2)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions(BASE_INPUT);

    const gratuitos = result.filter((item) => item.isFree);
    expect(gratuitos).toHaveLength(1);
    expect(gratuitos[0]).toMatchObject({
      name: "Trilha da Cachoeira",
      priceMin: 0,
      priceMax: 0,
    });
  });

  it("não inventa item gratuito artificial quando o LLM não retorna nenhum (RF-07.2 é responsabilidade do prompt, não desta regra)", async () => {
    mockPasseios([
      {
        nome: "Passeio de barco",
        precoMin: 80,
        precoMax: 150,
        gratuito: false,
        duracaoAproximada: "3 horas",
      },
    ]);

    const result = await generatePasseiosSuggestions(BASE_INPUT);

    expect(result).toHaveLength(1);
    expect(result.every((item) => !item.isFree)).toBe(true);
  });

  it("chama o Gateway de IA com retry (L3-T04) para a etapa passeios, com sessionId/stage corretos e destino no prompt", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    await generatePasseiosSuggestions(BASE_INPUT);

    expect(generateStructuredCompletionWithRetryMock).toHaveBeenCalledTimes(1);
    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.sessionId).toBe("session-1");
    expect(callArgs.stage).toBe("passeios");
    expect(callArgs.schemaName).toBe("passeios_opcoes");
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

  it("repassa a hospedagem aprovada ao prompt quando informada (contexto opcional da etapa)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    await generatePasseiosSuggestions({
      ...BASE_INPUT,
      accommodation: { name: "Pousada Vista Mar", type: "pousada" },
    });

    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Pousada Vista Mar"),
        }),
      ]),
    );
  });

  it("sem orçamento informado, nunca bloqueia e devolve todos com withinBudget=true/exceedsBudget=false (RF-10.3/RN-04)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions({
      ...BASE_INPUT,
      budgetAmount: null,
    });

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.withinBudget)).toBe(true);
    expect(result.every((r) => !r.exceedsBudget)).toBe(true);
  });

  it("item gratuito (preço 0) sempre withinBudget=true, mesmo com orçamento muito abaixo do menor item pago (RF-10 + gratuidade)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions({
      ...BASE_INPUT,
      budgetAmount: 1,
    });

    const gratuito = result.find((r) => r.name === "Trilha da Cachoeira");
    expect(gratuito).toMatchObject({ withinBudget: true, exceedsBudget: false });
  });

  it("com orçamento informado, reordena itens dentro da faixa primeiro (RF-10.1), mantendo todos os itens", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions({
      ...BASE_INPUT,
      budgetAmount: 100,
      budgetCurrency: "BRL",
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name)).toEqual([
      "Trilha da Cachoeira",
      "Passeio de barco",
      "Tour gastronômico",
    ]);
    expect(result[0]).toMatchObject({ withinBudget: true, exceedsBudget: false });
    expect(result[1]).toMatchObject({ withinBudget: true, exceedsBudget: false });
    expect(result[2]).toMatchObject({ withinBudget: false, exceedsBudget: false });
  });

  it("com orçamento muito baixo, o item gratuito por si só já cabe no orçamento (precoMin=0), então nenhum item é sinalizado como excedente (RF-10.2 só se aplica quando NENHUM item cabe)", async () => {
    mockPasseios(PASSEIOS_COM_GRATUITO);

    const result = await generatePasseiosSuggestions({
      ...BASE_INPUT,
      budgetAmount: 10,
    });

    expect(result).toHaveLength(3);
    const gratuito = result.find((r) => r.name === "Trilha da Cachoeira");
    expect(gratuito).toMatchObject({ withinBudget: true, exceedsBudget: false });
    expect(result.filter((r) => r.exceedsBudget)).toHaveLength(0);
  });

  it("quando não há nenhum item gratuito e nenhum item pago cabe no orçamento, o mais barato é sinalizado como excedente (RF-10.2)", async () => {
    mockPasseios([
      {
        nome: "Passeio de barco",
        precoMin: 80,
        precoMax: 150,
        gratuito: false,
        duracaoAproximada: "3 horas",
      },
      {
        nome: "Tour gastronômico",
        precoMin: 120,
        precoMax: 200,
        gratuito: false,
        duracaoAproximada: "meio período",
      },
    ]);

    const result = await generatePasseiosSuggestions({
      ...BASE_INPUT,
      budgetAmount: 10,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "Passeio de barco",
      exceedsBudget: true,
      withinBudget: false,
    });
    expect(result.filter((r) => r.exceedsBudget)).toHaveLength(1);
  });

  it("lança erro claro quando chamada sem destino já aprovado (RN-01/RF-11) — a fronteira do prompt, não deste módulo", async () => {
    await expect(
      generatePasseiosSuggestions({
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

  it("propaga o erro do Gateway de IA (ex. falha após retry) sem mascarar", async () => {
    generateStructuredCompletionWithRetryMock.mockRejectedValueOnce(
      new Error("falha simulada após retry"),
    );

    await expect(
      generatePasseiosSuggestions(BASE_INPUT),
    ).rejects.toThrow(/falha simulada/);
  });
});
