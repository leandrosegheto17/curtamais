// L5-T02 — `PriceRangeBadge` (UX-SPEC.md Seção 3/§4/§5, RNF-01/RN-05).
//
// Componente de apresentação "burro": recebe uma faixa de preço já
// normalizada (`min`/`max`) e SEMPRE renderiza ícone + o texto "aproximado"
// junto ao valor — nunca omitido (RNF-01/RN-05, Diretriz de Implementação 6
// do TASK.md: "proibido renderizar preço fora dele"). Nenhuma tela deve
// formatar/exibir um preço por conta própria; toda faixa de preço do produto
// passa por este componente.
//
// Formato aceito (decisão de design desta tarefa): este componente NÃO
// conhece os schemas do Gateway de IA (`src/lib/gateway-ia/schemas.ts`), que
// usam nomes de campo diferentes por etapa (`faixaPrecoMin`/`Max` em destino,
// `precoPorDiariaMin`/`Max` em hospedagem, `precoMin`/`Max` em passeios) —
// misturar esse conhecimento aqui acoplaria um componente de design system a
// um contrato de LLM que pode mudar por etapa. Em vez disso, `PriceRangeBadge`
// aceita uma forma normalizada única (`min`/`max`, mais um `free` opcional) e
// cada chamador (telas do Lote 7/8/9) é responsável por mapear o campo do
// schema da sua etapa para essa forma antes de passar como prop, ex.:
// `<PriceRangeBadge min={destino.faixaPrecoMin} max={destino.faixaPrecoMax} />`.
//
// Caso "faixa gratuita" (RF-07.2, "badge especial 'Gratuito' quando price =
// 0"): o schema de passeios já carrega um campo explícito `gratuito`
// (`passeiosOpcoesSchema`, mais confiável que inferir de `min === 0 && max
// === 0`, já que um valor ainda não carregado/zerado por engano não deveria
// virar "Gratuito"), então o componente aceita um prop opcional `free` para o
// chamador passar esse sinal explícito quando disponível. Como salvaguarda —
// destino/hospedagem não têm esse campo e nunca deveriam chegar como
// "R$ 0,00 – R$ 0,00 (aproximado)" (texto sem sentido) — o componente também
// trata `min === 0 && max === 0` como gratuito mesmo sem o prop `free`
// explícito.
//
// `unitLabel` opcional (ex.: "por diária", usado em T06/hospedagem, UX-SPEC
// Seção 2: "PriceRangeBadge por diária") — texto adicional entre o valor e o
// "(aproximado)", só para dar contexto de unidade; nunca substitui o rótulo
// "aproximado" (RNF-01/RN-05 continuam se aplicando mesmo com unidade).
import { Tag } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PriceRangeBadgeProps {
  /** Preço mínimo da faixa, em BRL. Ignorado quando `free` é `true`. */
  min: number;
  /** Preço máximo da faixa, em BRL. Ignorado quando `free` é `true`. */
  max: number;
  /**
   * Sinal explícito de faixa gratuita (RF-07.2). Quando ausente, o
   * componente também trata `min === 0 && max === 0` como gratuito (ver
   * comentário de cabeçalho).
   */
  free?: boolean;
  /** Texto de unidade opcional (ex.: "por diária", UX-SPEC T06). */
  unitLabel?: string;
  className?: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatBRL(value: number): string {
  return currencyFormatter.format(value);
}

/**
 * Badge de faixa de preço (UX-SPEC.md Seção 3): ícone + texto sempre juntos
 * (RNF-01/RN-05 — nenhuma informação de preço só por número isolado, e nunca
 * omitindo o rótulo "aproximado"). Fundo `surface` com borda sutil (UX-SPEC:
 * "nunca um badge 'sólido' saturado que compita com o accent dourado do
 * CTA principal").
 */
export function PriceRangeBadge({
  min,
  max,
  free,
  unitLabel,
  className,
}: PriceRangeBadgeProps) {
  const isFree = free ?? (min === 0 && max === 0);

  const label = isFree
    ? "Gratuito"
    : [
        min === max ? formatBRL(min) : `${formatBRL(min)} – ${formatBRL(max)}`,
        unitLabel,
        "(aproximado)",
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground",
        className,
      )}
    >
      <Tag className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
