// L11-T01 — Exclusão de conta e dados associados (LGPD, RNF-06, SDD.md §7,
// GUARDRAILS.md regra 20).
//
// Único ponto autorizado a apagar `User` + `TripSession`(s) associadas por
// exclusão de conta. Escopo (SDD.md §7, PRD-TECNICO.md RNF-06): "exclusão de
// conta" no sentido LGPD só se aplica a quem TEM conta de verdade (linha em
// `User`, autenticável via NextAuth) — sessão anônima via cookie
// (`src/lib/anonymous-session.ts`) não tem "conta" para excluir nesse
// sentido; ela nunca grava dado pessoal (nome/e-mail) associável a um
// titular identificável, então não há o que o RNF-06 exija apagar além da
// própria `TripSession`, que expira por conta própria. Esta é uma decisão de
// detalhe de implementação (não uma reinterpretação de requisito ambíguo):
// SDD.md §7 fala explicitamente em "exclusão de conta e dados associados" e
// GUARDRAILS.md regra 20 fala em "remove `TripSession` e entidades filhas
// associadas ao `user_id`" — ambos pressupõem `user_id` existente. Se no
// futuro o produto quiser oferecer "apagar meus dados" também para sessão
// anônima (sem conta), isso é uma funcionalidade nova, fora do escopo desta
// tarefa.
//
// Cascade delete (prisma/schema.prisma):
// - `Account`/`Session` (tabelas do NextAuth) já têm `onDelete: Cascade`
//   referenciando `User` — apagar o `User` cascateia as duas automaticamente
//   via FK do banco (confirmado em SECURITY-REVIEW.md, achado do Lote 1: "
//   infraestrutura pronta para quando L11-T01 implementar o endpoint").
// - `TripSession.userId` NÃO tem FK formal para `User` (comentário explícito
//   no schema: "fora do escopo de L1-T03") — por isso as `TripSession`s do
//   usuário são apagadas EXPLICITAMENTE aqui, filtradas por `userId`.
// - Todas as entidades filhas de `TripSession` (`DestinationApproval`,
//   `AccommodationApproval`, `ActivityApproval`, `ItineraryItem`,
//   `LlmGenerationLog`) têm `onDelete: Cascade` referenciando `TripSession`
//   — apagar a `TripSession` cascateia todas elas automaticamente via FK do
//   banco; nenhum `deleteMany` explícito extra é necessário para elas.
//
// Tudo dentro de UMA transação Prisma (atomicidade — GUARDRAILS.md regra 20:
// "nenhum dado pessoal remanescente após exclusão solicitada pelo usuário").
import { prisma } from "@/lib/prisma";

export class UserNotFoundError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super(`Usuário não encontrado: "${userId}".`);
    this.name = "UserNotFoundError";
    this.userId = userId;
  }
}

export interface DeleteUserAccountResult {
  userId: string;
  /** Quantidade de `TripSession`s apagadas (e, por cascade de FK, de todas as entidades filhas). */
  deletedTripSessionCount: number;
}

/**
 * Apaga a conta (`User`) e todos os dados associados do `userId` informado:
 * todas as `TripSession`s do usuário (+ entidades filhas via cascade de FK)
 * e `Account`/`Session` do NextAuth (via cascade de FK).
 *
 * SEGURANÇA (SDD §7, GUARDRAILS.md regra 9/16): esta função NUNCA deve ser
 * chamada com um `userId` vindo direto de payload de cliente — o CHAMADOR é
 * responsável por resolver `userId` a partir da sessão autenticada real do
 * NextAuth (`getServerSession`). Esta função em si não faz autorização
 * adicional além de exigir que o `User` exista.
 */
export async function deleteUserAccount(
  userId: string,
): Promise<DeleteUserAccountResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    // Apaga todas as TripSession do usuário — cascade de FK do banco apaga
    // DestinationApproval/AccommodationApproval/ActivityApproval/
    // ItineraryItem/LlmGenerationLog associados junto, sem precisar de
    // deleteMany explícito para cada uma.
    const { count: deletedTripSessionCount } = await tx.tripSession.deleteMany(
      { where: { userId } },
    );

    // Apaga o User — cascade de FK do banco apaga Account/Session (NextAuth)
    // associados junto.
    await tx.user.delete({ where: { id: userId } });

    return { userId, deletedTripSessionCount };
  });
}
