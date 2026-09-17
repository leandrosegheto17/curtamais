// @vitest-environment node
//
// V2-L7-T08 — testes unitários do módulo de rate limit compartilhado por
// `criarConta`/`authorize` (SDD.md §8.7). Mesmo padrão de
// `src/lib/gateway-ia/__tests__/rate-limit.test.ts` (L3-T05): contador em
// memória por chave, janela fixa.
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTHORIZE_RATE_LIMIT_MAX_PER_WINDOW,
  CRIAR_CONTA_RATE_LIMIT_MAX_PER_WINDOW,
  authorizeRateLimiter,
  criarContaRateLimiter,
  extractClientIp,
  hashEmailForRateLimit,
  resetAuthRateLimitersForTests,
} from "@/lib/auth-rate-limit";

describe("auth-rate-limit (V2-L7-T08)", () => {
  afterEach(() => {
    resetAuthRateLimitersForTests();
  });

  it("limites do critério de aceite: 5 cadastros / 10 tentativas de entrada por janela de 10 min", () => {
    expect(CRIAR_CONTA_RATE_LIMIT_MAX_PER_WINDOW).toBe(5);
    expect(AUTHORIZE_RATE_LIMIT_MAX_PER_WINDOW).toBe(10);
  });

  it("criarContaRateLimiter: permite 5 tentativas por IP e bloqueia a 6ª na mesma janela", () => {
    const key = "ip:198.51.100.1";
    const now = 0;
    for (let i = 0; i < 5; i++) {
      expect(criarContaRateLimiter.register(key, now)).toBe(true);
    }
    // 6ª tentativa do mesmo IP em 10 min é recusada.
    expect(criarContaRateLimiter.register(key, now)).toBe(false);
  });

  it("authorizeRateLimiter: permite 10 tentativas por (IP, hash do e-mail) e bloqueia a 11ª na mesma janela", () => {
    const key = `ip:198.51.100.1:${hashEmailForRateLimit("alguem@example.com")}`;
    const now = 0;
    for (let i = 0; i < 10; i++) {
      expect(authorizeRateLimiter.register(key, now)).toBe(true);
    }
    // 11ª tentativa de entrada do mesmo (IP, e-mail) em 10 min é recusada.
    expect(authorizeRateLimiter.register(key, now)).toBe(false);
  });

  it("mantém contadores independentes por chave (IP/e-mail diferentes não se afetam)", () => {
    const now = 0;
    for (let i = 0; i < 5; i++) {
      expect(criarContaRateLimiter.register("ip:a", now)).toBe(true);
    }
    expect(criarContaRateLimiter.register("ip:a", now)).toBe(false);
    // IP diferente começa com contador zerado.
    expect(criarContaRateLimiter.register("ip:b", now)).toBe(true);
  });

  it("libera novamente a chave depois que a janela de 10 min expira", () => {
    const key = "ip:janela";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(criarContaRateLimiter.register(key, t0)).toBe(true);
    }
    expect(criarContaRateLimiter.register(key, t0)).toBe(false);

    const afterWindow = t0 + 10 * 60_000 + 1;
    expect(criarContaRateLimiter.register(key, afterWindow)).toBe(true);
  });

  it("hashEmailForRateLimit nunca devolve o e-mail em texto plano e normaliza caixa/espaço", () => {
    const a = hashEmailForRateLimit("  Foo@Example.com ");
    const b = hashEmailForRateLimit("foo@example.com");

    expect(a).toBe(b);
    expect(a).not.toContain("@");
    expect(a).not.toMatch(/foo/i);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("extractClientIp usa o primeiro IP de X-Forwarded-For e tem fallback seguro", () => {
    expect(extractClientIp("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(extractClientIp(["203.0.113.9", "10.0.0.2"])).toBe("203.0.113.9");
    expect(extractClientIp(null)).toBe("unknown");
    expect(extractClientIp(undefined)).toBe("unknown");
    expect(extractClientIp("")).toBe("unknown");
  });
});
