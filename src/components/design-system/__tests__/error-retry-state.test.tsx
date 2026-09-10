import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorRetryState } from "@/components/design-system/error-retry-state";

afterEach(() => cleanup());

describe("ErrorRetryState", () => {
  it("exibe a mensagem de erro com ícone (não só texto/cor) e o CTA de retry", () => {
    render(
      <ErrorRetryState
        message="Não conseguimos gerar sugestões agora — tentar novamente"
        onRetry={() => {}}
      />,
    );

    expect(
      screen.getByText("Não conseguimos gerar sugestões agora — tentar novamente"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("chama onRetry ao clicar no CTA, e não dispara retry sozinho", async () => {
    const onRetry = vi.fn();
    render(<ErrorRetryState message="Falha ao gerar." onRetry={onRetry} />);

    expect(onRetry).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Sem clique adicional, nenhuma nova chamada acontece sozinha.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("aceita rótulo de retry customizado", () => {
    render(
      <ErrorRetryState
        message="Falha ao gerar."
        onRetry={() => {}}
        retryLabel="Gerar novamente"
      />,
    );
    expect(screen.getByRole("button", { name: "Gerar novamente" })).toBeInTheDocument();
  });
});
