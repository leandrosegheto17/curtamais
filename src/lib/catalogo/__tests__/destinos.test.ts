// @vitest-environment node
//
// V2-L2-T01 — Catálogo de destinos (RF-15, RN-10, ADR-010). Critério de
// aceite: 23 destinos presentes; exatamente 8 com `vitrine` 1..8 sem
// repetição; exatamente 1 `hero`; `slug` único no formato `^[a-z0-9-]+$`;
// nenhum destino falha ao ser importado/usado com `imagem: null`.
import { describe, expect, it } from "vitest";
import { CATALOGO_DESTINOS, type DestinoCatalogo } from "@/lib/catalogo/destinos";

const SLUG_REGEX = /^[a-z0-9-]+$/;

describe("CATALOGO_DESTINOS", () => {
  it("tem exatamente 23 destinos", () => {
    expect(CATALOGO_DESTINOS).toHaveLength(23);
  });

  it("todo destino builda/importa normalmente com imagem: null como placeholder válido", () => {
    for (const destino of CATALOGO_DESTINOS) {
      expect(destino.imagem).toBeNull();
    }
  });

  it("tem exatamente 8 destinos com vitrine, valendo 1..8 sem repetição", () => {
    const comVitrine = CATALOGO_DESTINOS.filter(
      (d): d is DestinoCatalogo & { vitrine: number } => d.vitrine !== null,
    );
    expect(comVitrine).toHaveLength(8);

    const valores = comVitrine.map((d) => d.vitrine).sort((a, b) => a - b);
    expect(valores).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("tem exatamente 1 destino com hero: true", () => {
    const comHero = CATALOGO_DESTINOS.filter((d) => d.hero === true);
    expect(comHero).toHaveLength(1);
  });

  it("todo slug é único e segue ^[a-z0-9-]+$", () => {
    const slugs = CATALOGO_DESTINOS.map((d) => d.slug);
    for (const slug of slugs) {
      expect(slug).toMatch(SLUG_REGEX);
    }
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("todo destino tem nome, uf e rotuloRegiao não vazios", () => {
    for (const destino of CATALOGO_DESTINOS) {
      expect(destino.nome.length).toBeGreaterThan(0);
      expect(destino.uf).toMatch(/^[A-Z]{2}$/);
      expect(destino.rotuloRegiao.length).toBeGreaterThan(0);
    }
  });
});
