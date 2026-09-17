// V2-L2-T01 — Catálogo de destinos (RF-15, RN-10, ADR-010)
//
// Módulo puro: sem "use client"/"use server", sem import de Prisma, do
// Gateway de IA ou de qualquer API do Next.js (ADR-010 §"Decisão", item 1).
// Os 23 destinos e a ordem dos 8 da vitrine são exatamente os definidos em
// `PRD.md`, seção "Catálogo do V2.0" (2026-09-16). O crédito/autor/licença
// de cada foto só é preenchido quando o dono do produto curar a imagem —
// até lá, `imagem: null` é um placeholder válido (ADR-010, "Os 23 destinos
// são exatamente os do PRD.md ... `imagem: null` é um estado válido").

/** Fonte de onde a foto curada foi obtida — só fontes gratuitas (RF-15.5, decisão 8 do PRD.md). */
export type FonteImagem = "unsplash" | "pexels";

/** Dados de uma foto curada manualmente pelo dono do produto (ADR-010). */
export type ImagemCurada = {
  /** Caminho em `public/destinos/`, com versão no nome (ex.: gramado-v1.jpg). */
  arquivo: `/destinos/${string}`;
  /** Dimensões reais do arquivo, usadas por `next/image` para reservar espaço (evita CLS). */
  largura: number;
  altura: number;
  autor: string;
  autorUrl: string;
  fonte: FonteImagem;
  /** URL da página da foto na fonte (crédito, RF-15.5). */
  fonteUrl: string;
  licenca: "Unsplash License" | "Pexels License";
  /** Data da curadoria, formato AAAA-MM-DD. */
  curadaEm: string;
  /** `object-position` em porcentagem, opcional. */
  focoX?: number;
  focoY?: number;
};

/** Um destino do catálogo curado (23 no V2.0, 8 deles também na vitrine da home). */
export type DestinoCatalogo = {
  /** Identificador estável na URL, ex.: "gramado". */
  slug: string;
  nome: string;
  /** Sigla da UF, ex.: "RS". */
  uf: string;
  /** Rótulo de região exibido no overlay do card (ex.: "Serra Gaúcha"). */
  rotuloRegiao: string;
  /** Grafias alternativas do MESMO lugar, usadas na correspondência exata de T04 (ADR-010 §2). */
  variantes: string[];
  /** Ordem 1..8 na vitrine da home; `null` = destino só existe no catálogo (não aparece na home). */
  vitrine: number | null;
  /** Exatamente um destino do catálogo tem `hero: true` (usado no hero da home). */
  hero?: true;
  /** `null` = foto ainda não curada; a apresentação usa o fallback de gradiente (RF-15.2). */
  imagem: ImagemCurada | null;
};

// Vitrine da home (8), na ordem definida no PRD.md — a mesma ordem em que
// aparecem no `ShowcaseSection` (UX-SPEC.md §8.2, T-HOME item 4).
//
// Interpretação de detalhe do Executor (nenhum artefato nomeia o destino
// `hero` explicitamente — UX-SPEC.md só diz "o destino marcado como `hero`
// no catálogo"): o Rio de Janeiro, primeiro da ordem da vitrine, foi
// escolhido como o destino `hero`. Documentado aqui para o Coordenador
// revisar/trocar se a intenção for outra.
export const CATALOGO_DESTINOS: DestinoCatalogo[] = [
  {
    slug: "rio-de-janeiro",
    nome: "Rio de Janeiro",
    uf: "RJ",
    rotuloRegiao: "Cidade Maravilhosa",
    variantes: [],
    vitrine: 1,
    hero: true,
    imagem: {
      arquivo: "/destinos/rio-de-janeiro-v1.jpg",
      largura: 1600,
      altura: 1066,
      autor: "Raphael Nogueira",
      autorUrl: "https://unsplash.com/@phaelnogueira",
      fonte: "unsplash",
      fonteUrl: "https://unsplash.com/photos/christ-redeemer-statue-brazil-CErddu-JwKw",
      licenca: "Unsplash License",
      curadaEm: "2026-09-18",
    },
  },
  {
    slug: "porto-de-galinhas",
    nome: "Porto de Galinhas",
    uf: "PE",
    rotuloRegiao: "Litoral Sul de Pernambuco",
    variantes: [],
    vitrine: 2,
    imagem: null,
  },
  {
    slug: "gramado",
    nome: "Gramado",
    uf: "RS",
    rotuloRegiao: "Serra Gaúcha",
    variantes: [],
    vitrine: 3,
    imagem: null,
  },
  {
    slug: "maceio",
    nome: "Maceió",
    uf: "AL",
    rotuloRegiao: "Costa dos Corais",
    variantes: [],
    vitrine: 4,
    imagem: null,
  },
  {
    slug: "porto-seguro",
    nome: "Porto Seguro",
    uf: "BA",
    rotuloRegiao: "Costa do Descobrimento",
    variantes: [],
    vitrine: 5,
    imagem: null,
  },
  {
    slug: "florianopolis",
    nome: "Florianópolis",
    uf: "SC",
    rotuloRegiao: "Ilha de Santa Catarina",
    variantes: [],
    vitrine: 6,
    imagem: null,
  },
  {
    slug: "foz-do-iguacu",
    nome: "Foz do Iguaçu",
    uf: "PR",
    rotuloRegiao: "Cataratas do Iguaçu",
    variantes: [],
    vitrine: 7,
    imagem: null,
  },
  {
    slug: "campos-do-jordao",
    nome: "Campos do Jordão",
    uf: "SP",
    rotuloRegiao: "Serra da Mantiqueira",
    variantes: [],
    vitrine: 8,
    imagem: null,
  },
  // Restante do catálogo (15) — sem `vitrine` (não aparecem na home),
  // usados só na correspondência de imagem em T04.
  {
    slug: "natal",
    nome: "Natal",
    uf: "RN",
    rotuloRegiao: "Costa das Dunas",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "fortaleza",
    nome: "Fortaleza",
    uf: "CE",
    rotuloRegiao: "Litoral Cearense",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "maragogi",
    nome: "Maragogi",
    uf: "AL",
    rotuloRegiao: "Costa dos Corais",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "salvador",
    nome: "Salvador",
    uf: "BA",
    rotuloRegiao: "Baía de Todos os Santos",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "joao-pessoa",
    nome: "João Pessoa",
    uf: "PB",
    rotuloRegiao: "Litoral Paraibano",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "imbassai",
    nome: "Imbassaí",
    uf: "BA",
    rotuloRegiao: "Costa dos Coqueiros",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "buzios",
    nome: "Búzios",
    uf: "RJ",
    rotuloRegiao: "Região dos Lagos",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "ilheus",
    nome: "Ilhéus",
    uf: "BA",
    rotuloRegiao: "Costa do Cacau",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "aracaju",
    nome: "Aracaju",
    uf: "SE",
    rotuloRegiao: "Litoral Sergipano",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "praia-do-forte",
    nome: "Praia do Forte",
    uf: "BA",
    rotuloRegiao: "Costa dos Coqueiros",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "caldas-novas",
    nome: "Caldas Novas",
    uf: "GO",
    rotuloRegiao: "Região das Águas Quentes",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "olimpia",
    nome: "Olímpia",
    uf: "SP",
    rotuloRegiao: "Interior Paulista",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "pocos-de-caldas",
    nome: "Poços de Caldas",
    uf: "MG",
    rotuloRegiao: "Sul de Minas",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "fernando-de-noronha",
    nome: "Fernando de Noronha",
    uf: "PE",
    rotuloRegiao: "Arquipélago de Fernando de Noronha",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
  {
    slug: "lencois-maranhenses",
    nome: "Lençóis Maranhenses",
    uf: "MA",
    rotuloRegiao: "Lençóis Maranhenses",
    variantes: [],
    vitrine: null,
    imagem: null,
  },
];
