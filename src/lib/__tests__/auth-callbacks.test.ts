// @vitest-environment node
//
// Cobre o critério de aceite "sessão sobrevive a reload" para o caminho
// autenticado: o callback `jwt` grava `userId` no token na primeira
// autenticação, e chamadas subsequentes do NextAuth (reload — sem `user`,
// só o token já assinado) preservam esse `userId`; o callback `session`
// projeta esse `userId` para fora.
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

describe("NextAuth callbacks (L1-T03 — sessão sobrevive a reload)", () => {
  it("jwt callback grava userId no token no login e o preserva em chamadas seguintes (reload)", async () => {
    const jwtCallback = authOptions.callbacks?.jwt;
    expect(jwtCallback).toBeDefined();

    type JwtCallbackArgs = Parameters<NonNullable<typeof jwtCallback>>[0];

    // 1ª chamada: login (NextAuth passa `user` vindo de `authorize`).
    const tokenAfterLogin = await jwtCallback!({
      token: {} as JWT,
      user: { id: "user-123", email: "a@example.com" },
    } as JwtCallbackArgs);

    expect(tokenAfterLogin.userId).toBe("user-123");

    // 2ª chamada: reload — NextAuth não passa `user` de novo, só o token
    // assinado que já veio do cookie de sessão.
    const tokenAfterReload = await jwtCallback!({
      token: tokenAfterLogin,
      user: undefined,
    } as unknown as JwtCallbackArgs);

    expect(tokenAfterReload.userId).toBe("user-123");
  });

  it("session callback projeta userId do token para session.user.id", async () => {
    const sessionCallback = authOptions.callbacks?.session;
    expect(sessionCallback).toBeDefined();

    type SessionCallbackArgs = Parameters<NonNullable<typeof sessionCallback>>[0];

    const session = await sessionCallback!({
      session: { user: {}, expires: "" } as Session,
      token: { userId: "user-456" } as JWT,
    } as SessionCallbackArgs);

    expect(session.user.id).toBe("user-456");
  });

  it("estratégia de sessão é jwt (obrigatório com Credentials Provider)", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });
});
