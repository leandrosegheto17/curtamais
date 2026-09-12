// L7-T04 — Rota da tela T05 (Confirmação de destino, RF-11, UX-SPEC.md Seção
// 1/2). Server Component fino: valida os parâmetros recebidos e delega toda
// a interatividade para `ConfirmacaoDestinoClient` (wrapper "use client" que
// acopla a Server Action real de L7-T05, `confirmarDestino`).
//
// Convenção de rota (decisão desta tarefa — não havia namespace prévio para
// as telas de destino em `SDD.md`/`UX-SPEC.md`; o Lote 7 introduz as
// primeiras rotas fora de `/entrada/...`): `/destino/confirmacao`, espelhando
// o identificador `proximaEtapa: "confirmacao_destino"` já usado por
// `submeterDataLivre` (L6-T03, `src/lib/actions/data-livre.ts`) e pelos
// helpers irmãos de L6-T05/L6-T07 (`createSessionWithDateRange`)/L7-T03
// (`aprovarDestinoSugerido`/`informarDestinoManualmente`,
// `src/lib/actions/destino.ts`). Uma futura rota `/destino` (T04, sugestões —
// L7-T02, tarefa paralela) deve manter o mesmo prefixo `/destino/...` por
// consistência, mas essa decisão pertence àquela instância.
//
// `sessionId`/`destino` chegam via querystring (RF-11: "recebido via
// prop/query de onde a tela é montada") — quem redireciona para esta rota
// (T01/T02/T03 com destino informado manualmente, ou T04 com uma sugestão
// aprovada) é responsável por montar essa querystring a partir do resultado
// já persistido no servidor (Diretriz de Implementação 3 — o nome exibido
// aqui é só apresentação de um dado já confirmado pelo servidor, não uma
// decisão de negócio tomada no client); nenhuma dessas telas de origem ainda
// navega de fato para cá (integração cross-lote fora do escopo desta tarefa,
// mesmo padrão já registrado nas notas de L6-T02/L6-T03). `flowState` é
// opcional e só ajusta o `StepperProgress`; um valor ausente/inválido usa o
// default seguro `destino_confirmado` (único estado em que esta tela deveria
// aparecer, RF-11).
import { redirect } from "next/navigation";

import { ConfirmacaoDestinoClient } from "./confirmacao-destino-client";
import {
  SESSION_FLOW_STATES,
  type SessionFlowState,
} from "@/lib/session-flow/state-machine";

export interface ConfirmacaoDestinoPageProps {
  searchParams: Promise<{
    sessionId?: string;
    destino?: string;
    flowState?: string;
  }>;
}

function resolveFlowState(value: string | undefined): SessionFlowState {
  if (
    value &&
    (SESSION_FLOW_STATES as readonly string[]).includes(value)
  ) {
    return value as SessionFlowState;
  }
  return "destino_confirmado";
}

export default async function ConfirmacaoDestinoPage({
  searchParams,
}: ConfirmacaoDestinoPageProps) {
  const { sessionId, destino, flowState } = await searchParams;

  // T05 é "single-purpose": sem sessionId/destino não há o que confirmar
  // (ex.: acesso direto à URL sem passar pelo fluxo) — volta ao início em vez
  // de renderizar uma tela quebrada/sem dado (Diretriz de Implementação 3:
  // nenhuma transição de etapa é simulada sem confirmação do servidor).
  if (!sessionId || !destino) {
    redirect("/");
  }

  return (
    <ConfirmacaoDestinoClient
      sessionId={sessionId}
      destino={destino}
      currentState={resolveFlowState(flowState)}
    />
  );
}
