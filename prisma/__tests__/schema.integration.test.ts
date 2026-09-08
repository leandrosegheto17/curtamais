// @vitest-environment node
//
// Teste de integração leve: grava/lê um registro mínimo de cada entidade do
// SDD.md Seção 5 contra um banco Postgres real, provando que a migration
// funciona de ponta a ponta e que os campos opcionais são realmente
// nullable (critério de aceite de L1-T02).
//
// Requer DATABASE_URL apontando para um Postgres com a migration aplicada
// (`prisma migrate deploy`/`prisma migrate dev`). Em CI, um serviço Postgres
// dedicado é usado (ver .github/workflows/ci.yml).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Prisma schema — integração real com Postgres (SDD.md Seção 5)", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    // Cascade delete cobre as entidades filhas (onDelete: Cascade).
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("cria uma TripSession com campos opcionais omitidos (nullable de fato)", async () => {
    const session = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-20"),
        // userId, dateRangeStart, budgetAmount, budgetCurrency deliberadamente omitidos.
      },
    });
    sessionIds.push(session.id);

    expect(session.userId).toBeNull();
    expect(session.dateRangeStart).toBeNull();
    expect(session.budgetAmount).toBeNull();
    expect(session.budgetCurrency).toBeNull();
    expect(session.status).toBe("in_progress");
  });

  it("grava e lê o grafo completo (destino, hospedagem, passeio+roteiro, log de LLM)", async () => {
    const session = await prisma.tripSession.create({
      data: {
        userId: "11111111-1111-1111-1111-111111111111",
        entryPath: "quiz",
        dateRangeStart: new Date("2026-11-01"),
        dateRangeEnd: new Date("2026-11-05"),
        budgetAmount: "2500.00",
        budgetCurrency: "BRL",
        status: "in_progress",
      },
    });
    sessionIds.push(session.id);

    const destination = await prisma.destinationApproval.create({
      data: {
        sessionId: session.id,
        name: "Ouro Preto",
        justification: null, // nullable quando source=user_provided
        priceRangeMin: "800.00",
        priceRangeMax: "1200.00",
        source: "user_provided",
        approvedAt: new Date(),
      },
    });
    expect(destination.justification).toBeNull();

    const accommodation = await prisma.accommodationApproval.create({
      data: {
        sessionId: session.id,
        name: "Pousada Central",
        type: "pousada",
        pricePerNightMin: "150.00",
        pricePerNightMax: "250.00",
        distinctiveFeature: "vista para a igreja matriz",
        approvedAt: new Date(),
      },
    });

    const activity = await prisma.activityApproval.create({
      data: {
        sessionId: session.id,
        name: "Trilha na Serra",
        priceMin: "0.00",
        priceMax: "0.00",
        isFree: true,
        durationApprox: "3 horas",
        orderIndex: 0,
        approvedAt: new Date(),
      },
    });

    const itineraryItem = await prisma.itineraryItem.create({
      data: {
        sessionId: session.id,
        activityId: activity.id,
        dayDate: new Date("2026-11-02"),
        period: "manha",
        suggestedTime: "08:00",
        timingJustification: null, // nullable (SDD §5, literal)
        sequenceOrder: 0,
      },
    });
    expect(itineraryItem.timingJustification).toBeNull();

    const log = await prisma.llmGenerationLog.create({
      data: {
        sessionId: session.id,
        stage: "destino",
        provider: "openai",
        promptVersion: "v1",
        tokensInput: 120,
        tokensOutput: 340,
        costEstimateUsd: "0.000450",
        latencyMs: 1800,
        retryCount: 0,
        status: "success",
      },
    });

    const fullSession = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        destinationApproval: true,
        accommodationApproval: true,
        activityApprovals: { include: { itineraryItem: true } },
        itineraryItems: true,
        llmGenerationLogs: true,
      },
    });

    expect(fullSession.destinationApproval?.id).toBe(destination.id);
    expect(fullSession.accommodationApproval?.id).toBe(accommodation.id);
    expect(fullSession.activityApprovals).toHaveLength(1);
    expect(fullSession.activityApprovals[0].itineraryItem?.id).toBe(
      itineraryItem.id,
    );
    expect(fullSession.itineraryItems).toHaveLength(1);
    expect(fullSession.llmGenerationLogs).toHaveLength(1);
    expect(fullSession.llmGenerationLogs[0].id).toBe(log.id);
  });

  it("cascade delete remove as entidades filhas ao remover a TripSession (sem dado órfão)", async () => {
    const session = await prisma.tripSession.create({
      data: { entryPath: "feriado", dateRangeEnd: new Date("2026-09-20") },
    });

    const destination = await prisma.destinationApproval.create({
      data: {
        sessionId: session.id,
        name: "Paraty",
        priceRangeMin: "500.00",
        priceRangeMax: "900.00",
        source: "ia_suggested",
        justification: "cidade histórica com boa relação custo-benefício",
        approvedAt: new Date(),
      },
    });

    await prisma.tripSession.delete({ where: { id: session.id } });

    const orphan = await prisma.destinationApproval.findUnique({
      where: { id: destination.id },
    });
    expect(orphan).toBeNull();
  });

  it("enforça 1:1 opcional entre TripSession e DestinationApproval (session_id único)", async () => {
    const session = await prisma.tripSession.create({
      data: { entryPath: "data_livre", dateRangeEnd: new Date("2026-10-10") },
    });
    sessionIds.push(session.id);

    await prisma.destinationApproval.create({
      data: {
        sessionId: session.id,
        name: "Bonito",
        priceRangeMin: "600.00",
        priceRangeMax: "1000.00",
        source: "ia_suggested",
        justification: "ecoturismo",
        approvedAt: new Date(),
      },
    });

    await expect(
      prisma.destinationApproval.create({
        data: {
          sessionId: session.id,
          name: "Segundo destino (deve falhar)",
          priceRangeMin: "1.00",
          priceRangeMax: "2.00",
          source: "ia_suggested",
          justification: "duplicata proposital",
          approvedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
