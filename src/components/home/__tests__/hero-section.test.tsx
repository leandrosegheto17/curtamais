// V2-L4-T01 — Testes de `HeroSection` (RF-12.1 item 1, RF-15.5, RNF-09).
import type { ImgHTMLAttributes } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroSection } from "@/components/home/hero-section";
import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";

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

describe("HeroSection (V2-L4-T01)", () => {
  it("usa o destino marcado `hero: true` no catálogo, mesmo sem foto curada (imagem: null é um estado válido, ADR-010)", () => {
    const destinoHero = CATALOGO_DESTINOS.find((destino) => destino.hero === true)!;
    render(<HeroSection />);

    if (destinoHero.imagem === null) {
      expect(screen.getByTestId("destination-fallback-art")).toBeInTheDocument();
    } else {
      const img = document.querySelector("img");
      expect(img?.getAttribute("src")).toBe(destinoHero.imagem.arquivo);
    }
  });

  it("título tem o segundo trecho em itálico e cor `accent` (UX-SPEC §8.2 item 1)", () => {
    render(<HeroSection />);

    const heading = screen.getByRole("heading", { level: 1 });
    const trechoDestacado = screen.getByText("Eu monto o roteiro com você.");
    expect(heading).toContainElement(trechoDestacado);
    expect(trechoDestacado.tagName).toBe("EM");
    expect(trechoDestacado).toHaveClass("text-accent");
  });

  it("os dois CTAs levam às rotas certas e têm altura mínima de toque 44px (RNF-04)", () => {
    render(<HeroSection />);

    const primario = screen.getByRole("link", { name: "Montar minha viagem" });
    expect(primario).toHaveAttribute("href", "#caminhos");
    expect(primario).toHaveClass("min-h-11");

    const secundario = screen.getByRole("link", { name: "Ver roteiro de exemplo" });
    expect(secundario).toHaveAttribute("href", "/roteiro-exemplo");
    expect(secundario).toHaveClass("min-h-11");
  });

  it("mostra a nota de confiabilidade abaixo dos CTAs (RF-12.2)", () => {
    render(<HeroSection />);

    expect(
      screen.getByText("Eu monto o plano; a reserva você faz onde preferir."),
    ).toBeInTheDocument();
  });

  it("não mostra crédito de foto quando o hero está no fallback (sem autor/fonte para creditar)", () => {
    const destinoHero = CATALOGO_DESTINOS.find((destino) => destino.hero === true)!;
    render(<HeroSection />);

    if (destinoHero.imagem === null) {
      expect(screen.queryByText(/^Foto:/)).not.toBeInTheDocument();
    }
  });

  it("a região do hero é identificável por `aria-label` (RF-12.1)", () => {
    render(<HeroSection />);
    expect(
      screen.getByRole("region", { name: "Destino em destaque" }),
    ).toBeInTheDocument();
  });
});
