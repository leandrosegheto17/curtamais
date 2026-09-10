// @vitest-environment node
//
// L4-T03 — Regra RF-10 (filtro/priorização de orçamento nas sugestões).
// Critério de aceite: "Com orçamento informado, sugestões fora da faixa não
// aparecem como prioritárias; sem opção na faixa, retorna a mais barata com
// flag de excedente; ausência de orçamento nunca bloqueia."
import { describe, expect, it } from "vitest";
import {
  applyBudgetFilter,
  type PriceRangedSuggestion,
} from "@/lib/session-flow";

interface Destino extends PriceRangedSuggestion {
  nome: string;
}

function destino(nome: string, precoMin: number, precoMax: number): Destino {
  return { nome, precoMin, precoMax };
}

describe("applyBudgetFilter — sem orçamento informado (RF-10.3/RN-04)", () => {
  it("devolve a lista inalterada, na mesma ordem recebida, quando budget é undefined", () => {
    const suggestions = [
      destino("Caro", 5000, 8000),
      destino("Barato", 500, 1000),
    ];

    const result = applyBudgetFilter(suggestions, undefined);

    expect(result.map((r) => r.suggestion)).toEqual(suggestions);
    expect(result.every((r) => r.withinBudget)).toBe(true);
    expect(result.every((r) => !r.exceedsBudget)).toBe(true);
  });

  it("devolve a lista inalterada quando budget é null", () => {
    const suggestions = [destino("A", 100, 200), destino("B", 300, 400)];

    const result = applyBudgetFilter(suggestions, null);

    expect(result.map((r) => r.suggestion)).toEqual(suggestions);
  });
});

describe("applyBudgetFilter — orçamento informado, mistura dentro/fora da faixa (RF-10.1)", () => {
  it("prioriza (reordena) as sugestões dentro do orçamento primeiro, sem removê-las", () => {
    const caro = destino("Caro", 5000, 8000);
    const barato = destino("Barato", 500, 1000);
    const medio = destino("Medio", 1200, 1500);

    const result = applyBudgetFilter([caro, barato, medio], { amount: 1500 });

    // Dentro do orçamento (precoMin <= 1500) primeiro: barato, medio.
    expect(result.map((r) => r.suggestion)).toEqual([barato, medio, caro]);
    expect(result[0].withinBudget).toBe(true);
    expect(result[1].withinBudget).toBe(true);
    expect(result[2].withinBudget).toBe(false);
    // Nenhuma flag de excedente quando existe opção dentro da faixa.
    expect(result.every((r) => !r.exceedsBudget)).toBe(true);
  });

  it("mantém ordem estável dentro de cada grupo (dentro/fora)", () => {
    const a = destino("A", 100, 200);
    const b = destino("B", 5000, 6000);
    const c = destino("C", 150, 250);
    const d = destino("D", 7000, 8000);

    const result = applyBudgetFilter([a, b, c, d], { amount: 1000 });

    expect(result.map((r) => r.suggestion.nome)).toEqual(["A", "C", "B", "D"]);
  });
});

describe("applyBudgetFilter — nenhuma opção na faixa (RF-10.2)", () => {
  it("retorna a mais barata primeiro, com exceedsBudget=true, sem lançar erro", () => {
    const caro = destino("Caro", 5000, 8000);
    const maisCaro = destino("MaisCaro", 9000, 12000);
    const menosPior = destino("MenosPior", 6000, 7000);

    const result = applyBudgetFilter([caro, maisCaro, menosPior], {
      amount: 1000,
    });

    expect(result).toHaveLength(3);
    expect(result[0].suggestion).toEqual(caro);
    expect(result[0].exceedsBudget).toBe(true);
    expect(result[0].withinBudget).toBe(false);
    // Só a mais barata tem a flag de excedente marcada.
    expect(result.filter((r) => r.exceedsBudget)).toHaveLength(1);
    // Nenhuma sugestão foi removida (RN-04 nunca bloqueia/retorna vazio).
    expect(result.map((r) => r.suggestion)).toEqual(
      expect.arrayContaining([caro, maisCaro, menosPior]),
    );
  });

  it("nunca retorna lista vazia mesmo quando todas excedem o orçamento", () => {
    const result = applyBudgetFilter([destino("Unica", 1000, 2000)], {
      amount: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].exceedsBudget).toBe(true);
  });
});

describe("applyBudgetFilter — edge cases", () => {
  it("lista de entrada vazia devolve lista vazia, com ou sem orçamento", () => {
    expect(applyBudgetFilter([], { amount: 1000 })).toEqual([]);
    expect(applyBudgetFilter([], undefined)).toEqual([]);
  });

  it("sugestão cujo precoMin é exatamente igual ao teto é considerada dentro do orçamento", () => {
    const noLimite = destino("NoLimite", 1000, 1200);

    const result = applyBudgetFilter([noLimite], { amount: 1000 });

    expect(result[0].withinBudget).toBe(true);
    expect(result[0].exceedsBudget).toBe(false);
  });
});
