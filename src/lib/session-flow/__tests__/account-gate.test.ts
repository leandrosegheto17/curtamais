// @vitest-environment node
//
// V2-L6-T01 — `transicaoExigeConta` (ADR-009 item 1, RF-16.7/RN-12).
// Critério de aceite:
// - `encerrar` nunca exige conta (RN-12).
// - Toda transição de/para estado pós-destino exige conta.
// - Testes cobrindo todas as transições válidas da state machine (ADR-006,
//   incluindo os adendos 1/2: os 11 estados, a ação regressiva `revisar` e a
//   ação `encerrar` a partir de qualquer estado com pelo menos uma etapa
//   aprovada).
import { describe, expect, it } from "vitest";
import { transicaoExigeConta } from "@/lib/session-flow";
import { InvalidTransitionError } from "@/lib/session-flow/errors";
import type { SessionFlowAction, SessionFlowState } from "@/lib/session-flow";

describe("transicaoExigeConta — cadeia sequencial (iniciar/aprovar/ajustar/avancar)", () => {
  const casos: Array<{
    atual: SessionFlowState;
    acao: SessionFlowAction;
    exigeConta: boolean;
  }> = [
    // Antes do gate: nenhuma exige conta.
    { atual: "entrada_selecionada", acao: "iniciar", exigeConta: false },
    { atual: "destino_pendente", acao: "ajustar", exigeConta: false },
    { atual: "destino_pendente", acao: "aprovar", exigeConta: false },
    // Ponto de gate: SAI de destino_confirmado PARA hospedagem_pendente —
    // exige conta porque o estado de chegada é pós-destino (ADR-009).
    { atual: "destino_confirmado", acao: "avancar", exigeConta: true },
    // Toda ação a partir de hospedagem em diante exige conta.
    { atual: "hospedagem_pendente", acao: "ajustar", exigeConta: true },
    { atual: "hospedagem_pendente", acao: "aprovar", exigeConta: true },
    { atual: "hospedagem_aprovada", acao: "avancar", exigeConta: true },
    { atual: "passeios_pendente", acao: "ajustar", exigeConta: true },
    { atual: "passeios_pendente", acao: "aprovar", exigeConta: true },
    { atual: "passeios_aprovados", acao: "avancar", exigeConta: true },
    { atual: "roteiro_pendente", acao: "ajustar", exigeConta: true },
    { atual: "roteiro_pendente", acao: "aprovar", exigeConta: true },
    { atual: "roteiro_aprovado", acao: "avancar", exigeConta: true },
  ];

  it.each(casos)(
    "$atual --$acao--> exigeConta=$exigeConta",
    ({ atual, acao, exigeConta }) => {
      expect(transicaoExigeConta(atual, acao)).toBe(exigeConta);
    },
  );
});

describe("transicaoExigeConta — ação regressiva `revisar` (ADR-006 Adendo 2)", () => {
  const casos: Array<{
    atual: SessionFlowState;
    exigeConta: boolean;
  }> = [
    // destino_confirmado -> destino_pendente: os dois estados são anteriores
    // ao gate, não exige conta ("Trocar destino" em T05, ADR-009).
    { atual: "destino_confirmado", exigeConta: false },
    // As outras 3 saem de um estado pós-destino, exigem conta.
    { atual: "hospedagem_aprovada", exigeConta: true },
    { atual: "passeios_aprovados", exigeConta: true },
    { atual: "roteiro_aprovado", exigeConta: true },
  ];

  it.each(casos)(
    "$atual --revisar--> exigeConta=$exigeConta",
    ({ atual, exigeConta }) => {
      expect(transicaoExigeConta(atual, "revisar")).toBe(exigeConta);
    },
  );
});

describe("transicaoExigeConta — `encerrar` nunca exige conta (RN-12)", () => {
  // Todos os estados a partir dos quais `encerrar` é uma transição válida
  // (STATES_WITH_AT_LEAST_ONE_APPROVAL em state-machine.ts).
  const estadosComEncerrarValido: SessionFlowState[] = [
    "destino_confirmado",
    "hospedagem_pendente",
    "hospedagem_aprovada",
    "passeios_pendente",
    "passeios_aprovados",
    "roteiro_pendente",
    "roteiro_aprovado",
  ];

  it.each(estadosComEncerrarValido)(
    "%s --encerrar--> exigeConta=false, mesmo sendo estado pós-destino",
    (atual) => {
      expect(transicaoExigeConta(atual, "encerrar")).toBe(false);
    },
  );

  it("retorna false para `encerrar` antes mesmo de consultar a state machine (não lança para estado sem aprovação)", () => {
    // entrada_selecionada/destino_pendente não têm `encerrar` válido na
    // state machine (lançaria InvalidTransitionError), mas a regra de conta
    // curto-circuita em `acao === "encerrar"` antes de chamar
    // `transitionSessionFlow` — nunca lança para `encerrar`.
    expect(transicaoExigeConta("entrada_selecionada", "encerrar")).toBe(false);
    expect(transicaoExigeConta("destino_pendente", "encerrar")).toBe(false);
  });
});

describe("transicaoExigeConta — transição inválida", () => {
  it("propaga InvalidTransitionError da state machine para ações não-`encerrar`", () => {
    expect(() =>
      transicaoExigeConta("entrada_selecionada", "aprovar"),
    ).toThrow(InvalidTransitionError);
  });
});
