// V2-L4-T06b — `UpcomingHolidaysSection` (UX-SPEC.md §8.2 T-HOME item 6:
// "Próximos feriados"; RF-18.4).
//
// Server Component estático (sem "use client"): chama `getProximosFeriados`
// (V2-L4-T06a, função pura de calendário) com `new Date()` real — a página
// usa `revalidate = 3600` (V2-L4-T01) para o refresh periódico, então esta
// seção não precisa de nenhum estado de cliente nem de `useEffect`.
//
// Reaproveita `SectionBand` com `tone="deep"` (mesma faixa de "Três jeitos de
// começar", V2-L4-T02 — os únicos dois usos de `deep` no UX-SPEC.md §8.3).
//
// Acento `holiday` (RF-18.4): só na pílula "N dias" e no fio superior do
// `HolidayCallout`. O link "Planejar este feriado" NUNCA usa a cor de CTA
// (`accent`) — é um link de texto em `foreground` com seta, exigência
// explícita do UX-SPEC para esta seção (diferente de todos os outros CTAs da
// home).
//
// Formatação de data/dia da semana é deliberadamente reimplementada aqui (em
// vez de importar de `src/lib/actions/feriados.ts`) porque aquele módulo é
// `"use server"` e não exporta esses helpers — e o texto exigido pelo
// UX-SPEC.md ("Seg 12/10 · de sáb 10/10 a seg 12/10") é diferente do `label`
// daquela Server Action (que usa "→ estende até"/"→ emenda desde", formato de
// T02, não desta seção da home).
import type { HolidayWithBridge, Weekday } from "@/lib/holidays";
import { getProximosFeriados } from "@/lib/proximos-feriados";

import { SectionBand } from "./section-band";

const QUANTIDADE_FERIADOS = 3;

const WEEKDAY_ABBREV: Record<Weekday, string> = {
  sunday: "Dom",
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
};

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()];
}

/** Formata uma `Date` UTC como `DD/MM` (padrão brasileiro, sem ano). */
function formatDayMonth(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** `AAAA-MM-DD`, formato exato esperado por `/entrada/feriados?feriado=`. */
function formatHolidayDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * "Seg 12/10 · de sáb 10/10 a seg 12/10" (UX-SPEC.md §8.2 T-HOME item 6,
 * texto literal de exemplo).
 */
function formatHolidayPeriod(holiday: HolidayWithBridge): string {
  const holidayLabel = `${WEEKDAY_ABBREV[weekdayOf(holiday.date)]} ${formatDayMonth(holiday.date)}`;
  // Só a abreviação do feriado em si fica capitalizada (início da frase); as
  // de `rangeStart`/`rangeEnd` ficam minúsculas, mesma capitalização do
  // exemplo literal do UX-SPEC.md ("Seg 12/10 · de sáb 10/10 a seg 12/10").
  const startLabel = `${WEEKDAY_ABBREV[weekdayOf(holiday.bridge.rangeStart)].toLowerCase()} ${formatDayMonth(holiday.bridge.rangeStart)}`;
  const endLabel = `${WEEKDAY_ABBREV[weekdayOf(holiday.bridge.rangeEnd)].toLowerCase()} ${formatDayMonth(holiday.bridge.rangeEnd)}`;
  return `${holidayLabel} · de ${startLabel} a ${endLabel}`;
}

interface HolidayCalloutProps {
  holiday: HolidayWithBridge;
}

/**
 * `surface-raised`, fio superior de 2px `holiday`, pílula "N dias", nome em
 * h3, período, link "Planejar este feriado" (UX-SPEC.md §8.3 "N
 * `HolidayCallout`"). Área clicável do link >= 44px (UX-SPEC.md, alvos de
 * toque).
 */
function HolidayCallout({ holiday }: HolidayCalloutProps) {
  const { totalDays } = holiday.bridge;
  const dateParam = formatHolidayDateParam(holiday.date);

  return (
    <div className="flex flex-col gap-3 rounded-lg border-t-2 border-holiday bg-surface-raised p-5">
      <span className="inline-flex w-fit items-center rounded-full bg-holiday px-3 py-1 text-xs font-semibold text-holiday-foreground">
        {totalDays} {totalDays === 1 ? "dia" : "dias"}
      </span>
      <h3 className="font-serif text-lg text-foreground">{holiday.name}</h3>
      <p className="text-sm text-foreground-muted">
        {formatHolidayPeriod(holiday)}
      </p>
      {/* RF-18.4: link de texto em `foreground`, nunca a cor de CTA. */}
      <a
        href={`/entrada/feriados?feriado=${dateParam}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        Planejar este feriado
        <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}

/**
 * "Próximos feriados" (UX-SPEC.md §8.2 T-HOME item 6): 3 `HolidayCallout` a
 * partir de hoje. Some inteiramente (retorna `null`) quando não há feriado
 * futuro — não deveria acontecer no calendário brasileiro corrente, mas é o
 * guard-rail explícito do critério de aceite desta tarefa.
 */
export function UpcomingHolidaysSection() {
  const holidays = getProximosFeriados(new Date(), QUANTIDADE_FERIADOS);

  if (holidays.length === 0) {
    return null;
  }

  return (
    <SectionBand
      tone="deep"
      title="A folga já está no calendário. Falta o destino."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {holidays.map((holiday) => (
          <HolidayCallout key={holiday.date.toISOString()} holiday={holiday} />
        ))}
      </div>
    </SectionBand>
  );
}
