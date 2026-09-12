"use client";

// L7-T04 — Wrapper client da rota T05 (Confirmação de destino, RF-11).
//
// Separado de `page.tsx` (Server Component, valida `searchParams`/redireciona)
// porque a integração real precisa de duas coisas só disponíveis em Client
// Component: (1) chamar as Server Actions `confirmarDestino`/`trocarDestino`
// (L7-T05, `@/lib/actions/confirmacao-destino`) diretamente como props de
// `DestinoConfirmacaoScreen`; (2) `useRouter` (`next/navigation`) para
// navegar de volta à tela de origem depois que o servidor confirmar a
// transição de "Trocar destino".
//
// "Trocar destino" (retomada de 2026-09-10, Bloqueio 002 resolvido como
// ADR-006 Adendo 2 — ver `.md/TASK.md`, Seção 3, Lote 7, nota de
// bloqueio/resolução): agora chama a Server Action real `trocarDestino`
// (mesmo padrão de `onConfirmar`/`confirmarDestino`), que delega para
// `applySessionFlowTransition({ action: "revisar" })` no servidor —
// transição regressiva real `destino_confirmado` → `destino_pendente`, que
// também apaga a `DestinationApproval` já aprovada. Só depois da Promise
// resolver (confirmação do servidor) é que este wrapper navega de volta à
// tela de origem com `router.back()`; em caso de falha, a própria
// `DestinoConfirmacaoScreen` (`runAction`) captura o erro e mostra a
// mensagem acessível, sem navegar (Diretriz de Implementação 3 — nenhuma
// navegação otimista/client-side antes da confirmação do servidor).
//
// RL7-T01 (Refatoração Lote-7, Bloqueio 006 resolvido — ver `.md/BLOCKERS.md`
// e `.md/TASK.md`, seção "Refatoração Lote-7"): `onConfirmar` deixou de ser
// `confirmarDestino` diretamente e virou o mesmo tipo de wrapper já usado por
// `onTrocar` acima — chama `confirmarDestino({ sessionId })` e só depois da
// Promise resolver navega via `router.push` para `/hospedagem` (rota real
// desde L12-T01), com `sessionId`/`flowState` na querystring, mesmo padrão
// de `HospedagemSugestoesScreen.handleContinuar` (L8-T02,
// `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`). Em caso de
// falha, `runAction` já cobre a mensagem acessível sem navegar — nenhuma
// navegação otimista antes da confirmação do servidor (Diretriz de
// Implementação 3).
import { useRouter } from "next/navigation";

import { DestinoConfirmacaoScreen } from "@/components/destino/destino-confirmacao-screen";
import {
  confirmarDestino,
  trocarDestino,
} from "@/lib/actions/confirmacao-destino";
import type { SessionFlowState } from "@/lib/session-flow/state-machine";

export interface ConfirmacaoDestinoClientProps {
  sessionId: string;
  destino: string;
  currentState: SessionFlowState;
}

export function ConfirmacaoDestinoClient({
  sessionId,
  destino,
  currentState,
}: ConfirmacaoDestinoClientProps) {
  const router = useRouter();

  return (
    <DestinoConfirmacaoScreen
      sessionId={sessionId}
      destino={destino}
      currentState={currentState}
      onConfirmar={async (input) => {
        const result = await confirmarDestino(input);
        const params = new URLSearchParams({
          sessionId: input.sessionId,
          flowState: "hospedagem_pendente",
        });
        router.push(`/hospedagem?${params.toString()}`);
        return result;
      }}
      onTrocar={async (input) => {
        const result = await trocarDestino(input);
        router.back();
        return result;
      }}
    />
  );
}
