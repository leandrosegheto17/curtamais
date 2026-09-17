// V2-L3-T02 — `ExampleBadge` (UX-SPEC.md §8.3 "N `ExampleBadge`": "pílula de
// contorno `accent` com ícone de 'olho' e texto 'Exemplo' ou 'Roteiro de
// exemplo'"). Mesmo padrão de pílula ícone+texto de `PriceRangeBadge`/
// `StatusPill`, mas com contorno `accent` (não `border`/`bg-surface`
// neutros) porque este selo precisa se destacar como aviso, não como
// informação neutra.
import { Eye } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ExampleBadgeProps {
  /** Default "Roteiro de exemplo" (UX-SPEC §8.2 T-EX, "topo: `ExampleBadge` grande"). */
  label?: string;
  className?: string;
}

export function ExampleBadge({
  label = "Roteiro de exemplo",
  className,
}: ExampleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-accent px-2.5 py-1 text-xs font-medium text-accent",
        className,
      )}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
