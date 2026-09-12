// L10-T04 — Testes de `EncerramentoScreen` (T-END, UX-SPEC.md Seção 2, RN-03).
// Critério de aceite central: rótulo "Viagem decidida!" quando a sessão está
// completa, ou "Parte da sua viagem está decidida" quando parcial — e o caso
// parcial NUNCA é apresentado como erro (sem `role="alert"`, sem tokens
// semânticos de erro), mesmo sendo um resultado válido do produto.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EncerramentoScreen,
  type EncerramentoResumo,
} from "@/components/encerramento/encerramento-screen";

afterEach(() => {
  cleanup();
});

const fullResumo: EncerramentoResumo = {
  destino: { name: "Gramado" },
  hospedagem: { name: "Pousada Serra Azul", type: "Pousada" },
  passeios: [
    { name: "Mini Mundo", free: false },
    { name: "Mirante do Vale", free: true },
  ],
  roteiroAprovado: true,
};

const partialResumo: EncerramentoResumo = {
  destino: { name: "Gramado" },
};

describe("EncerramentoScreen", () => {
  it("exibe 'Viagem decidida!' quando a sessão está completa (flowState=concluida)", () => {
    render(<EncerramentoScreen flowState="concluida" resumo={fullResumo} />);

    expect(screen.getByText("Viagem decidida!")).toBeInTheDocument();
    expect(
      screen.queryByText("Parte da sua viagem está decidida"),
    ).not.toBeInTheDocument();
  });

  it("exibe 'Parte da sua viagem está decidida' quando a sessão é parcial (flowState=encerrada_parcial)", () => {
    render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
      />,
    );

    expect(
      screen.getByText("Parte da sua viagem está decidida"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Viagem decidida!")).not.toBeInTheDocument();
  });

  it("NUNCA apresenta o estado parcial como erro: sem role=alert, sem tokens semânticos de erro", () => {
    const { container } = render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
      />,
    );

    // Critério de aceite explícito: encerramento parcial é um resultado
    // válido do produto, não uma falha — nenhum `role="alert"` em nenhum
    // ponto desta tela.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);

    // Nenhum token semântico de erro (UX-SPEC §3: `text-error`/`border-error`)
    // aplicado a nenhum elemento da tela no caso parcial.
    const errorStyledElements = container.querySelectorAll(
      '[class*="text-error"], [class*="border-error"]',
    );
    expect(errorStyledElements).toHaveLength(0);

    // Nenhuma linguagem de erro/falha no texto renderizado.
    expect(container.textContent?.toLowerCase()).not.toMatch(
      /erro|falh|quebrad/,
    );
  });

  it("usa o mesmo tratamento visual (ícone de confirmação) para completo e parcial", () => {
    const { container: completeContainer } = render(
      <EncerramentoScreen flowState="concluida" resumo={fullResumo} />,
    );
    const { container: partialContainer } = render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
      />,
    );

    expect(
      completeContainer.querySelectorAll('[class*="text-success"]').length,
    ).toBeGreaterThan(0);
    expect(
      partialContainer.querySelectorAll('[class*="text-success"]').length,
    ).toBeGreaterThan(0);
  });

  it("lista só as etapas efetivamente aprovadas (resumo parcial: só destino)", () => {
    render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
      />,
    );

    expect(screen.getByRole("region", { name: "Destino" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Hospedagem" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Passeios" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Roteiro" }),
    ).not.toBeInTheDocument();
  });

  it("lista destino + hospedagem + passeios + roteiro quando tudo foi aprovado", () => {
    render(<EncerramentoScreen flowState="concluida" resumo={fullResumo} />);

    expect(screen.getByRole("region", { name: "Destino" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Hospedagem" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Passeios" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Roteiro" })).toBeInTheDocument();

    expect(screen.getByText("Gramado")).toBeInTheDocument();
    expect(screen.getByText("Pousada Serra Azul")).toBeInTheDocument();
    expect(screen.getByText("Mini Mundo")).toBeInTheDocument();
    expect(screen.getByText("Mirante do Vale")).toBeInTheDocument();
    // RF-07.2 — badge "Gratuito" para o passeio marcado como `free`.
    expect(screen.getByText("Gratuito")).toBeInTheDocument();
  });

  it("gerencia foco no título ao montar (UX-SPEC §5)", () => {
    render(<EncerramentoScreen flowState="concluida" resumo={fullResumo} />);

    expect(screen.getByRole("heading", { level: 1, name: "Sua viagem" })).toBe(
      document.activeElement,
    );
  });

  it("dispara onVerDepois ao clicar em 'Ver isso depois', sem exigir nenhuma ação para salvar", async () => {
    const user = userEvent.setup();
    const onVerDepois = vi.fn();
    render(
      <EncerramentoScreen
        flowState="concluida"
        resumo={fullResumo}
        onVerDepois={onVerDepois}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver isso depois" }));
    expect(onVerDepois).toHaveBeenCalledTimes(1);
  });

  it("não quebra quando onVerDepois não é passado (nenhuma ação obrigatória do usuário, RF-09)", async () => {
    const user = userEvent.setup();
    render(<EncerramentoScreen flowState="concluida" resumo={fullResumo} />);

    await user.click(screen.getByRole("button", { name: "Ver isso depois" }));
    // Não lança erro — é o suficiente para este caso.
  });
});
