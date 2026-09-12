import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Rota fina (L12-T01): só valida `sessionId` e delega para
// `HospedagemSugestoesScreen` (L8-T02, já coberta por seus próprios testes
// em `src/components/hospedagem/__tests__/hospedagem-sugestoes-screen.test.tsx`).
// Aqui o componente de tela é substituído por um dublê para isolar o
// comportamento de roteamento (mesmo padrão de foco usado nos testes de
// `src/app/destino/confirmacao/__tests__/page.test.tsx`, adaptado para não
// exigir a Server Action real de hospedagem).
const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/components/hospedagem/hospedagem-sugestoes-screen", () => ({
  HospedagemSugestoesScreen: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="hospedagem-sugestoes-screen">{sessionId}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HospedagemSugestoesPage (rota T06, L12-T01, RF-06)", () => {
  it("renderiza HospedagemSugestoesScreen com o sessionId recebido via querystring", async () => {
    const HospedagemSugestoesPage = (await import("@/app/hospedagem/page"))
      .default;

    render(
      await HospedagemSugestoesPage({
        searchParams: Promise.resolve({ sessionId: "session-1" }),
      }),
    );

    expect(screen.getByTestId("hospedagem-sugestoes-screen")).toHaveTextContent(
      "session-1",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redireciona para a home quando sessionId está ausente", async () => {
    const HospedagemSugestoesPage = (await import("@/app/hospedagem/page"))
      .default;

    await expect(
      HospedagemSugestoesPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
