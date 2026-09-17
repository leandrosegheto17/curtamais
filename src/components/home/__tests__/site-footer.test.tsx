// V2-L4-T07 — Testes de `SiteFooter` (UX-SPEC.md §8.2 T-HOME item 8).
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/home/site-footer";

afterEach(() => cleanup());

describe("SiteFooter (V2-L4-T07)", () => {
  it("renderiza o nome do produto e a linha de posicionamento", () => {
    render(<SiteFooter />);

    expect(document.querySelector("footer")).not.toBeNull();
    expect(screen.getByText("CurtaMais")).toBeInTheDocument();
    expect(
      screen.getByText("Eu monto o plano; a reserva você faz onde preferir."),
    ).toBeInTheDocument();
  });

  it("sem `imageCredits`, não quebra e não renderiza nada extra", () => {
    render(<SiteFooter />);
    expect(document.querySelector("#creditos")).toBeNull();
  });

  it("com `imageCredits`, renderiza o slot recebido", () => {
    render(<SiteFooter imageCredits={<div id="creditos">Créditos de imagem</div>} />);
    expect(screen.getByText("Créditos de imagem")).toBeInTheDocument();
  });
});
