"use client";

// V2-L8-T04 — `AlertDialog` acessível para confirmação destrutiva (UX-SPEC.md
// §8.2 T-MEUS: "Excluir minha conta"), padrão WAI-ARIA "Alert Dialog"
// (https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/).
//
// Nenhum pacote `@radix-ui/react-alert-dialog`/`react-dialog` está instalado
// no projeto ainda (só `@radix-ui/react-slot`, usado por `Button asChild`) e
// nenhum outro fluxo do projeto tinha implementado uma confirmação
// destrutiva modal antes desta tarefa — por isso este componente é uma
// implementação própria, minimalista, do MESMO padrão de acessibilidade que
// o shadcn `AlertDialog` (que também é construído sobre Radix) entregaria:
// - `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/
//   `aria-describedby` apontando para título/descrição;
// - foco inicial no botão "Cancelar" (UX-SPEC §8.5: "T-MEUS: depois de
//   'Excluir conta' cancelado, o foco volta ao botão" — cancelar é a ação
//   seletiva/reversível, então também é o padrão APG "focus on the least
//   destructive action");
// - `Tab`/`Shift+Tab` presos dentro do diálogo (focus trap) enquanto aberto;
// - `Escape` fecha (equivalente a "Cancelar");
// - ao fechar, o foco volta ao elemento que tinha foco antes de abrir (o
//   botão "Excluir minha conta" que disparou o diálogo).
import { useEffect, useRef } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface AlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Estado de processamento do botão de confirmação (ex.: exclusão em andamento). */
  confirmPending?: boolean;
  confirmVariant?: ButtonProps["variant"];
  /** Mensagem de erro exibida dentro do diálogo, sem fechá-lo (UX-SPEC §8.4: "Exclusão falhou: mensagem no diálogo, que continua aberto"). */
  errorMessage?: string | null;
}

export function AlertDialog({
  open,
  title,
  description,
  cancelLabel = "Cancelar",
  confirmLabel,
  onCancel,
  onConfirm,
  confirmPending = false,
  confirmVariant = "destructive",
  errorMessage,
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      data-testid="alert-dialog-overlay"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        className={cn(
          "w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-lg",
        )}
      >
        <h2 id="alert-dialog-title" className="font-serif text-lg text-foreground">
          {title}
        </h2>
        <p id="alert-dialog-description" className="mt-2 text-sm text-foreground-muted">
          {description}
        </p>
        {errorMessage && (
          <p role="alert" className="mt-2 text-sm text-error">
            {errorMessage}
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            className="min-h-11"
            disabled={confirmPending}
            onClick={onConfirm}
          >
            {confirmPending ? "Excluindo..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
