// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_CHECKLIST,
  ESTACOES,
  FAIXAS_DURACAO,
  PERFIS_CLIMA,
  ROTULO_CATEGORIA,
} from "@/lib/checklist/tipos";
import { validarItemKey } from "@/lib/checklist/calendario";

describe("tipos do checklist", () => {
  it("tem as 6 categorias na ordem fixa do UX-SPEC", () => {
    expect([...CATEGORIAS_CHECKLIST]).toEqual([
      "documentos",
      "roupas",
      "higiene",
      "eletronicos",
      "clima",
      "antes",
    ]);
  });
  it("rótulos exatos do UX-SPEC, um por categoria, na mesma ordem", () => {
    expect(CATEGORIAS_CHECKLIST.map((c) => ROTULO_CATEGORIA[c])).toEqual([
      "Documentos e dinheiro",
      "Roupas e calçados",
      "Higiene e cuidados",
      "Eletrônicos e carregadores",
      "Itens do clima e do tipo de viagem",
      "Antes de sair de casa",
    ]);
  });
  it("chave de categoria é válida como prefixo de itemKey", () => {
    for (const c of CATEGORIAS_CHECKLIST) {
      expect(validarItemKey(`${c}.exemplo`)).toBe(true);
    }
  });
  it("uniões fechadas esperadas", () => {
    expect(PERFIS_CLIMA).toHaveLength(6);
    expect(ESTACOES).toHaveLength(4);
    expect(FAIXAS_DURACAO).toEqual(["curta", "media", "longa"]);
  });
});
