import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuizWizard } from "@/components/quiz/quiz-wizard";

afterEach(() => cleanup());

describe("QuizWizard (T03a-d, RF-03)", () => {
  it("mostra o indicador '1 de 4' na primeira pergunta (período)", () => {
    render(<QuizWizard />);
    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /qual período você tem disponível/i }),
    ).toBeInTheDocument();
  });

  it("não mostra botão 'Pular' na pergunta (a) período", () => {
    render(<QuizWizard />);
    expect(
      screen.queryByRole("button", { name: /pular/i }),
    ).not.toBeInTheDocument();
  });

  it("bloqueia o avanço sem selecionar período, mostra mensagem e não navega", async () => {
    const user = userEvent.setup();
    render(<QuizWizard />);

    await user.click(screen.getByRole("button", { name: /avançar/i }));

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("Selecione um período para continuar.");
    // Ainda na pergunta 1 de 4, não navegou.
    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /qual período você tem disponível/i }),
    ).toBeInTheDocument();
  });

  it("navega sequencialmente pelas 4 perguntas ao selecionar período e avançar", async () => {
    const user = userEvent.setup();
    render(<QuizWizard />);

    await user.click(screen.getByLabelText("Fim de semana"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));

    expect(screen.getByText("2 de 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /alcance geográfico/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^pular$/i }));

    expect(screen.getByText("3 de 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /tipo de experiência/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^pular$/i }));

    expect(screen.getByText("4 de 4")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /orçamento disponível/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();
  });

  it("'Pular' está presente em (b), (c) e (d) mas não em (a)", async () => {
    const user = userEvent.setup();
    render(<QuizWizard />);

    // (a)
    expect(screen.queryByRole("button", { name: /^pular$/i })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("1 semana"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));
    // (b)
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Sem preferência"));
    // (c) — seleção em (b) já avança automaticamente
    expect(screen.getByText("3 de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^avançar$/i }));
    // (d)
    expect(screen.getByText("4 de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pular$/i })).toBeInTheDocument();
  });

  it("permite múltipla seleção em (c) tipo de experiência", async () => {
    const user = userEvent.setup();
    render(<QuizWizard />);

    await user.click(screen.getByLabelText("3 a 5 dias"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (b) -> (c)

    await user.click(screen.getByLabelText("Praia"));
    await user.click(screen.getByLabelText("Cultura/história"));

    expect(screen.getByLabelText("Praia")).toBeChecked();
    expect(screen.getByLabelText("Cultura/história")).toBeChecked();
    expect(screen.getByLabelText("Cidade/urbano")).not.toBeChecked();
  });

  it("chama onComplete com as respostas ao concluir a última pergunta", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<QuizWizard onComplete={onComplete} />);

    await user.click(screen.getByLabelText("Mais de 1 semana"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (b)
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (c)

    await user.type(
      screen.getByLabelText("Faixa de valor"),
      "R$ 3.000 a R$ 5.000",
    );
    await user.click(screen.getByRole("button", { name: /concluir/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        periodo: "mais_de_1_semana",
        alcance: null,
        experiencia: [],
        orcamento: "R$ 3.000 a R$ 5.000",
      }),
    );
  });

  it("chama onComplete com orcamento null ao pular a última pergunta", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<QuizWizard onComplete={onComplete} />);

    await user.click(screen.getByLabelText("Fim de semana"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (b)
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (c)
    await user.click(screen.getByRole("button", { name: /^pular$/i })); // (d)

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ periodo: "fim_de_semana", orcamento: null }),
    );
  });

  it("permite voltar de (b) para (a), preservando a resposta já selecionada", async () => {
    const user = userEvent.setup();
    render(<QuizWizard />);

    await user.click(screen.getByLabelText("1 semana"));
    await user.click(screen.getByRole("button", { name: /avançar/i }));
    expect(screen.getByText("2 de 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /voltar/i }));

    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    expect(screen.getByLabelText("1 semana")).toBeChecked();
  });
});
