// V2-L2-T02 — Resolução de imagem por destino (RF-15.2/15.3/15.4, RN-10, ADR-010 §2/§3)
//
// Módulo puro: sem "use client"/"use server", sem import de Prisma, do
// Gateway de IA ou de qualquer API do Next.js (mesma regra de destinos.ts,
// ADR-010 §"Decisão", item 1).
//
// Contrato (ADR-010 §"Decisão", itens 2 e 3):
// - `normalizarNomeDestino` é a ÚNICA normalização usada tanto para montar o
//   mapa de correspondência exata quanto para consultar. Ela NÃO tenta
//   corresponder por semelhança/distância de edição — só igualdade exata
//   (RF-15.4, RN-10: proibida correspondência aproximada).
// - `resolverImagemDestino` tenta a correspondência exata primeiro; se não
//   achar (ou o destino existir mas ainda não tiver `imagem` curada), cai no
//   fallback determinístico de hash (FNV-1a 32 bits) sobre uma paleta fixa
//   de 8 gradientes.

import { CATALOGO_DESTINOS, type DestinoCatalogo, type ImagemCurada } from "@/lib/catalogo/destinos";

/**
 * Normaliza um nome de destino para comparação por igualdade exata
 * (ADR-010 §"Decisão", item 2.1):
 * - Unicode NFD + remoção de diacríticos + minúsculas;
 * - troca de `-`, `–`, `/`, `,`, `(` e `)` por espaço, colapso de espaços
 *   consecutivos e `trim`;
 * - remoção de UM sufixo final igual a uma das 27 siglas de UF, desde que
 *   precedido de espaço (já depois da etapa anterior).
 *
 * Nada além disso é removido. Nomes como "Gramado e Canela" ou "Porto de
 * Galinhas, Ipojuca" não colapsam para nada cadastrado, a menos que estejam
 * explicitamente listados como variante no catálogo.
 */
export function normalizarNomeDestino(nome: string): string {
  const SIGLAS_UF = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
  ];

  const semDiacriticos = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const comEspacos = semDiacriticos.replace(/[-–/,()]/g, " ");

  const colapsado = comEspacos.replace(/\s+/g, " ").trim();

  const ufRegex = new RegExp(`\\s(${SIGLAS_UF.join("|").toLowerCase()})$`);
  return colapsado.replace(ufRegex, "");
}

/**
 * Mapa de correspondência exata: chave normalizada (nome ou variante) →
 * destino do catálogo. Construído uma única vez no carregamento do módulo
 * (ADR-010 §"Decisão", item 2.2). Se duas chaves diferentes colidirem, a
 * última entrada processada vence — o teste de "nenhuma colisão entre os 23
 * destinos" existe justamente para pegar isso antes que aconteça de verdade.
 */
const MAPA_CORRESPONDENCIA_EXATA: Map<string, DestinoCatalogo> = (() => {
  const mapa = new Map<string, DestinoCatalogo>();
  for (const destino of CATALOGO_DESTINOS) {
    mapa.set(normalizarNomeDestino(destino.nome), destino);
    for (const variante of destino.variantes) {
      mapa.set(normalizarNomeDestino(variante), destino);
    }
  }
  return mapa;
})();

/**
 * Paleta fixa de 8 gradientes para o fallback (ADR-010 §"Decisão", item 3).
 * Cada par de cores é escuro o suficiente para ter contraste >= 4.5:1 com
 * `#FAFAFA` (texto/inicial claros sobre o gradiente), verificado em teste.
 * Ordem é significativa: o índice na paleta é `hash % 8`, então reordenar
 * muda qual gradiente cada nome recebe.
 */
export const PALETA_FALLBACK: ReadonlyArray<{ corInicio: string; corFim: string }> = [
  { corInicio: "#1E3A8A", corFim: "#172554" }, // azul profundo
  { corInicio: "#065F46", corFim: "#022C22" }, // esmeralda
  { corInicio: "#7C2D12", corFim: "#431407" }, // âmbar queimado
  { corInicio: "#581C87", corFim: "#2E1065" }, // violeta
  { corInicio: "#831843", corFim: "#500724" }, // rosa/vinho
  { corInicio: "#164E63", corFim: "#083344" }, // ciano petróleo
  { corInicio: "#7F1D1D", corFim: "#450A0A" }, // vermelho profundo
  { corInicio: "#3F3F46", corFim: "#18181B" }, // grafite
] as const;

/** Os 4 ângulos fixos possíveis do gradiente (graus), escolhidos por `(hash >> 8) % 4`. */
export const ANGULOS_FALLBACK: readonly [number, number, number, number] = [45, 90, 135, 180];

/**
 * FNV-1a de 32 bits, algoritmo padrão (offset basis 2166136261, prime
 * 16777619), aplicado byte a byte sobre a codificação UTF-8 da string.
 */
function fnv1a32(texto: string): number {
  const OFFSET_BASIS = 0x811c9dc5;
  const PRIME = 0x01000193;

  let hash = OFFSET_BASIS;
  const bytes = new TextEncoder().encode(texto);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Resultado de `resolverImagemDestino`: ou uma foto curada, ou um fallback determinístico. */
export type ImagemResolvida =
  | {
      tipo: "curada";
      destino: DestinoCatalogo;
      imagem: ImagemCurada;
    }
  | {
      tipo: "fallback";
      /** Nome original (não normalizado), preservado para exibição/inicial. */
      nomeOriginal: string;
      corInicio: string;
      corFim: string;
      anguloGraus: number;
      /** Primeiro caractere alfabético do nome original, maiúsculo, acento preservado. */
      inicial: string;
    };

/** Extrai o primeiro caractere alfabético do nome original (RF-15: inicial preserva acento). */
function extrairInicial(nomeOriginal: string): string {
  const match = nomeOriginal.match(/\p{L}/u);
  return (match?.[0] ?? "?").toUpperCase();
}

/**
 * Gera o fallback determinístico de gradiente + inicial para um nome livre.
 * Exportada (RL-V2-L2-T01) para uso direto por consumidores que precisam do
 * gradiente de fallback fora do fluxo normal de `resolverImagemDestino` — ex.:
 * `DestinationImage.onError` (RF-15.9), quando uma imagem curada existe mas
 * falha ao carregar em runtime.
 */
export function gerarFallback(nomeLivre: string): ImagemResolvida & { tipo: "fallback" } {
  const hash = fnv1a32(normalizarNomeDestino(nomeLivre));
  const indiceCor = hash % PALETA_FALLBACK.length;
  const indiceAngulo = (hash >>> 8) % ANGULOS_FALLBACK.length;
  const { corInicio, corFim } = PALETA_FALLBACK[indiceCor];

  return {
    tipo: "fallback",
    nomeOriginal: nomeLivre,
    corInicio,
    corFim,
    anguloGraus: ANGULOS_FALLBACK[indiceAngulo],
    inicial: extrairInicial(nomeLivre),
  };
}

/**
 * Resolve a imagem de apresentação para um nome de destino livre (ex.: vindo
 * de uma sugestão da IA em T04). Tenta correspondência exata primeiro
 * (nome/variante normalizados contra o catálogo); só cai no fallback de
 * gradiente se não houver destino correspondente OU o destino existir mas
 * ainda não tiver `imagem` curada (RF-15.2/15.3). NUNCA tenta correspondência
 * aproximada/fuzzy (RF-15.4, RN-10).
 */
export function resolverImagemDestino(nomeLivre: string): ImagemResolvida {
  const chave = normalizarNomeDestino(nomeLivre);
  const destino = MAPA_CORRESPONDENCIA_EXATA.get(chave);

  if (destino && destino.imagem !== null) {
    return { tipo: "curada", destino, imagem: destino.imagem };
  }

  return gerarFallback(nomeLivre);
}
