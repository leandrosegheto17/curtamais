// V2-L4-T02 — `EntryPathsSection` (RF-12.1 item 2; UX-SPEC.md §8.2 T-HOME
// item 2: "Três jeitos de começar").
//
// Reaproveita `ENTRY_PATHS`/`ENTRY_PATH_CLASSNAME` de
// `src/components/entrada/entry-paths.ts` (T00 do MVP) em vez de recriar os
// três caminhos — mesmos href/ícone/título/descrição, sem nenhuma variação
// de destaque entre eles (nenhum pré-selecionado).
//
// Foco programático no título ao chegar via `#caminhos` (ex.: CTA "Montar
// minha viagem" do hero, `href="#caminhos"` em `hero-section.tsx`): como
// esta seção é renderizada sempre (não é uma rota própria, ao contrário das
// telas do fluxo MVP que fazem `.focus()` incondicional no `useEffect` de
// montagem), o foco só é movido quando `location.hash` já é `#caminhos` no
// momento da montagem — navegação normal da home (sem hash) não rouba o
// foco do usuário.
//
// Não usa a prop `title` de `SectionBand` (V2-L4-T01): aquele `h2` não tem
// `ref`/`tabIndex` para receber foco. Em vez disso, o título é renderizado
// aqui dentro dos `children`, com a mesma classe visual do `h2` de
// `SectionBand`, para manter a aparência idêntica às demais seções.
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { SectionBand } from "@/components/home/section-band";
import { ENTRY_PATHS, ENTRY_PATH_CLASSNAME } from "@/components/entrada/entry-paths";

const ANCHOR_HASH = "#caminhos";

/**
 * "Três jeitos de começar" (UX-SPEC.md §8.2 T-HOME item 2): os 3 blocos de
 * entrada de T00, com peso visual igual e nenhum pré-selecionado, numa faixa
 * `deep`.
 */
export function EntryPathsSection() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (window.location.hash === ANCHOR_HASH) {
      headingRef.current?.focus();
    }
  }, []);

  return (
    <SectionBand id="caminhos" tone="deep">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mb-8 text-balance font-serif text-[clamp(1.875rem,4vw,3rem)] leading-tight text-foreground focus-visible:outline-none"
      >
        Três jeitos de começar, o mesmo roteiro no fim
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ENTRY_PATHS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className={ENTRY_PATH_CLASSNAME}>
            <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
            <span className="font-serif text-lg text-foreground">{title}</span>
            <span className="text-sm text-foreground-muted">{description}</span>
          </Link>
        ))}
      </div>
    </SectionBand>
  );
}
