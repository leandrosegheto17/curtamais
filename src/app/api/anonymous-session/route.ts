// Rota de demonstração/leitura da sessão anônima (L1-T03).
//
// O cookie em si é garantido por `src/middleware.ts` em toda navegação —
// esta rota só expõe o id resolvido, provando que "usuário consegue navegar
// sem conta" (critério de aceite): qualquer requisição autenticada ou não
// chega aqui com o cookie já definido pelo middleware.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ANONYMOUS_SESSION_COOKIE,
  resolveAnonymousSessionId,
} from "@/lib/anonymous-session";

export async function GET() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;
  const { id } = resolveAnonymousSessionId(existing);

  return NextResponse.json({ anonymousSessionId: id });
}
