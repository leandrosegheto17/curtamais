// @vitest-environment node
//
// L6-T07 — Teste de integração real com Postgres (mesmo padrão de
// `persistence.integration.test.ts`/`data-livre.integration.test.ts`): prova
// que `submitQuizAnswers` cria a `TripSession` com `entryPath: "quiz"` e o
// range de datas sugerido, e avança `flowState` para `destino_pendente` via
// `@/lib/session-flow` — cobrindo o critério de aceite de L6-T07 (RF-03.2).
// L11-T02a (ADR-008): `submitQuizAnswers` agora resolve o dono da sessão via
// `resolveSessionOwner`, que exige contexto de requisição real do Next.js —
// `next-auth`/`next/headers` são mockados (mesmo padrão de
// `data-livre.integration.test.ts`/`resolve-session-owner.test.ts`), por
// padrão simulando o caminho anônimo (sem sessão autenticada).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { submitQuizAnswers } from "@/lib/actions/quiz";
import type { QuizAnswers } from "@/components/quiz/quiz-wizard";

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

const ANON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function baseAnswers(
  overrides: Partial<QuizAnswers> = {},
): QuizAnswers {
  return {
    periodo: "3_a_5_dias",
    alcance: null,
    experiencia: [],
    orcamento: null,
    ...overrides,
  };
}

describe("submitQuizAnswers — integração real com Postgres (L6-T07)", () => {
  const sessionIds: string[] = [];

  beforeEach(() => {
    getServerSessionMock.mockReset();
    cookieGetMock.mockReset();
    cookieSetMock.mockReset();
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_ID });
  });

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("cria a sessão com entryPath=quiz e avança para destino_pendente (sem destino, RF-01.2)", async () => {
    const result = await submitQuizAnswers(baseAnswers());
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_pendente");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.entryPath).toBe("quiz");
    expect(stored.flowState).toBe("destino_pendente");
    expect(stored.status).toBe("in_progress");
    expect(stored.dateRangeStart).not.toBeNull();

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();

    // ADR-008/L11-T02a: fluxo anônimo grava anon_session_id, nunca user_id.
    expect(stored.anonSessionId).toBe(ANON_ID);
    expect(stored.userId).toBeNull();
  });

  it("com usuário autenticado: grava user_id (nunca anon_session_id), mesmo com cookie anônimo presente (ADR-008)", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-quiz-1" } });

    const result = await submitQuizAnswers(baseAnswers());
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.userId).toBe("user-quiz-1");
    expect(stored.anonSessionId).toBeNull();
  });

  it("range gerado é coerente com o período informado (fim_de_semana → 2 a 4 dias)", async () => {
    const result = await submitQuizAnswers(
      baseAnswers({ periodo: "fim_de_semana" }),
    );
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    const start = stored.dateRangeStart!;
    const end = stored.dateRangeEnd;
    const durationDays =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    expect(durationDays).toBeGreaterThanOrEqual(2);
    expect(durationDays).toBeLessThanOrEqual(4);
  });

  it("range gerado é coerente com o período informado (1_semana → 7 dias, sem feriado compatível)", async () => {
    const result = await submitQuizAnswers(baseAnswers({ periodo: "1_semana" }));
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    const start = stored.dateRangeStart!;
    const end = stored.dateRangeEnd;
    const durationDays =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    expect(durationDays).toBe(7);
    expect(result.dateRangeSource).toBe("periodo_padrao");
  });

  it("range gerado é coerente com o período informado (mais_de_1_semana → 10 dias, sem feriado compatível)", async () => {
    const result = await submitQuizAnswers(
      baseAnswers({ periodo: "mais_de_1_semana" }),
    );
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    const start = stored.dateRangeStart!;
    const end = stored.dateRangeEnd;
    const durationDays =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    expect(durationDays).toBe(10);
    expect(result.dateRangeSource).toBe("periodo_padrao");
  });

  it("respostas de alcance/experiência/orçamento não impedem a criação da sessão (não persistidas nesta tarefa)", async () => {
    const result = await submitQuizAnswers(
      baseAnswers({
        alcance: "europa",
        experiencia: ["praia", "cultura_historia"],
        orcamento: "R$ 3.000 a R$ 5.000",
      }),
    );
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_pendente");
  });

  it("rejeita chamada sem período (RF-03.3), sem criar sessão", async () => {
    const countBefore = await prisma.tripSession.count();

    await expect(
      submitQuizAnswers(baseAnswers({ periodo: null })),
    ).rejects.toThrow();

    const countAfter = await prisma.tripSession.count();
    expect(countAfter).toBe(countBefore);
  });
});
