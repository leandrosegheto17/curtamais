// L2-T01 — Módulo de Feriados (determinístico, ADR-007)
//
// Regra inegociável (RNF-07, TASK.md §1 — item "ao contrário": aqui a regra é
// NÃO usar o Gateway de IA): tudo neste arquivo é função pura de calendário.
// Nenhuma chamada a rede, banco, LLM ou qualquer I/O. Datas são representadas
// como `Date` em UTC (meia-noite), para evitar deslizamento por fuso horário
// em comparações de dia da semana/diferença de dias.
//
// Fonte da lista de feriados nacionais brasileiros fixos: os 8 feriados civis
// nacionais historicamente estáveis (Lei 6.802/1980 e correlatas). O PRD-
// TECNICO.md/SDD.md não fecham a lista exata (ver SDD.md "Questões em
// Aberto" — decisão de implementação delegada ao Coordenador/Executor,
// RNF-07 só exige precisão do cálculo). RN-02 restringe a feriados nacionais,
// então feriados pontuais mais recentes (ex.: Dia Nacional de Zumbi e da
// Consciência Negra, 20/11, federal desde a Lei 14.759/2023) foram
// deliberadamente deixados de fora desta primeira versão para não exigir uma
// regra de "vigente a partir de que ano" dentro de uma tarefa que deve ser
// puramente estável/atemporal — se o PRD-TECNICO.md quiser incluí-lo,
// documentar o ano de vigência é uma decisão de produto, não técnica, e deve
// voltar ao Coordenador antes de codificar aqui.

export type Holiday = {
  /** Nome do feriado nacional. */
  name: string;
  /** Data do feriado, à meia-noite UTC. */
  date: Date;
  /** Se o feriado é fixo (mesma data todo ano) ou móvel (baseado na Páscoa). */
  type: "fixed" | "movable";
};

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export type BridgeInfo = {
  /** Feriado de origem do cálculo de emenda. */
  holiday: Date;
  /** Dia da semana em que o feriado cai. */
  weekday: Weekday;
  /** Primeiro dia do período contínuo (feriado + fim de semana emendado). */
  rangeStart: Date;
  /** Último dia do período contínuo (feriado + fim de semana emendado). */
  rangeEnd: Date;
  /**
   * Dias úteis que precisam ser emendados (tirados de folga) para fechar o
   * range contínuo entre o feriado e o fim de semana adjacente. Vazio quando
   * o feriado já é contíguo ao fim de semana (ex.: segunda ou sexta) ou
   * quando o próprio feriado cai no fim de semana.
   */
  bridgeDays: Date[];
  /** Quantidade total de dias do range (rangeEnd - rangeStart + 1). */
  totalDays: number;
};

/** Cria uma Date UTC à meia-noite, evitando ambiguidade de fuso horário. */
function utcDate(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()];
}

/**
 * Calcula a data da Páscoa (domingo) para um dado ano, via algoritmo de
 * Gauss/Anonymous Gregorian (válido para o calendário gregoriano, usado
 * pelo Brasil). Puro, sem tabela hardcoded por ano.
 */
export function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return utcDate(year, month - 1, day);
}

/** Feriados nacionais brasileiros fixos (mesma data todo ano). */
export function getFixedHolidays(year: number): Holiday[] {
  const fixed: Array<{ name: string; monthIndex0: number; day: number }> = [
    { name: "Confraternização Universal", monthIndex0: 0, day: 1 },
    { name: "Tiradentes", monthIndex0: 3, day: 21 },
    { name: "Dia do Trabalho", monthIndex0: 4, day: 1 },
    { name: "Independência do Brasil", monthIndex0: 8, day: 7 },
    { name: "Nossa Senhora Aparecida", monthIndex0: 9, day: 12 },
    { name: "Finados", monthIndex0: 10, day: 2 },
    { name: "Proclamação da República", monthIndex0: 10, day: 15 },
    { name: "Natal", monthIndex0: 11, day: 25 },
  ];

  return fixed.map((h) => ({
    name: h.name,
    date: utcDate(year, h.monthIndex0, h.day),
    type: "fixed" as const,
  }));
}

/**
 * Feriados nacionais móveis, calculados a partir da Páscoa (nunca hardcoded
 * por ano): Carnaval (terça-feira, Páscoa - 47 dias), Sexta-feira Santa
 * (Páscoa - 2 dias) e Corpus Christi (Páscoa + 60 dias).
 */
export function getMovableHolidays(year: number): Holiday[] {
  const easter = calculateEaster(year);

  return [
    { name: "Carnaval", date: addDays(easter, -47), type: "movable" as const },
    {
      name: "Sexta-feira Santa",
      date: addDays(easter, -2),
      type: "movable" as const,
    },
    {
      name: "Corpus Christi",
      date: addDays(easter, 60),
      type: "movable" as const,
    },
  ];
}

/** Todos os feriados nacionais brasileiros (fixos + móveis) de um ano, ordenados por data. */
export function getNationalHolidays(year: number): Holiday[] {
  const all = [...getFixedHolidays(year), ...getMovableHolidays(year)];
  return all.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Todos os feriados nacionais brasileiros num range de anos (inclusive),
 * ordenados por data. Usada por RF-02.1 para "ano corrente e ano seguinte"
 * (passar startYear=anoAtual, endYear=anoAtual+1).
 */
export function getNationalHolidaysInRange(
  startYear: number,
  endYear: number,
): Holiday[] {
  if (endYear < startYear) {
    throw new Error("endYear deve ser maior ou igual a startYear");
  }

  const holidays: Holiday[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    holidays.push(...getNationalHolidays(year));
  }
  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calcula a emenda (RF-02.1/RF-02.2) de um feriado com o fim de semana mais
 * próximo, de forma determinística a partir só da data do feriado.
 *
 * Regra escolhida (documentada aqui por ser a fonte da verdade da lógica,
 * já que o PRD-TECNICO.md só dá um exemplo — quinta-feira — sem fechar a
 * regra completa para os demais dias):
 *
 * - Segunda-feira: já contíguo ao fim de semana anterior (sáb-dom-seg) — não
 *   exige emendar nenhum dia útil. Range: sábado anterior até a própria
 *   segunda (3 dias).
 * - Terça-feira: emendando a segunda-feira anterior, o feriado se conecta ao
 *   fim de semana anterior (sáb-dom-seg-ter). Range: sábado anterior até a
 *   própria terça (4 dias), com a segunda-feira como dia de emenda.
 * - Quarta-feira: no meio da semana, emendar dos dois lados (terça E
 *   quinta/sexta) custaria 2+ dias úteis para ganhar só o feriado em si —
 *   não é uma "emenda com fim de semana adjacente" no sentido de RF-02.1/.2
 *   (que fala de UM fim de semana adjacente). Não gera emenda: range é o
 *   próprio dia do feriado, sem dias de emenda.
 * - Quinta-feira: emendando a sexta-feira seguinte, o feriado se conecta ao
 *   fim de semana seguinte (qui-sex-sáb-dom) — este é exatamente o exemplo
 *   dado no PRD-TECNICO.md ("feriado em quinta-feira mostra a emenda até
 *   domingo"). Range: a própria quinta até o domingo seguinte (4 dias), com
 *   a sexta-feira como dia de emenda.
 * - Sexta-feira: já contíguo ao fim de semana seguinte (sex-sáb-dom) — não
 *   exige emendar nenhum dia útil. Range: a própria sexta até o domingo
 *   seguinte (3 dias).
 * - Sábado/Domingo: o feriado já cai num dia não-útil; não há dia útil a
 *   "economizar" emendando. Range: o próprio fim de semana (sáb-dom, 2
 *   dias), sem dias de emenda.
 */
export function calculateBridge(holiday: Date): BridgeInfo {
  const weekday = weekdayOf(holiday);

  switch (weekday) {
    case "monday": {
      const rangeStart = addDays(holiday, -2); // sábado anterior
      return buildBridgeInfo(holiday, weekday, rangeStart, holiday, []);
    }
    case "tuesday": {
      const monday = addDays(holiday, -1);
      const rangeStart = addDays(holiday, -3); // sábado anterior
      return buildBridgeInfo(holiday, weekday, rangeStart, holiday, [monday]);
    }
    case "wednesday": {
      return buildBridgeInfo(holiday, weekday, holiday, holiday, []);
    }
    case "thursday": {
      const friday = addDays(holiday, 1);
      const rangeEnd = addDays(holiday, 3); // domingo seguinte
      return buildBridgeInfo(holiday, weekday, holiday, rangeEnd, [friday]);
    }
    case "friday": {
      const rangeEnd = addDays(holiday, 2); // domingo seguinte
      return buildBridgeInfo(holiday, weekday, holiday, rangeEnd, []);
    }
    case "saturday": {
      const rangeEnd = addDays(holiday, 1); // domingo
      return buildBridgeInfo(holiday, weekday, holiday, rangeEnd, []);
    }
    case "sunday": {
      const rangeStart = addDays(holiday, -1); // sábado
      return buildBridgeInfo(holiday, weekday, rangeStart, holiday, []);
    }
  }
}

function buildBridgeInfo(
  holiday: Date,
  weekday: Weekday,
  rangeStart: Date,
  rangeEnd: Date,
  bridgeDays: Date[],
): BridgeInfo {
  const totalDays =
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;

  return { holiday, weekday, rangeStart, rangeEnd, bridgeDays, totalDays };
}

export type HolidayWithBridge = Holiday & { bridge: BridgeInfo };

/** Feriados nacionais de um ano já com a emenda calculada (RF-02.1). */
export function getNationalHolidaysWithBridge(
  year: number,
): HolidayWithBridge[] {
  return getNationalHolidays(year).map((holiday) => ({
    ...holiday,
    bridge: calculateBridge(holiday.date),
  }));
}

/** Feriados nacionais num range de anos, já com a emenda calculada (RF-02.1). */
export function getNationalHolidaysWithBridgeInRange(
  startYear: number,
  endYear: number,
): HolidayWithBridge[] {
  return getNationalHolidaysInRange(startYear, endYear).map((holiday) => ({
    ...holiday,
    bridge: calculateBridge(holiday.date),
  }));
}
