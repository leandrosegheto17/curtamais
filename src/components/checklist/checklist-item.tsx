// V2-L9-T10 — Item do checklist (UX-SPEC.md §9.2/§9.5). Apresentacional:
// checkbox NATIVO + <label> (RNF-16); o estado e o handler vêm por props.
import { Check } from "lucide-react";

import { CHECKLIST_ERRO_GRAVACAO } from "./checklist-copy";
import { cn } from "@/lib/utils";

export interface ChecklistItemProps {
  itemKey: string;
  texto: string;
  checked: boolean;
  /** Gravação em curso: `aria-busy`, o checkbox segue utilizável. */
  pending?: boolean;
  /** Gravação falhou: mensagem inline `role="alert"` (foco não se move). */
  error?: boolean;
  /** Recebe o estado DESEJADO (idempotência), não "alternar". */
  onChange: (itemKey: string, checked: boolean) => void;
  className?: string;
}

export function ChecklistItem({
  itemKey,
  texto,
  checked,
  pending = false,
  error = false,
  onChange,
  className,
}: ChecklistItemProps) {
  return (
    <li
      className={cn("checklist-item", className)}
      data-checked={checked ? "true" : "false"}
      aria-busy={pending || undefined}
    >
      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-foreground">
        <input
          type="checkbox"
          className="checklist-checkbox h-5 w-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          checked={checked}
          onChange={(e) => onChange(itemKey, e.target.checked)}
        />
        <span
          className={cn(
            "text-sm",
            checked && "line-through decoration-1 opacity-80",
          )}
        >
          {texto}
        </span>
        {checked ? (
          <Check
            className="checklist-check h-4 w-4 shrink-0 text-success"
            aria-hidden="true"
          />
        ) : null}
      </label>
      {error ? (
        <p
          role="alert"
          className="checklist-print-hide pl-8 text-sm text-error"
        >
          {CHECKLIST_ERRO_GRAVACAO}
        </p>
      ) : null}
    </li>
  );
}
