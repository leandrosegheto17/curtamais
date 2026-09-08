// Sessão anônima via cookie httpOnly/secure (L1-T03, SDD.md §7).
//
// Independente do NextAuth: permite que o usuário navegue/use o fluxo sem
// nunca ser forçado a criar conta (RF-01/02/03 não exigem login). O cookie
// só guarda um identificador de visitante (UUID) — nenhum dado pessoal.
//
// Lógica extraída em funções puras (sem depender de `next/headers`/
// `next/server`) para ser testável em isolamento; `src/middleware.ts` é a
// única camada que efetivamente lê/escreve o cookie numa requisição real.
//
// Usa a Web Crypto API global (`crypto.randomUUID()`) em vez de
// `node:crypto` deliberadamente: este módulo é importado por
// `src/middleware.ts`, que roda no Edge Runtime do Next.js (sem suporte a
// módulos `node:*`) — `crypto.randomUUID()` está disponível tanto no Edge
// Runtime quanto no runtime Node.js usado pelas rotas normais.

export const ANONYMOUS_SESSION_COOKIE = "anon_session_id";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnonymousSessionResolution {
  id: string;
  /** true quando um novo id precisa ser gravado no cookie da resposta. */
  isNew: boolean;
}

/**
 * Decide o identificador de sessão anônima a partir do valor de cookie já
 * presente na requisição (se houver). Nunca lança — valor inválido/ausente
 * sempre resulta em um novo UUID.
 */
export function resolveAnonymousSessionId(
  existingCookieValue: string | undefined | null,
): AnonymousSessionResolution {
  if (existingCookieValue && UUID_REGEX.test(existingCookieValue)) {
    return { id: existingCookieValue, isNew: false };
  }
  return { id: crypto.randomUUID(), isNew: true };
}

/**
 * Opções do cookie de sessão anônima — httpOnly + secure (fora de
 * desenvolvimento local) conforme SDD.md §7 e GUARDRAILS.md regra 16.
 * `secure` fica `false` só em desenvolvimento local (sem HTTPS), nunca em
 * produção (controlado por `NODE_ENV`, nunca hardcoded a um valor fixo).
 */
export function anonymousSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // 1 ano — visitante mantém a mesma identidade anônima entre visitas,
    // sem exigir conta.
    maxAge: 60 * 60 * 24 * 365,
  };
}
