// L9-T02 — Testes de `PasseiosSugestoesScreen` (T07, UX-SPEC.md Seção 2/4,
// RF-07). Cobre os estados obrigatórios aplicáveis a T07 (Carregando/Erro/
// Sucesso — "Vazio" tratado como aviso inline quando todos os itens são
// removidos, UX-SPEC §4), a seleção múltipla via checkbox (marcado por
// padrão), a remoção de item antes de aprovar, o critério de aceite central
// desta tarefa ("Aprovar seleção" desabilita quando todos os itens são
// removidos/desmarcados, com mensagem explicativa) e o rodapé de decisão
// continuar/encerrar. `PasseiosScreenActions` (dublês) substitui as Server
// Actions de L9-T03, ainda não implementadas no momento desta tarefa — ver
// bloco "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no cabeçalho de
// `passeios-sugestoes-screen.tsx`.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import {
  PasseiosSugestoesScreen,
  type PasseiosScreenActions,
} from "@/components/passeios/passeios-sugestoes-screen";
import type { PasseiosSuggestionResult } from "@/lib/stage-rules";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

const item = (
  overrides: Partial<PasseiosSuggestionResult> = {},
): PasseiosSuggestionResult => ({
  name: "Trilha da Cachoeira",
  priceMin: 40,
  priceMax: 60,
  isFree: false,
  durationApprox: "3 horas",
  withinBudget: true,
  exceedsBudget: false,
  ...overrides,
});

function renderScreen(overrides: Partial<PasseiosScreenActions> = {}) {
  const gerarSugestoesPasseios = vi
    .fn()
    .mockResolvedValue([
      item({ name: "Trilha da Cachoeira" }),
      item({ name: "Museu Municipal", priceMin: 0, priceMax: 0, isFree: true }),
      item({ name: "Passeio de Barco", priceMin: 120, priceMax: 150 }),
    ]);
  const aprovarSelecaoPasseios = vi.fn().mockResolvedValue({
    proximaEtapa: "roteiro" as const,
    sessionId: "session-1",
    flowState: "roteiro_pendente" as const,
    passeios: ["Trilha da Cachoeira", "Museu Municipal", "Passeio de Barco"],
  });
  const encerrarResolucaoPasseios = vi.fn().mockResolvedValue({
    proximaEtapa: "encerramento" as const,
    sessionId: "session-1",
    flowState: "encerrada_parcial" as const,
  });

  const actions: PasseiosScreenActions = {
    gerarSugestoesPasseios,
    aprovarSelecaoPasseios,
    encerrarResolucaoPasseios,
    ...overrides,
  };

  render(<PasseiosSugestoesScreen sessionId="session-1" actions={actions} />);

  return actions;
}

describe("PasseiosSugestoesScreen — estado Carregando", () => {
  it("mostra o skeleton de LoadingStream antes da resolução da Server Action", () => {
    renderScreen({
      gerarSugestoesPasseios: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    expect(screen.getByTestId("loading-stream-skeleton")).toBeInTheDocument();
    expect(screen.getByText("Gerando sugestões de passeios")).toBeInTheDocument();
  });
});

describe("PasseiosSugestoesScreen — estado Sucesso", () => {
  it("renderiza a lista com checkbox marcado por padrão, preço via PriceRangeBadge e badge Gratuito", async () => {
    renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    expect(screen.getByText("Museu Municipal")).toBeInTheDocument();
    expect(screen.getByText("Passeio de Barco")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeChecked();
    }

    // RF-07.2: item gratuito mostra o badge "Gratuito" com texto (não só cor).
    expect(screen.getByText("Gratuito")).toBeInTheDocument();
    expect(screen.getAllByText(/aproximado/)).toHaveLength(2);
  });

  it("exibe BudgetInsufficientBanner quando algum item excede o orçamento (RF-10.2/RN-04)", async () => {
    renderScreen({
      gerarSugestoesPasseios: vi
        .fn()
        .mockResolvedValue([item({ exceedsBudget: true })]),
    });

    await screen.findByText("Trilha da Cachoeira");
    expect(screen.getByRole("status")).toHaveTextContent(
      /Não encontramos opções dentro do valor informado/,
    );
    // RN-04: o banner nunca desabilita o botão de ação da tela.
    expect(
      screen.getByRole("button", { name: "Aprovar seleção" }),
    ).toBeEnabled();
  });

  it("desmarcar um checkbox o exclui da seleção enviada a aprovarSelecaoPasseios", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    const checkbox = screen.getByRole("checkbox", {
      name: /Passeio de Barco/,
    });
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Aprovar seleção" }));

    await waitFor(() =>
      expect(actions.aprovarSelecaoPasseios).toHaveBeenCalledWith({
        sessionId: "session-1",
        selecionados: [
          item({ name: "Trilha da Cachoeira" }),
          item({ name: "Museu Municipal", priceMin: 0, priceMax: 0, isFree: true }),
        ],
      }),
    );
  });

  it("remover um item tira o cartão da lista e o exclui da seleção", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    await user.click(removeButtons[0]);

    expect(screen.queryByText("Trilha da Cachoeira")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("critério de aceite: 'Aprovar seleção' desabilita com mensagem explicativa quando todos os itens são removidos, mas 'encerrar aqui' continua disponível", async () => {
    const user = userEvent.setup();
    renderScreen({
      gerarSugestoesPasseios: vi.fn().mockResolvedValue([item()]),
    });

    await screen.findByText("Trilha da Cachoeira");
    await user.click(screen.getByRole("button", { name: "Remover" }));

    const approveButton = screen.getByRole("button", {
      name: "Aprovar seleção",
    });
    expect(approveButton).toBeDisabled();
    expect(
      screen.getByText(
        "Ao menos um passeio precisa permanecer selecionado para seguir ao roteiro — ou encerre por aqui.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Só queria decidir até aqui — encerrar aqui",
      }),
    ).toBeEnabled();
  });

  it("critério de aceite: desmarcar todos os checkboxes também desabilita 'Aprovar seleção' com a mesma mensagem", async () => {
    const user = userEvent.setup();
    renderScreen({
      gerarSugestoesPasseios: vi.fn().mockResolvedValue([item()]),
    });

    await screen.findByText("Trilha da Cachoeira");
    await user.click(screen.getByRole("checkbox"));

    expect(
      screen.getByRole("button", { name: "Aprovar seleção" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Ao menos um passeio precisa permanecer selecionado para seguir ao roteiro — ou encerre por aqui.",
      ),
    ).toBeInTheDocument();
  });

  it("aprovar a seleção chama aprovarSelecaoPasseios e mostra o rodapé de continuar/encerrar", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    await user.click(screen.getByRole("button", { name: "Aprovar seleção" }));

    await waitFor(() =>
      expect(actions.aprovarSelecaoPasseios).toHaveBeenCalledTimes(1),
    );
    expect(
      await screen.findByRole("button", { name: "Continuar para roteiro" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Só queria decidir até aqui — encerrar aqui",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Trilha da Cachoeira, Museu Municipal, Passeio de Barco/),
    ).toBeInTheDocument();
  });

  it("'Continuar para roteiro' navega preservando sessionId/flowState já avançado pelo servidor (RF-07.3)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    await user.click(screen.getByRole("button", { name: "Aprovar seleção" }));
    await user.click(
      await screen.findByRole("button", { name: "Continuar para roteiro" }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      "/roteiro?sessionId=session-1&flowState=roteiro_pendente",
    );
  });

  it("'encerrar aqui' antes de aprovar chama encerrarResolucaoPasseios e navega para /encerramento (RN-03)", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Trilha da Cachoeira");
    await user.click(
      screen.getByRole("button", {
        name: "Só queria decidir até aqui — encerrar aqui",
      }),
    );

    await waitFor(() =>
      expect(actions.encerrarResolucaoPasseios).toHaveBeenCalledWith(
        "session-1",
      ),
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=encerrada_parcial",
    );
  });

  it("foco vai para o título ao montar a tela (UX-SPEC §5)", async () => {
    renderScreen();
    await screen.findByText("Trilha da Cachoeira");

    expect(
      screen.getByRole("heading", { name: "Sugestões de passeios para você" }),
    ).toHaveFocus();
  });
});

describe("PasseiosSugestoesScreen — estado Erro", () => {
  it("mostra ErrorRetryState após falha da Server Action e permite tentar novamente", async () => {
    const gerarSugestoesPasseios = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha simulada"))
      .mockResolvedValueOnce([item()]);

    const user = userEvent.setup();
    renderScreen({ gerarSugestoesPasseios });

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "Não conseguimos gerar sugestões agora — tentar novamente",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );

    await screen.findByText("Trilha da Cachoeira");
    expect(gerarSugestoesPasseios).toHaveBeenCalledTimes(2);
  });

  it("erro ao aprovar a seleção mostra mensagem inline e mantém a lista", async () => {
    const user = userEvent.setup();
    renderScreen({
      aprovarSelecaoPasseios: vi
        .fn()
        .mockRejectedValue(new Error("falha simulada")),
    });

    await screen.findByText("Trilha da Cachoeira");
    await user.click(screen.getByRole("button", { name: "Aprovar seleção" }));

    expect(
      await screen.findByText(
        "Não conseguimos concluir agora. Tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Trilha da Cachoeira")).toBeInTheDocument();
  });
});
