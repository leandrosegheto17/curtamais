// L5-T02 — `BudgetInsufficientBanner` (UX-SPEC.md Seção 3/§4, RF-10.2/RN-04).
//
// Banner de atenção, puramente informativo, usado em T04/T06/T07 quando
// nenhuma sugestão cabe no orçamento informado (RF-10.2) — a UI ainda mostra
// a opção mais barata disponível (`applyBudgetFilter`,
// `src/lib/session-flow/budget-filter.ts`, L4-T03), e este banner só
// comunica esse fato.
//
// RN-04 (não-negociável, Diretriz de Implementação 5 do TASK.md): orçamento
// insuficiente NUNCA desabilita botão de ação. Este componente não recebe
// nem expõe nenhuma prop capaz de desabilitar/afetar um elemento irmão da
// tela — não há `onDismiss` bloqueante, não há prop de "travar CTA", e o
// componente não interage com o DOM fora de si mesmo. A não-obstrução é
// garantida estruturalmente: o componente é 100% autocontido (só renderiza
// seu próprio `<div role="status">`) e quem monta a tela decide livremente
// onde posicioná-lo, sem que ele possa alterar irmãos.
//
// Integração com `applyBudgetFilter` (fora de escopo desta tarefa, ver
// TASK.md L5-T02 "Escopo desta tarefa"): o campo `exceedsBudget` de
// `BudgetFilteredSuggestion` (L4-T03) é o sinal que uma tela real (Lote
// 7/8/9) deve usar para decidir se passa `show=true` aqui — este componente
// só recebe a prop já resolvida, sem conhecer `applyBudgetFilter` ou
// `TripSession`.
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BudgetInsufficientBannerProps {
  /**
   * Quando `true`, exibe o banner (equivalente ao `exceedsBudget` de
   * `BudgetFilteredSuggestion`, L4-T03). Quando `false`/ausente, o
   * componente não renderiza nada — nunca ocupa espaço/atrapalha o layout
   * quando não é o caso de uso.
   */
  show: boolean;
  /**
   * Texto de diferença já formatado pelo chamador (ex.: "R$ 150 acima do
   * informado") — usado para compor a mensagem completa do UX-SPEC.md Seção
   * 4: "...mostrando a opção mais barata disponível, que excede o orçamento
   * em [diferença]." Quando ausente, a mensagem é exibida sem a cláusula de
   * diferença (ainda completa e correta, só menos específica).
   */
  differenceLabel?: string;
  className?: string;
}

/**
 * Banner de orçamento insuficiente (RF-10.2). Nunca bloqueia/desabilita
 * nenhum botão da tela onde é usado (RN-04) — ver comentário de cabeçalho.
 * Ícone + texto sempre juntos (UX-SPEC §5: "nenhuma informação de status só
 * por cor").
 */
export function BudgetInsufficientBanner({
  show,
  differenceLabel,
  className,
}: BudgetInsufficientBannerProps) {
  if (!show) {
    return null;
  }

  const message = differenceLabel
    ? `Não encontramos opções dentro do valor informado — mostrando a opção mais barata disponível, que excede o orçamento em ${differenceLabel}.`
    : "Não encontramos opções dentro do valor informado — mostrando a opção mais barata disponível, que excede o orçamento informado.";

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning/40 bg-surface px-3 py-2 text-sm text-warning",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
