import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountNav } from "@/components/home/account-nav";

const getSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

// `AccountNav` não usa `SessionProvider`/`useSession` (ADR-011, V2-L4-T09) —
// só `getSession`/`signOut` imperativos.
vi.mock("next-auth/react", () => ({
  getSession: getSessionMock,
  signOut: signOutMock,
}));

afterEach(() => {
  cleanup();
  getSessionMock.mockReset();
  signOutMock.mockReset();
});

describe("AccountNav (V2-L4-T09, UX-SPEC.md §8.3/8.4 T-HOME)", () => {
  it("mostra um espaço reservado (skeleton) com a mesma altura do conteúdo final enquanto a sessão carrega", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    getSessionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );

    render(<AccountNav />);

    const nav = screen.getByRole("navigation", { name: "Conta" });
    expect(nav).toHaveClass("h-9");
    expect(screen.getByTestId("account-nav-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Entrar")).not.toBeInTheDocument();

    resolveSession(null);
    await waitFor(() =>
      expect(screen.queryByTestId("account-nav-skeleton")).not.toBeInTheDocument(),
    );
  });

  it("sem conta, mostra o link 'Entrar' apontando para /entrar", async () => {
    getSessionMock.mockResolvedValue(null);

    render(<AccountNav />);

    const link = await screen.findByRole("link", { name: "Entrar" });
    expect(link).toHaveAttribute("href", "/entrar?retorno=/meus-roteiros");
    expect(screen.queryByText("Meus roteiros")).not.toBeInTheDocument();
    expect(screen.queryByText("Sair")).not.toBeInTheDocument();
  });

  it("com `getSession` falhando, cai no padrão seguro e mostra 'Entrar' (UX-SPEC §8.4 T-HOME)", async () => {
    getSessionMock.mockRejectedValue(new Error("network"));

    render(<AccountNav />);

    await screen.findByRole("link", { name: "Entrar" });
  });

  it("com conta, mostra 'Meus roteiros' e 'Sair'; clicar em 'Sair' chama signOut", async () => {
    getSessionMock.mockResolvedValue({
      user: { email: "ana@example.com" },
    });
    signOutMock.mockResolvedValue(undefined);

    render(<AccountNav />);

    const meusRoteirosLink = await screen.findByRole("link", {
      name: "Meus roteiros",
    });
    expect(meusRoteirosLink).toHaveAttribute("href", "/meus-roteiros");
    expect(screen.queryByText("Entrar")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false }),
    );
  });
});
