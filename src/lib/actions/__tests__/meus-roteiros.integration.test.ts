// @vitest-environment node
//
// V2-L8-T01 — Teste de integração real com Postgres (mesmo padrão de
// `confirmacao-destino.integration.test.ts`/`encerramento.integration.test.ts`):
// prova que `listarMeusRoteiros`
// - sem conta (RF-17.8): devolve `{ status: "nao_autenticado" }` sem tocar
//   em nenhuma linha de `TripSession` de ninguém;
// - com conta: devolve só as sessões do `userId` da sessão do servidor —
//   nunca as de outra conta, nem as sessões anônimas (`userId: null`);
// - ordena por `updatedAt` desc (RF-17.2).
//
// Limitação já aceita no projeto (mesma nota de
// `encerramento.integration.test.ts`): requer Postgres real acessível via
// `DATABASE_URL`; sem ele, os testes deste arquivo falham por
// `PrismaClientInitializationError` na conexão, não por defeito na lógica.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { listarMeusRoteiros } from "@/lib/actions/meus-roteiros";

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

beforeEach(() => {
  getServerSessionMock.mockReset();
  cookieGetMock.mockReset();
  cookieSetMock.mockReset();
  getServerSessionMock.mockResolvedValue(null);
  cookieGetMock.mockReturnValue(undefined);
});

async function createUser() {
  return prisma.user.create({
    data: {
      email: `executor-v2l8t01-${Date.now()}-${Math.random()}@example.com`,
    },
  });
}

const userIds: string[] = [];
const sessionIds: string[] = [];

afterAll(async () => {
  await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("listarMeusRoteiros — integração real com Postgres (V2-L8-T01, RF-17)", () => {
  it("sem conta autenticada: devolve nao_autenticado sem consultar o banco", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(undefined);

    const result = await listarMeusRoteiros();

    expect(result).toEqual({ status: "nao_autenticado" });
  });

  it("com conta: devolve só as sessões do userId da sessão do servidor, nunca de outra conta nem anônimas", async () => {
    const owner = await createUser();
    const other = await createUser();
    userIds.push(owner.id, other.id);

    const ownSession = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-21"),
        userId: owner.id,
        flowState: "destino_pendente",
      },
    });
    const otherUsersSession = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-21"),
        userId: other.id,
        flowState: "destino_pendente",
      },
    });
    const anonymousSession = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-21"),
        anonSessionId: "45454545-4545-4545-8545-454545454545",
        flowState: "destino_pendente",
      },
    });
    sessionIds.push(ownSession.id, otherUsersSession.id, anonymousSession.id);

    getServerSessionMock.mockResolvedValue({ user: { id: owner.id } });

    const result = await listarMeusRoteiros();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const ids = result.sessoes.map((s) => s.id);
    expect(ids).toContain(ownSession.id);
    expect(ids).not.toContain(otherUsersSession.id);
    expect(ids).not.toContain(anonymousSession.id);
  });

  it("ordena por updatedAt desc (mais recente primeiro)", async () => {
    const owner = await createUser();
    userIds.push(owner.id);
    getServerSessionMock.mockResolvedValue({ user: { id: owner.id } });

    const older = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-21"),
        userId: owner.id,
        flowState: "destino_pendente",
      },
    });
    const newer = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeEnd: new Date("2026-12-21"),
        userId: owner.id,
        flowState: "destino_pendente",
      },
    });
    sessionIds.push(older.id, newer.id);

    // Bump do `updatedAt` do mais antigo, para além do "mais antigo criado
    // primeiro" — força a ordenação a depender de fato de `updatedAt`, não
    // da ordem de criação/id.
    await prisma.tripSession.update({
      where: { id: older.id },
      data: { budgetCurrency: "BRL" },
    });

    const result = await listarMeusRoteiros();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const ownIds = result.sessoes
      .map((s) => s.id)
      .filter((id) => id === older.id || id === newer.id);
    expect(ownIds).toEqual([older.id, newer.id]);
  });

  it("calcula o rótulo (RF-17.3) e os campos de exibição de cada sessão", async () => {
    const owner = await createUser();
    userIds.push(owner.id);
    getServerSessionMock.mockResolvedValue({ user: { id: owner.id } });

    const session = await prisma.tripSession.create({
      data: {
        entryPath: "data_livre",
        dateRangeStart: new Date("2026-12-20"),
        dateRangeEnd: new Date("2026-12-21"),
        userId: owner.id,
        flowState: "hospedagem_pendente",
      },
    });
    sessionIds.push(session.id);
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

    const result = await listarMeusRoteiros();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const item = result.sessoes.find((s) => s.id === session.id);
    expect(item).toBeDefined();
    expect(item?.destinationName).toBe("Foz do Iguaçu");
    expect(item?.rotulo).toBe("Em andamento — na etapa hospedagem");
  });
});
