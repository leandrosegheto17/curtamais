"use server";

// V2-L8-T01 — "Meus roteiros" (RF-17): listagem das sessões do usuário
// autenticado, definida em `SDD.md` §8.2.7 e `UX-SPEC.md` §8 (T-MEUS). O
// rótulo por sessão (RF-17.3) é calculado por `rotuloDaSessao`
// (`./meus-roteiros-label.ts`, função pura, sem `"use server"` — ver
// cabeçalho daquele arquivo para o motivo da separação).
//
// RF-17.8 — o `userId` usado na query vem EXCLUSIVAMENTE de
// `resolveRequestIdentity()` (`@/lib/actions/resolve-request-identity`,
// V2-L6-T02), que por sua vez só lê `getServerSession(authOptions)` — a
// assinatura de `listarMeusRoteiros` não tem nenhum parâmetro, então não há
// como um chamador pedir a lista de outro usuário. Sem sessão de conta
// válida, a função devolve `{ status: "nao_autenticado" }` sem tocar no
// banco — nenhum dado de nenhum usuário vaza.
//
// A query usa `where: { userId }` + `orderBy: { updatedAt: "desc" }`, a
// mesma composição do índice `@@index([userId, updatedAt])`
// (`prisma/schema.prisma`, V2-L1-T01) — Postgres/Prisma usam o índice
// automaticamente para esse par where+orderBy, sem necessidade de hint
// explícito.

import { prisma } from "@/lib/prisma";
import { resolveRequestIdentity } from "@/lib/actions/resolve-request-identity";
import { rotuloDaSessao } from "@/lib/actions/meus-roteiros-label";
import type { SessionFlowState } from "@prisma/client";

/** Uma linha da lista "Meus roteiros" (T-MEUS), já com o rótulo calculado. */
export interface MeuRoteiroItem {
  id: string;
  flowState: SessionFlowState;
  dateRangeStart: Date | null;
  dateRangeEnd: Date;
  updatedAt: Date;
  destinationName: string | null;
  rotulo: string;
}

export type ListarMeusRoteirosResult =
  | { status: "nao_autenticado" }
  | { status: "ok"; sessoes: MeuRoteiroItem[] };

/**
 * Lista as sessões do usuário autenticado (RF-17), ordenadas por
 * `updatedAt` desc (mais recente primeiro — RF-17.2). O `userId` vem só da
 * sessão do servidor (RF-17.8): esta função não recebe nenhum parâmetro, e
 * nunca poderia consultar dados de outra conta.
 */
export async function listarMeusRoteiros(): Promise<ListarMeusRoteirosResult> {
  const { userId } = await resolveRequestIdentity();

  if (!userId) {
    return { status: "nao_autenticado" };
  }

  const sessoes = await prisma.tripSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      updatedAt: true,
      destinationApproval: { select: { name: true } },
      accommodationApproval: { select: { id: true } },
      _count: { select: { activityApprovals: true } },
    },
  });

  return {
    status: "ok",
    sessoes: sessoes.map((session) => ({
      id: session.id,
      flowState: session.flowState,
      dateRangeStart: session.dateRangeStart,
      dateRangeEnd: session.dateRangeEnd,
      updatedAt: session.updatedAt,
      destinationName: session.destinationApproval?.name ?? null,
      rotulo: rotuloDaSessao({
        flowState: session.flowState,
        hasActivityApproval: session._count.activityApprovals > 0,
        hasAccommodationApproval: session.accommodationApproval !== null,
      }),
    })),
  };
}
