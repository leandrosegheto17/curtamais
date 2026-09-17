"use client";

// V2-L4-T08 — `MobileStickyCta` (RF-12.6; UX-SPEC.md §8.2 T-HOME item 9,
// §8.6 "Barra fixa"; RNF-10).
//
// Componente cliente standalone (mesma decisão de `AccountNav`,
// V2-L4-T09): esta tarefa roda em paralelo a V2-L4-T01/T02 e não integra
// `src/app/page.tsx` (escopo de integração final, separado — ver
// BLOCKERS.md Bloqueio 011). Como o hero (`aria-label="Destino em
// destaque"`, V2-L4-T01) e a seção `#caminhos` (V2-L4-T02) não convivem
// ainda no mesmo DOM real, o componente localiza os dois via seletor CSS
// configurável (`heroSelector`/`caminhosSelector`, com defaults que já
// batem com o markup real de cada um) em vez de depender de refs passadas
// de fora — assim a tarefa de integração final só precisa renderizar
// `<MobileStickyCta />` junto das outras seções, sem precisar encanar refs
// entre componentes irmãos.
//
// Regras (UX-SPEC §8.2 item 9 / §8.6 "Barra fixa"):
//   - só abaixo de `md` (768px) — `md:hidden`;
//   - só visível quando o hero JÁ SAIU da tela;
//   - some de novo quando `#caminhos` está visível, mesmo que o hero
//     continue fora da tela (ex.: usuário rolou rápido e já passou os
//     caminhos);
//   - se o hero não existir no DOM (componente ainda não integrado, ou
//     usado numa página sem hero), trata como "fora da tela" (mostra a
//     barra) em vez de escondê-la para sempre.
//   - movimento (RNF-10): a transição de entrada/saída da barra é
//     desativada quando `prefers-reduced-motion: reduce` (mesmo padrão de
//     detecção de `src/app/entrada/feriados/feriados-screen.tsx`).
import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const HERO_SELECTOR_PADRAO = '[aria-label="Destino em destaque"]';
const CAMINHOS_SELECTOR_PADRAO = "#caminhos";
const HREF_PADRAO = "#caminhos";

export type MobileStickyCtaProps = {
  /**
   * Seletor CSS do elemento do hero (`<section aria-label="Destino em
   * destaque">`, V2-L4-T01). Configurável porque este componente é
   * standalone: a integração final pode apontar para o markup real sem
   * precisar mudar este arquivo.
   */
  heroSelector?: string;
  /**
   * Seletor CSS da seção "Três caminhos" (`#caminhos`, V2-L4-T02). A barra
   * some enquanto essa seção estiver visível.
   */
  caminhosSelector?: string;
  /** Destino do CTA "Montar minha viagem" (RF-12.6). */
  href?: string;
};

export function MobileStickyCta({
  heroSelector = HERO_SELECTOR_PADRAO,
  caminhosSelector = CAMINHOS_SELECTOR_PADRAO,
  href = HREF_PADRAO,
}: MobileStickyCtaProps = {}) {
  const [heroForaDaTela, setHeroForaDaTela] = useState(false);
  const [caminhosVisivel, setCaminhosVisivel] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observers: IntersectionObserver[] = [];

    const heroElement = document.querySelector(heroSelector);
    if (heroElement) {
      const heroObserver = new IntersectionObserver(([entry]) => {
        setHeroForaDaTela(!entry.isIntersecting);
      });
      heroObserver.observe(heroElement);
      observers.push(heroObserver);
    } else {
      // Hero ainda não está no DOM (ver comentário de topo): trata como
      // "fora da tela" em vez de esconder a barra para sempre.
      setHeroForaDaTela(true);
    }

    const caminhosElement = document.querySelector(caminhosSelector);
    if (caminhosElement) {
      const caminhosObserver = new IntersectionObserver(([entry]) => {
        setCaminhosVisivel(entry.isIntersecting);
      });
      caminhosObserver.observe(caminhosElement);
      observers.push(caminhosObserver);
    }

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [heroSelector, caminhosSelector]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const visivel = heroForaDaTela && !caminhosVisivel;

  return (
    <div
      data-testid="mobile-sticky-cta"
      aria-hidden={!visivel}
      className={[
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised p-3 md:hidden",
        prefersReducedMotion ? "" : "transition-transform duration-200",
        visivel ? "translate-y-0" : "pointer-events-none translate-y-full",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Button asChild size="lg" className="h-11 min-h-11 w-full">
        <Link href={href} tabIndex={visivel ? undefined : -1}>
          Montar minha viagem
        </Link>
      </Button>
    </div>
  );
}
