// L5-T03 — `ErrorRetryState` (UX-SPEC.md Seção 3/§4/§5, ADR-004/RNF-05).
//
// Apresentação pura do estado de erro pós-retry único do Gateway de IA
// (ADR-004): o retry automático já aconteceu no servidor (L3-T04,
// `generateStructuredCompletionWithRetry`) ANTES deste estado aparecer — este
// componente só apresenta o resultado final de falha e o CTA manual de nova
// tentativa. Nunca dispara retry sozinho/em loop (Diretriz de Implementação
// 7 do TASK.md): o clique só chama `onRetry`, quem decide quantas vezes/
// quando tentar de novo é sempre o chamador (a tela), nunca este componente.
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorRetryStateProps {
  /** Mensagem de erro amigável (UX-SPEC.md Seção 4 traz o texto padrão para T04: "Não conseguimos gerar sugestões agora — tentar novamente"). Sem mencionar provider (UX-SPEC §autocheck: ADR-002 pode mudar sem impacto de tela). */
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Estado de erro pós-retry único (UX-SPEC.md Seção 4/ADR-004). `role="alert"`
 * (aria-live="assertive" implícito) para que a falha seja anunciada de
 * imediato — diferente do `aria-live="polite"` de `LoadingStream`, já que
 * aqui não há mais progresso para não interromper. Ícone + texto (UX-SPEC
 * §5: "estado de erro usa ícone + texto, nunca borda vermelha isolada").
 */
export function ErrorRetryState({
  message,
  onRetry,
  retryLabel = "Tentar novamente",
  className,
}: ErrorRetryStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-error/40 bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-error">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
