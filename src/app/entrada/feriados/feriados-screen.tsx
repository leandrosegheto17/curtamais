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
//
// V2-L5-T02 (UX-SPEC.md §8, RF-18.3): `initialFeriadoDate` (vindo de
// `?feriado=AAAA-MM-DD`, já validado no formato por `page.tsx`) pré-seleciona
// o `HolidayListItem` correspondente ao montar, rola até ele e anuncia via
// `aria-live="polite"`. Data ausente/sem formato válido/sem correspondência
// na lista = nenhuma seleção, sem erro visível (mesmo espírito de T01,
// L5-T01: pré-preenchimento é conveniência, nunca bloqueia o fluxo). O
// avanço continua exigindo o clique explícito em "Continuar" (INT-10) — este
// efeito só marca o radio, nunca chama `handleContinuar`. O usuário
// continua livre para trocar a seleção clicando em outro item, como já
// garantido pelo `groupName` de rádio único do `fieldset` (RL6-T03).
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
   * `?feriado=AAAA-MM-DD` (V2-L5-T02, RF-18.3), já validado no formato por
   * `page.tsx`. `undefined` quando ausente ou fora do formato — trata igual
   * a "sem correspondência" (nenhuma seleção, sem erro).
   */
  initialFeriadoDate?: string;
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

/** Data do feriado no formato `AAAA-MM-DD`, para casar com a querystring. */
function holidayDateParam(holiday: FeriadoProlongado): string {
  return holiday.date.toISOString().slice(0, 10);
}

export function FeriadosScreen({
  feriados,
  initialFeriadoDate,
  actionOverride,
}: FeriadosScreenProps) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const destinoInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const action = actionOverride ?? processarFeriadoEscolhido;

  // Foco gerenciado na tela de entrada (UX-SPEC.md Seção 5): o título da
  // etapa recebe foco ao montar, para leitores de tela em um fluxo linear.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // V2-L5-T02 (UX-SPEC.md §8, RF-18.3): casa `initialFeriadoDate` com um item
  // real da lista só uma vez, ao montar. Sem correspondência (data ausente,
  // fora do formato, ou feriado que não existe na lista) = não faz nada,
  // lista renderiza normalmente sem seleção e sem erro visível.
  useEffect(() => {
    if (!initialFeriadoDate) {
      return;
    }

    const match = feriados.find(
      (holiday) => holidayDateParam(holiday) === initialFeriadoDate,
    );

    if (!match) {
      return;
    }

    const key = holidayKey(match);
    setSelectedKey(key);
    setAnnouncement(`Feriado selecionado: ${match.name}, ${match.label}.`);

    const element = document.getElementById(`feriado-${key}`);
    if (element && typeof element.scrollIntoView === "function") {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      element.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* V2-L5-T02 (UX-SPEC.md §8, RF-18.3): anúncio da pré-seleção para
          leitores de tela — região sempre presente no DOM (evita perder o
          anúncio por montar depois do texto), visualmente oculta. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

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
