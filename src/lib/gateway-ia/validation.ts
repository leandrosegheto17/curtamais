// L3-T03 — Validação de plausibilidade de preço + grounding de data/
// calendário (ADR-003).
//
// Roda SOBRE o `data` já validado estruturalmente pelos schemas Zod
// (`./schemas.ts`, L3-T02) — ali só se garante o "shape" (campos presentes,
// tipos corretos, não-negativo). Aqui se valida SEMÂNTICA: a faixa de preço
// faz sentido para uma viagem real, e as datas do roteiro nunca escapam do
// range de datas já resolvido da sessão (`StageContext.dateRangeStart/End`,
// `./prompts.ts`).
//
// Fronteira: este módulo só decide aceitar/rejeitar, lançando `GatewayIaError`
// (mesmo tipo já usado em todo o módulo desde L3-T01) quando rejeita — nunca
// aceita silenciosamente uma resposta implausível. Retry automático em cima
// dessa rejeição e a escrita em `LlmGenerationLog` são L3-T04 (não
// implementados aqui; `generateStructuredCompletion`, em `./index.ts`, é o
// ponto de extensão onde L3-T04 deve envolver a chamada + esta validação
// num laço de 1 retry).
//
// Decisão de critério de plausibilidade de preço (documentada aqui por não
// haver um valor numérico definido no SDD.md/PRD-TECNICO.md para "faixa
// plausível" — decisão de implementação desta tarefa, dentro da margem de
// "detalhe de implementação" das diretrizes do Executor):
// 1. `min <= max` — uma faixa invertida nunca é plausível.
// 2. Nenhum valor pode exceder `MAX_PLAUSIBLE_PRICE_BRL` — teto de sanidade
//    para qualquer item de uma viagem individual no MVP (destino inteiro,
//    diária de hospedagem ou passeio avulso); qualquer valor acima disso é
//    claramente alucinação de ordem de grandeza, não um preço real.
// 3. Faixa não pode ser "zero-zero" quando o item não é gratuito por
//    natureza (destino e hospedagem nunca são gratuitos; passeio só pode
//    ter faixa zero quando `gratuito === true`) — pega o caso "preço zero
//    quando não deveria".
// 4. Quando `min > 0`, a razão `max / min` não pode ultrapassar
//    `MAX_PLAUSIBLE_PRICE_RATIO` — pega "ordem de grandeza absurda" dentro
//    de uma faixa que already passou nos dois critérios acima (ex.: min=100,
//    max=50000 tem min/max não-zero e abaixo do teto absoluto, mas a razão
//    entre eles não é uma faixa real de preço).

import { GatewayIaError } from "./errors";
import { GATEWAY_IA_SCHEMA_NAMES } from "./schemas";
import type {
  DestinoSugestoes,
  HospedagemOpcoes,
  PasseiosOpcoes,
  RoteiroEstruturado,
} from "./schemas";

/** Teto de sanidade (BRL) para qualquer faixa de preço individual do MVP — ver decisão de critério no cabeçalho deste arquivo. */
export const MAX_PLAUSIBLE_PRICE_BRL = 1_000_000;

/** Razão máxima plausível entre o teto e o piso de uma mesma faixa de preço — ver decisão de critério no cabeçalho deste arquivo. */
export const MAX_PLAUSIBLE_PRICE_RATIO = 20;

type PriceRange = { min: number; max: number };

function isPlausiblePriceRange(
  { min, max }: PriceRange,
  options: { allowZero: boolean },
): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  // Redundante com `.nonnegative()` do schema Zod (defesa em profundidade —
  // este módulo não deve depender silenciosamente de outro módulo nunca
  // mudar essa regra).
  if (min < 0 || max < 0) return false;
  if (min > max) return false;
  if (max > MAX_PLAUSIBLE_PRICE_BRL) return false;
  if (!options.allowZero && max === 0) return false;
  if (min > 0 && max / min > MAX_PLAUSIBLE_PRICE_RATIO) return false;
  return true;
}

/**
 * Valida a plausibilidade das faixas de preço da saída de uma etapa,
 * conforme o schema efetivamente usado (`schemaName`, ver
 * `GATEWAY_IA_SCHEMA_NAMES`). Etapas cujo schema não tem preço (`roteiro`) ou
 * `schemaName` que não corresponde a nenhuma das 4 etapas conhecidas (ex.:
 * um schema arbitrário passado por um teste/chamador fora do fluxo guiado)
 * não sofrem nenhuma checagem aqui — este módulo só conhece as 4 etapas do
 * fluxo guiado, mantendo `generateStructuredCompletion` agnóstico ao domínio
 * para qualquer outro uso.
 *
 * Lança `GatewayIaError` na primeira faixa implausível encontrada.
 */
export function validatePricePlausibility(
  schemaName: string,
  data: unknown,
): void {
  switch (schemaName) {
    case GATEWAY_IA_SCHEMA_NAMES.destino: {
      const { destinos } = data as DestinoSugestoes;
      destinos.forEach((destino, index) => {
        if (
          !isPlausiblePriceRange(
            { min: destino.faixaPrecoMin, max: destino.faixaPrecoMax },
            { allowZero: false },
          )
        ) {
          throw new GatewayIaError(
            `Faixa de preço implausível para o destino "${destino.nome}" ` +
              `(índice ${index}): ${destino.faixaPrecoMin} - ${destino.faixaPrecoMax}.`,
          );
        }
      });
      return;
    }
    case GATEWAY_IA_SCHEMA_NAMES.hospedagem: {
      const { opcoes } = data as HospedagemOpcoes;
      opcoes.forEach((opcao, index) => {
        if (
          !isPlausiblePriceRange(
            { min: opcao.precoPorDiariaMin, max: opcao.precoPorDiariaMax },
            { allowZero: false },
          )
        ) {
          throw new GatewayIaError(
            `Faixa de preço por diária implausível para a hospedagem "${opcao.nome}" ` +
              `(índice ${index}): ${opcao.precoPorDiariaMin} - ${opcao.precoPorDiariaMax}.`,
          );
        }
      });
      return;
    }
    case GATEWAY_IA_SCHEMA_NAMES.passeios: {
      const { passeios } = data as PasseiosOpcoes;
      passeios.forEach((passeio, index) => {
        if (
          !isPlausiblePriceRange(
            { min: passeio.precoMin, max: passeio.precoMax },
            { allowZero: passeio.gratuito },
          )
        ) {
          throw new GatewayIaError(
            `Faixa de preço implausível para o passeio "${passeio.nome}" ` +
              `(índice ${index}): ${passeio.precoMin} - ${passeio.precoMax} ` +
              `(gratuito=${passeio.gratuito}).`,
          );
        }
      });
      return;
    }
    default:
      // `roteiro` não tem campo de preço, e qualquer outro `schemaName` é
      // desconhecido deste módulo — nada a validar.
      return;
  }
}

/** Range de datas já resolvido da sessão (mesmos campos de `StageContext`, `./prompts.ts`), formato ISO (`YYYY-MM-DD`). Tipo próprio (em vez de importar `StageContext`) para não criar um ciclo de import entre `./validation.ts` e `./prompts.ts` (que já importa `./index.ts`). */
export type SessionDateRange = {
  dateRangeStart: string;
  dateRangeEnd: string;
};

/** Converte uma data em formato `YYYY-MM-DD[...]` para epoch (UTC, meia-noite) — `null` se não for interpretável. */
function parseIsoDateToUtcEpoch(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const epoch = Date.UTC(year, month - 1, day);
  return Number.isNaN(epoch) ? null : epoch;
}

/**
 * Valida o grounding de data/calendário: a única etapa do fluxo guiado cuja
 * saída inclui datas concretas é `roteiro` (`RoteiroEstruturado.dias[].data`)
 * — as demais etapas (destino/hospedagem/passeios) não geram datas, então
 * não há o que validar aqui para elas (o grounding delas é só o prompt
 * "considere sazonalidade", sem data literal na saída).
 *
 * Lança `GatewayIaError` na primeira data fora do range da sessão
 * (`dateRange.dateRangeStart`..`dateRange.dateRangeEnd`, inclusive) ou não
 * interpretável como data.
 */
export function validateDateGrounding(
  schemaName: string,
  data: unknown,
  dateRange: SessionDateRange,
): void {
  if (schemaName !== GATEWAY_IA_SCHEMA_NAMES.roteiro) return;

  const start = parseIsoDateToUtcEpoch(dateRange.dateRangeStart);
  const end = parseIsoDateToUtcEpoch(dateRange.dateRangeEnd);
  if (start === null || end === null) {
    throw new GatewayIaError(
      "Range de datas da sessão inválido para validação de grounding de " +
        `calendário: "${dateRange.dateRangeStart}" a "${dateRange.dateRangeEnd}".`,
    );
  }

  const { dias } = data as RoteiroEstruturado;
  dias.forEach((dia, index) => {
    const diaEpoch = parseIsoDateToUtcEpoch(dia.data);
    if (diaEpoch === null) {
      throw new GatewayIaError(
        `Data "${dia.data}" do roteiro (dia índice ${index}) não pôde ser ` +
          "interpretada como data ISO (YYYY-MM-DD).",
      );
    }
    if (diaEpoch < start || diaEpoch > end) {
      throw new GatewayIaError(
        `Data "${dia.data}" do roteiro (dia índice ${index}) está fora do ` +
          `range de datas da sessão (${dateRange.dateRangeStart} a ` +
          `${dateRange.dateRangeEnd}).`,
      );
    }
  });
}

/**
 * Ponto único chamado por `generateStructuredCompletion` (`./index.ts`) após
 * a saída já ter sido validada contra o schema Zod: aplica plausibilidade de
 * preço (sempre) e grounding de data (só quando `dateRange` é informado —
 * hoje só a etapa `roteiro` precisa dele; etapas anteriores podem chamar
 * `generateStructuredCompletion` sem `dateRange`, já que não têm campo de
 * data na saída).
 */
export function validateGatewayIaOutput(
  schemaName: string,
  data: unknown,
  dateRange?: SessionDateRange,
): void {
  validatePricePlausibility(schemaName, data);
  if (dateRange) {
    validateDateGrounding(schemaName, data, dateRange);
  }
}
