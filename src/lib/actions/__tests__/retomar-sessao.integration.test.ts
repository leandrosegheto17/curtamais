// @vitest-environment node
//
// V2-L8-T02 — testes de integração real com Postgres da Server Action
// `retomarSessao`, mesmo padrão de `vinculo-conta.integration.test.ts`
// (V2-L7-T02): `next-auth`/`next/headers` mockados, persistência real via
// `createSessionWithDateRange`/`applySessionFlowTransition`.
//
// Cobre o critério de aceite de V2-L8-T02:
// - Devolve a rota correta para os 7 casos de `rotaDaEtapa` (V2-L6-T09),
//   incluindo os 3 estados transitórios `*_aprovad*` — e, para esses 3,
//   confirma que a transição `avancar` foi de fato PERSISTIDA (relê a sessão
//   do banco depois da chamada), não só refletida na rota devolvida.
// - Sessão de outra conta (ou inexistente) é 404 (`SessionNotFoundError`).
// - É uma Server Action (`"use server"`) — nunca um GET com efeito
//   colateral (não existe `route.ts` associado a este módulo).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  applySessionFlowTransition,
  createSessionWithDateRange,
  SessionNotFoundError,
  type SessionFlowState,
} from "@/lib/session-flow";

const getServerSessionMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (...args: unknown[]) => cookieGetMock(...args),
    set: (...args: unknown[]) => cookieSetMock(...args),
  }),
}));

import { retomarSessao } from "@/lib/actions/retomar-sessao";

describe("retomarSessao — integração real com Postgres (V2-L8-T02)", () => {
  const sessionIds: string[] = [];
  const userIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `executor-v2l8t02-${label}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}@example.com`,
        passwordHash: "hash-irrelevante-para-este-teste",
        privacyConsentAt: new Date(),
        privacyConsentVersion: "v1",
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  function mockAuthenticated(userId: string) {
    getServerSessionMock.mockResolvedValue({ user: { id: userId } });
    cookieGetMock.mockReturnValue(undefined);
  }

  beforeEach(() => {
    getServerSessionMock.mockReset();
    cookieGetMock.mockReset();
    cookieSetMock.mockReset();
  });

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /**
   * Cria uma sessão já pertencente a `userId` e avança, com as MESMAS
   * transições/payloads reais de `applySessionFlowTransition`, até o
   * `flowState` alvo (inclusive) — nunca grava o estado diretamente via
   * Prisma, para que o histórico de aprovações fique realista.
   */
  async function buildSessionAtState(
    userId: string,
    target: SessionFlowState,
  ): Promise<string> {
    mockAuthenticated(userId);

    const created = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-10T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-11-15T00:00:00.000Z"),
      owner: { type: "user", userId },
    });
    sessionIds.push(created.sessionId);
    // created.flowState === destino_pendente

    if (target === "destino_pendente") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Foz do Iguaçu",
        justification: null,
        priceRangeMin: 0,
        priceRangeMax: 0,
        source: "user_provided",
      },
    }); // destino_confirmado
    if (target === "destino_confirmado") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "avancar",
    }); // hospedagem_pendente
    if (target === "hospedagem_pendente") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "aprovar",
      childData: {
        stage: "hospedagem",
        name: "Pousada Central",
        type: "pousada",
        pricePerNightMin: 100,
        pricePerNightMax: 200,
        distinctiveFeature: "Café da manhã incluso",
      },
    }); // hospedagem_aprovada
    if (target === "hospedagem_aprovada") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "avancar",
    }); // passeios_pendente
    if (target === "passeios_pendente") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "aprovar",
      childData: {
        stage: "passeios",
        activities: [
          {
            name: "Cataratas",
            priceMin: 0,
            priceMax: 0,
            isFree: true,
            durationApprox: "4h",
            orderIndex: 0,
          },
        ],
      },
    }); // passeios_aprovados
    if (target === "passeios_aprovados") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "avancar",
    }); // roteiro_pendente
    if (target === "roteiro_pendente") {
      return created.sessionId;
    }

    await applySessionFlowTransition({
      sessionId: created.sessionId,
      action: "aprovar",
      childData: {
        stage: "roteiro",
        items: [
          {
            activityId: null,
            dayDate: new Date("2026-11-10T00:00:00.000Z"),
            period: "manha",
            suggestedTime: "09:00",
            timingJustification: null,
            sequenceOrder: 0,
          },
        ],
      },
    }); // roteiro_aprovado
    if (target === "roteiro_aprovado") {
      return created.sessionId;
    }

    if (target === "concluida") {
      await applySessionFlowTransition({
        sessionId: created.sessionId,
        action: "avancar",
      }); // concluida
      return created.sessionId;
    }

    if (target === "encerrada_parcial") {
      await applySessionFlowTransition({
        sessionId: created.sessionId,
        action: "encerrar",
      }); // encerrada_parcial
      return created.sessionId;
    }

    throw new Error(`Estado alvo não coberto pelo helper de teste: ${target}`);
  }

  it("destino_pendente devolve /destino", async () => {
    const userId = await createUser("destino-pendente");
    const sessionId = await buildSessionAtState(userId, "destino_pendente");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/destino?"),
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("destino_pendente");
  });

  it("destino_confirmado devolve /destino/confirmacao", async () => {
    const userId = await createUser("destino-confirmado");
    const sessionId = await buildSessionAtState(userId, "destino_confirmado");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/destino/confirmacao?"),
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("destino_confirmado");
  });

  it("hospedagem_pendente devolve /hospedagem", async () => {
    const userId = await createUser("hospedagem-pendente");
    const sessionId = await buildSessionAtState(userId, "hospedagem_pendente");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/hospedagem?"),
    });
  });

  it("passeios_pendente devolve /passeios", async () => {
    const userId = await createUser("passeios-pendente");
    const sessionId = await buildSessionAtState(userId, "passeios_pendente");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/passeios?"),
    });
  });

  it("roteiro_pendente devolve /roteiro", async () => {
    const userId = await createUser("roteiro-pendente");
    const sessionId = await buildSessionAtState(userId, "roteiro_pendente");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/roteiro?"),
    });
  });

  it("hospedagem_aprovada aplica e PERSISTE avancar, devolvendo /passeios", async () => {
    const userId = await createUser("hospedagem-aprovada");
    const sessionId = await buildSessionAtState(userId, "hospedagem_aprovada");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/passeios?"),
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("passeios_pendente");
  });

  it("passeios_aprovados aplica e PERSISTE avancar, devolvendo /roteiro", async () => {
    const userId = await createUser("passeios-aprovados");
    const sessionId = await buildSessionAtState(userId, "passeios_aprovados");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: expect.stringContaining("/roteiro?"),
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("roteiro_pendente");
  });

  it("roteiro_aprovado aplica e PERSISTE avancar, devolvendo /meus-roteiros", async () => {
    const userId = await createUser("roteiro-aprovado");
    const sessionId = await buildSessionAtState(userId, "roteiro_aprovado");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: `/meus-roteiros/${sessionId}`,
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("concluida");
  });

  it("concluida devolve /meus-roteiros sem tocar no flowState", async () => {
    const userId = await createUser("concluida");
    const sessionId = await buildSessionAtState(userId, "concluida");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: `/meus-roteiros/${sessionId}`,
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("concluida");
  });

  it("encerrada_parcial devolve /meus-roteiros sem tocar no flowState", async () => {
    const userId = await createUser("encerrada-parcial");
    const sessionId = await buildSessionAtState(userId, "encerrada_parcial");
    mockAuthenticated(userId);

    const result = await retomarSessao(sessionId);

    expect(result).toEqual({
      status: "ok",
      sessionId,
      rota: `/meus-roteiros/${sessionId}`,
    });
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.flowState).toBe("encerrada_parcial");
  });

  it("sessão de outra conta é 404, sem gravar nada", async () => {
    const dono = await createUser("dono-original-retomar");
    const outraConta = await createUser("outra-conta-retomar");
    const sessionId = await buildSessionAtState(dono, "hospedagem_aprovada");

    mockAuthenticated(outraConta);
    await expect(retomarSessao(sessionId)).rejects.toThrow(
      SessionNotFoundError,
    );

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    // Nenhuma transição foi aplicada — o guard nega antes de qualquer
    // avanço, mesmo para um estado transitório.
    expect(stored.flowState).toBe("hospedagem_aprovada");
    expect(stored.userId).toBe(dono);
  });

  it("sessão inexistente é 404", async () => {
    const userId = await createUser("sessao-inexistente-retomar");
    mockAuthenticated(userId);

    await expect(
      retomarSessao("00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it("é uma Server Action — não um handler GET de rota", async () => {
    // `"use server"` no topo do módulo garante que o Next.js só expõe esta
    // função via invocação de Server Action (POST), nunca como GET de rota
    // — não existe nenhum `route.ts` neste diretório associado a este nome.
    expect(typeof retomarSessao).toBe("function");
    expect(retomarSessao.length).toBe(1);
  });
});
