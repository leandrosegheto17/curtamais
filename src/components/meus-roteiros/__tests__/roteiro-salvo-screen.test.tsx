import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoteiroSalvoScreen } from "@/components/meus-roteiros/roteiro-salvo-screen";

afterEach(() => cleanup());

describe("RoteiroSalvoScreen (T-MEUS-DET, V2-L8-T05, UX-SPEC.md §8.2)", () => {
  it("concluída: mostra o resumo e os dias do roteiro em modo leitura, sem ações de aprovar/ajustar", () => {
    render(
      <RoteiroSalvoScreen
        flowState="concluida"
        resumo={{
          destino: { name: "Gramado" },
          hospedagem: { name: "Hotel Serra", type: "Hotel" },
          passeios: [{ name: "Mini Mundo", free: false }],
          roteiroAprovado: true,
        }}
        statusLabel="Roteiro concluído"
        dias={[
          {
            date: "2026-06-12",
            morning: [
              {
                activity: "Café colonial",
                suggestedTime: "08h00",
                timingJustification: "abre cedo",
                sequenceOrder: 0,
              },
            ],
            afternoon: [],
            evening: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("Roteiro concluído")).toBeInTheDocument();
    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(screen.getByText("Café colonial")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Aprovar roteiro/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ajustar/i })).not.toBeInTheDocument();
  });

  it("encerrada_parcial: mostra só o resumo, sem seção de roteiro", () => {
    render(
      <RoteiroSalvoScreen
        flowState="encerrada_parcial"
        resumo={{
          destino: { name: "Gramado" },
          hospedagem: null,
          passeios: null,
          roteiroAprovado: false,
        }}
        statusLabel="Encerrada em destino"
        dias={null}
        etapaEncerrada="destino"
      />,
    );

    expect(screen.getByText("Encerrada em destino")).toBeInTheDocument();
    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(
      screen.getByText("Esta viagem foi encerrada em destino."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Seu roteiro")).not.toBeInTheDocument();
  });

  it("tem link de volta para Meus roteiros", () => {
    render(
      <RoteiroSalvoScreen
        flowState="encerrada_parcial"
        resumo={{ destino: null, hospedagem: null, passeios: null }}
        statusLabel="Encerrada em destino"
        dias={null}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Meus roteiros/i }),
    ).toHaveAttribute("href", "/meus-roteiros");
  });
});
