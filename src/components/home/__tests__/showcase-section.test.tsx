// V2-L4-T04 — Testes de `ShowcaseSection`/`ImageCreditsSection` (RF-12.1
// item 4, RF-12.3, RF-15.5).
//
// Para os cenários com imagem curada, mutamos temporariamente o campo
// `imagem` do destino real no `CATALOGO_DESTINOS` (nenhum destino do V2.0
// tem foto curada ainda, ADR-010) e restauramos `null` no `afterEach` —
// evita mockar `resolver-imagem.ts` inteiro só para testar a UI que consome
// o resultado, e exercita o mesmo caminho de código de produção
// (`resolverImagemDestino`) sem duplicar sua lógica de correspondência aqui.
import type { ImgHTMLAttributes } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOGO_DESTINOS, type ImagemCurada } from "@/lib/catalogo/destinos";
import { ShowcaseSection, ImageCreditsSection } from "@/components/home/showcase-section";

vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    ...imgProps
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...imgProps} />
  ),
}));

afterEach(() => cleanup());

const DESTINOS_VITRINE_ORDEM = CATALOGO_DESTINOS.filter((d) => d.vitrine !== null).sort(
  (a, b) => a.vitrine! - b.vitrine!,
);

const IMAGEM_CURADA_EXEMPLO: (slug: string, fonte: "unsplash" | "pexels") => ImagemCurada = (
  slug,
  fonte,
) => ({
  arquivo: `/destinos/${slug}-v1.jpg`,
  largura: 1200,
  altura: 800,
  autor: "Autora Exemplo",
  autorUrl: `https://example.com/${fonte}/autora`,
  fonte,
  fonteUrl: `https://${fonte}.com/photos/exemplo`,
  licenca: fonte === "unsplash" ? "Unsplash License" : "Pexels License",
  curadaEm: "2026-09-16",
});

describe("ShowcaseSection (V2-L4-T04)", () => {
  it("renderiza exatamente os 8 destinos da vitrine, na ordem do catálogo (RF-12.1 item 4)", () => {
    render(<ShowcaseSection />);

    const links = screen.getAllByRole("link", { name: /^Planejar viagem para /i });
    expect(links).toHaveLength(8);
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual(
      DESTINOS_VITRINE_ORDEM.map((d) => `Planejar viagem para ${d.nome}`),
    );
  });

  it("cada card leva a /entrada/data-livre?destino={slug}", () => {
    render(<ShowcaseSection />);

    for (const destino of DESTINOS_VITRINE_ORDEM) {
      const link = screen.getByRole("link", { name: `Planejar viagem para ${destino.nome}` });
      expect(link).toHaveAttribute("href", `/entrada/data-livre?destino=${destino.slug}`);
    }
  });

  it("mostra UF · região e o nome do destino em h3, na ordem do catálogo", () => {
    render(<ShowcaseSection />);

    const primeiro = DESTINOS_VITRINE_ORDEM[0];
    expect(screen.getByText(`${primeiro.uf} · ${primeiro.rotuloRegiao}`)).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(DESTINOS_VITRINE_ORDEM.map((d) => d.nome));
  });

  it("não mostra preço nem temporada nos cards (RF-12.3, decisão confirmada)", () => {
    render(<ShowcaseSection />);

    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("a lista é identificável por aria-label (UX-SPEC.md §8.5)", () => {
    render(<ShowcaseSection />);

    expect(screen.getByRole("list", { name: "Destinos para começar" })).toBeInTheDocument();
  });

  it("não mostra botão de crédito quando nenhum destino da vitrine tem imagem curada (estado atual do catálogo)", () => {
    render(<ShowcaseSection />);

    expect(
      screen.queryByRole("link", { name: /^Crédito da imagem de /i }),
    ).not.toBeInTheDocument();
  });

  it("mostra o botão 'i' de crédito, fora do link principal, quando a imagem do card é curada (RF-15.5)", () => {
    const primeiro = DESTINOS_VITRINE_ORDEM[0];
    primeiro.imagem = IMAGEM_CURADA_EXEMPLO(primeiro.slug, "unsplash");

    try {
      render(<ShowcaseSection />);

      const botaoCredito = screen.getByRole("link", {
        name: `Crédito da imagem de ${primeiro.nome}`,
      });
      expect(botaoCredito).toHaveAttribute("href", "#creditos");

      const linkPrincipal = screen.getByRole("link", {
        name: `Planejar viagem para ${primeiro.nome}`,
      });
      expect(linkPrincipal).not.toContainElement(botaoCredito);
    } finally {
      primeiro.imagem = null;
    }
  });
});

describe("ImageCreditsSection (V2-L4-T04, RF-15.5)", () => {
  it("não renderiza nada quando nenhum destino recebido tem imagem curada", () => {
    const { container } = render(<ImageCreditsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lista "Foto de {autor} no {fonte}" com links, sob id="creditos", quando há imagem curada', () => {
    const primeiro = DESTINOS_VITRINE_ORDEM[0];
    primeiro.imagem = IMAGEM_CURADA_EXEMPLO(primeiro.slug, "pexels");

    try {
      render(<ImageCreditsSection />);

      const secao = document.getElementById("creditos");
      expect(secao).not.toBeNull();

      const linkAutor = screen.getByRole("link", { name: "Autora Exemplo" });
      expect(linkAutor).toHaveAttribute("href", "https://example.com/pexels/autora");

      const linkFonte = screen.getByRole("link", { name: "Pexels" });
      expect(linkFonte).toHaveAttribute("href", "https://pexels.com/photos/exemplo");
    } finally {
      primeiro.imagem = null;
    }
  });
});
