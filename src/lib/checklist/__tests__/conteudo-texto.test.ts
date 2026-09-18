// V2-L9-T15 — Texto e coerência climática do conteúdo do checklist.
import { describe, expect, it } from "vitest";
import * as copy from "@/components/checklist/checklist-copy";
import { ITENS_PERFIS_INTERIOR } from "../conteudo/perfis-interior";
import { ITENS_PERFIS_LITORANEOS } from "../conteudo/perfis-litoraneos";
import { ITENS_UNIVERSAIS } from "../conteudo/universal";
import { MAPA_DESTINOS_CHECKLIST } from "../conteudo/destinos";
import { AVISO_CONFERIR_ENTRADA, AVISO_SEM_DATAS, gerarChecklist } from "../regra";
import { ROTULO_CATEGORIA } from "../tipos";
import type { ConteudoChecklist, ItemChecklist } from "../tipos";

const itensPorPerfil = [...ITENS_PERFIS_LITORANEOS, ...ITENS_PERFIS_INTERIOR];
const conteudo: ConteudoChecklist = {
  universais: ITENS_UNIVERSAIS,
  itensPorPerfil,
  perfilPorSlug: MAPA_DESTINOS_CHECKLIST,
};
const todosItens: ItemChecklist[] = [...ITENS_UNIVERSAIS, ...itensPorPerfil];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Proibidos do checklist (UX-SPEC §9.8) e da tabela §8.8, por palavra/expressão.
const PROIBIDOS = [
  "visto", "passaporte", "vacina", "reservar", "comprar",
  "reserve", "faca sua reserva", "compre", "garantir vaga", "garanta",
  "finalizar compra", "checkout", "pagar", "pagamento", "carrinho", "oferta",
  "promocao", "pacote", "melhor preco", "preco final", "disponibilidade",
  "emitir", "agencia", "agente de viagens", "nossa equipe",
  "nossos especialistas", "atendente", "atendimento", "consultor humano",
  "especialista", "aprovar", "submeter", "enviar dados", "sessao",
  "operacao invalida",
];
const reProibido = (t: string) =>
  PROIBIDOS.filter((p) => new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(norm(t)));

const textosFixos = (): string[] => [
  ...Object.values(copy).map((v) =>
    typeof v === "function" ? (v as (a: number, b: number) => string)(3, 10) : String(v),
  ),
  AVISO_SEM_DATAS,
  AVISO_CONFERIR_ENTRADA,
  ...Object.values(ROTULO_CATEGORIA),
];

const textosDoConteudo = (itens: ItemChecklist[]) => itens.map((i) => i.texto);
const achados = (textos: string[]) => textos.flatMap((t) => reProibido(t).map((p) => `${p}: ${t}`));

describe("vocabulário proibido", () => {
  it("conteúdo real e textos fixos passam", () => {
    expect(achados(textosDoConteudo(todosItens))).toEqual([]);
    expect(achados(textosFixos())).toEqual([]);
  });

  it("varre os textos fixos (não vazio)", () => {
    expect(textosFixos().length).toBeGreaterThan(8);
  });

  it("prova de detecção: injetar passaporte/reservar/Visto é pego", () => {
    for (const palavra of ["passaporte", "reservar", "Vísto", "COMPRAR"]) {
      const injetado = [...textosDoConteudo(todosItens), `Levar ${palavra} da hospedagem`];
      expect(achados(injetado).length).toBe(1);
    }
    expect(achados(["Visto de entrada"])).toHaveLength(1);
    // palavra inteira: "revisto" não dispara
    expect(achados(["Carregador revisto"])).toEqual([]);
  });
});

describe("saúde e perfis de pessoa", () => {
  const EXCECAO = new Set([
    "documentos.cartao-plano-de-saude",
    "documentos.autorizacao-do-menor",
  ]);
  const re = /(^|[^a-z])(crianca|criancas|adolescente|adolescentes|idoso|idosa|idosos|gestante|gestantes|gravida|gravidas|doenca|doencas|medicamento|medicamentos|remedio|remedios|saude)([^a-z]|$)/;

  it("só os 2 itens condicionais da lista de exceção mencionam", () => {
    const menciona = todosItens.filter((i) => re.test(norm(i.texto))).map((i) => i.itemKey);
    expect(menciona.sort()).toEqual([...EXCECAO].sort());
  });

  it("prova de detecção", () => {
    expect(re.test(norm("Remédio para a criança"))).toBe(true);
  });
});

describe("coerência climática", () => {
  const gerar = (destino: string, ini: string, fim: string) =>
    gerarChecklist({ destino, dataInicio: ini, dataFim: fim }, conteudo).itens;
  const pesado = (i: ItemChecklist) =>
    /pesado|grosso|casaco pesado/.test(norm(i.texto)) || /pesado/.test(i.itemKey);
  const agasalho = (i: ItemChecklist) =>
    /agasalho|casaco|blusa de frio|moletom/.test(norm(i.texto));

  it("Gramado em julho tem agasalho", () => {
    expect(gerar("Gramado", "2026-07-10", "2026-07-14").some(agasalho)).toBe(true);
  });

  it("Maceió em janeiro não tem agasalho pesado", () => {
    expect(gerar("Maceió", "2027-01-10", "2027-01-15").some(pesado)).toBe(false);
  });

  it("praia-tropical no verão nunca tem agasalho pesado, em todos os slugs", () => {
    for (const [slug, m] of Object.entries(MAPA_DESTINOS_CHECKLIST)) {
      if (m.perfil !== "praia-tropical") continue;
      expect(gerar(slug, "2027-01-10", "2027-01-15").some(pesado), slug).toBe(false);
    }
  });

  it("lista de Lisboa (fora do catálogo) não contém visto", () => {
    const itens = gerar("Lisboa", "2026-07-10", "2026-07-14");
    expect(itens.length).toBeGreaterThan(0);
    expect(achados(textosDoConteudo(itens))).toEqual([]);
    expect(itens.some((i) => /(^|[^a-z])visto([^a-z]|$)/.test(norm(i.texto)))).toBe(false);
  });

  it("itens de chuva só existem com quando.chuvoso", () => {
    const chuva = todosItens.filter((i) => /chuva|poncho/.test(norm(i.texto)));
    expect(chuva.length).toBeGreaterThan(0);
    for (const i of chuva) expect(i.quando?.chuvoso, i.itemKey).toBe(true);
  });

  it("fora da estação chuvosa, nenhum item de chuva aparece", () => {
    // Maceió: chuvoso 4-8; janeiro é seco.
    const itens = gerar("Maceió", "2027-01-10", "2027-01-15");
    expect(itens.some((i) => /chuva|poncho/.test(norm(i.texto)))).toBe(false);
  });
});
