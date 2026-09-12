// L10-T01 — Regra RF-08: geração do roteiro estruturado por dia (manhã/
// tarde/noite), sequenciamento por proximidade geográfica e horário ideal,
// com justificativa de timing (RF-08.1/.2/.3).
//
// Resolução do SPIKE-02 (ver `.md/TASK.md` Seção 2, "Resolução do SPIKE-02"):
// sem geocoding/mapas real, RF-08.2 (evitar deslocamento redundante) e
// RF-08.3 (horário ideal por atividade) são resolvidos pedindo ao próprio
// LLM (`buildRoteiroPrompt`, L3-T02, `src/lib/gateway-ia/prompts.ts`) para
// sequenciar por proximidade lógica/geográfica a partir dos nomes/tipos de
// destino, hospedagem e passeios já aprovados, com uma justificativa textual
// de timing por item — nenhuma integração de mapas/geocoding real é
// adicionada (consistente com a decisão de não integrar dado externo real no
// MVP, SDD.md §1/PRD-TECNICO.md Seção 4). Resultado é "melhor esforço" do
// modelo, aceitável porque RF-08.2 já prevê "sempre que uma alternativa
// equivalente existir" — não é um requisito absoluto.
//
// Mesmo padrão de `./hospedagem.ts` (L8-T01)/`./passeios.ts` (L9-T01): ponto
// de junção entre o Gateway de IA (Lote 3, já pronto — `buildRoteiroPrompt`/
// `roteiroEstruturadoSchema` já existiam desde L3-T02) e a regra de negócio
// específica desta etapa. Diferenças chave em relação às demais etapas:
//
// 1. Sem `applyBudgetFilter` (RF-10) — o roteiro não introduz nenhum item
//    novo com preço próprio, só sequencia em blocos de tempo o que já foi
//    aprovado (destino/hospedagem/passeios).
// 2. `generateStructuredCompletionWithRetry` recebe `sessionDateRange`
//    (L3-T03/L3-T04) para grounding de calendário — roteiro é a única etapa
//    cuja saída tem datas literais (`RoteiroEstruturado.dias[].data`), então
//    a única que precisa disso (ver `src/lib/gateway-ia/validation.ts`,
//    `validateDateGrounding`, que já rejeita qualquer data fora do range —
//    esta função nunca precisa checar "data fora do range" de novo).
// 3. NORMALIZAÇÃO DE DIAS (critério de aceite desta tarefa: "todo dia do
//    range da viagem tem bloco manhã/tarde/noite"): o LLM pode devolver
//    menos dias do que o range inteiro (ex. pular um dia "sem nada
//    planejado") — `normalizeRoteiroDays` preenche qualquer dia ausente do
//    range com um bloco manhã/tarde/noite vazio (`[]`), e nunca remove um
//    dia devolvido pelo LLM nem inventa atividade. Se o LLM devolver o mesmo
//    dia duplicado, os blocos são mesclados (concatenados), nunca
//    descartados.
//
// Fronteira desta tarefa (RN-01, TASK.md Seção 1 item 4): só a REGRA de
// geração — não é Server Action de tela (L10-T03), não persiste
// `ItineraryItem` (também L10-T03/`applySessionFlowTransition`, Lote 4), e
// não faz parte da UI (L10-T02). `RoteiroItemResult.sequenceOrder` é
// calculado aqui (ordem cronológica: dia > manhã/tarde/noite > ordem
// devolvida pelo LLM dentro do bloco) só para poupar o chamador de recalcular
// a mesma ordem ao persistir `ItineraryItem.sequenceOrder`
// (`prisma/schema.prisma`) — esta função não persiste nada.
//
// Sanitização de texto livre (L11-T03/RL8-T02, TASK.md Seção 1 item 9):
// `input.destination.name`/`input.accommodation.name`/`.type`/
// `input.approvedActivities[].name` já chegam sanitizados contra prompt
// injection ANTES de serem persistidos como `DestinationApproval`/
// `AccommodationApproval`/`ActivityApproval` (ver `sanitizeFreeTextForPrompt`
// aplicada nos pontos de captura, e `assertValidAccommodationPayload`,
// RL8-T02) — esta função consome dado já aprovado da sessão, não texto livre
// bruto do usuário, então não sanitiza de novo (mesmo raciocínio já adotado
// por `./hospedagem.ts`/`./passeios.ts`, e por `buildRoteiroPrompt`, que só
// interpola esses campos em frases fixas em português, nunca como
// instrução).

import {
  GATEWAY_IA_SCHEMA_NAMES,
  buildRoteiroPrompt,
  roteiroEstruturadoSchema,
  generateStructuredCompletionWithRetry,
} from "@/lib/gateway-ia";
import type { RoteiroEstruturado, StageContext } from "@/lib/gateway-ia";

/**
 * Contexto necessário para gerar o roteiro final (RF-08.1) — subconjunto de
 * `StageContext` relevante a esta etapa (datas + destino/hospedagem já
 * aprovados, obrigatórios; passeios aprovados, opcional mas normalmente
 * presente, RF-07) mais o `sessionId` exigido por
 * `generateStructuredCompletionWithRetry` para `LlmGenerationLog`
 * (ADR-004/RNF-05, TASK.md Seção 1 item 8).
 */
export type GenerateRoteiroInput = {
  /** `TripSession.id` — resolução/checagem de dono do registro é responsabilidade do chamador (TASK.md Seção 1 item 9; L11-T02). */
  sessionId: string;
  /** Data corrente (grounding de calendário, ADR-003). Formato ISO (`YYYY-MM-DD`). */
  referenceDate: string;
  /** Range de datas já resolvido da sessão (RF-01/RF-02/RF-03). Formato ISO (`YYYY-MM-DD`). */
  dateRangeStart: string;
  dateRangeEnd: string;
  /** Destino já aprovado (RF-11/RN-01) — obrigatório: esta etapa não pode ser chamada sem ele. */
  destination: {
    name: string;
    priceRangeMin?: number;
    priceRangeMax?: number;
  };
  /** Hospedagem já aprovada (RF-06) — obrigatória: `buildRoteiroPrompt` já lança sem ela. */
  accommodation: {
    name: string;
    type: string;
  };
  /** Passeios já aprovados (RF-07) — opcional: um roteiro sem nenhum passeio específico ainda é válido (RN-04), `buildRoteiroPrompt` monta um roteiro coerente com o destino mesmo assim. */
  approvedActivities?: {
    name: string;
    durationApprox: string;
    isFree: boolean;
  }[] | null;
};

/**
 * Um item já sequenciado do roteiro final: a atividade em si, o horário
 * sugerido (RF-08.3, sempre presente — `roteiroBlocoSchema.horarioSugerido`
 * já garante `.min(1)`, `src/lib/gateway-ia/schemas.ts`), a justificativa de
 * timing quando o modelo a forneceu (RF-08.2/.3, nullable — nem toda
 * atividade tem uma, mesmo shape de `ItineraryItem.timingJustification`), e
 * a posição global do item dentro do roteiro inteiro (0-based, ordem
 * cronológica dia > manhã/tarde/noite > ordem devolvida pelo LLM dentro do
 * bloco) — espelha `ItineraryItem.sequenceOrder` para poupar o chamador
 * (L10-T03) de recalculá-la ao persistir.
 */
export type RoteiroItemResult = {
  activity: string;
  suggestedTime: string;
  timingJustification: string | null;
  sequenceOrder: number;
};

/**
 * Um dia do roteiro final, sempre com os 3 blocos presentes (RF-08.1,
 * critério de aceite desta tarefa) — `morning`/`afternoon`/`evening` podem
 * ser listas vazias (`[]`), mas nunca `undefined`.
 */
export type RoteiroDayResult = {
  /** Formato ISO (`YYYY-MM-DD`), sempre dentro de `[dateRangeStart, dateRangeEnd]` (grounding de calendário, L3-T03). */
  date: string;
  morning: RoteiroItemResult[];
  afternoon: RoteiroItemResult[];
  evening: RoteiroItemResult[];
};

type RoteiroBloco = RoteiroEstruturado["dias"][number]["manha"][number];

/** Converte uma data em formato `YYYY-MM-DD[...]` para epoch (UTC, meia-noite) — `null` se não for interpretável. Mesma lógica de `parseIsoDateToUtcEpoch` em `src/lib/gateway-ia/validation.ts` (não exportada de lá, duplicada aqui deliberadamente para não criar acoplamento entre um módulo de validação genérico e uma regra de negócio específica de etapa). */
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

function toIsoDateString(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Enumera todas as datas ISO (`YYYY-MM-DD`) de `startIso` até `endIso`, inclusive. Lista vazia se as datas não forem interpretáveis ou `start > end`. */
function enumerateIsoDates(startIso: string, endIso: string): string[] {
  const start = parseIsoDateToUtcEpoch(startIso);
  const end = parseIsoDateToUtcEpoch(endIso);
  if (start === null || end === null || start > end) {
    return [];
  }
  const dates: string[] = [];
  for (let epoch = start; epoch <= end; epoch += ONE_DAY_MS) {
    dates.push(toIsoDateString(epoch));
  }
  return dates;
}

function mapBlock(
  blocos: RoteiroBloco[],
  counter: { value: number },
): RoteiroItemResult[] {
  return blocos.map((bloco) => ({
    activity: bloco.atividade,
    suggestedTime: bloco.horarioSugerido,
    timingJustification: bloco.justificativaTiming,
    sequenceOrder: counter.value++,
  }));
}

/**
 * Normaliza a saída bruta do LLM (`RoteiroEstruturado.dias`) para garantir
 * que TODO dia do range `[dateRangeStart, dateRangeEnd]` apareça no
 * resultado, com os 3 blocos sempre presentes (RF-08.1, critério de aceite
 * desta tarefa) — dias que o LLM não incluiu viram um dia com os 3 blocos
 * vazios; dias duplicados pelo LLM são mesclados (blocos concatenados,
 * nunca descartados). A ordem final é sempre cronológica por data,
 * independente da ordem em que o LLM devolveu `dias`.
 */
function normalizeRoteiroDays(
  dias: RoteiroEstruturado["dias"],
  dateRangeStart: string,
  dateRangeEnd: string,
): RoteiroDayResult[] {
  const byDate = new Map<string, RoteiroEstruturado["dias"][number]>();

  for (const dia of dias) {
    const epoch = parseIsoDateToUtcEpoch(dia.data);
    // Data fora do range/ininterpretável já teria sido rejeitada por
    // `validateDateGrounding` (L3-T03) antes de chegar aqui — este fallback
    // (usar `dia.data` bruta) só existe como defesa em profundidade, nunca
    // deveria ser exercitado em produção.
    const normalizedDate = epoch !== null ? toIsoDateString(epoch) : dia.data;
    const existing = byDate.get(normalizedDate);
    if (existing) {
      byDate.set(normalizedDate, {
        data: normalizedDate,
        manha: [...existing.manha, ...dia.manha],
        tarde: [...existing.tarde, ...dia.tarde],
        noite: [...existing.noite, ...dia.noite],
      });
    } else {
      byDate.set(normalizedDate, { ...dia, data: normalizedDate });
    }
  }

  const allDates = enumerateIsoDates(dateRangeStart, dateRangeEnd);
  const counter = { value: 0 };

  return allDates.map((date) => {
    const dia = byDate.get(date);
    return {
      date,
      morning: mapBlock(dia?.manha ?? [], counter),
      afternoon: mapBlock(dia?.tarde ?? [], counter),
      evening: mapBlock(dia?.noite ?? [], counter),
    };
  });
}

/**
 * Gera o roteiro final estruturado por dia (RF-08.1), com sequenciamento por
 * proximidade lógica/geográfica (RF-08.2) e horário ideal por atividade
 * (RF-08.3, sempre presente) via Gateway de IA — resolução do SPIKE-02
 * documentada no cabeçalho deste arquivo. Todo dia do range
 * `[dateRangeStart, dateRangeEnd]` está presente no resultado, mesmo que
 * vazio (critério de aceite desta tarefa). Só propaga `GatewayIaError`
 * (`@/lib/gateway-ia`) se a chamada ao provider falhar após o retry único
 * (L3-T04) — o que já inclui grounding de calendário (L3-T03, garante que
 * nenhuma data devolvida escapa do range da sessão) — ou o `Error` lançado
 * por `buildRoteiroPrompt` quando `input.destination`/`input.accommodation`
 * está ausente (RN-01).
 */
export async function generateRoteiro(
  input: GenerateRoteiroInput,
): Promise<RoteiroDayResult[]> {
  const context: StageContext = {
    referenceDate: input.referenceDate,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    destination: input.destination,
    accommodation: input.accommodation,
    approvedActivities: input.approvedActivities ?? null,
  };

  const result = await generateStructuredCompletionWithRetry({
    sessionId: input.sessionId,
    stage: "roteiro",
    schemaName: GATEWAY_IA_SCHEMA_NAMES.roteiro,
    schema: roteiroEstruturadoSchema,
    messages: buildRoteiroPrompt(context),
    sessionDateRange: {
      dateRangeStart: input.dateRangeStart,
      dateRangeEnd: input.dateRangeEnd,
    },
  });

  return normalizeRoteiroDays(
    result.data.dias,
    input.dateRangeStart,
    input.dateRangeEnd,
  );
}
