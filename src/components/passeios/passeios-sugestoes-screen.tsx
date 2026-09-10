"use client";

// L9-T02 — Tela T07 (Sugestões de passeios, UX-SPEC.md Seção 2/4, RF-07).
//
// Camada de apresentação: lista de passeios (`SuggestionCard`, L5-T04, com o
// slot `leading` para o checkbox e `actions` para o botão "Remover" — ver
// comentário de cabeçalho de `suggestion-card.tsx`, que já antecipa esse uso
// para T07), os estados obrigatórios aplicáveis a T07 (UX-SPEC §4:
// Carregando/Erro/Sucesso — "Vazio" tratado como aviso INLINE quando todos os
// itens são removidos, explicitamente NÃO como `EmptyState` de página
// inteira: "o usuário ainda pode reverter a remoção", UX-SPEC §4) via
// `LoadingStream`/`ErrorRetryState` (L5-T03, Diretriz de Implementação 11 —
// nenhuma lógica de estado duplicada aqui), `BudgetInsufficientBanner`
// (RF-10.2/RN-04) e o rodapé de decisão "continuar para roteiro"/"encerrar
// aqui", mesmo padrão de `HospedagemSugestoesScreen` (T06, L8-T02) — ver
// aquele arquivo para o raciocínio completo do bridge de `LoadingStream` via
// `fetchImpl`, reaproveitado aqui sem duplicação de lógica.
//
// DIFERENÇA CHAVE DE INTERAÇÃO EM RELAÇÃO A T06 (não copiar o padrão de
// "aprovar individualmente por cartão" de `HospedagemSugestoesScreen`):
// T07 é uma LISTA com seleção múltipla, não cartões aprovados um a um.
// Semântica adotada (UX-SPEC.md T07: "cada um com checkbox marcado por
// padrão e opção de remover antes de aprovar", critério de aceite: "Aprovar
// seleção" desabilita/some se TODOS os itens forem REMOVIDOS):
//   - Checkbox (marcado por padrão em todo item) = incluído na seleção que
//     será aprovada. Desmarcar um item o exclui da aprovação sem tirá-lo da
//     lista visível — o usuário pode marcá-lo de novo a qualquer momento.
//   - "Remover" (botão por item, distinto do checkbox) = tira o item da
//     lista visível por completo, decisão que também não pode ser desfeita
//     nesta tela (não há "desfazer remoção" na UX-SPEC — só reverter
//     recarregando/regenerando, fora de escopo desta tarefa).
//   - Ambos os mecanismos reduzem o conjunto que será enviado a
//     `aprovarSelecaoPasseios`: `selecionados = itens visíveis (não
//     removidos) E marcados`. O botão "Aprovar seleção" fica desabilitado
//     (nunca some do DOM — mais previsível para navegação por teclado/leitor
//     de tela do que aparecer/desaparecer, e permite manter a mensagem
//     explicativa associada via `aria-describedby`) quando `selecionados` é
//     vazio, com uma mensagem inline explicando que ao menos um item precisa
//     permanecer selecionado — nunca um `EmptyState` de página inteira
//     (UX-SPEC §4). "Encerrar aqui" continua disponível mesmo nesse caso
//     (UX-SPEC T07: "ou o próprio botão de encerrar aqui continua
//     disponível") — é por isso que ele não fica dentro do mesmo bloco
//     condicional de "aprovado".
//
// ============================================================================
// CONTRATO ESPERADO DA SERVER ACTION DE L9-T03 (`@/lib/actions/passeios`,
// tarefa paralela a esta, mesmo lote — TASK.md Seção 4/Lote 9, mesmo padrão
// de L8-T02/L8-T03 e L7-T02/L7-T03). No momento em que esta tela foi escrita,
// `@/lib/actions/passeios.ts` ainda não existia — a prop `actions` abaixo é
// OBRIGATÓRIA (não um `actionsOverride` opcional com fallback para import
// direto, diferente de `HospedagemSugestoesScreen`/`DestinoSugestoesScreen`
// já concluídas) exatamente para não importar um módulo que pode não existir
// ainda no momento em que este arquivo é compilado/testado. Quando
// `@/lib/actions/passeios.ts` existir, a instância que integrar deve trocar
// esta prop para o mesmo padrão `actionsOverride` opcional + import direto
// das funções reais (reduz risco de divergência, conforme já feito em T06).
//
// Três funções esperadas, espelhando exatamente o vocabulário já usado por
// `@/lib/actions/hospedagem` (mesmos nomes de padrão `gerar`/`aprovar`/
// `encerrarResolucao`, trocando o sufixo da etapa):
//
//   - `gerarSugestoesPasseios(sessionId: string): Promise<PasseiosSuggestionResult[]>`
//     RF-07.1/.2 — gera a lista variável de passeios (`generatePasseiosSuggestions`,
//     `@/lib/stage-rules`, L9-T01) já com `withinBudget`/`exceedsBudget`
//     (RF-10) resolvidos. `PasseiosSuggestionResult` é exatamente o tipo já
//     exportado por `@/lib/stage-rules` (L9-T01) — nenhum tipo novo esperado
//     aqui, só reexportado por `passeios.ts` (mesmo padrão de
//     `AccommodationSuggestionResult` em `hospedagem.ts`).
//     Sem "Ajustar"/feedback textual nesta etapa — UX-SPEC.md T07 não
//     menciona regeneração com feedback (diferente de T06); "nova rodada"
//     nesta tela, se necessário, é só chamar `gerarSugestoesPasseios` de novo
//     (ex.: a partir de um retry do carregamento), sem prop dedicada.
//
//   - `aprovarSelecaoPasseios(input: { sessionId: string; selecionados: PasseiosSuggestionResult[] }): Promise<AprovarSelecaoPasseiosResult>`
//     RF-07.3 — persiste `ActivityApproval` SÓ dos itens em `selecionados`
//     (não removidos/ainda marcados no momento do clique, ver semântica
//     acima) via `applySessionFlowTransition` (`action: "aprovar"`,
//     `passeios_pendente` → `passeios_aprovados`) e encadeia `avancar`
//     (`passeios_aprovados` → `roteiro_pendente`) na mesma chamada — mesmo
//     padrão de `aprovarHospedagem` (`hospedagem.ts`, L8-T03: hospedagem e
//     passeios não têm tela de confirmação intermediária própria, diferente
//     de destino/T05). `AprovarSelecaoPasseiosResult` esperado:
//     `{ proximaEtapa: "roteiro"; sessionId: string; flowState: "roteiro_pendente"; passeios: string[] }`
//     (`passeios`: nomes aprovados, só para a tela exibir um resumo — mesmo
//     papel de `AprovarHospedagemResult.hospedagem`).
//     Nunca confia cegamente no payload do cliente — revalidação/sanitização
//     de texto livre (`name` de cada item, mesmo raciocínio de RL8-T02) é
//     responsabilidade de L9-T03, não desta tela.
//
//   - `encerrarResolucaoPasseios(sessionId: string): Promise<EncerrarResolucaoPasseiosResult>`
//     RF-05.4 análogo — leva a `T-END(parcial)`, preservando
//     `DestinationApproval`/`AccommodationApproval`/qualquer
//     `ActivityApproval` já gravado (RN-03). `EncerrarResolucaoPasseiosResult`
//     esperado: `{ proximaEtapa: "encerramento"; sessionId: string; flowState: "encerrada_parcial" }`
//     — mesmo formato de `EncerrarResolucaoHospedagemResult`.
//
// Caso o contrato real de L9-T03 divirja (nome de campo, assinatura), esta
// tela deve ser ajustada para o formato real (a Server Action é a fonte da
// verdade da regra de negócio, TASK.md Seção 1 item 3), nunca o inverso —
// mesmo precedente de `HospedagemSugestoesScreen`.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import { LoadingStream } from "@/components/design-system/loading-stream";
import { ErrorRetryState } from "@/components/design-system/error-retry-state";
import { SuggestionCard } from "@/components/design-system/suggestion-card";
import { BudgetInsufficientBanner } from "@/components/design-system/budget-insufficient-banner";
import type { PasseiosSuggestionResult } from "@/lib/stage-rules";
import { cn } from "@/lib/utils";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos gerar sugestões agora — tentar novamente";
const GENERIC_ACTION_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";
const NENHUM_ITEM_SELECIONADO_MESSAGE =
  "Ao menos um passeio precisa permanecer selecionado para seguir ao roteiro — ou encerre por aqui.";

type ScreenState = "loading" | "error" | "success";

/** Ver bloco "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no cabeçalho do arquivo. */
export type AprovarSelecaoPasseiosResult = {
  proximaEtapa: "roteiro";
  sessionId: string;
  flowState: "roteiro_pendente";
  passeios: string[];
};

/** Ver bloco "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no cabeçalho do arquivo. */
export type EncerrarResolucaoPasseiosResult = {
  proximaEtapa: "encerramento";
  sessionId: string;
  flowState: "encerrada_parcial";
};

export interface PasseiosScreenActions {
  gerarSugestoesPasseios: (
    sessionId: string,
  ) => Promise<PasseiosSuggestionResult[]>;
  aprovarSelecaoPasseios: (input: {
    sessionId: string;
    selecionados: PasseiosSuggestionResult[];
  }) => Promise<AprovarSelecaoPasseiosResult>;
  encerrarResolucaoPasseios: (
    sessionId: string,
  ) => Promise<EncerrarResolucaoPasseiosResult>;
}

export interface PasseiosSugestoesScreenProps {
  /** Id da `TripSession` corrente — vem do servidor (querystring resolvida pela rota), nunca decidido no client. */
  sessionId: string;
  className?: string;
  /**
   * Obrigatório enquanto `@/lib/actions/passeios` (L9-T03) não existe — ver
   * bloco "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no cabeçalho do
   * arquivo. Em produção, o composable/rota que monta esta tela passa as
   * funções reais assim que L9-T03 estiver disponível; em teste, dublês.
   */
  actions: PasseiosScreenActions;
}

type PasseioItem = {
  id: string;
  suggestion: PasseiosSuggestionResult;
  checked: boolean;
  removed: boolean;
};

function toItems(suggestions: PasseiosSuggestionResult[]): PasseioItem[] {
  return suggestions.map((suggestion, index) => ({
    id: `${suggestion.name}-${index}`,
    suggestion,
    // Marcado por padrão (UX-SPEC.md T07).
    checked: true,
    removed: false,
  }));
}

/**
 * Tela T07 — Sugestões de passeios (UX-SPEC.md Seção 2/4, RF-07). Ver bloco
 * "DIFERENÇA CHAVE DE INTERAÇÃO EM RELAÇÃO A T06" e "CONTRATO ESPERADO DA
 * SERVER ACTION DE L9-T03" no cabeçalho do arquivo.
 */
export function PasseiosSugestoesScreen({
  sessionId,
  className,
  actions,
}: PasseiosSugestoesScreenProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [loadKey, setLoadKey] = useState(0);
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [items, setItems] = useState<PasseioItem[]>([]);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(
    null,
  );

  const [approved, setApproved] =
    useState<AprovarSelecaoPasseiosResult | null>(null);
  const [approvePending, setApprovePending] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [footerPending, setFooterPending] = useState<
    "continuar" | "encerrar" | null
  >(null);
  const [footerError, setFooterError] = useState<string | null>(null);

  // Foco gerenciado explicitamente na transição de etapa (UX-SPEC.md §5,
  // Diretriz de Implementação 10) — mesmo padrão de `HospedagemSugestoesScreen`.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const loadingFetchImpl = useCallback(async () => {
    const result = await actions.gerarSugestoesPasseios(sessionId);
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
  }, [sessionId, actions]);

  function handleStreamComplete(fullText: string) {
    let parsed: PasseiosSuggestionResult[] = [];
    try {
      parsed = JSON.parse(fullText) as PasseiosSuggestionResult[];
    } catch {
      setLoadErrorMessage(GENERIC_ERROR_MESSAGE);
      setScreen("error");
      return;
    }
    setItems(toItems(parsed));
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

  function toggleChecked(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  function removeItem(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, removed: true } : item,
      ),
    );
  }

  const visibleItems = useMemo(
    () => items.filter((item) => !item.removed),
    [items],
  );
  const selectedSuggestions = useMemo(
    () =>
      visibleItems
        .filter((item) => item.checked)
        .map((item) => item.suggestion),
    [visibleItems],
  );
  const hasBudgetExceeded = visibleItems.some(
    (item) => item.suggestion.exceedsBudget,
  );
  const noSelection = selectedSuggestions.length === 0;

  async function handleApproveSelection() {
    if (noSelection) return;
    setApproveError(null);
    setApprovePending(true);
    try {
      const result = await actions.aprovarSelecaoPasseios({
        sessionId,
        selecionados: selectedSuggestions,
      });
      setApproved(result);
    } catch {
      setApproveError(GENERIC_ACTION_ERROR_MESSAGE);
    } finally {
      setApprovePending(false);
    }
  }

  function handleContinuar() {
    if (!approved) return;
    setFooterError(null);
    setFooterPending("continuar");
    const params = new URLSearchParams({
      sessionId,
      flowState: "roteiro_pendente",
    });
    // T08 (Roteiro final, Lote 10) ainda não existe no momento desta tarefa —
    // rota alvo documentada aqui do mesmo jeito que T06 (L8-T02) apontava
    // para `/passeios` antes de T07 existir. O servidor já confirmou o
    // avanço (`aprovarSelecaoPasseios` encadeia aprovar+avançar, ver
    // contrato no cabeçalho) — este `push` é só navegação client-side.
    router.push(`/roteiro?${params.toString()}`);
  }

  async function handleEncerrarAqui() {
    setFooterError(null);
    setFooterPending("encerrar");
    try {
      await actions.encerrarResolucaoPasseios(sessionId);
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
        currentState={approved ? "passeios_aprovados" : "passeios_pendente"}
      />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Sugestões de passeios para você
      </h1>

      {screen === "loading" && (
        <LoadingStream
          key={loadKey}
          input="gerar-sugestoes-passeios"
          label="Gerando sugestões de passeios"
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

      {screen === "success" && !approved && (
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
            {visibleItems.map((item) => (
              <SuggestionCard
                key={item.id}
                title={item.suggestion.name}
                meta={item.suggestion.durationApprox}
                price={{
                  min: item.suggestion.priceMin,
                  max: item.suggestion.priceMax,
                  free: item.suggestion.isFree,
                }}
                leading={
                  <label
                    htmlFor={`passeio-checkbox-${item.id}`}
                    className="flex min-h-11 min-w-11 items-center justify-center"
                  >
                    <span className="sr-only">
                      Incluir &quot;{item.suggestion.name}&quot; na aprovação
                    </span>
                    <input
                      id={`passeio-checkbox-${item.id}`}
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleChecked(item.id)}
                      disabled={approvePending}
                      className="h-5 w-5 rounded border-input text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                }
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={approvePending}
                    onClick={() => removeItem(item.id)}
                  >
                    Remover
                  </Button>
                }
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            {noSelection && (
              <p
                id="passeios-sem-selecao-mensagem"
                className="text-sm text-foreground-muted"
              >
                {NENHUM_ITEM_SELECIONADO_MESSAGE}
              </p>
            )}

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
                disabled={noSelection || approvePending}
                aria-disabled={noSelection}
                aria-describedby={
                  noSelection ? "passeios-sem-selecao-mensagem" : undefined
                }
                aria-busy={approvePending}
                onClick={handleApproveSelection}
              >
                {approvePending ? "Aprovando..." : "Aprovar seleção"}
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
        </div>
      )}

      {approved && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-foreground-muted">
            Passeios decididos:{" "}
            <span className="text-foreground">
              {approved.passeios.join(", ")}
            </span>
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
              Continuar para roteiro
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
    </main>
  );
}
