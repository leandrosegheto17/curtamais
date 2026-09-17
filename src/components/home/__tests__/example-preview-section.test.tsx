// V2-L4-T05 — Testes de `ExamplePreviewSection` (UX-SPEC.md §8.2 T-HOME,
// item 5 "O que você recebe").
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExamplePreviewSection } from "@/components/home/example-preview-section";
import { roteiroExemplo } from "@/content/roteiro-exemplo";

afterEach(() => cleanup());

describe("ExamplePreviewSection (V2-L4-T05)", () => {
  it("renderiza o título da seção", () => {
    render(<ExamplePreviewSection />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Um roteiro pronto, com hora e motivo.",
      }),
    ).toBeInTheDocument();
  });

  it("mostra o `ExampleBadge`", () => {
    render(<ExamplePreviewSection />);
    expect(screen.getByText("Roteiro de exemplo")).toBeInTheDocument();
  });

  it("mostra a prévia do Dia 1 do roteiro de exemplo, do mesmo arquivo de V2-L3-T01", () => {
    render(<ExamplePreviewSection />);

    const dia1 = roteiroExemplo.days[0];
    expect(
      screen.getByRole("heading", { level: 2, name: dia1.dayLabel }),
    ).toBeInTheDocument();

    // Uma atividade de cada período do Dia 1, para confirmar que o conteúdo
    // vem do fixture (não duplicado/reescrito aqui).
    expect(
      screen.getByText("Chegada em Gramado e check-in na pousada"),
    ).toBeInTheDocument();
    expect(screen.getByText("Caminhada pela Rua Coberta")).toBeInTheDocument();
    expect(screen.getByText("Jantar de fondue no centro")).toBeInTheDocument();

    // Modo leitura (T-EX): sem botão de acordeão, dia sempre visível.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("mostra a nota fixa de faixa aproximada (RF-12.3)", () => {
    render(<ExamplePreviewSection />);
    expect(
      screen.getByText(
        "Os preços que eu sugiro são faixas aproximadas, não cotações.",
      ),
    ).toBeInTheDocument();
  });

  it('CTA "Ver o roteiro de exemplo completo" leva a /roteiro-exemplo (T-EX)', () => {
    render(<ExamplePreviewSection />);
    const cta = screen.getByRole("link", {
      name: "Ver o roteiro de exemplo completo",
    });
    expect(cta).toHaveAttribute("href", "/roteiro-exemplo");
  });
});
