"use server";

// L10-T03 — Server Action da tela T08 (Roteiro final, RF-08.4,
// UX-SPEC.md Seção 2 "T08 — Roteiro final").
//
// Consome, sem duplicar lógica:
// - `generateRoteiro` (`@/lib/stage-rules`, L10-T01) — regra RF-08.1/.2/.3
//   (chamada ao Gateway de IA + normalização de dias/sequenceOrder).
// - `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02) — único ponto
//   autorizado a escrever em `TripSession`/`ItineraryItem` (Diretriz de
//   Implementação 3, TASK.md Seção 1). Nenhuma função abaixo chama
//   `prisma.tripSession.update`/`prisma.itineraryItem.createMany`
//   diretamente.
//
// Mesmo padrão exato já estabelecido por `src/lib/actions/passeios.ts`
// (L9-T03)/`src/lib/actions/hospedagem.ts` (L8-T03): mesma forma de resolver
// sessão/etapa, mesma forma de revalidar payload antes de persistir.
//
// DIFERENÇA CHAVE em relação às etapas anteriores (UX-SPEC.md T08: "Ação
// única de aprovação no rodapé: 'Aprovar roteiro e concluir' — não há
// 'ajustar' item a item dentro do roteiro no MVP" e nenhum "encerrar aqui"
// dedicado — quem quisesse encerrar sem roteiro já teve essa opção no
// rodapé de T07/`encerrarResolucaoPasseios`): T08 é a etapa TERMINAL do
// fluxo (RF-09). `aprovarRoteiro` abaixo encadeia as MESMAS duas ações da
// state machine já usadas por `aprovarHospedagem`/`aprovarSelecaoPasseios`
// (`aprovar` seguida de `avancar`), mas aqui a segunda transição
// (`roteiro_aprovado` → `avancar`) leva a `concluida` (estado terminal,
// `./state-machine.ts`), não a um próximo `*_pendente` — e
// `applySessionFlowTransition` já sincroniza `TripSession.status =
// "completed"` automaticamente ao gravar `flowState = "concluida"` (Adendo 1
// do ADR-006, `persistence.ts`), sem nenhuma escrita adicional necessária
// aqui. Por isso não existe `encerrarResolucaoRoteiro` neste arquivo —
// aprovar o roteiro JÁ é o único caminho de conclusão desta etapa.
//
// CONTRATO ESPERADO DA SERVER ACTION (para a UI de T08, L10-T02, tarefa
// paralela que ainda não existe no momento desta implementação — mesmo
// raciocínio de "CONTRATO ESPERADO" já usado por `passeios.ts`/L9-T03 para
// L9-T02):
// - `gerarRoteiro(sessionId)` retorna `RoteiroDayResult[]` (mesmo shape que
//   `generateRoteiro`, L10-T01, já devolve — um item por dia do range da
//   viagem, sempre com os 3 blocos `morning`/`afternoon`/`evening`
//   presentes, mesmo que vazios) — a UI renderiza isso diretamente, sem
//   remapear.
// - `aprovarRoteiro({ sessionId, dias })` recebe de volta EXATAMENTE o
//   mesmo array `RoteiroDayResult[]` (a UI de T08 não edita nada — não há
//   "ajustar item a item" no MVP, UX-SPEC.md T08) e devolve
//   `AprovarRoteiroResult` (`flowState: "concluida"`, `proximaEtapa:
//   "encerramento"`) — a UI então navega para T-END (completo).
//
// Autorização de dono de sessão: `applySessionFlowTransition` já aplica o
// guard internamente (L11-T02, `@/lib/session-flow/authorization.ts`) —
// cobre `aprovarRoteiro` abaixo. `gerarRoteiro` lê `TripSession` diretamente
// (fora do módulo `session-flow`), então chama `assertSessionOwnership`
// explicitamente logo após a checagem de existência.
//
// Sanitização L11-T03/RL8-T02 (mesmo raciocínio de `passeios.ts`/
// `hospedagem.ts`, aplicada por defesa em profundidade mesmo esta sendo a
// etapa TERMINAL — `activity`/`suggestedTime`/`timingJustification` não são
// interpolados em nenhum prompt futuro depois do roteiro, mas ainda assim
// voltam ao servidor via client no momento da aprovação e são exibidos na
// tela de encerramento/T-END, L10-T04): sanitizados via
// `sanitizeFreeTextForPrompt` ANTES de qualquer validação de "vazio", e é o
// valor sanitizado (nunca o original) que chega a
// `applySessionFlowTransition`/`ItineraryItem`.
//
// `activityId` (`prisma/schema.prisma`, `ItineraryItem.activityId`,
// nullable): `RoteiroItemResult` (L10-T01) só carrega o NOME textual da
// atividade (`activity: string`), sem o id do `ActivityApproval` de origem —
// não há hoje nenhum mecanismo (nesta tarefa ou em L10-T01) que associe um
// item de roteiro de volta ao registro de `ActivityApproval` que o originou
// (casar por nome seria uma heurística frágil, já que o LLM pode
// parafrasear o nome ao posicioná-lo no roteiro). Por isso todo
// `ItineraryItem` persistido aqui grava `activityId: null` — decisão dentro
// da margem de "detalhe de implementação" (o schema já modela isso como
// nullable, "nem todo item de roteiro precisa referenciar um passeio
// aprovado"), não uma lacuna de arquitetura: nenhum critério de aceite desta
// tarefa exige o vínculo. Registrado aqui para visibilidade caso uma tarefa
// futura precise do vínculo (ex. UI querer destacar "este item veio de um
// passeio aprovado").
//
// GAP DE SCHEMA CONHECIDO (investigado nesta tarefa, sinalizado para o
// Coordenador, NÃO tratado como bloqueio desta tarefa — ver raciocínio
// abaixo): `ItineraryItem` (`prisma/schema.prisma`/SDD.md Seção 5) não tem
// NENHUMA coluna de texto livre para o nome/descrição da atividade em si —
// só `suggestedTime`/`timingJustification`/`sequenceOrder`/`period`/
// `dayDate` mais o `activityId` opcional. O design original (SDD.md, "
// ActivityApproval ||--o| ItineraryItem: 0..1") presumia que todo
// `ItineraryItem` obteria seu nome de exibição via join com
// `ActivityApproval.name`. Só que `buildRoteiroPrompt`
// (`@/lib/gateway-ia/prompts.ts`, já existente desde L3-T02) explicitamente
// instrui o LLM a "montar um roteiro coerente com o destino" mesmo sem
// nenhum passeio aprovado (RN-04) — ou seja, é NORMAL o roteiro conter itens
// que não correspondem a nenhuma `ActivityApproval` (ex. "Check-in na
// hospedagem", "Jantar no destino"), então `activityId: null` é o caso
// comum, não a exceção. Resultado: uma vez persistido, um `ItineraryItem`
// sem `activityId` não carrega, em lugar nenhum do banco, o texto que
// descreve o que ele É — a informação existe só na resposta em memória de
// `gerarRoteiro`/`generateRoteiro`, nunca sobrevive a um reload/nova sessão
// de leitura.
// NÃO tratado como bloqueio desta tarefa porque (a) o critério de aceite
// desta tarefa é literalmente "persistir os itens do roteiro em
// `ItineraryItem` conforme o schema existente" — o schema em si já estava
// aprovado desde L1-T02/L4-T02 (Concluídas, sem essa observação
// registrada), então mudar `prisma/schema.prisma` está fora da autoridade
// desta tarefa (exigiria uma migration + decisão do Coordenador/ADR-005
// revisitado); (b) nenhuma tarefa deste lote lê `ItineraryItem` de volta do
// banco para reconstruir a UI — `EncerramentoScreen`/T-END (L10-T04) é
// puramente apresentacional e recebe os dados já resolvidos em memória por
// quem a monta (ver nota de implementação L10-T04 no TASK.md, "Gap
// conhecido... não bloqueante", mesmo padrão de gap aceito) — então o
// caminho feliz do MVP (aprovar → ver T-END na mesma navegação) nunca
// precisa reler o nome do item do banco. Impacto real fica restrito a um
// cenário futuro (Fase 2, fora de escopo: reabrir uma viagem já concluída
// e listar o roteiro salvo) — sinalizado aqui explicitamente para o
// Coordenador avaliar se `ItineraryItem` precisa de uma coluna própria de
// nome/atividade numa migration futura.

import { prisma } from "@/lib/prisma";
import { generateRoteiro } from "@/lib/stage-rules";
import type { RoteiroDayResult, RoteiroItemResult } from "@/lib/stage-rules";
import {
  applySessionFlowTransition,
  assertSessionOwnership,
  SessionNotFoundError,
  type ApproveItineraryItemInput,
} from "@/lib/session-flow";
import { sanitizeFreeTextForPrompt } from "@/lib/gateway-ia/prompt-injection-guard";
import {
  InvalidRoteiroItemError,
  RoteiroContextoIncompletoError,
  RoteiroEtapaInvalidaError,
} from "./roteiro-errors";

/**
 * Mesmo raciocínio de teto de sanidade de `ACTIVITY_NAME_MAX_LENGTH`
 * (`passeios.ts`, L9-T03/RL8-T02) — aplicado por defesa em profundidade
 * mesmo o roteiro sendo a etapa terminal (ver nota no cabeçalho do arquivo).
 */
const ROTEIRO_ACTIVITY_MAX_LENGTH = 200;
const ROTEIRO_SUGGESTED_TIME_MAX_LENGTH = 50;
const ROTEIRO_TIMING_JUSTIFICATION_MAX_LENGTH = 500;

export type { RoteiroDayResult, RoteiroItemResult };

/**
 * RF-08.1/RF-08.2/RF-08.3 — gera o roteiro final estruturado por dia para a
 * sessão (delegado a `generateRoteiro`, L10-T01). Usada para o carregamento
 * inicial de T08 — diferente de T06/T07, não existe um "Ajustar" para
 * roteiro no MVP (UX-SPEC.md T08): esta função é chamada uma vez, e o único
 * próximo passo é `aprovarRoteiro` abaixo. Nenhuma transição de estado
 * acontece aqui, a sessão permanece em `roteiro_pendente`.
 */
export async function gerarRoteiro(
  sessionId: string,
): Promise<RoteiroDayResult[]> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      userId: true,
      anonSessionId: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // L11-T02/ADR-008 — leitura direta de `TripSession` fora do módulo
  // `session-flow`: guard central chamado explicitamente aqui.
  await assertSessionOwnership(sessionId, session);

  if (session.flowState !== "roteiro_pendente") {
    throw new RoteiroEtapaInvalidaError(session.flowState);
  }

  if (!session.dateRangeStart || !session.dateRangeEnd) {
    // Nunca deveria acontecer — guarda defensiva, mesmo raciocínio de
    // `PasseiosContextoIncompletoError` (Diretriz de Implementação 9).
    throw new RoteiroContextoIncompletoError(sessionId);
  }

  const destination = await prisma.destinationApproval.findUnique({
    where: { sessionId },
    select: { name: true, priceRangeMin: true, priceRangeMax: true },
  });
  const accommodation = await prisma.accommodationApproval.findUnique({
    where: { sessionId },
    select: { name: true, type: true },
  });

  if (!destination || !accommodation) {
    // Nunca deveria acontecer: uma sessão só chega a `roteiro_pendente`
    // depois de `passeios_aprovados` + `avancar` (RF-11), que por sua vez
    // exige `destino_confirmado` e `hospedagem_aprovada` já gravados
    // (guarda defensiva).
    throw new RoteiroContextoIncompletoError(sessionId);
  }

  // Passeios aprovados são opcionais para o contexto (RN-04, `generateRoteiro`,
  // L10-T01) — uma sessão em `roteiro_pendente` normalmente TEM ao menos um
  // `ActivityApproval`, mas a ausência não é tratada como violação de
  // invariante.
  const activities = await prisma.activityApproval.findMany({
    where: { sessionId },
    orderBy: { orderIndex: "asc" },
    select: { name: true, durationApprox: true, isFree: true },
  });

  const referenceDate = new Date().toISOString().slice(0, 10);

  return generateRoteiro({
    sessionId,
    referenceDate,
    dateRangeStart: session.dateRangeStart.toISOString().slice(0, 10),
    dateRangeEnd: session.dateRangeEnd.toISOString().slice(0, 10),
    destination: {
      name: destination.name,
      priceRangeMin: destination.priceRangeMin.toNumber(),
      priceRangeMax: destination.priceRangeMax.toNumber(),
    },
    accommodation: {
      name: accommodation.name,
      type: accommodation.type,
    },
    approvedActivities:
      activities.length > 0
        ? activities.map((activity) => ({
            name: activity.name,
            durationApprox: activity.durationApprox,
            isFree: activity.isFree,
          }))
        : null,
  });
}

/** Mesmo shape de `AprovarRoteiroResult` esperado pela futura T08 (L10-T02). */
export type AprovarRoteiroResult = {
  /** RF-08.4/RF-09 — aprovar o roteiro sempre conclui a sessão (etapa terminal). */
  proximaEtapa: "encerramento";
  sessionId: string;
  flowState: "concluida";
  /** Total de itens de roteiro persistidos, nas 3 faixas de horário somadas. */
  totalItens: number;
};

/**
 * Mapeia cada bloco de `RoteiroDayResult` para o `period` do enum
 * `ItineraryPeriod` (`prisma/schema.prisma`) correspondente — a posição do
 * item dentro do array já determina o período, então o período nunca é lido
 * de volta do payload do cliente (nada a revalidar aqui além da própria
 * estrutura do item).
 */
const PERIOD_BY_BLOCK_KEY = {
  morning: "manha",
  afternoon: "tarde",
  evening: "noite",
} as const satisfies Record<
  "morning" | "afternoon" | "evening",
  ApproveItineraryItemInput["period"]
>;

/** Formato ISO estrito (`YYYY-MM-DD`) — mesmo formato que `RoteiroDayResult.date` (L10-T01) sempre usa. */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte `RoteiroDayResult.date` (`YYYY-MM-DD`) num `Date` UTC à meia-noite
 * — mesmo formato exigido por `ItineraryItem.dayDate` (`@db.Date`). Lança
 * `InvalidRoteiroItemError` para qualquer formato fora do esperado (defesa
 * contra um payload de dia adulterado pelo cliente).
 */
function parseDayDateOrThrow(dateStr: string): Date {
  const match = ISO_DATE_PATTERN.exec(dateStr.trim());
  if (!match) {
    throw new InvalidRoteiroItemError(
      `Item de roteiro inválido: data de dia "${dateStr}" não está no formato ISO (YYYY-MM-DD).`,
    );
  }
  const [, yearStr, monthStr, dayStr] = match;
  const epoch = Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  if (Number.isNaN(epoch)) {
    throw new InvalidRoteiroItemError(
      `Item de roteiro inválido: data de dia "${dateStr}" inválida.`,
    );
  }
  return new Date(epoch);
}

/**
 * Revalida o payload de um item de roteiro (defesa contra adulteração no
 * client — o valor "de origem" já foi gerado por `generateRoteiro`/L10-T01,
 * mas volta ao servidor só depois de uma viagem de ida e volta pelo cliente
 * no momento da aprovação, já que não há um passo de confirmação server-side
 * intermediário para o roteiro). Mesmo raciocínio de
 * `assertValidActivityPayload` (`passeios.ts`, L9-T03).
 *
 * Sanitiza `activity`/`suggestedTime`/`timingJustification` contra prompt
 * injection via `sanitizeFreeTextForPrompt` ANTES de qualquer validação de
 * "vazio" — ver nota no cabeçalho do arquivo sobre por que isso é aplicado
 * mesmo nesta etapa terminal (defesa em profundidade, exibição em T-END).
 */
function assertValidRoteiroItem(item: RoteiroItemResult): {
  activity: string;
  suggestedTime: string;
  timingJustification: string | null;
} {
  const activity = sanitizeFreeTextForPrompt(item.activity, {
    maxLength: ROTEIRO_ACTIVITY_MAX_LENGTH,
  });
  if (!activity) {
    throw new InvalidRoteiroItemError(
      "Item de roteiro inválido: atividade ausente ou vazia.",
    );
  }
  const suggestedTime = sanitizeFreeTextForPrompt(item.suggestedTime, {
    maxLength: ROTEIRO_SUGGESTED_TIME_MAX_LENGTH,
  });
  if (!suggestedTime) {
    throw new InvalidRoteiroItemError(
      "Item de roteiro inválido: horário sugerido ausente ou vazio.",
    );
  }
  const timingJustification = item.timingJustification
    ? sanitizeFreeTextForPrompt(item.timingJustification, {
        maxLength: ROTEIRO_TIMING_JUSTIFICATION_MAX_LENGTH,
      }) || null
    : null;
  if (
    typeof item.sequenceOrder !== "number" ||
    !Number.isFinite(item.sequenceOrder) ||
    !Number.isInteger(item.sequenceOrder) ||
    item.sequenceOrder < 0
  ) {
    throw new InvalidRoteiroItemError(
      "Item de roteiro inválido: sequenceOrder ausente ou não é um inteiro não-negativo.",
    );
  }

  return { activity, suggestedTime, timingJustification };
}

/**
 * Achata `RoteiroDayResult[]` (agrupado por dia > `morning`/`afternoon`/
 * `evening`) para `ApproveItineraryItemInput[]` (uma linha por item,
 * `prisma/schema.prisma`/`persistence.ts`), revalidando cada item no
 * processo (Diretriz de Implementação 9). `activityId` sempre `null` — ver
 * nota no cabeçalho do arquivo.
 */
function flattenAndValidateDias(
  dias: RoteiroDayResult[],
): ApproveItineraryItemInput[] {
  const items: ApproveItineraryItemInput[] = [];

  for (const dia of dias) {
    const dayDate = parseDayDateOrThrow(dia.date);

    for (const blockKey of Object.keys(
      PERIOD_BY_BLOCK_KEY,
    ) as (keyof typeof PERIOD_BY_BLOCK_KEY)[]) {
      const period = PERIOD_BY_BLOCK_KEY[blockKey];
      const blockItems = dia[blockKey] ?? [];

      for (const rawItem of blockItems) {
        // `activity` é validado (não pode ser vazio) mas nunca persistido —
        // `ItineraryItem` não tem coluna própria para o nome da atividade,
        // ver "GAP DE SCHEMA CONHECIDO" no cabeçalho do arquivo.
        const { suggestedTime, timingJustification } =
          assertValidRoteiroItem(rawItem);

        items.push({
          activityId: null,
          dayDate,
          period,
          suggestedTime,
          timingJustification,
          sequenceOrder: rawItem.sequenceOrder,
        });
      }
    }
  }

  return items;
}

/**
 * RF-08.4 — aprova o roteiro final (`dias`: mesmo array `RoteiroDayResult[]`
 * devolvido por `gerarRoteiro`, sem edição — não há "ajustar item a item" no
 * MVP, UX-SPEC.md T08) e conclui a sessão (RF-09, etapa terminal). Persiste
 * via `applySessionFlowTransition` (`action: "aprovar"`, grava um
 * `ItineraryItem` por item via `createMany`, `roteiro_pendente` →
 * `roteiro_aprovado`) e, na sequência, avança a etapa (`action: "avancar"`,
 * `roteiro_aprovado` → `concluida`) — duas chamadas sequenciais, mesmo
 * padrão de `aprovarHospedagem`/`aprovarSelecaoPasseios`. A segunda chamada
 * já sincroniza `TripSession.status = "completed"` (Adendo 1 do ADR-006,
 * `persistence.ts`) — nenhuma escrita adicional necessária aqui. Nunca
 * confia cegamente no payload recebido do cliente — cada item é revalidado
 * antes de persistir (Diretriz de Implementação 9).
 */
export async function aprovarRoteiro(input: {
  sessionId: string;
  dias: RoteiroDayResult[];
}): Promise<AprovarRoteiroResult> {
  const items = flattenAndValidateDias(input.dias);

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "aprovar",
    childData: {
      stage: "roteiro",
      items,
    },
  });

  await applySessionFlowTransition({
    sessionId: input.sessionId,
    action: "avancar",
  });

  return {
    proximaEtapa: "encerramento",
    sessionId: input.sessionId,
    flowState: "concluida",
    totalItens: items.length,
  };
}
