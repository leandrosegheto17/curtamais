"use client";

// L8-T02 — Tela T06 (Sugestões de hospedagem, UX-SPEC.md Seção 2/4, RF-06).
//
// Camada de apresentação: 3 cartões de hospedagem (`SuggestionCard`, L5-T04),
// os estados obrigatórios aplicáveis a T06 (UX-SPEC §4: Carregando/Erro/
// Sucesso — "Vazio" explicitamente marcado como "Não aplicável" para T06,
// sempre há 3 opções por definição de RF-06.1) via `LoadingStream`/
// `ErrorRetryState` (L5-T03, Diretriz de Implementação 11 — nenhuma lógica de
// estado duplicada aqui), `BudgetInsufficientBanner` (RF-10.2/RN-04) e o
// rodapé de decisão "continuar para passeios"/"encerrar aqui" (RF-05.4),
// mesmo padrão já usado em T04 (`DestinoSugestoesScreen`, L7-T02) — mesmo
// bridge de `LoadingStream` via `fetchImpl` documentado naquele arquivo,
// reaproveitado aqui sem duplicação de lógica.
//
// ============================================================================
// INTEGRAÇÃO COM A SERVER ACTION DE L8-T03 (paralela a esta tarefa, mesmo
// lote — TASK.md Seção 4/Lote 8, mesmo padrão de L6-T02/L6-T03 e L7-T02/
// L7-T03). No momento em que esta tela começou a ser escrita, o módulo
// `@/lib/actions/hospedagem` ainda não existia — a tela foi desenhada contra
// a interface documentada abaixo. `@/lib/actions/hospedagem.ts` passou a
// existir ainda durante esta mesma tarefa (a outra instância paralela
// terminou primeiro), então esta tela já importa e consome as funções reais
// (mesmo padrão de `DestinoSugestoesScreen`/`@/lib/actions/destino`) em vez
// de manter uma prop de ações obrigatória especulativa — reduz risco de
// divergência, conforme pedido.
//
// Duas funções batem exatamente com o que esta tela esperava:
//   - `gerarSugestoesHospedagem(sessionId)` → `AccommodationSuggestionResult[]`
//   - `encerrarResolucaoHospedagem(sessionId)` → objeto com `flowState`
//
// Um ponto do contrato real ficou diferente do que esta tela documentava
// inicialmente, e a tela foi ajustada para o formato real (não o inverso —
// a Server Action é a fonte da verdade da regra de negócio, TASK.md Seção 1
// item 3):
//   - Não existe uma função dedicada de "ajustar com feedback". RF-05.3
//     ("Ajustar" regenera a mesma etapa sem avançar) é satisfeita chamando
//     `gerarSugestoesHospedagem` de novo (mesma função do carregamento
//     inicial) — a ação `ajustar` da state machine é um self-loop em
//     `hospedagem_pendente` (`src/lib/session-flow/state-machine.ts`), então
//     nenhuma chamada de transição é necessária para "não avançar": o estado
//     já não muda por não ter havido `aprovar`. GAP RESOLVIDO por RL8-T01
//     (antes documentado aqui e no cabeçalho de `@/lib/actions/hospedagem.ts`
//     pela própria L8-T03): o texto do campo de feedback (`feedbackValue`)
//     agora é passado como segundo argumento de `gerarSugestoesHospedagem`,
//     que o sanitiza (`sanitizeFreeTextForPrompt`, L11-T03) e o repassa a
//     `StageContext.adjustmentFeedback`/`buildHospedagemPrompt`
//     (`@/lib/gateway-ia`) via `generateAccommodationSuggestions`
//     (`@/lib/stage-rules`).
//   - `aprovarHospedagem` já encadeia `aprovar` + `avancar` na mesma chamada
//     (RF-06.3: aprovar sempre avança para passeios) — diferente de
//     `aprovarDestinoSugerido`, que só aprova (o avanço de destino depende de
//     uma tela de confirmação própria, T05, que hospedagem não tem). Esta
//     tela não precisa de uma chamada adicional de "avançar": o retorno de
//     `aprovarHospedagem` já reflete `flowState: "passeios_pendente"`. O
//     botão "Continuar para passeios" do rodapé é só navegação client-side
//     para a etapa que o servidor já confirmou (mesmo padrão de
//     `handleContinuar` em `DestinoSugestoesScreen`, que também não faz uma
//     chamada de servidor adicional).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import { LoadingStream } from "@/components/design-system/loading-stream";
import { ErrorRetryState } from "@/components/design-system/error-retry-state";
import { SuggestionCard } from "@/components/design-system/suggestion-card";
import { BudgetInsufficientBanner } from "@/components/design-system/budget-insufficient-banner";
import {
  aprovarHospedagem,
  encerrarResolucaoHospedagem,
  gerarSugestoesHospedagem,
  type AccommodationSuggestionResult,
} from "@/lib/actions/hospedagem";
import { cn } from "@/lib/utils";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos gerar sugestões agora — tentar novamente";
const GENERIC_ACTION_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

type ScreenState = "loading" | "error" | "success";

export interface HospedagemSugestoesScreenProps {
  /** Id da `TripSession` corrente — vem do servidor (querystring resolvida pela rota), nunca decidido no client. */
  sessionId: string;
  className?: string;
  /**
   * Ponto de injeção só para testes automatizados — substitui as Server
   * Actions reais por dublês, sem precisar mockar módulo inteiro. Em
   * produção usa sempre as funções reais de `@/lib/actions/hospedagem`.
   */
  actionsOverride?: {
    gerarSugestoesHospedagem?: typeof gerarSugestoesHospedagem;
    aprovarHospedagem?: typeof aprovarHospedagem;
    encerrarResolucaoHospedagem?: typeof encerrarResolucaoHospedagem;
  };
}

/**
 * Tela T06 — Sugestões de hospedagem (UX-SPEC.md Seção 2/4, RF-06). Ver
 * bloco "INTEGRAÇÃO COM A SERVER ACTION DE L8-T03" no cabeçalho do arquivo.
 */
export function HospedagemSugestoesScreen({
  sessionId,
  className,
  actionsOverride,
}: HospedagemSugestoesScreenProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const actions = {
    gerarSugestoesHospedagem:
      actionsOverride?.gerarSugestoesHospedagem ?? gerarSugestoesHospedagem,
    aprovarHospedagem: actionsOverride?.aprovarHospedagem ?? aprovarHospedagem,
    encerrarResolucaoHospedagem:
      actionsOverride?.encerrarResolucaoHospedagem ??
      encerrarResolucaoHospedagem,
  };

  const [loadKey, setLoadKey] = useState(0);
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [suggestions, setSuggestions] = useState<
    AccommodationSuggestionResult[]
  >([]);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(
    null,
  );

  const [approved, setApproved] =
    useState<AccommodationSuggestionResult | null>(null);
  const [approvePendingIndex, setApprovePendingIndex] = useState<
    number | null
  >(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [adjustingIndex, setAdjustingIndex] = useState<number | null>(null);
  const [feedbackValue, setFeedbackValue] = useState("");
  const [adjustPending, setAdjustPending] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [footerPending, setFooterPending] = useState<
    "continuar" | "encerrar" | null
  >(null);
  const [footerError, setFooterError] = useState<string | null>(null);

  const hasBudgetExceeded = suggestions.some((s) => s.exceedsBudget);
  const somethingApproved = approved !== null;

  // Foco gerenciado explicitamente na transição de etapa (UX-SPEC.md §5,
  // Diretriz de Implementação 10): ao montar T06, o foco vai para o título
  // da nova etapa, não permanece no botão da tela anterior — mesmo padrão de
  // `DestinoConfirmacaoScreen` (L7-T04) e `FeriadosScreen` (L6-T04).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Bridge do estado "Carregando" real (Server Action de L8-T03) para o
  // contrato de `fetchImpl` de `LoadingStream` (mesmo padrão de
  // `DestinoSugestoesScreen`, L7-T02 — ver comentário de cabeçalho daquele
  // arquivo para o raciocínio completo).
  const loadingFetchImpl = useCallback(async () => {
    const result = await actions.gerarSugestoesHospedagem(sessionId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, actionsOverride]);

  function handleStreamComplete(fullText: string) {
    let parsed: AccommodationSuggestionResult[] = [];
    try {
      parsed = JSON.parse(fullText) as AccommodationSuggestionResult[];
    } catch {
      setLoadErrorMessage(GENERIC_ERROR_MESSAGE);
      setScreen("error");
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

  async function handleApprove(
    suggestion: AccommodationSuggestionResult,
    index: number,
  ) {
    setApproveError(null);
    setApprovePendingIndex(index);
    try {
      await actions.aprovarHospedagem({ sessionId, suggestion });
      setApproved(suggestion);
    } catch {
      setApproveError(GENERIC_ACTION_ERROR_MESSAGE);
    } finally {
      setApprovePendingIndex(null);
    }
  }

  function openAdjust(index: number) {
    setAdjustError(null);
    setFeedbackValue("");
    setAdjustingIndex(index);
  }

  function closeAdjust() {
    setAdjustingIndex(null);
    setFeedbackValue("");
    setAdjustError(null);
  }

  async function handleAdjustSubmit() {
    setAdjustError(null);
    setAdjustPending(true);
    try {
      // RF-05.3: regenera a MESMA etapa (as 3 opções) — nunca avança. RL8-T01
      // resolveu o gap antes documentado aqui: o texto de `feedbackValue`
      // agora é enviado como segundo argumento e chega sanitizado
      // (`sanitizeFreeTextForPrompt`, L11-T03) ao prompt de regeneração via
      // `gerarSugestoesHospedagem` (`@/lib/actions/hospedagem.ts`).
      const regenerated = await actions.gerarSugestoesHospedagem(
        sessionId,
        feedbackValue,
      );
      setSuggestions(regenerated);
      closeAdjust();
    } catch (error) {
      setAdjustError(
        error instanceof Error && error.message
          ? error.message
          : GENERIC_ACTION_ERROR_MESSAGE,
      );
    } finally {
      setAdjustPending(false);
    }
  }

  function handleContinuar() {
    if (!approved) return;
    setFooterError(null);
    setFooterPending("continuar");
    const params = new URLSearchParams({
      sessionId,
      flowState: "passeios_pendente",
    });
    // T07 (Sugestões de passeios, Lote 9) ainda não existe no momento desta
    // tarefa — rota alvo documentada aqui do mesmo jeito que T04 (L7-T02) já
    // apontava para `/destino/confirmacao` antes de T05 existir. Fora de
    // escopo desta tarefa criar `/passeios`. O servidor já confirmou o
    // avanço (`aprovarHospedagem` encadeia `aprovar`+`avancar`, ver
    // cabeçalho do arquivo) — este `push` é só navegação client-side para a
    // etapa já corrente, nunca uma transição otimista.
    router.push(`/passeios?${params.toString()}`);
  }

  async function handleEncerrarAqui() {
    setFooterError(null);
    setFooterPending("encerrar");
    try {
      await actions.encerrarResolucaoHospedagem(sessionId);
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
        currentState={approved ? "hospedagem_aprovada" : "hospedagem_pendente"}
      />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Sugestões de hospedagem para você
      </h1>

      {screen === "loading" && (
        <LoadingStream
          key={loadKey}
          input="gerar-sugestoes-hospedagem"
          label="Gerando sugestões de hospedagem"
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

      {screen === "success" && (
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
              const isAdjustingThisCard = adjustingIndex === index;

              return (
                <div key={`${suggestion.name}-${index}`} className="flex flex-col gap-2">
                  <SuggestionCard
                    title={suggestion.name}
                    subtitle={suggestion.type}
                    description={suggestion.distinctiveFeature}
                    price={{
                      min: suggestion.pricePerNightMin,
                      max: suggestion.pricePerNightMax,
                      unitLabel: "por diária",
                    }}
                    actions={
                      <>
                        <Button
                          type="button"
                          variant={isApprovedCard ? "secondary" : "default"}
                          className="min-h-11"
                          disabled={somethingApproved || approvePendingIndex !== null}
                          aria-busy={approvePendingIndex === index}
                          onClick={() => handleApprove(suggestion, index)}
                        >
                          {isApprovedCard
                            ? "Hospedagem aprovada"
                            : approvePendingIndex === index
                              ? "Aprovando..."
                              : "Aprovar"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={somethingApproved || approvePendingIndex !== null}
                          onClick={() =>
                            isAdjustingThisCard ? closeAdjust() : openAdjust(index)
                          }
                        >
                          Ajustar
                        </Button>
                      </>
                    }
                  />

                  {isAdjustingThisCard && (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                      <label
                        htmlFor={`hospedagem-feedback-${index}`}
                        className="text-sm font-medium text-foreground"
                      >
                        O que você gostaria de ajustar nesta opção?
                      </label>
                      <textarea
                        id={`hospedagem-feedback-${index}`}
                        value={feedbackValue}
                        onChange={(event) => setFeedbackValue(event.target.value)}
                        placeholder="Ex.: prefiro algo mais perto do centro"
                        aria-describedby={
                          adjustError ? `hospedagem-feedback-error-${index}` : undefined
                        }
                        className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      {adjustError && (
                        <p
                          id={`hospedagem-feedback-error-${index}`}
                          role="alert"
                          className="flex items-center gap-2 text-sm text-error"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {adjustError}
                        </p>
                      )}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="default"
                          className="min-h-11"
                          disabled={adjustPending}
                          aria-busy={adjustPending}
                          onClick={handleAdjustSubmit}
                        >
                          {adjustPending ? "Regenerando..." : "Regenerar com este feedback"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          disabled={adjustPending}
                          onClick={closeAdjust}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {approved && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-foreground-muted">
                Hospedagem decidida:{" "}
                <span className="text-foreground">{approved.name}</span>
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
                  Continuar para passeios
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
                    : "Só queria decidir até aqui — encerrar aqui"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
