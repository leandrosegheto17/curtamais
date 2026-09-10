// L6-T04 — `HolidayListItem` (UX-SPEC.md Seção 2/3, T02, RF-02.1/RF-02.2).
//
// Bloco de apresentação de um feriado prolongado na lista de T02: nome do
// feriado + a emenda já formatada (ex.: "Qui 12/06 → estende até Dom 15/06,
// 4 dias"), mesma moldura visual "Concierge Noturno" dos demais blocos de
// linha do produto (`surface` + borda fina, sem `box-shadow` — UX-SPEC Seção
// 3, mesmo padrão de `SuggestionCard`/`EmptyState`).
//
// Este componente é puramente de apresentação + seleção (radio nativo,
// acessível por teclado sem `tabIndex` manual): não conhece Server Action,
// `TripSession` ou state machine (mesmo princípio de desacoplamento de
// `SuggestionCard`/`PriceRangeBadge`, L5-T02/T04) — o chamador (`FeriadosScreen`,
// L6-T04) decide o que fazer com a seleção. O envio da escolha ao servidor é
// escopo de L6-T05 (Server Action `T02`, ainda não implementada), não deste
// componente.
import { cn } from "@/lib/utils";

export interface HolidayListItemProps {
  /** Usado como `id`/valor do radio nativo — precisa ser único na lista. */
  id: string;
  /** Nome do feriado nacional (ex.: "Corpus Christi"). */
  name: string;
  /**
   * Texto de emenda já formatado e pronto para exibição (ex.: "Qui 12/06 →
   * estende até Dom 15/06, 4 dias"), vindo de `FeriadoProlongado.label`
   * (`src/lib/actions/feriados.ts`, L2-T02) — este componente nunca formata
   * data/emenda por conta própria.
   */
  label: string;
  /** Nome do grupo de radio nativo compartilhado por toda a lista (seleção única). */
  groupName: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}

/**
 * Linha selecionável de feriado (UX-SPEC.md Seção 2 T02): `surface` + borda
 * fina, destaque em `accent` (dourado) quando selecionado — nunca só cor
 * (UX-SPEC §5): o próprio estado de `checked` do radio nativo já comunica a
 * seleção a leitores de tela, a borda `accent` só reforça visualmente.
 */
export function HolidayListItem({
  id,
  name,
  label,
  groupName,
  selected,
  onSelect,
  className,
}: HolidayListItemProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition-colors",
        selected ? "border-accent" : "border-border",
        className,
      )}
    >
      <input
        type="radio"
        id={id}
        name={groupName}
        checked={selected}
        onChange={onSelect}
        className="mt-1.5 h-4 w-4 shrink-0 accent-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-serif text-lg text-foreground">{name}</span>
        <span className="text-sm text-foreground-muted">{label}</span>
      </span>
    </label>
  );
}
