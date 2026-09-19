"use client";

// V2-L9-T12 — Falha de leitura do checklist (UX-SPEC.md §9.4): só o painel
// mostra o erro; "Tentar de novo" recarrega a rota (o resumo e o roteiro
// seguem utilizáveis). Oculto na impressão (§9.6).
import { useRouter } from "next/navigation";

import { ErrorRetryState } from "@/components/design-system/error-retry-state";
import { CHECKLIST_ERRO_LEITURA } from "./checklist-copy";

export function ChecklistErroLeitura() {
  const router = useRouter();
  return (
    <ErrorRetryState
      className="checklist-print-hide"
      message={CHECKLIST_ERRO_LEITURA}
      retryLabel="Tentar de novo"
      onRetry={() => router.refresh()}
    />
  );
}
