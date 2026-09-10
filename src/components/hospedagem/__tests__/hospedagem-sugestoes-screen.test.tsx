// L8-T02 — Testes de `HospedagemSugestoesScreen` (T06, UX-SPEC.md Seção 2/4,
// RF-05.3/RF-05.4/RF-06). Cobre os estados obrigatórios aplicáveis a T06
// (Carregando/Erro/Sucesso — "Vazio" não aplicável, UX-SPEC §4), o
// "Ajustar" com feedback textual regenerando a mesma etapa sem avançar
// (RF-05.3, critério de aceite) e o rodapé de decisão continuar/encerrar
// (RF-05.4, critério de aceite). Server Actions reais
// (`@/lib/actions/hospedagem`, L8-T03) substituídas por dublês via
// `actionsOverride` (ponto de injeção do próprio componente) — nenhum mock
// de módulo inteiro necessário, nenhuma chamada de rede/banco real.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { HospedagemSugestoesScreen } from "@/components/hospedagem/hospedagem-sugestoes-screen";
import type { AccommodationSuggestionResult } from "@/lib/actions/hospedagem";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

const suggestion = (
  overrides: Partial<AccommodationSuggestionResult> = {},
): AccommodationSuggestionResult => ({
  name: "Pousada Vista Mar",
  type: "Pousada",
  pricePerNightMin: 200,
  pricePerNightMax: 350,
  distinctiveFeature: "Vista para o mar a poucos passos da praia.",
  withinBudget: true,
  exceedsBudget: false,
  ...overrides,
});

function renderScreen(
  overrides: Partial<
    NonNullable<Parameters<typeof HospedagemSugestoesScreen>[0]["actionsOverride"]>
  > = {},
) {
  const gerarSugestoesHospedagem = vi
    .fn()
    .mockResolvedValue([
      suggestion({ name: "Pousada Vista Mar" }),
      suggestion({ name: "Hotel Central", type: "Hotel" }),
      suggestion({ name: "Chalé da Serra", type: "Chalé" }),
    ]);
  const aprovarHospedagem = vi.fn().mockResolvedValue({
    proximaEtapa: "passeios" as const,
    sessionId: "session-1",
    flowState: "passeios_pendente" as const,
    hospedagem: "Pousada Vista Mar",
  });
  const encerrarResolucaoHospedagem = vi.fn().mockResolvedValue({
    proximaEtapa: "encerramento" as const,
    sessionId: "session-1",
    flowState: "encerrada_parcial" as const,
  });

  const actions = {
    gerarSugestoesHospedagem,
    aprovarHospedagem,
    encerrarResolucaoHospedagem,
    ...overrides,
  };

  render(
    <HospedagemSugestoesScreen sessionId="session-1" actionsOverride={actions} />,
  );

  return actions;
}

describe("HospedagemSugestoesScreen — estado Carregando", () => {
  it("mostra o skeleton de LoadingStream antes da resolução da Server Action", () => {
    renderScreen({
      gerarSugestoesHospedagem: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    expect(screen.getByTestId("loading-stream-skeleton")).toBeInTheDocument();
    expect(
      screen.getByText("Gerando sugestões de hospedagem"),
    ).toBeInTheDocument();
  });
});

describe("HospedagemSugestoesScreen — estado Sucesso", () => {
  it("renderiza os 3 cartões, com preço por diária via PriceRangeBadge", async () => {
    renderScreen();

    await screen.findByText("Pousada Vista Mar");
    expect(screen.getByText("Hotel Central")).toBeInTheDocument();
    expect(screen.getByText("Chalé da Serra")).toBeInTheDocument();
    expect(screen.getAllByText(/por diária/)).toHaveLength(3);
    expect(screen.getAllByText(/aproximado/)).toHaveLength(3);
  });

  it("exibe BudgetInsufficientBanner quando alguma opção excede o orçamento (RF-10.2/RN-04)", async () => {
    renderScreen({
      gerarSugestoesHospedagem: vi
        .fn()
        .mockResolvedValue([suggestion({ exceedsBudget: true })]),
    });

    await screen.findByText("Pousada Vista Mar");
    expect(screen.getByRole("status")).toHaveTextContent(
      /Não encontramos opções dentro do valor informado/,
    );
    // RN-04: o banner nunca desabilita o botão de ação da tela.
    expect(
      screen.getAllByRole("button", { name: "Aprovar" })[0],
    ).toBeEnabled();
  });

  it("aprovar um cartão chama aprovarHospedagem e mostra o rodapé de decisão (RF-05.4)", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);

    await waitFor(() =>
      expect(actions.aprovarHospedagem).toHaveBeenCalledWith({
        sessionId: "session-1",
        suggestion: suggestion({ name: "Pousada Vista Mar" }),
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Continuar para passeios" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Só queria decidir até aqui — encerrar aqui",
      }),
    ).toBeInTheDocument();
  });

  it("depois de aprovar, os botões Aprovar/Ajustar dos demais cartões ficam desabilitados", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);

    await screen.findByRole("button", { name: "Continuar para passeios" });

    const aprovarButtons = screen.getAllByRole("button", {
      name: /Aprovar|Hospedagem aprovada/,
    });
    for (const button of aprovarButtons) {
      expect(button).toBeDisabled();
    }
    for (const button of screen.getAllByRole("button", { name: "Ajustar" })) {
      expect(button).toBeDisabled();
    }
  });

  it("'Continuar para passeios' navega preservando sessionId/flowState já avançado pelo servidor (RF-06.3)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    await user.click(
      await screen.findByRole("button", { name: "Continuar para passeios" }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      "/passeios?sessionId=session-1&flowState=passeios_pendente",
    );
  });

  it("'encerrar aqui' chama encerrarResolucaoHospedagem e navega para /encerramento (RF-05.4/RN-03)", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    await user.click(
      await screen.findByRole("button", {
        name: "Só queria decidir até aqui — encerrar aqui",
      }),
    );

    await waitFor(() =>
      expect(actions.encerrarResolucaoHospedagem).toHaveBeenCalledWith(
        "session-1",
      ),
    );
    expect(pushMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=encerrada_parcial",
    );
  });

  it("'Ajustar' abre campo de feedback textual e regenera a mesma etapa sem avançar (RF-05.3)", async () => {
    const user = userEvent.setup();
    const regeneratedList = [suggestion({ name: "Pousada Reformulada" })];
    const gerarSugestoesHospedagem = vi
      .fn()
      .mockResolvedValueOnce([
        suggestion({ name: "Pousada Vista Mar" }),
        suggestion({ name: "Hotel Central", type: "Hotel" }),
        suggestion({ name: "Chalé da Serra", type: "Chalé" }),
      ])
      .mockResolvedValueOnce(regeneratedList);
    const actions = renderScreen({ gerarSugestoesHospedagem });

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Ajustar" })[0]);

    const textarea = screen.getByLabelText(
      "O que você gostaria de ajustar nesta opção?",
    );
    await user.type(textarea, "Prefiro algo mais perto do centro");
    await user.click(
      screen.getByRole("button", { name: "Regenerar com este feedback" }),
    );

    await waitFor(() =>
      expect(actions.gerarSugestoesHospedagem).toHaveBeenCalledTimes(2),
    );
    // RL8-T01: o texto digitado no campo de feedback é enviado como segundo
    // argumento (a sanitização/composição do prompt em si é responsabilidade
    // de `gerarSugestoesHospedagem`, coberta em
    // `src/lib/actions/__tests__/hospedagem.integration.test.ts`).
    expect(actions.gerarSugestoesHospedagem).toHaveBeenNthCalledWith(
      2,
      "session-1",
      "Prefiro algo mais perto do centro",
    );

    // Nova lista substitui a exibida; nenhuma navegação/avanço de etapa.
    expect(await screen.findByText("Pousada Reformulada")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Continuar para passeios" }),
    ).not.toBeInTheDocument();
  });

  it("'Cancelar' no campo de feedback fecha sem regenerar", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Pousada Vista Mar");
    await user.click(screen.getAllByRole("button", { name: "Ajustar" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByLabelText("O que você gostaria de ajustar nesta opção?"),
    ).not.toBeInTheDocument();
    expect(actions.gerarSugestoesHospedagem).toHaveBeenCalledTimes(1);
  });

  it("foco vai para o título ao montar a tela (UX-SPEC §5)", async () => {
    renderScreen();
    await screen.findByText("Pousada Vista Mar");

    expect(
      screen.getByRole("heading", { name: "Sugestões de hospedagem para você" }),
    ).toHaveFocus();
  });
});

describe("HospedagemSugestoesScreen — estado Erro", () => {
  it("mostra ErrorRetryState após falha da Server Action e permite tentar novamente", async () => {
    const gerarSugestoesHospedagem = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha simulada"))
      .mockResolvedValueOnce([suggestion()]);

    const user = userEvent.setup();
    renderScreen({ gerarSugestoesHospedagem });

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "Não conseguimos gerar sugestões agora — tentar novamente",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );

    await screen.findByText("Pousada Vista Mar");
    expect(gerarSugestoesHospedagem).toHaveBeenCalledTimes(2);
  });
});
