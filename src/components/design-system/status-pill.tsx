// V2-L8-T04 — `StatusPill` (UX-SPEC.md §8, T-MEUS/T-MEUS-DET, RF-17.3).
//
// Apresentação pura: recebe o `status` já classificado (não o `flowState`
// bruto — quem classifica é `rotuloDaSessao`, `@/lib/actions/meus-roteiros-label`,
// V2-L8-T01) e o texto de rótulo já pronto (mesma fonte, para nunca duplicar
// o vocabulário de RF-17.3 em dois lugares). Ícone + texto sempre juntos
// (UX-SPEC §8.2: "a cor nunca é o único sinal") — mesmo padrão já usado por
// `PriceRangeBadge`/`ErrorRetryState`.
//
// Extraído para `design-system` (em vez de ficar só dentro de T-MEUS) porque
// T-MEUS-DET (`V2-L8-T05`, tarefa paralela) também precisa do mesmo pill no
// bloco de resumo ("Bloco de resumo igual ao de T-END, com rótulo de
// status." — UX-SPEC §8.2 T-MEUS-DET) — reaproveitar em vez de duplicar.
import { CheckCircle2, Clock, Flag } from "lucide-react";

import { cn } from "@/lib/utils";

/** Classificação de status de uma sessão (RF-17.3) — vocabulário fechado de 3 valores. */
export type StatusPillStatus = "em_andamento" | "concluida" | "encerrada";

export interface StatusPillProps {
  status: StatusPillStatus;
  /** Rótulo já pronto (ex.: "Em andamento — na etapa hospedagem"), calculado por `rotuloDaSessao`. */
  label: string;
  className?: string;
}

const ICONE_POR_STATUS: Record<StatusPillStatus, typeof Clock> = {
  em_andamento: Clock,
  concluida: CheckCircle2,
  encerrada: Flag,
};

/**
 * Pílula de status de uma sessão (RF-17.3, UX-SPEC §8.2): ícone + texto
 * sempre juntos, nunca só a cor como sinal.
 */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const Icon = ICONE_POR_STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/** Deriva o `StatusPillStatus` a partir do `flowState` bruto (mesma classificação de `rotuloDaSessao`). */
export function statusPillStatusFromFlowState(
  flowState: string,
): StatusPillStatus {
  if (flowState === "concluida") return "concluida";
  if (flowState === "encerrada_parcial") return "encerrada";
  return "em_andamento";
}
