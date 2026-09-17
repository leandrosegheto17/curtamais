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
//
// V2-L6-T03 — acrescenta, no mesmo arquivo, os testes de
// `assertSessionAccess`/`resolveSessionAccess` (ADR-009 item 2, tabela de 5
// casos) e confirma que `assertSessionOwnership` (agora um alias de
// `assertSessionAccess(..., { exigeConta: false })`) continua se comportando
// EXATAMENTE como antes para os ~10 chamadores existentes — nenhum teste
// pré-existente acima muda de expectativa. `@/lib/prisma` passa a ser
// mockado aqui porque `assertSessionOwnership`/`assertSessionAccess` agora
// resolvem a identidade via `resolveRequestIdentity` (V2-L6-T02), que
// confirma a existência do `User` com `prisma.user.findUnique` antes de
// devolver um `userId` (ADR-009, Consequências, último parágrafo) — sem este
// mock, qualquer teste com sessão NextAuth autenticada bateria no Prisma
// real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();
const userFindUniqueMock = vi.fn();

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
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
  },
}));

import { SessionNotFoundError } from "../errors";
import {
  assertSessionOwnership,
  assertSessionAccess,
  isSameSessionOwner,
  resolveSessionAccess,
  ContaNecessariaError,
} from "../authorization";

// Por padrão, todo usuário autenticado mockado "existe" no banco — só os
// testes específicos de "conta excluída mas JWT ainda válido" (fora do
// escopo desta tarefa, já cobertos em `resolve-request-identity.test.ts`)
// precisariam sobrescrever isso para `null`.
beforeEach(() => {
  userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ id: where.id }),
  );
});

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

// V2-L6-T03 — `resolveSessionAccess` (comparação pura, ADR-009 item 2)
describe("resolveSessionAccess (comparação pura, ADR-009 item 2, tabela de 5 casos)", () => {
  const U = "user-dono";
  const OUTRO_U = "user-intruso";
  const A = "anon-dono";
  const OUTRO_A = "anon-intruso";

  it("linha 1 — userId = U, identidade userId = U: granted, com e sem exigeConta", () => {
    const record = { userId: U, anonSessionId: null };
    expect(resolveSessionAccess(record, { userId: U, anonSessionId: null }, false)).toBe(
      "granted",
    );
    expect(resolveSessionAccess(record, { userId: U, anonSessionId: null }, true)).toBe(
      "granted",
    );
    // "identidade userId = U" cobre também quem ainda carrega o cookie
    // anônimo de antes do vínculo — irrelevante para esta linha.
    expect(
      resolveSessionAccess(record, { userId: U, anonSessionId: A }, true),
    ).toBe("granted");
  });

  it("linha 2 — userId = U, identidade é qualquer outra (inclusive o mesmo cookie de antes do vínculo): 404 (denied), com e sem exigeConta", () => {
    const record = { userId: U, anonSessionId: null };
    // outra conta autenticada
    expect(
      resolveSessionAccess(record, { userId: OUTRO_U, anonSessionId: null }, false),
    ).toBe("denied");
    expect(
      resolveSessionAccess(record, { userId: OUTRO_U, anonSessionId: null }, true),
    ).toBe("denied");
    // anônimo (sem conta) tentando acessar sessão já vinculada
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: A }, false),
    ).toBe("denied");
    // "o mesmo cookie de antes do vínculo": anon_session_id do registro já
    // foi zerado no vínculo (ADR-009 item 3), então nenhum cookie o
    // reencontra mais — mesmo o cookie histórico de quem virou dono.
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: "cookie-historico" }, false),
    ).toBe("denied");
  });

  it("linha 3 — anonSessionId = A, cookie A (com ou sem conta autenticada): granted se exigeConta=false, conta_necessaria se exigeConta=true", () => {
    const record = { userId: null, anonSessionId: A };
    // sem conta autenticada
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: A }, false),
    ).toBe("granted");
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: A }, true),
    ).toBe("conta_necessaria");
    // COM conta autenticada, mas ainda não vinculou esta sessão (mesmo
    // cookie) — mesmo resultado: posse é pelo cookie, não pela conta.
    expect(
      resolveSessionAccess(record, { userId: U, anonSessionId: A }, false),
    ).toBe("granted");
    expect(
      resolveSessionAccess(record, { userId: U, anonSessionId: A }, true),
    ).toBe("conta_necessaria");
  });

  it("linha 4 — anonSessionId = A, cookie diferente de A: 404 (denied), com e sem exigeConta", () => {
    const record = { userId: null, anonSessionId: A };
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: OUTRO_A }, false),
    ).toBe("denied");
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: OUTRO_A }, true),
    ).toBe("denied");
    // sem cookie nenhum
    expect(
      resolveSessionAccess(record, { userId: null, anonSessionId: null }, true),
    ).toBe("denied");
  });

  it("linha 5 — nenhum dos dois gravado (inclusive record nulo/indefinido): 404 (denied), com e sem exigeConta, qualquer identidade", () => {
    const record = { userId: null, anonSessionId: null };
    expect(
      resolveSessionAccess(record, { userId: U, anonSessionId: A }, false),
    ).toBe("denied");
    expect(
      resolveSessionAccess(record, { userId: U, anonSessionId: A }, true),
    ).toBe("denied");
    expect(resolveSessionAccess(null, { userId: U, anonSessionId: A }, true)).toBe(
      "denied",
    );
    expect(
      resolveSessionAccess(undefined, { userId: null, anonSessionId: A }, false),
    ).toBe("denied");
  });

  it("ordem: posse negada com exigeConta=true continua denied, NUNCA conta_necessaria", () => {
    // Linha 4 com exigeConta: true — cookie não confere, então a checagem
    // de conta nem chega a ser avaliada.
    expect(
      resolveSessionAccess(
        { userId: null, anonSessionId: "anon-dono" },
        { userId: null, anonSessionId: "anon-intruso" },
        true,
      ),
    ).toBe("denied");
    // Linha 2 com exigeConta: true — dono é outra conta.
    expect(
      resolveSessionAccess(
        { userId: "user-dono", anonSessionId: null },
        { userId: "user-intruso", anonSessionId: null },
        true,
      ),
    ).toBe("denied");
  });
});

// V2-L6-T03 — `assertSessionAccess` (guard central com I/O mockado)
describe("assertSessionAccess (guard central, resolve identidade + compara + lança)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dono anônimo (cookie confere), exigeConta: false: autoriza sem lançar", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionAccess(
        "session-1",
        { userId: null, anonSessionId: ANON_DONO },
        { exigeConta: false },
      ),
    ).resolves.toBeUndefined();
  });

  it("dono anônimo (cookie confere), exigeConta: true: lança ContaNecessariaError (não SessionNotFoundError)", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    const error = await assertSessionAccess(
      "session-1",
      { userId: null, anonSessionId: ANON_DONO },
      { exigeConta: true },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContaNecessariaError);
    expect((error as ContaNecessariaError).sessionId).toBe("session-1");
  });

  it("dono anônimo AUTENTICADO (conta logada, mas ainda com o cookie da sessão anônima): continua acessando a própria sessão anônima pelo cookie — compatibilidade pós-login", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-recem-logado" } });
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionAccess(
        "session-1",
        { userId: null, anonSessionId: ANON_DONO },
        { exigeConta: false },
      ),
    ).resolves.toBeUndefined();

    // Mas a mesma sessão, numa transição que exige conta, ainda pede o
    // vínculo explícito (V2-L7-T02) — a autenticação sozinha não basta.
    await expect(
      assertSessionAccess(
        "session-1",
        { userId: null, anonSessionId: ANON_DONO },
        { exigeConta: true },
      ),
    ).rejects.toBeInstanceOf(ContaNecessariaError);
  });

  it("ordem — posse negada com exigeConta: true ainda lança SessionNotFoundError (404), nunca ContaNecessariaError", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_INTRUSO });

    const error = await assertSessionAccess(
      "session-1",
      { userId: null, anonSessionId: ANON_DONO },
      { exigeConta: true },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect(error).not.toBeInstanceOf(ContaNecessariaError);
  });

  it("negação de posse (userId de outra conta) nunca vira 403 nem ContaNecessariaError, mesmo com exigeConta: true", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-intruso" } });

    const error = await assertSessionAccess(
      "session-1",
      { userId: "user-dono", anonSessionId: null },
      { exigeConta: true },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect((error as Error).name).toBe("SessionNotFoundError");
  });
});

// V2-L6-T03 — o alias precisa se comportar de forma IDÊNTICA ao
// `assertSessionOwnership` original: mesmo shape de chamada, mesma reação,
// nunca lança `ContaNecessariaError` (fixo em `exigeConta: false`).
describe("assertSessionOwnership como alias de assertSessionAccess(..., { exigeConta: false })", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("nunca lança ContaNecessariaError, mesmo quando a mesma sessão exigiria conta via assertSessionAccess", async () => {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_DONO });

    await expect(
      assertSessionOwnership("session-1", {
        userId: null,
        anonSessionId: ANON_DONO,
      }),
    ).resolves.toBeUndefined();
  });
});
