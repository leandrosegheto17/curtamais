// Calendário do checklist (ADR-013 decisão 4). Puro, sem fuso: datas AAAA-MM-DD.
import type { Estacao, FaixaDuracao } from "./tipos";

const ITEM_KEY_REGEX = /^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/;
export const ITEM_KEY_MAX = 64;

/** Hemisfério sul, fixo: verão dez-fev, outono mar-mai, inverno jun-ago, primavera set-nov. */
export function estacaoDoMes(mes: number): Estacao {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError(`Mês inválido: ${mes}`);
  }
  if (mes === 12 || mes <= 2) return "verao";
  if (mes <= 5) return "outono";
  if (mes <= 8) return "inverno";
  return "primavera";
}

function parseData(s: string): { a: number; m: number; d: number } {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!r) throw new RangeError(`Data inválida: ${s}`);
  return { a: Number(r[1]), m: Number(r[2]), d: Number(r[3]) };
}

function diasUtc(s: string): number {
  const { a, m, d } = parseData(s);
  return Math.floor(Date.UTC(a, m - 1, d) / 86_400_000);
}

/** Dias inclusivos: fim - início + 1. */
export function duracaoEmDias(inicio: string, fim: string): number {
  return diasUtc(fim) - diasUtc(inicio) + 1;
}

/** curta <= 3, media 4 a 7, longa >= 8. */
export function faixaDeDuracao(dias: number): FaixaDuracao {
  if (dias <= 3) return "curta";
  if (dias <= 7) return "media";
  return "longa";
}

/** Meses distintos (1-12, ordem cronológica) cobertos pelo período; no máx. 12. */
export function mesesDoPeriodo(inicio: string, fim: string): number[] {
  const i = parseData(inicio);
  const f = parseData(fim);
  if (diasUtc(fim) < diasUtc(inicio)) return [];
  const meses: number[] = [];
  let a = i.a;
  let m = i.m;
  while (a < f.a || (a === f.a && m <= f.m)) {
    if (!meses.includes(m)) meses.push(m);
    if (meses.length === 12) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return meses;
}

/** Estações cobertas (união dos meses), sem repetição. */
export function estacoesDoPeriodo(inicio: string, fim: string): Estacao[] {
  return [...new Set(mesesDoPeriodo(inicio, fim).map(estacaoDoMes))];
}

export function validarItemKey(chave: unknown): chave is string {
  return (
    typeof chave === "string" &&
    chave.length <= ITEM_KEY_MAX &&
    ITEM_KEY_REGEX.test(chave)
  );
}
