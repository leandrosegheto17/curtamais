import type { ReactElement } from "react";

import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuggestionCard } from "@/components/design-system/suggestion-card";
import { Button } from "@/components/ui/button";
import type { ImagemResolvida } from "@/lib/catalogo/resolver-imagem";
import type { DestinoCatalogo } from "@/lib/catalogo/destinos";

afterEach(() => cleanup());

// V2-L2-T05 — fixtures de `ImagemResolvida` (curada/fallback) para os testes
// de `media`, sem depender do catálogo real (nenhum destino do catálogo tem
// foto curada ainda, ver V2-L2-T01).
const destinoFixture: DestinoCatalogo = {
  slug: "gramado",
  nome: "Gramado",
  uf: "RS",
  rotuloRegiao: "Serra Gaúcha",
  variantes: [],
  vitrine: 3,
  imagem: {
    arquivo: "/destinos/gramado-v1.jpg",
    largura: 1600,
    altura: 1200,
    autor: "Jane Doe",
    autorUrl: "https://unsplash.com/@janedoe",
    fonte: "unsplash",
    fonteUrl: "https://unsplash.com/photos/abc123",
    licenca: "Unsplash License",
    curadaEm: "2026-09-16",
  },
};

const imagemCurada: ImagemResolvida = {
  tipo: "curada",
  destino: destinoFixture,
  imagem: destinoFixture.imagem!,
};

const imagemFallback: ImagemResolvida = {
  tipo: "fallback",
  nomeOriginal: "Gramado",
  corInicio: "#1E3A8A",
  corFim: "#172554",
  anguloGraus: 45,
  inicial: "G",
};

describe("SuggestionCard", () => {
  it("T04 (destino): título serifado, descrição, PriceRangeBadge e ação única 'Aprovar este destino'", () => {
    render(
      <SuggestionCard
        title="Foz do Iguaçu"
        description="Cataratas, natureza e roteiro leve para um feriado curto."
        imageUrl="/foz.jpg"
        imageAlt="Cataratas do Iguaçu"
        price={{ min: 1200, max: 1800 }}
        actions={<Button type="button">Aprovar este destino</Button>}
      />,
    );

    expect(
      screen.getByText("Foz do Iguaçu", { selector: "p" }),
    ).toHaveClass("font-serif");
    expect(
      screen.getByText(
        "Cataratas, natureza e roteiro leve para um feriado curto.",
      ),
    ).toBeInTheDocument();
    // PriceRangeBadge é quem formata o preço — nunca o card diretamente.
    expect(screen.getByText(/aproximado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aprovar este destino" }),
    ).toBeInTheDocument();
  });

  it("T06 (hospedagem): subtitle/tipo, característica distintiva, PriceRangeBadge por diária e ações 'Aprovar'/'Ajustar'", () => {
    const onApprove = vi.fn();
    const onAdjust = vi.fn();

    render(
      <SuggestionCard
        title="Pousada Vista Verde"
        subtitle="Pousada"
        description="Piscina natural e café da manhã incluso."
        price={{ min: 250, max: 250, unitLabel: "por diária" }}
        actions={
          <>
            <Button type="button" onClick={onApprove}>
              Aprovar
            </Button>
            <Button type="button" variant="outline" onClick={onAdjust}>
              Ajustar
            </Button>
          </>
        }
      />,
    );

    expect(screen.getByText("Pousada")).toBeInTheDocument();
    expect(screen.getByText(/por diária/i)).toBeInTheDocument();
    expect(screen.getByText(/aproximado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajustar" })).toBeInTheDocument();
  });

  it("T07 (passeios): checkbox (leading), duração (meta), badge 'Gratuito' e ação 'Remover'", () => {
    render(
      <SuggestionCard
        title="Trilha do Poço Encantado"
        meta="Duração aproximada: 3h"
        price={{ min: 0, max: 0, free: true }}
        leading={
          <input
            type="checkbox"
            defaultChecked
            aria-label="Incluir Trilha do Poço Encantado no roteiro"
          />
        }
        actions={<Button type="button" variant="outline">Remover</Button>}
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Incluir Trilha do Poço Encantado no roteiro",
      }),
    ).toBeChecked();
    expect(screen.getByText("Duração aproximada: 3h")).toBeInTheDocument();
    // Caso gratuito (RF-07.2): "Gratuito", nunca "R$ 0,00"/"aproximado".
    expect(screen.getByText("Gratuito")).toBeInTheDocument();
    expect(screen.queryByText(/aproximado/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });

  it("mantém a mesma estrutura de container (surface + borda, sem sombra) entre os 3 usos", () => {
    const classNameOf = (ui: ReactElement) => {
      const { container } = render(ui);
      const className = container.firstElementChild?.className;
      cleanup();
      return className;
    };

    const destino = classNameOf(
      <SuggestionCard title="Destino" price={{ min: 100, max: 200 }} />,
    );
    const hospedagem = classNameOf(
      <SuggestionCard title="Hospedagem" price={{ min: 100, max: 200 }} />,
    );
    const passeio = classNameOf(
      <SuggestionCard title="Passeio" price={{ min: 0, max: 0, free: true }} />,
    );

    expect(destino).toBe(hospedagem);
    expect(hospedagem).toBe(passeio);
    expect(destino).toContain("border-border");
    expect(destino).toContain("bg-surface");
    expect(destino).not.toContain("shadow");
  });

  it("navegação por teclado: Tab alcança checkbox e ações do card, em ordem, sem armadilha de foco", async () => {
    const user = userEvent.setup();

    render(
      <SuggestionCard
        title="Trilha do Poço Encantado"
        price={{ min: 0, max: 0, free: true }}
        leading={<input type="checkbox" aria-label="Incluir passeio" />}
        actions={
          <Button type="button" variant="outline">
            Remover
          </Button>
        }
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Incluir passeio" });
    const removeButton = screen.getByRole("button", { name: "Remover" });

    await user.tab();
    expect(checkbox).toHaveFocus();

    await user.tab();
    expect(removeButton).toHaveFocus();
  });

  it("não renderiza área de ações quando `actions` está ausente, sem quebrar a estrutura", () => {
    render(<SuggestionCard title="Sem ações ainda" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Sem ações ainda")).toBeInTheDocument();
  });

  // V2-L2-T05 — `media`/`eyebrow` (RF-15, UX-SPEC.md §8.2 T04).
  describe("com `media` (T04)", () => {
    it("imagem curada: renderiza a foto, o selo 'imagem ilustrativa' e o crédito de autor/fonte (RF-15.5)", () => {
      render(
        <SuggestionCard
          title="Gramado"
          eyebrow="Combina com o seu período porque…"
          media={{
            imagem: imagemCurada,
            alt: "Imagem ilustrativa de Gramado",
            showIllustrativeTag: true,
          }}
        />,
      );

      expect(
        screen.getByRole("img", { name: "Imagem ilustrativa de Gramado" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Imagem ilustrativa")).toBeInTheDocument();
      expect(
        screen.getByText("Combina com o seu período porque…"),
      ).toBeInTheDocument();

      const autorLink = screen.getByRole("link", { name: "Jane Doe" });
      expect(autorLink).toHaveAttribute(
        "href",
        "https://unsplash.com/@janedoe",
      );
      const fonteLink = screen.getByRole("link", { name: "Unsplash" });
      expect(fonteLink).toHaveAttribute(
        "href",
        "https://unsplash.com/photos/abc123",
      );
    });

    it("fallback: não exibe crédito nem selo 'imagem ilustrativa' — 'porque não é foto' (UX-SPEC §8.2)", () => {
      render(
        <SuggestionCard
          title="Gramado"
          media={{
            imagem: imagemFallback,
            alt: "Imagem ilustrativa de Gramado",
            showIllustrativeTag: true,
          }}
        />,
      );

      expect(
        screen.getByTestId("destination-fallback-art"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Imagem ilustrativa")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("nunca usa 'foto do local' no alt (WCAG/RF-15.6)", () => {
      render(
        <SuggestionCard
          title="Gramado"
          media={{ imagem: imagemCurada, alt: "Imagem ilustrativa de Gramado" }}
        />,
      );

      const img = screen.getByRole("img", {
        name: "Imagem ilustrativa de Gramado",
      });
      expect(img.getAttribute("alt")).not.toMatch(/foto do local/i);
    });

    it("sem `media` (T06/T07): não renderiza `DestinationImage`/crédito, layout inalterado", () => {
      render(<SuggestionCard title="Pousada Vista Verde" />);
      expect(
        screen.queryByTestId("destination-image-frame"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("destination-fallback-art"),
      ).not.toBeInTheDocument();
    });
  });
});
