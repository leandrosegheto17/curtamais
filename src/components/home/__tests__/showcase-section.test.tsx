// V2-L4-T04 — Testes de `ShowcaseSection`/`ImageCreditsSection` (RF-12.1
// item 4, RF-12.3, RF-15.5).
//
// Para os cenários com imagem curada, mutamos temporariamente o campo
// `imagem` de um destino real no `CATALOGO_DESTINOS` e restauramos o valor
// ORIGINAL capturado antes da mutação (nunca `null` "de olho fechado" —
// desde a curadoria de fotos reais, RL-catálogo-fotos, os 8 destinos da
// vitrine já têm `imagem` !== null de verdade, então os testes que precisam
// do estado "sem imagem" usam um destino fora da vitrine). Não dá para usar
// um `DestinoCatalogo` sintético/desacoplado aqui: `resolverImagemDestino`
// (consumida por `ShowcaseCard`/`ImageCreditsSection` via
// `resolverImagemDoDestino`) resolve por NOME contra o mapa construído a
// partir do `CATALOGO_DESTINOS` real — um objeto solto com nome inventado
// nunca bate no mapa e sempre cairia no fallback, ignorando o `imagem` que
// setamos nele. Mutar o objeto real (mesma referência do mapa) é a única
// forma de controlar o resultado.
import type { ImgHTMLAttributes } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CATALOGO_DESTINOS,
  type DestinoCatalogo,
  type ImagemCurada,
} from "@/lib/catalogo/destinos";
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

/**
 * Roda `fn` com a imagem de um destino real (fora da vitrine) trocada por
 * `imagem` — `ImageCreditsSection` resolve a foto pelo nome, contra o
 * catálogo real, então o teste precisa mutar o dado e restaurar no fim. O
 * catálogo já tem foto curada em todos os 23 destinos.
 */
function comImagemTemporaria(imagem: ImagemCurada | null, fn: (destino: DestinoCatalogo) => void) {
  const destino = CATALOGO_DESTINOS.find((d) => d.vitrine === null);
  if (!destino) throw new Error("Catálogo sem destino fora da vitrine.");
  const original = destino.imagem;
  destino.imagem = imagem;
  try {
    fn(destino);
  } finally {
    destino.imagem = original;
  }
}

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

  it("mostra botão de crédito só para os destinos da vitrine que já têm imagem curada", () => {
    render(<ShowcaseSection />);

    const comCredito = DESTINOS_VITRINE_ORDEM.filter((d) => d.imagem !== null);
    const semCredito = DESTINOS_VITRINE_ORDEM.filter((d) => d.imagem === null);

    for (const destino of comCredito) {
      expect(
        screen.getByRole("link", { name: `Crédito da imagem de ${destino.nome}` }),
      ).toBeInTheDocument();
    }
    for (const destino of semCredito) {
      expect(
        screen.queryByRole("link", { name: `Crédito da imagem de ${destino.nome}` }),
      ).not.toBeInTheDocument();
    }
  });

  it("mostra o botão 'i' de crédito, fora do link principal, quando a imagem do card é curada (RF-15.5)", () => {
    // Todos os 8 destinos da vitrine já têm imagem curada real — usa o
    // primeiro deles diretamente, sem mutar nada.
    const destino = DESTINOS_VITRINE_ORDEM[0];
    expect(destino.imagem).not.toBeNull();

    render(<ShowcaseSection />);

    const botaoCredito = screen.getByRole("link", {
      name: `Crédito da imagem de ${destino.nome}`,
    });
    expect(botaoCredito).toHaveAttribute("href", "#creditos");

    const linkPrincipal = screen.getByRole("link", {
      name: `Planejar viagem para ${destino.nome}`,
    });
    expect(linkPrincipal).not.toContainElement(botaoCredito);
  });
});

describe("ImageCreditsSection (V2-L4-T04, RF-15.5)", () => {
  it("não renderiza nada quando nenhum destino recebido tem imagem curada", () => {
    comImagemTemporaria(null, (destino) => {
      const { container } = render(<ImageCreditsSection destinos={[destino]} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('lista "Foto de {autor} no {fonte}" com links, sob id="creditos", quando há imagem curada', () => {
    const destino0 = CATALOGO_DESTINOS.find((d) => d.vitrine === null)!;
    comImagemTemporaria(IMAGEM_CURADA_EXEMPLO(destino0.slug, "pexels"), (destino) => {
      render(<ImageCreditsSection destinos={[destino]} />);

      expect(document.getElementById("creditos")).not.toBeNull();

      const linkAutor = screen.getByRole("link", { name: "Autora Exemplo" });
      expect(linkAutor).toHaveAttribute("href", "https://example.com/pexels/autora");

      const linkFonte = screen.getByRole("link", { name: "Pexels" });
      expect(linkFonte).toHaveAttribute("href", "https://pexels.com/photos/exemplo");
      expect(screen.queryByText(/redimensionadas/i)).toBeNull();
    });
  });

  it("foto do Wikimedia Commons: crédito mostra a licença CC e a nota de redimensionamento", () => {
    const destino0 = CATALOGO_DESTINOS.find((d) => d.vitrine === null)!;
    comImagemTemporaria(
      {
        arquivo: `/destinos/${destino0.slug}-v1.jpg`,
        largura: 1600,
        altura: 1200,
        autor: "Autor Commons",
        autorUrl: "https://commons.wikimedia.org/wiki/User:Exemplo",
        fonte: "wikimedia",
        fonteUrl: "https://commons.wikimedia.org/wiki/File:Exemplo.jpg",
        licenca: "CC BY-SA 3.0",
        curadaEm: "2026-09-19",
      },
      (destino) => {
        render(<ImageCreditsSection destinos={[destino]} />);

        const linkFonte = screen.getByRole("link", {
          name: "Wikimedia Commons (CC BY-SA 3.0)",
        });
        expect(linkFonte).toHaveAttribute(
          "href",
          "https://commons.wikimedia.org/wiki/File:Exemplo.jpg",
        );
        expect(screen.getByText(/redimensionadas para exibição/i)).toBeInTheDocument();
      },
    );
  });
});
