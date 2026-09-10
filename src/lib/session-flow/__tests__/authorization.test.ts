// L11-T02 — Testes unitários (sem banco) do guard central de autorização
// (ADR-008 item 4, `../authorization.ts`). `resolveSessionOwner` é mockado
// (mesmo padrão de `src/lib/actions/__tests__/resolve-session-owner.test.ts`)
// para isolar a lógica de comparação pura de qualquer contexto real de
// requisição Next.js/NextAuth.
//
// Cobre o critério de aceite de L11-T02:
// - dono legítimo (mesmo mecanismo de identidade, mesmo id) é autorizado;
// - identidade de outra sessão (mesmo mecanismo, id diferente; ou mecanismo
//   diferente) é negada com `SessionNotFoundError` — nunca um erro 403
//   dedicado, nunca vazando se a sessão existe;
// - registro sem nenhum dono gravado (edge case defensivo, ex.: dado legado
//   pré-L11-T02a) é sempre negado, mesmo com um dono esperado válido.
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { SessionNotFoundError } from "../errors";
import { assertSessionOwnership, isSameSessionOwner } from "../authorization";

// `resolveSessionOwner` valida o formato UUID do cookie anônimo
// (`resolveAnonymousSessionId`, `@/lib/anonymous-session`) — valores fora
// desse formato são tratados como "cookie ausente" e geram um id novo
// aleatório, então os testes de `assertSessionOwnership` (que passam pelo
// cookie mockado de verdade, ao contrário de `isSameSessionOwner`, testado
// em isolamento acima com ids arbitrários) usam UUIDs válidos.
const ANON_DONO = "11111111-1111-4111-8111-111111111111";
const ANON_INTRUSO = "22222222-2222-4222-8222-222222222222";

describe("isSameSessionOwner (comparação pura, ADR-008 item 4)", () => {
  it("autoriza quando o dono esperado é autenticado e o userId persistido bate", () => {
    expect(
      isSameSessionOwner(
        { userId: "user-123", anonSessionId: null },
        { type: "user", userId: "user-123" },
      ),
    ).toBe(true);
  });

  it("autoriza quando o dono esperado é anônimo e o anonSessionId persistido bate", () => {
    expect(
      isSameSessionOwner(
        { userId: null, anonSessionId: "anon-abc" },
        { type: "anonymous", anonSessionId: "anon-abc" },
      ),
    ).toBe(true);
  });

  it("nega quando o userId persistido pertence a outro usuário", () => {
    expect(
      isSameSessionOwner(
        { userId: "user-dono", anonSessionId: null },
        { type: "user", userId: "user-outro" },
      ),
    ).toBe(false);
  });

  it("nega quando o anonSessionId persistido pertence a outra sessão anônima", () => {
    expect(
      isSameSessionOwner(
        { userId: null, anonSessionId: "anon-dono" },
        { type: "anonymous", anonSessionId: "anon-outro" },
      ),
    ).toBe(false);
  });

  it("nega quando o mecanismo de identidade não bate (registro é de usuário, dono esperado é anônimo)", () => {
    expect(
      isSameSessionOwner(
        { userId: "user-123", anonSessionId: null },
        { type: "anonymous", anonSessionId: "anon-abc" },
      ),
    ).toBe(false);
  });

  it("nega quando o mecanismo de identidade não bate (registro é anônimo, dono esperado é usuário)", () => {
    expect(
      isSameSessionOwner(
        { userId: null, anonSessionId: "anon-abc" },
        { type: "user", userId: "user-123" },
      ),
    ).toBe(false);
  });

  it("nega quando o registro não tem nenhum dono gravado (edge case defensivo)", () => {
    expect(
      isSameSessionOwner(
        { userId: null, anonSessionId: null },
        { type: "user", userId: "user-123" },
      ),
    ).toBe(false);
    expect(
      isSameSessionOwner(
        { userId: null, anonSessionId: null },
        { type: "anonymous", anonSessionId: "anon-abc" },
      ),
    ).toBe(false);
  });

  it("nega quando o registro é nulo/indefinido (sessão inexistente)", () => {
    expect(
      isSameSessionOwner(null, { type: "user", userId: "user-123" }),
    ).toBe(false);
    expect(
      isSameSessionOwner(undefined, { type: "anonymous", anonSessionId: "a" }),
    ).toBe(false);
  });
});

describe("assertSessionOwnership (guard central, resolve + compara + lança)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dono legítimo (mesmo cookie anônimo gravado na criação): autoriza sem lançar", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionOwnership("session-1", {
        userId: null,
        anonSessionId: ANON_DONO,
      }),
    ).resolves.toBeUndefined();
  });

  it("dono legítimo (mesmo user_id autenticado gravado na criação): autoriza sem lançar", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-dono" } });

    await expect(
      assertSessionOwnership("session-1", {
        userId: "user-dono",
        anonSessionId: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("requisição com cookie de outra sessão anônima: lança SessionNotFoundError (nunca 403), sem vazar dado da sessão", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_INTRUSO });

    const error = await assertSessionOwnership("session-1", {
      userId: null,
      anonSessionId: ANON_DONO,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect((error as SessionNotFoundError).name).toBe("SessionNotFoundError");
  });

  it("requisição com user_id de outra conta: lança SessionNotFoundError (nunca 403)", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-intruso" } });

    await expect(
      assertSessionOwnership("session-1", {
        userId: "user-dono",
        anonSessionId: null,
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("registro sem nenhum dono gravado (edge case): sempre nega, mesmo para um solicitante anônimo válido", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionOwnership("session-1", { userId: null, anonSessionId: null }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("sessão inexistente (record null): lança SessionNotFoundError, mesma reação de dono divergente", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionOwnership("session-inexistente", null),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
