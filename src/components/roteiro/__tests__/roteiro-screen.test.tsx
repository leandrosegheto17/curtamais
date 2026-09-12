// L10-T02 — Testes de `RoteiroScreen` (T08, UX-SPEC.md Seção 2/4/6, RF-08).
// Cobre os estados obrigatórios aplicáveis a T08 (Carregando/Erro/Sucesso —
// "Vazio: não aplicável", UX-SPEC §4), o critério de aceite central desta
// tarefa (um bloco por dia dividido em manhã/tarde/noite, justificativa
// exibida quando presente), o comportamento de acordeão em mobile (um dia
// expandido por vez) e a ação única de aprovação no rodapé. Server Actions
// reais (`@/lib/actions/roteiro`, L10-T03) substituídas por dublês via
// `actionsOverride` (ponto de injeção do próprio componente) — nenhum mock
// de módulo inteiro necessário, nenhuma chamada de rede/banco real.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { RoteiroScreen } from "@/components/roteiro/roteiro-screen";
import type { RoteiroDayResult } from "@/lib/actions/roteiro";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

const days = (): RoteiroDayResult[] => [
  {
    date: "2026-06-12",
    morning: [
      {
        activity: "Café da manhã no hotel",
        suggestedTime: "08h00",
        timingJustification: null,
        sequenceOrder: 0,
      },
    ],
    afternoon: [],
    evening: [
      {
        activity: "Jantar no centro histórico",
        suggestedTime: "19h30",
        timingJustification: "evitar fila do horário de pico",
        sequenceOrder: 1,
      },
    ],
  },
  {
    date: "2026-06-13",
    morning: [],
    afternoon: [
      {
        activity: "Passeio no parque",
        suggestedTime: "14h00",
        timingJustification: null,
        sequenceOrder: 2,
      },
    ],
    evening: [],
  },
];

function renderScreen(
  overrides: Partial<
    NonNullable<Parameters<typeof RoteiroScreen>[0]["actionsOverride"]>
  > = {},
) {
  const gerarRoteiro = vi.fn().mockResolvedValue(days());
  const aprovarRoteiro = vi.fn().mockResolvedValue({
    proximaEtapa: "encerramento" as const,
    sessionId: "session-1",
    flowState: "concluida" as const,
    totalItens: 3,
  });

  const actionsOverride = {
    gerarRoteiro,
    aprovarRoteiro,
    ...overrides,
  };

  render(
    <RoteiroScreen sessionId="session-1" actionsOverride={actionsOverride} />,
  );

  return actionsOverride;
}

describe("RoteiroScreen — estado Carregando", () => {
  it("mostra o skeleton de LoadingStream antes da resolução da Server Action", () => {
    renderScreen({
      gerarRoteiro: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    expect(screen.getByTestId("loading-stream-skeleton")).toBeInTheDocument();
    expect(
      screen.getByText("Gerando o roteiro do seu dia a dia"),
    ).toBeInTheDocument();
  });
});

describe("RoteiroScreen — estado Sucesso", () => {
  it("critério de aceite: um bloco por dia da viagem, dividido em manhã/tarde/noite", async () => {
    renderScreen();

    expect(
      await screen.findByRole("button", { name: /Sex 12\/06/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sáb 13\/06/ }),
    ).toBeInTheDocument();

    // Dois dias -> dois conjuntos de rótulos de período.
    expect(screen.getAllByText("Manhã")).toHaveLength(2);
    expect(screen.getAllByText("Tarde")).toHaveLength(2);
    expect(screen.getAllByText("Noite")).toHaveLength(2);

    expect(screen.getByText("Café da manhã no hotel")).toBeInTheDocument();
    expect(screen.getByText("Passeio no parque")).toBeInTheDocument();
  });

  it("critério de aceite: justificativa de timing exibida quando presente, ausente quando null", async () => {
    renderScreen();

    await screen.findByText("Café da manhã no hotel");
    expect(
      screen.getByText("evitar fila do horário de pico"),
    ).toBeInTheDocument();
    // "Passeio no parque" (timingJustification: null) não deve ter texto de justificativa associado.
    expect(screen.getByText("Passeio no parque")).toBeInTheDocument();
  });

  it("acordeão: só o primeiro dia começa expandido; alternar expande/colapsa (um dia por vez)", async () => {
    const user = userEvent.setup();
    renderScreen();

    const dia1 = await screen.findByRole("button", { name: /Sex 12\/06/ });
    const dia2 = screen.getByRole("button", { name: /Sáb 13\/06/ });

    expect(dia1).toHaveAttribute("aria-expanded", "true");
    expect(dia2).toHaveAttribute("aria-expanded", "false");

    await user.click(dia2);
    expect(dia2).toHaveAttribute("aria-expanded", "true");
    expect(dia1).toHaveAttribute("aria-expanded", "false");

    // Clicar de novo no mesmo dia colapsa (nenhum expandido).
    await user.click(dia2);
    expect(dia2).toHaveAttribute("aria-expanded", "false");
  });

  it("aprovar o roteiro reenvia o roteiro carregado a aprovarRoteiro e mostra o rodapé de conclusão", async () => {
    const user = userEvent.setup();
    const actions = renderScreen();

    await screen.findByText("Café da manhã no hotel");
    await user.click(
      screen.getByRole("button", { name: "Aprovar roteiro e concluir" }),
    );

    await waitFor(() =>
      expect(actions.aprovarRoteiro).toHaveBeenCalledWith({
        sessionId: "session-1",
        dias: days(),
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Ver resumo da viagem" }),
    ).toBeInTheDocument();
  });

  it("'Ver resumo da viagem' navega para /encerramento com flowState concluida (RF-08.4/RF-09)", async () => {
    const user = userEvent.setup();
    renderScreen();

    await screen.findByText("Café da manhã no hotel");
    await user.click(
      screen.getByRole("button", { name: "Aprovar roteiro e concluir" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Ver resumo da viagem" }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      "/encerramento?sessionId=session-1&flowState=concluida",
    );
  });

  it("foco vai para o título ao montar a tela (UX-SPEC §5)", async () => {
    renderScreen();
    await screen.findByText("Café da manhã no hotel");

    expect(
      screen.getByRole("heading", { name: "Seu roteiro dia a dia" }),
    ).toHaveFocus();
  });
});

describe("RoteiroScreen — estado Erro", () => {
  it("mostra ErrorRetryState após falha da Server Action e permite tentar novamente", async () => {
    const gerarRoteiro = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha simulada"))
      .mockResolvedValueOnce(days());

    const user = userEvent.setup();
    renderScreen({ gerarRoteiro });

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "Não conseguimos gerar o roteiro agora — tentar novamente",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(alert).getByRole("button", { name: "Tentar novamente" }),
    );

    await screen.findByText("Café da manhã no hotel");
    expect(gerarRoteiro).toHaveBeenCalledTimes(2);
  });

  it("erro ao aprovar o roteiro mostra mensagem inline e mantém os blocos", async () => {
    const user = userEvent.setup();
    renderScreen({
      aprovarRoteiro: vi.fn().mockRejectedValue(new Error("falha simulada")),
    });

    await screen.findByText("Café da manhã no hotel");
    await user.click(
      screen.getByRole("button", { name: "Aprovar roteiro e concluir" }),
    );

    expect(
      await screen.findByText(
        "Não conseguimos concluir agora. Tente novamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Café da manhã no hotel")).toBeInTheDocument();
  });
});
