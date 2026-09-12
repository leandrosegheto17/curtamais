import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeriadosScreen } from "@/app/entrada/feriados/feriados-screen";
import type { FeriadoProlongado } from "@/lib/actions/feriados";

const pushMock = vi.hoisted(() => vi.fn());

// Mock de `next/navigation` (RL6-T03) — só o `useRouter().push` é usado por
// `FeriadosScreen`, mesmo padrão de teste já usado para
// `HospedagemSugestoesScreen`/`DestinoConfirmacaoScreen`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

/**
 * Fixture mínima no formato exato de `FeriadoProlongado`
 * (`src/lib/actions/feriados.ts`, L2-T02) — os campos que a tela realmente
 * consome (`name`, `label`, `date`).
 */
function buildFeriado(
  overrides: Partial<FeriadoProlongado> & Pick<FeriadoProlongado, "name" | "label" | "date">,
): FeriadoProlongado {
  return {
    dateFormatted: "12/06",
    weekday: "thursday",
    weekdayAbbrev: "Qui",
    bridge: {
      rangeStart: overrides.date,
      rangeEnd: overrides.date,
      rangeStartFormatted: "12/06",
      rangeEndFormatted: "12/06",
      totalDays: 1,
      bridgeDays: [],
    },
    ...overrides,
  };
}

describe("FeriadosScreen (T02, L6-T04)", () => {
  it("renderiza a lista de feriados com a emenda formatada no texto esperado (critério de aceite)", () => {
    const feriados: FeriadoProlongado[] = [
      buildFeriado({
        name: "Corpus Christi",
        date: new Date(Date.UTC(2026, 5, 12)),
        label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
      }),
      buildFeriado({
        name: "Tiradentes",
        date: new Date(Date.UTC(2026, 3, 21)),
        label: "Ter 21/04, sem emenda (1 dia)",
      }),
    ];

    render(<FeriadosScreen feriados={feriados} />);

    expect(screen.getByText("Corpus Christi")).toBeInTheDocument();
    expect(
      screen.getByText("Qui 12/06 → estende até Dom 15/06, 4 dias"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tiradentes")).toBeInTheDocument();
    expect(
      screen.getByText("Ter 21/04, sem emenda (1 dia)"),
    ).toBeInTheDocument();
  });

  it("renderiza um item de lista por feriado retornado, na mesma ordem recebida", () => {
    const feriados: FeriadoProlongado[] = [
      buildFeriado({
        name: "Corpus Christi",
        date: new Date(Date.UTC(2026, 5, 12)),
        label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
      }),
      buildFeriado({
        name: "Independência",
        date: new Date(Date.UTC(2026, 8, 7)),
        label: "Seg 07/09 → estende até Ter 08/09, 2 dias",
      }),
    ];

    render(<FeriadosScreen feriados={feriados} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("campo de destino é opcional: presente, sem `required`, e nenhum feriado precisa estar selecionado para digitar", async () => {
    const user = userEvent.setup();
    const feriados: FeriadoProlongado[] = [
      buildFeriado({
        name: "Corpus Christi",
        date: new Date(Date.UTC(2026, 5, 12)),
        label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
      }),
    ];

    render(<FeriadosScreen feriados={feriados} />);

    const destinoInput = screen.getByLabelText(/Destino \(opcional\)/i);
    expect(destinoInput).toBeInTheDocument();
    expect(destinoInput).not.toBeRequired();
    expect(destinoInput).toHaveAttribute("aria-required", "false");

    // Nenhum radio selecionado ainda, e o campo continua editável.
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.type(destinoInput, "Gramado, RS");
    expect(destinoInput).toHaveValue("Gramado, RS");
  });

  it("selecionar um feriado marca o radio correspondente (seleção única)", async () => {
    const user = userEvent.setup();
    const feriados: FeriadoProlongado[] = [
      buildFeriado({
        name: "Corpus Christi",
        date: new Date(Date.UTC(2026, 5, 12)),
        label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
      }),
      buildFeriado({
        name: "Tiradentes",
        date: new Date(Date.UTC(2026, 3, 21)),
        label: "Ter 21/04, sem emenda (1 dia)",
      }),
    ];

    render(<FeriadosScreen feriados={feriados} />);

    const first = screen.getByRole("radio", { name: /Corpus Christi/ });
    const second = screen.getByRole("radio", { name: /Tiradentes/ });

    await user.click(first);
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();

    await user.click(second);
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
  });

  it("título da etapa recebe foco ao montar (UX-SPEC §5, gerenciamento de foco)", () => {
    render(<FeriadosScreen feriados={[]} />);
    expect(
      screen.getByRole("heading", { name: "Escolha um feriado prolongado" }),
    ).toHaveFocus();
  });

  describe("botão Continuar (RL6-T03, Bloqueio 006)", () => {
    const feriados: FeriadoProlongado[] = [
      buildFeriado({
        name: "Corpus Christi",
        date: new Date(Date.UTC(2026, 5, 12)),
        label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
      }),
    ];

    it("fica desabilitado enquanto nenhum feriado está selecionado", () => {
      render(<FeriadosScreen feriados={feriados} />);
      expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    });

    it("habilita após selecionar um feriado, chama a Server Action e navega para /destino quando flowState === destino_pendente", async () => {
      const user = userEvent.setup();
      const actionOverride = vi.fn().mockResolvedValue({
        sessionId: "session-123",
        flowState: "destino_pendente",
      });

      render(
        <FeriadosScreen feriados={feriados} actionOverride={actionOverride} />,
      );

      const radio = screen.getByRole("radio", { name: /Corpus Christi/ });
      await user.click(radio);

      const continuarButton = screen.getByRole("button", {
        name: "Continuar",
      });
      expect(continuarButton).toBeEnabled();

      await user.click(continuarButton);

      await waitFor(() => {
        expect(actionOverride).toHaveBeenCalledWith({
          holidayDate: new Date(Date.UTC(2026, 5, 12)).toISOString(),
          destino: undefined,
        });
      });
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(
          "/destino?sessionId=session-123",
        );
      });
    });

    it("navega para /destino/confirmacao com o destino trimado quando flowState === destino_confirmado", async () => {
      const user = userEvent.setup();
      const actionOverride = vi.fn().mockResolvedValue({
        sessionId: "session-456",
        flowState: "destino_confirmado",
      });

      render(
        <FeriadosScreen feriados={feriados} actionOverride={actionOverride} />,
      );

      await user.click(screen.getByRole("radio", { name: /Corpus Christi/ }));
      await user.type(
        screen.getByLabelText(/Destino \(opcional\)/i),
        "  Gramado, RS  ",
      );
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      await waitFor(() => {
        expect(actionOverride).toHaveBeenCalledWith({
          holidayDate: new Date(Date.UTC(2026, 5, 12)).toISOString(),
          destino: "Gramado, RS",
        });
      });
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(
          "/destino/confirmacao?sessionId=session-456&destino=Gramado%2C+RS&flowState=destino_confirmado",
        );
      });
    });

    it("mostra erro acessível e não navega quando a Server Action rejeita", async () => {
      const user = userEvent.setup();
      const actionOverride = vi.fn().mockRejectedValue(new Error("falhou"));

      render(
        <FeriadosScreen feriados={feriados} actionOverride={actionOverride} />,
      );

      await user.click(screen.getByRole("radio", { name: /Corpus Christi/ }));
      const continuarButton = screen.getByRole("button", {
        name: "Continuar",
      });
      await user.click(continuarButton);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Não conseguimos concluir agora. Tente novamente.",
      );
      expect(pushMock).not.toHaveBeenCalled();
      expect(continuarButton).toBeEnabled();
      expect(continuarButton).toHaveAttribute("aria-busy", "false");
    });
  });
});
