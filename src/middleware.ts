// Garante o cookie de sessão anônima (httpOnly/secure, SDD.md §7) em toda
// navegação, independente do NextAuth (L1-T03). Roda antes de qualquer
// rota/página — se o cookie ainda não existir, esta é a única camada que o
// cria, permitindo que o usuário navegue/use o fluxo sem nunca ser forçado a
// criar conta.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ANONYMOUS_SESSION_COOKIE,
  anonymousSessionCookieOptions,
  resolveAnonymousSessionId,
} from "@/lib/anonymous-session";

export function middleware(request: NextRequest) {
  const existing = request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value;
  const { id, isNew } = resolveAnonymousSessionId(existing);

  const response = NextResponse.next();

  if (isNew) {
    response.cookies.set(
      ANONYMOUS_SESSION_COOKIE,
      id,
      anonymousSessionCookieOptions(),
    );
  }

  return response;
}

export const config = {
  // Exclui assets estáticos e as próprias rotas do NextAuth (que gerenciam
  // seu próprio cookie de sessão) do overhead do middleware.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/).*)"],
};
