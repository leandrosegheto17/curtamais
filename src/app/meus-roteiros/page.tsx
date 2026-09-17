// V2-L8-T04 — Rota T-MEUS (`/meus-roteiros`, RF-17, UX-SPEC.md §8 "T-MEUS").
//
// Server Component fino: confirma autenticação via `getServerSession` — sem
// conta, `redirect("/entrar?retorno=/meus-roteiros")` (o mesmo padrão de
// allowlist de `retorno` já usado por T-LOGIN, `src/app/entrar/page.tsx`,
// aceita `/meus-roteiros`). Com conta, chama `listarMeusRoteiros()`
// (V2-L8-T01, `@/lib/actions/meus-roteiros`) — que também resolve o
// `userId` só pela sessão do servidor — e passa o e-mail da conta e o
// resultado já pronto para o client component.
//
// Por que checar a sessão aqui TAMBÉM (em vez de confiar só no
// `status: "nao_autenticado"` de `listarMeusRoteiros`): esta rota precisa do
// e-mail da conta para o rodapé ("Sua conta: {e-mail}", UX-SPEC §8.2), que
// `listarMeusRoteiros` não devolve — a chamada a `getServerSession` já
// estava sendo feita de qualquer forma, então o redirect explícito aqui
// evita depender implicitamente do formato de retorno da Server Action para
// a decisão de navegação (Server Component decide a navegação, a Server
// Action só serve dado).
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { listarMeusRoteiros } from "@/lib/actions/meus-roteiros";
import { MeusRoteirosClient } from "./meus-roteiros-client";

export default async function MeusRoteirosPage() {
  const authSession = await getServerSession(authOptions);
  const email = authSession?.user?.email ?? null;

  if (!authSession?.user?.id) {
    redirect("/entrar?retorno=/meus-roteiros");
  }

  const resultado = await listarMeusRoteiros();

  // Defensivo: `listarMeusRoteiros` resolve a mesma identidade de sessão do
  // servidor que já checamos acima — `nao_autenticado` aqui não deveria
  // ocorrer (o redirect acima já teria disparado), mas o guard central desta
  // função não assume o contexto de quem chama; trata como sem sessão em vez
  // de deixar `sessoes` undefined vazar para o client.
  const sessoes = resultado.status === "ok" ? resultado.sessoes : [];

  return <MeusRoteirosClient sessoes={sessoes} email={email} />;
}
