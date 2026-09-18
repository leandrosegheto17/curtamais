// Módulo puro (ADR-013): sem Prisma, Gateway de IA, stage-rules ou next/*.

/** Ordem fixa de exibição das categorias. */
export const CATEGORIAS_CHECKLIST = [
  "documentos",
  "roupas",
  "higiene",
  "eletronicos",
  "clima",
  "antes",
] as const;
export type CategoriaChecklist = (typeof CATEGORIAS_CHECKLIST)[number];

/** Rótulos de exibição (UX-SPEC §9, RF-19.3): fonte única para a UI e o conteúdo. */
export const ROTULO_CATEGORIA: Record<CategoriaChecklist, string> = {
  documentos: "Documentos e dinheiro",
  roupas: "Roupas e calçados",
  higiene: "Higiene e cuidados",
  eletronicos: "Eletrônicos e carregadores",
  clima: "Itens do clima e do tipo de viagem",
  antes: "Antes de sair de casa",
};

export const PERFIS_CLIMA = [
  "praia-tropical",
  "praia-subtropical",
  "serra-fria",
  "interior-termal",
  "natureza-aventura",
  "cidade-litoral",
] as const;
export type PerfilClima = (typeof PERFIS_CLIMA)[number];

export const TIPOS_VIAGEM = [
  "praia",
  "natureza",
  "cidade",
  "serra",
  "termal",
] as const;
export type TipoViagem = (typeof TIPOS_VIAGEM)[number];

export const ESTACOES = ["verao", "outono", "inverno", "primavera"] as const;
export type Estacao = (typeof ESTACOES)[number];

export const FAIXAS_DURACAO = ["curta", "media", "longa"] as const;
export type FaixaDuracao = (typeof FAIXAS_DURACAO)[number];

export type ItemChecklist = {
  /** Estável e único, ver `validarItemKey`. Nunca o texto exibido. */
  itemKey: string;
  categoria: CategoriaChecklist;
  texto: string;
  /** Ausente = sempre (lista universal). */
  quando?: {
    perfis?: PerfilClima[];
    tipos?: TipoViagem[];
    estacoes?: Estacao[];
    /** true = só em mês chuvoso do destino. */
    chuvoso?: boolean;
    duracoes?: FaixaDuracao[];
  };
};

export type ChecklistGerado = {
  itens: ItemChecklist[];
  avisos: string[];
};

/** Perfil editorial de um destino do catálogo (ADR-013 decisão 2). */
export type PerfilDoDestino = {
  perfil: PerfilClima;
  tipo: TipoViagem;
  /** Meses 1-12 de clima chuvoso típico. */
  mesesChuvosos: number[];
};

/** Conteúdo curado injetado em `gerarChecklist` (a regra não importa `conteudo/*`). */
export type ConteudoChecklist = {
  /** Itens sem `quando.perfis/tipos`; ordem de declaração é significativa. */
  universais: ItemChecklist[];
  /** Itens condicionados por perfil/tipo/estação/chuva/duração. */
  itensPorPerfil: ItemChecklist[];
  /** Perfil por slug do catálogo (`DestinoCatalogo.slug`). */
  perfilPorSlug: Record<string, PerfilDoDestino>;
};

/** Datas em AAAA-MM-DD (sem fuso). `null`/ausente = sem datas. */
export type EntradaChecklist = {
  destino: string | null;
  dataInicio: string | null;
  dataFim: string | null;
};
