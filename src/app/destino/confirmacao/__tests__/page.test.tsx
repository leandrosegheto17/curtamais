import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
  useRouter: () => ({ back: backMock, push: vi.fn() }),
}));

vi.mock("@/lib/actions/confirmacao-destino", () => ({
  confirmarDestino: vi.fn().mockResolvedValue({
    proximaEtapa: "hospedagem",
    sessionId: "session-1",
    flowState: "hospedagem_pendente",
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfirmacaoDestinoPage (rota T05, L7-T04, RF-11)", () => {
  it("renderiza a tela de confirmação com sessionId/destino recebidos via querystring, acoplada à Server Action real de L7-T05", async () => {
    const ConfirmacaoDestinoPage = (
      await import("@/app/destino/confirmacao/page")
    ).default;

    render(
      ConfirmacaoDestinoPage({
        searchParams: { sessionId: "session-1", destino: "Foz do Iguaçu" },
      }),
    );

    expect(screen.getByText("Foz do Iguaçu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trocar destino" }),
    ).toBeInTheDocument();
  });

  it("redireciona para a home quando sessionId está ausente", async () => {
    const ConfirmacaoDestinoPage = (
      await import("@/app/destino/confirmacao/page")
    ).default;

    expect(() =>
      ConfirmacaoDestinoPage({ searchParams: { destino: "Foz do Iguaçu" } }),
    ).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redireciona para a home quando destino está ausente", async () => {
    const ConfirmacaoDestinoPage = (
      await import("@/app/destino/confirmacao/page")
    ).default;

    expect(() =>
      ConfirmacaoDestinoPage({ searchParams: { sessionId: "session-1" } }),
    ).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("um flowState inválido/ausente não quebra a tela (default seguro destino_confirmado)", async () => {
    const ConfirmacaoDestinoPage = (
      await import("@/app/destino/confirmacao/page")
    ).default;

    render(
      ConfirmacaoDestinoPage({
        searchParams: {
          sessionId: "session-1",
          destino: "Foz do Iguaçu",
          flowState: "algo-invalido",
        },
      }),
    );

    expect(screen.getByText("Foz do Iguaçu")).toBeInTheDocument();
  });
});
