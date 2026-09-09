// @vitest-environment node
//
// L3-T02 — JSON schema de saída por etapa (ADR-003). Critério de aceite:
// "schema de saída validado" — cada schema valida um payload de exemplo
// correto e rejeita um payload inválido, para as 4 etapas.
import { describe, expect, it } from "vitest";
import {
  destinoSugestoesSchema,
  hospedagemOpcoesSchema,
  passeiosOpcoesSchema,
  roteiroEstruturadoSchema,
} from "@/lib/gateway-ia/schemas";

describe("destinoSugestoesSchema (RF-04)", () => {
  it("aceita entre 2 e 4 destinos com os campos esperados", () => {
    const result = destinoSugestoesSchema.safeParse({
      destinos: [
        {
          nome: "Foz do Iguaçu",
          justificativa: "Clima ameno e dentro do orçamento.",
          faixaPrecoMin: 1500,
          faixaPrecoMax: 2500,
        },
        {
          nome: "Gramado",
          justificativa: "Boa opção de fim de semana prolongado.",
          faixaPrecoMin: 1800,
          faixaPrecoMax: 2800,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita menos de 2 destinos", () => {
    const result = destinoSugestoesSchema.safeParse({
      destinos: [
        {
          nome: "Foz do Iguaçu",
          justificativa: "Clima ameno.",
          faixaPrecoMin: 1500,
          faixaPrecoMax: 2500,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preço negativo", () => {
    const result = destinoSugestoesSchema.safeParse({
      destinos: [
        {
          nome: "Foz do Iguaçu",
          justificativa: "Clima ameno.",
          faixaPrecoMin: -100,
          faixaPrecoMax: 2500,
        },
        {
          nome: "Gramado",
          justificativa: "Boa opção.",
          faixaPrecoMin: 1800,
          faixaPrecoMax: 2800,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("hospedagemOpcoesSchema (RF-06)", () => {
  const validOpcao = {
    nome: "Pousada Central",
    tipo: "pousada",
    precoPorDiariaMin: 150,
    precoPorDiariaMax: 250,
    caracteristicaDistintiva: "Próxima ao centro histórico",
  };

  it("aceita exatamente 3 opções", () => {
    const result = hospedagemOpcoesSchema.safeParse({
      opcoes: [validOpcao, validOpcao, validOpcao],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita quando não há exatamente 3 opções", () => {
    const result = hospedagemOpcoesSchema.safeParse({
      opcoes: [validOpcao, validOpcao],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita opção sem característica distintiva", () => {
    const { caracteristicaDistintiva, ...semDistintiva } = validOpcao;
    void caracteristicaDistintiva;
    const result = hospedagemOpcoesSchema.safeParse({
      opcoes: [semDistintiva, validOpcao, validOpcao],
    });
    expect(result.success).toBe(false);
  });
});

describe("passeiosOpcoesSchema (RF-07)", () => {
  it("aceita passeios com preço zero quando gratuito", () => {
    const result = passeiosOpcoesSchema.safeParse({
      passeios: [
        {
          nome: "Caminhada na orla",
          precoMin: 0,
          precoMax: 0,
          gratuito: true,
          duracaoAproximada: "1 hora",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita lista vazia de passeios", () => {
    const result = passeiosOpcoesSchema.safeParse({ passeios: [] });
    expect(result.success).toBe(false);
  });

  it("rejeita item sem duração aproximada", () => {
    const result = passeiosOpcoesSchema.safeParse({
      passeios: [
        {
          nome: "Caminhada na orla",
          precoMin: 0,
          precoMax: 0,
          gratuito: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("roteiroEstruturadoSchema (RF-08)", () => {
  const validDia = {
    data: "2026-10-10",
    manha: [
      {
        atividade: "Visita às Cataratas",
        horarioSugerido: "09:00",
        justificativaTiming: "Luz do dia melhor para fotos",
      },
    ],
    tarde: [],
    noite: [
      {
        atividade: "Jantar no centro",
        horarioSugerido: "19:30",
        justificativaTiming: null,
      },
    ],
  };

  it("aceita um roteiro com pelo menos 1 dia, blocos manhã/tarde/noite", () => {
    const result = roteiroEstruturadoSchema.safeParse({ dias: [validDia] });
    expect(result.success).toBe(true);
  });

  it("aceita justificativaTiming nula (nem toda atividade tem)", () => {
    const result = roteiroEstruturadoSchema.safeParse({
      dias: [{ ...validDia, tarde: [{ atividade: "Descanso", horarioSugerido: "14:00", justificativaTiming: null }] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita roteiro sem nenhum dia", () => {
    const result = roteiroEstruturadoSchema.safeParse({ dias: [] });
    expect(result.success).toBe(false);
  });

  it("rejeita dia sem o bloco de manhã (estrutura incompleta)", () => {
    const { manha, ...diaSemManha } = validDia;
    void manha;
    const result = roteiroEstruturadoSchema.safeParse({ dias: [diaSemManha] });
    expect(result.success).toBe(false);
  });
});
