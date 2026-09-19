"use client";

// V2-L8-T05 — Tela T-MEUS-DET (Roteiro salvo, UX-SPEC.md §8.2 "T-MEUS-DET —
// Roteiro salvo (RF-17.5) — tela nova, reaproveita T-END e T08"): resumo
// igual ao de T-END (`EncerramentoResumoBlocks`, reaproveitado ao pé da
// letra de `@/components/encerramento/encerramento-screen`, sem duplicar
// marcação) + os dias do roteiro em `ItineraryDayBlock` no modo `readOnly`
// novo (V2-L8-T05, `@/components/design-system/itinerary-day-block`) quando
// `flowState === "concluida"`.
//
// Camada de apresentação PURA (mesmo princípio de `EncerramentoScreen`,
// L10-T04): recebe `resumo`/`flowState`/`statusLabel`/`dias` já resolvidos
// pelo Server Component da rota (`src/app/meus-roteiros/[sessionId]/page.tsx`)
// — não busca dados por conta própria.
//
// Diferença central em relação a `EncerramentoScreen`: aqui o rótulo de
// status vem do MESMO vocabulário de "Meus roteiros" (`rotuloDaSessao`,
// `@/lib/actions/meus-roteiros-label`, RF-17.3 — "Roteiro concluído"/
// "Encerrada em {etapa}"), não do rótulo de T-END ("Viagem decidida!"/"Parte
// decidida") — UX-SPEC.md §8.2 T-MEUS-DET: "Bloco de resumo igual ao de
// T-END, com rótulo de status" (o rótulo em si não é o de T-END). Calculado
// no servidor (função pura, sem I/O) e passado já pronto via prop, para não
// duplicar a regra de RF-17.3 aqui.
import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Flag } from "lucide-react";

import {
  EncerramentoResumoBlocks,
  type EncerramentoResumo,
} from "@/components/encerramento/encerramento-screen";
import { ItineraryDayBlock } from "@/components/design-system/itinerary-day-block";
import type { RoteiroDayResult } from "@/lib/actions/obter-roteiro-leitura";
import { cn } from "@/lib/utils";

/** Mesmo vocabulário de `EncerramentoFlowState` — só os dois estados terminais chegam a esta tela (RF-17.5). */
export type RoteiroSalvoFlowState = "concluida" | "encerrada_parcial";

export interface RoteiroSalvoScreenProps {
  flowState: RoteiroSalvoFlowState;
  resumo: EncerramentoResumo;
  /** Rótulo de status (RF-17.3), já calculado por `rotuloDaSessao` no servidor. */
  statusLabel: string;
  /**
   * Dias do roteiro em modo leitura (V2-L8-T03, `obterRoteiroLeitura`) —
   * só presente quando `flowState === "concluida"` (UX-SPEC.md §8.2: "Se
   * encerrada sem roteiro: só o resumo"). `null`/vazio não renderiza a
   * seção do roteiro.
   */
  dias: RoteiroDayResult[] | null;
  /**
   * Etapa em que a viagem foi encerrada (RF-17.3, mesma regra de
   * `rotuloDaSessao`: passeios, senão hospedagem, senão destino) — só
   * relevante quando `flowState === "encerrada_parcial"`. Calculada pelo
   * Server Component da rota, para não duplicar a regra de `rotuloDaSessao`
   * aqui (fonte única de verdade).
   */
  etapaEncerrada?: string;
  className?: string;
}

/**
 * Tela T-MEUS-DET — Roteiro salvo (UX-SPEC.md §8.2, RF-17.5).
 */
export function RoteiroSalvoScreen({
  flowState,
  resumo,
  statusLabel,
  dias,
  etapaEncerrada,
  className,
}: RoteiroSalvoScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Foco gerenciado explicitamente na transição de etapa (UX-SPEC.md §5,
  // mesmo padrão de todas as demais telas do produto).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const isComplete = flowState === "concluida";
  const StatusIcon = isComplete ? CheckCircle2 : Flag;

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6",
        className,
      )}
    >
      <Link
        href="/meus-roteiros"
        className="text-sm text-foreground-muted underline-offset-2 hover:underline"
      >
        ← Meus roteiros
      </Link>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Sua viagem
      </h1>

      {/*
        Rótulo de status (RF-17.3), mesmo tratamento de "confirmação de
        valor entregue" já usado em `EncerramentoScreen` — nunca
        `role="alert"`, nunca tokens semânticos de erro, mesmo quando a
        viagem foi encerrada antecipadamente.
      */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <StatusIcon className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
        <p className="font-serif text-xl text-foreground">{statusLabel}</p>
      </div>

      <EncerramentoResumoBlocks resumo={resumo} />

      {isComplete ? (
        dias && dias.length > 0 ? (
          <div className="flex flex-col gap-4" data-print-hide>
            <h2 className="font-serif text-xl text-foreground">
              Seu roteiro
            </h2>
            {dias.map((day) => (
              <ItineraryDayBlock
                key={day.date}
                date={day.date}
                morning={day.morning}
                afternoon={day.afternoon}
                evening={day.evening}
                readOnly
              />
            ))}
          </div>
        ) : null
      ) : (
        <p className="text-sm text-foreground-muted">
          Esta viagem foi encerrada em {etapaEncerrada ?? "destino"}.
        </p>
      )}
    </main>
  );
}
