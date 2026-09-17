import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const signInMock = vi.fn();
const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const criarContaMock = vi.fn();
vi.mock("@/lib/actions/conta", () => ({
  criarConta: (...args: unknown[]) => criarContaMock(...args),
}));

const vincularSessaoAContaMock = vi.fn();
vi.mock("@/lib/actions/vinculo-conta", () => ({
  vincularSessaoAConta: (...args: unknown[]) => vincularSessaoAContaMock(...args),
}));

const encerrarResolucaoDestinoMock = vi.fn();
vi.mock("@/lib/actions/destino", () => ({
  encerrarResolucaoDestino: (...args: unknown[]) =>
    encerrarResolucaoDestinoMock(...args),
}));

const DEFAULT_PROPS = {
  sessionId: "session-1",
  destino: "Gramado",
  periodo: "10/10 a 12/10/2026",
  contaAutenticadaEmail: null,
  voltarHref: "/destino/confirmacao?sessionId=session-1",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
});

async function preencherFormulario(
  user: ReturnType<typeof userEvent.setup>,
  { comConsentimento = true }: { comConsentimento?: boolean } = {},
) {
  await user.type(screen.getByLabelText("E-mail"), "viajante@example.com");
  await user.type(screen.getByLabelText("Senha"), "senha-segura-123");
  if (comConsentimento) {
    const checkbox = screen.queryByRole("checkbox");
    if (checkbox) {
      await user.click(checkbox);
    }
  }
}

describe("CadastroClient (T-GATE, V2-L7-T04, RF-16)", () => {
  it("fluxo de cadastro completo: criarConta → signIn → vincularSessaoAConta, em sequência, navegando só no fim", async () => {
    criarContaMock.mockResolvedValueOnce({ status: "sucesso", userId: "user-1" });
    signInMock.mockResolvedValueOnce({ error: undefined, ok: true });
    vincularSessaoAContaMock.mockResolvedValueOnce({
      status: "vinculada",
      sessionId: "session-1",
      rota: "/hospedagem?sessionId=session-1",
    });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    await preencherFormulario(user);
    await user.click(
      screen.getByRole("button", { name: "Criar conta e seguir para a hospedagem" }),
    );

    await waitFor(() => {
      expect(criarContaMock).toHaveBeenCalledWith({
        email: "viajante@example.com",
        senha: "senha-segura-123",
        consentimento: true,
      });
    });
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "viajante@example.com",
        password: "senha-segura-123",
        redirect: false,
      });
    });
    await waitFor(() => {
      expect(vincularSessaoAContaMock).toHaveBeenCalledWith({
        sessionId: "session-1",
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/hospedagem?sessionId=session-1");
    });
    expect(encerrarResolucaoDestinoMock).not.toHaveBeenCalled();
  });

  it("fluxo de entrada completo ('Já tenho conta'): signIn → vincularSessaoAConta, sem criarConta", async () => {
    signInMock.mockResolvedValueOnce({ error: undefined, ok: true });
    vincularSessaoAContaMock.mockResolvedValueOnce({
      status: "idempotente",
      sessionId: "session-1",
      rota: "/hospedagem?sessionId=session-1",
    });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    await user.click(screen.getByRole("button", { name: "Já tenho conta" }));
    await user.type(screen.getByLabelText("E-mail"), "viajante@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-atual-123");
    await user.click(
      screen.getByRole("button", { name: "Entrar e seguir para a hospedagem" }),
    );

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "viajante@example.com",
        password: "senha-atual-123",
        redirect: false,
      });
    });
    expect(criarContaMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(vincularSessaoAContaMock).toHaveBeenCalledWith({
        sessionId: "session-1",
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/hospedagem?sessionId=session-1");
    });
  });

  it("'Agora não' chama encerrarResolucaoDestino e navega para T-END, sem NUNCA chamar vincularSessaoAConta/criarConta", async () => {
    encerrarResolucaoDestinoMock.mockResolvedValueOnce({
      proximaEtapa: "encerramento",
      sessionId: "session-1",
      flowState: "encerrada_parcial",
    });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    await user.click(
      screen.getByRole("button", { name: "Agora não — ficar só com o destino" }),
    );

    await waitFor(() => {
      expect(encerrarResolucaoDestinoMock).toHaveBeenCalledWith("session-1");
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/encerramento?sessionId=session-1&flowState=encerrada_parcial",
      );
    });
    expect(vincularSessaoAContaMock).not.toHaveBeenCalled();
    expect(criarContaMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("já autenticado: mostra 'Continuar com esta conta' e pula direto para vincularSessaoAConta, sem pedir e-mail/senha de novo", async () => {
    vincularSessaoAContaMock.mockResolvedValueOnce({
      status: "vinculada",
      sessionId: "session-1",
      rota: "/hospedagem?sessionId=session-1",
    });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(
      <CadastroClient
        {...DEFAULT_PROPS}
        contaAutenticadaEmail="ja-autenticado@example.com"
      />,
    );

    expect(
      screen.getByText("Você está na conta ja-autenticado@example.com."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continuar com esta conta" }),
    );

    await waitFor(() => {
      expect(vincularSessaoAContaMock).toHaveBeenCalledWith({
        sessionId: "session-1",
      });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/hospedagem?sessionId=session-1");
    });
    expect(criarContaMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("nenhuma chamada de rede acontece só por montar o componente (sem clique)", async () => {
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    expect(criarContaMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
    expect(vincularSessaoAContaMock).not.toHaveBeenCalled();
    expect(encerrarResolucaoDestinoMock).not.toHaveBeenCalled();
  });

  it("e-mail já cadastrado mostra o convite para entrar, sem tentar signIn/vincular automaticamente", async () => {
    criarContaMock.mockResolvedValueOnce({
      status: "erro",
      campo: "email",
      mensagem: "E-mail já cadastrado.",
    });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    await preencherFormulario(user);
    await user.click(
      screen.getByRole("button", { name: "Criar conta e seguir para a hospedagem" }),
    );

    expect(
      await screen.findByText("Esse e-mail já tem conta. Quer entrar com ele?"),
    ).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
    expect(vincularSessaoAContaMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Entrar com este e-mail" }),
    );

    expect(
      screen.getByRole("button", { name: "Entrar e seguir para a hospedagem" }),
    ).toBeInTheDocument();
  });

  it("conta criada mas entrada falhou: troca para o modo entrar com a mensagem do UX-SPEC, sem tentar vincular", async () => {
    criarContaMock.mockResolvedValueOnce({ status: "sucesso", userId: "user-1" });
    signInMock.mockResolvedValueOnce({ error: "CredentialsSignin", ok: false });

    const user = userEvent.setup();
    const { CadastroClient } = await import("@/app/cadastro/cadastro-client");
    render(<CadastroClient {...DEFAULT_PROPS} />);

    await preencherFormulario(user);
    await user.click(
      screen.getByRole("button", { name: "Criar conta e seguir para a hospedagem" }),
    );

    expect(
      await screen.findByText("Sua conta foi criada. Entre para continuar."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar e seguir para a hospedagem" }),
    ).toBeInTheDocument();
    expect(vincularSessaoAContaMock).not.toHaveBeenCalled();
  });
});
