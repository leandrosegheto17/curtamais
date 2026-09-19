// @vitest-environment node
//
// V2-L2-T01 — Catálogo de destinos (RF-15, RN-10, ADR-010). Critério de
// aceite: 23 destinos presentes; exatamente 8 com `vitrine` 1..8 sem
// repetição; exatamente 1 `hero`; `slug` único no formato `^[a-z0-9-]+$`;
// nenhum destino falha ao ser importado/usado com `imagem: null`.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  CATALOGO_DESTINOS,
  rotuloFonteImagem,
  type DestinoCatalogo,
} from "@/lib/catalogo/destinos";

const SLUG_REGEX = /^[a-z0-9-]+$/;

describe("CATALOGO_DESTINOS", () => {
  it("tem exatamente 23 destinos", () => {
    expect(CATALOGO_DESTINOS).toHaveLength(23);
  });

  it("todo destino builda/importa normalmente, com imagem curada ou imagem: null como placeholder válido", () => {
    for (const destino of CATALOGO_DESTINOS) {
      expect(destino.imagem === null || typeof destino.imagem === "object").toBe(
        true,
      );
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

describe("fotos curadas do catálogo (RF-15.5, ADR-010)", () => {
  const comImagem = CATALOGO_DESTINOS.filter(
    (d): d is DestinoCatalogo & { imagem: NonNullable<DestinoCatalogo["imagem"]> } =>
      d.imagem !== null,
  );

  it("todo destino tem foto curada (23 de 23)", () => {
    expect(comImagem).toHaveLength(23);
  });

  it("o arquivo existe em public/, com as dimensões declaradas", async () => {
    for (const { slug, imagem } of comImagem) {
      const arquivo = path.join(process.cwd(), "public", imagem.arquivo);
      expect(existsSync(arquivo), `${slug}: ${imagem.arquivo} não existe`).toBe(true);
      const meta = await sharp(readFileSync(arquivo)).metadata();
      expect(`${slug} ${meta.width}x${meta.height}`).toBe(
        `${slug} ${imagem.largura}x${imagem.altura}`,
      );
    }
  });

  it("crédito completo: autor, links https, licença coerente com a fonte e data", () => {
    const licencasPorFonte = {
      unsplash: ["Unsplash License"],
      pexels: ["Pexels License"],
      wikimedia: ["CC BY 2.0", "CC BY-SA 3.0"],
    } as const;
    for (const { slug, imagem } of comImagem) {
      expect(imagem.autor.trim(), `${slug}: autor vazio`).not.toBe("");
      expect(imagem.autorUrl.startsWith("https://"), `${slug}: autorUrl`).toBe(true);
      expect(imagem.fonteUrl.startsWith("https://"), `${slug}: fonteUrl`).toBe(true);
      expect(licencasPorFonte[imagem.fonte], `${slug}: licença x fonte`).toContain(
        imagem.licenca,
      );
      expect(imagem.curadaEm).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    }
  });

  it("rotuloFonteImagem: Unsplash/Pexels sem licença; Wikimedia com a licença CC", () => {
    expect(rotuloFonteImagem({ fonte: "unsplash", licenca: "Unsplash License" })).toBe(
      "Unsplash",
    );
    expect(rotuloFonteImagem({ fonte: "pexels", licenca: "Pexels License" })).toBe("Pexels");
    expect(rotuloFonteImagem({ fonte: "wikimedia", licenca: "CC BY-SA 3.0" })).toBe(
      "Wikimedia Commons (CC BY-SA 3.0)",
    );
  });
});
