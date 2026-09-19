// @vitest-environment node
//
// V2-L7-T02 (ADR-009 item 3) — testes de integração real com Postgres da
// Server Action `vincularSessaoAConta` e do módulo de escrita
// `linkAnonymousSessionToUser` que ela consome, mesmo padrão de
// `destino.integration.test.ts` (L7-T03)/`conta.integration.test.ts`
// (V2-L7-T01): `next-auth`/`next/headers` mockados, persistência real via
// `createSessionWithDateRange`/`applySessionFlowTransition`.
//
// Cobre o critério de aceite de V2-L7-T02:
// - Só a sessão indicada muda de dono.
// - `count === 0` com mesmo `userId` é sucesso idempotente (não erro).
// - Qualquer outro caso (sessão de outra conta, sessão já vinculada a outra
//   conta, sessão inexistente) é 404 (`SessionNotFoundError`).
// - Sessão em `destino_confirmado` avança para `hospedagem_pendente` na
//   MESMA transação.
// - Sem autenticação → `nao_autenticado`, sem escrita.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionWithDateRange } from "@/lib/session-flow";
import { SessionNotFoundError } from "@/lib/session-flow";

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

import { vincularSessaoAConta } from "@/lib/actions/vinculo-conta";

const ANON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ANON_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("vincularSessaoAConta — integração real com Postgres (V2-L7-T02)", () => {
  const sessionIds: string[] = [];
  const userIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `executor-v2l7t02-${label}-${Date.now()}-${Math.random()
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

  async function createPendingSession(
    anonSessionId: string = ANON_ID,
  ): Promise<string> {
    // `createSessionWithDateRange` passa pelo guard central: a identidade da
    // requisição precisa ser o dono anônimo que está sendo gravado.
    mockAnonymous(anonSessionId);
    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-10T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-11-15T00:00:00.000Z"),
      owner: { type: "anonymous", anonSessionId },
    });
    sessionIds.push(result.sessionId);
    expect(result.flowState).toBe("destino_pendente");
    return result.sessionId;
  }

  async function createConfirmedSession(
    anonSessionId: string = ANON_ID,
  ): Promise<string> {
    // `createSessionWithDateRange` passa pelo guard central: a identidade da
    // requisição precisa ser o dono anônimo que está sendo gravado.
    mockAnonymous(anonSessionId);
    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-10T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-11-15T00:00:00.000Z"),
      destino: "Foz do Iguaçu",
      owner: { type: "anonymous", anonSessionId },
    });
    sessionIds.push(result.sessionId);
    expect(result.flowState).toBe("destino_confirmado");
    return result.sessionId;
  }

  function mockAuthenticated(userId: string, anonSessionId: string | null) {
    getServerSessionMock.mockResolvedValue({ user: { id: userId } });
    cookieGetMock.mockReturnValue(
      anonSessionId ? { value: anonSessionId } : undefined,
    );
  }

  function mockAnonymous(anonSessionId: string | null) {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(
      anonSessionId ? { value: anonSessionId } : undefined,
    );
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

  it("sem conta autenticada devolve nao_autenticado sem escrever nada", async () => {
    const sessionId = await createPendingSession();
    mockAnonymous(ANON_ID);

    const result = await vincularSessaoAConta({ sessionId });

    expect(result).toEqual({ status: "nao_autenticado" });

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBeNull();
    expect(stored.anonSessionId).toBe(ANON_ID);
    expect(stored.linkedAt).toBeNull();
  });

  it("vincula a sessão anônima à conta e não mexe em outras sessões do mesmo cookie", async () => {
    const userId = await createUser("vinculo-simples");
    const sessionId = await createPendingSession();
    const outraSessaoDoMesmoCookie = await createPendingSession();
    mockAuthenticated(userId, ANON_ID);

    const result = await vincularSessaoAConta({ sessionId });

    expect(result).toEqual({
      status: "vinculada",
      sessionId,
      rota: expect.stringContaining("/destino?"),
    });

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBe(userId);
    expect(stored.anonSessionId).toBeNull();
    expect(stored.linkedAt).not.toBeNull();
    expect(stored.flowState).toBe("destino_pendente");

    // Só a sessão indicada mudou de dono — a outra sessão do mesmo cookie
    // anônimo continua anônima (ADR-009 item 3).
    const outra = await prisma.tripSession.findUniqueOrThrow({
      where: { id: outraSessaoDoMesmoCookie },
    });
    expect(outra.userId).toBeNull();
    expect(outra.anonSessionId).toBe(ANON_ID);
  });

  it("sessão em destino_confirmado avança para hospedagem_pendente na mesma transação do vínculo", async () => {
    const userId = await createUser("continuacao-transicao");
    const sessionId = await createConfirmedSession();
    mockAuthenticated(userId, ANON_ID);

    const result = await vincularSessaoAConta({ sessionId });

    expect(result.status).toBe("vinculada");
    expect(result).toMatchObject({
      status: "vinculada",
      sessionId,
      rota: expect.stringContaining("/hospedagem?"),
    });

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBe(userId);
    expect(stored.anonSessionId).toBeNull();
    expect(stored.flowState).toBe("hospedagem_pendente");

    // A DestinationApproval já gravada continua intacta (RN-03) — o avanço
    // não passa pelo branch de aprovação, só pela transição `avancar`.
    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId },
    });
    expect(destination?.name).toBe("Foz do Iguaçu");
  });

  it("é idempotente: chamar de novo depois de já vinculada devolve sucesso, sem erro", async () => {
    const userId = await createUser("idempotencia");
    const sessionId = await createPendingSession();
    mockAuthenticated(userId, ANON_ID);

    const first = await vincularSessaoAConta({ sessionId });
    expect(first.status).toBe("vinculada");

    // Segunda chamada: o cookie anônimo já não confere mais (foi zerado no
    // vínculo), mas o `userId` já é o dono — sucesso idempotente esperado
    // mesmo sem o cookie antigo presente na requisição.
    mockAuthenticated(userId, null);
    const second = await vincularSessaoAConta({ sessionId });

    expect(second).toEqual({
      status: "idempotente",
      sessionId,
      rota: expect.stringContaining("/destino?"),
    });

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBe(userId);
  });

  it("sessão de outra conta (já vinculada a outro userId) é 404", async () => {
    const donoOriginal = await createUser("dono-original");
    const outraConta = await createUser("outra-conta");
    const sessionId = await createPendingSession();

    mockAuthenticated(donoOriginal, ANON_ID);
    const vinculoOriginal = await vincularSessaoAConta({ sessionId });
    expect(vinculoOriginal.status).toBe("vinculada");

    mockAuthenticated(outraConta, null);
    await expect(vincularSessaoAConta({ sessionId })).rejects.toThrow(
      SessionNotFoundError,
    );

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBe(donoOriginal);
  });

  it("cookie anônimo divergente (sessão de outro cookie) é 404", async () => {
    const userId = await createUser("cookie-divergente");
    const sessionId = await createPendingSession(ANON_ID);
    mockAuthenticated(userId, OTHER_ANON_ID);

    await expect(vincularSessaoAConta({ sessionId })).rejects.toThrow(
      SessionNotFoundError,
    );

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(stored.userId).toBeNull();
    expect(stored.anonSessionId).toBe(ANON_ID);
  });

  it("sessão inexistente é 404", async () => {
    const userId = await createUser("sessao-inexistente");
    mockAuthenticated(userId, ANON_ID);

    await expect(
      vincularSessaoAConta({ sessionId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow(SessionNotFoundError);
  });
});
