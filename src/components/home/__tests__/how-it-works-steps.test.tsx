// V2-L4-T03 — Testes de `HowItWorksSteps` (UX-SPEC.md §8.2 T-HOME, item 3
// "Como funciona").
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HowItWorksSteps } from "@/components/home/how-it-works-steps";

afterEach(() => cleanup());

describe("HowItWorksSteps (V2-L4-T03)", () => {
  it("renderiza o título da seção", () => {
    render(<HowItWorksSteps />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Uma etapa de cada vez. Nada avança sem o seu ok.",
      }),
    ).toBeInTheDocument();
  });

  it("renderiza os 4 passos na ordem destino → hospedagem → passeios → roteiro", () => {
    render(<HowItWorksSteps />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);

    const titulos = items.map((item) => item.textContent);
    expect(titulos[0]).toContain("Destino");
    expect(titulos[1]).toContain("Hospedagem");
    expect(titulos[2]).toContain("Passeios");
    expect(titulos[3]).toContain("Roteiro");
  });

  it("usa os textos exatos do UX-SPEC.md §8.2 item 3 para cada passo", () => {
    render(<HowItWorksSteps />);

    expect(
      screen.getByText(
        "Separo de 2 a 4 destinos e digo por que cada um combina com o seu período.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Três opções, cada uma com o que ela tem de diferente."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Você tira o que não quiser; sempre incluo ao menos uma opção gratuita quando existe.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Dia a dia, manhã, tarde e noite, com o porquê de cada horário.",
      ),
    ).toBeInTheDocument();
  });
});
