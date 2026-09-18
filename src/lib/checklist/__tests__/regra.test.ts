import { describe, expect, it } from "vitest";
import {
  AVISO_CONFERIR_ENTRADA,
  AVISO_SEM_DATAS,
  gerarChecklist,
} from "../regra";
import type { ConteudoChecklist, ItemChecklist } from "../tipos";

const it_ = (
  itemKey: string,
  quando?: ItemChecklist["quando"],
): ItemChecklist => ({
  itemKey,
  categoria: itemKey.split(".")[0] as ItemChecklist["categoria"],
  texto: itemKey,
  ...(quando ? { quando } : {}),
});

const conteudo: ConteudoChecklist = {
  universais: [
    it_("higiene.escova"),
    it_("documentos.rg-ou-cnh"),
    it_("roupas.kit-lavagem", { duracoes: ["longa"] }),
    it_("roupas.camisetas", { duracoes: ["curta", "media"] }),
  ],
  itensPorPerfil: [
    it_("clima.agasalho", { estacoes: ["inverno"] }),
    it_("clima.protetor", { perfis: ["praia-tropical"], estacoes: ["verao", "primavera"] }),
    it_("clima.capa-de-chuva", { chuvoso: true }),
    it_("clima.trilha", { tipos: ["natureza"] }),
    it_("clima.casaco-serra", { perfis: ["serra-fria"] }),
    it_("antes.regar-plantas"),
  ],
  perfilPorSlug: {
    gramado: { perfil: "serra-fria", tipo: "serra", mesesChuvosos: [1, 2] },
    "porto-de-galinhas": {
      perfil: "praia-tropical",
      tipo: "praia",
      mesesChuvosos: [4, 5, 6],
    },
  },
};

const keys = (r: ReturnType<typeof gerarChecklist>) => r.itens.map((i) => i.itemKey);

describe("gerarChecklist", () => {
  it("filtra por perfil, tipo, estação, chuva e duração", () => {
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: "2026-07-10", dataFim: "2026-07-12" },
      conteudo,
    );
    const k = keys(r);
    expect(k).toContain("clima.casaco-serra");
    expect(k).toContain("clima.agasalho");
    expect(k).toContain("roupas.camisetas");
    expect(k).not.toContain("roupas.kit-lavagem");
    expect(k).not.toContain("clima.protetor");
    expect(k).not.toContain("clima.trilha");
    expect(k).not.toContain("clima.capa-de-chuva");
    expect(r.avisos).toEqual([]);
  });

  it("chuvoso só em mês chuvoso do destino", () => {
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: "2026-01-10", dataFim: "2026-01-20" },
      conteudo,
    );
    expect(keys(r)).toContain("clima.capa-de-chuva");
    expect(keys(r)).toContain("roupas.kit-lavagem");
  });

  it("une meses quando o período cruza estações", () => {
    const r = gerarChecklist(
      { destino: "Porto de Galinhas", dataInicio: "2026-08-28", dataFim: "2026-09-03" },
      conteudo,
    );
    expect(keys(r)).toContain("clima.agasalho"); // inverno (ago)
    expect(keys(r)).toContain("clima.protetor"); // primavera (set)
  });

  it("cruza o ano-novo", () => {
    const r = gerarChecklist(
      { destino: "Porto de Galinhas", dataInicio: "2026-12-28", dataFim: "2027-01-03" },
      conteudo,
    );
    expect(keys(r)).toContain("clima.protetor");
  });

  it("sem datas omite sazonais e avisa", () => {
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: null, dataFim: "2026-07-12" },
      conteudo,
    );
    const k = keys(r);
    expect(k).not.toContain("clima.agasalho");
    expect(k).not.toContain("roupas.camisetas");
    expect(k).not.toContain("clima.capa-de-chuva");
    expect(k).toContain("clima.casaco-serra");
    expect(r.avisos).toEqual([AVISO_SEM_DATAS]);
  });

  it("datas inválidas ou invertidas contam como sem datas", () => {
    for (const [a, b] of [["x", "y"], ["2026-07-10", "2026-07-01"]]) {
      const r = gerarChecklist({ destino: "Gramado", dataInicio: a, dataFim: b }, conteudo);
      expect(r.avisos).toContain(AVISO_SEM_DATAS);
    }
  });

  it("destino fora do catálogo: só universais + nota, sem clima", () => {
    const r = gerarChecklist(
      { destino: "Lisboa", dataInicio: "2026-07-10", dataFim: "2026-07-12" },
      conteudo,
    );
    expect(keys(r)).toEqual([
      "documentos.rg-ou-cnh",
      "roupas.camisetas",
      "higiene.escova",
      "antes.regar-plantas",
    ]);
    expect(r.avisos).toEqual([AVISO_CONFERIR_ENTRADA]);
    expect(r.avisos.join(" ")).not.toMatch(/visto|passaporte|vacina|clima/i);
  });

  it("destino nulo ou vazio é tratado como fora do catálogo", () => {
    for (const destino of [null, "  "]) {
      const r = gerarChecklist({ destino, dataInicio: null, dataFim: null }, conteudo);
      expect(r.avisos).toEqual([AVISO_SEM_DATAS, AVISO_CONFERIR_ENTRADA]);
    }
  });

  it("resolve por correspondência exata normalizada, nunca aproximada", () => {
    const d = { dataInicio: "2026-07-10", dataFim: "2026-07-12" };
    const exato = gerarChecklist({ destino: "  GRAMADO ", ...d }, conteudo);
    expect(keys(exato)).toContain("clima.casaco-serra");
    const aprox = gerarChecklist({ destino: "Gramad", ...d }, conteudo);
    expect(aprox.avisos).toContain(AVISO_CONFERIR_ENTRADA);
    expect(keys(aprox)).not.toContain("clima.casaco-serra");
  });

  it("destino do catálogo sem conteúdo cai em fora do catálogo", () => {
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: null, dataFim: null },
      { ...conteudo, perfilPorSlug: {} },
    );
    expect(r.avisos).toContain(AVISO_CONFERIR_ENTRADA);
  });

  it("ordena por categoria fixa e depois por declaração; determinístico", () => {
    const e = { destino: "Gramado", dataInicio: "2026-07-10", dataFim: "2026-07-12" };
    const r1 = gerarChecklist(e, conteudo);
    expect(keys(r1)).toEqual([
      "documentos.rg-ou-cnh",
      "roupas.camisetas",
      "higiene.escova",
      "clima.agasalho",
      "clima.casaco-serra",
      "antes.regar-plantas",
    ]);
    expect(gerarChecklist(e, conteudo)).toEqual(r1);
  });

  it("itemKey único na saída", () => {
    const dup = {
      ...conteudo,
      itensPorPerfil: [...conteudo.itensPorPerfil, it_("higiene.escova")],
    };
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: "2026-07-10", dataFim: "2026-07-12" },
      dup,
    );
    expect(new Set(keys(r)).size).toBe(r.itens.length);
  });
});
