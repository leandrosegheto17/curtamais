// L3-T02 — Prompt design + contexto acumulado por etapa (ADR-003).
//
// Cada etapa do fluxo guiado (destino/hospedagem/passeios/roteiro) recebe
// SÓ o contexto estruturado relevante até aquele ponto (datas, orçamento,
// destino já aprovado, etc.) — nunca a conversa inteira em texto livre
// (ADR-003: "contexto acumulado estruturado, não texto livre", mitigando o
// risco do modelo "esquecer" uma restrição já aprovada, ex. orçamento). Os
// campos de `StageContext` espelham diretamente `TripSession`/entidades
// filhas já aprovadas (`prisma/schema.prisma`), montado pelo chamador
// (Orquestrador de Sessão, Lote 4 — ainda não implementado; ver nota de
// implementação L3-T02 no TASK.md sobre quem monta este contexto hoje).
//
// Grounding de data/calendário (ADR-003): todo prompt de destino/roteiro
// recebe a data corrente (`referenceDate`) e o range de datas já resolvido
// da sessão, para reduzir alucinação de sazonalidade (ex. sugerir destino de
// inverno em mês de verão do hemisfério errado). A VALIDAÇÃO de que a
// resposta respeita esse grounding é L3-T03 — aqui só entra no prompt.
//
// Fora de escopo desta tarefa: filtro/priorização de orçamento (RF-10,
// L4-T03/L7-T01 etc. aplicam sobre a saída já validada), validação de
// plausibilidade de preço (L3-T03), retry/log (L3-T04).

import type { GatewayIaMessage } from "./index";
import {
  GATEWAY_IA_SCHEMA_NAMES,
  destinoSugestoesSchema,
  hospedagemOpcoesSchema,
  passeiosOpcoesSchema,
  roteiroEstruturadoSchema,
} from "./schemas";
import { z } from "zod";

export type GatewayIaStage = "destino" | "hospedagem" | "passeios" | "roteiro";

export const GATEWAY_IA_STAGE_IDS: readonly GatewayIaStage[] = [
  "destino",
  "hospedagem",
  "passeios",
  "roteiro",
];

export function isGatewayIaStage(value: string): value is GatewayIaStage {
  return (GATEWAY_IA_STAGE_IDS as readonly string[]).includes(value);
}

/** Destino já aprovado na sessão (RF-04/RF-11) — obrigatório a partir da etapa de hospedagem. */
export type ApprovedDestinationContext = {
  name: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
};

/** Hospedagem já aprovada na sessão (RF-06) — obrigatório a partir da etapa de passeios. */
export type ApprovedAccommodationContext = {
  name: string;
  type: string;
};

/** Um passeio/atividade já aprovado na sessão (RF-07) — usado na etapa de roteiro. */
export type ApprovedActivityContext = {
  name: string;
  durationApprox: string;
  isFree: boolean;
};

/**
 * Contexto acumulado da sessão até o ponto em que uma etapa é gerada. Cada
 * `buildXPrompt` abaixo só lê os campos relevantes à sua etapa — os campos
 * de etapas futuras (ex. `accommodation` num prompt de destino) são
 * ignorados, nunca exigidos.
 */
export type StageContext = {
  /** Data corrente no momento da geração (grounding de calendário, ADR-003). Formato ISO (`YYYY-MM-DD`). */
  referenceDate: string;
  /** Range de datas já resolvido da sessão (RF-01/RF-02/RF-03). Formato ISO (`YYYY-MM-DD`). */
  dateRangeStart: string;
  dateRangeEnd: string;
  /** Orçamento informado pelo usuário — ausência nunca bloqueia geração (RF-10.3). */
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  /** Presente a partir da etapa de hospedagem em diante. */
  destination?: ApprovedDestinationContext | null;
  /** Presente a partir da etapa de passeios em diante. */
  accommodation?: ApprovedAccommodationContext | null;
  /** Presente na etapa de roteiro. */
  approvedActivities?: ApprovedActivityContext[] | null;
};

const BASE_SYSTEM_PROMPT =
  "Você é o assistente de planejamento de viagens do CurtaMais. Responda " +
  "SEMPRE em português do Brasil, apenas com o JSON estruturado pedido " +
  "(sem texto fora do schema). Toda faixa de preço é uma estimativa " +
  "aproximada, nunca um valor garantido. Nunca invente restrições que o " +
  "usuário não informou (ex.: não assuma orçamento se ele não foi dado).";

function formatBudgetLine(context: StageContext): string {
  if (context.budgetAmount == null) {
    return "Orçamento: não informado pelo usuário — não descarte opções por preço, apenas ordene as mais econômicas primeiro quando fizer sentido.";
  }
  const currency = context.budgetCurrency ?? "BRL";
  return `Orçamento total informado pelo usuário: aproximadamente ${context.budgetAmount} ${currency} (RF-10 — nunca use isso para bloquear a geração, apenas para priorizar).`;
}

function formatDateRangeLine(context: StageContext): string {
  return (
    `Data de hoje (grounding de calendário, ADR-003): ${context.referenceDate}. ` +
    `Período da viagem já definido: de ${context.dateRangeStart} até ${context.dateRangeEnd}. ` +
    "Considere sazonalidade/clima coerentes com essas datas."
  );
}

/**
 * Etapa RF-04 — sugestões de destino. Recebe datas + orçamento (destino
 * ainda não existe nesta etapa, é o que está sendo decidido).
 */
export function buildDestinoPrompt(context: StageContext): GatewayIaMessage[] {
  return [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Sugira entre 2 e 4 destinos de viagem para o período informado.",
        formatDateRangeLine(context),
        formatBudgetLine(context),
        "Para cada destino, informe: nome, uma justificativa curta (1-2 frases) " +
          "do porquê combina com o período/orçamento, e uma faixa de preço " +
          "total aproximada (min/max) para a viagem inteira nesse destino.",
      ].join("\n"),
    },
  ];
}

/**
 * Etapa RF-06 — opções de hospedagem. Recebe o destino já aprovado (RF-11) —
 * sem ele, esta etapa não pode ser chamada (violaria RN-01: uma etapa
 * combina só a decisão que lhe cabe, aqui hospedagem, assumindo destino como
 * dado já resolvido).
 */
export function buildHospedagemPrompt(
  context: StageContext,
): GatewayIaMessage[] {
  if (!context.destination) {
    throw new Error(
      "buildHospedagemPrompt requer context.destination (destino já aprovado, RF-11) — " +
        "esta etapa não pode ser chamada sem ele.",
    );
  }
  return [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `Destino já aprovado pelo usuário: ${context.destination.name}.`,
        formatDateRangeLine(context),
        formatBudgetLine(context),
        "Sugira exatamente 3 opções de hospedagem nesse destino, cobrindo " +
          "perfis diferentes (ex.: econômico, intermediário, mais confortável) " +
          "quando fizer sentido para o orçamento informado.",
        "Para cada opção, informe: nome, tipo (ex.: hotel, pousada, hostel, " +
          "apartamento), faixa de preço por diária aproximada (min/max) e uma " +
          "característica distintiva (o que a diferencia das outras).",
      ].join("\n"),
    },
  ];
}

/**
 * Etapa RF-07 — passeios/atividades. Recebe destino já aprovado; hospedagem
 * é contexto opcional (ajuda o modelo a não sugerir algo redundante), mas
 * não é obrigatória para esta etapa gerar conteúdo coerente.
 */
export function buildPasseiosPrompt(
  context: StageContext,
): GatewayIaMessage[] {
  if (!context.destination) {
    throw new Error(
      "buildPasseiosPrompt requer context.destination (destino já aprovado, RF-11) — " +
        "esta etapa não pode ser chamada sem ele.",
    );
  }
  const hospedagemLine = context.accommodation
    ? `Hospedagem já aprovada: ${context.accommodation.name} (${context.accommodation.type}).`
    : "Hospedagem ainda não aprovada nesta sessão — não assuma nenhuma localização de hospedagem específica.";
  return [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `Destino já aprovado pelo usuário: ${context.destination.name}.`,
        hospedagemLine,
        formatDateRangeLine(context),
        formatBudgetLine(context),
        "Sugira uma lista de passeios/atividades para este destino. Inclua " +
          "pelo menos uma opção gratuita quando existir algo relevante e " +
          "gratuito para o destino (RF-07.2) — nunca invente gratuidade só " +
          "para cumprir isso, é preferível não incluir se não existir opção " +
          "real plausível.",
        "Para cada passeio, informe: nome, faixa de preço por pessoa " +
          "aproximada (min/max, podendo ser 0 quando gratuito), se é " +
          "gratuito, e a duração aproximada (ex.: '2 horas', 'dia inteiro').",
      ].join("\n"),
    },
  ];
}

/**
 * Etapa RF-08 — roteiro final. Recebe destino, hospedagem e os passeios já
 * aprovados (todas as decisões anteriores), e monta um roteiro dia a dia
 * dividido em manhã/tarde/noite (RF-08.1), com sequenciamento por
 * proximidade geográfica (RF-08.2, melhor esforço do modelo — sem dado real
 * de geolocalização, ver SPIKE-02) e horário ideal por atividade (RF-08.3).
 */
export function buildRoteiroPrompt(context: StageContext): GatewayIaMessage[] {
  if (!context.destination) {
    throw new Error(
      "buildRoteiroPrompt requer context.destination (destino já aprovado, RF-11) — " +
        "esta etapa não pode ser chamada sem ele.",
    );
  }
  if (!context.accommodation) {
    throw new Error(
      "buildRoteiroPrompt requer context.accommodation (hospedagem já aprovada, RF-06) — " +
        "esta etapa não pode ser chamada sem ela.",
    );
  }
  const activities = context.approvedActivities ?? [];
  const activitiesLine =
    activities.length > 0
      ? "Passeios já aprovados pelo usuário, a incluir no roteiro:\n" +
        activities
          .map(
            (activity) =>
              `- ${activity.name} (${activity.durationApprox}${
                activity.isFree ? ", gratuito" : ""
              })`,
          )
          .join("\n")
      : "Nenhum passeio específico foi aprovado — monte um roteiro coerente " +
        "com o destino mesmo assim.";

  return [
    { role: "system", content: BASE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `Destino já aprovado: ${context.destination.name}.`,
        `Hospedagem já aprovada: ${context.accommodation.name} (${context.accommodation.type}).`,
        formatDateRangeLine(context),
        activitiesLine,
        "Monte um roteiro dia a dia cobrindo TODO o período da viagem, cada " +
          "dia dividido em blocos de manhã/tarde/noite (RF-08.1) — um dia " +
          "pode ter listas vazias em algum período, mas o dia precisa " +
          "aparecer.",
        "Para cada atividade do roteiro, informe: a atividade em si, um " +
          "horário sugerido, e (quando fizer sentido) uma justificativa curta " +
          "de por que esse horário/sequência foi escolhido (ex.: evitar " +
          "deslocamento repetido, aproveitar luz do dia) — RF-08.2/RF-08.3. " +
          "Priorize agrupar atividades geograficamente próximas no mesmo " +
          "bloco/dia sempre que uma alternativa equivalente existir.",
      ].join("\n"),
    },
  ];
}

/**
 * Formato de contexto aceito pelo Route Handler de streaming (JSON no corpo
 * da requisição, TASK.md item "Route Handler + ReadableStream"). Validado
 * no servidor (TASK.md Seção 1, item 9) antes de compor qualquer prompt —
 * nenhum campo de texto livre do usuário (ex. destino manual, se um dia
 * entrar aqui) deve pular esta validação.
 */
export const stageContextSchema = z.object({
  referenceDate: z.string().min(1),
  dateRangeStart: z.string().min(1),
  dateRangeEnd: z.string().min(1),
  budgetAmount: z.number().nonnegative().nullish(),
  budgetCurrency: z.string().min(1).nullish(),
  destination: z
    .object({
      name: z.string().min(1),
      priceRangeMin: z.number().nonnegative().optional(),
      priceRangeMax: z.number().nonnegative().optional(),
    })
    .nullish(),
  accommodation: z
    .object({
      name: z.string().min(1),
      type: z.string().min(1),
    })
    .nullish(),
  approvedActivities: z
    .array(
      z.object({
        name: z.string().min(1),
        durationApprox: z.string().min(1),
        isFree: z.boolean(),
      }),
    )
    .nullish(),
}) satisfies z.ZodType<StageContext>;

export type GatewayIaStageDefinition<Schema extends z.ZodTypeAny> = {
  schemaName: string;
  schema: Schema;
  buildMessages: (context: StageContext) => GatewayIaMessage[];
};

/**
 * Registro central por etapa: schema de saída + builder de prompt. Consumido
 * pelo Route Handler de streaming (`src/app/api/gateway-ia/[etapa]/route.ts`)
 * e, futuramente, pelas regras de negócio por etapa (L7-T01/L8-T01/L9-T01/
 * L10-T01) — ambos os consumidores passam a chamar só este registro, nunca
 * reconstroem prompt/schema por conta própria.
 */
export const GATEWAY_IA_STAGES: {
  [Stage in GatewayIaStage]: GatewayIaStageDefinition<z.ZodTypeAny>;
} = {
  destino: {
    schemaName: GATEWAY_IA_SCHEMA_NAMES.destino,
    schema: destinoSugestoesSchema,
    buildMessages: buildDestinoPrompt,
  },
  hospedagem: {
    schemaName: GATEWAY_IA_SCHEMA_NAMES.hospedagem,
    schema: hospedagemOpcoesSchema,
    buildMessages: buildHospedagemPrompt,
  },
  passeios: {
    schemaName: GATEWAY_IA_SCHEMA_NAMES.passeios,
    schema: passeiosOpcoesSchema,
    buildMessages: buildPasseiosPrompt,
  },
  roteiro: {
    schemaName: GATEWAY_IA_SCHEMA_NAMES.roteiro,
    schema: roteiroEstruturadoSchema,
    buildMessages: buildRoteiroPrompt,
  },
};
