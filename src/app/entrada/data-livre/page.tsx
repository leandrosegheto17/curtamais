// L6-T02 — T01 (Data livre, RF-01). Página estática que só renderiza o
// título da etapa + o formulário (`T01DateRangeForm`); nenhuma Server Action
// era chamada aqui ainda (L6-T03, dependente desta tarefa, não iniciada) — o
// `onValid` ficava sem handler de propósito, para não simular uma
// navegação/persistência que ainda não existia (Diretriz de Implementação 3:
// nenhuma navegação client-side otimista).
//
// L11-T04 — RL: componente convertido para client component só para poder
// gerenciar foco explicitamente na transição de entrada para esta etapa
// (UX-SPEC.md §5/ADR-006), mesmo padrão já usado nas demais telas do fluxo
// (`FeriadosScreen`, `QuizWizard`, `DestinoSugestoesScreen` etc.): o título
// recebe foco ao montar, em vez de deixar o foco "perdido" no link de T00
// depois da navegação client-side do App Router.
//
// RL6-T02 (Bloqueio 006, resolvido) — conecta finalmente `onValid` de
// `T01DateRangeForm` à Server Action real `submeterDataLivre` (L6-T03,
// `@/lib/actions/data-livre`) e à navegação pós-confirmação do servidor,
// mesmo padrão de estado de pendência/erro acessível já usado por
// `DestinoConfirmacaoScreen` (L7-T04, `runAction`) e de `router.push` com
// querystring já usado por `HospedagemSugestoesScreen.handleContinuar`/
// `handleEncerrarAqui` (L8-T02): a Server Action é chamada primeiro, e só
// depois da Promise resolver (confirmação do servidor) é que este componente
// navega — nunca antes (Diretriz de Implementação 3 do TASK.md, item 3:
// nenhuma navegação client-side otimista). Em caso de falha, o erro é
// mostrado com `role="alert"` + ícone (nunca só cor, UX-SPEC §5), e o
// formulário nunca navega.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import {
  T01DateRangeForm,
  type DateRangeFormValues,
} from "@/components/entrada/t01-date-range-form";
import { submeterDataLivre } from "@/lib/actions/data-livre";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

export default function DataLivrePage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleValid(values: DateRangeFormValues) {
    setError(null);
    setIsPending(true);
    try {
      const result = await submeterDataLivre(values);

      const params = new URLSearchParams({ sessionId: result.sessionId });

      if (result.proximaEtapa === "destino") {
        router.push(`/destino?${params.toString()}`);
        return;
      }

      params.set("destino", result.destino);
      params.set("flowState", "destino_confirmado");
      router.push(`/destino/confirmacao?${params.toString()}`);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 px-4 py-10">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold text-foreground focus-visible:outline-none"
      >
        Quando você quer viajar?
      </h1>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <T01DateRangeForm onValid={handleValid} isPending={isPending} />
    </main>
  );
}
