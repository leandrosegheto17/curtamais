import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "@/app/entrar/login-screen";

const pushMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const criarContaMock = vi.hoisted(() => vi.fn());

// Mesmo padrão de mock de `next/navigation` já usado por
// `FeriadosScreen`/`DestinoConfirmacaoScreen` (só `useRouter().push` é
// usado por `LoginScreen`).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("@/lib/actions/conta", () => ({
  criarConta: criarContaMock,
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  signInMock.mockClear();
  criarContaMock.mockClear();
});

async function preencherEEnviar(email: string, senha: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), senha);
  await user.click(screen.getByRole("button", { name: /entrar/i }));
}

describe("LoginScreen (T-LOGIN, V2-L7-T05, RF-17.7)", () => {
  it("modo padrão é 'Já tenho conta' (item 1, UX-SPEC.md §8 T-LOGIN)", () => {
    render(<LoginScreen retorno="/meus-roteiros" />);
    expect(
      screen.getByRole("button", { name: "Já tenho conta" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("com `retorno` válido, navega para lá depois de um login com sucesso", async () => {
    signInMock.mockResolvedValue({ ok: true, error: null });
    render(<LoginScreen retorno="/hospedagem" />);

    await preencherEEnviar("ana@example.com", "senha1234");

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "ana@example.com",
        password: "senha1234",
        redirect: false,
      });
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/hospedagem"));
  });

  it("sem `retorno` (já resolvido para '/' pela page), navega para '/' após sucesso", async () => {
    signInMock.mockResolvedValue({ ok: true, error: null });
    render(<LoginScreen retorno="/" />);

    await preencherEEnviar("ana@example.com", "senha1234");

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("falha de login mostra erro genérico, sem revelar se o e-mail existe", async () => {
    signInMock.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<LoginScreen retorno="/meus-roteiros" />);

    await preencherEEnviar("ana@example.com", "senhaerrada");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("E-mail ou senha incorretos.");
    expect(alerta.textContent).not.toMatch(/não encontrado|não existe|cadastrado/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("resposta nula de `signIn` também mostra o erro genérico (sem navegar)", async () => {
    signInMock.mockResolvedValue(null);
    render(<LoginScreen retorno="/meus-roteiros" />);

    await preencherEEnviar("ana@example.com", "senha1234");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("E-mail ou senha incorretos.");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("erro inesperado de `signIn` (rede/servidor) mostra mensagem de erro de servidor", async () => {
    signInMock.mockRejectedValue(new Error("network"));
    render(<LoginScreen retorno="/meus-roteiros" />);

    await preencherEEnviar("ana@example.com", "senha1234");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não consegui concluir agora.");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
