// L6-T01 — T00 UI: Seleção de caminho de entrada (UX-SPEC.md Seção 2, RF-01/
// RF-02/RF-03).
//
// Cobre o critério de aceite: os 3 caminhos têm igual destaque visual (mesma
// classe de container), nenhum é pré-selecionado/priorizado, e cada um
// navega (via `next/link`, navegação de rota normal) para T01/T02/T03a.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import Home from "@/app/page";
import { ENTRY_PATH_CLASSNAME, ENTRY_PATHS } from "@/components/entrada/entry-paths";

afterEach(() => cleanup());

describe("T00 — Home (seleção de caminho de entrada)", () => {
  it("declara exatamente os 3 caminhos de UX-SPEC.md, na ordem esperada", () => {
    expect(ENTRY_PATHS).toHaveLength(3);
    expect(ENTRY_PATHS.map((path) => path.title)).toEqual([
      "Data livre",
      "Feriados prolongados",
      "Quiz guiado",
    ]);
  });

  it("renderiza os 3 caminhos com título, frase de 'quando usar' e link para a rota correta", () => {
    render(<Home />);

    const dataLivre = screen.getByRole("link", { name: /data livre/i });
    expect(dataLivre).toHaveAttribute("href", "/entrada/data-livre");
    expect(
      screen.getByText("Já sei quando posso viajar"),
    ).toBeInTheDocument();

    const feriados = screen.getByRole("link", {
      name: /feriados prolongados/i,
    });
    expect(feriados).toHaveAttribute("href", "/entrada/feriados");
    expect(screen.getByText("Quero aproveitar um feriado")).toBeInTheDocument();

    const quiz = screen.getByRole("link", { name: /quiz guiado/i });
    expect(quiz).toHaveAttribute("href", "/entrada/quiz");
    expect(
      screen.getByText("Não sei nem por onde começar"),
    ).toBeInTheDocument();
  });

  it("os 3 blocos têm exatamente a mesma classe de container — igual destaque visual, nenhum pré-selecionado", () => {
    render(<Home />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);

    const [first, ...rest] = links;
    for (const link of rest) {
      expect(link.className).toBe(first.className);
    }
    // Nenhuma marca de seleção/prioridade (aria-current, "selected", etc.).
    for (const link of links) {
      expect(link).not.toHaveAttribute("aria-current");
      expect(link.className).not.toMatch(/selected|active|primary/i);
    }
    expect(first.className).toBe(ENTRY_PATH_CLASSNAME);
  });

  it("é navegável por teclado, alcançando os 3 links em ordem via Tab", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const [dataLivre, feriados, quiz] = screen.getAllByRole("link");

    await user.tab();
    expect(dataLivre).toHaveFocus();
    await user.tab();
    expect(feriados).toHaveFocus();
    await user.tab();
    expect(quiz).toHaveFocus();
  });
});
