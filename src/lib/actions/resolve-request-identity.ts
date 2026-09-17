// V2-L6-T02 — ADR-009 item 2: identidade BRUTA da requisição corrente, como
// um PAR `{ userId, anonSessionId }`, sem decidir qual dos dois "vence".
//
// Diferença de propósito em relação a `resolveSessionOwner`
// (`./resolve-session-owner.ts`, ADR-008 item 3, MVP): aquela função resolve
// por PRECEDÊNCIA (conta autenticada sobre cookie anônimo) e é usada
// exclusivamente na CRIAÇÃO de uma `TripSession` nova — ela continua
// existindo, sem alteração, e nenhuma linha dela é tocada aqui (ADR-009,
// cabeçalho: "os itens 1 a 3 do ADR-008 continuam valendo"). `resolveRequestIdentity`
// é para LEITURA/verificação de posse de uma sessão já existente — o guard
// central (`V2-L6-T03`, `assertSessionAccess`) e o vínculo de conta
// (`V2-L7-T02`, `vincularSessaoAConta`) decidem depois, cada um com sua
// própria regra (ADR-009 item 2, tabela de 5 casos; item 3), qual identidade
// importa para aquele caso — não esta função.
//
// Reaproveita as MESMAS leituras de cookie/sessão já usadas por
// `resolveSessionOwner` (nenhuma lógica de acesso a `getServerSession`/cookie
// é duplicada aqui):
// - `getServerSession(authOptions)` — mesmo padrão do projeto.
// - `cookies().get(ANONYMOUS_SESSION_COOKIE)` — mesma constante de
//   `@/lib/anonymous-session` usada por `resolveSessionOwner`/pelo
//   middleware.
//
// Diferença deliberada: aqui a leitura do cookie é passiva. Se o cookie
// anônimo não existir, `anonSessionId` é `null` — nenhum id novo é gerado,
// nenhum `cookies().set(...)` é chamado. Criar um cookie novo é
// responsabilidade exclusiva do fluxo de CRIAÇÃO de sessão
// (`resolveSessionOwner`)/do middleware; uma leitura/verificação nunca tem
// esse efeito colateral.
//
// Verificação de conta ainda existir (ADR-009, Consequências, último
// parágrafo): o JWT do NextAuth permanece válido até expirar mesmo depois de
// a conta ser excluída (`account-deletion.ts` apaga o `User` e as sessões
// dele). Por isso `userId` só é devolvido depois de confirmar, com uma
// consulta por chave primária, que o `User` ainda existe — sem essa
// confirmação, um JWT "órfão" (de conta já excluída) continuaria sendo
// tratado como identidade de conta válida, permitindo criar/vincular
// sessões novas com um `user_id` inexistente. Quando o `User` não existe
// mais, a requisição é tratada como sem conta (`userId: null`), nunca
// lançando erro.

import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMOUS_SESSION_COOKIE } from "@/lib/anonymous-session";

export interface RequestIdentity {
  userId: string | null;
  anonSessionId: string | null;
}

/**
 * Resolve o PAR bruto de identidade da requisição corrente — nunca decide
 * qual das duas "vence" (ver cabeçalho deste arquivo). Não tem efeito
 * colateral: não cria nem regrava nenhum cookie.
 */
export async function resolveRequestIdentity(): Promise<RequestIdentity> {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id ?? null;

  let userId: string | null = null;
  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true },
    });
    userId = user ? user.id : null;
  }

  const cookieStore = await cookies();
  const anonSessionId =
    cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value ?? null;

  return { userId, anonSessionId };
}
