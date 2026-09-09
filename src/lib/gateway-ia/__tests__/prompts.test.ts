// @vitest-environment node
//
// L3-T02 — Prompt design + contexto acumulado por etapa (ADR-003). Cobre o
// critério de aceite "prompt de cada etapa documentado": cada builder monta
// o prompt a partir do contexto informado, sem chamada de rede (não
// depende do SDK da OpenAI, só monta `GatewayIaMessage[]`).
import { describe, expect, it } from "vitest";
import {
  GATEWAY_IA_STAGES,
  buildDestinoPrompt,
  buildHospedagemPrompt,
  buildPasseiosPrompt,
  buildRoteiroPrompt,
  isGatewayIaStage,
  type StageContext,
} from "@/lib/gateway-ia/prompts";

const baseContext: StageContext = {
  referenceDate: "2026-09-09",
  dateRangeStart: "2026-10-10",
  dateRangeEnd: "2026-10-13",
  budgetAmount: 2000,
  budgetCurrency: "BRL",
};

function allContent(messages: { content: string }[]): string {
  return messages.map((message) => message.content).join("\n");
}

describe("isGatewayIaStage", () => {
  it("reconhece as 4 etapas válidas e rejeita valores desconhecidos", () => {
    expect(isGatewayIaStage("destino")).toBe(true);
    expect(isGatewayIaStage("hospedagem")).toBe(true);
    expect(isGatewayIaStage("passeios")).toBe(true);
    expect(isGatewayIaStage("roteiro")).toBe(true);
    expect(isGatewayIaStage("invalida")).toBe(false);
  });
});

describe("buildDestinoPrompt (RF-04)", () => {
  it("inclui datas, orçamento e pedido de 2-4 destinos", () => {
    const messages = buildDestinoPrompt(baseContext);
    const text = allContent(messages);

    expect(messages[0].role).toBe("system");
    expect(text).toContain("2026-10-10");
    expect(text).toContain("2026-10-13");
    expect(text).toContain("2026-09-09"); // grounding de data corrente
    expect(text).toContain("2000");
    expect(text).toMatch(/2 e 4 destinos/);
  });

  it("nunca bloqueia geração quando orçamento não foi informado (RF-10.3)", () => {
    const messages = buildDestinoPrompt({
      ...baseContext,
      budgetAmount: null,
      budgetCurrency: null,
    });
    const text = allContent(messages);
    expect(text).toContain("não informado");
  });
});

describe("buildHospedagemPrompt (RF-06)", () => {
  it("inclui o destino já aprovado e pede exatamente 3 opções", () => {
    const messages = buildHospedagemPrompt({
      ...baseContext,
      destination: { name: "Foz do Iguaçu" },
    });
    const text = allContent(messages);
    expect(text).toContain("Foz do Iguaçu");
    expect(text).toMatch(/exatamente 3 opções/);
  });

  it("lança erro claro se chamada sem destino aprovado (pré-condição de etapa)", () => {
    expect(() => buildHospedagemPrompt(baseContext)).toThrow(
      /context\.destination/,
    );
  });
});

describe("buildPasseiosPrompt (RF-07)", () => {
  it("inclui destino aprovado e pede ao menos um item gratuito quando existir", () => {
    const messages = buildPasseiosPrompt({
      ...baseContext,
      destination: { name: "Foz do Iguaçu" },
      accommodation: { name: "Pousada Central", type: "pousada" },
    });
    const text = allContent(messages);
    expect(text).toContain("Foz do Iguaçu");
    expect(text).toContain("Pousada Central");
    expect(text).toMatch(/gratuit/i);
  });

  it("lança erro claro se chamada sem destino aprovado", () => {
    expect(() => buildPasseiosPrompt(baseContext)).toThrow(
      /context\.destination/,
    );
  });
});

describe("buildRoteiroPrompt (RF-08)", () => {
  const contextComTudo: StageContext = {
    ...baseContext,
    destination: { name: "Foz do Iguaçu" },
    accommodation: { name: "Pousada Central", type: "pousada" },
    approvedActivities: [
      { name: "Cataratas do Iguaçu", durationApprox: "meio dia", isFree: false },
    ],
  };

  it("inclui destino, hospedagem e passeios aprovados, pedindo manhã/tarde/noite", () => {
    const messages = buildRoteiroPrompt(contextComTudo);
    const text = allContent(messages);
    expect(text).toContain("Foz do Iguaçu");
    expect(text).toContain("Pousada Central");
    expect(text).toContain("Cataratas do Iguaçu");
    expect(text.replace(/\n/g, " ")).toMatch(/manh[ãa].*tarde.*noite/i);
  });

  it("lança erro claro se chamada sem destino aprovado", () => {
    expect(() =>
      buildRoteiroPrompt({
        ...baseContext,
        accommodation: { name: "Pousada Central", type: "pousada" },
      }),
    ).toThrow(/context\.destination/);
  });

  it("lança erro claro se chamada sem hospedagem aprovada", () => {
    expect(() =>
      buildRoteiroPrompt({
        ...baseContext,
        destination: { name: "Foz do Iguaçu" },
      }),
    ).toThrow(/context\.accommodation/);
  });

  it("funciona mesmo sem passeios aprovados (não obrigatório)", () => {
    const messages = buildRoteiroPrompt({
      ...baseContext,
      destination: { name: "Foz do Iguaçu" },
      accommodation: { name: "Pousada Central", type: "pousada" },
    });
    expect(allContent(messages)).toMatch(/[Nn]enhum passeio específico/);
  });
});

describe("GATEWAY_IA_STAGES (registro central)", () => {
  it("tem uma entrada por etapa, cada uma com schemaName/schema/buildMessages", () => {
    for (const stage of ["destino", "hospedagem", "passeios", "roteiro"] as const) {
      const definition = GATEWAY_IA_STAGES[stage];
      expect(definition.schemaName).toBeTruthy();
      expect(typeof definition.buildMessages).toBe("function");
      expect(definition.schema).toBeDefined();
    }
  });
});
