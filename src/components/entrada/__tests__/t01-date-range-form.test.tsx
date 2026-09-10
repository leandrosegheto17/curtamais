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
