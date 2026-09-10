// L6-T07 — Lógica pura de geração do range de datas sugerido a partir do
// período do quiz guiado (RF-03.2). Extraído de `./quiz.ts` (não é
// `"use server"`, de propósito): arquivos `"use server"` do App Router só
// podem exportar funções assíncronas, e `resolveSuggestedDateRange` abaixo é
// síncrona e precisa ser testável em isolamento, sem depender de uma Server
// Action nem de banco (mesmo motivo de `data-livre-errors.ts`, L6-T03, ter
// sido extraído de `data-livre.ts`).
//
// Nenhuma chamada a LLM/Gateway de IA neste caminho — só reaproveita o
// cálculo determinístico de feriados de `@/lib/holidays` (L2-T01, RNF-07).

import {
  getNationalHolidaysWithBridgeInRange,
  type HolidayWithBridge,
} from "@/lib/holidays";
import type { QuizAnswers } from "@/components/quiz/quiz-wizard";

/** `QuizAnswers["periodo"]` sem o valor `null` (já validado como obrigatório). */
export type QuizPeriodo = Exclude<QuizAnswers["periodo"], null>;

/**
 * Duração-alvo (em dias corridos, inclusive) por período do quiz (RF-03.1
 * item 1), usada tanto para o range padrão (`default`) quanto para decidir
 * se um feriado prolongado próximo é "compatível" (`min`/`max`).
 *
 * Valores escolhidos (RF-03.2 não fecha números exatos — decisão de
 * implementação documentada aqui, dentro da margem do Executor):
 * - `fim_de_semana`: 3 dias (sexta a domingo), mesma duração de um feriado
 *   de sexta-feira sem emenda extra (`calculateBridge`, `src/lib/holidays.ts`).
 * - `3_a_5_dias`: 4 dias, meio do intervalo pedido (RF-03.1 nomeia o próprio
 *   intervalo "3 a 5 dias").
 * - `1_semana`: 7 dias, literal.
 * - `mais_de_1_semana`: 10 dias — RF-03.1 não define um teto para "mais de 1
 *   semana"; 10 dias é uma extensão razoável de uma semana sem ser um
 *   compromisso de mês inteiro (nenhuma fonte no PRD-TECNICO.md/SDD.md
 *   sugere um valor mais preciso).
 *
 * IMPORTANTE (achado desta tarefa, não um bug): `calculateBridge` nunca
 * produz uma emenda com mais de 4 dias corridos (o maior caso é quinta-feira
 * → domingo seguinte, ou terça-feira → sábado anterior). Isso significa que,
 * na prática, só `fim_de_semana` e `3_a_5_dias` conseguem ter um feriado
 * prolongado "compatível" — `1_semana`/`mais_de_1_semana` sempre caem no
 * range padrão. Isso é o comportamento correto (é semanticamente estranho
 * sugerir um feriado de 4 dias para quem pediu "mais de 1 semana"), não uma
 * limitação a corrigir.
 */
const PERIOD_TARGET_DAYS: Record<
  QuizPeriodo,
  { min: number; max: number; default: number }
> = {
  fim_de_semana: { min: 2, max: 4, default: 3 },
  "3_a_5_dias": { min: 3, max: 5, default: 4 },
  "1_semana": { min: 6, max: 8, default: 7 },
  mais_de_1_semana: { min: 9, max: 30, default: 10 },
};

/**
 * Antecedência padrão (dias corridos a partir de "hoje") usada quando nenhum
 * feriado prolongado compatível é encontrado próximo — decisão de
 * implementação (RF-03.2 não define uma data-base): 30 dias dá uma margem
 * mínima razoável de planejamento/reserva, sem empurrar a sugestão para um
 * horizonte distante demais.
 */
const DEFAULT_LEAD_DAYS = 30;

/**
 * Janela de busca (dias corridos a partir de "hoje") dentro da qual um
 * feriado prolongado é considerado "próximo" o suficiente para ser
 * priorizado (RF-03.2: "feriado prolongado mais próximo compatível") —
 * decisão de implementação: 45 dias (~1,5 mês) é "próximo" no sentido de uma
 * sugestão de curto prazo; um feriado compatível mais distante que isso não
 * é mais "o próximo", é só mais um feriado qualquer do calendário anual já
 * listado em T02 (L6-T04/L6-T05).
 */
const HOLIDAY_SEARCH_WINDOW_DAYS = 45;

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Procura, dentre os feriados prolongados do ano de `today` e do ano
 * seguinte (mesmo range de `getFeriadosProlongados`, L2-T02), o mais próximo
 * (menor `rangeStart`) cuja duração total (`bridge.totalDays`) caiba dentro
 * de `[target.min, target.max]` e cujo início esteja entre hoje (inclusive)
 * e `HOLIDAY_SEARCH_WINDOW_DAYS` dias à frente. Retorna `null` se nenhum
 * feriado atender aos dois critérios (nenhuma emenda compatível, ou nenhuma
 * emenda compatível próxima o bastante).
 */
function findNearestCompatibleHoliday(
  today: Date,
  target: { min: number; max: number },
): HolidayWithBridge | null {
  const currentYear = today.getUTCFullYear();
  const holidays = getNationalHolidaysWithBridgeInRange(
    currentYear,
    currentYear + 1,
  );
  const windowEnd = addDaysUtc(today, HOLIDAY_SEARCH_WINDOW_DAYS);

  const candidates = holidays.filter((holiday) => {
    const { rangeStart, totalDays } = holiday.bridge;
    return (
      rangeStart.getTime() >= today.getTime() &&
      rangeStart.getTime() <= windowEnd.getTime() &&
      totalDays >= target.min &&
      totalDays <= target.max
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((nearest, current) =>
    current.bridge.rangeStart.getTime() < nearest.bridge.rangeStart.getTime()
      ? current
      : nearest,
  );
}

export type SuggestedDateRange = {
  start: Date;
  end: Date;
  /**
   * `"feriado_prolongado"` quando o range veio de um feriado próximo
   * compatível (RF-03.2, priorizado); `"periodo_padrao"` quando veio do
   * cálculo padrão (hoje + `DEFAULT_LEAD_DAYS`, duração default do período).
   */
  source: "feriado_prolongado" | "periodo_padrao";
};

/**
 * RF-03.2: gera o range de datas sugerido a partir do período informado no
 * quiz, priorizando o feriado prolongado mais próximo compatível quando
 * existir (ver `findNearestCompatibleHoliday`/`PERIOD_TARGET_DAYS` acima
 * para o algoritmo e as decisões de implementação). Função pura — não
 * depende de banco/Server Action, testável em isolamento.
 */
export function resolveSuggestedDateRange(
  periodo: QuizPeriodo,
  referenceDate: Date = new Date(),
): SuggestedDateRange {
  const today = utcMidnight(referenceDate);
  const target = PERIOD_TARGET_DAYS[periodo];

  const compatibleHoliday = findNearestCompatibleHoliday(today, target);
  if (compatibleHoliday) {
    return {
      start: compatibleHoliday.bridge.rangeStart,
      end: compatibleHoliday.bridge.rangeEnd,
      source: "feriado_prolongado",
    };
  }

  const start = addDaysUtc(today, DEFAULT_LEAD_DAYS);
  const end = addDaysUtc(start, target.default - 1);
  return { start, end, source: "periodo_padrao" };
}
