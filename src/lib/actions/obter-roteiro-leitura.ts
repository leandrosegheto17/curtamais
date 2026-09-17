"use server";

// V2-L8-T03 — Server Action de leitura do roteiro salvo para T-MEUS-DET
// (`/meus-roteiros/[sessionId]`, SDD.md §8.2.7/RF-17.5): lê `ItineraryItem`
// diretamente do banco, junto com o `ActivityApproval` relacionado quando
// houver, e monta o MESMO shape que a UI de T08 já consome
// (`RoteiroDayResult[]`, `@/lib/stage-rules`, reaproveitado via
// `@/lib/actions/roteiro`) — a tela T-MEUS-DET renderiza `ItineraryDayBlock`
// em modo `readOnly` sem remapear nada, mesma convenção já usada por
// `gerarRoteiro` para a UI de T08 (`./roteiro.ts`, L10-T03).
//
// DIFERENÇA CHAVE em relação a `gerarRoteiro`: esta função é LEITURA PURA do
// que já foi persistido — NUNCA chama `@/lib/gateway-ia`/`@/lib/stage-rules`
// (que internamente chamam o Gateway de IA/LLM). Nenhum import deste arquivo
// aponta para esses módulos — só o TIPO `RoteiroDayResult`/`RoteiroItemResult`
// é reaproveitado de `@/lib/stage-rules` (apagado na compilação, `import
// type`), sem nenhum valor/função de lá sendo chamado.
//
// Mesmo padrão de guard de autorização já usado por `gerarRoteiro`/
// `aprovarRoteiro` (`./roteiro.ts`, V2-L6-T07/ADR-009 item 2): busca
// `TripSession` diretamente (fora do módulo `session-flow`), lança
// `SessionNotFoundError` se não encontrar, e chama `assertSessionAccess`
// com `exigeConta: true` (RF-17.5: "`/meus-roteiros/[sessionId]` exige conta
// dona") — qualquer divergência de posse vira `SessionNotFoundError` (404
// lógico), nunca 403 (ADR-008 item 4/ADR-009 item 2). Como as sessões
// listadas em "meus roteiros" só existem porque já foram vinculadas a uma
// conta (`V2-L8-T01`/`listarMeusRoteiros`, filtra por `userId`), o caminho
// `ContaNecessariaError` não é esperado na prática aqui — mas é capturado e
// convertido no MESMO resultado discriminado que `gerarRoteiro`/
// `aprovarRoteiro` já usam (`ContaNecessariaResult`, reaproveitado de
// `./roteiro.ts`), em vez de deixá-lo vazar como exceção não tratada (mesmo
// contrato de `@/lib/session-flow/authorization.ts`: nunca deixar
// `ContaNecessariaError` escapar de uma Server Action sem conversão).
//
// GAP DE SCHEMA CONHECIDO (mesmo já sinalizado no cabeçalho de `./roteiro.ts`,
// "GAP DE SCHEMA CONHECIDO... nenhuma coluna de texto livre para o nome da
// atividade em si"): `ItineraryItem.activityId` é `null` no caso comum (todo
// item de roteiro gerado sem passeio aprovado de origem, RN-04), então não há
// como recuperar o texto original de `RoteiroItemResult.activity` a partir só
// do banco quando `activityId` é nulo — a informação nunca sobreviveu ao
// reload, exatamente o cenário "Fase 2" que aquele comentário já previa como
// não bloqueado na época. Esta tarefa é a primeira a de fato precisar ler
// `ItineraryItem` de volta, então o gap deixa de ser hipotético: valor
// razoável definido aqui (Guardrails do Executor, "lacuna estrutural real ->
// definir valor razoável e documentar") é usar
// `ITEM_SEM_ACTIVITY_APPROVAL_LABEL` como texto de exibição quando não há
// `ActivityApproval` vinculado, e o nome real (`ActivityApproval.name`)
// quando há. Sinalizado aqui novamente para o Coordenador: uma coluna própria
// de nome/descrição em `ItineraryItem` (migration futura) eliminaria esta
// heurística.
import { prisma } from "@/lib/prisma";
import {
  assertSessionAccess,
  ContaNecessariaError,
  SessionNotFoundError,
} from "@/lib/session-flow";
import type { RoteiroDayResult, RoteiroItemResult } from "@/lib/stage-rules";
import type { ContaNecessariaResult } from "./roteiro";

export type { RoteiroDayResult, RoteiroItemResult };
export type { ContaNecessariaResult } from "./roteiro";

export type ObterRoteiroLeituraResult =
  | RoteiroDayResult[]
  | ContaNecessariaResult;

/** Ver "GAP DE SCHEMA CONHECIDO" no cabeçalho do arquivo. */
const ITEM_SEM_ACTIVITY_APPROVAL_LABEL = "Atividade do roteiro";

/** Inverso de `PERIOD_BY_BLOCK_KEY` (`./roteiro.ts`) — do enum `ItineraryPeriod` persistido de volta para a chave de bloco de `RoteiroDayResult`. */
const BLOCK_KEY_BY_PERIOD = {
  manha: "morning",
  tarde: "afternoon",
  noite: "evening",
} as const satisfies Record<
  "manha" | "tarde" | "noite",
  keyof Pick<RoteiroDayResult, "morning" | "afternoon" | "evening">
>;

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * RF-17.5 — lê o roteiro já salvo de uma sessão (`ItineraryItem`, ordenado
 * por `dayDate`/`period`/`sequenceOrder`, SDD.md §8.2.7), sem nenhuma
 * chamada ao Gateway de IA. Agrupa por dia no MESMO shape que `gerarRoteiro`
 * já devolve para a UI de T08 (`RoteiroDayResult[]`) — a diferença é que
 * aqui os dias que não têm NENHUM `ItineraryItem` persistido (nenhum item em
 * nenhum dos 3 blocos) simplesmente não aparecem no resultado, já que não há
 * nenhuma linha no banco para reconstruí-los (diferente de `gerarRoteiro`,
 * que sempre preenche todo o range com `generateRoteiro`/`normalizeRoteiroDays`
 * em memória) — comportamento aceitável aqui porque um dia inteiramente vazio
 * não tem nada para exibir em modo leitura de qualquer forma.
 */
export async function obterRoteiroLeitura(
  sessionId: string,
): Promise<ObterRoteiroLeituraResult> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, anonSessionId: true },
  });

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  try {
    await assertSessionAccess(sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return { status: "conta_necessaria", sessionId };
    }
    throw error;
  }

  const itens = await prisma.itineraryItem.findMany({
    where: { sessionId },
    orderBy: [
      { dayDate: "asc" },
      { period: "asc" },
      { sequenceOrder: "asc" },
    ],
    select: {
      dayDate: true,
      period: true,
      suggestedTime: true,
      timingJustification: true,
      sequenceOrder: true,
      activity: { select: { name: true } },
    },
  });

  const diasPorData = new Map<string, RoteiroDayResult>();

  for (const item of itens) {
    const date = toIsoDateString(item.dayDate);
    let dia = diasPorData.get(date);
    if (!dia) {
      dia = { date, morning: [], afternoon: [], evening: [] };
      diasPorData.set(date, dia);
    }

    const roteiroItem: RoteiroItemResult = {
      activity: item.activity?.name ?? ITEM_SEM_ACTIVITY_APPROVAL_LABEL,
      suggestedTime: item.suggestedTime,
      timingJustification: item.timingJustification,
      sequenceOrder: item.sequenceOrder,
    };

    dia[BLOCK_KEY_BY_PERIOD[item.period]].push(roteiroItem);
  }

  // `Map` preserva a ordem de inserção, que já é cronológica graças ao
  // `orderBy: { dayDate: "asc" }` acima — sem necessidade de reordenar.
  return Array.from(diasPorData.values());
}
