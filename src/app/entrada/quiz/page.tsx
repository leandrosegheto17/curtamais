// L6-T06 — Página T03a-d (rota do wizard do quiz guiado, RF-03).
//
// Rota `/entrada/quiz`, seguindo o namespace já estabelecido por L6-T02
// (`/entrada/data-livre`) e referenciado por L6-T01 (`/entrada/quiz` em
// `src/app/page.tsx`) — nenhuma lógica de fluxo além de renderizar
// `QuizWizard`; a Server Action que gera o range de datas a partir das
// respostas (RF-03.2) é escopo de L6-T07, ainda não implementada.
"use client";

import { useState } from "react";

import { QuizWizard, type QuizAnswers } from "@/components/quiz/quiz-wizard";

export default function QuizPage() {
  const [completedAnswers, setCompletedAnswers] = useState<QuizAnswers | null>(
    null,
  );

  if (completedAnswers) {
    // Escopo desta tarefa termina aqui: gerar o range de datas a partir das
    // respostas (RF-03.2) é responsabilidade de L6-T07 (Server Action, ainda
    // não implementada) — hoje só confirmamos que as respostas foram
    // coletadas.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="font-serif text-2xl text-foreground">
          Respostas registradas
        </h1>
        <p className="max-w-md text-sm text-foreground-muted">
          Obrigado! As próximas etapas (gerar as datas sugeridas a partir do
          período informado) ainda estão em construção.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <QuizWizard onComplete={setCompletedAnswers} />
    </main>
  );
}
