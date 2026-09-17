// RL6-T02 (Bloqueio 006) — testa a conexão de `DataLivreClient` (`onValid`
// de `T01DateRangeForm`) com a Server Action real `submeterDataLivre` e a
// navegação pós-confirmação do servidor: os dois ramos de sucesso
// (`proximaEtapa: "destino"` e `"confirmacao_destino"`) e o caminho de erro
// (Server Action rejeitada), sem navegação otimista (Diretriz de
// Implementação 3 do TASK.md).
//
// V2-L5-T01 (RF-13) — acrescenta a resolução de `?destino={slug}` pela
// Server Component `DataLivrePage`: slug válido pré-preenche o campo
// (editável) e mostra a linha de contexto; slug inválido/ausente ou
// qualquer outro parâmetro de querystring se comporta como no MVP; destino
// mantido segue para T05 (confirmação), destino apagado segue para T04
// (sugestões) — mesma ramificação de `submeterDataLivre`, sem lógica nova.
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const submeterDataLivreMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/actions/data-livre", () => ({
  submeterDataLivre: (...args: unknown[]) => submeterDataLivreMock(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderDataLivrePage(searchParams: Record<string, string> = {}) {
  const DataLivrePage = (await import("@/app/entrada/data-livre/page"))
    .default;
  return render(
    await DataLivrePage({ searchParams: Promise.resolve(searchParams) }),
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  destino?: string,
) {
  await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
  await user.type(screen.getByLabelText("Data final"), "2026-10-10");
  if (destino) {
    await user.type(screen.getByLabelText(/Destino/), destino);
  }
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("DataLivrePage (T01, RL6-T02, Bloqueio 006)", () => {
  it("sem destino: chama submeterDataLivre e navega para /destino?sessionId=... quando proximaEtapa === 'destino'", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "destino",
      sessionId: "session-1",
      flowState: "destino_pendente",
    });

    await renderDataLivrePage();

    await fillAndSubmit(user);

    expect(submeterDataLivreMock).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "",
    });
    expect(pushMock).toHaveBeenCalledWith("/destino?sessionId=session-1");
  });

  it("com destino: navega para /destino/confirmacao com sessionId, destino e flowState quando proximaEtapa === 'confirmacao_destino'", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "confirmacao_destino",
      sessionId: "session-2",
      flowState: "destino_confirmado",
      destino: "Foz do Iguaçu",
    });

    await renderDataLivrePage();

    await fillAndSubmit(user, "Foz do Iguaçu");

    expect(pushMock).toHaveBeenCalledWith(
      "/destino/confirmacao?sessionId=session-2&destino=Foz+do+Igua%C3%A7u&flowState=destino_confirmado",
    );
  });

  it("botão entra em estado de pendência (aria-busy) enquanto aguarda a Server Action, mesmo padrão de DestinoConfirmacaoScreen", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void = () => {};
    submeterDataLivreMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    await renderDataLivrePage();

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Enviando...",
    });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(pushMock).not.toHaveBeenCalled();

    resolvePromise({
      proximaEtapa: "destino",
      sessionId: "session-3",
      flowState: "destino_pendente",
    });
    await screen.findByText("Quando você quer viajar?");
  });

  it("falha da Server Action: mostra mensagem de erro acessível (role=alert), sem navegar", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockRejectedValue(new Error("falha de rede"));

    await renderDataLivrePage();

    await fillAndSubmit(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não conseguimos concluir agora. Tente novamente.",
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).not.toBeDisabled();
  });

  it("título da etapa recebe foco ao montar (UX-SPEC §5, gerenciamento de foco)", async () => {
    await renderDataLivrePage();

    expect(
      screen.getByRole("heading", { name: "Quando você quer viajar?" }),
    ).toHaveFocus();
  });
});

describe("DataLivrePage — entrada pré-preenchida (V2-L5-T01, RF-13)", () => {
  it("slug válido: pré-preenche o campo Destino (editável) e mostra a linha de contexto", async () => {
    await renderDataLivrePage({ destino: "gramado" });

    const campoDestino = screen.getByLabelText(/Destino/) as HTMLInputElement;
    expect(campoDestino).toHaveValue("Gramado, RS");
    expect(campoDestino).not.toHaveAttribute("readonly");
    expect(
      screen.getByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).toBeInTheDocument();
  });

  it("slug inválido: comportamento idêntico ao MVP (campo vazio, sem linha de contexto, sem erro visível)", async () => {
    await renderDataLivrePage({ destino: "atlantida-perdida" });

    expect(screen.getByLabelText(/Destino/)).toHaveValue("");
    expect(
      screen.queryByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("slug ausente: comportamento idêntico ao MVP", async () => {
    await renderDataLivrePage();

    expect(screen.getByLabelText(/Destino/)).toHaveValue("");
    expect(
      screen.queryByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).not.toBeInTheDocument();
  });

  it("só o parâmetro `destino` é aceito: outro parâmetro de texto livre não popula o campo", async () => {
    await renderDataLivrePage({
      destino: "",
      nomeDestino: "Atlântida Perdida",
    } as unknown as Record<string, string>);

    expect(screen.getByLabelText(/Destino/)).toHaveValue("");
  });

  it("destino mantido pelo usuário: segue RF-01.3, avança para T05 (confirmação de destino)", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "confirmacao_destino",
      sessionId: "session-4",
      flowState: "destino_confirmado",
      destino: "Gramado, RS",
    });

    await renderDataLivrePage({ destino: "gramado" });

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(submeterDataLivreMock).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "Gramado, RS",
    });
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("/destino/confirmacao?"),
    );
  });

  it("destino apagado pelo usuário: segue o fluxo normal de T04 (sugestões da IA)", async () => {
    const user = userEvent.setup();
    submeterDataLivreMock.mockResolvedValue({
      proximaEtapa: "destino",
      sessionId: "session-5",
      flowState: "destino_pendente",
    });

    await renderDataLivrePage({ destino: "gramado" });

    const campoDestino = screen.getByLabelText(/Destino/);
    await user.clear(campoDestino);
    expect(
      screen.queryByText("Ótima escolha. Agora me diga quando você pode ir."),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Data inicial"), "2026-10-05");
    await user.type(screen.getByLabelText("Data final"), "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(submeterDataLivreMock).toHaveBeenCalledWith({
      dataInicial: "2026-10-05",
      dataFinal: "2026-10-10",
      destino: "",
    });
    expect(pushMock).toHaveBeenCalledWith("/destino?sessionId=session-5");
  });
});
