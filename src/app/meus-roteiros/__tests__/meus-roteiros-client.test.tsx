import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const retomarSessaoMock = vi.fn();
vi.mock("@/lib/actions/retomar-sessao", () => ({
  retomarSessao: (...args: unknown[]) => retomarSessaoMock(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SESSAO_EM_ANDAMENTO = {
  id: "session-1",
  flowState: "hospedagem_pendente" as const,
  dateRangeStart: new Date("2026-10-10"),
  dateRangeEnd: new Date("2026-10-12"),
  updatedAt: new Date("2026-09-16"),
  destinationName: "Gramado",
  rotulo: "Em andamento — na etapa hospedagem",
};

const SESSAO_CONCLUIDA = {
  id: "session-2",
  flowState: "concluida" as const,
  dateRangeStart: new Date("2026-11-01"),
  dateRangeEnd: new Date("2026-11-05"),
  updatedAt: new Date("2026-09-10"),
  destinationName: "Foz do Iguaçu",
  rotulo: "Roteiro concluído",
};

describe("MeusRoteirosClient (T-MEUS, V2-L8-T04, RF-17)", () => {
  it("lista vazia mostra o EmptyState com o CTA 'Planejar uma viagem'", async () => {
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(<MeusRoteirosClient sessoes={[]} email="viajante@example.com" />);

    expect(
      screen.getByText("Você ainda não tem roteiros salvos."),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Planejar uma viagem" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/#caminhos");
  });

  it("lista com itens mostra um TripListItem por sessão, com rótulo e ação corretos", async () => {
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(
      <MeusRoteirosClient
        sessoes={[SESSAO_EM_ANDAMENTO, SESSAO_CONCLUIDA]}
        email="viajante@example.com"
      />,
    );

    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(screen.getByText("Foz do Iguaçu")).toBeInTheDocument();
    expect(
      screen.getByText("Em andamento — na etapa hospedagem"),
    ).toBeInTheDocument();
    expect(screen.getByText("Roteiro concluído")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar de onde parei" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver" })).toHaveAttribute(
      "href",
      "/meus-roteiros/session-2",
    );
  });

  it("'Continuar de onde parei' chama retomarSessao e navega para a rota devolvida", async () => {
    retomarSessaoMock.mockResolvedValueOnce({
      status: "ok",
      sessionId: "session-1",
      rota: "/hospedagem?sessionId=session-1",
    });
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(
      <MeusRoteirosClient sessoes={[SESSAO_EM_ANDAMENTO]} email={null} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continuar de onde parei" }),
    );

    await waitFor(() => {
      expect(retomarSessaoMock).toHaveBeenCalledWith("session-1");
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/hospedagem?sessionId=session-1");
    });
  });

  it("'Continuar de onde parei' mostra erro inline sem navegar quando retomarSessao falha", async () => {
    retomarSessaoMock.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(
      <MeusRoteirosClient sessoes={[SESSAO_EM_ANDAMENTO]} email={null} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continuar de onde parei" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Não consegui abrir esta viagem agora."),
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("'Excluir minha conta' exige confirmação no diálogo — não dispara no primeiro clique", async () => {
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(<MeusRoteirosClient sessoes={[]} email="viajante@example.com" />);

    await user.click(
      screen.getByRole("button", { name: "Excluir minha conta" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Excluir sua conta?" }),
    ).toBeInTheDocument();
  });

  it("'Excluir minha conta' → confirmar chama DELETE /api/account, depois signOut e redirect", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(<MeusRoteirosClient sessoes={[]} email="viajante@example.com" />);

    await user.click(
      screen.getByRole("button", { name: "Excluir minha conta" }),
    );
    await user.click(screen.getByRole("button", { name: "Excluir conta" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/account", {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/?conta-excluida=1");
    });
  });

  it("cancelar o diálogo não chama a API e mantém a conta", async () => {
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(<MeusRoteirosClient sessoes={[]} email="viajante@example.com" />);

    await user.click(
      screen.getByRole("button", { name: "Excluir minha conta" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("alertdialog"),
    ).not.toBeInTheDocument();
  });

  it("exclusão com falha mantém o diálogo aberto com mensagem de erro", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    const { MeusRoteirosClient } = await import(
      "@/app/meus-roteiros/meus-roteiros-client"
    );

    render(<MeusRoteirosClient sessoes={[]} email="viajante@example.com" />);

    await user.click(
      screen.getByRole("button", { name: "Excluir minha conta" }),
    );
    await user.click(screen.getByRole("button", { name: "Excluir conta" }));

    await waitFor(() => {
      expect(
        screen.getByText("Não consegui excluir sua conta agora."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
