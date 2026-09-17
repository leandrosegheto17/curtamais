// V2-L4-T07 — Testes de `FaqSection` (UX-SPEC.md §8.2 T-HOME item 7, RNF-11).
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaqSection } from "@/components/home/faq-section";

afterEach(() => cleanup());

describe("FaqSection (V2-L4-T07)", () => {
  it("renderiza as 5 perguntas do UX-SPEC.md §8.2 item 7", () => {
    render(<FaqSection />);

    expect(screen.getByText("Quem monta o roteiro?")).toBeInTheDocument();
    expect(screen.getByText("Vocês fazem reservas?")).toBeInTheDocument();
    expect(screen.getByText("Os preços são reais?")).toBeInTheDocument();
    expect(screen.getByText("Preciso criar conta?")).toBeInTheDocument();
    expect(screen.getByText("O que vocês fazem com o meu e-mail?")).toBeInTheDocument();
  });

  it("identifica o assistente como IA (RNF-11), texto visível e não só em aria-label", () => {
    render(<FaqSection />);

    expect(
      screen.getByText(
        "Eu, um assistente de inteligência artificial. Não há uma pessoa do outro lado, e eu posso errar: confira os detalhes antes de reservar.",
      ),
    ).toBeInTheDocument();
  });

  it("todos os `<details>` ficam fechados por padrão", () => {
    render(<FaqSection />);

    const detalhes = document.querySelectorAll("details");
    expect(detalhes.length).toBe(5);
    detalhes.forEach((detail) => {
      expect(detail).not.toHaveAttribute("open");
    });
  });

  it("cada pergunta é um `summary` dentro do `details` correspondente", () => {
    render(<FaqSection />);

    const summary = screen.getByText("Vocês fazem reservas?").closest("summary");
    expect(summary).not.toBeNull();
    expect(summary?.closest("details")).not.toHaveAttribute("open");
  });
});
