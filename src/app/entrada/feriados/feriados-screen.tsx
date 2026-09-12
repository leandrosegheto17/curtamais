"use client";

// L6-T04 — Tela T02 (UX-SPEC.md Seção 2/3, RF-02.1/RF-02.2): lista de
// feriados nacionais (ano corrente + seguinte) com a emenda calculada, mais
// campo opcional de destino aplicado ao feriado escolhido ("mesma UX de
// T01", UX-SPEC Seção 2).
//
// RL6-T03 (Bloqueio 006, resolvido): conecta o botão "Continuar" desta tela
// à Server Action `processarFeriadoEscolhido` (L6-T05,
// `@/lib/actions/feriados`) e à navegação pós-confirmação do servidor,
// mesmo padrão de RL6-T02/RL6-T04 — nenhuma navegação client-side otimista
// antes da Promise resolver (Diretriz de Implementação 3 do TASK.md,
// ADR-006). O botão só habilita quando `selectedKey !== null`; estado de
// pendência via `aria-busy`, erro acessível via `role="alert"` (ícone +
// texto), mesmo padrão de `DestinoConfirmacaoScreen` (L7-T04) e
// `HospedagemSugestoesScreen` (L8-T02).
//
// `ProcessarFeriadoEscolhidoResult` não devolve o texto do destino já
// sanitizado pelo servidor — mudar esse contrato está fora do escopo desta
// tarefa (TASK.md, RL6-T03). Por isso, ao navegar para
// `/destino/confirmacao`, o `destino` da querystring é o mesmo texto já
// digitado localmente pelo usuário, apenas trimado.
//
// T02 não depende de nenhuma geração por LLM (cálculo determinístico local,
// ADR-007) — por isso não usa `LoadingStream`/`ErrorRetryState`/`EmptyState`
// (UX-SPEC.md Seção 4: "Não aplicável... T02 usa cálculo determinístico
// local, instantâneo").
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HolidayListItem } from "@/components/design-system/holiday-list-item";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import {
  processarFeriadoEscolhido,
  type FeriadoProlongado,
} from "@/lib/actions/feriados";

const GENERIC_ERROR_MESSAGE =
  "Não conseguimos concluir agora. Tente novamente.";

export interface FeriadosScreenProps {
  feriados: FeriadoProlongado[];
  /**
   * Ponto de injeção só para testes automatizados — substitui a Server
   * Action real por um dublê, sem precisar mockar o módulo inteiro (mesmo
   * padrão de `HospedagemSugestoesScreen`, L8-T02). Em produção usa sempre
   * `processarFeriadoEscolhido` de `@/lib/actions/feriados`.
   */
  actionOverride?: typeof processarFeriadoEscolhido;
}

/** Chave estável por feriado (ano corrente + seguinte podem repetir nome). */
function holidayKey(holiday: FeriadoProlongado): string {
  return holiday.date.toISOString();
}

export function FeriadosScreen({
  feriados,
  actionOverride,
}: FeriadosScreenProps) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destinoInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const action = actionOverride ?? processarFeriadoEscolhido;

  // Foco gerenciado na tela de entrada (UX-SPEC.md Seção 5): o título da
  // etapa recebe foco ao montar, para leitores de tela em um fluxo linear.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleContinuar() {
    if (selectedKey === null) {
      return;
    }

    setError(null);
    setIsPending(true);

    const trimmedDestino = destino.trim();

    try {
      const result = await action({
        holidayDate: selectedKey,
        destino: trimmedDestino || undefined,
      });

      const params = new URLSearchParams({ sessionId: result.sessionId });

      if (result.flowState === "destino_confirmado") {
        params.set("destino", trimmedDestino);
        params.set("flowState", "destino_confirmado");
        router.push(`/destino/confirmacao?${params.toString()}`);
        return;
      }

      router.push(`/destino?${params.toString()}`);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      setIsPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <StepperProgress currentState="entrada_selecionada" />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Escolha um feriado prolongado
      </h1>
      <p className="text-sm text-foreground-muted">
        Feriados nacionais do ano corrente e do próximo, já com a emenda de
        fim de semana calculada.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Feriados prolongados disponíveis</legend>
        {feriados.map((holiday) => {
          const key = holidayKey(holiday);
          return (
            <HolidayListItem
              key={key}
              id={`feriado-${key}`}
              groupName="feriado-escolhido"
              name={holiday.name}
              label={holiday.label}
              selected={selectedKey === key}
              onSelect={() => setSelectedKey(key)}
            />
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={destinoInputId}
          className="text-sm font-medium text-foreground"
        >
          Destino (opcional)
        </label>
        <input
          id={destinoInputId}
          type="text"
          required={false}
          aria-required="false"
          value={destino}
          onChange={(event) => setDestino(event.target.value)}
          placeholder="Ex.: Gramado, RS"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="text-xs text-foreground-muted">
          Aplicado ao feriado escolhido acima. Deixe em branco para decidir o
          destino depois.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <Button
        type="button"
        variant="default"
        className="min-h-11"
        disabled={selectedKey === null || isPending}
        aria-busy={isPending}
        onClick={handleContinuar}
      >
        {isPending ? "Continuando..." : "Continuar"}
      </Button>
    </main>
  );
}
