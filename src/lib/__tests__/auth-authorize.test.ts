// @vitest-environment node
//
// V2-L7-T08 — testes unitários (sem banco) do `authorize` do Credentials
// Provider (SDD.md §8.7): rate limit por (IP, hash do e-mail), equalização
// de tempo (branch de `bcrypt.compare` dummy quando o e-mail não existe) e
// garantia de que o e-mail nunca aparece em nenhum log.
//
// `@/lib/prisma` é mockado (mesmo padrão de `resolve-request-identity.test.ts`
// / `resolve-session-owner.test.ts`) — este teste nunca toca um banco real.
import { afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const userFindUniqueMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
  },
}));

const verifyPasswordMock = vi.fn();
vi.mock("@/lib/password", () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
  hashPassword: vi.fn(),
}));

import { authOptions } from "@/lib/auth";
import { resetAuthRateLimitersForTests } from "@/lib/auth-rate-limit";

// `CredentialsConfig.authorize` (next-auth v4) — ver `authOptions.providers[0]`.
type Authorize = (
  credentials: Record<string, string> | undefined,
  req: { headers?: Record<string, unknown> },
) => Promise<unknown>;

function getAuthorize(): Authorize {
  // `CredentialsProvider(options)` (next-auth v4,
  // `node_modules/next-auth/src/providers/credentials.ts`) devolve
  // `authorize: () => null` fixo no nível raiz — a função real passada por
  // `src/lib/auth.ts` fica em `options.authorize`.
  const provider = authOptions.providers[0] as unknown as {
    options: { authorize: Authorize };
  };
  return provider.options.authorize;
}

const REQ = { headers: { "x-forwarded-for": "203.0.113.42" } };

describe("authorize do Credentials Provider (V2-L7-T08)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetAuthRateLimitersForTests();
  });

  it("permite 10 tentativas de entrada do mesmo (IP, e-mail) e recusa a 11ª, com o mesmo `return null` genérico", async () => {
    const authorize = getAuthorize();
    userFindUniqueMock.mockResolvedValue(null); // e-mail inexistente em todas.

    for (let i = 0; i < 10; i++) {
      const result = await authorize(
        { email: "alvo@example.com", password: "qualquer-senha" },
        REQ,
      );
      expect(result).toBeNull();
    }
    expect(userFindUniqueMock).toHaveBeenCalledTimes(10);

    // 11ª tentativa: recusada SEM sequer consultar o banco (rate limit
    // checado antes da consulta) — mesmo shape de retorno (`null`) das
    // credenciais incorretas, nunca uma mensagem distinta que revele o
    // motivo específico.
    const eleventh = await authorize(
      { email: "alvo@example.com", password: "qualquer-senha" },
      REQ,
    );
    expect(eleventh).toBeNull();
    expect(userFindUniqueMock).toHaveBeenCalledTimes(10);
  });

  it("um IP ou e-mail diferente não é afetado pelo limite do outro", async () => {
    const authorize = getAuthorize();
    userFindUniqueMock.mockResolvedValue(null);

    for (let i = 0; i < 10; i++) {
      await authorize(
        { email: "primeiro@example.com", password: "x" },
        REQ,
      );
    }
    // Mesmo IP, e-mail diferente: contador independente (chave inclui hash
    // do e-mail).
    const outroEmail = await authorize(
      { email: "segundo@example.com", password: "x" },
      REQ,
    );
    expect(outroEmail).toBeNull(); // null porque e-mail não existe, não por rate limit.
    expect(userFindUniqueMock).toHaveBeenCalledTimes(11);
  });

  it("equalização de tempo: quando o e-mail não existe, roda bcrypt.compare contra um hash fixo (mesma branch executada, não pulada)", async () => {
    const authorize = getAuthorize();
    userFindUniqueMock.mockResolvedValue(null);
    const compareSpy = vi.spyOn(bcrypt, "compare");

    const result = await authorize(
      { email: "fantasma@example.com", password: "senha-qualquer-123" },
      REQ,
    );

    expect(result).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
    const [comparedPassword, comparedHash] = compareSpy.mock.calls[0];
    expect(comparedPassword).toBe("senha-qualquer-123");
    // Hash fixo do módulo (bcrypt), nunca vindo de um usuário real.
    expect(comparedHash).toMatch(/^\$2[aby]\$/);

    compareSpy.mockRestore();
  });

  it("com e-mail existente e senha errada, chama verifyPassword (mesmo tipo de operação de custo comparável ao caminho de e-mail inexistente)", async () => {
    const authorize = getAuthorize();
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "existe@example.com",
      name: null,
      passwordHash: "hash-qualquer",
    });
    verifyPasswordMock.mockResolvedValue(false);

    const result = await authorize(
      { email: "existe@example.com", password: "senha-errada" },
      REQ,
    );

    expect(result).toBeNull();
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "senha-errada",
      "hash-qualquer",
    );
  });

  it("nunca loga o e-mail informado, em nenhuma chamada de console.* (texto plano ou não)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const authorize = getAuthorize();
    const email = "nao-pode-aparecer-em-log@example.com";
    userFindUniqueMock.mockResolvedValue(null);

    // Exercita os dois caminhos (dentro do limite e rate-limitado).
    for (let i = 0; i < 11; i++) {
      await authorize({ email, password: "qualquer" }, REQ);
    }

    for (const spy of [logSpy, errorSpy, warnSpy, infoSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(email);
        }
      }
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
