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

class SessionNotFoundError extends Error {}

vi.mock("@/lib/session-flow", () => ({
  SessionNotFoundError,
}));

// `EncerramentoScreen` (L10-T04) é uma tela de apresentação pura com suas
// próprias dependências — a rota só precisa confirmar que resolve o
// `flowState`/`resumo` corretamente, então o componente é substituído por um
// dublê mínimo (mesma estratégia usada para isolar rotas finas dos
// componentes de tela que elas montam, ver `roteiro/page.test.tsx`).
vi.mock("@/components/encerramento/encerramento-screen", () => ({
  EncerramentoScreen: ({
    flowState,
    resumo,
  }: {
    flowState: string;
    resumo: { destino?: { name: string } | null };
  }) => (
    <div data-testid="encerramento-screen">
      <span data-testid="flow-state">{flowState}</span>
      <span data-testid="resumo-destino">{resumo.destino?.name ?? ""}</span>
    </div>
  ),
}));

const RESUMO_MOCK = {
  destino: { name: "Gramado" },
  hospedagem: null,
  passeios: null,
  roteiroAprovado: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EncerramentoPage (rota T-END, L12-T05)", () => {
  it("renderiza EncerramentoScreen com o resumo para flowState=concluida", async () => {
    obterResumoEncerramentoMock.mockResolvedValueOnce(RESUMO_MOCK);
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    render(
      await EncerramentoPage({
        searchParams: Promise.resolve({
          sessionId: "session-1",
          flowState: "concluida",
        }),
      }),
    );

    expect(obterResumoEncerramentoMock).toHaveBeenCalledWith("session-1");
    expect(screen.getByTestId("flow-state")).toHaveTextContent("concluida");
    expect(screen.getByTestId("resumo-destino")).toHaveTextContent("Gramado");
  });

  it("renderiza EncerramentoScreen com o resumo para flowState=encerrada_parcial", async () => {
    obterResumoEncerramentoMock.mockResolvedValueOnce(RESUMO_MOCK);
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    render(
      await EncerramentoPage({
        searchParams: Promise.resolve({
          sessionId: "session-1",
          flowState: "encerrada_parcial",
        }),
      }),
    );

    expect(screen.getByTestId("flow-state")).toHaveTextContent(
      "encerrada_parcial",
    );
  });

  it("redireciona para a home quando sessionId está ausente", async () => {
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    await expect(
      EncerramentoPage({
        searchParams: Promise.resolve({ flowState: "concluida" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(obterResumoEncerramentoMock).not.toHaveBeenCalled();
  });

  it("redireciona para a home quando flowState está ausente", async () => {
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    await expect(
      EncerramentoPage({
        searchParams: Promise.resolve({ sessionId: "session-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redireciona para a home quando flowState é inválido", async () => {
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    await expect(
      EncerramentoPage({
        searchParams: Promise.resolve({
          sessionId: "session-1",
          flowState: "xyz",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(obterResumoEncerramentoMock).not.toHaveBeenCalled();
  });

  it("redireciona para a home quando a sessão não existe/não pertence ao requisitante", async () => {
    obterResumoEncerramentoMock.mockRejectedValueOnce(
      new SessionNotFoundError("session-1"),
    );
    const EncerramentoPage = (await import("@/app/encerramento/page"))
      .default;

    await expect(
      EncerramentoPage({
        searchParams: Promise.resolve({
          sessionId: "session-1",
          flowState: "concluida",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
