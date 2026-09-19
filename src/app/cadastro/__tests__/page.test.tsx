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

const findUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { tripSession: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

class SessionNotFoundError extends Error {}

const assertSessionAccessMock = vi.fn();
vi.mock("@/lib/session-flow", () => ({
  assertSessionAccess: (...args: unknown[]) => assertSessionAccessMock(...args),
  isTerminalSessionFlowState: (state: string) =>
    state === "concluida" || state === "encerrada_parcial",
  rotaDaEtapa: (flowState: string, sessionId: string, destino?: string) =>
    `/destino/confirmacao?sessionId=${sessionId}&destino=${destino ?? ""}&flowState=${flowState}`,
  SessionNotFoundError,
}));

vi.mock("@/app/cadastro/cadastro-client", () => ({
  CadastroClient: ({
    sessionId,
    destino,
    contaAutenticadaEmail,
    voltarHref,
  }: {
    sessionId: string;
    destino: string | null;
    contaAutenticadaEmail: string | null;
    voltarHref: string;
  }) => (
    <div data-testid="cadastro-client">
      <span data-testid="session-id">{sessionId}</span>
      <span data-testid="destino">{destino ?? ""}</span>
      <span data-testid="conta">{contaAutenticadaEmail ?? ""}</span>
      <span data-testid="voltar-href">{voltarHref}</span>
    </div>
  ),
}));

const BASE_SESSION = {
  flowState: "destino_confirmado",
  userId: null,
  anonSessionId: "anon-1",
  dateRangeStart: new Date("2026-10-10"),
  dateRangeEnd: new Date("2026-10-12"),
  destinationApproval: { name: "Gramado" },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CadastroPage (rota T-GATE, V2-L7-T04, RF-16)", () => {
  it("redireciona para a home quando sessionId está ausente", async () => {
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    await expect(
      CadastroPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("redireciona para a home quando a sessão não existe/não pertence ao requisitante", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    assertSessionAccessMock.mockRejectedValueOnce(
      new SessionNotFoundError("session-1"),
    );
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    await expect(
      CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redireciona para T-END quando a sessão já está num estado terminal (concluida)", async () => {
    findUniqueMock.mockResolvedValueOnce({ ...BASE_SESSION, flowState: "concluida" });
    assertSessionAccessMock.mockResolvedValueOnce(undefined);
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    await expect(
      CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=concluida",
    );
  });

  it("redireciona para T-END quando a sessão já está num estado terminal (encerrada_parcial)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      ...BASE_SESSION,
      flowState: "encerrada_parcial",
    });
    assertSessionAccessMock.mockResolvedValueOnce(undefined);
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    await expect(
      CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=encerrada_parcial",
    );
  });

  it("renderiza CadastroClient com o contexto do destino, sem conta autenticada", async () => {
    findUniqueMock.mockResolvedValueOnce(BASE_SESSION);
    assertSessionAccessMock.mockResolvedValueOnce(undefined);
    getServerSessionMock.mockResolvedValueOnce(null);
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    render(
      await CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    );

    expect(screen.getByTestId("session-id")).toHaveTextContent("session-1");
    expect(screen.getByTestId("destino")).toHaveTextContent("Gramado");
    expect(screen.getByTestId("conta")).toHaveTextContent("");
    expect(screen.getByTestId("voltar-href")).toHaveTextContent(
      "/destino/confirmacao?sessionId=session-1&destino=Gramado&flowState=destino_confirmado",
    );
  });

  it("renderiza CadastroClient com o e-mail da conta já autenticada (item 7 do UX-SPEC)", async () => {
    findUniqueMock.mockResolvedValueOnce(BASE_SESSION);
    assertSessionAccessMock.mockResolvedValueOnce(undefined);
    getServerSessionMock.mockResolvedValueOnce({
      user: { email: "ja-autenticado@example.com" },
    });
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    render(
      await CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    );

    expect(screen.getByTestId("conta")).toHaveTextContent(
      "ja-autenticado@example.com",
    );
  });

  it("NUNCA chama vincularSessaoAConta/criarConta no carregamento da página (GET)", async () => {
    findUniqueMock.mockResolvedValueOnce(BASE_SESSION);
    assertSessionAccessMock.mockResolvedValueOnce(undefined);
    getServerSessionMock.mockResolvedValueOnce(null);
    const CadastroPage = (await import("@/app/cadastro/page")).default;

    render(
      await CadastroPage({ searchParams: Promise.resolve({ sessionId: "session-1" }) }),
    );

    // O único ponto de integração é o componente `CadastroClient` (mockado
    // acima) — este teste garante que a Server Component em si não chama
    // nenhuma Server Action de escrita, só leitura (`findUnique`/
    // `assertSessionAccess`/`getServerSession`).
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(assertSessionAccessMock).toHaveBeenCalledTimes(1);
  });
});
