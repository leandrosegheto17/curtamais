// V2-L7-T05 — Rota da tela T-LOGIN (UX-SPEC.md §8, RF-17.7): "Entre para ver
// seus roteiros". Tela standalone, sem sessão de viagem em andamento — não
// recebe nem repassa `sessionId` de `TripSession` (diferente de T-GATE,
// V2-L7-T04, que amarra a uma sessão anônima existente).
//
// Server Component fino: só valida `retorno` contra a allowlist EXATA (RN de
// proteção contra open redirect — nenhum outro destino, absoluto ou não, é
// aceito) e delega toda a interatividade para o client wrapper `LoginScreen`.
//
// `RETORNO_ALLOWLIST`/`RETORNO_PADRAO`/`resolveRetorno` moraram aqui antes
// (RL-V2-L7-T01); foram movidos para `src/lib/auth/retorno-allowlist.ts`
// porque o App Router só permite exports específicos (`default`, `config`,
// etc.) de um `page.tsx` — exportar valores/funções extras quebra o contrato
// de tipos gerado (`.next/types/app/entrar/page.ts`) e o build de produção.
import { resolveRetorno } from "@/lib/auth/retorno-allowlist";

import { LoginScreen } from "./login-screen";

interface EntrarPageProps {
  searchParams: Promise<{
    retorno?: string;
  }>;
}

export default async function EntrarPage({ searchParams }: EntrarPageProps) {
  const { retorno } = await searchParams;
  const retornoValidado = resolveRetorno(retorno);

  return <LoginScreen retorno={retornoValidado} />;
}
