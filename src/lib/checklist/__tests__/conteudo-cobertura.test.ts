import { describe, expect, it } from "vitest";
import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";
import { validarItemKey } from "../calendario";
import {
  MAPA_DESTINOS_CHECKLIST,
  SLUGS_DESTINOS_CHECKLIST,
} from "../conteudo/destinos";
import { ITENS_PERFIS_INTERIOR } from "../conteudo/perfis-interior";
import { ITENS_PERFIS_LITORANEOS } from "../conteudo/perfis-litoraneos";
import { ITENS_UNIVERSAIS } from "../conteudo/universal";
import { AVISO_CONFERIR_ENTRADA, AVISO_SEM_DATAS, gerarChecklist } from "../regra";
import {
  CATEGORIAS_CHECKLIST,
  ESTACOES,
  PERFIS_CLIMA,
  TIPOS_VIAGEM,
  type ConteudoChecklist,
  type ItemChecklist,
} from "../tipos";

const itensPorPerfil = [...ITENS_PERFIS_LITORANEOS, ...ITENS_PERFIS_INTERIOR];
const conteudo: ConteudoChecklist = {
  universais: ITENS_UNIVERSAIS,
  itensPorPerfil,
  perfilPorSlug: MAPA_DESTINOS_CHECKLIST,
};
const todos: ItemChecklist[] = [...ITENS_UNIVERSAIS, ...itensPorPerfil];
const OBRIGATORIAS = [
  "documentos",
  "roupas",
  "higiene",
  "eletronicos",
  "antes",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
// Início no dia 1 de cada mês de 2027; duração em dias por faixa.
const DURACOES = { curta: 2, media: 5, longa: 10 } as const;
function periodo(mes: number, dias: number) {
  return {
    dataInicio: `2027-${pad(mes)}-01`,
    dataFim: `2027-${pad(mes)}-${pad(dias)}`,
  };
}

describe("cobertura do catálogo", () => {
  const slugsCatalogo = CATALOGO_DESTINOS.map((d) => d.slug);

  it("tupla de slugs == slugs do catálogo (sem sobra nem falta)", () => {
    expect([...SLUGS_DESTINOS_CHECKLIST].sort()).toEqual([...slugsCatalogo].sort());
    expect(new Set(SLUGS_DESTINOS_CHECKLIST).size).toBe(SLUGS_DESTINOS_CHECKLIST.length);
  });

  it("mapa tem uma entrada por slug, com valores válidos", () => {
    expect(Object.keys(MAPA_DESTINOS_CHECKLIST).sort()).toEqual([...slugsCatalogo].sort());
    for (const p of Object.values(MAPA_DESTINOS_CHECKLIST)) {
      expect(PERFIS_CLIMA).toContain(p.perfil);
      expect(TIPOS_VIAGEM).toContain(p.tipo);
      for (const m of p.mesesChuvosos) {
        expect(Number.isInteger(m) && m >= 1 && m <= 12).toBe(true);
      }
    }
  });

  it("falha se um slug do catálogo ficar sem entrada (simulação)", () => {
    const sem = { ...MAPA_DESTINOS_CHECKLIST } as Record<string, unknown>;
    delete sem[slugsCatalogo[0]];
    expect(Object.keys(sem).sort()).not.toEqual([...slugsCatalogo].sort());
  });

  it("âncoras do PRD", () => {
    const m = MAPA_DESTINOS_CHECKLIST;
    expect(m["fernando-de-noronha"].perfil).toBe("natureza-aventura");
    expect(m["lencois-maranhenses"].perfil).toBe("natureza-aventura");
    expect(m["gramado"].perfil).toBe("serra-fria");
    expect(m["campos-do-jordao"].perfil).toBe("serra-fria");
  });
});

describe("integridade das itemKey", () => {
  it("todas válidas e únicas em todo o conteúdo", () => {
    const chaves = todos.map((i) => i.itemKey);
    for (const c of chaves) expect(validarItemKey(c), c).toBe(true);
    expect(chaves.filter((c, i) => chaves.indexOf(c) !== i)).toEqual([]);
  });

  it("prefixo da chave == categoria e categoria conhecida", () => {
    for (const i of todos) {
      expect(CATEGORIAS_CHECKLIST).toContain(i.categoria);
      expect(i.itemKey.split(".")[0], i.itemKey).toBe(i.categoria);
      expect(i.texto.trim().length).toBeGreaterThan(0);
    }
  });

  it("universais não dependem de perfis/tipos", () => {
    for (const i of ITENS_UNIVERSAIS) {
      expect(i.quando?.perfis, i.itemKey).toBeUndefined();
      expect(i.quando?.tipos, i.itemKey).toBeUndefined();
    }
  });

  it("valores de `quando` pertencem às uniões", () => {
    for (const i of itensPorPerfil) {
      i.quando?.perfis?.forEach((p) => expect(PERFIS_CLIMA).toContain(p));
      i.quando?.tipos?.forEach((t) => expect(TIPOS_VIAGEM).toContain(t));
      i.quando?.estacoes?.forEach((e) => expect(ESTACOES).toContain(e));
    }
  });
});

describe("geração: destino x 12 meses x 3 faixas", () => {
  const nomes = CATALOGO_DESTINOS.map((d) => d.nome);

  it("toda combinação tem >= 1 item por categoria obrigatória e sem avisos", () => {
    let combos = 0;
    for (const nome of nomes) {
      for (let mes = 1; mes <= 12; mes++) {
        for (const [faixa, dias] of Object.entries(DURACOES)) {
          const r = gerarChecklist({ destino: nome, ...periodo(mes, dias) }, conteudo);
          combos++;
          const ctx = `${nome} mes=${mes} ${faixa}`;
          expect(r.avisos, ctx).toEqual([]);
          for (const c of OBRIGATORIAS) {
            expect(r.itens.some((i) => i.categoria === c), `${ctx} ${c}`).toBe(true);
          }
          const ks = r.itens.map((i) => i.itemKey);
          expect(new Set(ks).size, ctx).toBe(ks.length);
        }
      }
    }
    expect(combos).toBe(CATALOGO_DESTINOS.length * 12 * 3);
  });

  it("determinismo", () => {
    const e = { destino: nomes[0], ...periodo(7, 5) };
    expect(gerarChecklist(e, conteudo)).toEqual(gerarChecklist(e, conteudo));
  });
});

describe("casos de borda com o conteúdo real", () => {
  it("Lisboa: só universais aplicáveis + aviso", () => {
    const r = gerarChecklist({ destino: "Lisboa", ...periodo(7, 5) }, conteudo);
    expect(r.avisos).toContain(AVISO_CONFERIR_ENTRADA);
    for (const c of OBRIGATORIAS) {
      expect(r.itens.some((i) => i.categoria === c), c).toBe(true);
    }
    for (const i of r.itens) {
      expect(i.quando?.perfis).toBeUndefined();
      expect(i.quando?.tipos).toBeUndefined();
    }
  });

  it("sem datas: aviso e nenhum item sazonal", () => {
    const r = gerarChecklist(
      { destino: "Gramado", dataInicio: null, dataFim: null },
      conteudo,
    );
    expect(r.avisos).toContain(AVISO_SEM_DATAS);
    for (const i of r.itens) {
      expect(i.quando?.estacoes).toBeUndefined();
      expect(i.quando?.chuvoso).toBeUndefined();
      expect(i.quando?.duracoes).toBeUndefined();
    }
    for (const c of OBRIGATORIAS) {
      expect(r.itens.some((i) => i.categoria === c), c).toBe(true);
    }
  });

  it("sem destino e sem datas nunca lança", () => {
    expect(() =>
      gerarChecklist({ destino: null, dataInicio: null, dataFim: null }, conteudo),
    ).not.toThrow();
  });
});
