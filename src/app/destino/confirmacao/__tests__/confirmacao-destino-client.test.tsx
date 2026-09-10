import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: vi.fn() }),
}));

const confirmarDestinoMock = vi.fn();
const trocarDestinoMock = vi.fn();
vi.mock("@/lib/actions/confirmacao-destino", () => ({
  confirmarDestino: (...args: unknown[]) => confirmarDestinoMock(...args),
  trocarDestino: (...args: unknown[]) => trocarDestinoMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConfirmacaoDestinoClient (T05, L7-T04, RF-11)", () => {
  it("'Confirmar e continuar' chama a Server Action real confirmarDestino (L7-T05) com o sessionId", async () => {
    confirmarDestinoMock.mockResolvedValue({
      proximaEtapa: "hospedagem",
      sessionId: "session-1",
      flowState: "hospedagem_pendente",
    });
    const user = userEvent.setup();

    const { ConfirmacaoDestinoClient } = await import(
      "@/app/destino/confirmacao/confirmacao-destino-client"
    );

    render(
      <ConfirmacaoDestinoClient
        sessionId="session-1"
        destino="Foz do Iguaçu"
        currentState="destino_confirmado"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    );

    await waitFor(() => {
      expect(confirmarDestinoMock).toHaveBeenCalledWith({
        sessionId: "session-1",
      });
    });
  });

  it("'Trocar destino' chama a Server Action real trocarDestino (L7-T05) com o sessionId e só então navega de volta (router.back)", async () => {
    trocarDestinoMock.mockResolvedValue({
      proximaEtapa: "destino",
      sessionId: "session-1",
      flowState: "destino_pendente",
    });
    const user = userEvent.setup();

    const { ConfirmacaoDestinoClient } = await import(
      "@/app/destino/confirmacao/confirmacao-destino-client"
    );

    render(
      <ConfirmacaoDestinoClient
        sessionId="session-1"
        destino="Foz do Iguaçu"
        currentState="destino_confirmado"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Trocar destino" }));

    await waitFor(() => {
      expect(trocarDestinoMock).toHaveBeenCalledWith({
        sessionId: "session-1",
      });
    });
    await waitFor(() => {
      expect(backMock).toHaveBeenCalledTimes(1);
    });
    expect(confirmarDestinoMock).not.toHaveBeenCalled();
  });

  it("falha em trocarDestino mostra erro acessível sem navegar", async () => {
    trocarDestinoMock.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();

    const { ConfirmacaoDestinoClient } = await import(
      "@/app/destino/confirmacao/confirmacao-destino-client"
    );

    render(
      <ConfirmacaoDestinoClient
        sessionId="session-1"
        destino="Foz do Iguaçu"
        currentState="destino_confirmado"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Trocar destino" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("falha em confirmarDestino mostra erro acessível sem navegar", async () => {
    confirmarDestinoMock.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();

    const { ConfirmacaoDestinoClient } = await import(
      "@/app/destino/confirmacao/confirmacao-destino-client"
    );

    render(
      <ConfirmacaoDestinoClient
        sessionId="session-1"
        destino="Foz do Iguaçu"
        currentState="destino_confirmado"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(backMock).not.toHaveBeenCalled();
  });
});
