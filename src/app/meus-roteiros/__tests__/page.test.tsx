import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((..._args: unknown[]) => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const getServerSessionMock = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const listarMeusRoteirosMock = vi.fn();
vi.mock("@/lib/actions/meus-roteiros", () => ({
  listarMeusRoteiros: (...args: unknown[]) => listarMeusRoteirosMock(...args),
}));

vi.mock("@/app/meus-roteiros/meus-roteiros-client", () => ({
  MeusRoteirosClient: ({
    sessoes,
    email,
  }: {
    sessoes: unknown[];
    email: string | null;
  }) => (
    <div data-testid="meus-roteiros-client">
      <span data-testid="sessoes-count">{sessoes.length}</span>
      <span data-testid="email">{email ?? ""}</span>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MeusRoteirosPage (rota T-MEUS, V2-L8-T04, RF-17)", () => {
  it("redireciona para /entrar?retorno=/meus-roteiros quando não há conta autenticada", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    const MeusRoteirosPage = (await import("@/app/meus-roteiros/page")).default;

    await expect(MeusRoteirosPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/entrar?retorno=/meus-roteiros");
    expect(listarMeusRoteirosMock).not.toHaveBeenCalled();
  });

  it("com conta autenticada, renderiza MeusRoteirosClient com a lista e o e-mail", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "viajante@example.com" },
    });
    listarMeusRoteirosMock.mockResolvedValueOnce({
      status: "ok",
      sessoes: [
        {
          id: "session-1",
          flowState: "hospedagem_pendente",
          dateRangeStart: null,
          dateRangeEnd: new Date("2026-10-12"),
          updatedAt: new Date("2026-09-16"),
          destinationName: "Gramado",
          rotulo: "Em andamento — na etapa hospedagem",
        },
      ],
    });
    const MeusRoteirosPage = (await import("@/app/meus-roteiros/page")).default;

    render(await MeusRoteirosPage());

    expect(screen.getByTestId("sessoes-count")).toHaveTextContent("1");
    expect(screen.getByTestId("email")).toHaveTextContent(
      "viajante@example.com",
    );
  });

  it("trata resultado nao_autenticado defensivamente como lista vazia (não deveria ocorrer, guard já redirecionou)", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "viajante@example.com" },
    });
    listarMeusRoteirosMock.mockResolvedValueOnce({ status: "nao_autenticado" });
    const MeusRoteirosPage = (await import("@/app/meus-roteiros/page")).default;

    render(await MeusRoteirosPage());

    expect(screen.getByTestId("sessoes-count")).toHaveTextContent("0");
  });
});
