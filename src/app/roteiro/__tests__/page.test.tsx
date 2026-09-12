import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

// `RoteiroScreen` (L10-T02) é uma tela client-side completa com suas
// próprias dependências (streaming, Server Actions de L10-T03) — a rota só
// precisa confirmar que resolve/propaga o `sessionId` corretamente, então o
// componente é substituído por um dublê mínimo (mesma estratégia usada para
// isolar rotas finas dos componentes de tela que elas montam).
vi.mock("@/components/roteiro/roteiro-screen", () => ({
  RoteiroScreen: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="roteiro-screen">{sessionId}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoteiroPage (rota T08, L12-T03)", () => {
  it("renderiza RoteiroScreen com o sessionId recebido via querystring", async () => {
    const RoteiroPage = (await import("@/app/roteiro/page")).default;

    render(
      await RoteiroPage({
        searchParams: Promise.resolve({ sessionId: "session-1" }),
      }),
    );

    expect(screen.getByTestId("roteiro-screen")).toHaveTextContent(
      "session-1",
    );
  });

  it("redireciona para a home quando sessionId está ausente", async () => {
    const RoteiroPage = (await import("@/app/roteiro/page")).default;

    await expect(
      RoteiroPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
