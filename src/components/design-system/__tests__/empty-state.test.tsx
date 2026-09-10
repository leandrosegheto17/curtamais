import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/design-system/empty-state";

afterEach(() => cleanup());

describe("EmptyState", () => {
  it("renderiza título e descrição", () => {
    render(
      <EmptyState
        title="Nenhuma sugestão aprovada"
        description="Você rejeitou todas as opções de destino."
      />,
    );

    expect(screen.getByText("Nenhuma sugestão aprovada")).toBeInTheDocument();
    expect(
      screen.getByText("Você rejeitou todas as opções de destino."),
    ).toBeInTheDocument();
  });

  it("renderiza sem descrição quando não informada", () => {
    render(<EmptyState title="Nenhum resultado" />);
    expect(screen.getByText("Nenhum resultado")).toBeInTheDocument();
  });

  it("renderiza as ações (ex. RF-04.4: nova rodada ou entrada manual) e dispara o callback correspondente ao clique", async () => {
    const onNovaRodada = vi.fn();
    const onEntradaManual = vi.fn();

    render(
      <EmptyState
        title="Nenhuma sugestão aprovada"
        actions={[
          { label: "Gerar novas sugestões", onClick: onNovaRodada },
          { label: "Informar destino manualmente", onClick: onEntradaManual },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Informar destino manualmente" }),
    );
    expect(onEntradaManual).toHaveBeenCalledTimes(1);
    expect(onNovaRodada).not.toHaveBeenCalled();
  });

  it("não renderiza nenhum botão quando `actions` está ausente", () => {
    render(<EmptyState title="Nenhum resultado" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
