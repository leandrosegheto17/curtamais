// @vitest-environment node
//
// L3-T04 — `generateStructuredCompletionWithRetry` (ADR-004/RNF-05):
// retry único automático + escrita em `LlmGenerationLog`. O SDK da OpenAI e
// o Prisma Client são mockados — nenhuma chamada de rede/banco real
// acontece neste teste (mesmo padrão de `index.test.ts`/`stream.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  GatewayIaError,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import { resetOpenAIClientForTests } from "@/lib/gateway-ia/client";

// `vi.hoisted` garante que `parseMock`/`createLogMock` existam antes dos
// `vi.mock` abaixo serem hoisted para o topo do arquivo pelo Vitest (mesma
// necessidade surge aqui por este teste mockar DOIS módulos — "openai" e
// "@/lib/prisma" — ao mesmo tempo; os demais testes do módulo `gateway-ia`
// só mockam "openai", então não precisam deste passo extra).
const { parseMock, createLogMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
  createLogMock: vi.fn(),
}));

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          parse: parseMock,
        },
      },
    })),
  };
});

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      llmGenerationLog: {
        create: createLogMock,
      },
    },
  };
});

const destinoSchema = z.object({
  destino: z.string(),
  justificativa: z.string(),
});

function successCompletion(overrides?: Partial<{ usage: unknown }>) {
  return {
    model: "gpt-4o-mini",
    choices: [
      {
        message: {
          parsed: {
            destino: "Foz do Iguaçu",
            justificativa: "Dentro do orçamento e clima ameno no período.",
          },
          refusal: null,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...overrides,
  };
}

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

describe("generateStructuredCompletionWithRetry (Gateway de IA, L3-T04)", () => {
  beforeEach(() => {
    resetOpenAIClientForTests();
    parseMock.mockReset();
    createLogMock.mockReset();
    createLogMock.mockResolvedValue({});
    process.env.OPENAI_API_KEY = "sk-test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  afterEach(() => {
    resetOpenAIClientForTests();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  it("sucesso na 1ª tentativa não gera retry nem tentativa adicional ao provider", async () => {
    parseMock.mockResolvedValueOnce(successCompletion());

    const result = await generateStructuredCompletionWithRetry({
      sessionId: "session-1",
      stage: "destino",
      schemaName: "destino_sugestao_teste",
      schema: destinoSchema,
      messages: [{ role: "user", content: "Sugira um destino." }],
    });

    expect(result.data.destino).toBe("Foz do Iguaçu");
    expect(parseMock).toHaveBeenCalledTimes(1);

    expect(createLogMock).toHaveBeenCalledTimes(1);
    const logData = createLogMock.mock.calls[0][0].data;
    expect(logData).toMatchObject({
      sessionId: "session-1",
      stage: "destino",
      provider: "openai",
      promptVersion: "destino_sugestao_teste",
      tokensInput: 100,
      tokensOutput: 50,
      retryCount: 0,
      status: "success",
    });
    expect(typeof logData.latencyMs).toBe("number");
    expect(typeof logData.costEstimateUsd).toBe("number");
  });

  it("falha simulada na 1ª tentativa gera exatamente 1 retry automático, e sucesso na 2ª é devolvido ao chamador (critério de aceite)", async () => {
    parseMock.mockRejectedValueOnce(new Error("network timeout"));
    parseMock.mockResolvedValueOnce(successCompletion());

    const result = await generateStructuredCompletionWithRetry({
      sessionId: "session-1",
      stage: "destino",
      schemaName: "destino_sugestao_teste",
      schema: destinoSchema,
      messages: [{ role: "user", content: "Sugira um destino." }],
    });

    expect(result.data.destino).toBe("Foz do Iguaçu");
    // Exatamente 2 tentativas ao provider: a 1ª (falhou) + 1 retry (sucesso).
    // Nunca mais que isso — teto rígido do ADR-004/RNF-05.
    expect(parseMock).toHaveBeenCalledTimes(2);

    // Log gravado apenas para o resultado final da chamada lógica (ver
    // decisão de granularidade em `./generation-log.ts`), com retryCount=1.
    expect(createLogMock).toHaveBeenCalledTimes(1);
    const logData = createLogMock.mock.calls[0][0].data;
    expect(logData).toMatchObject({ retryCount: 1, status: "success" });
  });

  it("falha nas duas tentativas propaga GatewayIaError ao chamador e grava log de falha (critério de aceite)", async () => {
    parseMock.mockRejectedValueOnce(new Error("network timeout"));
    parseMock.mockRejectedValueOnce(new Error("network timeout novamente"));

    await expect(
      generateStructuredCompletionWithRetry({
        sessionId: "session-1",
        stage: "destino",
        schemaName: "destino_sugestao_teste",
        schema: destinoSchema,
        messages: [{ role: "user", content: "Sugira um destino." }],
      }),
    ).rejects.toBeInstanceOf(GatewayIaError);

    // Exatamente 2 tentativas — nunca um loop além do único retry permitido.
    expect(parseMock).toHaveBeenCalledTimes(2);

    expect(createLogMock).toHaveBeenCalledTimes(1);
    const logData = createLogMock.mock.calls[0][0].data;
    expect(logData).toMatchObject({
      sessionId: "session-1",
      stage: "destino",
      provider: "openai",
      retryCount: 1,
      status: "failed_after_retry",
      tokensInput: 0,
      tokensOutput: 0,
    });
  });

  it("uma rejeição de validateGatewayIaOutput (L3-T03) também dispara o retry automático", async () => {
    const implausiblePriceCompletion = {
      model: "gpt-4o-mini",
      choices: [
        {
          message: {
            parsed: {
              destinos: [
                {
                  nome: "Foz do Iguaçu",
                  justificativa: "Clima ameno.",
                  faixaPrecoMin: 0,
                  faixaPrecoMax: 0,
                },
              ],
            },
            refusal: null,
          },
        },
      ],
      usage: null,
    };
    const plausiblePriceCompletion = {
      model: "gpt-4o-mini",
      choices: [
        {
          message: {
            parsed: {
              destinos: [
                {
                  nome: "Foz do Iguaçu",
                  justificativa: "Clima ameno.",
                  faixaPrecoMin: 1500,
                  faixaPrecoMax: 2500,
                },
              ],
            },
            refusal: null,
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };
    parseMock.mockResolvedValueOnce(implausiblePriceCompletion);
    parseMock.mockResolvedValueOnce(plausiblePriceCompletion);

    // Schema real da etapa destino (`schemaName` fixo entre tentativas — a
    // validação de plausibilidade de L3-T03 roda igualmente nas duas).
    const destinosSchema = z.object({
      destinos: z.array(
        z.object({
          nome: z.string(),
          justificativa: z.string(),
          faixaPrecoMin: z.number(),
          faixaPrecoMax: z.number(),
        }),
      ),
    });

    const result = await generateStructuredCompletionWithRetry({
      sessionId: "session-1",
      stage: "destino",
      schemaName: "destino_sugestoes",
      schema: destinosSchema,
      messages: [{ role: "user", content: "Sugira destinos." }],
    });

    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(result.data.destinos).toHaveLength(1);

    const logData = createLogMock.mock.calls[0][0].data;
    expect(logData).toMatchObject({ retryCount: 1, status: "success" });
  });

  it("falha ao gravar o log não derruba o resultado de sucesso já obtido do provider (não-fatal)", async () => {
    parseMock.mockResolvedValueOnce(successCompletion());
    createLogMock.mockRejectedValueOnce(new Error("conexão com o banco indisponível"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await generateStructuredCompletionWithRetry({
      sessionId: "session-1",
      stage: "destino",
      schemaName: "destino_sugestao_teste",
      schema: destinoSchema,
      messages: [{ role: "user", content: "Sugira um destino." }],
    });

    expect(result.data.destino).toBe("Foz do Iguaçu");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
