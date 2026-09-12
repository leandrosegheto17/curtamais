// L6-T06 — Página T03a-d (rota do wizard do quiz guiado, RF-03).
//
// Rota `/entrada/quiz`, seguindo o namespace já estabelecido por L6-T02
// (`/entrada/data-livre`) e referenciado por L6-T01 (`/entrada/quiz` em
// `src/app/page.tsx`).
//
// RL6-T04 (Bloqueio 006, `.md/BLOCKERS.md`): conecta `onComplete` de
// `QuizWizard` (L6-T06) à Server Action real `submitQuizAnswers` (L6-T07,
// `@/lib/actions/quiz`), substituindo a tela estática de placeholder que só
// confirmava a coleta das respostas sem persistir nada no servidor. Mesmo
// padrão de estado de pendência/erro acessível já usado em RL6-T02/RL6-T03
// (`aria-busy` no botão em progresso, `role="alert"` com ícone+texto em
// falha) e de `DestinoConfirmacaoScreen` (L7-T04) — nenhuma navegação
// client-side otimista antes da confirmação do servidor (Diretriz de
// Implementação 3 do TASK.md).
//
// Diferença desta tarefa em relação a RL6-T02/RL6-T03: o quiz nunca coleta
// destino (RF-03.1, ver cabeçalho de `submitQuizAnswers`), então a sessão
// criada aqui NUNCA produz `flowState !== "destino_pendente"` — não há ramo
// `confirmacao_destino` a tratar neste arquivo (ao contrário de T01/T02, que
// podem receber um destino já digitado pelo usuário).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { QuizWizard, type QuizAnswers } from "@/components/quiz/quiz-wizard";
import { Button } from "@/components/ui/button";
import { submitQuizAnswers } from "@/lib/actions/quiz";

const GENERIC_ERROR_MESSAGE = "Não conseguimos concluir agora. Tente novamente.";

export default function QuizPage() {
  const router = useRouter();
  // As respostas ficam guardadas assim que o wizard é concluído (`onComplete`)
  // para permitir "Tentar novamente" em caso de falha da Server Action, sem
  // obrigar o usuário a refazer as 4 perguntas (mesmo raciocínio de manter o
  // formulário montado em RL6-T02, `data-livre/page.tsx`) — `QuizWizard`
  // some da tela assim que as respostas são submetidas, dando lugar ao
  // estado de pendência/erro.
  const [submittedAnswers, setSubmittedAnswers] = useState<QuizAnswers | null>(
    null,
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(answers: QuizAnswers) {
    setError(null);
    setIsPending(true);
    try {
      const result = await submitQuizAnswers(answers);
      // O quiz nunca coleta destino (RF-03.1) — a sessão sempre avança para
      // `destino_pendente` (RF-04), nunca para `destino_confirmado`; não há
      // ramo `confirmacao_destino` a navegar aqui (ver cabeçalho de
      // `submitQuizAnswers`, `@/lib/actions/quiz`).
      router.push(`/destino?sessionId=${result.sessionId}`);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setIsPending(false);
    }
  }

  function handleComplete(answers: QuizAnswers) {
    setSubmittedAnswers(answers);
    void submit(answers);
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8"
      aria-busy={isPending}
    >
      {error && (
        <div
          role="alert"
          className="flex w-full max-w-md items-center gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {submittedAnswers ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="max-w-md text-sm text-foreground-muted">
            {isPending
              ? "Enviando suas respostas..."
              : "Não foi possível enviar suas respostas."}
          </p>
          {!isPending && (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void submit(submittedAnswers)}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      ) : (
        <QuizWizard onComplete={handleComplete} />
      )}
    </main>
  );
}
