// @vitest-environment node
//
// L4-T01 — State machine server-side do Orquestrador de Sessão (ADR-006).
// Critério de aceite: "Transição inválida (pular etapa) é rejeitada; todos
// os estados do ADR-006 implementados."
import { describe, expect, it } from "vitest";
import {
  INITIAL_SESSION_FLOW_STATE,
  isTerminalSessionFlowState,
  SESSION_FLOW_STATES,
  transitionSessionFlow,
} from "@/lib/session-flow";
import { InvalidTransitionError } from "@/lib/session-flow/errors";
import type { SessionFlowState } from "@/lib/session-flow";

describe("estados do ADR-006", () => {
  it("modela exatamente os 11 estados do ADR-006, sem nomes divergentes", () => {
    expect(SESSION_FLOW_STATES).toEqual([
      "entrada_selecionada",
      "destino_pendente",
      "destino_confirmado",
      "hospedagem_pendente",
      "hospedagem_aprovada",
      "passeios_pendente",
      "passeios_aprovados",
      "roteiro_pendente",
      "roteiro_aprovado",
      "concluida",
      "encerrada_parcial",
    ]);
  });

  it("estado inicial é entrada_selecionada", () => {
    expect(INITIAL_SESSION_FLOW_STATE).toBe("entrada_selecionada");
  });
});

describe("transições válidas do fluxo principal (ADR-006)", () => {
  it("percorre a cadeia inteira até concluida via iniciar/aprovar/avancar", () => {
    let state: SessionFlowState = INITIAL_SESSION_FLOW_STATE;

    state = transitionSessionFlow(state, "iniciar");
    expect(state).toBe("destino_pendente");

    state = transitionSessionFlow(state, "aprovar");
    expect(state).toBe("destino_confirmado");

    state = transitionSessionFlow(state, "avancar");
    expect(state).toBe("hospedagem_pendente");

    state = transitionSessionFlow(state, "aprovar");
    expect(state).toBe("hospedagem_aprovada");

    state = transitionSessionFlow(state, "avancar");
    expect(state).toBe("passeios_pendente");

    state = transitionSessionFlow(state, "aprovar");
    expect(state).toBe("passeios_aprovados");

    state = transitionSessionFlow(state, "avancar");
    expect(state).toBe("roteiro_pendente");

    state = transitionSessionFlow(state, "aprovar");
    expect(state).toBe("roteiro_aprovado");

    state = transitionSessionFlow(state, "avancar");
    expect(state).toBe("concluida");

    expect(isTerminalSessionFlowState(state)).toBe(true);
  });

  it.each([
    "destino_pendente",
    "hospedagem_pendente",
    "passeios_pendente",
    "roteiro_pendente",
  ] as const)(
    "ajustar em %s regenera a sugestão sem avançar de etapa (RF-05)",
    (pendingState) => {
      expect(transitionSessionFlow(pendingState, "ajustar")).toBe(
        pendingState,
      );
    },
  );
});

describe("rejeição de transição inválida (pular etapa)", () => {
  it("rejeita pular de entrada_selecionada direto para uma etapa de hospedagem (aprovar sem antes iniciar/aprovar destino)", () => {
    expect(() =>
      transitionSessionFlow("entrada_selecionada", "aprovar"),
    ).toThrow(InvalidTransitionError);
  });

  it("rejeita aprovar direto em destino_confirmado, pulando hospedagem_pendente (não há sugestão pendente a aprovar ali)", () => {
    expect(() =>
      transitionSessionFlow("destino_confirmado", "aprovar"),
    ).toThrow(InvalidTransitionError);
  });

  it("rejeita avancar a partir de um estado pendente (precisa aprovar antes)", () => {
    expect(() => transitionSessionFlow("destino_pendente", "avancar")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejeita iniciar a partir de qualquer estado que não seja entrada_selecionada", () => {
    expect(() => transitionSessionFlow("destino_confirmado", "iniciar")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejeita qualquer ação sequencial a partir de um estado terminal (concluida)", () => {
    expect(() => transitionSessionFlow("concluida", "avancar")).toThrow(
      InvalidTransitionError,
    );
    expect(() => transitionSessionFlow("concluida", "aprovar")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejeita qualquer ação sequencial a partir de encerrada_parcial", () => {
    expect(() =>
      transitionSessionFlow("encerrada_parcial", "avancar"),
    ).toThrow(InvalidTransitionError);
  });

  it("erro carrega o estado atual e a ação para permitir log/diagnóstico", () => {
    try {
      transitionSessionFlow("entrada_selecionada", "avancar");
      expect.unreachable("deveria ter lançado InvalidTransitionError");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const invalidTransitionError = error as InvalidTransitionError;
      expect(invalidTransitionError.currentState).toBe("entrada_selecionada");
      expect(invalidTransitionError.action).toBe("avancar");
    }
  });
});

describe("regra de encerrada_parcial (RF-05.4/RN-03)", () => {
  it.each([
    "destino_confirmado",
    "hospedagem_pendente",
    "hospedagem_aprovada",
    "passeios_pendente",
    "passeios_aprovados",
    "roteiro_pendente",
    "roteiro_aprovado",
  ] as const)(
    "encerrar é aceito a partir de %s (pelo menos uma etapa já aprovada)",
    (state) => {
      expect(transitionSessionFlow(state, "encerrar")).toBe(
        "encerrada_parcial",
      );
    },
  );

  it.each(["entrada_selecionada", "destino_pendente"] as const)(
    "encerrar é rejeitado a partir de %s (nada foi aprovado ainda)",
    (state) => {
      expect(() => transitionSessionFlow(state, "encerrar")).toThrow(
        InvalidTransitionError,
      );
    },
  );

  it("encerrar é rejeitado a partir de concluida (já terminal, não é encerramento parcial)", () => {
    expect(() => transitionSessionFlow("concluida", "encerrar")).toThrow(
      InvalidTransitionError,
    );
  });

  it("encerrar é rejeitado a partir de encerrada_parcial (já terminal)", () => {
    expect(() =>
      transitionSessionFlow("encerrada_parcial", "encerrar"),
    ).toThrow(InvalidTransitionError);
  });
});

describe("isTerminalSessionFlowState", () => {
  it("true apenas para concluida e encerrada_parcial", () => {
    const terminal = SESSION_FLOW_STATES.filter((state) =>
      isTerminalSessionFlowState(state),
    );
    expect(terminal.sort()).toEqual(["concluida", "encerrada_parcial"].sort());
  });
});
