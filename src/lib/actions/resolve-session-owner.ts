// L11-T02a — ADR-008: resolução do dono (`SessionOwner`) de uma `TripSession`
// nova, a partir da requisição corrente. Extraído para um único módulo
// compartilhado (em vez de duplicado nas 3 Server Actions que criam sessão —
// `submeterDataLivre`/`processarFeriadoEscolhido`/`submitQuizAnswers`) porque
// o ADR-008 exige a MESMA regra de resolução, aplicada de forma idêntica nos
// 3 chamadores, sem nenhuma regra de negócio nova em nenhum deles — mesma
// lógica de extração já usada por `createSessionWithDateRange` para a
// ramificação RF-01.2/.3 (ver cabeçalho de `./` `create-session-with-range.ts`).
//
// Regra de precedência (ADR-008, item 3): conta autenticada sobre cookie
// anônimo, deliberada — um usuário logado nunca cria uma sessão "anônima" só
// porque o cookie de visitante (1 ano de validade) também está presente na
// requisição.
//
// O guard central de autorização (`L11-T02`, dependente desta tarefa) usará a
// MESMA regra para resolver o "dono esperado" da requisição — ver ADR-008,
// item 4 — mas essa comparação em si é fora de escopo aqui.

import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  ANONYMOUS_SESSION_COOKIE,
  anonymousSessionCookieOptions,
  resolveAnonymousSessionId,
} from "@/lib/anonymous-session";
import type { SessionOwner } from "@/lib/session-flow";

/**
 * Resolve o dono (`SessionOwner`) da `TripSession` a ser criada nesta
 * requisição: usuário autenticado (`getServerSession(authOptions)`) tem
 * precedência sobre o cookie de sessão anônima; só cai para o caminho
 * anônimo quando não há sessão NextAuth válida.
 *
 * O cookie de sessão anônima já é garantido por `src/middleware.ts` (L1-T03)
 * em toda navegação de página normal — mas, defensivamente (ex.: Server
 * Action disparada fora do matcher do middleware, ou em teste), se o cookie
 * ainda não existir aqui, um novo id é gerado e gravado na resposta desta
 * mesma requisição via `cookies().set(...)` (permitido em Server Actions do
 * Next.js), evitando duas identidades anônimas divergentes entre o
 * middleware e esta resolução.
 */
export async function resolveSessionOwner(): Promise<SessionOwner> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (userId) {
    return { type: "user", userId };
  }

  const cookieStore = cookies();
  const existing = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;
  const { id, isNew } = resolveAnonymousSessionId(existing);

  if (isNew) {
    cookieStore.set(
      ANONYMOUS_SESSION_COOKIE,
      id,
      anonymousSessionCookieOptions(),
    );
  }

  return { type: "anonymous", anonSessionId: id };
}
