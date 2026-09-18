import type { ItemChecklist } from "../tipos";

// Itens condicionados dos perfis litorâneos (ADR-013, V2-L9-T05).
// Clima é "típico da época", nunca previsão. Sem regra de entrada, visto,
// vacina ou saúde. Sem vocabulário de reserva/venda.

const LITORAL = ["praia-tropical", "praia-subtropical"] as const;

export const ITENS_PERFIS_LITORANEOS: ItemChecklist[] = [
  {
    itemKey: "clima.protetor-solar-fator-alto",
    categoria: "clima",
    texto: "Protetor solar de fator alto: o sol do litoral é forte o ano todo",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "clima.oculos-de-sol-litoral",
    categoria: "clima",
    texto: "Óculos de sol para os dias de praia",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "clima.chapeu-ou-bone-praia",
    categoria: "clima",
    texto: "Chapéu ou boné para o sol do meio do dia",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "roupas.roupa-de-banho",
    categoria: "roupas",
    texto: "Roupa de banho: leve mais de uma para alternar enquanto seca",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "clima.canga-ou-toalha-de-praia",
    categoria: "clima",
    texto: "Canga ou toalha de praia",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "roupas.chinelo-de-praia",
    categoria: "roupas",
    texto: "Chinelo ou sandália para andar na areia",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "roupas.roupas-leves-de-algodao",
    categoria: "roupas",
    texto: "Roupas leves e de tecido fresco para o calor",
    quando: { perfis: [...LITORAL], estacoes: ["verao", "primavera"] },
  },
  {
    itemKey: "clima.hidratante-pos-sol",
    categoria: "clima",
    texto: "Hidratante pós-sol para aliviar a pele depois da praia",
    quando: { perfis: [...LITORAL] },
  },
  {
    itemKey: "higiene.repelente-litoral",
    categoria: "higiene",
    texto: "Repelente: no fim da tarde, perto de mangue ou mata, ajuda bastante",
    quando: { perfis: [...LITORAL], estacoes: ["verao", "primavera"] },
  },
  {
    itemKey: "clima.capa-de-chuva-litoral",
    categoria: "clima",
    texto: "Capa de chuva ou guarda-chuva compacto: período de chuvas típico do destino",
    quando: { perfis: [...LITORAL], chuvoso: true },
  },
  {
    itemKey: "roupas.calcado-fechado-que-seca-rapido",
    categoria: "roupas",
    texto: "Calçado que seque rápido para os dias de chuva",
    quando: { perfis: [...LITORAL], chuvoso: true },
  },
  {
    itemKey: "roupas.agasalho-leve-noite-litoral-sul",
    categoria: "roupas",
    texto: "Agasalho leve para a noite: costuma refrescar nessa época no litoral mais ao sul",
    quando: { perfis: ["praia-subtropical"], estacoes: ["outono", "inverno"] },
  },
  {
    itemKey: "roupas.corta-vento-leve-litoral",
    categoria: "roupas",
    texto: "Corta-vento leve para a brisa do fim de tarde",
    quando: { perfis: ["praia-tropical"], estacoes: ["inverno"] },
  },
  {
    itemKey: "roupas.trocas-extras-estadia-longa",
    categoria: "roupas",
    texto: "Mais trocas de roupa: com o calor e o mar, a roupa rende menos em estadias longas",
    quando: { perfis: [...LITORAL], duracoes: ["longa"] },
  },
  {
    itemKey: "higiene.protetor-labial-com-fator",
    categoria: "higiene",
    texto: "Protetor labial com fator solar",
    quando: { perfis: [...LITORAL], duracoes: ["media", "longa"] },
  },
  {
    itemKey: "clima.saco-impermeavel-praia",
    categoria: "clima",
    texto: "Saco impermeável para proteger celular e documentos da água e da areia",
    quando: { perfis: [...LITORAL], duracoes: ["media", "longa"] },
  },
  {
    itemKey: "clima.bolsa-pequena-de-praia",
    categoria: "clima",
    texto: "Uma bolsa pequena para levar só o essencial à praia",
    quando: { perfis: [...LITORAL], duracoes: ["curta"] },
  },
];
