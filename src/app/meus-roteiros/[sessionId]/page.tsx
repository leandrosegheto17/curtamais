// V2-L8-T05 — Rota T-MEUS-DET (`/meus-roteiros/[sessionId]`, RF-17.5,
// UX-SPEC.md §8.2 "T-MEUS-DET — Roteiro salvo"). Server Component fino:
// resolve `sessionId` do path param, busca o resumo (reaproveitando
// `obterResumoEncerramento`, L12-T04 — MESMA leitura já usada por T-END,
// nenhuma Server Action nova criada aqui) e, quando a sessão está
// `concluida`, chama `obterRoteiroLeitura` (V2-L8-T03) para os dias do
// roteiro em modo leitura.
//
// Posse/guard: `obterResumoEncerramento` já chama `assertSessionOwnership`
// (alias de `assertSessionAccess(..., { exigeConta: false })`) e lança
// `SessionNotFoundError` para toda negação de posse (sessão inexistente OU
// de outra conta — SEMPRE 404 lógico, nunca 403, ADR-008/ADR-009). Como toda
// sessão listada em "Meus roteiros" (`V2-L8-T01`/`listarMeusRoteiros`) já
// tem `userId` vinculado, a diferença entre `exigeConta: false` (usado aqui)
// e `exigeConta: true` (usado por `obterRoteiroLeitura`, V2-L8-T03) nunca se
// manifesta na prática para este caminho — a tabela de 5 casos do ADR-009
// item 2 só distingue os dois quando o registro ainda é anônimo
// (`anonSessionId`), o que não é o caso de nenhuma sessão alcançável por
// esta rota. Ainda assim, quando `flowState === "concluida"`, esta rota
// também chama `obterRoteiroLeitura` (que usa `exigeConta: true`) para os
// dias — se por algum motivo ela devolver `{ status: "conta_necessaria" }`
// (caminho não esperado na prática, ver cabeçalho de
// `obter-roteiro-leitura.ts`), o comportamento mais seguro é tratar como
// negação de acesso e voltar para `/meus-roteiros` com o mesmo aviso, em vez
// de renderizar uma tela quebrada.
//
// Aviso na negação de posse (UX-SPEC.md §8.4, linha T-MEUS-DET, "Sessão não
// encontrada ou de outra conta: volta a T-MEUS com o aviso 'Não encontrei
// essa viagem.'"): `redirect("/meus-roteiros?erro=sessao-nao-encontrada")` —
// o texto exato do aviso ("Não encontrei essa viagem.") é responsabilidade
// da tela T-MEUS (`V2-L8-T04`, outra instância em paralelo, NÃO editada por
// esta tarefa) ler o parâmetro `erro` e exibir; esta rota só sinaliza a
// razão via querystring, formato razoável definido aqui na ausência de um
// contrato explícito de parâmetro no UX-SPEC.md.
import { redirect } from "next/navigation";

import { obterResumoEncerramento } from "@/lib/actions/encerramento";
import { obterRoteiroLeitura } from "@/lib/actions/obter-roteiro-leitura";
import { rotuloDaSessao } from "@/lib/actions/meus-roteiros-label";
import { SessionNotFoundError } from "@/lib/session-flow";
import { RoteiroSalvoScreen } from "@/components/meus-roteiros/roteiro-salvo-screen";
import type { RoteiroDayResult } from "@/lib/actions/obter-roteiro-leitura";

const REDIRECT_SESSAO_NAO_ENCONTRADA =
  "/meus-roteiros?erro=sessao-nao-encontrada";

export interface RoteiroSalvoPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function RoteiroSalvoPage({
  params,
}: RoteiroSalvoPageProps) {
  const { sessionId } = await params;

  let resumo;
  try {
    resumo = await obterResumoEncerramento(sessionId);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      redirect(REDIRECT_SESSAO_NAO_ENCONTRADA);
    }
    throw error;
  }

  const isComplete = resumo.roteiroAprovado === true;
  const flowState = isComplete ? "concluida" : "encerrada_parcial";
  const hasActivityApproval = (resumo.passeios?.length ?? 0) > 0;
  const hasAccommodationApproval = resumo.hospedagem !== null;
  const statusLabel = rotuloDaSessao({
    flowState,
    hasActivityApproval,
    hasAccommodationApproval,
  });
  const etapaEncerrada = hasActivityApproval
    ? "passeios"
    : hasAccommodationApproval
      ? "hospedagem"
      : "destino";

  // Sem roteiro completo (`encerrada_parcial`): não há dias para buscar
  // (UX-SPEC.md §8.2 T-MEUS-DET, "Se encerrada sem roteiro: só o resumo") —
  // `obterRoteiroLeitura` não é chamada neste caso (evita leitura
  // desnecessária de `ItineraryItem`).
  let dias: RoteiroDayResult[] | null = null;
  if (isComplete) {
    const roteiro = await obterRoteiroLeitura(sessionId);
    if (Array.isArray(roteiro)) {
      dias = roteiro;
    } else {
      // `{ status: "conta_necessaria" }` — caminho não esperado na prática
      // para sessões vinculadas a conta (ver cabeçalho do arquivo), mas
      // tratado como negação de acesso em vez de quebrar a tela.
      redirect(REDIRECT_SESSAO_NAO_ENCONTRADA);
    }
  }

  return (
    <RoteiroSalvoScreen
      flowState={flowState}
      resumo={resumo}
      statusLabel={statusLabel}
      dias={dias}
      etapaEncerrada={etapaEncerrada}
    />
  );
}
