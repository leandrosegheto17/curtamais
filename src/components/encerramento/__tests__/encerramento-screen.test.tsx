// L10-T04 — Testes de `EncerramentoScreen` (T-END, UX-SPEC.md Seção 2, RN-03).
// Critério de aceite central: rótulo "Viagem decidida!" quando a sessão está
// completa, ou "Parte da sua viagem está decidida" quando parcial — e o caso
// parcial NUNCA é apresentado como erro (sem `role="alert"`, sem tokens
// semânticos de erro), mesmo sendo um resultado válido do produto.
//
// V2-L7-T09/RF-17/RNF-11 — copy V2.0 condicionada a `temConta`: com conta,
// afirma que o roteiro está salvo em "Meus roteiros" com CTA para lá; sem
// conta, NUNCA afirma "salvo" — aviso honesto, sem CTA para "Meus roteiros".
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
  it("exibe 'Viagem decidida!' quando a sessão está completa (flowState=concluida, com conta)", () => {
    render(
      <EncerramentoScreen
        flowState="concluida"
        resumo={fullResumo}
        temConta
      />,
    );

    expect(screen.getByText("Viagem decidida!")).toBeInTheDocument();
    expect(
      screen.queryByText("Parte da sua viagem está decidida"),
    ).not.toBeInTheDocument();
  });

  it("exibe 'Parte da sua viagem está decidida' quando a sessão é parcial (flowState=encerrada_parcial, com conta)", () => {
    render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
        temConta
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
        temConta
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
      <EncerramentoScreen flowState="concluida" resumo={fullResumo} temConta />,
    );
    const { container: partialContainer } = render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
        temConta
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
        temConta
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
    render(
      <EncerramentoScreen flowState="concluida" resumo={fullResumo} temConta />,
    );

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
    render(
      <EncerramentoScreen flowState="concluida" resumo={fullResumo} temConta />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Sua viagem" })).toBe(
      document.activeElement,
    );
  });

  it("com conta: mostra 'Está salvo em Meus roteiros' e CTA que leva a /meus-roteiros", () => {
    render(
      <EncerramentoScreen flowState="concluida" resumo={fullResumo} temConta />,
    );

    expect(
      screen.getByText("Está salvo em 'Meus roteiros'."),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Ver meus roteiros" });
    expect(cta).toHaveAttribute("href", "/meus-roteiros");
  });

  it("sem conta: aviso honesto, nunca a palavra 'salvo', sem CTA para 'Meus roteiros'", () => {
    render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
        temConta={false}
      />,
    );

    expect(
      screen.getByText(
        "Sem uma conta, não consigo guardar esta viagem para depois. Se quiser, anote ou tire um print.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/salvo/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ver meus roteiros" }),
    ).not.toBeInTheDocument();

    const cta = screen.getByRole("link", { name: "Planejar outra viagem" });
    expect(cta).toHaveAttribute("href", "/");
  });

  it("sem conta: rótulo de status menciona o destino escolhido, sem sugerir 'decidida'/'salva'", () => {
    render(
      <EncerramentoScreen
        flowState="encerrada_parcial"
        resumo={partialResumo}
        temConta={false}
      />,
    );

    expect(
      screen.getByText("Seu destino está escolhido: Gramado."),
    ).toBeInTheDocument();
  });
});
