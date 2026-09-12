"use client";

// L10-T02 — Tela T08 (Roteiro final, UX-SPEC.md Seção 2/4/6, RF-08).
//
// Camada de apresentação: um `ItineraryDayBlock` (L10-T02, design system) por
// dia do range da viagem, os estados obrigatórios aplicáveis a T08
// (UX-SPEC §4: "Idem T04, com granularidade por dia" para Carregando/Erro;
// "Vazio: Não aplicável" — roteiro só é gerado depois de passeios aprovados,
// sempre há ao menos um item) via `LoadingStream`/`ErrorRetryState` (L5-T03),
// e uma única ação de aprovação no rodapé ("Aprovar roteiro e concluir",
// UX-SPEC.md T08: "não há 'ajustar' item a item dentro do roteiro no MVP") —
// mesmo padrão estrutural de `HospedagemSugestoesScreen`/
// `PasseiosSugestoesScreen` (L8-T02/L9-T02), reaproveitado via `LoadingStream`
// sem duplicar a lógica de streaming (Diretriz de Implementação 11).
//
// Comportamento de acordeão (UX-SPEC §6, "Blocos de dia em acordeão (um dia
// expandido por vez, os demais colapsados)" em mobile; "todos os dias
// expandidos" em desktop) é resolvido inteiramente dentro de
// `ItineraryDayBlock` via CSS responsivo — esta tela só guarda QUAL dia está
// expandido (`expandedDate`, um único valor por vez, nunca um Set — reflete
// literalmente "um dia expandido por vez") e o passa como prop controlada.
// Primeiro dia do range começa expandido por padrão (decisão de detalhe de
// implementação: mostra conteúdo imediatamente ao carregar, sem exigir um
// clique extra do usuário para ver o primeiro dia da viagem).
//
// ============================================================================
// INTEGRAÇÃO COM A SERVER ACTION DE L10-T03 (`@/lib/actions/roteiro`, tarefa
// paralela a esta, mesmo lote — TASK.md Seção 4/Lote 10, mesmo padrão de
// L8-T02/L8-T03 e L9-T02/L9-T03). `@/lib/actions/roteiro.ts` passou a existir
// ainda durante esta mesma tarefa (a outra instância paralela terminou
// primeiro), então esta tela já importa e consome as funções reais (mesmo
// padrão de `HospedagemSugestoesScreen`/`@/lib/actions/hospedagem`) em vez de
// manter uma prop de ações obrigatória especulativa — reduz risco de
// divergência.
//
// Duas funções, sem `encerrarResolucao` (T08 é a última etapa; UX-SPEC.md T08
// não menciona "encerrar aqui", diferente de T04/T06/T07):
//   - `gerarRoteiro(sessionId): Promise<RoteiroDayResult[]>` — bate
//     exatamente com o que esta tela esperava.
//   - `aprovarRoteiro(input: { sessionId; dias: RoteiroDayResult[] })`
//     — ponto do contrato real diferente do que esta tela documentava
//     inicialmente (assumia `aprovarRoteiro(sessionId)` sem o roteiro), e a
//     tela foi ajustada para o formato real (não o inverso — a Server Action
//     é a fonte da verdade da regra de negócio, TASK.md Seção 1 item 3):
//     T08 não persiste nenhum estado intermediário entre "gerar" e "aprovar",
//     então o roteiro já carregado (`days`, estado local) é reenviado para
//     `aprovarRoteiro` revalidar e persistir — mesmo princípio de
//     `aprovarSelecaoPasseios` (`passeios.ts`), que recebe `selecionados` em
//     vez de confiar num estado do servidor; nunca confia cegamente no
//     payload do cliente (Diretriz de Implementação 9), cada item é
//     revalidado dentro de `flattenAndValidateDias`/`roteiro.ts`.
//     `AprovarRoteiroResult` real também inclui `totalItens` (total de itens
//     persistidos, só informativo — não usado por esta tela).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import { LoadingStream } from "@/components/design-system/loading-stream";
import { ErrorRetryState } from "@/components/design-system/error-retry-state";
import { ItineraryDayBlock } from "@/components/design-system/itinerary-day-block";
import {
  aprovarRoteiro,
  gerarRoteiro,
  type RoteiroDayResult,
} from "@/lib/actions/roteiro";
import { cn } from "@/lib/utils";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos gerar o roteiro agora — tentar novamente";
const GENERIC_ACTION_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

type ScreenState = "loading" | "error" | "success";

export interface RoteiroScreenProps {
  /** Id da `TripSession` corrente — vem do servidor (querystring resolvida pela rota), nunca decidido no client. */
  sessionId: string;
  className?: string;
  /**
   * Ponto de injeção só para testes automatizados — substitui as Server
   * Actions reais por dublês, sem precisar mockar módulo inteiro. Em
   * produção usa sempre as funções reais de `@/lib/actions/roteiro`.
   */
  actionsOverride?: {
    gerarRoteiro?: typeof gerarRoteiro;
    aprovarRoteiro?: typeof aprovarRoteiro;
  };
}

/**
 * Tela T08 — Roteiro final (UX-SPEC.md Seção 2/4/6, RF-08). Ver bloco
 * "INTEGRAÇÃO COM A SERVER ACTION DE L10-T03" no cabeçalho do arquivo.
 */
export function RoteiroScreen({
  sessionId,
  className,
  actionsOverride,
}: RoteiroScreenProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const actions = {
    gerarRoteiro: actionsOverride?.gerarRoteiro ?? gerarRoteiro,
    aprovarRoteiro: actionsOverride?.aprovarRoteiro ?? aprovarRoteiro,
  };

  const [loadKey, setLoadKey] = useState(0);
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [days, setDays] = useState<RoteiroDayResult[]>([]);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(
    null,
  );
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const [approved, setApproved] = useState<Awaited<
    ReturnType<typeof aprovarRoteiro>
  > | null>(null);
  const [approvePending, setApprovePending] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Foco gerenciado explicitamente na transição de etapa (UX-SPEC.md §5,
  // Diretriz de Implementação 10) — mesmo padrão de
  // `HospedagemSugestoesScreen`/`PasseiosSugestoesScreen`.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const loadingFetchImpl = useCallback(async () => {
    const result = await actions.gerarRoteiro(sessionId);
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
    let parsed: RoteiroDayResult[] = [];
    try {
      parsed = JSON.parse(fullText) as RoteiroDayResult[];
    } catch {
      setLoadErrorMessage(GENERIC_ERROR_MESSAGE);
      setScreen("error");
      return;
    }
    setDays(parsed);
    // Primeiro dia começa expandido (ver cabeçalho do arquivo).
    setExpandedDate(parsed[0]?.date ?? null);
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

  function toggleDay(date: string) {
    setExpandedDate((current) => (current === date ? null : date));
  }

  async function handleAprovarRoteiro() {
    setApproveError(null);
    setApprovePending(true);
    try {
      const result = await actions.aprovarRoteiro({ sessionId, dias: days });
      setApproved(result);
    } catch {
      setApproveError(GENERIC_ACTION_ERROR_MESSAGE);
    } finally {
      setApprovePending(false);
    }
  }

  function handleVerResumo() {
    if (!approved) return;
    const params = new URLSearchParams({
      sessionId,
      flowState: "concluida",
    });
    // Servidor já confirmou o avanço (`aprovarRoteiro` encadeia
    // aprovar+avançar, ver contrato no cabeçalho) — este `push` é só
    // navegação client-side (mesmo padrão de `PasseiosSugestoesScreen`).
    router.push(`/encerramento?${params.toString()}`);
  }

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6",
        className,
      )}
    >
      <StepperProgress
        currentState={approved ? "roteiro_aprovado" : "roteiro_pendente"}
      />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Seu roteiro dia a dia
      </h1>

      {screen === "loading" && (
        <LoadingStream
          key={loadKey}
          input="gerar-roteiro"
          label="Gerando o roteiro do seu dia a dia"
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
          <div className="flex flex-col gap-4">
            {days.map((day) => (
              <ItineraryDayBlock
                key={day.date}
                date={day.date}
                morning={day.morning}
                afternoon={day.afternoon}
                evening={day.evening}
                expanded={expandedDate === day.date}
                onToggle={() => toggleDay(day.date)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            {approveError && (
              <div
                role="alert"
                className="flex items-center gap-2 text-sm text-error"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <p>{approveError}</p>
              </div>
            )}

            <Button
              type="button"
              variant="default"
              className="min-h-11"
              disabled={approvePending}
              aria-busy={approvePending}
              onClick={handleAprovarRoteiro}
            >
              {approvePending ? "Aprovando..." : "Aprovar roteiro e concluir"}
            </Button>
          </div>
        </div>
      )}

      {approved && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-foreground-muted">
            Roteiro aprovado — sua viagem está decidida.
          </p>

          <Button
            type="button"
            variant="default"
            className="min-h-11"
            onClick={handleVerResumo}
          >
            Ver resumo da viagem
          </Button>
        </div>
      )}
    </main>
  );
}
