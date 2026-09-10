// L7-T02 — Testes de `DestinoSugestoesScreen` (T04, UX-SPEC.md Seção 2/4,
// RF-04.3/.4/.5). Cobre os 4 estados obrigatórios (Carregando/Erro/Vazio/
// Sucesso, critério de aceite desta tarefa) e o rodapé de decisão
// (RF-04.5: "continuar"/"encerrar aqui"). Server Actions reais
// (`@/lib/actions/destino`) substituídas por dublês via `actionsOverride`
// (ponto de injeção do próprio componente) — nenhum mock de módulo inteiro
// necessário, nenhuma chamada de rede/banco real.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { DestinoSugestoesScreen } from "@/components/destino/destino-sugestoes-screen";
import type { DestinationSuggestionResult } from "@/lib/actions/destino";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

const suggestion = (
  overrides: Partial<DestinationSuggestionResult> = {},
): DestinationSuggestionResult => ({
  name: "Gramado",
  justification: "Clima ameno e gastronomia local.",
  priceRangeMin: 800,
  priceRangeMax: 1500,
  withinBudget: true,
  exceedsBudget: false,
  ...overrides,
});

function renderScreen(
  overrides: Partial<
    Parameters<typeof DestinoSugestoesScreen>[0]["actionsOverride"]
  > = {},
) {
  const gerarSugestoesDestino = vi.fn().mockResolvedValue([suggestion()]);
  const aprovarDestinoSugerido = vi.fn().mockResolvedValue({
    proximaEtapa: "confirmacao_destino" as const,
    sessionId: "session-1",
    flowState: "destino_confirmado" as const,
    destino: "Gramado",
  });
  const informarDestinoManualmente = vi.fn().mockResolvedValue({
    proximaEtapa: "confirmacao_destino" as const,
    sessionId: "session-1",
    flowState: "destino_confirmado" as const,
    destino: "Bonito, MS",
  });
  const encerrarResolucaoDestino = vi.fn().mockResolvedValue({
    proximaEtapa: "encerramento" as const,
    sessionId: "session-1",
    flowState: "encerrada_parcial" as const,
  });

  const actions = {
    gerarSugestoesDestino,
    aprovarDestinoSugerido,
    informarDestinoManualmente,
    encerrarResolucaoDestino,
    ...overrides,
  };

  render(
    <DestinoSugestoesScreen sessionId="session-1" actionsOverride={actions} />,
  );

  return actions;
}

describe("DestinoSugestoesScreen — estado Carregando", () => {
  it("mostra o skeleton de LoadingStream antes da resolução da Server Action", () => {
    renderScreen({
      gerarSugestoesDestino: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    expect(screen.getByTestId("loading-stream-skeleton")).toBeInTheDocument();
    expect(
      screen.getByText("Gerando sugestões de destino"),
    ).toBeInTheDocument();
  });
});

describe("DestinoSugestoesScreen — estado Sucesso", () => {
  it("renderiza um cartão por sugestão, com preço via PriceRangeBadge", async () => {
    renderScreen({
      gerarSugestoesDestino: vi
        .fn()
        .mockResolvedValue([suggestion({ name: "Gramado" }), suggestion({ name: "Bonito, MS" })]),
    });

    await screen.findByText("Gramado");
    expect(screen.getByText("Bonito, MS")).toBeInTheDocument();
    expect(screen.getAllByText(/aproximado/)).toHaveLength(2);
  });

  it("exibe BudgetInsufficientBanner quando alguma sugestão excede o orçamento (RF-10.2/RN-04)", async () => {
    renderScreen({
      gerarSugestoesDestino: vi
        .fn()
        .mockResolvedValue([suggestion({ exceedsBudget: true })]),
    });

    await screen.findByText("Gramado");
    expect(screen.getByRole("status")).toHaveTextContent(
      /Não encontramos opções dentro do valor informado/,
    );
    // RN-04: o banner nunca desabilita o botão de ação da tela.
    expect(
      screen.getByRole("button", { name: /Aprovar este destino/i }),
    ).toBeEnabled();
  });

  it("aprovar um cartão chama aprovarDestinoSugerido e mostra o rodapé de decisão (RF-04.5)", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", { name: /Aprovar este destino/i }),
    );

    expect(actions.aprovarDestinoSugerido).toHaveBeenCalledWith({
      sessionId: "session-1",
      suggestion: suggestion(),
    });

    expect(
      await screen.findByRole("button", { name: "Continuar para hospedagem" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Só queria decidir o destino — encerrar aqui",
      }),
    ).toBeInTheDocument();
  });

  it("'Continuar para hospedagem' navega para /destino/confirmacao com sessionId/destino/flowState", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", { name: /Aprovar este destino/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Continuar para hospedagem" }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      "/destino/confirmacao?sessionId=session-1&destino=Gramado&flowState=destino_confirmado",
    );
  });

  it("'encerrar aqui' chama encerrarResolucaoDestino e navega para /encerramento (RN-03)", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", { name: /Aprovar este destino/i }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Só queria decidir o destino — encerrar aqui",
      }),
    );

    await waitFor(() =>
      expect(actions.encerrarResolucaoDestino).toHaveBeenCalledWith(
        "session-1",
      ),
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=encerrada_parcial",
    );
  });

  it("'Já sei o destino, quero informar' abre o formulário manual e aprova via informarDestinoManualmente", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", { name: "Já sei o destino, quero informar" }),
    );

    const input = screen.getByLabelText("Qual destino você já tem em mente?");
    await user.type(input, "Bonito, MS");
    await user.click(
      screen.getByRole("button", { name: "Confirmar destino" }),
    );

    await waitFor(() =>
      expect(actions.informarDestinoManualmente).toHaveBeenCalledWith({
        sessionId: "session-1",
        destino: "Bonito, MS",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Continuar para hospedagem" }),
    ).toBeInTheDocument();
  });
});

describe("DestinoSugestoesScreen — estado Erro", () => {
  it("mostra ErrorRetryState após falha da Server Action e permite tentar novamente", async () => {
    const gerarSugestoesDestino = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha simulada"))
      .mockResolvedValueOnce([suggestion()]);

    const user = userEvent.setup();
    renderScreen({ gerarSugestoesDestino });

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "Não conseguimos gerar sugestões agora — tentar novamente",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );

    await screen.findByText("Gramado");
    expect(gerarSugestoesDestino).toHaveBeenCalledTimes(2);
  });
});

describe("DestinoSugestoesScreen — estado Vazio", () => {
  it("'Nenhum me interessa' mostra EmptyState oferecendo nova rodada ou entrada manual (RF-04.4)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", {
        name: "Nenhum me interessa — gerar outras opções",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Gerar novas sugestões" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Informar destino manualmente" }),
    ).toBeInTheDocument();
  });

  it("'Gerar novas sugestões' a partir do Vazio volta para Carregando e chama a Server Action de novo", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", {
        name: "Nenhum me interessa — gerar outras opções",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Gerar novas sugestões" }),
    );

    await waitFor(() =>
      expect(actions.gerarSugestoesDestino).toHaveBeenCalledTimes(2),
    );
    await screen.findByText("Gramado");
  });

  it("'Informar destino manualmente' a partir do Vazio abre o formulário manual", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Gramado");
    await user.click(
      screen.getByRole("button", {
        name: "Nenhum me interessa — gerar outras opções",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Informar destino manualmente" }),
    );

    expect(
      screen.getByLabelText("Qual destino você já tem em mente?"),
    ).toBeInTheDocument();
  });
});
