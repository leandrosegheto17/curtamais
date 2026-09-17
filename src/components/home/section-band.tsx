// V2-L4-T01 — `SectionBand` (UX-SPEC.md §8.3, "N `SectionBand`": "faixa de
// largura total com fundo `deep` e conteúdo com largura máxima").
//
// Wrapper genérico de seção, propositalmente simples (título opcional, `id`
// para âncora, `children`), para ser reaproveitado pelas próximas tarefas do
// Lote V2-L4 (T02-T08) — cada uma renderiza sua própria seção da home dentro
// de um `SectionBand`. Esta tarefa (V2-L4-T01) não usa `SectionBand` em
// `src/app/page.tsx` (só o `HeroSection`, que é full-bleed e não se encaixa
// no contêiner de largura máxima de uma faixa); o componente existe aqui
// pronto para as tarefas paralelas seguintes.
//
// `tone`: a maioria das seções fica sobre o `background` padrão da página;
// só "Três jeitos de começar" (T02) e "Próximos feriados" (T06b) usam a faixa
// `deep` (UX-SPEC.md §8.2, itens 2 e 6). Não inventamos mais tons além dos
// dois que o UX-SPEC já nomeia.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SectionBandProps {
  /** Âncora da seção (ex.: `id="caminhos"`, usado pelo CTA do hero e pela barra fixa). */
  id?: string;
  /** Título de seção (h2), omitido quando a seção não tem um (ex.: hero, que não é um `SectionBand`). */
  title?: string;
  /** `"deep"` para as faixas com fundo `deep` (UX-SPEC.md §8.3); `"default"` mantém o `background` da página. */
  tone?: "default" | "deep";
  children: ReactNode;
  className?: string;
}

/**
 * Faixa de largura total (`tone` controla o fundo) com um contêiner interno
 * de largura máxima centralizado — o mesmo padrão de todas as seções da home
 * vitrine (UX-SPEC.md §8.2 T-HOME).
 */
export function SectionBand({
  id,
  title,
  tone = "default",
  children,
  className,
}: SectionBandProps) {
  return (
    <section
      id={id}
      className={cn("w-full", tone === "deep" ? "bg-deep" : "bg-background", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-8">
        {title && (
          <h2 className="mb-8 text-balance font-serif text-[clamp(1.875rem,4vw,3rem)] leading-tight text-foreground">
            {title}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}
