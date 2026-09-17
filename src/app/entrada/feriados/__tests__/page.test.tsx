import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeriadoProlongado } from "@/lib/actions/feriados";

// Mock da Server Action `getFeriadosProlongados` (L2-T02) — L6-T04 só
// consome, não reimplementa o cálculo de feriados/emenda (ADR-007).
vi.mock("@/lib/actions/feriados", () => ({
  getFeriadosProlongados: vi.fn(),
  processarFeriadoEscolhido: vi.fn(),
}));

// `FeriadosScreen` usa `useRouter` desde RL6-T03 (Bloqueio 006) — mock
// mínimo só para permitir a montagem do componente nestes testes de rota,
// que não exercitam navegação.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const feriadoFixture: FeriadoProlongado = {
  name: "Corpus Christi",
  date: new Date(Date.UTC(2026, 5, 12)),
  dateFormatted: "12/06",
  weekday: "thursday",
  weekdayAbbrev: "Qui",
  bridge: {
    rangeStart: new Date(Date.UTC(2026, 5, 12)),
    rangeEnd: new Date(Date.UTC(2026, 5, 15)),
    rangeStartFormatted: "12/06",
    rangeEndFormatted: "15/06",
    totalDays: 4,
    bridgeDays: [],
  },
  label: "Qui 12/06 → estende até Dom 15/06, 4 dias",
};

describe("FeriadosPage (rota T02, L6-T04)", () => {
  it("busca a lista via getFeriadosProlongados e renderiza a emenda formatada de cada feriado", async () => {
    const { getFeriadosProlongados } = await import("@/lib/actions/feriados");
    vi.mocked(getFeriadosProlongados).mockResolvedValue([feriadoFixture]);

    const FeriadosPage = (await import("@/app/entrada/feriados/page")).default;
    const element = await FeriadosPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(getFeriadosProlongados).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Corpus Christi")).toBeInTheDocument();
    expect(
      screen.getByText("Qui 12/06 → estende até Dom 15/06, 4 dias"),
    ).toBeInTheDocument();
  });

  it("renderiza o campo de destino opcional mesmo com a lista carregada", async () => {
    const { getFeriadosProlongados } = await import("@/lib/actions/feriados");
    vi.mocked(getFeriadosProlongados).mockResolvedValue([feriadoFixture]);

    const FeriadosPage = (await import("@/app/entrada/feriados/page")).default;
    const element = await FeriadosPage({ searchParams: Promise.resolve({}) });
    render(element);

    const destinoInput = screen.getByLabelText(/Destino \(opcional\)/i);
    expect(destinoInput).toBeInTheDocument();
    expect(destinoInput).not.toBeRequired();
  });

  describe("?feriado=AAAA-MM-DD (V2-L5-T02, UX-SPEC §8, RF-18.3)", () => {
    it("com data válida e correspondente à lista, pré-seleciona o item", async () => {
      const { getFeriadosProlongados } = await import(
        "@/lib/actions/feriados"
      );
      vi.mocked(getFeriadosProlongados).mockResolvedValue([feriadoFixture]);

      const FeriadosPage = (await import("@/app/entrada/feriados/page"))
        .default;
      const element = await FeriadosPage({
        searchParams: Promise.resolve({ feriado: "2026-06-12" }),
      });
      render(element);

      expect(
        screen.getByRole("radio", { name: /Corpus Christi/ }),
      ).toBeChecked();
    });

    it("com formato inválido, renderiza a lista sem seleção e sem erro", async () => {
      const { getFeriadosProlongados } = await import(
        "@/lib/actions/feriados"
      );
      vi.mocked(getFeriadosProlongados).mockResolvedValue([feriadoFixture]);

      const FeriadosPage = (await import("@/app/entrada/feriados/page"))
        .default;
      const element = await FeriadosPage({
        searchParams: Promise.resolve({ feriado: "12/06/2026" }),
      });
      render(element);

      expect(
        screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
      ).toBe(true);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
