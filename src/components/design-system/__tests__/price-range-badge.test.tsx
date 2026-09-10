import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PriceRangeBadge } from "@/components/design-system/price-range-badge";

afterEach(() => cleanup());

describe("PriceRangeBadge (UX-SPEC.md Seção 3/§4/§5, RNF-01/RN-05)", () => {
  it("sempre mostra o texto 'aproximado' junto ao valor para uma faixa normal", () => {
    render(<PriceRangeBadge min={100} max={200} />);
    expect(screen.getByText(/aproximado/i)).toBeInTheDocument();
  });

  it("sempre renderiza um ícone (svg) junto ao texto, nunca só o valor isolado", () => {
    const { container } = render(<PriceRangeBadge min={100} max={200} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("formata a faixa em BRL, min e max distintos", () => {
    render(<PriceRangeBadge min={1500} max={3000} />);
    const text = screen.getByText(/aproximado/i).textContent ?? "";
    expect(text).toMatch(/R\$\s*1\.500/);
    expect(text).toMatch(/R\$\s*3\.000/);
  });

  it("quando min === max, mostra um único valor (ainda com ícone + 'aproximado')", () => {
    render(<PriceRangeBadge min={500} max={500} />);
    const text = screen.getByText(/aproximado/i).textContent ?? "";
    expect(text).toMatch(/R\$\s*500/);
    expect(text).not.toMatch(/–/);
  });

  it("aplica unitLabel opcional entre o valor e '(aproximado)'", () => {
    render(<PriceRangeBadge min={100} max={200} unitLabel="por diária" />);
    expect(screen.getByText(/por diária \(aproximado\)/i)).toBeInTheDocument();
  });

  it("caso gratuito explícito (free=true): mostra 'Gratuito', nunca 'R$ 0' nem 'aproximado'", () => {
    render(<PriceRangeBadge min={0} max={0} free />);
    expect(screen.getByText("Gratuito")).toBeInTheDocument();
    expect(screen.queryByText(/aproximado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("caso gratuito inferido (min=0, max=0, sem prop free): também mostra 'Gratuito'", () => {
    render(<PriceRangeBadge min={0} max={0} />);
    expect(screen.getByText("Gratuito")).toBeInTheDocument();
  });

  it("mantém o ícone presente mesmo no caso gratuito (nenhuma informação só por texto sem ícone)", () => {
    const { container } = render(<PriceRangeBadge min={0} max={0} free />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("free=false com valores normais não força o caso gratuito", () => {
    render(<PriceRangeBadge min={50} max={100} free={false} />);
    expect(screen.queryByText("Gratuito")).not.toBeInTheDocument();
    expect(screen.getByText(/aproximado/i)).toBeInTheDocument();
  });
});
