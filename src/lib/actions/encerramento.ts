"use server";

// L12-T04 — Server Action de leitura da tela T-END (Encerramento/Resumo,
// UX-SPEC.md Seção 2 "T-END — Encerramento", RN-03), fechando o GAP CONHECIDO
// registrado no cabeçalho de `@/components/encerramento/encerramento-screen.tsx`
// (L10-T04): monta `EncerramentoResumo` a partir dos registros já persistidos
// (`DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/
// `TripSession.flowState`), sem tocar em `ItineraryItem` diretamente — o
// roteiro em si não é listado item a item nesta tela (UX-SPEC.md T-END: "lista
// o que foi aprovado até aquele ponto ... roteiro completo", um resumo
// booleano de "roteiro aprovado", não o detalhamento por dia), então
// `roteiroAprovado` é derivado de `TripSession.flowState` (mesmo vocabulário
// de `SessionFlowState`, `@/lib/session-flow/state-machine.ts` — `concluida`
// é o único estado alcançável depois de `aprovarRoteiro`, RF-09).
//
// Mesmo padrão exato de leitura + guard de autorização já usado por
// `gerarRoteiro` (`./roteiro.ts`, L10-T03/L11-T02): busca `TripSession`
// diretamente (fora do módulo `session-flow`), lança `SessionNotFoundError`
// se não encontrar, e chama `assertSessionOwnership` explicitamente logo em
// seguida — resultando em 404 (nunca 403) tanto para sessão inexistente
// quanto para identidade que não é dona da sessão (L11-T02, "sempre 404,
// nunca 403").
//
// Convenção "linha ausente = etapa não aprovada, nunca um erro" (mesmo
// princípio já usado no schema Prisma e em `EncerramentoResumo`, L10-T04):
// `DestinationApproval`/`AccommodationApproval` ausentes viram `null`, nunca
// lançam erro; `ActivityApproval` sem nenhuma linha vira `passeios: null`
// (não `[]`) por consistência com os demais campos — o array só é retornado
// de fato preenchido quando há ao menos 1 `ActivityApproval`.
import { prisma } from "@/lib/prisma";
import {
  assertSessionOwnership,
  SessionNotFoundError,
} from "@/lib/session-flow";
import type { EncerramentoResumo } from "@/components/encerramento/encerramento-screen";

export type { EncerramentoResumo };
export type { EncerramentoPasseioResumo } from "@/components/encerramento/encerramento-screen";

/**
 * RN-03/UX-SPEC.md T-END — monta o resumo de aprovações da sessão para a tela
 * de encerramento (completo ou parcial). Nunca lança erro por etapa
 * ausente/não aprovada — só por sessão inexistente ou identidade não
 * autorizada (via `assertSessionOwnership`, sempre 404).
 */
export async function obterResumoEncerramento(
  sessionId: string,
): Promise<EncerramentoResumo> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: { flowState: true, userId: true, anonSessionId: true },
  });

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // L11-T02/ADR-008 — leitura direta de `TripSession` fora do módulo
  // `session-flow`: guard central chamado explicitamente aqui, mesmo padrão
  // de `gerarRoteiro` (`./roteiro.ts`).
  await assertSessionOwnership(sessionId, session);

  const [destination, accommodation, activities] = await Promise.all([
    prisma.destinationApproval.findUnique({
      where: { sessionId },
      select: { name: true },
    }),
    prisma.accommodationApproval.findUnique({
      where: { sessionId },
      select: { name: true, type: true },
    }),
    prisma.activityApproval.findMany({
      where: { sessionId },
      orderBy: { orderIndex: "asc" },
      select: { name: true, isFree: true },
    }),
  ]);

  return {
    destino: destination ? { name: destination.name } : null,
    hospedagem: accommodation
      ? { name: accommodation.name, type: accommodation.type }
      : null,
    passeios:
      activities.length > 0
        ? activities.map((activity) => ({
            name: activity.name,
            free: activity.isFree,
          }))
        : null,
    roteiroAprovado: session.flowState === "concluida",
  };
}
