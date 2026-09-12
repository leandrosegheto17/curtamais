"use client";

// L10-T04 — Tela T-END (Encerramento/Resumo, completo ou parcial, UX-SPEC.md
// Seção 2 "T-END — Encerramento (completo ou parcial, RN-03)"). Reutilizada
// em TODO ponto de saída da jornada: T04 ("Só queria decidir o destino —
// encerrar aqui", RF-04.5), T06 (RF-05.4), T07 (RF-07.3, "encerrar aqui") e
// T08 (roteiro aprovado, RF-08.4/RF-09) — todos já navegam para
// `/encerramento?sessionId&flowState=...` (ver
// `DestinoSugestoesScreen`/`HospedagemSugestoesScreen`/
// `PasseiosSugestoesScreen`, Lotes 7-9), levando ou `flowState=
// encerrada_parcial` (encerramento antecipado) ou, quando L10-T03 existir,
// `flowState=concluida` (roteiro aprovado).
//
// Esta tarefa (L10-T04) depende só de L5-T01 (design system) e é
// deliberadamente DESACOPLADA de L10-T01/T02/T03 (T08 — regra de geração e UI
// do roteiro — ainda não implementadas no momento desta tarefa, TASK.md
// Seção 4 "Paralelizável com"): não espera por elas. Por isso este componente
// é uma tela de apresentação PURA — recebe o resumo do que já foi aprovado
// (`resumo`) e o rótulo de status (`flowState`) via prop, já resolvidos por
// quem monta a tela, em vez de buscar dados por conta própria (mesmo
// princípio de `DestinoConfirmacaoScreen`, L7-T04, que recebe o nome do
// destino já resolvido).
//
// GAP CONHECIDO, documentado e não bloqueante (fora da definição desta
// tarefa, que é só "T-END UI" — ver Nota de implementação L10-T04 no
// TASK.md): não existe ainda nenhuma Server Action que leia os registros
// persistidos (`DestinationApproval`/`AccommodationApproval`/
// `ActivityApproval`/`ItineraryItem`, `prisma/schema.prisma`) e monte o
// objeto `EncerramentoResumo` esperado por este componente, nem uma rota
// `/encerramento/page.tsx` que faça essa busca a partir de
// `sessionId`/`flowState` da querystring — mesmo padrão de gap já aceito nas
// notas de L7-T02/L9-T02 (rota apontando para uma tela cuja Server Action
// companion ainda não existe): os links "encerrar aqui" continuam resultando
// em 404 em `/encerramento` até uma tarefa futura (fora deste lote) criar
// essa Server Action + página. Isso não é um desvio de escopo desta tarefa
// nem uma lacuna do UX-SPEC.md (que não define o mecanismo de obtenção de
// dados, só o conteúdo/rótulo da tela, Seção 2) — é uma decisão de fronteira
// dentro da margem do Executor.
import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  StepperProgress,
  type StepperStepId,
} from "@/components/design-system/stepper-progress";
import { PriceRangeBadge } from "@/components/design-system/price-range-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Mesmo vocabulário de `SessionFlowState` (`src/lib/session-flow/
 * state-machine.ts`) — nenhum segundo vocabulário criado aqui. Só os dois
 * estados terminais chegam a esta tela (RN-03): `concluida` (roteiro
 * aprovado, RF-09) ou `encerrada_parcial` (encerramento antecipado a partir
 * de T04/T06/T07).
 */
export type EncerramentoFlowState = "concluida" | "encerrada_parcial";

export interface EncerramentoPasseioResumo {
  name: string;
  free: boolean;
}

/**
 * O que foi aprovado até o ponto de encerramento (UX-SPEC.md Seção 2: "lista
 * o que foi aprovado até aquele ponto (destino / + hospedagem / + passeios /
 * roteiro completo)"). Cada campo ausente/`null` significa "etapa não
 * aprovada ainda" (mesmo princípio do schema Prisma: "linha ausente = etapa
 * não aprovada, não um erro") — nunca renderizado como falha.
 */
export interface EncerramentoResumo {
  destino?: { name: string } | null;
  hospedagem?: { name: string; type: string } | null;
  passeios?: EncerramentoPasseioResumo[] | null;
  /** `true` quando o roteiro final (T08, RF-08) foi aprovado. */
  roteiroAprovado?: boolean;
}

export interface EncerramentoScreenProps {
  flowState: EncerramentoFlowState;
  resumo: EncerramentoResumo;
  /**
   * CTA "Ver isso depois" (UX-SPEC.md Seção 2/§7: "RF-09/ADR-005 — nenhuma
   * tela tem botão explícito de 'salvar'... T-END só informa que o dado está
   * salvo, sem exigir ação adicional do usuário"). Opcional — quando ausente,
   * o botão ainda aparece (reforça a mensagem de "já está salvo") mas não
   * dispara nenhuma navegação, já que o MVP não tem uma tela de "minhas
   * viagens" para onde ir (Fase 2, fora de escopo, `prisma/schema.prisma`
   * cabeçalho).
   */
  onVerDepois?: () => void;
  className?: string;
}

const COMPLETE_LABEL = "Viagem decidida!";
const PARTIAL_LABEL = "Parte da sua viagem está decidida";

function approvedStepsFromResumo(
  resumo: EncerramentoResumo,
): readonly StepperStepId[] {
  const steps: StepperStepId[] = [];
  if (resumo.destino) steps.push("destino");
  if (resumo.hospedagem) steps.push("hospedagem");
  if (resumo.passeios && resumo.passeios.length > 0) steps.push("passeios");
  if (resumo.roteiroAprovado) steps.push("roteiro");
  return steps;
}

/**
 * Tela T-END — Encerramento/Resumo (UX-SPEC.md Seção 2, RN-03). Critério de
 * aceite central: o rótulo de status é sempre uma confirmação de valor
 * entregue, NUNCA um erro/fluxo quebrado — mesmo no caso parcial (por isso
 * usa o mesmo ícone/tom de sucesso nos dois casos, nunca `role="alert"` nem
 * os tokens semânticos de erro, UX-SPEC §3/§5).
 */
export function EncerramentoScreen({
  flowState,
  resumo,
  onVerDepois,
  className,
}: EncerramentoScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Foco gerenciado explicitamente na transição de etapa (UX-SPEC.md §5,
  // mesmo padrão de todas as demais telas T01-T08).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const isComplete = flowState === "concluida";
  const statusLabel = isComplete ? COMPLETE_LABEL : PARTIAL_LABEL;
  const approvedSteps = approvedStepsFromResumo(resumo);

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6",
        className,
      )}
    >
      <StepperProgress
        currentState={flowState}
        approvedStepsHint={approvedSteps}
      />

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-2xl text-foreground focus-visible:outline-none"
      >
        Sua viagem
      </h1>

      {/*
        Rótulo de status (critério de aceite de L10-T04): tratado como uma
        confirmação de valor entregue nos dois casos — nunca `role="alert"`,
        nunca os tokens semânticos de erro (`text-error`/`border-error`),
        mesmo quando `flowState === "encerrada_parcial"` (UX-SPEC.md Seção 2:
        "nunca tratado como erro ou fluxo incompleto/quebrado"). O ícone de
        confirmação (`CheckCircle2`) reforça, nunca substitui, o texto —
        nenhuma informação só por cor (UX-SPEC §5).
      */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <CheckCircle2
          className="h-6 w-6 shrink-0 text-success"
          aria-hidden="true"
        />
        <p className="font-serif text-xl text-foreground">{statusLabel}</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
        {resumo.destino && (
          <ResumoBloco title="Destino">
            <p className="text-foreground">{resumo.destino.name}</p>
          </ResumoBloco>
        )}

        {resumo.hospedagem && (
          <ResumoBloco title="Hospedagem">
            <p className="text-foreground">{resumo.hospedagem.name}</p>
            <p className="text-sm text-foreground-muted">
              {resumo.hospedagem.type}
            </p>
          </ResumoBloco>
        )}

        {resumo.passeios && resumo.passeios.length > 0 && (
          <ResumoBloco title="Passeios">
            <ul className="flex flex-col gap-2" role="list">
              {resumo.passeios.map((passeio, index) => (
                <li
                  key={`${passeio.name}-${index}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-foreground">{passeio.name}</span>
                  {passeio.free && <PriceRangeBadge min={0} max={0} free />}
                </li>
              ))}
            </ul>
          </ResumoBloco>
        )}

        {resumo.roteiroAprovado && (
          <ResumoBloco title="Roteiro">
            <p className="text-foreground">Roteiro completo aprovado.</p>
          </ResumoBloco>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground-muted">
          Tudo já está salvo — você não precisa fazer mais nada agora.
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={onVerDepois}
        >
          Ver isso depois
        </Button>
      </div>
    </main>
  );
}

function ResumoBloco({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-1 flex-col gap-2 rounded-lg border border-border bg-surface p-4 md:min-w-[200px]"
    >
      <h2 className="font-serif text-lg text-foreground">{title}</h2>
      {children}
    </section>
  );
}
