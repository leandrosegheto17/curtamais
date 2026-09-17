// V2-L7-T04 — Rota T-GATE (`/cadastro?sessionId=`, RF-16, RNF-13, ADR-009
// item 3, UX-SPEC.md §8.2 "T-GATE"). Server Component fino: só resolve
// `sessionId` da querystring, confirma posse da `TripSession` (guard central,
// `assertSessionAccess` com `exigeConta: false` — T-GATE é justamente onde um
// solicitante SEM conta chega, então esta rota nunca deve ela mesma exigir
// conta para renderizar), resolve o estado terminal/contexto de destino e
// delega toda a interatividade (alternância cadastro/entrar, orquestração de
// `criarConta`+`signIn`+`vincularSessaoAConta`, saídas) para `CadastroClient`
// (wrapper "use client").
//
// Guardas (critério de aceite desta tarefa):
// - `sessionId` ausente ou sessão inexistente/de outra conta → redirect `/`
//   (mesmo padrão 404-via-redirect já usado por `ConfirmacaoDestinoPage`/
//   `EncerramentoPage`: `assertSessionAccess` lança `SessionNotFoundError`
//   para toda negação de posse, nunca 403 — ver
//   `src/lib/session-flow/authorization.ts`).
// - `flowState` já terminal (`concluida`/`encerrada_parcial`) → redirect para
//   T-END (`/encerramento?sessionId=&flowState=`), mesmo raciocínio de
//   `EncerramentoPage`: nada a decidir aqui, a viagem já foi encerrada por
//   outro caminho (ex.: duas abas).
// - Vínculo/criação de conta NUNCA acontece neste Server Component (GET) —
//   só em resposta a clique explícito dentro de `CadastroClient` (Diretriz de
//   Implementação 3 do TASK.md + critério de aceite desta tarefa).
//
// "Já autenticado" (item 7 do UX-SPEC): resolvido aqui, no servidor, via
// `getServerSession(authOptions)` — evita a necessidade de `SessionProvider`/
// `useSession` no client (o projeto ainda não monta nenhum `SessionProvider`
// em `src/app/layout.tsx`; `signIn`/`signOut` de `next-auth/react` funcionam
// sem ele, mas `useSession` precisaria dele). O e-mail da conta autenticada
// (se houver) é passado como prop simples para `CadastroClient` decidir o
// sub-estado "Você está na conta {e-mail}."
//
// "Voltar" (item 8): leva a T05 (`/destino/confirmacao`) — resolvido aqui via
// `rotaDaEtapa("destino_confirmado", sessionId, destino)` (mesma fonte única
// de mapeamento estado → tela já usada por `vincularSessaoAConta`,
// V2-L7-T02) e passado pronto como `voltarHref`. Calculado no servidor (não
// no client) porque `rotaDaEtapa` vive no barrel `@/lib/session-flow`, que
// também reexporta funções server-only (`assertSessionAccess`, que depende
// de `next/headers`) — importar o barrel de dentro de um Client Component
// arriscaria puxar essas dependências para o bundle do cliente.
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertSessionAccess,
  isTerminalSessionFlowState,
  rotaDaEtapa,
  SessionNotFoundError,
} from "@/lib/session-flow";
import { CadastroClient } from "./cadastro-client";

export interface CadastroPageProps {
  searchParams: Promise<{ sessionId?: string }>;
}

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function formatarPeriodo(
  inicio: Date | null,
  fim: Date | null,
): string | null {
  if (!fim) {
    return null;
  }
  if (!inicio) {
    return formatarData(fim);
  }
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

export default async function CadastroPage({
  searchParams,
}: CadastroPageProps) {
  const { sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/");
  }

  const tripSession = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      flowState: true,
      userId: true,
      anonSessionId: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      destinationApproval: { select: { name: true } },
    },
  });

  try {
    // T-GATE nunca exige conta para renderizar a si mesma — é justamente a
    // tela para quem ainda não tem uma (`exigeConta: false`, ao contrário das
    // demais rotas do lote V2-L6-T04..T08).
    await assertSessionAccess(sessionId, tripSession, { exigeConta: false });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      redirect("/");
    }
    throw error;
  }

  // `assertSessionAccess` já teria lançado `SessionNotFoundError` (capturado
  // acima) se `tripSession` fosse `null` — non-null seguro daqui em diante.
  const session = tripSession!;

  if (isTerminalSessionFlowState(session.flowState)) {
    const params = new URLSearchParams({
      sessionId,
      flowState: session.flowState,
    });
    redirect(`/encerramento?${params.toString()}`);
  }

  const authSession = await getServerSession(authOptions);
  const contaAutenticadaEmail = authSession?.user?.email ?? null;

  const destino = session.destinationApproval?.name ?? null;
  const periodo = formatarPeriodo(session.dateRangeStart, session.dateRangeEnd);
  const voltarHref = rotaDaEtapa(
    "destino_confirmado",
    sessionId,
    destino ?? undefined,
  );

  return (
    <CadastroClient
      sessionId={sessionId}
      destino={destino}
      periodo={periodo}
      contaAutenticadaEmail={contaAutenticadaEmail}
      voltarHref={voltarHref}
    />
  );
}
