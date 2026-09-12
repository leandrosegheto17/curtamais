// L12-T05 — Rota `/encerramento` (tela T-END, Encerramento/Resumo, RN-03,
// UX-SPEC.md Seção 2). Server Component fino: resolve `sessionId`/
// `flowState` da querystring, chama `obterResumoEncerramento` (L12-T04) e
// monta `EncerramentoScreen` (L10-T04) com o resumo já resolvido.
//
// Diferente das demais rotas do lote (`/destino`, `/hospedagem`,
// `/passeios`, `/roteiro`), a busca de dados acontece aqui mesmo, no Server
// Component — `EncerramentoScreen` é uma tela de apresentação pura (não
// busca dados por conta própria, ver cabeçalho de
// `src/components/encerramento/encerramento-screen.tsx`) e
// `obterResumoEncerramento` é uma Server Action async que pode ser chamada
// diretamente daqui, sem client wrapper.
//
// `flowState` é OBRIGATÓRIO nesta rota (diferente do default seguro de
// `ConfirmacaoDestinoPage`, L7-T04) e restrito aos dois únicos estados
// terminais que chegam a esta tela (RN-03): `concluida` (roteiro aprovado,
// RF-09) ou `encerrada_parcial` (encerramento antecipado). Um valor
// ausente/fora desse conjunto não tem rótulo correspondente para exibir —
// volta ao início em vez de renderizar uma tela quebrada, mesmo raciocínio
// de guarda das demais rotas deste lote.
//
// Sessão inexistente ou não pertencente ao requisitante
// (`SessionNotFoundError`, lançado por `obterResumoEncerramento` via
// `assertSessionOwnership`, L11-T02 — sempre 404, nunca 403) recebe o mesmo
// tratamento: não há o que mostrar sem sessão válida, `redirect("/")`.
import { redirect } from "next/navigation";

import { obterResumoEncerramento } from "@/lib/actions/encerramento";
import { SessionNotFoundError } from "@/lib/session-flow";
import {
  EncerramentoScreen,
  type EncerramentoFlowState,
} from "@/components/encerramento/encerramento-screen";

const VALID_FLOW_STATES: readonly EncerramentoFlowState[] = [
  "concluida",
  "encerrada_parcial",
];

function isValidFlowState(
  value: string | undefined,
): value is EncerramentoFlowState {
  return (
    value !== undefined &&
    (VALID_FLOW_STATES as readonly string[]).includes(value)
  );
}

export interface EncerramentoPageProps {
  searchParams: Promise<{
    sessionId?: string;
    flowState?: string;
  }>;
}

export default async function EncerramentoPage({
  searchParams,
}: EncerramentoPageProps) {
  const { sessionId, flowState } = await searchParams;

  if (!sessionId || !isValidFlowState(flowState)) {
    redirect("/");
  }

  try {
    const resumo = await obterResumoEncerramento(sessionId);
    return <EncerramentoScreen flowState={flowState} resumo={resumo} />;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      redirect("/");
    }
    throw error;
  }
}
