// @vitest-environment node
//
// Testa o middleware que garante a sessão anônima em toda navegação
// (L1-T03), sem subir um servidor Next.js real — instancia `NextRequest`
// diretamente e inspeciona o `NextResponse` retornado, incluindo os
// atributos do cookie escrito.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { ANONYMOUS_SESSION_COOKIE } from "@/lib/anonymous-session";

function buildRequest(cookieHeader?: string): NextRequest {
  return new NextRequest("http://localhost:3000/", {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe("middleware — sessão anônima (L1-T03)", () => {
  it("primeira visita (sem cookie): grava um novo cookie httpOnly/secure-aware", () => {
    const response = middleware(buildRequest());

    const cookie = response.cookies.get(ANONYMOUS_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toString().toLowerCase()).toBe("lax");
  });

  it("requisição subsequente com cookie já presente: não sobrescreve o id — sessão sobrevive a reload", () => {
    const first = middleware(buildRequest());
    const anonId = first.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value as string;

    // Simula o reload: o navegador reenviaria o cookie recebido.
    const second = middleware(
      buildRequest(`${ANONYMOUS_SESSION_COOKIE}=${anonId}`),
    );

    // Nenhum novo Set-Cookie é necessário quando o valor já é válido.
    expect(second.cookies.get(ANONYMOUS_SESSION_COOKIE)).toBeUndefined();
  });

  it("visitantes em requisições sem cookie recebem ids diferentes entre si", () => {
    const responseA = middleware(buildRequest());
    const responseB = middleware(buildRequest());

    const idA = responseA.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value;
    const idB = responseB.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value;

    expect(idA).not.toBe(idB);
  });
});
