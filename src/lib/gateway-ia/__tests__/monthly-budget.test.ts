// @vitest-environment node
//
// Teto mensal de gasto com IA (US$ 10, decisão de 2026-09-19): soma do
// `costEstimateUsd` do mês em `LlmGenerationLog`, checada antes de toda
// chamada ao provider. O Prisma Client e o SDK da OpenAI são mockados.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  GatewayIaBudgetExceededError,
  GatewayIaError,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import { resetOpenAIClientForTests } from "@/lib/gateway-ia/client";
import {
  BUDGET_ALERT_RATIO,
  DEFAULT_MONTHLY_BUDGET_USD,
  assertMonthlyBudgetAvailable,
  getMonthlyBudgetUsd,
  resetBudgetAlertForTests,
  startOfBudgetMonth,
} from "@/lib/gateway-ia/monthly-budget";

const { parseMock, createLogMock, aggregateMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
  createLogMock: vi.fn(),
  aggregateMock: vi.fn(),
}));

// Classe (e não `vi.fn`) para sobreviver ao `vi.restoreAllMocks()` do afterEach.
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { parse: parseMock } };
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    llmGenerationLog: { create: createLogMock, aggregate: aggregateMock },
  },
}));

function gastoDoMes(usd: number | null) {
  aggregateMock.mockResolvedValue({ _sum: { costEstimateUsd: usd } });
}

const originalBudget = process.env.AI_MONTHLY_BUDGET_USD;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

beforeEach(() => {
  aggregateMock.mockReset();
  parseMock.mockReset();
  createLogMock.mockReset();
  createLogMock.mockResolvedValue({});
  resetBudgetAlertForTests();
  resetOpenAIClientForTests();
  delete process.env.AI_MONTHLY_BUDGET_USD;
  process.env.OPENAI_API_KEY = "sk-test-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
});

afterEach(() => {
  vi.restoreAllMocks();
  resetOpenAIClientForTests();
  if (originalBudget === undefined) delete process.env.AI_MONTHLY_BUDGET_USD;
  else process.env.AI_MONTHLY_BUDGET_USD = originalBudget;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

describe("getMonthlyBudgetUsd", () => {
  it("padrão é US$ 10", () => {
    expect(DEFAULT_MONTHLY_BUDGET_USD).toBe(10);
    expect(getMonthlyBudgetUsd()).toBe(10);
  });

  it("AI_MONTHLY_BUDGET_USD válido sobrescreve; inválido, zero ou negativo cai no padrão", () => {
    process.env.AI_MONTHLY_BUDGET_USD = "25.5";
    expect(getMonthlyBudgetUsd()).toBe(25.5);
    for (const invalido of ["abc", "0", "-3", ""]) {
      process.env.AI_MONTHLY_BUDGET_USD = invalido;
      expect(getMonthlyBudgetUsd()).toBe(10);
    }
  });
});

describe("startOfBudgetMonth (mês de Brasília, UTC-3)", () => {
  it("o mês começa às 03:00 UTC do dia 1", () => {
    expect(startOfBudgetMonth(new Date("2026-09-19T12:00:00Z")).toISOString()).toBe(
      "2026-09-01T03:00:00.000Z",
    );
  });

  it("virada de mês: 01/10 02:59 UTC ainda é setembro em Brasília; 03:00 UTC já é outubro", () => {
    expect(startOfBudgetMonth(new Date("2026-10-01T02:59:59Z")).toISOString()).toBe(
      "2026-09-01T03:00:00.000Z",
    );
    expect(startOfBudgetMonth(new Date("2026-10-01T03:00:00Z")).toISOString()).toBe(
      "2026-10-01T03:00:00.000Z",
    );
  });

  it("consulta só os registros a partir do início do mês", async () => {
    gastoDoMes(1);
    await assertMonthlyBudgetAvailable(new Date("2026-09-19T12:00:00Z"));
    expect(aggregateMock).toHaveBeenCalledWith({
      _sum: { costEstimateUsd: true },
      where: { createdAt: { gte: new Date("2026-09-01T03:00:00.000Z") } },
    });
  });
});

describe("assertMonthlyBudgetAvailable", () => {
  it("abaixo do teto: passa sem alerta", async () => {
    gastoDoMes(3);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(assertMonthlyBudgetAvailable()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("sem nenhum registro no mês (soma nula): passa", async () => {
    gastoDoMes(null);
    await expect(assertMonthlyBudgetAvailable()).resolves.toBeUndefined();
  });

  it("no teto exato ou acima: lança GatewayIaBudgetExceededError com os valores", async () => {
    gastoDoMes(10);
    const erro = await assertMonthlyBudgetAvailable().catch((e) => e);
    expect(erro).toBeInstanceOf(GatewayIaBudgetExceededError);
    expect(erro).toBeInstanceOf(GatewayIaError);
    expect(erro.spentUsd).toBe(10);
    expect(erro.budgetUsd).toBe(10);
    expect(erro.message).toMatch(/limite mensal/i);

    gastoDoMes(12.34);
    await expect(assertMonthlyBudgetAvailable()).rejects.toBeInstanceOf(
      GatewayIaBudgetExceededError,
    );
  });

  it("respeita AI_MONTHLY_BUDGET_USD", async () => {
    process.env.AI_MONTHLY_BUDGET_USD = "50";
    gastoDoMes(20);
    await expect(assertMonthlyBudgetAvailable()).resolves.toBeUndefined();
    gastoDoMes(50);
    await expect(assertMonthlyBudgetAvailable()).rejects.toBeInstanceOf(
      GatewayIaBudgetExceededError,
    );
  });

  it("a partir de 80% avisa no log, uma única vez por mês", async () => {
    gastoDoMes(10 * BUDGET_ALERT_RATIO);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agora = new Date("2026-09-19T12:00:00Z");

    await assertMonthlyBudgetAvailable(agora);
    await assertMonthlyBudgetAvailable(agora);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ALERTA.*8\.00.*10\.00.*80%/);

    // Outro mês: avisa de novo.
    await assertMonthlyBudgetAvailable(new Date("2026-10-19T12:00:00Z"));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("falha ao ler o gasto: segue sem bloquear (fail-open) e registra o erro", async () => {
    aggregateMock.mockRejectedValue(new Error("banco fora do ar"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(assertMonthlyBudgetAvailable()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe("generateStructuredCompletionWithRetry com o teto atingido", () => {
  const schema = z.object({ destino: z.string() });
  const pedido = {
    sessionId: "session-1",
    stage: "destino" as const,
    schemaName: "destino_teste",
    schema,
    messages: [{ role: "user" as const, content: "Sugira um destino." }],
  };

  it("não chama o provider nem grava log quando o teto foi atingido", async () => {
    gastoDoMes(10);
    await expect(generateStructuredCompletionWithRetry(pedido)).rejects.toBeInstanceOf(
      GatewayIaBudgetExceededError,
    );
    expect(parseMock).not.toHaveBeenCalled();
    expect(createLogMock).not.toHaveBeenCalled();
  });

  it("abaixo do teto a chamada segue normalmente", async () => {
    gastoDoMes(2);
    parseMock.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      choices: [{ message: { parsed: { destino: "Gramado" }, refusal: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const result = await generateStructuredCompletionWithRetry(pedido);
    expect(result.data.destino).toBe("Gramado");
    expect(parseMock).toHaveBeenCalledTimes(1);
  });
});
