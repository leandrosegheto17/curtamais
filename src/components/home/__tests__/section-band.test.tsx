// V2-L4-T01 — Testes de `SectionBand` (UX-SPEC.md §8.3, "N `SectionBand`").
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SectionBand } from "@/components/home/section-band";

afterEach(() => cleanup());

describe("SectionBand (V2-L4-T01)", () => {
  it("renderiza os filhos dentro de uma `section` com `id` (âncora)", () => {
    render(
      <SectionBand id="caminhos">
        <p>Conteúdo da seção</p>
      </SectionBand>,
    );

    const section = document.querySelector("section#caminhos");
    expect(section).not.toBeNull();
    expect(screen.getByText("Conteúdo da seção")).toBeInTheDocument();
  });

  it("título é opcional: sem `title`, não renderiza nenhum h2", () => {
    render(
      <SectionBand>
        <p>Sem título</p>
      </SectionBand>,
    );
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("com `title`, renderiza um h2 com o texto", () => {
    render(
      <SectionBand title="Três jeitos de começar, o mesmo roteiro no fim">
        <p>Conteúdo</p>
      </SectionBand>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Três jeitos de começar, o mesmo roteiro no fim" }),
    ).toBeInTheDocument();
  });

  it("`tone=\"deep\"` aplica o fundo `deep`; o padrão usa `background`", () => {
    const { container: deepContainer } = render(
      <SectionBand tone="deep">
        <p>Deep</p>
      </SectionBand>,
    );
    expect(deepContainer.querySelector("section")).toHaveClass("bg-deep");

    const { container: defaultContainer } = render(
      <SectionBand>
        <p>Default</p>
      </SectionBand>,
    );
    expect(defaultContainer.querySelector("section")).toHaveClass("bg-background");
  });
});
