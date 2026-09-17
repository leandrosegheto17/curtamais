// V2-L4-T06a — `getProximosFeriados` (RF-12, RF-18, ADR-011).
//
// Fronteira desta camada: assim como `src/lib/actions/feriados.ts` (L2-T02),
// este módulo NÃO recalcula feriados/emenda — reaproveita
// `getNationalHolidaysWithBridgeInRange` (`src/lib/holidays.ts`, ADR-007) como
// única fonte de verdade (RNF-07: nenhum cálculo paralelo ao de RF-02.2).
// A única lógica nova aqui é: (a) resolver a data civil de "hoje" no fuso
// `America/Sao_Paulo` e (b) filtrar/cortar a lista já calculada para os N
// próximos feriados a partir dessa data civil.
//
// Mora num arquivo separado de `holidays.ts` (em vez de crescer aquele
// módulo) porque `holidays.ts` é uma biblioteca de calendário pura, sem
// noção de "agora" — este arquivo é a única peça de todo o domínio de
// feriados que depende de um instante de referência (`hoje`), então fica
// isolado para não misturar as duas responsabilidades.
//
// Continua sendo função pura de calendário (mesma regra de holidays.ts):
// sem "use client"/"use server", sem I/O, sem import de Prisma/Gateway de
// IA/API do Next.js — `hoje` é recebido como parâmetro, nunca lido de
// `Date.now()` internamente.

import {
  getNationalHolidaysWithBridgeInRange,
  type HolidayWithBridge,
} from "@/lib/holidays";

/**
 * Resolve a data civil (ano/mês/dia) correspondente a um instante, no fuso
 * `America/Sao_Paulo`, como uma `Date` UTC à meia-noite — mesma convenção de
 * representação de data usada em `holidays.ts` (evita comparar instantes
 * reais com datas civis "nuas").
 *
 * Brasil não observa horário de verão desde 2019 (Lei 13.972/2019), então
 * `America/Sao_Paulo` é um deslocamento fixo (UTC-03:00) — mas usamos
 * `Intl.DateTimeFormat` em vez de hardcodar o offset, para continuar correto
 * caso essa regra mude novamente no futuro.
 */
function civilDateInSaoPaulo(instant: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Retorna os `quantidade` próximos feriados nacionais brasileiros a partir da
 * data civil de `hoje` no fuso `America/Sao_Paulo` (RF-12/RF-18), incluindo o
 * próprio dia caso ele seja um feriado.
 *
 * Reaproveita `getNationalHolidaysWithBridgeInRange` (ADR-007) para a lista
 * de feriados + emenda — o ano civil de `hoje` e o seguinte são sempre
 * suficientes para cobrir `quantidade` próximos feriados, já que cada ano
 * civil brasileiro tem 11 feriados nacionais (bem mais do que os 3 usados
 * pela home vitrine).
 */
export function getProximosFeriados(
  hoje: Date,
  quantidade: number,
): HolidayWithBridge[] {
  if (quantidade <= 0) {
    return [];
  }

  const civilToday = civilDateInSaoPaulo(hoje);
  const year = civilToday.getUTCFullYear();

  const holidays = getNationalHolidaysWithBridgeInRange(year, year + 1);

  return holidays
    .filter((holiday) => holiday.date.getTime() >= civilToday.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, quantidade);
}
