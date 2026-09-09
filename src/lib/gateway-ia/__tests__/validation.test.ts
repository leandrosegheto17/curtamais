// @vitest-environment node
//
// L3-T03 — Validação de plausibilidade de preço + grounding de data/
// calendário (ADR-003). Critério de aceite: "Resposta com preço fora de
// faixa plausível é rejeitada/reprocessada; datas geradas nunca conflitam
// com o range da sessão" — aqui testado diretamente contra os validadores
// (sem chamada ao provider; a integração com `generateStructuredCompletion`
// é coberta em `index.test.ts`).
import { describe, expect, it } from "vitest";
import { GatewayIaError } from "@/lib/gateway-ia/errors";
import { GATEWAY_IA_SCHEMA_NAMES } from "@/lib/gateway-ia/schemas";
import {
  validateDateGrounding,
  validateGatewayIaOutput,
  validatePricePlausibility,
} from "@/lib/gateway-ia/validation";

describe("validatePricePlausibility — destino (RF-04)", () => {
  const validDestinos = {
    destinos: [
      {
        nome: "Foz do Iguaçu",
        justificativa: "Clima ameno.",
        faixaPrecoMin: 1500,
        faixaPrecoMax: 2500,
      },
      {
        nome: "Gramado",
        justificativa: "Boa opção.",
        faixaPrecoMin: 1800,
        faixaPrecoMax: 2800,
      },
    ],
  };

  it("aceita faixa de preço plausível (critério de aceite)", () => {
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.destino, validDestinos),
    ).not.toThrow();
  });

  it("rejeita faixa invertida (min > max)", () => {
    const data = {
      destinos: [
        { ...validDestinos.destinos[0], faixaPrecoMin: 3000, faixaPrecoMax: 2500 },
        validDestinos.destinos[1],
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.destino, data),
    ).toThrow(GatewayIaError);
  });

  it("rejeita faixa zero-zero (destino nunca é gratuito)", () => {
    const data = {
      destinos: [
        { ...validDestinos.destinos[0], faixaPrecoMin: 0, faixaPrecoMax: 0 },
        validDestinos.destinos[1],
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.destino, data),
    ).toThrow(GatewayIaError);
  });

  it("rejeita valor acima do teto de sanidade (ordem de grandeza absurda)", () => {
    const data = {
      destinos: [
        { ...validDestinos.destinos[0], faixaPrecoMin: 1500, faixaPrecoMax: 5_000_000 },
        validDestinos.destinos[1],
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.destino, data),
    ).toThrow(GatewayIaError);
  });

  it("rejeita razão max/min absurda mesmo dentro do teto absoluto", () => {
    const data = {
      destinos: [
        { ...validDestinos.destinos[0], faixaPrecoMin: 100, faixaPrecoMax: 50_000 },
        validDestinos.destinos[1],
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.destino, data),
    ).toThrow(GatewayIaError);
  });
});

describe("validatePricePlausibility — hospedagem (RF-06)", () => {
  it("rejeita diária zero (hospedagem nunca é gratuita)", () => {
    const data = {
      opcoes: [
        {
          nome: "Pousada Central",
          tipo: "pousada",
          precoPorDiariaMin: 0,
          precoPorDiariaMax: 0,
          caracteristicaDistintiva: "Próxima ao centro",
        },
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.hospedagem, data),
    ).toThrow(GatewayIaError);
  });

  it("aceita diária plausível", () => {
    const data = {
      opcoes: [
        {
          nome: "Pousada Central",
          tipo: "pousada",
          precoPorDiariaMin: 150,
          precoPorDiariaMax: 250,
          caracteristicaDistintiva: "Próxima ao centro",
        },
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.hospedagem, data),
    ).not.toThrow();
  });
});

describe("validatePricePlausibility — passeios (RF-07)", () => {
  it("aceita preço zero quando o passeio é gratuito", () => {
    const data = {
      passeios: [
        {
          nome: "Caminhada na orla",
          precoMin: 0,
          precoMax: 0,
          gratuito: true,
          duracaoAproximada: "1 hora",
        },
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.passeios, data),
    ).not.toThrow();
  });

  it("rejeita preço zero quando o passeio NÃO é marcado como gratuito", () => {
    const data = {
      passeios: [
        {
          nome: "Passeio de barco",
          precoMin: 0,
          precoMax: 0,
          gratuito: false,
          duracaoAproximada: "2 horas",
        },
      ],
    };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.passeios, data),
    ).toThrow(GatewayIaError);
  });
});

describe("validatePricePlausibility — schemaName desconhecido/roteiro", () => {
  it("não valida nada para o schema de roteiro (sem campo de preço)", () => {
    const data = { dias: [] };
    expect(() =>
      validatePricePlausibility(GATEWAY_IA_SCHEMA_NAMES.roteiro, data),
    ).not.toThrow();
  });

  it("não valida nada para um schemaName arbitrário fora das 4 etapas conhecidas", () => {
    expect(() =>
      validatePricePlausibility("schema_arbitrario_de_teste", {
        qualquerCoisa: -999,
      }),
    ).not.toThrow();
  });
});

describe("validateDateGrounding — roteiro (RF-08)", () => {
  const dateRange = { dateRangeStart: "2026-10-10", dateRangeEnd: "2026-10-13" };

  it("aceita datas dentro do range da sessão (critério de aceite)", () => {
    const data = {
      dias: [
        { data: "2026-10-10", manha: [], tarde: [], noite: [] },
        { data: "2026-10-13", manha: [], tarde: [], noite: [] },
      ],
    };
    expect(() =>
      validateDateGrounding(GATEWAY_IA_SCHEMA_NAMES.roteiro, data, dateRange),
    ).not.toThrow();
  });

  it("rejeita data anterior ao início do range da sessão", () => {
    const data = {
      dias: [{ data: "2026-10-09", manha: [], tarde: [], noite: [] }],
    };
    expect(() =>
      validateDateGrounding(GATEWAY_IA_SCHEMA_NAMES.roteiro, data, dateRange),
    ).toThrow(GatewayIaError);
  });

  it("rejeita data posterior ao fim do range da sessão", () => {
    const data = {
      dias: [{ data: "2026-10-14", manha: [], tarde: [], noite: [] }],
    };
    expect(() =>
      validateDateGrounding(GATEWAY_IA_SCHEMA_NAMES.roteiro, data, dateRange),
    ).toThrow(GatewayIaError);
  });

  it("rejeita data não interpretável como ISO", () => {
    const data = {
      dias: [{ data: "dia 1 da viagem", manha: [], tarde: [], noite: [] }],
    };
    expect(() =>
      validateDateGrounding(GATEWAY_IA_SCHEMA_NAMES.roteiro, data, dateRange),
    ).toThrow(GatewayIaError);
  });

  it("ignora etapas que não são roteiro (sem data na saída)", () => {
    expect(() =>
      validateDateGrounding(GATEWAY_IA_SCHEMA_NAMES.destino, { destinos: [] }, dateRange),
    ).not.toThrow();
  });
});

describe("validateGatewayIaOutput (ponto único usado por generateStructuredCompletion)", () => {
  it("aplica preço e data juntos para a etapa roteiro quando dateRange é informado", () => {
    const data = {
      dias: [{ data: "2026-12-25", manha: [], tarde: [], noite: [] }],
    };
    expect(() =>
      validateGatewayIaOutput(GATEWAY_IA_SCHEMA_NAMES.roteiro, data, {
        dateRangeStart: "2026-10-10",
        dateRangeEnd: "2026-10-13",
      }),
    ).toThrow(GatewayIaError);
  });

  it("não exige dateRange para etapas sem data (destino/hospedagem/passeios)", () => {
    const data = {
      destinos: [
        {
          nome: "Foz do Iguaçu",
          justificativa: "Clima ameno.",
          faixaPrecoMin: 1500,
          faixaPrecoMax: 2500,
        },
        {
          nome: "Gramado",
          justificativa: "Boa opção.",
          faixaPrecoMin: 1800,
          faixaPrecoMax: 2800,
        },
      ],
    };
    expect(() =>
      validateGatewayIaOutput(GATEWAY_IA_SCHEMA_NAMES.destino, data),
    ).not.toThrow();
  });
});
