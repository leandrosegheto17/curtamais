// @vitest-environment node
//
// L6-T03 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/session-flow/__tests__/persistence.integration.test.ts`, L4-T02):
// prova que `submeterDataLivre` de fato cria a `TripSession`, avança o
// `flowState` via `@/lib/session-flow` e persiste `DestinationApproval`
// quando um destino é informado, cobrindo o critério de aceite de L6-T03
// (RF-01.2/.3).
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { submeterDataLivre } from "@/lib/actions/data-livre";
import { InvalidDataLivreInputError } from "@/lib/actions/data-livre-errors";

describe("submeterDataLivre — integração real com Postgres (L6-T03)", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("sem destino: cria a sessão e avança para destino_pendente (RF-01.2)", async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-11-10",
      dataFinal: "2026-11-15",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("destino");
    expect(result.flowState).toBe("destino_pendente");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.entryPath).toBe("data_livre");
    expect(stored.flowState).toBe("destino_pendente");
    expect(stored.status).toBe("in_progress");
    expect(stored.dateRangeStart?.toISOString().slice(0, 10)).toBe(
      "2026-11-10",
    );
    expect(stored.dateRangeEnd.toISOString().slice(0, 10)).toBe("2026-11-15");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();
  });

  it('destino em branco (só espaços) é tratado como "sem destino" (RF-01.2)', async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-11-10",
      dataFinal: "2026-11-15",
      destino: "   ",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("destino");
  });

  it("com destino: aprova direto (source=user_provided) e avança para destino_confirmado (RF-01.3/RF-11)", async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-12-01",
      dataFinal: "2026-12-10",
      destino: "  Foz do Iguaçu  ",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("confirmacao_destino");
    expect(result.flowState).toBe("destino_confirmado");
    if (result.proximaEtapa === "confirmacao_destino") {
      // Trim aplicado no servidor (RF-01.3 revalidada, não confia só no client).
      expect(result.destino).toBe("Foz do Iguaçu");
    }

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.flowState).toBe("destino_confirmado");

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });
    expect(destination.name).toBe("Foz do Iguaçu");
    expect(destination.source).toBe("user_provided");
    expect(destination.justification).toBeNull();
    expect(destination.priceRangeMin.toNumber()).toBe(0);
    expect(destination.priceRangeMax.toNumber()).toBe(0);
  });

  it("RF-01.4 revalidado no servidor: data final < data inicial rejeita sem criar sessão", async () => {
    const countBefore = await prisma.tripSession.count();

    await expect(
      submeterDataLivre({
        dataInicial: "2026-12-10",
        dataFinal: "2026-12-01",
      }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    const countAfter = await prisma.tripSession.count();
    expect(countAfter).toBe(countBefore);
  });

  it("rejeita datas ausentes/malformadas sem criar sessão", async () => {
    const countBefore = await prisma.tripSession.count();

    await expect(
      submeterDataLivre({ dataInicial: "", dataFinal: "2026-12-01" }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    await expect(
      submeterDataLivre({
        dataInicial: "10/12/2026",
        dataFinal: "2026-12-15",
      }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    const countAfter = await prisma.tripSession.count();
    expect(countAfter).toBe(countBefore);
  });

  it("destino além do limite de tamanho é truncado antes de persistir", async () => {
    const longDestino = "a".repeat(500);

    const result = await submeterDataLivre({
      dataInicial: "2027-01-05",
      dataFinal: "2027-01-10",
      destino: longDestino,
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("confirmacao_destino");
    if (result.proximaEtapa === "confirmacao_destino") {
      expect(result.destino).toHaveLength(200);
    }

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });
    expect(destination.name).toHaveLength(200);
  });
});
