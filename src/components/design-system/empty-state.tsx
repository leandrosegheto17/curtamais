// L5-T03 — `EmptyState` (UX-SPEC.md Seção 3/§4).
//
// Usado quando o usuário rejeita todas as sugestões geradas (RF-04.4, T04) —
// "oferece nova rodada ou entrada manual" (UX-SPEC.md Seção 4). Genérico o
// suficiente para outros usos futuros de "nenhum resultado" (título/
// descrição/ações são todos props), mas nenhuma tela real o consome ainda
// (fora de escopo deste Lote 5).
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Ex.: T04 (RF-04.4) usa 2 ações — "Gerar novas sugestões" e "Informar destino manualmente". A primeira ação recebe destaque visual (`variant="default"`), as demais são `outline`. */
  actions?: EmptyStateAction[];
  className?: string;
}

/**
 * Estado "nenhum resultado" (UX-SPEC.md Seção 4). Ícone + texto (nunca só
 * cor, UX-SPEC §5); reutilizável entre telas — não duplica esta lógica em
 * cada tela (Diretriz de Implementação 11 do TASK.md).
 */
export function EmptyState({
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center",
        className,
      )}
    >
      <Inbox className="h-8 w-8 text-foreground-muted" aria-hidden="true" />
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-sm text-foreground-muted">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actions.map((action, index) => (
            <Button
              key={action.label}
              type="button"
              variant={index === 0 ? "default" : "outline"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
