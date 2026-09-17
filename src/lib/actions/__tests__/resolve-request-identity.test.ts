// V2-L6-T02 — Testes unitários (sem banco) de `resolveRequestIdentity`
// (ADR-009 item 2): confirma que a função devolve o PAR bruto
// `{ userId, anonSessionId }`, sem decidir precedência entre os dois, e sem
// nenhum efeito colateral (nenhum cookie novo é criado/regravado). Mesmo
// padrão de mock de `next-auth`/`next/headers` já usado em
// `resolve-session-owner.test.ts` (ADR-008).
import { afterEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();
const userFindUniqueMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (...args: unknown[]) => cookieGetMock(...args),
    set: (...args: unknown[]) => cookieSetMock(...args),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
  },
}));

import { resolveRequestIdentity } from "@/lib/actions/resolve-request-identity";

describe("resolveRequestIdentity (ADR-009 item 2)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sessão NextAuth válida (usuário existente) + sem cookie anônimo: devolve { userId, anonSessionId: null }", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-123" } });
    userFindUniqueMock.mockResolvedValue({ id: "user-123" });
    cookieGetMock.mockReturnValue(undefined);

    const identity = await resolveRequestIdentity();

    expect(identity).toEqual({ userId: "user-123", anonSessionId: null });
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "user-123" },
      select: { id: true },
    });
  });

  it("sem sessão + cookie anônimo existente: devolve { userId: null, anonSessionId }", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const existingId = "11111111-1111-4111-8111-111111111111";
    cookieGetMock.mockReturnValue({ value: existingId });

    const identity = await resolveRequestIdentity();

    expect(identity).toEqual({ userId: null, anonSessionId: existingId });
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("sessão válida E cookie anônimo presentes: devolve os dois, sem decidir precedência", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-456" } });
    userFindUniqueMock.mockResolvedValue({ id: "user-456" });
    const existingId = "22222222-2222-4222-8222-222222222222";
    cookieGetMock.mockReturnValue({ value: existingId });

    const identity = await resolveRequestIdentity();

    expect(identity).toEqual({
      userId: "user-456",
      anonSessionId: existingId,
    });
  });

  it("nenhum dos dois: devolve { userId: null, anonSessionId: null }", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(undefined);

    const identity = await resolveRequestIdentity();

    expect(identity).toEqual({ userId: null, anonSessionId: null });
  });

  it("JWT de conta já excluída (User não existe mais no banco): trata como sem conta", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-deleted" } });
    userFindUniqueMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(undefined);

    const identity = await resolveRequestIdentity();

    expect(identity).toEqual({ userId: null, anonSessionId: null });
  });

  it("nunca cria nem regrava o cookie anônimo (sem efeito colateral)", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(undefined);

    await resolveRequestIdentity();

    expect(cookieSetMock).not.toHaveBeenCalled();
  });
});
