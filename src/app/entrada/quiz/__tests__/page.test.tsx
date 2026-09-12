import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// RL6-T04 (Bloqueio 006) — conecta `onComplete` de `QuizWizard` à Server
// Action real `submitQuizAnswers` (L6-T07) e à navegação pós-confirmação do
// servidor, mesmo padrão de RL6-T02/RL6-T03. `QuizWizard` é substituído por
// um dublê mínimo que expõe um botão para disparar `onComplete` diretamente
// — o wizard em si (as 4 perguntas) já é coberto por
// `quiz-wizard.test.tsx` (L6-T06), fora do escopo desta tarefa.
const FAKE_ANSWERS = {
  periodo: "fim_de_semana",
  alcance: null,
  experiencia: [],
  orcamento: null,
};

vi.mock("@/components/quiz/quiz-wizard", () => ({
  QuizWizard: ({ onComplete }: { onComplete?: (answers: unknown) => void }) => (
    <button type="button" onClick={() => onComplete?.(FAKE_ANSWERS)}>
      completar quiz (dublê)
    </button>
  ),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const submitQuizAnswersMock = vi.fn();
vi.mock("@/lib/actions/quiz", () => ({
  submitQuizAnswers: (...args: unknown[]) => submitQuizAnswersMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QuizPage (rota T03, RL6-T04, Bloqueio 006)", () => {
  it("chama submitQuizAnswers com as respostas do quiz e navega para /destino em sucesso", async () => {
    submitQuizAnswersMock.mockResolvedValue({
      sessionId: "session-1",
      flowState: "destino_pendente",
      status: "in_progress",
      dateRangeSource: "quiz",
    });
    const user = userEvent.setup();
    const QuizPage = (await import("@/app/entrada/quiz/page")).default;

    render(<QuizPage />);
    await user.click(screen.getByRole("button", { name: "completar quiz (dublê)" }));

    await waitFor(() =>
      expect(submitQuizAnswersMock).toHaveBeenCalledWith(FAKE_ANSWERS),
    );
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/destino?sessionId=session-1"),
    );
  });

  it("mostra estado de pendência (aria-busy) enquanto aguarda a Server Action", async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    submitQuizAnswersMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    const user = userEvent.setup();
    const QuizPage = (await import("@/app/entrada/quiz/page")).default;

    render(<QuizPage />);
    await user.click(screen.getByRole("button", { name: "completar quiz (dublê)" }));

    const pendingRegion = await screen.findByText("Enviando suas respostas...");
    expect(pendingRegion.closest("main")).toHaveAttribute("aria-busy", "true");

    resolvePromise({
      sessionId: "session-1",
      flowState: "destino_pendente",
      status: "in_progress",
      dateRangeSource: "quiz",
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it("mostra mensagem de erro acessível quando a Server Action falha, sem navegar", async () => {
    submitQuizAnswersMock.mockRejectedValue(new Error("falha no servidor"));
    const user = userEvent.setup();
    const QuizPage = (await import("@/app/entrada/quiz/page")).default;

    render(<QuizPage />);
    await user.click(screen.getByRole("button", { name: "completar quiz (dublê)" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/não conseguimos/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("permite tentar novamente após falha, reenviando as mesmas respostas, sem refazer o quiz", async () => {
    submitQuizAnswersMock.mockRejectedValueOnce(new Error("falha no servidor"));
    submitQuizAnswersMock.mockResolvedValueOnce({
      sessionId: "session-2",
      flowState: "destino_pendente",
      status: "in_progress",
      dateRangeSource: "quiz",
    });
    const user = userEvent.setup();
    const QuizPage = (await import("@/app/entrada/quiz/page")).default;

    render(<QuizPage />);
    await user.click(screen.getByRole("button", { name: "completar quiz (dublê)" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(submitQuizAnswersMock).toHaveBeenCalledTimes(2));
    expect(submitQuizAnswersMock).toHaveBeenNthCalledWith(2, FAKE_ANSWERS);
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/destino?sessionId=session-2"),
    );
  });
});
