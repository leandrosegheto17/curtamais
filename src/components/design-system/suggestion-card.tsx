// L5-T04 — `SuggestionCard` (UX-SPEC.md Seção 2/3/5, RF-04/RF-06/RF-07).
//
// Bloco genérico de apresentação reutilizado nas 3 telas de sugestão geradas
// por LLM: T04 (destino), T06 (hospedagem) e T07 (passeios). UX-SPEC.md Seção
// 3 é explícito: "estrutura idêntica (título em tipografia serifada, imagem
// opcional, `PriceRangeBadge`, ação principal)... Estrutura/conteúdo/ordem de
// campos não mudam — só a moldura visual". Este componente é a única
// implementação dessa estrutura — nenhuma tela (Lote 7/8/9, ainda não
// implementadas) deve recriar esse layout localmente (Diretriz de
// Implementação 11 do TASK.md).
//
// Design de props/slots (decisão desta tarefa): o que varia entre os 3 usos
// não é a estrutura visual, é (a) quais campos de conteúdo estão presentes e
// (b) quais ações cada tela expõe:
//   - T04 (destino): `title` (nome), `description` (justificativa 2-3
//     linhas), `imageUrl` (foto ilustrativa), `price`; ação única "Aprovar
//     este destino" via `actions`.
//   - T06 (hospedagem): `title`/`subtitle` (nome/tipo), `description`
//     (característica distintiva), `price` com `unitLabel="por diária"`;
//     duas ações via `actions` ("Aprovar" avança, "Ajustar" com campo de
//     feedback textual regenera a etapa, RF-05.3).
//   - T07 (passeios): `title` (nome), `meta` (duração aproximada), `price`
//     com `free` (badge "Gratuito", RF-07.2), `leading` (checkbox marcado por
//     padrão, RF-07.3) e `actions` (botão/link "Remover").
// Em vez de props booleanas por tela (`showCheckbox`/`showAdjustButton`...),
// a área de ação é um slot (`actions: ReactNode`) — cada tela chamadora monta
// os botões que fazem sentido para sua etapa (Button/Checkbox de
// `@/components/ui`, sem reimplementação aqui), mantendo este componente
// agnóstico do fluxo/estado de sessão (não conhece `TripSession`/state
// machine, ADR-006) e do schema do Gateway de IA (mesmo princípio de
// desacoplamento de `PriceRangeBadge`, L5-T02): o chamador mapeia o campo do
// schema da sua etapa (`src/lib/gateway-ia/schemas.ts`) para estas props
// normalizadas.
//
// `price` reaproveita `PriceRangeBadgeProps` (menos `className`) e é sempre
// renderizado através de `PriceRangeBadge` — este componente nunca formata
// preço por conta própria (Diretriz de Implementação 6 do TASK.md).
import type { ReactNode } from "react";

import {
  PriceRangeBadge,
  type PriceRangeBadgeProps,
} from "@/components/design-system/price-range-badge";
import { cn } from "@/lib/utils";

export interface SuggestionCardProps {
  /** Nome do destino/hospedagem/passeio, sempre em tipografia serifada (UX-SPEC Seção 3). */
  title: string;
  /** Linha secundária opcional (ex.: tipo de hospedagem em T06). */
  subtitle?: string;
  /** Justificativa curta (T04) ou característica distintiva (T06) — texto livre, `foreground-muted`. */
  description?: string;
  /** Foto ilustrativa opcional (T04); T06/T07 tipicamente não usam. */
  imageUrl?: string;
  /** Texto alternativo da imagem — obrigatório junto de `imageUrl` (WCAG). */
  imageAlt?: string;
  /**
   * Faixa de preço, sempre renderizada via `PriceRangeBadge` (L5-T02) —
   * nunca formatada aqui. Ausente quando a tela ainda não tem esse dado.
   */
  price?: Omit<PriceRangeBadgeProps, "className">;
  /** Texto complementar curto (ex.: duração aproximada em T07). */
  meta?: string;
  /** Slot para elemento posicionado antes do conteúdo (ex.: checkbox de T07, RF-07.3). */
  leading?: ReactNode;
  /**
   * Área de ação da tela (ex.: botão "Aprovar este destino" em T04;
   * "Aprovar"/"Ajustar" em T06; "Remover" em T07). Cada chamador monta os
   * elementos focáveis apropriados à sua etapa — este componente não define
   * comportamento de ação, só o slot onde ela aparece.
   */
  actions?: ReactNode;
  className?: string;
}

/**
 * Bloco de sugestão (UX-SPEC.md Seção 3): `surface` + borda fina, sem
 * `box-shadow` — mesma moldura em T04/T06/T07, conteúdo variável via props.
 * Acessível por teclado: nenhum elemento do card em si é focável (o card não
 * tem `onClick` próprio) — toda ação alcançável via Tab vem de `leading`/
 * `actions`, elementos nativos (`Button`/`Checkbox` de shadcn/ui) passados
 * pelo chamador, preservando ordem de tab natural do DOM sem necessidade de
 * `tabIndex` manual.
 */
export function SuggestionCard({
  title,
  subtitle,
  description,
  imageUrl,
  imageAlt,
  price,
  meta,
  leading,
  actions,
  className,
}: SuggestionCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="flex flex-1 items-start gap-3">
        {leading && <div className="pt-0.5">{leading}</div>}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-serif text-lg text-foreground">{title}</p>
          {subtitle && (
            <p className="text-sm text-foreground-muted">{subtitle}</p>
          )}
          {description && (
            <p className="text-sm text-foreground-muted">{description}</p>
          )}
          {(price || meta) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {price && <PriceRangeBadge {...price} />}
              {meta && (
                <span className="text-xs text-foreground-muted">{meta}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-3">
          {actions}
        </div>
      )}
    </div>
  );
}
