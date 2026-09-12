// @vitest-environment node
//
// L12-T04 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/actions/__tests__/roteiro.integration.test.ts`, L10-T03):
// prova que `obterResumoEncerramento` monta `EncerramentoResumo` corretamente
// a partir de registros já persistidos, tanto no caso parcial (só destino
// aprovado) quanto no caso completo (destino + hospedagem + passeios +
// roteiro aprovado), e que uma identidade que não é dona da sessão recebe
// `SessionNotFoundError` (404, nunca 403 — mesmo critério de L11-T02).
//
// Limitação já aceita no projeto (mesma nota de
// `roteiro.integration.test.ts`/`passeios.integration.test.ts`): requer
// Postgres real acessível via `DATABASE_URL` (ex.: `localhost:55432`); sem
// ele, os testes deste arquivo falham por `PrismaClientInitializationError`
// na conexão, não por defeito na lógica.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  applySessionFlowTransition,
  SessionNotFoundError,
} from "@/lib/session-flow";
import { obterResumoEncerramento } from "@/lib/actions/encerramento";

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

const ANON_ID = "24242424-2424-4242-8242-242424242424";
const OTHER_ANON_ID = "35353535-3535-4535-8535-353535353535";

beforeEach(() => {
  getServerSessionMock.mockReset();
  cookieGetMock.mockReset();
  cookieSetMock.mockReset();
  getServerSessionMock.mockResolvedValue(null);
  cookieGetMock.mockReturnValue({ value: ANON_ID });
});

async function createSessionWithDestinoAprovado() {
  const session = await prisma.tripSession.create({
    data: {
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-12-20"),
      dateRangeEnd: new Date("2026-12-21"),
      anonSessionId: ANON_ID,
    },
  });
  await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
  await applySessionFlowTransition({
    sessionId: session.id,
    action: "aprovar",
    childData: {
      stage: "destino",
      name: "Foz do Iguaçu",
      justification: "Clima ameno e dentro do orçamento.",
      priceRangeMin: "800.00",
      priceRangeMax: "1500.00",
      source: "ia_suggested",
    },
  });
  return session;
}

async function createSessionCompleta() {
  const session = await createSessionWithDestinoAprovado();
  await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });
  await applySessionFlowTransition({
    sessionId: session.id,
    action: "aprovar",
    childData: {
      stage: "hospedagem",
      name: "Pousada Vista Mar",
      type: "pousada",
      pricePerNightMin: 150,
      pricePerNightMax: 220,
      distinctiveFeature: "Café da manhã incluso com vista para o mar.",
    },
  });
  await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });
  await applySessionFlowTransition({
    sessionId: session.id,
    action: "aprovar",
    childData: {
      stage: "passeios",
      activities: [
        {
          name: "Trilha das Cataratas",
          priceMin: 80,
          priceMax: 120,
          isFree: false,
          durationApprox: "3 horas",
          orderIndex: 0,
        },
        {
          name: "Mirante gratuito",
          priceMin: 0,
          priceMax: 0,
          isFree: true,
          durationApprox: "1 hora",
          orderIndex: 1,
        },
      ],
    },
  });
  await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });
  await applySessionFlowTransition({
    sessionId: session.id,
    action: "aprovar",
    childData: {
      stage: "roteiro",
      items: [
        {
          activityId: null,
          dayDate: new Date("2026-12-20"),
          period: "manha",
          suggestedTime: "08h",
          timingJustification: null,
          sequenceOrder: 0,
        },
      ],
    },
  });
  await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });
  return session;
}

describe("obterResumoEncerramento — integração real com Postgres (L12-T04)", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("resumo parcial: só destino aprovado -> hospedagem/passeios null, roteiroAprovado false", async () => {
    const session = await createSessionWithDestinoAprovado();
    sessionIds.push(session.id);

    const resumo = await obterResumoEncerramento(session.id);

    expect(resumo.destino).toEqual({ name: "Foz do Iguaçu" });
    expect(resumo.hospedagem).toBeNull();
    expect(resumo.passeios).toBeNull();
    expect(resumo.roteiroAprovado).toBe(false);
  });

  it("resumo completo: destino + hospedagem + passeios + roteiro aprovado", async () => {
    const session = await createSessionCompleta();
    sessionIds.push(session.id);

    const resumo = await obterResumoEncerramento(session.id);

    expect(resumo.destino).toEqual({ name: "Foz do Iguaçu" });
    expect(resumo.hospedagem).toEqual({
      name: "Pousada Vista Mar",
      type: "pousada",
    });
    expect(resumo.passeios).toEqual([
      { name: "Trilha das Cataratas", free: false },
      { name: "Mirante gratuito", free: true },
    ]);
    expect(resumo.roteiroAprovado).toBe(true);
  });

  it("identidade que não é dona da sessão recebe SessionNotFoundError (404, nunca 403)", async () => {
    const session = await createSessionWithDestinoAprovado();
    sessionIds.push(session.id);

    cookieGetMock.mockReturnValue({ value: OTHER_ANON_ID });

    await expect(obterResumoEncerramento(session.id)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  it("sessão inexistente recebe SessionNotFoundError", async () => {
    await expect(
      obterResumoEncerramento("00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
