import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { FeriadosScreen } from "@/app/entrada/feriados/feriados-screen";
import type { FeriadoProlongado } from "@/lib/actions/feriados";

afterEach(() => cleanup());

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
});
