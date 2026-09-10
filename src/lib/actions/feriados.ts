"use server";

// L2-T02 — Server Action `getFeriadosProlongados` (RF-02.1, RF-02.2).
//
// Fronteira desta camada: `src/lib/holidays.ts` permanece uma função pura de
// calendário, sem I/O (RNF-07 — ver comentário no topo daquele arquivo). Esta
// Server Action é a camada fina que expõe esse cálculo puro para a UI (T02,
// L6-T04), já no formato pronto de consumo (nome, data, range de emenda e uma
// string legível para exibição direta na tela) — nenhuma lógica de calendário
// nova é adicionada aqui, só formatação/apresentação do resultado de
// `getNationalHolidaysWithBridgeInRange`.
//
// Nenhuma chamada a LLM/Gateway de IA neste caminho (mesma regra de L2-T01).

import {
  getNationalHolidaysWithBridgeInRange,
  type HolidayWithBridge,
  type Weekday,
} from "@/lib/holidays";
import {
  createSessionWithDateRange,
  type CreateSessionWithDateRangeResult,
} from "@/lib/session-flow";
import { InvalidHolidaySelectionError } from "./feriados-errors";

/** Abreviação de dia da semana em português (3 letras, primeira maiúscula). */
const WEEKDAY_ABBREV: Record<Weekday, string> = {
  sunday: "Dom",
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
};

/** Formata uma `Date` UTC como `DD/MM` (padrão brasileiro, sem ano). */
function formatDayMonth(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Monta a string legível de emenda a partir do `BridgeInfo` (ex. do PRD-
 * TECNICO.md/TASK.md L6-T04: "Qui 12/06 → estende até Dom 15/06, 4 dias").
 *
 * Regra de direção da seta, coerente com `calculateBridge` em holidays.ts:
 * - Sem emenda (feriado no meio da semana, ex. quarta-feira): não há extensão
 *   de nenhum lado — mensagem indica só o dia, sem seta.
 * - Emenda "para frente" (rangeEnd depois do feriado, ex. quinta/sexta/sábado):
 *   seta aponta do feriado até o fim do range ("estende até").
 * - Emenda "para trás" (rangeStart antes do feriado e rangeEnd == feriado, ex.
 *   segunda/terça/domingo): seta aponta do feriado até o início do range
 *   ("emenda desde"), já que a extensão ocorre nos dias anteriores.
 */
function formatBridgeLabel(holidayWithBridge: HolidayWithBridge): string {
  const { date, bridge } = holidayWithBridge;
  const { weekday, rangeStart, rangeEnd, totalDays } = bridge;

  const holidayLabel = `${WEEKDAY_ABBREV[weekday]} ${formatDayMonth(date)}`;
  const extendsForward = rangeEnd.getTime() > date.getTime();
  const extendsBackward = rangeStart.getTime() < date.getTime();

  if (!extendsForward && !extendsBackward) {
    return `${holidayLabel}, sem emenda (${totalDays} dia)`;
  }

  if (extendsForward) {
    const endWeekday = WEEKDAY_ABBREV[weekdayFromDate(rangeEnd)];
    return `${holidayLabel} → estende até ${endWeekday} ${formatDayMonth(rangeEnd)}, ${totalDays} dias`;
  }

  const startWeekday = WEEKDAY_ABBREV[weekdayFromDate(rangeStart)];
  return `${holidayLabel} → emenda desde ${startWeekday} ${formatDayMonth(rangeStart)}, ${totalDays} dias`;
}

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function weekdayFromDate(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()];
}

export type FeriadoProlongado = {
  /** Nome do feriado nacional. */
  name: string;
  /** Data do feriado (UTC meia-noite). */
  date: Date;
  /** Data do feriado formatada como `DD/MM`. */
  dateFormatted: string;
  /** Dia da semana em que o feriado cai. */
  weekday: Weekday;
  /** Abreviação em português do dia da semana (ex. "Qui"). */
  weekdayAbbrev: string;
  /** Range de emenda, já calculado e pronto para exibição. */
  bridge: {
    /** Primeiro dia do período contínuo (feriado + emenda). */
    rangeStart: Date;
    /** Último dia do período contínuo (feriado + emenda). */
    rangeEnd: Date;
    /** `rangeStart` formatado como `DD/MM`. */
    rangeStartFormatted: string;
    /** `rangeEnd` formatado como `DD/MM`. */
    rangeEndFormatted: string;
    /** Quantidade total de dias do range contínuo. */
    totalDays: number;
    /** Dias úteis emendados (folga necessária) para fechar o range. */
    bridgeDays: Date[];
  };
  /**
   * String pronta para exibição na UI (ex.: "Qui 12/06 → estende até Dom
   * 15/06, 4 dias"), conforme exemplo do TASK.md L6-T04/PRD-TECNICO.md RF-02.1.
   */
  label: string;
};

function toFeriadoProlongado(h: HolidayWithBridge): FeriadoProlongado {
  return {
    name: h.name,
    date: h.date,
    dateFormatted: formatDayMonth(h.date),
    weekday: h.bridge.weekday,
    weekdayAbbrev: WEEKDAY_ABBREV[h.bridge.weekday],
    bridge: {
      rangeStart: h.bridge.rangeStart,
      rangeEnd: h.bridge.rangeEnd,
      rangeStartFormatted: formatDayMonth(h.bridge.rangeStart),
      rangeEndFormatted: formatDayMonth(h.bridge.rangeEnd),
      totalDays: h.bridge.totalDays,
      bridgeDays: h.bridge.bridgeDays,
    },
    label: formatBridgeLabel(h),
  };
}

/**
 * Server Action (RF-02.1): retorna a listagem de feriados nacionais
 * brasileiros do ano corrente e do ano seguinte, cada um já com a emenda
 * calculada (RF-02.2) e formatada para exibição direta na tela T02
 * (L6-T04), ordenada por data.
 *
 * Não recebe parâmetros: o ano corrente é sempre resolvido em tempo de
 * execução (`new Date().getFullYear()`), nunca hardcoded (RF-02.1 é sempre
 * relativo a "agora").
 */
export async function getFeriadosProlongados(): Promise<FeriadoProlongado[]> {
  const currentYear = new Date().getFullYear();

  const holidays = getNationalHolidaysWithBridgeInRange(
    currentYear,
    currentYear + 1,
  );

  // `getNationalHolidaysWithBridgeInRange` já retorna ordenado por data, mas
  // a ordenação é garantida aqui também, na borda de saída desta Server
  // Action, para não depender implicitamente do detalhe interno de
  // holidays.ts (critério de aceite exige lista ordenada por data).
  const sorted = [...holidays].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  return sorted.map(toFeriadoProlongado);
}

// --- L6-T05 — Server Action `processarFeriadoEscolhido` (RF-02.3) --------
//
// Recebe o feriado escolhido pelo usuário na tela T02 (L6-T04) — identificado
// pela própria data do feriado (mesma chave usada por `FeriadosScreen`,
// `holidayKey = holiday.date.toISOString()`) — e o destino opcional
// digitado, e:
//   1. Recalcula a listagem de feriados+emenda a partir da MESMA fonte
//      determinística de sempre (`getNationalHolidaysWithBridgeInRange`,
//      `src/lib/holidays.ts`), em vez de confiar num range vindo pronto do
//      cliente (Diretriz de Implementação 9, TASK.md Seção 1: input do
//      usuário é validado no servidor) — a chave recebida só serve para
//      localizar QUAL feriado, nunca para informar o range diretamente.
//   2. Se a chave não corresponder a nenhum feriado conhecido (adulterada,
//      ou o ano corrente virou desde que a tela carregou), rejeita sem criar
//      sessão nenhuma.
//   3. Converte o feriado+emenda encontrado no range de datas real
//      (`bridge.rangeStart`/`rangeEnd`) e delega a criação da `TripSession` +
//      a ramificação de RF-01.2/RF-01.3 (idêntica aqui, por exigência
//      explícita de RF-02.3) para `createSessionWithDateRange`
//      (`src/lib/session-flow`, compartilhado com L6-T03/L6-T07 — ver nota de
//      implementação desta tarefa no TASK.md).

/** Tamanho máximo aceito para o destino em texto livre (sanitização de input). */
const MAX_DESTINO_LENGTH = 200;

export type ProcessarFeriadoEscolhidoInput = {
  /**
   * Data do feriado escolhido, no mesmo formato de chave usado por
   * `FeriadosScreen` (`Date.prototype.toISOString()`).
   */
  holidayDate: string;
  /** Destino opcional (RF-02.3), texto livre digitado pelo usuário. */
  destino?: string | null;
};

export type ProcessarFeriadoEscolhidoResult = Pick<
  CreateSessionWithDateRangeResult,
  "sessionId" | "flowState"
>;

/**
 * Server Action (RF-02.3): trata o feriado escolhido (+ emenda calculada)
 * como um range de datas de sessão, seguindo a mesma ramificação de
 * RF-01.2/RF-01.3 conforme destino informado ou não.
 */
export async function processarFeriadoEscolhido(
  input: ProcessarFeriadoEscolhidoInput,
): Promise<ProcessarFeriadoEscolhidoResult> {
  const parsedDate = new Date(input.holidayDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new InvalidHolidaySelectionError(input.holidayDate);
  }

  const currentYear = new Date().getFullYear();
  const holidays = getNationalHolidaysWithBridgeInRange(
    currentYear,
    currentYear + 1,
  );
  const match = holidays.find(
    (holiday) => holiday.date.getTime() === parsedDate.getTime(),
  );
  if (!match) {
    throw new InvalidHolidaySelectionError(input.holidayDate);
  }

  // Sanitização do texto livre (Diretriz de Implementação 9): trim +
  // limite de tamanho; string vazia após trim é tratada como "sem destino"
  // por `createSessionWithDateRange`.
  const trimmedDestino = input.destino?.trim();
  if (trimmedDestino && trimmedDestino.length > MAX_DESTINO_LENGTH) {
    throw new Error(
      `Destino excede o tamanho máximo permitido (${MAX_DESTINO_LENGTH} caracteres).`,
    );
  }

  const { sessionId, flowState } = await createSessionWithDateRange({
    entryPath: "feriado",
    dateRangeStart: match.bridge.rangeStart,
    dateRangeEnd: match.bridge.rangeEnd,
    destino: trimmedDestino,
  });

  return { sessionId, flowState };
}
