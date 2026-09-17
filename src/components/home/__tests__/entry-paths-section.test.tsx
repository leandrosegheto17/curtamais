// V2-L4-T02 — Testes de `EntryPathsSection` (RF-12.1 item 2; UX-SPEC.md §8.2
// T-HOME item 2).
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EntryPathsSection } from "@/components/home/entry-paths-section";
import { ENTRY_PATHS } from "@/components/entrada/entry-paths";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("EntryPathsSection (V2-L4-T02)", () => {
  it("renderiza a seção com id=\"caminhos\" e o título", () => {
    render(<EntryPathsSection />);

    expect(document.querySelector("section#caminhos")).not.toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Três jeitos de começar, o mesmo roteiro no fim",
      }),
    ).toBeInTheDocument();
  });

  it("renderiza os 3 caminhos de ENTRY_PATHS, todos com o mesmo estilo de bloco (peso igual, nenhum pré-selecionado)", () => {
    render(<EntryPathsSection />);

    const links = ENTRY_PATHS.map(({ title, href }) => {
      const link = screen.getByRole("link", { name: new RegExp(title) });
      expect(link).toHaveAttribute("href", href);
      return link;
    });

    expect(links).toHaveLength(3);
    const [firstClassName, ...rest] = links.map((link) => link.className);
    rest.forEach((className) => expect(className).toBe(firstClassName));
  });

  it("não move o foco para o título quando a home é acessada sem o hash #caminhos", () => {
    render(<EntryPathsSection />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).not.toHaveFocus();
  });

  it("move o foco para o título quando a página chega com o hash #caminhos", () => {
    window.location.hash = "#caminhos";

    render(<EntryPathsSection />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveFocus();
  });
});
