import type { ReactElement } from "react";

import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuggestionCard } from "@/components/design-system/suggestion-card";
import { Button } from "@/components/ui/button";

afterEach(() => cleanup());

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
});
