"use client";

// L5-T03 — `LoadingStream` (UX-SPEC.md Seção 3/§4/§5).
//
// Consome o mecanismo de streaming decidido em SPIKE-01 (TASK.md Seção 2):
// Route Handler + `ReadableStream`, consumido no client via `fetch` +
// `response.body.getReader()` — NUNCA Server Actions/`ai/rsc`. Este
// componente É o ponto único que faz esse consumo no lado do cliente
// (Diretriz de Implementação 11 do TASK.md: telas de T04/T06/T07/T08
// reutilizam este componente, nunca duplicam a lógica de leitura do stream).
//
// Formato esperado da resposta (`src/app/api/gateway-ia/[etapa]/route.ts`,
// L3-T02): `Response` com `ReadableStream<Uint8Array>` de texto puro (deltas
// de `content.delta` do provider, `Content-Type: text/plain`), sem framing
// SSE — decodificado aqui com `TextDecoder`, sem parsing de evento.
//
// Escopo desta tarefa (decisão de design): este componente exibe o texto
// bruto chegando incrementalmente dentro de um bloco no tom `surface`
// (skeleton "preenchido" pelo próprio conteúdo, UX-SPEC §4) — ele NÃO sabe
// mapear o JSON estruturado final para os blocos visuais finais de
// destino/hospedagem/passeios/roteiro (isso é responsabilidade de cada tela
// real do Lote 7-10, que ainda não existe; `SuggestionCard`, L5-T04, também
// fora de escopo aqui). O objetivo aqui é só a prova de "conteúdo progressivo
// real, não spinner genérico" exigida pelo critério de aceite desta tarefa.
//
// Erro: em caso de falha (rede, status não-OK, corpo ausente, abort não
// solicitado pelo consumidor), o componente chama `onStreamError` e para de
// tentar sozinho — nenhum retry automático aqui (o retry único do ADR-004 já
// acontece no Gateway de IA/servidor, L3-T04; um retry automático também no
// client duplicaria a regra "no máximo uma tentativa adicional"). A tela
// chamadora decide trocar para `ErrorRetryState` (também deste Lote) a partir
// de `onStreamError` — este componente também renderiza uma mensagem de erro
// mínima internamente como fallback defensivo, mas não é o uso esperado nas
// telas reais.
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type LoadingStreamStatus = "connecting" | "streaming" | "done" | "error";

export interface LoadingStreamProps {
  /** Mesma assinatura de `fetch(input, init)` — tipicamente a URL do Route Handler da etapa (ex. `/api/gateway-ia/destino`). */
  input: RequestInfo | URL;
  init?: RequestInit;
  /**
   * Rótulo acessível descrevendo o que está sendo gerado (ex. "Gerando
   * sugestões de destino"). Anunciado por leitores de tela via `aria-live`
   * antes do primeiro chunk chegar.
   */
  label: string;
  onStreamComplete?: (fullText: string) => void;
  onStreamError?: (error: unknown) => void;
  className?: string;
  /**
   * Só para testes — injeta um `fetch` alternativo sem precisar mutar
   * `globalThis.fetch`. Em produção, usa o `fetch` global (nunca chama a API
   * da OpenAI diretamente — sempre a rota interna do Gateway de IA).
   */
  fetchImpl?: typeof fetch;
}

/**
 * Estado de carregamento que exibe o conteúdo conforme chega via streaming
 * (UX-SPEC.md Seção 4) — não um spinner genérico. `aria-live="polite"` na
 * região de conteúdo (UX-SPEC.md Seção 5), para que leitores de tela
 * anunciem o progresso sem interromper o usuário a cada chunk.
 */
export function LoadingStream({
  input,
  init,
  label,
  onStreamComplete,
  onStreamError,
  className,
  fetchImpl,
}: LoadingStreamProps) {
  const [status, setStatus] = useState<LoadingStreamStatus>("connecting");
  const [text, setText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs para os callbacks: evita reiniciar o efeito de streaming só porque
  // o chamador passou uma nova função inline a cada render.
  const onCompleteRef = useRef(onStreamComplete);
  const onErrorRef = useRef(onStreamError);
  onCompleteRef.current = onStreamComplete;
  onErrorRef.current = onStreamError;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setStatus("connecting");
    setText("");
    setErrorMessage(null);

    async function run() {
      try {
        const doFetch = fetchImpl ?? fetch;
        const response = await doFetch(input, {
          ...init,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(
            `Falha ao iniciar a geração (status ${response.status}).`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (cancelled) {
            await reader.cancel();
            return;
          }
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          setStatus("streaming");
          setText(accumulated);
        }

        if (cancelled) return;
        setStatus("done");
        onCompleteRef.current?.(accumulated);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Falha ao gerar conteúdo.";
        setStatus("error");
        setErrorMessage(message);
        onErrorRef.current?.(error);
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, init, fetchImpl]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4 shadow-none",
        className,
      )}
    >
      {/*
        Região única de `aria-live="polite"` (UX-SPEC §5): cobre tanto o
        anúncio inicial ("Gerando sugestões de destino") quanto o texto
        chegando incrementalmente. `aria-busy` reflete se ainda há trabalho
        em andamento. Trade-off aceito (documentado, não resolvido aqui):
        leitores de tela reais podem re-anunciar o bloco inteiro a cada
        atualização de chunk, não só o delta — o UX-SPEC.md exige
        explicitamente `aria-live="polite"` nesta região (Seção 5), sem
        detalhar granularidade de anúncio; nenhuma tela real usa este
        componente ainda para validar isso com um leitor de tela de verdade.
      */}
      <div aria-live="polite" aria-busy={status === "connecting" || status === "streaming"}>
        <span className="sr-only">{label}</span>

        {status === "connecting" && (
          <div data-testid="loading-stream-skeleton" className="space-y-2" aria-hidden="true">
            <div className="h-4 w-3/4 animate-pulse rounded bg-background" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-background" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-background" />
          </div>
        )}

        {(status === "streaming" || status === "done") && (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {text}
            {status === "streaming" && (
              <span aria-hidden="true" className="ml-0.5 inline-block animate-pulse">
                ▍
              </span>
            )}
          </p>
        )}

        {status === "error" && errorMessage && (
          <p className="text-sm text-error">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
