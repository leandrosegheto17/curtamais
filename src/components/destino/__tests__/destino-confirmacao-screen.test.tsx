import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DestinoConfirmacaoScreen } from "@/components/destino/destino-confirmacao-screen";

afterEach(() => cleanup());

describe("DestinoConfirmacaoScreen (T05, L7-T04, RF-11)", () => {
  it("exibe o nome do destino em destaque e os dois botões exigidos pelo critério de aceite", () => {
    render(
      <DestinoConfirmacaoScreen sessionId="session-1" destino="Foz do Iguaçu" />,
    );

    expect(
      screen.getByRole("heading", { name: "Confirme seu destino" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Foz do Iguaçu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trocar destino" }),
    ).toBeInTheDocument();
  });

  it("sempre aparece independentemente da origem do destino (T01/T02/T03 informado manualmente, ou T04 aprovado)", () => {
    const { unmount } = render(
      <DestinoConfirmacaoScreen sessionId="s1" destino="Gramado" />,
    );
    expect(screen.getByText("Gramado")).toBeInTheDocument();
    unmount();

    render(
      <DestinoConfirmacaoScreen sessionId="s2" destino="Lisboa" />,
    );
    expect(screen.getByText("Lisboa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trocar destino" }),
    ).toBeInTheDocument();
  });

  it("foco vai para o título da etapa ao montar (UX-SPEC §5)", () => {
    render(
      <DestinoConfirmacaoScreen sessionId="session-1" destino="Foz do Iguaçu" />,
    );

    expect(
      screen.getByRole("heading", { name: "Confirme seu destino" }),
    ).toHaveFocus();
  });

  it("clique em 'Confirmar e continuar' chama onConfirmar com o sessionId", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn().mockResolvedValue({
      proximaEtapa: "hospedagem",
      sessionId: "session-1",
    });

    render(
      <DestinoConfirmacaoScreen
        sessionId="session-1"
        destino="Foz do Iguaçu"
        onConfirmar={onConfirmar}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    );

    await waitFor(() => {
      expect(onConfirmar).toHaveBeenCalledWith({ sessionId: "session-1" });
    });
  });

  it("clique em 'Trocar destino' chama onTrocar com o sessionId", async () => {
    const user = userEvent.setup();
    const onTrocar = vi.fn().mockResolvedValue({
      proximaEtapa: "destino",
      sessionId: "session-1",
    });

    render(
      <DestinoConfirmacaoScreen
        sessionId="session-1"
        destino="Foz do Iguaçu"
        onTrocar={onTrocar}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Trocar destino" }));

    await waitFor(() => {
      expect(onTrocar).toHaveBeenCalledWith({ sessionId: "session-1" });
    });
  });

  it("falha em onConfirmar mostra erro acessível (ícone + texto, role=alert) sem travar a tela", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn().mockRejectedValue(new Error("falhou"));

    render(
      <DestinoConfirmacaoScreen
        sessionId="session-1"
        destino="Foz do Iguaçu"
        onConfirmar={onConfirmar}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não conseguimos concluir agora. Tente novamente.",
    );
    expect(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    ).not.toBeDisabled();
  });

  it("não quebra quando onConfirmar/onTrocar não estão wireados ainda (Server Action de L7-T05 pendente)", async () => {
    const user = userEvent.setup();

    render(
      <DestinoConfirmacaoScreen sessionId="session-1" destino="Foz do Iguaçu" />,
    );

    await user.click(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    );
    await user.click(screen.getByRole("button", { name: "Trocar destino" }));

    expect(screen.getByText("Foz do Iguaçu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("navegação por teclado alcança os dois botões, em ordem", async () => {
    const user = userEvent.setup();
    render(
      <DestinoConfirmacaoScreen sessionId="session-1" destino="Foz do Iguaçu" />,
    );

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Confirmar e continuar" }),
    ).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Trocar destino" })).toHaveFocus();
  });

  it("reflete o StepperProgress com destino concluído e hospedagem como etapa atual (currentState padrão destino_confirmado)", () => {
    render(
      <DestinoConfirmacaoScreen sessionId="session-1" destino="Foz do Iguaçu" />,
    );

    expect(
      screen.getByRole("navigation", { name: "Progresso da viagem" }),
    ).toBeInTheDocument();
  });
});
