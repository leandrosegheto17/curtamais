// @vitest-environment node
//
// L11-T01 — Teste de integração real com Postgres (mesmo padrão de
// `user-account.integration.test.ts` / `session-flow/persistence.integration.test.ts`),
// cobrindo o critério de aceite "excluir conta remove todas as sessões e
// entidades filhas associadas; nenhum dado órfão remanescente".
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteUserAccount, UserNotFoundError } from "@/lib/account-deletion";

async function createUserWithFullSession() {
  const user = await prisma.user.create({
    data: { email: `executor-l11t01-${Date.now()}-${Math.random()}@example.com` },
  });

  const session = await prisma.tripSession.create({
    data: {
      userId: user.id,
      entryPath: "data_livre",
      dateRangeEnd: new Date("2026-12-20"),
    },
  });

  await prisma.destinationApproval.create({
    data: {
      sessionId: session.id,
      name: "Foz do Iguaçu",
      priceRangeMin: "800.00",
      priceRangeMax: "1500.00",
      source: "ia_suggested",
      approvedAt: new Date(),
    },
  });

  await prisma.accommodationApproval.create({
    data: {
      sessionId: session.id,
      name: "Pousada Central",
      type: "pousada",
      pricePerNightMin: "150.00",
      pricePerNightMax: "300.00",
      distinctiveFeature: "Café da manhã incluso",
      approvedAt: new Date(),
    },
  });

  const activity = await prisma.activityApproval.create({
    data: {
      sessionId: session.id,
      name: "Cataratas",
      priceMin: "0.00",
      priceMax: "0.00",
      isFree: true,
      durationApprox: "3h",
      orderIndex: 0,
      approvedAt: new Date(),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      sessionId: session.id,
      activityId: activity.id,
      dayDate: new Date("2026-12-20"),
      period: "manha",
      suggestedTime: "09:00",
      sequenceOrder: 0,
    },
  });

  await prisma.llmGenerationLog.create({
    data: {
      sessionId: session.id,
      stage: "destino",
      provider: "openai",
      promptVersion: "v1",
      tokensInput: 100,
      tokensOutput: 200,
      costEstimateUsd: "0.001000",
      latencyMs: 1200,
      retryCount: 0,
      status: "success",
    },
  });

  return { user, session, activityId: activity.id };
}

describe("deleteUserAccount — integração real com Postgres (L11-T01)", () => {
  // Só usado como rede de segurança caso alguma asserção falhe antes da
  // limpeza natural feita pelo próprio `deleteUserAccount` dentro do teste.
  const leftoverUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: leftoverUserIds } } });
    await prisma.$disconnect();
  });

  it("apaga o usuário, todas as TripSessions e todas as entidades filhas (nenhum dado órfão)", async () => {
    const { user, session, activityId } = await createUserWithFullSession();
    leftoverUserIds.push(user.id);

    const result = await deleteUserAccount(user.id);

    expect(result.userId).toBe(user.id);
    expect(result.deletedTripSessionCount).toBe(1);

    // Nenhum dado remanescente — checagem direta por query, não só pelo
    // retorno da função.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(
      await prisma.tripSession.findUnique({ where: { id: session.id } }),
    ).toBeNull();
    expect(
      await prisma.destinationApproval.findUnique({
        where: { sessionId: session.id },
      }),
    ).toBeNull();
    expect(
      await prisma.accommodationApproval.findUnique({
        where: { sessionId: session.id },
      }),
    ).toBeNull();
    expect(
      await prisma.activityApproval.findMany({ where: { sessionId: session.id } }),
    ).toHaveLength(0);
    expect(
      await prisma.itineraryItem.findMany({ where: { sessionId: session.id } }),
    ).toHaveLength(0);
    expect(
      await prisma.llmGenerationLog.findMany({ where: { sessionId: session.id } }),
    ).toHaveLength(0);
    expect(
      await prisma.itineraryItem.findUnique({ where: { activityId } }),
    ).toBeNull();
  });

  it("apaga múltiplas TripSessions do mesmo usuário (todas as sessões, não só a mais recente)", async () => {
    const user = await prisma.user.create({
      data: {
        email: `executor-l11t01-multi-${Date.now()}-${Math.random()}@example.com`,
      },
    });
    leftoverUserIds.push(user.id);

    const sessionA = await prisma.tripSession.create({
      data: { userId: user.id, entryPath: "quiz", dateRangeEnd: new Date("2026-11-01") },
    });
    const sessionB = await prisma.tripSession.create({
      data: { userId: user.id, entryPath: "feriado", dateRangeEnd: new Date("2026-12-01") },
    });

    const result = await deleteUserAccount(user.id);

    expect(result.deletedTripSessionCount).toBe(2);
    expect(
      await prisma.tripSession.findMany({
        where: { id: { in: [sessionA.id, sessionB.id] } },
      }),
    ).toHaveLength(0);
  });

  it("rejeita userId inexistente (UserNotFoundError), sem tocar o banco", async () => {
    await expect(
      deleteUserAccount("usuario-inexistente-l11t01"),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("não apaga TripSession de outro usuário (isolamento por userId)", async () => {
    const { user: userToDelete } = await createUserWithFullSession();
    leftoverUserIds.push(userToDelete.id);

    const otherUser = await prisma.user.create({
      data: {
        email: `executor-l11t01-other-${Date.now()}-${Math.random()}@example.com`,
      },
    });
    leftoverUserIds.push(otherUser.id);
    const otherSession = await prisma.tripSession.create({
      data: {
        userId: otherUser.id,
        entryPath: "data_livre",
        dateRangeEnd: new Date("2027-01-10"),
      },
    });

    await deleteUserAccount(userToDelete.id);

    // A sessão do outro usuário permanece intacta.
    expect(
      await prisma.tripSession.findUnique({ where: { id: otherSession.id } }),
    ).not.toBeNull();

    // Limpeza explícita (fora do escopo de `deleteUserAccount`, que não deve
    // tocar este usuário).
    await prisma.tripSession.delete({ where: { id: otherSession.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});
