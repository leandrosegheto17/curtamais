// V2-L4-T06b — Testes de `UpcomingHolidaysSection` (UX-SPEC.md §8.2 T-HOME
// item 6; RF-18.4).
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HolidayWithBridge } from "@/lib/holidays";

const { getProximosFeriadosMock } = vi.hoisted(() => ({
  getProximosFeriadosMock: vi.fn<() => HolidayWithBridge[]>(),
}));

vi.mock("@/lib/proximos-feriados", () => ({
  getProximosFeriados: getProximosFeriadosMock,
}));

import { UpcomingHolidaysSection } from "@/components/home/upcoming-holidays-section";

function holiday(
  name: string,
  dateIso: string,
  rangeStartIso: string,
  rangeEndIso: string,
  totalDays: number,
): HolidayWithBridge {
  const date = new Date(dateIso);
  return {
    name,
    date,
    type: "fixed",
    bridge: {
      holiday: date,
      weekday: [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ][date.getUTCDay()] as HolidayWithBridge["bridge"]["weekday"],
      rangeStart: new Date(rangeStartIso),
      rangeEnd: new Date(rangeEndIso),
      bridgeDays: [],
      totalDays,
    },
  };
}

const THREE_HOLIDAYS: HolidayWithBridge[] = [
  holiday(
    "Nossa Senhora Aparecida",
    "2026-10-12",
    "2026-10-10",
    "2026-10-12",
    3,
  ),
  holiday("Finados", "2026-11-02", "2026-10-31", "2026-11-02", 4),
  holiday(
    "Proclamação da República",
    "2026-11-15",
    "2026-11-14",
    "2026-11-15",
    2,
  ),
];

afterEach(() => {
  cleanup();
  getProximosFeriadosMock.mockReset();
});

describe("UpcomingHolidaysSection (V2-L4-T06b)", () => {
  it("renderiza os 3 HolidayCallout retornados por getProximosFeriados", () => {
    getProximosFeriadosMock.mockReturnValue(THREE_HOLIDAYS);

    render(<UpcomingHolidaysSection />);

    expect(getProximosFeriadosMock).toHaveBeenCalledWith(
      expect.any(Date),
      3,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "A folga já está no calendário. Falta o destino.",
      }),
    ).toBeInTheDocument();

    for (const item of THREE_HOLIDAYS) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("link", { name: /Planejar este feriado/ }),
    ).toHaveLength(3);
  });

  it("não renderiza nada (retorna null) quando não há feriado futuro", () => {
    getProximosFeriadosMock.mockReturnValue([]);

    const { container } = render(<UpcomingHolidaysSection />);

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { level: 2 }),
    ).not.toBeInTheDocument();
  });

  it("link de cada feriado leva a /entrada/feriados?feriado=AAAA-MM-DD", () => {
    getProximosFeriadosMock.mockReturnValue(THREE_HOLIDAYS);

    render(<UpcomingHolidaysSection />);

    const links = screen.getAllByRole("link", {
      name: /Planejar este feriado/,
    });
    expect(links[0]).toHaveAttribute(
      "href",
      "/entrada/feriados?feriado=2026-10-12",
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "/entrada/feriados?feriado=2026-11-02",
    );
    expect(links[2]).toHaveAttribute(
      "href",
      "/entrada/feriados?feriado=2026-11-15",
    );
  });

  it("mostra o período legível com dia da semana e datas de cada feriado", () => {
    getProximosFeriadosMock.mockReturnValue(THREE_HOLIDAYS);

    render(<UpcomingHolidaysSection />);

    expect(
      screen.getByText("Seg 12/10 · de sáb 10/10 a seg 12/10"),
    ).toBeInTheDocument();
  });

  it("usa o acento `holiday` só na pílula 'N dias', nunca no link (que não é CTA)", () => {
    getProximosFeriadosMock.mockReturnValue(THREE_HOLIDAYS);

    render(<UpcomingHolidaysSection />);

    const pill = screen.getByText("3 dias");
    expect(pill).toHaveClass("bg-holiday");
    expect(pill).toHaveClass("text-holiday-foreground");

    const links = screen.getAllByRole("link", {
      name: /Planejar este feriado/,
    });
    links.forEach((link) => {
      expect(link.className).not.toMatch(/\bbg-accent\b/);
      expect(link.className).not.toMatch(/\btext-accent\b/);
      expect(link.className).not.toMatch(/\bbg-holiday\b/);
      expect(link).toHaveClass("text-foreground");
    });

    const callouts = document.querySelectorAll(".border-holiday");
    expect(callouts).toHaveLength(3);
  });
});
