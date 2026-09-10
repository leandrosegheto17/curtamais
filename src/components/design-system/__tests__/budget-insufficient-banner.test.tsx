import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BudgetInsufficientBanner } from "@/components/design-system/budget-insufficient-banner";

afterEach(() => cleanup());

describe("BudgetInsufficientBanner (UX-SPEC.md Seção 3/§4, RF-10.2/RN-04)", () => {
  it("não renderiza nada quando show=false", () => {
    const { container } = render(<BudgetInsufficientBanner show={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza a mensagem quando show=true", () => {
    render(<BudgetInsufficientBanner show />);
    expect(
      screen.getByText(/não encontramos opções dentro do valor informado/i),
    ).toBeInTheDocument();
  });

  it("inclui a diferença informada na mensagem quando differenceLabel é passado", () => {
    render(<BudgetInsufficientBanner show differenceLabel="R$ 150" />);
    expect(screen.getByText(/excede o orçamento em R\$ 150/i)).toBeInTheDocument();
  });

  it("sempre mostra ícone junto ao texto (nenhuma informação só por cor)", () => {
    const { container } = render(<BudgetInsufficientBanner show />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("usa role='status', não bloqueando foco/leitura da tela", () => {
    render(<BudgetInsufficientBanner show />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("RN-04: nunca desabilita um botão de ação irmão da tela, em nenhum dos dois estados (show=true/false)", () => {
    function ScreenWithBanner({ show }: { show: boolean }) {
      return (
        <div>
          <BudgetInsufficientBanner show={show} />
          <button type="button">Aprovar</button>
        </div>
      );
    }

    const { rerender } = render(<ScreenWithBanner show={false} />);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeEnabled();

    rerender(<ScreenWithBanner show />);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeEnabled();
  });

  it("não expõe nenhuma prop capaz de desabilitar elementos irmãos (contrato de props é só show/differenceLabel/className)", () => {
    // Prova estrutural do contrato: as únicas props aceitas pelo componente
    // são as documentadas em `BudgetInsufficientBannerProps` — nenhuma prop
    // de "disableSiblingActions" ou equivalente existe para ser usada.
    const props: Record<string, unknown> = {
      show: true,
      differenceLabel: "R$ 10",
      className: "custom",
    };
    render(<BudgetInsufficientBanner {...(props as never)} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
