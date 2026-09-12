// L10-T02 — `ItineraryDayBlock` (UX-SPEC.md Seção 2/3/6, T08, RF-08).
//
// Bloco de apresentação de um dia do roteiro final: cabeçalho com a data
// (dia da semana + `DD/MM`, mesmo padrão de abreviação de
// `src/lib/actions/feriados.ts`, L2-T02 — duplicado aqui deliberadamente,
// mesmo raciocínio já adotado por `src/lib/stage-rules/roteiro.ts`
// `parseIsoDateToUtcEpoch`: evitar acoplar um componente de apresentação a um
// módulo `"use server"`), e os 3 blocos de período do dia (manhã/tarde/noite,
// RF-08.1) — sempre os 3 presentes, mesmo vazios (mesmo shape de
// `RoteiroDayResult`, `@/lib/stage-rules/roteiro.ts`, L10-T01), cada item
// mostrando `suggestedTime` sempre e `timingJustification` só quando
// presente (RF-08.3, critério de aceite desta tarefa: "justificativa exibida
// quando presente" — campo pode ser `null`).
//
// Comportamento responsivo (UX-SPEC.md Seção 6, "Revisado nesta reabertura"):
//   - Mobile (< md): acordeão — só o dia com `expanded=true` mostra o
//     conteúdo; os demais ficam com o cabeçalho visível e o conteúdo
//     colapsado (critério de aceite explícito desta tarefa: "acordeão em
//     mobile").
//   - Desktop (>= md): TODOS os dias sempre expandidos, independente do
//     estado de `expanded` — "coluna única larga com todos os dias
//     expandidos... sem lado a lado" (UX-SPEC §6). Resolvido só com CSS
//     (`hidden` + `md:block`, mesmo padrão Tailwind já usado no projeto para
//     comportamento responsivo sem duplicar DOM/lógica): o conteúdo nunca sai
//     do DOM, só fica oculto por CSS em telas pequenas — evita recriar
//     estado ao redimensionar e mantém o conteúdo acessível a buscadores/
//     leitores que ignorem `display:none` corretamente. `aria-expanded`
//     reflete o estado lógico do acordeão (mobile), mesmo que o conteúdo
//     esteja visível no desktop por CSS — decisão de detalhe de
//     implementação, documentada aqui por não estar explícita na UX-SPEC.md.
//
// Controlado pelo chamador (`expanded`/`onToggle`), mesmo princípio de
// desacoplamento de `HolidayListItem`/`SuggestionCard` (L5-T02/T04/L6-T04):
// este componente não guarda estado de "qual dia está expandido" sozinho —
// a tela (`RoteiroScreen`, L10-T02) decide a regra de "um dia expandido por
// vez" (UX-SPEC §6).
import { cn } from "@/lib/utils";

/** Mesmo shape de `RoteiroItemResult` (`@/lib/stage-rules/roteiro.ts`, L10-T01) — reexportado aqui só como referência de tipo, não duplicado como fonte de verdade. */
export interface ItineraryDayBlockItem {
  activity: string;
  suggestedTime: string;
  timingJustification: string | null;
}

export interface ItineraryDayBlockProps {
  /** Formato ISO (`YYYY-MM-DD`) — mesmo formato de `RoteiroDayResult.date`. */
  date: string;
  morning: ItineraryDayBlockItem[];
  afternoon: ItineraryDayBlockItem[];
  evening: ItineraryDayBlockItem[];
  /** Estado do acordeão em mobile (UX-SPEC §6) — ignorado (sempre expandido) em telas >= md via CSS. */
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

const WEEKDAY_ABBREV = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

/** Formata uma data ISO (`YYYY-MM-DD`) como "Qui 12/06" (mesmo padrão de rótulo de `formatBridgeLabel`, `src/lib/actions/feriados.ts`) — `null` se ininterpretável. */
function formatDayLabel(dateIso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const epoch = Date.UTC(year, month - 1, day);
  if (Number.isNaN(epoch)) return null;
  const date = new Date(epoch);
  const weekday = WEEKDAY_ABBREV[date.getUTCDay()];
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${weekday} ${dd}/${mm}`;
}

const PERIOD_LABELS = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
} as const;

function ItineraryPeriodSection({
  label,
  items,
}: {
  label: string;
  items: ItineraryDayBlockItem[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nada planejado.</p>
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {items.map((item, index) => (
            <li
              key={`${item.activity}-${index}`}
              className="flex flex-col gap-1 rounded-md border border-border bg-background/40 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-foreground">{item.activity}</span>
                <span className="text-sm text-foreground-muted">
                  {item.suggestedTime}
                </span>
              </div>
              {item.timingJustification && (
                <p className="text-sm text-foreground-muted">
                  {item.timingJustification}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Bloco de um dia do roteiro final (UX-SPEC.md Seção 2/3/6, T08, RF-08).
 * `surface` + borda fina, sem `box-shadow` (mesma moldura "Concierge
 * Noturno" dos demais blocos de linha do produto).
 */
export function ItineraryDayBlock({
  date,
  morning,
  afternoon,
  evening,
  expanded,
  onToggle,
  className,
}: ItineraryDayBlockProps) {
  const dayLabel = formatDayLabel(date) ?? date;
  const contentId = `itinerary-day-${date}-content`;
  const headingId = `itinerary-day-${date}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="flex min-h-11 w-full items-center justify-between gap-2 font-serif text-lg text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:cursor-default"
        >
          <span>{dayLabel}</span>
          <span aria-hidden="true" className="text-foreground-muted md:hidden">
            {expanded ? "−" : "+"}
          </span>
        </button>
      </h2>

      {/*
        Comportamento responsivo (ver cabeçalho do arquivo): oculto em mobile
        quando não expandido, sempre visível em desktop (`md:block`)
        independente de `expanded`.
      */}
      <div
        id={contentId}
        className={cn(
          "flex-col gap-4 md:flex",
          expanded ? "flex" : "hidden",
        )}
      >
        <ItineraryPeriodSection label={PERIOD_LABELS.morning} items={morning} />
        <ItineraryPeriodSection label={PERIOD_LABELS.afternoon} items={afternoon} />
        <ItineraryPeriodSection label={PERIOD_LABELS.evening} items={evening} />
      </div>
    </section>
  );
}
