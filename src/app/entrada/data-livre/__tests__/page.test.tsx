// RL6-T02 (Bloqueio 006) — testa a conexão de `DataLivrePage` (`onValid` de
// `T01DateRangeForm`) com a Server Action real `submeterDataLivre` e a
// navegação pós-confirmação do servidor: os dois ramos de sucesso
// (`proximaEtapa: "destino"` e `"confirmacao_destino"`) e o caminho de erro
// (Server Action rejeitada), sem navegação otimista (Diretriz de
// Implementação 3 do TASK.md).
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const submeterDataLivreMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/actions/data-livre", () => ({
  submeterDataLivre: (...args: unknown[]) => submeterDataLivreMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  destino?: string,
) {
  await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
  await user.type(screen.getByLabelText("Data final"), "2026-10-10");
  if (destino) {
    await user.type(screen.getByLabelText(/Destino/), destino);
  }
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("DataLivrePage (T01, RL6-T02, Bloqueio 006)", () => {
  it("sem destino: chama submeterDataLivre e navega para /destino?sessionId=... quando proximaEtapa === 'destino'", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "destino",
      sessionId: "session-1",
      flowState: "destino_pendente",
    });

    const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
      .default;
    render(<DataLivrePage />);

    await fillAndSubmit(user);

    expect(submeterDataLivreMock).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "",
    });
    expect(pushMock).toHaveBeenCalledWith("/destino?sessionId=session-1");
  });

  it("com destino: navega para /destino/confirmacao com sessionId, destino e flowState quando proximaEtapa === 'confirmacao_destino'", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "confirmacao_destino",
      sessionId: "session-2",
      flowState: "destino_confirmado",
      destino: "Foz do Iguaçu",
    });

    const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
      .default;
    render(<DataLivrePage />);

    await fillAndSubmit(user, "Foz do Iguaçu");

    expect(pushMock).toHaveBeenCalledWith(
      "/destino/confirmacao?sessionId=session-2&destino=Foz+do+Igua%C3%A7u&flowState=destino_confirmado",
    );
  });

  it("botão entra em estado de pendência (aria-busy) enquanto aguarda a Server Action, mesmo padrão de DestinoConfirmacaoScreen", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void = () => {};
    submeterDataLivreMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
      .default;
    render(<DataLivrePage />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Enviando...",
    });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pushMock).not.toHaveBeenCalled();

    resolvePromise({
      proximaEtapa: "destino",
      sessionId: "session-3",
      flowState: "destino_pendente",
    });
    await screen.findByText("Quando você quer viajar?");
  });

  it("falha da Server Action: mostra mensagem de erro acessível (role=alert), sem navegar", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockRejectedValue(new Error("falha de rede"));

    const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
      .default;
    render(<DataLivrePage />);

    await fillAndSubmit(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não conseguimos concluir agora. Tente novamente.",
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).not.toBeDisabled();
  });

  it("título da etapa recebe foco ao montar (UX-SPEC §5, gerenciamento de foco)", async () => {
    const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
      .default;
    render(<DataLivrePage />);

    expect(
      screen.getByRole("heading", { name: "Quando você quer viajar?" }),
    ).toHaveFocus();
  });
});
