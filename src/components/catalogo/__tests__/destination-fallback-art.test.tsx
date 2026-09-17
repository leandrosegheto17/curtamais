// V2-L2-T03 — Testes de `DestinationFallbackArt` e da paleta de fallback
// (RF-15.2/15.3, RNF-09).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DestinationFallbackArt } from "@/components/catalogo/destination-fallback-art";
import { PALETA_FALLBACK } from "@/lib/catalogo/resolver-imagem";

afterEach(() => cleanup());

// --- Utilitário de contraste WCAG (fórmula de luminância relativa, WCAG 2.x) ---

function hexParaRgb(hex: string): [number, number, number] {
  const normalizado = hex.replace("#", "");
  const r = parseInt(normalizado.substring(0, 2), 16);
  const g = parseInt(normalizado.substring(2, 4), 16);
  const b = parseInt(normalizado.substring(4, 6), 16);
  return [r, g, b];
}

function canalParaLinear(canal: number): number {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexParaRgb(hex).map(canalParaLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores hex: (L1 + 0.05) / (L2 + 0.05), L1 >= L2. */
function contraste(corA: string, corB: string): number {
  const lA = luminanciaRelativa(corA);
  const lB = luminanciaRelativa(corB);
  const [maior, menor] = lA >= lB ? [lA, lB] : [lB, lA];
  return (maior + 0.05) / (menor + 0.05);
}

const FAFAFA = "#FAFAFA";
const CONTRASTE_MINIMO = 4.5;

describe("PALETA_FALLBACK (resolver-imagem.ts) — contraste com #FAFAFA (RNF-09)", () => {
  it("tem exatamente 8 pares de cor", () => {
    expect(PALETA_FALLBACK).toHaveLength(8);
  });

  it.each(PALETA_FALLBACK.map((par, indice) => ({ ...par, indice })))(
    "gradiente %#: corInicio e corFim têm contraste >= 4.5:1 com #FAFAFA",
    ({ corInicio, corFim, indice }) => {
      const contrasteInicio = contraste(corInicio, FAFAFA);
      const contrasteFim = contraste(corFim, FAFAFA);

      expect(
        contrasteInicio,
        `gradiente ${indice}: corInicio (${corInicio}) contraste ${contrasteInicio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(
        contrasteFim,
        `gradiente ${indice}: corFim (${corFim}) contraste ${contrasteFim.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    },
  );
});

describe("DestinationFallbackArt", () => {
  const gradienteExemplo = {
    corInicio: "#1E3A8A",
    corFim: "#172554",
    anguloGraus: 135,
    inicial: "G",
  };

  it("renderiza o gradiente e a inicial", () => {
    render(<DestinationFallbackArt {...gradienteExemplo} />);
    expect(screen.getByText("G")).toBeInTheDocument();

    const art = screen.getByTestId("destination-fallback-art");
    expect(art).toHaveStyle({
      background: "linear-gradient(135deg, #1E3A8A, #172554)",
    });
  });

  it("é decorativo (aria-hidden) quando ariaLabel não é informado", () => {
    render(<DestinationFallbackArt {...gradienteExemplo} />);
    const art = screen.getByTestId("destination-fallback-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art).not.toHaveAttribute("role");
  });

  it("é informativo (role=img + aria-label) quando ariaLabel é informado (RF-15.6)", () => {
    render(
      <DestinationFallbackArt
        {...gradienteExemplo}
        ariaLabel="Imagem ilustrativa de Gramado"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Imagem ilustrativa de Gramado" }),
    ).toBeInTheDocument();
  });

  it("preenche 100% do contêiner do chamador, sem altura própria (evita CLS)", () => {
    const { container } = render(<DestinationFallbackArt {...gradienteExemplo} />);
    const art = container.querySelector('[data-testid="destination-fallback-art"]');
    expect(art?.className).toContain("h-full");
    expect(art?.className).toContain("w-full");
  });
});
