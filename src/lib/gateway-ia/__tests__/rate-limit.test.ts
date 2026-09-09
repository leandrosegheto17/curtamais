// @vitest-environment node
//
// L3-T05 — Rate limiting de chamadas ao Gateway de IA por sessão/IP
// (SDD.md §7). Critério de aceite: limite configurável; excesso retorna erro
// tratável, não exceção não capturada.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GatewayIaError, checkGatewayIaRateLimit } from "@/lib/gateway-ia";
import {
  getGatewayIaRateLimitPerMinute,
  registerGatewayIaCall,
  resetGatewayIaRateLimitForTests,
} from "@/lib/gateway-ia/rate-limit";

const originalLimitEnv = process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;

describe("rate limiting do Gateway de IA (L3-T05)", () => {
  beforeEach(() => {
    resetGatewayIaRateLimitForTests();
  });

  afterEach(() => {
    resetGatewayIaRateLimitForTests();
    if (originalLimitEnv === undefined) {
      delete process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;
    } else {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = originalLimitEnv;
    }
  });

  it("é configurável via AI_GATEWAY_RATE_LIMIT_PER_MINUTE", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "7";
    expect(getGatewayIaRateLimitPerMinute()).toBe(7);
  });

  it("usa um default seguro quando a env está ausente ou inválida", () => {
    delete process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;
    expect(getGatewayIaRateLimitPerMinute()).toBeGreaterThan(0);

    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "não-é-um-número";
    expect(getGatewayIaRateLimitPerMinute()).toBeGreaterThan(0);

    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "0";
    expect(getGatewayIaRateLimitPerMinute()).toBeGreaterThan(0);
  });

  it("permite chamadas dentro do limite configurado e bloqueia a partir dele (mesma janela)", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "3";
    const key = "session:abc";
    const now = 1_000_000;

    expect(registerGatewayIaCall(key, now)).toBe(true);
    expect(registerGatewayIaCall(key, now)).toBe(true);
    expect(registerGatewayIaCall(key, now)).toBe(true);
    // 4ª chamada na mesma janela de 1 minuto excede o limite de 3.
    expect(registerGatewayIaCall(key, now)).toBe(false);
  });

  it("mantém contadores independentes por chave (sessão/IP diferentes não se afetam)", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
    const now = 2_000_000;

    expect(registerGatewayIaCall("session:um", now)).toBe(true);
    // Excede para a mesma chave...
    expect(registerGatewayIaCall("session:um", now)).toBe(false);
    // ...mas uma chave diferente (outra sessão/IP) começa com contador zerado.
    expect(registerGatewayIaCall("session:dois", now)).toBe(true);
  });

  it("libera novamente a chave depois que a janela de 1 minuto expira", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
    const key = "session:janela";
    const t0 = 5_000_000;

    expect(registerGatewayIaCall(key, t0)).toBe(true);
    expect(registerGatewayIaCall(key, t0)).toBe(false);

    // Mais de 60_000ms depois, a janela expirou e o contador reinicia.
    const afterWindow = t0 + 60_001;
    expect(registerGatewayIaCall(key, afterWindow)).toBe(true);
  });

  it("checkGatewayIaRateLimit não lança enquanto dentro do limite", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "2";
    const key = "session:guarda-ok";

    expect(() => checkGatewayIaRateLimit(key)).not.toThrow();
    expect(() => checkGatewayIaRateLimit(key)).not.toThrow();
  });

  it("checkGatewayIaRateLimit retorna erro tratável (GatewayIaError) ao exceder o limite, nunca uma exceção não capturada", () => {
    process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
    const key = "session:guarda-excedida";

    expect(() => checkGatewayIaRateLimit(key)).not.toThrow();
    // A chamada seguinte excede o limite configurado (1/min) — deve lançar o
    // mesmo tipo de erro já usado em todo o módulo (GatewayIaError), nunca um
    // erro nativo/desconhecido que o chamador não saiba tratar.
    expect(() => checkGatewayIaRateLimit(key)).toThrow(GatewayIaError);
  });
});
