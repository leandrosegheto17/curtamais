"use client";

// L7-T04 — Tela T05 (Confirmação de destino, RF-11, UX-SPEC.md Seção 2/4).
//
// Tela curta, single-purpose (UX-SPEC): nome do destino em destaque + dois
// botões ("Confirmar e continuar" / "Trocar destino"). SEMPRE aparece,
// independentemente de o destino ter vindo de T01/T02/T03 (informado
// manualmente pelo usuário, RF-01.3/RF-02.3/RF-03.2 — já persistido como
// `destino_confirmado` pelos helpers de L6-T03/L6-T05/L6-T07) ou de T04
// (aprovação de uma sugestão da IA, RF-04.3, L7-T03) — este componente é
// agnóstico da origem: recebe só `destino`/`sessionId`/`currentState` já
// resolvidos pelo chamador (Diretriz de Implementação 3 do TASK.md — nenhuma
// navegação/decisão de fluxo client-side, só apresentação + delegação da ação
// ao servidor).
//
// Escopo explícito desta tarefa (L7-T04, FE): só a UI. A Server Action real
// de confirmar/trocar é L7-T05 (rodando em paralelo no mesmo lote) — como
// ainda não existia nenhuma implementação pronta no momento desta tarefa,
// este componente foi montado contra a interface que se espera dela
// (`ConfirmarOuTrocarDestinoAction`, abaixo): recebe `{ sessionId }`, resolve
// de forma assíncrona, e pode lançar em caso de falha. `onConfirmar`/
// `onTrocar` são props opcionais — o mesmo padrão já usado por
// `T01DateRangeForm`/`onValid` (L6-T02): a tela renderiza e funciona de
// ponta a ponta (foco, estados, acessibilidade) mesmo sem a Server Action
// real acoplada ainda; quando ausentes, os botões permanecem clicáveis mas
// não fazem nada (aguardando integração, sem fingir uma transição que o
// servidor não confirmou — Diretriz de Implementação 3). Nenhuma Server
// Action foi implementada aqui (fora de escopo, ver L7-T05).
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import type { SessionFlowState } from "@/lib/session-flow/state-machine";
import { cn } from "@/lib/utils";

/** Interface esperada da Server Action de L7-T05 (ainda não implementada no
 * momento desta tarefa) — ambas as ações recebem só o `sessionId` (o servidor
 * é quem sabe qual destino está pendente de confirmação para essa sessão,
 * Diretriz de Implementação 3: nenhum dado de negócio decidido no client). O
 * formato exato do retorno (`proximaEtapa`/`flowState`) segue o mesmo padrão
 * já usado por `submeterDataLivre` (L6-T03, `src/lib/actions/data-livre.ts`),
 * mas este componente não depende de nenhum campo específico do retorno —
 * só espera a Promise resolver (sucesso) ou rejeitar (falha). */
export type ConfirmarOuTrocarDestinoAction = (input: {
  sessionId: string;
}) => Promise<unknown>;

export interface DestinoConfirmacaoScreenProps {
  /** Id da `TripSession` corrente — vem do servidor, nunca decidido no client. */
  sessionId: string;
  /** Nome do destino a confirmar, já resolvido pelo chamador (T01/T02/T03 ou T04 aprovado). */
  destino: string;
  /**
   * Estado atual da sessão (ADR-006), só para o `StepperProgress` — a tela
   * de confirmação é mostrada com o destino já `destino_confirmado`
   * (aprovado/persistido), mas ainda não avançado para hospedagem.
   */
  currentState?: SessionFlowState;
  /** Ação de "Confirmar e continuar" (RF-11) — ver `ConfirmarOuTrocarDestinoAction` acima. */
  onConfirmar?: ConfirmarOuTrocarDestinoAction;
  /** Ação de "Trocar destino" (RF-11) — ver `ConfirmarOuTrocarDestinoAction` acima. */
  onTrocar?: ConfirmarOuTrocarDestinoAction;
  className?: string;
}

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

/**
 * Tela T05 — Confirmação de destino (UX-SPEC.md Seção 2/4, RF-11). Foco vai
 * para o título ao montar (UX-SPEC §5, Diretriz de Implementação 10). Cada
 * botão entra em estado de "processando" (distinto do `LoadingStream` de
 * geração, UX-SPEC §7) enquanto aguarda a confirmação do servidor — nunca
 * navega/assume sucesso antes disso (Diretriz de Implementação 3). Erro de
 * ação usa ícone + texto (`role="alert"`), nunca só cor (UX-SPEC §5).
 */
export function DestinoConfirmacaoScreen({
  sessionId,
  destino,
  currentState = "destino_confirmado",
  onConfirmar,
  onTrocar,
  className,
}: DestinoConfirmacaoScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "confirmar" | "trocar" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function runAction(
    action: ConfirmarOuTrocarDestinoAction | undefined,
    which: "confirmar" | "trocar",
  ) {
    setError(null);
    if (!action) {
      return;
    }
    setPendingAction(which);
    startTransition(async () => {
      try {
        await action({ sessionId });
      } catch {
        setError(GENERIC_ERROR_MESSAGE);
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 sm:px-6",
        className,
      )}
    >
      <StepperProgress currentState={currentState} />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Confirme seu destino
      </h1>

      <p className="font-serif text-3xl leading-tight text-accent">
        {destino}
      </p>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="default"
          className="min-h-11 flex-1"
          onClick={() => runAction(onConfirmar, "confirmar")}
          disabled={isPending}
          aria-busy={pendingAction === "confirmar"}
        >
          {pendingAction === "confirmar"
            ? "Confirmando..."
            : "Confirmar e continuar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          onClick={() => runAction(onTrocar, "trocar")}
          disabled={isPending}
          aria-busy={pendingAction === "trocar"}
        >
          {pendingAction === "trocar" ? "Trocando..." : "Trocar destino"}
        </Button>
      </div>
    </main>
  );
}
