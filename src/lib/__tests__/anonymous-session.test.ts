// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_SESSION_COOKIE,
  anonymousSessionCookieOptions,
  resolveAnonymousSessionId,
} from "@/lib/anonymous-session";

describe("resolveAnonymousSessionId (L1-T03 — sessão anônima)", () => {
  it("gera um novo id (UUID) quando não há cookie ainda — primeira visita", () => {
    const result = resolveAnonymousSessionId(undefined);

    expect(result.isNew).toBe(true);
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("reaproveita o id já existente no cookie — sessão sobrevive a reload", () => {
    const first = resolveAnonymousSessionId(undefined);

    // Simula uma segunda requisição (ex.: reload da página) enviando de
    // volta o valor de cookie resolvido na primeira.
    const second = resolveAnonymousSessionId(first.id);

    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("descarta cookie inválido/corrompido e gera um novo id", () => {
    const result = resolveAnonymousSessionId("valor-nao-e-um-uuid");

    expect(result.isNew).toBe(true);
    expect(result.id).not.toBe("valor-nao-e-um-uuid");
  });

  it("gera ids diferentes entre visitantes distintos (sem cookie prévio)", () => {
    const visitorA = resolveAnonymousSessionId(undefined);
    const visitorB = resolveAnonymousSessionId(undefined);

    expect(visitorA.id).not.toBe(visitorB.id);
  });
});

describe("anonymousSessionCookieOptions (SDD.md §7 — cookie httpOnly/secure)", () => {
  it("sempre define httpOnly=true e sameSite=lax", () => {
    const options = anonymousSessionCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("nome do cookie é estável (contrato usado por middleware/rotas)", () => {
    expect(ANONYMOUS_SESSION_COOKIE).toBe("anon_session_id");
  });
});
