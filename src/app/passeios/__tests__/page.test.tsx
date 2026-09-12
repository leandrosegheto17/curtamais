import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Rota fina (L12-T02): só valida `sessionId` e delega para
// `PasseiosSugestoesScreen` (L9-T02, já coberta por seus próprios testes em
// `src/components/passeios/__tests__/passeios-sugestoes-screen.test.tsx`).
// Aqui o componente de tela é substituído por um dublê para isolar o
// comportamento de roteamento (mesmo padrão de
// `src/app/hospedagem/__tests__/page.test.tsx`, L12-T01) — as Server Actions
// reais de `@/lib/actions/passeios` também são mockadas para não exigir
// banco/sessão real neste teste de rota.
const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock("@/lib/actions/passeios", () => ({
  gerarSugestoesPasseios: vi.fn(),
  aprovarSelecaoPasseios: vi.fn(),
  encerrarResolucaoPasseios: vi.fn(),
}));

vi.mock("@/components/passeios/passeios-sugestoes-screen", () => ({
  PasseiosSugestoesScreen: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="passeios-sugestoes-screen">{sessionId}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PasseiosSugestoesPage (rota T07, L12-T02, RF-07)", () => {
  it("renderiza PasseiosSugestoesScreen com o sessionId recebido via querystring", async () => {
    const PasseiosSugestoesPage = (await import("@/app/passeios/page"))
      .default;

    render(
      await PasseiosSugestoesPage({
        searchParams: Promise.resolve({ sessionId: "session-1" }),
      }),
    );

    expect(
      screen.getByTestId("passeios-sugestoes-screen"),
    ).toHaveTextContent("session-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redireciona para a home quando sessionId está ausente", async () => {
    const PasseiosSugestoesPage = (await import("@/app/passeios/page"))
      .default;

    await expect(
      PasseiosSugestoesPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
