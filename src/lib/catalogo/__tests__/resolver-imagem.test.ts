// @vitest-environment node
//
// V2-L2-T02 — resolver-imagem.ts (RF-15.2/15.3/15.4, RN-10, ADR-010 §2/§3).
// Critério de aceite:
// - nenhuma colisão de chave normalizada entre os 23 destinos
//   (`normalizarNomeDestino` aplicado a `nome`/`variantes`);
// - mesmo nome em grafias diferentes (acentuação, caixa, espaços) resolve
//   para o mesmo resultado;
// - nome fora do catálogo cai no fallback determinístico (hash FNV-1a sobre
//   paleta de 8 gradientes), nunca em correspondência aproximada.
import { describe, expect, it } from "vitest";
import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";
import {
  ANGULOS_FALLBACK,
  PALETA_FALLBACK,
  normalizarNomeDestino,
  resolverImagemDestino,
} from "@/lib/catalogo/resolver-imagem";

function contrasteComFafafa(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

  const luminanciaFafafa = 0.9505; // luminância relativa de #FAFAFA
  const [claro, escuro] =
    luminanciaFafafa > luminancia ? [luminanciaFafafa, luminancia] : [luminancia, luminanciaFafafa];
  return (claro + 0.05) / (escuro + 0.05);
}

describe("normalizarNomeDestino", () => {
  it("remove acentos, baixa a caixa e colapsa espaços", () => {
    expect(normalizarNomeDestino("  Florianópolis  ")).toBe("florianopolis");
    expect(normalizarNomeDestino("FLORIANÓPOLIS")).toBe("florianopolis");
    expect(normalizarNomeDestino("florianopolis")).toBe("florianopolis");
  });

  it("trata separadores (-, –, /, ,, parênteses) como espaço", () => {
    expect(normalizarNomeDestino("Gramado, RS")).toBe("gramado");
    expect(normalizarNomeDestino("Gramado - RS")).toBe("gramado");
    expect(normalizarNomeDestino("Gramado (RS)")).toBe("gramado");
    expect(normalizarNomeDestino("Gramado RS")).toBe("gramado");
  });

  it("remove só UM sufixo de UF ao final, precedido de espaço", () => {
    expect(normalizarNomeDestino("Porto Seguro BA")).toBe("porto seguro");
    // "BA" no meio do nome não é removido, só o sufixo final
    expect(normalizarNomeDestino("BA Porto Seguro")).toBe("ba porto seguro");
  });

  it("não colapsa nomes compostos não cadastrados como variante", () => {
    expect(normalizarNomeDestino("Gramado e Canela")).toBe("gramado e canela");
    expect(normalizarNomeDestino("Porto de Galinhas, Ipojuca")).toBe("porto de galinhas ipojuca");
  });
});

describe("correspondência exata: sem colisão entre os 23 destinos do catálogo", () => {
  it("normalizarNomeDestino(nome) e normalizarNomeDestino(variante) não colidem entre destinos diferentes", () => {
    const chaveParaSlug = new Map<string, string>();
    const colisoes: string[] = [];

    for (const destino of CATALOGO_DESTINOS) {
      const chaves = [destino.nome, ...destino.variantes].map(normalizarNomeDestino);
      for (const chave of chaves) {
        const slugExistente = chaveParaSlug.get(chave);
        if (slugExistente && slugExistente !== destino.slug) {
          colisoes.push(`"${chave}" colide entre "${slugExistente}" e "${destino.slug}"`);
        } else {
          chaveParaSlug.set(chave, destino.slug);
        }
      }
    }

    expect(colisoes).toEqual([]);
  });
});

describe("resolverImagemDestino: grafias diferentes do mesmo destino resolvem igual", () => {
  it.each([
    ["Florianópolis", "florianópolis", "FLORIANÓPOLIS", "  Florianópolis  "],
    ["São Paulo", "sao paulo", "SÃO PAULO", "São   Paulo"],
    ["Poços de Caldas", "pocos de caldas", "POÇOS DE CALDAS"],
  ])("todas as grafias de %s resolvem para o mesmo resultado", (...grafias) => {
    const resultados = grafias.map((grafia) => resolverImagemDestino(grafia));
    const primeiro = resultados[0];

    for (const resultado of resultados) {
      expect(resultado.tipo).toBe(primeiro.tipo);
      if (resultado.tipo === "fallback" && primeiro.tipo === "fallback") {
        expect(resultado.corInicio).toBe(primeiro.corInicio);
        expect(resultado.corFim).toBe(primeiro.corFim);
        expect(resultado.anguloGraus).toBe(primeiro.anguloGraus);
      }
      if (resultado.tipo === "curada" && primeiro.tipo === "curada") {
        expect(resultado.destino.slug).toBe(primeiro.destino.slug);
      }
    }
  });

  it("destinos do catálogo sem imagem curada (imagem: null) caem no fallback, não em 'curada'", () => {
    // Correspondência exata existe para todo destino do catálogo, mas
    // RF-15.2/15.3 exigem imagem !== null para "curada". O catálogo real já
    // tem foto em todos os destinos, então o teste zera temporariamente a
    // imagem de um deles e restaura no fim.
    const destino = CATALOGO_DESTINOS[0];
    const original = destino.imagem;
    destino.imagem = null;
    try {
      const resultado = resolverImagemDestino(destino.nome);
      expect(resultado.tipo).toBe("fallback");
    } finally {
      destino.imagem = original;
    }
  });
});

describe("resolverImagemDestino: nome fora do catálogo cai no fallback determinístico", () => {
  it("nome desconhecido nunca resolve como 'curada'", () => {
    const resultado = resolverImagemDestino("Cidade Inexistente Totalmente Fora Do Catálogo");
    expect(resultado.tipo).toBe("fallback");
  });

  it("o mesmo nome sempre gera o mesmo gradiente (determinístico, sem aleatoriedade)", () => {
    const nome = "Vila Fictícia das Montanhas";
    const a = resolverImagemDestino(nome);
    const b = resolverImagemDestino(nome);
    expect(a).toEqual(b);
  });

  it("nome parecido com um destino real NÃO casa por aproximação (só igualdade exata)", () => {
    // "Gramadoo" é uma grafia próxima de "Gramado", mas não é igual após
    // normalização — RF-15.4/RN-10 proíbem correspondência aproximada.
    const resultado = resolverImagemDestino("Gramadoo");
    expect(resultado.tipo).toBe("fallback");
  });

  it("o índice de cor está sempre dentro da paleta de 8 gradientes", () => {
    const nomes = [
      "Cidade A", "Cidade B", "Cidade C", "Cidade D", "Cidade E",
      "Cidade F", "Cidade G", "Cidade H", "Cidade I", "Cidade J",
    ];
    for (const nome of nomes) {
      const resultado = resolverImagemDestino(nome);
      expect(resultado.tipo).toBe("fallback");
      if (resultado.tipo === "fallback") {
        const parIndex = PALETA_FALLBACK.findIndex(
          (par) => par.corInicio === resultado.corInicio && par.corFim === resultado.corFim,
        );
        expect(parIndex).toBeGreaterThanOrEqual(0);
        expect(ANGULOS_FALLBACK).toContain(resultado.anguloGraus);
      }
    }
  });
});

describe("PALETA_FALLBACK", () => {
  it("tem exatamente 8 pares de gradiente", () => {
    expect(PALETA_FALLBACK).toHaveLength(8);
  });

  it("cada cor do par tem contraste >= 4.5:1 contra #FAFAFA", () => {
    for (const { corInicio, corFim } of PALETA_FALLBACK) {
      expect(contrasteComFafafa(corInicio)).toBeGreaterThanOrEqual(4.5);
      expect(contrasteComFafafa(corFim)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tem exatamente 4 ângulos fixos de gradiente", () => {
    expect(ANGULOS_FALLBACK).toHaveLength(4);
  });
});
