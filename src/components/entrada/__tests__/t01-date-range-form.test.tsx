import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DATE_ORDER_ERROR_MESSAGE,
  T01DateRangeForm,
} from "@/components/entrada/t01-date-range-form";

afterEach(() => cleanup());

describe("T01DateRangeForm (RF-01.4)", () => {
  it("data final anterior à inicial: mostra erro junto ao campo, não chama onValid (não avança)", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(<T01DateRangeForm onValid={onValid} />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-10");
    await user.type(screen.getByLabelText("Data final"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      DATE_ORDER_ERROR_MESSAGE,
    );
    expect(onValid).not.toHaveBeenCalled();
  });

  it("mensagem de erro é associada ao campo 'Data final' via aria-describedby", async () => {
    const user = userEvent.setup();

    render(<T01DateRangeForm />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-10");
    await user.type(screen.getByLabelText("Data final"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const dataFinalInput = screen.getByLabelText("Data final");
    const describedBy = dataFinalInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage.id).toBe(describedBy);
    expect(dataFinalInput).toHaveAttribute("aria-invalid", "true");
  });

  it("datas válidas (final >= inicial): não mostra erro e chama onValid, sem bloquear", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(<T01DateRangeForm onValid={onValid} />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValid).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "",
    });
  });

  it("datas iguais (final === inicial) são válidas (viagem de 1 dia)", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(<T01DateRangeForm onValid={onValid} />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValid).toHaveBeenCalledTimes(1);
  });

  it("corrigir a data final após erro remove a mensagem e permite avançar", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(<T01DateRangeForm onValid={onValid} />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-10");
    await user.type(screen.getByLabelText("Data final"), "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Data final"));
    await user.type(screen.getByLabelText("Data final"), "2026-10-15");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValid).toHaveBeenCalledTimes(1);
  });

  it("campo de destino é opcional e é repassado a onValid quando preenchido", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(<T01DateRangeForm onValid={onValid} />);

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.type(screen.getByLabelText(/Destino/), "Foz do Iguaçu");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(onValid).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "Foz do Iguaçu",
    });
  });

  it("RL6-T02: isPending reflete aria-busy/disabled/texto do botão, mesmo padrão de DestinoConfirmacaoScreen", () => {
    const { rerender } = render(<T01DateRangeForm isPending={false} />);

    const button = screen.getByRole("button", { name: "Continuar" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");

    rerender(<T01DateRangeForm isPending />);
    const pendingButton = screen.getByRole("button", { name: "Enviando..." });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
  });

  it("V2-L5-T01 (RF-13): destinoInicial pré-preenche o campo Destino (editável) e mostra a linha de contexto", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();

    render(
      <T01DateRangeForm onValid={onValid} destinoInicial="Gramado, RS" />,
    );

    const campoDestino = screen.getByLabelText(/Destino/) as HTMLInputElement;
    expect(campoDestino).toHaveValue("Gramado, RS");
    expect(
      screen.getByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).toBeInTheDocument();

    await user.clear(campoDestino);
    await user.type(campoDestino, "Foz do Iguaçu");
    expect(campoDestino).toHaveValue("Foz do Iguaçu");
  });

  it("V2-L5-T01 (RF-13): sem destinoInicial, não mostra a linha de contexto (comportamento MVP)", () => {
    render(<T01DateRangeForm />);

    expect(
      screen.queryByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).not.toBeInTheDocument();
  });

  it("V2-L5-T01 (RF-13): apagar o destino pré-preenchido esconde a linha de contexto", async () => {
    const user = userEvent.setup();

    render(<T01DateRangeForm destinoInicial="Gramado, RS" />);

    expect(
      screen.getByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Destino/));

    expect(
      screen.queryByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).not.toBeInTheDocument();
  });

  it("navegação por teclado: Tab alcança os 3 campos e o botão, em ordem lógica", async () => {
    const user = userEvent.setup();

    render(<T01DateRangeForm />);

    await user.tab();
    expect(screen.getByLabelText("Data inicial")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText("Data final")).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/Destino/)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveFocus();
  });
});
