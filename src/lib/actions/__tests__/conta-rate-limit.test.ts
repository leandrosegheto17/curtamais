// @vitest-environment node
//
// V2-L7-T08 — testes unitários (sem banco) do rate limit por IP de
// `criarConta` (SDD.md §8.7): 5 cadastros por IP a cada 10 min. `@/lib/user-
// account` é mockado (a lógica de criação em si já é coberta por
// `conta.integration.test.ts`, V2-L7-T01) para isolar só o comportamento do
// rate limit, de forma rápida e determinística.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerGetMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (...args: unknown[]) => headerGetMock(...args),
  }),
}));

const createUserAccountMock = vi.fn();
// Classes declaradas DENTRO da factory (não referenciadas de fora) porque
// `vi.mock` é hoisted para o topo do arquivo pelo Vitest — uma variável de
// nível superior declarada com `class`/`const` fora da factory ainda não
// existiria no momento em que a factory hoisted executa.
vi.mock("@/lib/user-account", () => {
  class FakeConsentimentoAusenteError extends Error {}
  class FakeEmailAlreadyInUseError extends Error {}
  class FakeInvalidAccountInputError extends Error {
    field: "email" | "senha";
    constructor(message: string, field: "email" | "senha") {
      super(message);
      this.field = field;
    }
  }
  return {
    createUserAccount: (...args: unknown[]) => createUserAccountMock(...args),
    ConsentimentoAusenteError: FakeConsentimentoAusenteError,
    EmailAlreadyInUseError: FakeEmailAlreadyInUseError,
    InvalidAccountInputError: FakeInvalidAccountInputError,
  };
});

import { criarConta } from "@/lib/actions/conta";
import { resetAuthRateLimitersForTests } from "@/lib/auth-rate-limit";

describe("criarConta — rate limit por IP (V2-L7-T08)", () => {
  beforeEach(() => {
    resetAuthRateLimitersForTests();
    headerGetMock.mockReturnValue("198.51.100.7");
    createUserAccountMock.mockImplementation(
      async ({ email }: { email: string }) => ({
        id: `user-${email}`,
        email,
        name: null,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("permite 5 cadastros do mesmo IP em 10 min e recusa a 6ª tentativa, sem chamar createUserAccount", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await criarConta({
        email: `pessoa-${i}@example.com`,
        senha: "senha-segura-123",
        consentimento: true,
      });
      expect(result.status).toBe("sucesso");
    }
    expect(createUserAccountMock).toHaveBeenCalledTimes(5);

    const sixth = await criarConta({
      email: "pessoa-5@example.com",
      senha: "senha-segura-123",
      consentimento: true,
    });

    expect(sixth).toEqual({
      status: "erro",
      mensagem: "Muitas tentativas. Tente novamente em alguns minutos.",
    });
    // A 6ª tentativa nem chega a chamar `createUserAccount` — o rate limit é
    // checado ANTES de qualquer outra validação/escrita.
    expect(createUserAccountMock).toHaveBeenCalledTimes(5);
  });

  it("checa o rate limit ANTES de qualquer validação de negócio (payload inválido também conta e é bloqueado a partir da 6ª tentativa)", async () => {
    for (let i = 0; i < 5; i++) {
      await criarConta({
        email: `qualquer-${i}@example.com`,
        senha: "senha-segura-123",
        consentimento: true,
      });
    }

    // 6ª tentativa do mesmo IP, mesmo com payload que falharia por outro
    // motivo (senha curta) — a resposta ainda é a de rate limit, porque essa
    // checagem acontece antes.
    const result = await criarConta({
      email: "outro@example.com",
      senha: "curta",
      consentimento: true,
    });

    expect(result).toEqual({
      status: "erro",
      mensagem: "Muitas tentativas. Tente novamente em alguns minutos.",
    });
  });

  it("IPs diferentes têm contadores independentes", async () => {
    headerGetMock.mockReturnValue("198.51.100.7");
    for (let i = 0; i < 5; i++) {
      await criarConta({
        email: `ip-a-${i}@example.com`,
        senha: "senha-segura-123",
        consentimento: true,
      });
    }

    headerGetMock.mockReturnValue("198.51.100.8");
    const result = await criarConta({
      email: "ip-b@example.com",
      senha: "senha-segura-123",
      consentimento: true,
    });

    expect(result.status).toBe("sucesso");
  });

  it("nunca loga o e-mail informado, em nenhuma chamada de console.* (inclusive quando rate-limitado)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const email = "nao-pode-aparecer-em-log@example.com";

    for (let i = 0; i < 6; i++) {
      await criarConta({
        email,
        senha: "senha-segura-123",
        consentimento: true,
      });
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
