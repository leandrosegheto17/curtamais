import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
  useRouter: () => ({ refresh: refreshMock }),
}));

const obterChecklistMock = vi.fn();
vi.mock("@/lib/actions/checklist", () => ({
  obterChecklist: (...args: unknown[]) => obterChecklistMock(...args),
  marcarItemChecklist: vi.fn(),
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

  describe("checklist (V2-L9-T12)", () => {
    const resumoConcluido = {
      destino: { name: "Gramado" },
      hospedagem: { name: "Hotel Serra", type: "Hotel" },
      passeios: [{ name: "Mini Mundo", free: false }],
      roteiroAprovado: true,
      temConta: true,
    };
    const dias = [
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
    ];

    async function renderPage() {
      const Page = (await import("@/app/meus-roteiros/[sessionId]/page"))
        .default;
      render(
        await Page({ params: Promise.resolve({ sessionId: "session-1" }) }),
      );
    }

    it("sessão concluída mostra o checklist abaixo dos dias", async () => {
      obterResumoEncerramentoMock.mockResolvedValueOnce(resumoConcluido);
      obterRoteiroLeituraMock.mockResolvedValueOnce(dias);
      obterChecklistMock.mockResolvedValueOnce({
        status: "ok",
        avisos: [],
        itens: [
          {
            itemKey: "docs.rg",
            categoria: "documentos",
            texto: "RG ou CNH",
            marcado: true,
          },
        ],
      });
      await renderPage();

      const painel = screen.getByRole("heading", {
        name: "Checklist de bagagem e documentos",
      });
      const roteiro = screen.getByText("Café colonial");
      expect(
        roteiro.compareDocumentPosition(painel) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(obterChecklistMock).toHaveBeenCalledWith("session-1");
    });

    it("encerrada parcial não chama nem renderiza o checklist", async () => {
      obterResumoEncerramentoMock.mockResolvedValueOnce({
        ...resumoConcluido,
        hospedagem: null,
        passeios: null,
        roteiroAprovado: false,
      });
      await renderPage();

      expect(obterChecklistMock).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Checklist de bagagem e documentos"),
      ).not.toBeInTheDocument();
    });

    it("falha em obterChecklist isola o erro no painel e mantém o roteiro", async () => {
      obterResumoEncerramentoMock.mockResolvedValueOnce(resumoConcluido);
      obterRoteiroLeituraMock.mockResolvedValueOnce(dias);
      obterChecklistMock.mockRejectedValueOnce(new Error("db fora"));
      await renderPage();

      expect(
        screen.getByText("Não consegui carregar o checklist agora."),
      ).toBeInTheDocument();
      expect(screen.getByText("Café colonial")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      [{ status: "indisponivel" }],
      [{ status: "conta_necessaria", sessionId: "session-1" }],
    ])("%j não renderiza o painel nem quebra a rota", async (resultado) => {
      obterResumoEncerramentoMock.mockResolvedValueOnce(resumoConcluido);
      obterRoteiroLeituraMock.mockResolvedValueOnce(dias);
      obterChecklistMock.mockResolvedValueOnce(resultado);
      await renderPage();

      expect(screen.getByText("Café colonial")).toBeInTheDocument();
      expect(
        screen.queryByText("Checklist de bagagem e documentos"),
      ).not.toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
