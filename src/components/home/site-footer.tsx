// V2-L4-T07 — `SiteFooter` (UX-SPEC.md §8.2 T-HOME item 8).
//
// Rodapé de página inteira, full-bleed (não usa `SectionBand`, que é
// pensado para seções de conteúdo com título opcional — o próprio UX-SPEC
// descreve o rodapé separado das 9 seções numeradas de T-HOME e não lista
// título de `SectionBand` para ele).
//
// `ImageCreditsSection` (`id="creditos"`, lista "Foto de {autor} no
// {Unsplash|Pexels}" para cada imagem do catálogo exibida na home) é escopo
// de `V2-L4-T04` (ShowcaseSection), que já tem acesso aos destinos/imagens
// renderizados na vitrine. Para não duplicar essa lista aqui sem os dados
// necessários, nem bloquear esta tarefa na de T04, `SiteFooter` expõe um
// slot opcional `imageCredits` — a integração final em `src/app/page.tsx`
// (fora do escopo desta tarefa, mesma decisão de V2-L4-T01/T09) passa o
// `ImageCreditsSection` de T04 como esse slot.
import type { ReactNode } from "react";

export interface SiteFooterProps {
  /** Slot para `ImageCreditsSection` (`id="creditos"`, V2-L4-T04). */
  imageCredits?: ReactNode;
}

/**
 * Rodapé da home (UX-SPEC.md §8.2 T-HOME item 8): nome do produto, a linha
 * de posicionamento "Eu monto o plano; a reserva você faz onde preferir."
 * (mesma frase do `HeroSection`, RNF-11) e, quando fornecido, os créditos de
 * imagem do catálogo.
 */
export function SiteFooter({ imageCredits }: SiteFooterProps) {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-10 md:px-8">
        <p className="font-serif text-lg text-foreground">Destino Ideal</p>
        <p className="text-sm text-muted-foreground">
          Eu monto o plano; a reserva você faz onde preferir.
        </p>
        {imageCredits}
      </div>
    </footer>
  );
}
