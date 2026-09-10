"use client";

// L6-T04 — Tela T02 (UX-SPEC.md Seção 2/3, RF-02.1/RF-02.2): lista de
// feriados nacionais (ano corrente + seguinte) com a emenda calculada, mais
// campo opcional de destino aplicado ao feriado escolhido ("mesma UX de
// T01", UX-SPEC Seção 2).
//
// Escopo explícito desta tarefa (TASK.md L6-T04): só a UI de seleção. O
// processamento da escolha (feriado + destino opcional → range de datas,
// RF-02.3) é a Server Action de L6-T05, ainda não implementada — por isso
// não há aqui nenhum botão de "continuar"/submissão real: adicionar um agora
// exigiria fingir uma transição de etapa sem confirmação do servidor
// (Diretriz de Implementação 3 do TASK.md, ADR-006), o que é proibido. O
// ponto de entrada para L6-T05 (estado selecionado + valor do campo de
// destino) já fica isolado neste componente, pronto para ser conectado
// quando aquela Server Action existir.
//
// T02 não depende de nenhuma geração por LLM (cálculo determinístico local,
// ADR-007) — por isso não usa `LoadingStream`/`ErrorRetryState`/`EmptyState`
// (UX-SPEC.md Seção 4: "Não aplicável... T02 usa cálculo determinístico
// local, instantâneo").
import { useEffect, useId, useRef, useState } from "react";

import { HolidayListItem } from "@/components/design-system/holiday-list-item";
import { StepperProgress } from "@/components/design-system/stepper-progress";
import type { FeriadoProlongado } from "@/lib/actions/feriados";

export interface FeriadosScreenProps {
  feriados: FeriadoProlongado[];
}

/** Chave estável por feriado (ano corrente + seguinte podem repetir nome). */
function holidayKey(holiday: FeriadoProlongado): string {
  return holiday.date.toISOString();
}

export function FeriadosScreen({ feriados }: FeriadosScreenProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const destinoInputId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Foco gerenciado na tela de entrada (UX-SPEC.md Seção 5): o título da
  // etapa recebe foco ao montar, para leitores de tela em um fluxo linear.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
    </main>
  );
}
