// @vitest-environment node
// V2-L9-T02 — calendário e itemKey (ADR-013).
import { describe, expect, it } from "vitest";
import {
  duracaoEmDias,
  estacaoDoMes,
  estacoesDoPeriodo,
  faixaDeDuracao,
  mesesDoPeriodo,
  validarItemKey,
} from "@/lib/checklist/calendario";

describe("estacaoDoMes", () => {
  const esperado = [
    "verao", "verao", "outono", "outono", "outono", "inverno",
    "inverno", "inverno", "primavera", "primavera", "primavera", "verao",
  ];
  it.each(esperado.map((e, i) => [i + 1, e]))("mês %i -> %s", (mes, e) => {
    expect(estacaoDoMes(mes as number)).toBe(e);
  });
  it("rejeita mês fora de 1-12", () => {
    expect(() => estacaoDoMes(0)).toThrow();
    expect(() => estacaoDoMes(13)).toThrow();
  });
});

describe("faixaDeDuracao (inclusiva)", () => {
  it.each([
    [1, "curta"], [3, "curta"], [4, "media"], [7, "media"], [8, "longa"], [15, "longa"],
  ])("%i dias -> %s", (d, f) => {
    expect(faixaDeDuracao(d as number)).toBe(f);
  });
  it("duracaoEmDias conta inclusivamente", () => {
    expect(duracaoEmDias("2026-07-10", "2026-07-10")).toBe(1);
    expect(duracaoEmDias("2026-07-10", "2026-07-17")).toBe(8);
    expect(duracaoEmDias("2026-12-30", "2027-01-02")).toBe(4);
  });
});

describe("mesesDoPeriodo", () => {
  it("mesmo mês -> 1 mês", () => {
    expect(mesesDoPeriodo("2026-07-01", "2026-07-31")).toEqual([7]);
  });
  it("cruza o ano (dez-jan) devolve os 2 meses", () => {
    expect(mesesDoPeriodo("2026-12-28", "2027-01-03")).toEqual([12, 1]);
  });
  it("cruza estações = união dos meses", () => {
    expect(mesesDoPeriodo("2026-08-28", "2026-09-02")).toEqual([8, 9]);
    expect(estacoesDoPeriodo("2026-08-28", "2026-09-02")).toEqual(["inverno", "primavera"]);
  });
  it("limita a 12 meses distintos", () => {
    expect(mesesDoPeriodo("2026-01-01", "2028-06-01")).toHaveLength(12);
  });
  it("fim antes do início -> vazio", () => {
    expect(mesesDoPeriodo("2026-07-10", "2026-07-01")).toEqual([]);
  });
});

describe("validarItemKey", () => {
  it.each(["documentos.rg-ou-cnh", "clima.agasalho-pesado", "antes.pet"])(
    "aceita %s",
    (k) => expect(validarItemKey(k)).toBe(true),
  );
  it.each([
    "Documentos.rg", "documentos.RG", "documentos.calção", "documentos.rg ou",
    "documentos..rg", "documentos.rg-", "documentos.-rg", "documentos", "doc1.rg",
    "documentos.rg--x", "", ".rg",
  ])("rejeita %j", (k) => expect(validarItemKey(k)).toBe(false));
  it("rejeita não-string", () => {
    expect(validarItemKey(null)).toBe(false);
    expect(validarItemKey(42)).toBe(false);
  });
  it("limite de 64 caracteres", () => {
    const ok = "a." + "b".repeat(62);
    expect(ok).toHaveLength(64);
    expect(validarItemKey(ok)).toBe(true);
    expect(validarItemKey(ok + "b")).toBe(false);
  });
});
