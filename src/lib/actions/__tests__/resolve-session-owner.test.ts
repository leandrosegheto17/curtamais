// L11-T02a — Testes unitários (sem banco) de `resolveSessionOwner`
// (ADR-008): cobre a regra de precedência "conta autenticada > cookie
// anônimo" e a garantia de que o `SessionOwner` resolvido grava exatamente
// um dos dois tipos, nunca os dois, nunca nenhum — critério de aceite de
// L11-T02a. `next-auth`/`next/headers` são mockados porque exigem um
// contexto de requisição real do Next.js (App Router), indisponível ao
// chamar a função diretamente num teste (mesmo padrão de mock já usado no
// projeto para `next/navigation`, ver `destino-sugestoes-screen.test.tsx`).
import { afterEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();

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

// Import dinâmico depois dos `vi.mock` acima (hoisted pelo Vitest para o
// topo do módulo, então a ordem de declaração aqui não importa de fato —
// mantido como import estático normal, mesmo padrão dos demais testes do
// projeto que usam `vi.mock`).
import { resolveSessionOwner } from "@/lib/actions/resolve-session-owner";

describe("resolveSessionOwner (ADR-008)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("usuário autenticado: resolve owner do tipo user, sem consultar o cookie anônimo", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-123" } });

    const owner = await resolveSessionOwner();

    expect(owner).toEqual({ type: "user", userId: "user-123" });
    expect(cookieGetMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("sem sessão autenticada, cookie anônimo já existente: resolve owner do tipo anonymous com o mesmo id, sem regravar o cookie", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const existingId = "11111111-1111-4111-8111-111111111111";
    cookieGetMock.mockReturnValue({ value: existingId });

    const owner = await resolveSessionOwner();

    expect(owner).toEqual({ type: "anonymous", anonSessionId: existingId });
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("sem sessão autenticada, sem cookie anônimo: gera um novo id e grava o cookie na resposta", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue(undefined);

    const owner = await resolveSessionOwner();

    expect(owner.type).toBe("anonymous");
    if (owner.type === "anonymous") {
      expect(owner.anonSessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue] = cookieSetMock.mock.calls[0];
    expect(cookieName).toBe("anon_session_id");
    expect(cookieValue).toBe(
      owner.type === "anonymous" ? owner.anonSessionId : undefined,
    );
  });

  it("precedência: conta autenticada vence mesmo quando o cookie anônimo (de 1 ano) também está presente", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-456" } });
    cookieGetMock.mockReturnValue({
      value: "22222222-2222-4222-8222-222222222222",
    });

    const owner = await resolveSessionOwner();

    // Owner resolvido é sempre um dos dois tipos, nunca os dois nem nenhum —
    // aqui, exatamente `user`, mesmo com cookie anônimo presente.
    expect(owner).toEqual({ type: "user", userId: "user-456" });
    expect("anonSessionId" in owner).toBe(false);
  });

  it("owner resolvido nunca tem os dois campos de identidade ao mesmo tempo, em nenhum dos dois fluxos", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-789" } });
    const authenticatedOwner = await resolveSessionOwner();
    expect(Object.keys(authenticatedOwner).sort()).toEqual(
      ["type", "userId"].sort(),
    );

    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({
      value: "33333333-3333-4333-8333-333333333333",
    });
    const anonymousOwner = await resolveSessionOwner();
    expect(Object.keys(anonymousOwner).sort()).toEqual(
      ["type", "anonSessionId"].sort(),
    );
  });
});
