"use client";

// L7-T02 — Tela T04 (Sugestões de destino, UX-SPEC.md Seção 2/4, RF-04).
//
// Camada de apresentação: cartões de destino (`SuggestionCard`, L5-T04), os 4
// estados obrigatórios (UX-SPEC §4: Carregando/Erro/Vazio/Sucesso) via
// `LoadingStream`/`ErrorRetryState`/`EmptyState` (L5-T03, Diretriz de
// Implementação 11 — nenhuma lógica de estado duplicada aqui),
// `BudgetInsufficientBanner` (RF-10.2/RN-04) e o rodapé de decisão
// "continuar"/"encerrar aqui" (RF-04.5). Integra com as Server Actions reais
// de L7-T03 (`@/lib/actions/destino`, já implementadas no momento desta
// tarefa) — nenhuma lógica de negócio/persistência é reimplementada aqui
// (Diretriz de Implementação 3: nenhuma escrita em `TripSession` fora do
// Orquestrador de Sessão, nenhuma navegação client-side otimista — toda
// transição visível ao usuário só acontece depois da Promise da Server
// Action resolver).
//
// **Decisão de integração de `LoadingStream` (documentada, dentro da margem
// de detalhe de implementação do Executor — não escalada)**: `LoadingStream`
// (L5-T03) foi desenhado para consumir o Route Handler de streaming bruto
// (`/api/gateway-ia/[etapa]`, SPIKE-01) — mecanismo que só entrega texto
// incremental para PERCEPÇÃO de progresso (sem retry/validação/filtro de
// orçamento, ver comentário em `src/lib/gateway-ia/index.ts` desde L3-T02).
// A decisão de negócio real desta tela usa `gerarSugestoesDestino`
// (`@/lib/actions/destino`, L7-T03), que por sua vez chama a variante
// NÃO-streaming (`generateStructuredCompletionWithRetry`, com retry único +
// `LlmGenerationLog` + filtro de orçamento RF-10, L3-T03/T04/L4-T03) — os
// dois mecanismos não foram desenhados para compor diretamente (o Route
// Handler de streaming não tem acesso a `sessionId`/contexto da sessão nem
// aplica RF-10, e chamá-lo em paralelo à Server Action real dobraria o custo
// de chamada ao provider por carregamento de tela, sem ADR que autorize
// dois disparos por decisão). Em vez de duplicar a lógica de estado de
// `LoadingStream` numa tela nova (proibido pela Diretriz de Implementação
// 11), esta tela REUTILIZA o componente de verdade, mas usa o ponto de
// extensão `fetchImpl` (já existente desde L5-T03, pensado para testes) para
// ligá-lo à Server Action real: `fetchImpl` chama `gerarSugestoesDestino`,
// aguarda a resposta validada/filtrada por orçamento, e a entrega como um
// único chunk de um `ReadableStream` sintético (mesmo formato de texto que o
// componente já sabe consumir). O usuário vê o mesmo skeleton/estado
// "carregando" (`aria-live="polite"`) enquanto a Server Action está em voo, e
// a tela reage a sucesso/erro pelos callbacks já existentes do componente
// (`onStreamComplete`/`onStreamError`) — nenhum código de streaming novo,
// nenhuma chamada adicional ao Gateway de IA.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import { LoadingStream } from "@/components/design-system/loading-stream";
import { ErrorRetryState } from "@/components/design-system/error-retry-state";
import { EmptyState } from "@/components/design-system/empty-state";
import { SuggestionCard } from "@/components/design-system/suggestion-card";
import { BudgetInsufficientBanner } from "@/components/design-system/budget-insufficient-banner";
import {
  aprovarDestinoSugerido,
  encerrarResolucaoDestino,
  gerarSugestoesDestino,
  informarDestinoManualmente,
  type DestinationSuggestionResult,
} from "@/lib/actions/destino";
import { cn } from "@/lib/utils";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos gerar sugestões agora — tentar novamente";
const GENERIC_ACTION_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

type ScreenState = "loading" | "error" | "empty" | "success";

export interface DestinoSugestoesScreenProps {
  /** Id da `TripSession` corrente — vem do servidor (querystring resolvida pela rota), nunca decidido no client. */
  sessionId: string;
  className?: string;
  /**
   * Ponto de injeção só para testes automatizados — substitui as Server
   * Actions reais por dublês, sem precisar mockar módulos inteiros. Em
   * produção usa sempre as funções reais de `@/lib/actions/destino`.
   */
  actionsOverride?: {
    gerarSugestoesDestino?: typeof gerarSugestoesDestino;
    aprovarDestinoSugerido?: typeof aprovarDestinoSugerido;
    informarDestinoManualmente?: typeof informarDestinoManualmente;
    encerrarResolucaoDestino?: typeof encerrarResolucaoDestino;
  };
}

/**
 * Tela T04 — Sugestões de destino (UX-SPEC.md Seção 2/4, RF-04). Ver
 * comentário de cabeçalho do arquivo para a decisão de integração do estado
 * "Carregando" com `LoadingStream`.
 */
export function DestinoSugestoesScreen({
  sessionId,
  className,
  actionsOverride,
}: DestinoSugestoesScreenProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // L11-T04 — RL: foco gerenciado explicitamente na transição para esta
  // etapa (UX-SPEC.md §5/ADR-006), mesmo padrão de todas as outras telas
  // (`destino-confirmacao-screen.tsx`, `hospedagem-sugestoes-screen.tsx`,
  // `passeios-sugestoes-screen.tsx`, `roteiro-screen.tsx`,
  // `encerramento-screen.tsx`) — esta era a única tela do fluxo em que o
  // `ref`/`tabIndex={-1}` do título já existiam mas a chamada de `.focus()`
  // correspondente estava ausente, deixando o foco no botão da tela
  // anterior ao chegar em T04.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const actions = useMemo(
    () => ({
      gerarSugestoesDestino:
        actionsOverride?.gerarSugestoesDestino ?? gerarSugestoesDestino,
      aprovarDestinoSugerido:
        actionsOverride?.aprovarDestinoSugerido ?? aprovarDestinoSugerido,
      informarDestinoManualmente:
        actionsOverride?.informarDestinoManualmente ??
        informarDestinoManualmente,
      encerrarResolucaoDestino:
        actionsOverride?.encerrarResolucaoDestino ??
        encerrarResolucaoDestino,
    }),
    [actionsOverride],
  );

  const [loadKey, setLoadKey] = useState(0);
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [suggestions, setSuggestions] = useState<DestinationSuggestionResult[]>(
    [],
  );
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(
    null,
  );

  const [approved, setApproved] = useState<DestinationSuggestionResult | null>(
    null,
  );
  const [approvePendingIndex, setApprovePendingIndex] = useState<
    number | null
  >(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualPending, setManualPending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [footerPending, setFooterPending] = useState<
    "continuar" | "encerrar" | null
  >(null);
  const [footerError, setFooterError] = useState<string | null>(null);

  const hasBudgetExceeded = suggestions.some((s) => s.exceedsBudget);

  // Bridge do estado "Carregando" real (Server Action de L7-T03) para o
  // contrato de `fetchImpl` de `LoadingStream` (ver comentário de cabeçalho).
  const loadingFetchImpl = useCallback(
    async () => {
      const result = await actions.gerarSugestoesDestino(sessionId);
      const body = JSON.stringify(result);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    [actions, sessionId],
  );

  function handleStreamComplete(fullText: string) {
    let parsed: DestinationSuggestionResult[] = [];
    try {
      parsed = JSON.parse(fullText) as DestinationSuggestionResult[];
    } catch {
      setLoadErrorMessage(GENERIC_ERROR_MESSAGE);
      setScreen("error");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setScreen("empty");
      return;
    }
    setSuggestions(parsed);
    setScreen("success");
  }

  function handleStreamError() {
    setLoadErrorMessage(GENERIC_ERROR_MESSAGE);
    setScreen("error");
  }

  function retry() {
    setLoadErrorMessage(null);
    setLoadKey((key) => key + 1);
    setScreen("loading");
  }

  function rejectAll() {
    setApproveError(null);
    setScreen("empty");
  }

  function novaRodada() {
    setManualEntryOpen(false);
    retry();
  }

  function openManualEntry() {
    setManualError(null);
    setManualEntryOpen(true);
  }

  function closeManualEntry() {
    setManualEntryOpen(false);
    setManualError(null);
  }

  async function handleApprove(
    suggestion: DestinationSuggestionResult,
    index: number,
  ) {
    setApproveError(null);
    setApprovePendingIndex(index);
    try {
      const result = await actions.aprovarDestinoSugerido({
        sessionId,
        suggestion,
      });
      setApproved({ ...suggestion, name: result.destino });
    } catch {
      setApproveError(GENERIC_ACTION_ERROR_MESSAGE);
    } finally {
      setApprovePendingIndex(null);
    }
  }

  async function handleManualSubmit() {
    setManualError(null);
    setManualPending(true);
    try {
      const result = await actions.informarDestinoManualmente({
        sessionId,
        destino: manualValue,
      });
      setApproved({
        name: result.destino,
        justification: "",
        priceRangeMin: 0,
        priceRangeMax: 0,
        withinBudget: true,
        exceedsBudget: false,
      });
      setManualEntryOpen(false);
    } catch (error) {
      setManualError(
        error instanceof Error && error.message
          ? error.message
          : GENERIC_ACTION_ERROR_MESSAGE,
      );
    } finally {
      setManualPending(false);
    }
  }

  function handleContinuar() {
    if (!approved) return;
    setFooterError(null);
    setFooterPending("continuar");
    const params = new URLSearchParams({
      sessionId,
      destino: approved.name,
      flowState: "destino_confirmado",
    });
    router.push(`/destino/confirmacao?${params.toString()}`);
  }

  async function handleEncerrarAqui() {
    setFooterError(null);
    setFooterPending("encerrar");
    try {
      await actions.encerrarResolucaoDestino(sessionId);
      const params = new URLSearchParams({
        sessionId,
        flowState: "encerrada_parcial",
      });
      router.push(`/encerramento?${params.toString()}`);
    } catch {
      setFooterError(GENERIC_ACTION_ERROR_MESSAGE);
      setFooterPending(null);
    }
  }

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6",
        className,
      )}
    >
      <StepperProgress
        currentState={approved ? "destino_confirmado" : "destino_pendente"}
      />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Sugestões de destino para você
      </h1>

      {screen === "loading" && (
        <LoadingStream
          key={loadKey}
          input="gerar-sugestoes-destino"
          label="Gerando sugestões de destino"
          fetchImpl={loadingFetchImpl}
          onStreamComplete={handleStreamComplete}
          onStreamError={handleStreamError}
        />
      )}

      {screen === "error" && (
        <ErrorRetryState
          message={loadErrorMessage ?? GENERIC_ERROR_MESSAGE}
          onRetry={retry}
        />
      )}

      {screen === "empty" && !manualEntryOpen && (
        <EmptyState
          title="Nenhuma dessas fez sentido para você"
          description="Sem problema — gere novas sugestões ou informe o destino que você já tem em mente."
          actions={[
            { label: "Gerar novas sugestões", onClick: novaRodada },
            {
              label: "Informar destino manualmente",
              onClick: openManualEntry,
            },
          ]}
        />
      )}

      {screen === "success" && !manualEntryOpen && (
        <div className="flex flex-col gap-4">
          <BudgetInsufficientBanner show={hasBudgetExceeded} />

          {approveError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{approveError}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {suggestions.map((suggestion, index) => {
              const isApprovedCard = approved?.name === suggestion.name;
              return (
                <SuggestionCard
                  key={`${suggestion.name}-${index}`}
                  title={suggestion.name}
                  description={suggestion.justification}
                  price={{
                    min: suggestion.priceRangeMin,
                    max: suggestion.priceRangeMax,
                  }}
                  actions={
                    <Button
                      type="button"
                      variant={isApprovedCard ? "secondary" : "default"}
                      className="min-h-11"
                      disabled={
                        approved !== null || approvePendingIndex !== null
                      }
                      aria-busy={approvePendingIndex === index}
                      onClick={() => handleApprove(suggestion, index)}
                    >
                      {isApprovedCard
                        ? "Destino aprovado"
                        : approvePendingIndex === index
                          ? "Aprovando..."
                          : "Aprovar este destino"}
                    </Button>
                  }
                />
              );
            })}
          </div>

          {!approved && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={rejectAll}
              >
                Nenhum me interessa — gerar outras opções
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={openManualEntry}
              >
                Já sei o destino, quero informar
              </Button>
            </div>
          )}

          {approved && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-foreground-muted">
                Destino decidido: <span className="text-foreground">{approved.name}</span>
              </p>

              {footerError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 text-sm text-error"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>{footerError}</p>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="default"
                  className="min-h-11 flex-1"
                  disabled={footerPending !== null}
                  aria-busy={footerPending === "continuar"}
                  onClick={handleContinuar}
                >
                  Continuar para hospedagem
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={footerPending !== null}
                  aria-busy={footerPending === "encerrar"}
                  onClick={handleEncerrarAqui}
                >
                  {footerPending === "encerrar"
                    ? "Encerrando..."
                    : "Só queria decidir o destino — encerrar aqui"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {manualEntryOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <label
            htmlFor="destino-manual"
            className="text-sm font-medium text-foreground"
          >
            Qual destino você já tem em mente?
          </label>
          <input
            id="destino-manual"
            type="text"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            placeholder="Ex.: Gramado, RS"
            aria-describedby={manualError ? "destino-manual-error" : undefined}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {manualError && (
            <p
              id="destino-manual-error"
              role="alert"
              className="flex items-center gap-2 text-sm text-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {manualError}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="default"
              className="min-h-11"
              disabled={manualPending}
              aria-busy={manualPending}
              onClick={handleManualSubmit}
            >
              {manualPending ? "Confirmando..." : "Confirmar destino"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={manualPending}
              onClick={closeManualEntry}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
