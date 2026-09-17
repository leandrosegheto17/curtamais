import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthForm,
  ConsentCheckbox,
  CONSENTIMENTO_OBRIGATORIO_MENSAGEM,
  EMAIL_INVALIDO_MENSAGEM,
  SENHA_CURTA_MENSAGEM,
} from "@/components/conta/auth-form";
import { CONSENTIMENTO_TEXTO } from "@/lib/consentimento";

afterEach(() => cleanup());

describe("AuthForm (UX-SPEC.md §8.2 T-GATE/T-LOGIN, RF-16, RNF-13)", () => {
  describe("modo cadastro", () => {
    it("usa autocomplete=email e autocomplete=new-password", () => {
      render(<AuthForm mode="cadastro" onSubmit={vi.fn()} />);

      expect(screen.getByLabelText("E-mail")).toHaveAttribute(
        "autocomplete",
        "email",
      );
      expect(screen.getByLabelText("Senha")).toHaveAttribute(
        "autocomplete",
        "new-password",
      );
    });

    it("mostra o ConsentCheckbox desmarcado por padrão", () => {
      render(<AuthForm mode="cadastro" onSubmit={vi.fn()} />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();
      expect(screen.getByText(CONSENTIMENTO_TEXTO)).toBeInTheDocument();
    });

    it("bloqueia o envio e mostra erro inline quando o consentimento não está marcado", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<AuthForm mode="cadastro" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
      await user.type(screen.getByLabelText("Senha"), "senhaForte123");
      await user.click(
        screen.getByRole("button", {
          name: "Criar conta e seguir para a hospedagem",
        }),
      );

      expect(onSubmit).not.toHaveBeenCalled();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(CONSENTIMENTO_OBRIGATORIO_MENSAGEM);

      const checkbox = screen.getByRole("checkbox");
      const describedBy = checkbox.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toBe(alert);
    });

    it("e-mail inválido: erro inline conectado ao campo via aria-describedby", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<AuthForm mode="cadastro" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("E-mail"), "nao-e-email");
      await user.type(screen.getByLabelText("Senha"), "senhaForte123");
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", {
          name: "Criar conta e seguir para a hospedagem",
        }),
      );

      expect(onSubmit).not.toHaveBeenCalled();
      const emailInput = screen.getByLabelText("E-mail");
      const describedBy = emailInput.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const errorEl = document.getElementById(describedBy as string);
      expect(errorEl).toHaveTextContent(EMAIL_INVALIDO_MENSAGEM);
    });

    it("senha curta: erro inline conectado ao campo via aria-describedby", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<AuthForm mode="cadastro" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
      await user.type(screen.getByLabelText("Senha"), "curta1");
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", {
          name: "Criar conta e seguir para a hospedagem",
        }),
      );

      expect(onSubmit).not.toHaveBeenCalled();
      const senhaInput = screen.getByLabelText("Senha");
      const describedBy = senhaInput.getAttribute("aria-describedby") ?? "";
      const ids = describedBy.split(" ");
      const hasErrorId = ids.some(
        (id) => document.getElementById(id)?.textContent?.includes(SENHA_CURTA_MENSAGEM),
      );
      expect(hasErrorId).toBe(true);
    });

    it("com todos os campos válidos, chama onSubmit com os valores", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<AuthForm mode="cadastro" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
      await user.type(screen.getByLabelText("Senha"), "senhaForte123");
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", {
          name: "Criar conta e seguir para a hospedagem",
        }),
      );

      expect(onSubmit).toHaveBeenCalledWith({
        email: "pessoa@example.com",
        senha: "senhaForte123",
        consentimento: true,
      });
    });
  });

  describe("modo entrar", () => {
    it("usa autocomplete=email e autocomplete=current-password", () => {
      render(<AuthForm mode="entrar" onSubmit={vi.fn()} />);

      expect(screen.getByLabelText("E-mail")).toHaveAttribute(
        "autocomplete",
        "email",
      );
      expect(screen.getByLabelText("Senha")).toHaveAttribute(
        "autocomplete",
        "current-password",
      );
    });

    it("não mostra o ConsentCheckbox", () => {
      render(<AuthForm mode="entrar" onSubmit={vi.fn()} />);

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByText(CONSENTIMENTO_TEXTO)).not.toBeInTheDocument();
    });

    it("com e-mail e senha preenchidos, chama onSubmit", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<AuthForm mode="entrar" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("E-mail"), "pessoa@example.com");
      await user.type(screen.getByLabelText("Senha"), "qualquer-coisa");
      await user.click(
        screen.getByRole("button", { name: "Entrar e seguir para a hospedagem" }),
      );

      expect(onSubmit).toHaveBeenCalledWith({
        email: "pessoa@example.com",
        senha: "qualquer-coisa",
        consentimento: false,
      });
    });
  });

  it("exibe erro de servidor sem campo como alerta geral do formulário", () => {
    render(
      <AuthForm
        mode="entrar"
        onSubmit={vi.fn()}
        serverError={{ mensagem: "E-mail ou senha incorretos." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos.",
    );
  });
});

describe("ConsentCheckbox", () => {
  it("desmarcado por padrão e com o texto exato de CONSENTIMENTO_TEXTO", () => {
    render(
      <ConsentCheckbox checked={false} onCheckedChange={vi.fn()} />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(CONSENTIMENTO_TEXTO)).toBeInTheDocument();
  });

  it("chama onCheckedChange ao clicar", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <ConsentCheckbox checked={false} onCheckedChange={onCheckedChange} />,
    );

    await user.click(screen.getByRole("checkbox"));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
