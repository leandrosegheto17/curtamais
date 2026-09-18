// Conteúdo curado (ADR-013, V2-L9-T06): perfis de interior/cidade.
// Clima é "típico da época" (hemisfério sul), nunca previsão. Sem regra de entrada,
// visto, vacina ou vocabulário de reserva/venda.

import type { ItemChecklist } from "../tipos";

export const ITENS_PERFIS_INTERIOR: ItemChecklist[] = [
  // ---- serra-fria ----
  {
    itemKey: "roupas.agasalho-pesado-serra",
    categoria: "roupas",
    texto: "Casaco pesado ou agasalho grosso para as noites de serra",
    quando: { perfis: ["serra-fria"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "roupas.gorro-luvas-serra",
    categoria: "roupas",
    texto: "Gorro e luvas para manhãs e noites geladas",
    quando: { perfis: ["serra-fria"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "roupas.meias-grossas-serra",
    categoria: "roupas",
    texto: "Meias grossas de lã ou algodão felpudo",
    quando: { perfis: ["serra-fria"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "roupas.camada-media-serra",
    categoria: "roupas",
    texto: "Blusa de frio ou moletom para a noite, que costuma esfriar na serra",
    quando: { perfis: ["serra-fria"], estacoes: ["primavera"] },
  },
  {
    itemKey: "roupas.camada-leve-serra",
    categoria: "roupas",
    texto: "Uma camada leve (casaquinho ou jaqueta fina) para a noite, mesmo no verão",
    quando: { perfis: ["serra-fria"], estacoes: ["verao"] },
  },
  {
    itemKey: "roupas.calcado-fechado-serra",
    categoria: "roupas",
    texto: "Calçado fechado e confortável para caminhar em ladeiras",
    quando: { perfis: ["serra-fria"] },
  },
  {
    itemKey: "higiene.hidratante-labial-serra",
    categoria: "higiene",
    texto: "Hidratante corporal e protetor labial, o ar da serra resseca",
    quando: { perfis: ["serra-fria"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "clima.capa-chuva-serra",
    categoria: "clima",
    texto: "Capa de chuva leve ou guarda-chuva compacto, a serra costuma chover neste período",
    quando: { perfis: ["serra-fria"], chuvoso: true },
  },

  // ---- interior-termal ----
  {
    itemKey: "roupas.roupa-banho-termal",
    categoria: "roupas",
    texto: "Roupa de banho (leve uma peça seca extra para o segundo dia de termas)",
    quando: { perfis: ["interior-termal"] },
  },
  {
    itemKey: "roupas.chinelo-termal",
    categoria: "roupas",
    texto: "Chinelo para circular entre as piscinas",
    quando: { perfis: ["interior-termal"] },
  },
  {
    itemKey: "roupas.calcado-antiderrapante-termal",
    categoria: "roupas",
    texto: "Calçado antiderrapante para áreas molhadas",
    quando: { perfis: ["interior-termal"] },
  },
  {
    itemKey: "higiene.toalha-termal",
    categoria: "higiene",
    texto: "Toalha de banho, e uma extra se o lugar não fornecer",
    quando: { perfis: ["interior-termal"] },
  },
  {
    itemKey: "higiene.roupao-termal",
    categoria: "higiene",
    texto: "Roupão ou toalha grande para a saída da água quente",
    quando: { perfis: ["interior-termal"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "higiene.protetor-solar-termal",
    categoria: "higiene",
    texto: "Protetor solar para as piscinas ao ar livre",
    quando: { perfis: ["interior-termal"], estacoes: ["verao", "primavera"] },
  },
  {
    itemKey: "higiene.hidratante-pos-termas",
    categoria: "higiene",
    texto: "Hidratante para depois das termas, a água quente resseca a pele",
    quando: { perfis: ["interior-termal"] },
  },
  {
    itemKey: "roupas.agasalho-noite-termal",
    categoria: "roupas",
    texto: "Agasalho para a noite, o interior esfria depois do pôr do sol",
    quando: { perfis: ["interior-termal"], estacoes: ["outono", "inverno"] },
  },

  // ---- natureza-aventura ----
  {
    itemKey: "roupas.calcado-trilha-natureza",
    categoria: "roupas",
    texto: "Calçado de trilha ou tênis fechado com boa aderência",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "roupas.secagem-rapida-natureza",
    categoria: "roupas",
    texto: "Roupas de secagem rápida, melhores que algodão em trilha",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "roupas.agasalho-leve-natureza",
    categoria: "roupas",
    texto: "Agasalho leve para o começo da manhã e o fim da tarde",
    quando: { perfis: ["natureza-aventura"], estacoes: ["outono", "inverno", "primavera"] },
  },
  {
    itemKey: "higiene.repelente-natureza",
    categoria: "higiene",
    texto: "Repelente de insetos",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "higiene.protetor-solar-natureza",
    categoria: "higiene",
    texto: "Protetor solar e boné ou chapéu para trechos sem sombra",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "clima.garrafa-agua-natureza",
    categoria: "clima",
    texto: "Garrafa de água reutilizável para os passeios",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "clima.capa-chuva-natureza",
    categoria: "clima",
    texto: "Capa de chuva leve, a época costuma ter chuva forte e rápida",
    quando: { perfis: ["natureza-aventura"], chuvoso: true },
  },
  {
    itemKey: "clima.mochila-pequena-natureza",
    categoria: "clima",
    texto: "Mochila pequena ou pochete para o dia de passeio",
    quando: { perfis: ["natureza-aventura"] },
  },
  {
    itemKey: "clima.saco-impermeavel-natureza",
    categoria: "clima",
    texto: "Saquinho impermeável para proteger celular e documentos da água",
    quando: { perfis: ["natureza-aventura"], chuvoso: true },
  },

  // ---- cidade-litoral ----
  {
    itemKey: "roupas.calcado-caminhar-cidade",
    categoria: "roupas",
    texto: "Calçado confortável para caminhar bastante",
    quando: { perfis: ["cidade-litoral"] },
  },
  {
    itemKey: "roupas.roupa-leve-cidade",
    categoria: "roupas",
    texto: "Roupas leves e frescas para o calor típico da época",
    quando: { perfis: ["cidade-litoral"], estacoes: ["verao", "primavera"] },
  },
  {
    itemKey: "roupas.casaco-leve-cidade",
    categoria: "roupas",
    texto: "Casaco leve para a noite e para dias mais frescos",
    quando: { perfis: ["cidade-litoral"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "higiene.protetor-solar-cidade",
    categoria: "higiene",
    texto: "Protetor solar para passeios a pé durante o dia",
    quando: { perfis: ["cidade-litoral"] },
  },
  {
    itemKey: "clima.guarda-chuva-cidade",
    categoria: "clima",
    texto: "Guarda-chuva compacto, o período costuma ser chuvoso",
    quando: { perfis: ["cidade-litoral"], chuvoso: true },
  },
  {
    itemKey: "clima.bolsa-cruzada-cidade",
    categoria: "clima",
    texto: "Bolsa cruzada ou pochete para andar com as mãos livres",
    quando: { perfis: ["cidade-litoral"] },
  },
  {
    itemKey: "eletronicos.bateria-portatil-cidade",
    categoria: "eletronicos",
    texto: "Bateria portátil para dias longos de passeio e mapa no celular",
    quando: { perfis: ["cidade-litoral"], duracoes: ["media", "longa"] },
  },
];
