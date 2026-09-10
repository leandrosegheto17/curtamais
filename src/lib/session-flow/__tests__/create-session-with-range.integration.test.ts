// @vitest-environment node
//
// L6-T03/L6-T05 — Teste de integração real com Postgres (mesmo padrão de
// `./persistence.integration.test.ts`) para o helper compartilhado
// `createSessionWithDateRange`, cobrindo a ramificação de RF-01.2/RF-01.3
// (idêntica para RF-02.3) de forma isolada da Server Action de qualquer
// tela específica.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionWithDateRange } from "@/lib/session-flow";

describe("createSessionWithDateRange — integração real com Postgres", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("sem destino: cria a sessão com o range informado e fica em destino_pendente", async () => {
    const start = new Date("2026-11-05");
    const end = new Date("2026-11-08");

    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: start,
      dateRangeEnd: end,
      owner: { type: "anonymous", anonSessionId: "range-test-anon-1" },
    });
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_pendente");
    expect(result.status).toBe("in_progress");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.entryPath).toBe("data_livre");
    expect(stored.dateRangeStart?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(stored.dateRangeEnd.toISOString().slice(0, 10)).toBe("2026-11-08");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();

    // ADR-008: exatamente um dos dois campos de dono é gravado.
    expect(stored.anonSessionId).toBe("range-test-anon-1");
    expect(stored.userId).toBeNull();
  });

  it("owner do tipo user: grava user_id, nunca anon_session_id (ADR-008)", async () => {
    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-05"),
      dateRangeEnd: new Date("2026-11-08"),
      owner: { type: "user", userId: "range-test-user-1" },
    });
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.userId).toBe("range-test-user-1");
    expect(stored.anonSessionId).toBeNull();
  });

  it("com destino: registra DestinationApproval user_provided e avança para destino_confirmado", async () => {
    const result = await createSessionWithDateRange({
      entryPath: "feriado",
      dateRangeStart: new Date("2026-06-11"),
      dateRangeEnd: new Date("2026-06-14"),
      destino: "  Foz do Iguaçu  ",
      owner: { type: "anonymous", anonSessionId: "range-test-anon-2" },
    });
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_confirmado");

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });
    expect(destination.name).toBe("Foz do Iguaçu");
    expect(destination.source).toBe("user_provided");
    expect(destination.justification).toBeNull();
    expect(destination.priceRangeMin.toString()).toBe("0");
    expect(destination.priceRangeMax.toString()).toBe("0");
  });

  it("destino ausente/vazio/só espaços são todos tratados como 'sem destino'", async () => {
    for (const destino of [undefined, null, "", "   "]) {
      const result = await createSessionWithDateRange({
        entryPath: "quiz",
        dateRangeStart: new Date("2026-08-01"),
        dateRangeEnd: new Date("2026-08-05"),
        destino,
        owner: { type: "anonymous", anonSessionId: "range-test-anon-3" },
      });
      sessionIds.push(result.sessionId);

      expect(result.flowState).toBe("destino_pendente");
    }
  });
});
