import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const obterResumoEncerramentoMock = vi.fn();
vi.mock("@/lib/actions/encerramento", () => ({
  obterResumoEncerramento: (...args: unknown[]) =>
    obterResumoEncerramentoMock(...args),
}));

const obterRoteiroLeituraMock = vi.fn();
vi.mock("@/lib/actions/obter-roteiro-leitura", () => ({
  obterRoteiroLeitura: (...args: unknown[]) => obterRoteiroLeituraMock(...args),
}));

vi.mock("@/lib/session-flow", () => {
  class SessionNotFoundError extends Error {
    constructor(sessionId: string) {
      super(`Sessão "${sessionId}" não encontrada.`);
      this.name = "SessionNotFoundError";
    }
  }
  return { SessionNotFoundError };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RoteiroSalvoPage (rota T-MEUS-DET, V2-L8-T05, RF-17.5)", () => {
  it("sessão de outra conta/inexistente volta a T-MEUS com aviso", async () => {
    const { SessionNotFoundError } = await import("@/lib/session-flow");
    obterResumoEncerramentoMock.mockRejectedValueOnce(
      new SessionNotFoundError("session-x"),
    );

    const RoteiroSalvoPage = (
      await import("@/app/meus-roteiros/[sessionId]/page")
    ).default;

    await expect(
      RoteiroSalvoPage({ params: Promise.resolve({ sessionId: "session-x" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(
      "/meus-roteiros?erro=sessao-nao-encontrada",
    );
    expect(obterRoteiroLeituraMock).not.toHaveBeenCalled();
  });

  it("sessão concluída mostra o resumo e os dias do roteiro em modo leitura", async () => {
    obterResumoEncerramentoMock.mockResolvedValueOnce({
      destino: { name: "Gramado" },
      hospedagem: { name: "Hotel Serra", type: "Hotel" },
      passeios: [{ name: "Mini Mundo", free: false }],
      roteiroAprovado: true,
      temConta: true,
    });
    obterRoteiroLeituraMock.mockResolvedValueOnce([
      {
        date: "2026-06-12",
        morning: [
          {
            activity: "Café colonial",
            suggestedTime: "08h00",
            timingJustification: null,
            sequenceOrder: 0,
          },
        ],
        afternoon: [],
        evening: [],
      },
    ]);

    const RoteiroSalvoPage = (
      await import("@/app/meus-roteiros/[sessionId]/page")
    ).default;

    render(
      await RoteiroSalvoPage({
        params: Promise.resolve({ sessionId: "session-1" }),
      }),
    );

    expect(screen.getByText("Roteiro concluído")).toBeInTheDocument();
    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(screen.getByText("Seu roteiro")).toBeInTheDocument();
    expect(screen.getByText("Café colonial")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sessão encerrada sem roteiro mostra só o resumo, sem chamar obterRoteiroLeitura", async () => {
    obterResumoEncerramentoMock.mockResolvedValueOnce({
      destino: { name: "Gramado" },
      hospedagem: null,
      passeios: null,
      roteiroAprovado: false,
      temConta: true,
    });

    const RoteiroSalvoPage = (
      await import("@/app/meus-roteiros/[sessionId]/page")
    ).default;

    render(
      await RoteiroSalvoPage({
        params: Promise.resolve({ sessionId: "session-2" }),
      }),
    );

    expect(screen.getByText("Encerrada em destino")).toBeInTheDocument();
    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(
      screen.getByText("Esta viagem foi encerrada em destino."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Seu roteiro")).not.toBeInTheDocument();
    expect(obterRoteiroLeituraMock).not.toHaveBeenCalled();
  });
});
