import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItineraryDayBlock } from "@/components/design-system/itinerary-day-block";

afterEach(() => cleanup());

describe("ItineraryDayBlock (UX-SPEC.md T08, RF-08)", () => {
  it("renderiza os 3 blocos de período (manhã/tarde/noite), mesmo com algum vazio", () => {
    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[
          {
            activity: "Café da manhã no hotel",
            suggestedTime: "08h00",
            timingJustification: null,
          },
        ]}
        afternoon={[]}
        evening={[
          {
            activity: "Jantar no centro histórico",
            suggestedTime: "19h30",
            timingJustification: "evitar fila do horário de pico",
          },
        ]}
        expanded
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText("Manhã")).toBeInTheDocument();
    expect(screen.getByText("Tarde")).toBeInTheDocument();
    expect(screen.getByText("Noite")).toBeInTheDocument();

    expect(screen.getByText("Café da manhã no hotel")).toBeInTheDocument();
    expect(screen.getByText("Jantar no centro histórico")).toBeInTheDocument();
    // Bloco vazio (tarde) mostra mensagem própria, não quebra/oculta a seção.
    expect(screen.getByText("Nada planejado.")).toBeInTheDocument();
  });

  it("exibe o horário sugerido sempre", () => {
    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[
          {
            activity: "Visita ao museu",
            suggestedTime: "09h00",
            timingJustification: null,
          },
        ]}
        afternoon={[]}
        evening={[]}
        expanded
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText("09h00")).toBeInTheDocument();
  });

  it("exibe a justificativa de timing só quando presente (campo pode ser null)", () => {
    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[
          {
            activity: "Visita ao museu",
            suggestedTime: "09h00",
            timingJustification: "abre cedo, evita fila",
          },
        ]}
        afternoon={[
          {
            activity: "Passeio no parque",
            suggestedTime: "14h00",
            timingJustification: null,
          },
        ]}
        evening={[]}
        expanded
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText("abre cedo, evita fila")).toBeInTheDocument();
    // Sem justificativa: só a atividade + horário aparecem, sem texto extra.
    expect(screen.getByText("Passeio no parque")).toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
  });

  it("cabeçalho do dia mostra o rótulo formatado (dia da semana abreviado + DD/MM)", () => {
    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[]}
        afternoon={[]}
        evening={[]}
        expanded
        onToggle={() => {}}
      />,
    );

    // 2026-06-12 é uma sexta-feira.
    expect(
      screen.getByRole("button", { name: /Sex 12\/06/ }),
    ).toBeInTheDocument();
  });

  it("comportamento de acordeão: aria-expanded reflete o estado controlado pelo chamador", () => {
    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[]}
        afternoon={[]}
        evening={[]}
        expanded={false}
        onToggle={() => {}}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Sex 12\/06/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("clicar no cabeçalho chama onToggle (chamador controla qual dia está expandido)", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ItineraryDayBlock
        date="2026-06-12"
        morning={[]}
        afternoon={[]}
        evening={[]}
        expanded={false}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Sex 12\/06/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
