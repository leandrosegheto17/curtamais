// Teto mensal de gasto com IA (decisão do dono do produto, 2026-09-19:
// US$ 10 por mês). Checado ANTES de toda chamada ao provider em
// `generateStructuredCompletionWithRetry` (`./index.ts`), a única porta de
// entrada das 4 etapas de IA (destino, hospedagem, passeios, roteiro).
//
// O gasto vem da SOMA de `LlmGenerationLog.costEstimateUsd` do mês corrente
// — uma ESTIMATIVA por preço fixo de `gpt-4o-mini` (`./generation-log.ts`),
// não a fatura real. Por isso este teto é uma guarda de aplicação, e o limite
// rígido de gasto no painel da OpenAI continua recomendado como segunda
// camada. Limitação conhecida: o log tem `ON DELETE CASCADE` a partir de
// `TripSession`, então apagar uma conta/sessão remove o custo dela do mês.
//
// Política de falha: se a leitura do banco falhar, a chamada SEGUE (fail-open)
// e o erro é registrado — uma falha de observabilidade não derruba o produto.
import { prisma } from "@/lib/prisma";
import { GatewayIaBudgetExceededError } from "./errors";

/** Teto padrão em USD por mês, usado quando `AI_MONTHLY_BUDGET_USD` não está definido ou é inválido. */
export const DEFAULT_MONTHLY_BUDGET_USD = 10;

/** Fração do teto em que um alerta é emitido no log (uma vez por mês, por instância). */
export const BUDGET_ALERT_RATIO = 0.8;

/** Brasília (UTC-3, sem horário de verão desde 2019): o "mês" do teto é o mês local do dono do produto. */
const BRASILIA_OFFSET_HOURS = 3;

/** Teto mensal em USD: `AI_MONTHLY_BUDGET_USD` se for um número > 0, senão o padrão. */
export function getMonthlyBudgetUsd(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_USD;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MONTHLY_BUDGET_USD;
}

/** Início do mês corrente em Brasília, como instante UTC (ex.: 2026-09-01T03:00:00Z). */
export function startOfBudgetMonth(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - BRASILIA_OFFSET_HOURS * 3_600_000);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      1,
      BRASILIA_OFFSET_HOURS,
    ),
  );
}

/** Gasto estimado (USD) desde o início do mês de Brasília corrente. */
export async function getMonthlySpendUsd(now: Date = new Date()): Promise<number> {
  const result = await prisma.llmGenerationLog.aggregate({
    _sum: { costEstimateUsd: true },
    where: { createdAt: { gte: startOfBudgetMonth(now) } },
  });
  return Number(result._sum.costEstimateUsd ?? 0);
}

let lastAlertedMonth: string | null = null;

/** Só para testes: limpa o "já alertei neste mês". */
export function resetBudgetAlertForTests(): void {
  lastAlertedMonth = null;
}

/**
 * Lança `GatewayIaBudgetExceededError` quando o gasto do mês já atingiu o
 * teto; emite um `console.warn` (uma vez por mês) ao passar de 80%. Nunca
 * bloqueia por falha ao ler o gasto (fail-open).
 */
export async function assertMonthlyBudgetAvailable(
  now: Date = new Date(),
): Promise<void> {
  const budget = getMonthlyBudgetUsd();
  let spent: number;
  try {
    spent = await getMonthlySpendUsd(now);
  } catch (error) {
    console.error(
      "[gateway-ia] Falha ao ler o gasto mensal de IA; seguindo sem checar o teto (fail-open):",
      error,
    );
    return;
  }

  if (spent >= budget) {
    throw new GatewayIaBudgetExceededError(spent, budget);
  }

  const monthKey = startOfBudgetMonth(now).toISOString();
  if (spent >= budget * BUDGET_ALERT_RATIO && lastAlertedMonth !== monthKey) {
    lastAlertedMonth = monthKey;
    console.warn(
      `[gateway-ia] ALERTA: gasto de IA do mês em US$ ${spent.toFixed(2)} de US$ ${budget.toFixed(2)} (${Math.round(
        (spent / budget) * 100,
      )}% do teto).`,
    );
  }
}
