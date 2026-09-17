// L6-T02 — T01 (Data livre, RF-01). Só renderiza o título da etapa + o
// formulário (`T01DateRangeForm`).
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
//
// V2-L5-T01 (RF-13, UX-SPEC.md §8.2 T01, SDD.md §8.2.4) — extraído de
// `page.tsx` para virar este client component, agora que a rota tem uma
// Server Component fina (`page.tsx`) na frente, responsável por resolver
// `?destino={slug}` contra `CATALOGO_DESTINOS` e repassar `destinoInicial`
// já formatado como "{Nome}, {UF}". Este componente só recebe a prop e a
// repassa para `T01DateRangeForm` — não conhece o catálogo nem slugs. A
// ramificação RF-01.3 (destino mantido → confirmação/T05; destino apagado →
// sugestões/T04) já é responsabilidade inteira de `submeterDataLivre`
// (L6-T03, `@/lib/actions/data-livre`), que decide a partir de
// `values.destino` — como o campo de destino continua controlado por
// `T01DateRangeForm` e reflete o que o usuário efetivamente mantém/apaga na
// hora de enviar, nenhuma lógica nova é necessária aqui (mesma conclusão do
// SDD.md §8.2.4: "Nenhuma lógica nova no servidor").
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

export interface DataLivreClientProps {
  /**
   * V2-L5-T01 — valor inicial (editável) do campo "Destino", resolvido pela
   * Server Component pai a partir de `?destino={slug}`. `undefined` quando o
   * slug é ausente/inválido — comportamento idêntico ao MVP.
   */
  destinoInicial?: string;
}

export function DataLivreClient({ destinoInicial }: DataLivreClientProps) {
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

      <T01DateRangeForm
        onValid={handleValid}
        isPending={isPending}
        destinoInicial={destinoInicial}
      />
    </main>
  );
}
