// L5-T01 — `StepperProgress` (UX-SPEC.md Seção 3/§5/§6).
//
// Componente de apresentação "burro": recebe o estado da sessão (a mesma
// `SessionFlowState` de `src/lib/session-flow/state-machine.ts`, ADR-006) via
// prop e só renderiza a partir dele — nunca decide/avança etapa sozinho,
// nunca guarda estado de navegação em memória do componente (Diretriz de
// Implementação 3 do TASK.md: "nenhuma navegação client-side otimista").
//
// Granularidade visual (UX-SPEC Seção 3): 4 etapas principais mostradas ao
// usuário — destino → hospedagem → passeios → roteiro — mais grossas que os
// 11 estados internos da state machine (que incluem sub-estados
// `_pendente`/`_confirmado`/`_aprovada(o)` por etapa, úteis para o backend
// mas não para o indicador visual).
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SessionFlowState } from "@/lib/session-flow/state-machine";

/** As 4 etapas principais mostradas no stepper (UX-SPEC.md Seção 3). */
export const STEPPER_STEP_IDS = [
  "destino",
  "hospedagem",
  "passeios",
  "roteiro",
] as const;

export type StepperStepId = (typeof STEPPER_STEP_IDS)[number];

export type StepperStepStatus = "completed" | "current" | "upcoming";

const STEP_LABELS: Record<StepperStepId, string> = {
  destino: "Destino",
  hospedagem: "Hospedagem",
  passeios: "Passeios",
  roteiro: "Roteiro",
};

/**
 * Mapa estado da state machine → progresso visual (etapas concluídas +
 * etapa atual). Ver `SESSION_FLOW_STATES` (L4-T01) para o significado de
 * cada estado.
 *
 * Regra adotada (decisão de detalhe de implementação, documentada aqui por
 * não estar explícita no UX-SPEC.md): assim que uma etapa é aprovada/
 * confirmada (`_confirmado`/`_aprovada(o)`), ela já aparece como `completed`
 * e a etapa seguinte já aparece como `current` — mesmo que a transição
 * formal (`avancar`) para o próximo estado `_pendente` ainda não tenha
 * ocorrido. Isso é consistente para as 3 primeiras etapas (cada uma tem um
 * próximo passo a apontar); a etapa `roteiro` não tem próxima etapa, então
 * `roteiro_aprovado` marca as 4 etapas como `completed` sem `current` (nada
 * mais para apontar até a sessão ser efetivamente `concluida`).
 *
 * `encerrada_parcial` é um caso especial: é um único estado terminal usado a
 * partir de QUALQUER ponto em que ao menos uma etapa já foi aprovada (RN-03),
 * então o estado sozinho não carrega informação suficiente para saber quantas
 * etapas foram aprovadas antes do encerramento — essa informação vive nas
 * entidades filhas persistidas (`DestinationApproval` etc.), fora do escopo
 * desta state machine pura (ver cabeçalho de `state-machine.ts`). Por isso o
 * componente aceita um prop opcional `approvedStepsHint` para desambiguar
 * esse caso quando o chamador já sabe quais etapas foram aprovadas (ex.: a
 * tela T-END, que lê os registros reais); sem o hint, `encerrada_parcial`
 * é renderizado com todas as etapas como `upcoming` (nenhuma marcada como
 * concluída), o que é visualmente conservador mas não incorreto — não é uma
 * lacuna resolvida sozinha em desacordo com o UX-SPEC.md, é um dado que
 * simplesmente não existe nesse nível de abstração; nenhuma tela real usa
 * este caminho ainda (fora de escopo de L5-T01, que não integra com backend).
 */
export function getStepperStepStatuses(
  currentState: SessionFlowState,
  approvedStepsHint?: readonly StepperStepId[],
): Record<StepperStepId, StepperStepStatus> {
  const upcoming = (): Record<StepperStepId, StepperStepStatus> => ({
    destino: "upcoming",
    hospedagem: "upcoming",
    passeios: "upcoming",
    roteiro: "upcoming",
  });

  const withCompletedUpTo = (
    completedSteps: readonly StepperStepId[],
    current: StepperStepId | null,
  ): Record<StepperStepId, StepperStepStatus> => {
    const result = upcoming();
    for (const step of completedSteps) {
      result[step] = "completed";
    }
    if (current) {
      result[current] = "current";
    }
    return result;
  };

  switch (currentState) {
    case "entrada_selecionada":
    case "destino_pendente":
      return withCompletedUpTo([], "destino");
    case "destino_confirmado":
    case "hospedagem_pendente":
      return withCompletedUpTo(["destino"], "hospedagem");
    case "hospedagem_aprovada":
    case "passeios_pendente":
      return withCompletedUpTo(["destino", "hospedagem"], "passeios");
    case "passeios_aprovados":
    case "roteiro_pendente":
      return withCompletedUpTo(["destino", "hospedagem", "passeios"], "roteiro");
    case "roteiro_aprovado":
    case "concluida":
      return withCompletedUpTo(
        ["destino", "hospedagem", "passeios", "roteiro"],
        null,
      );
    case "encerrada_parcial": {
      if (approvedStepsHint && approvedStepsHint.length > 0) {
        return withCompletedUpTo(approvedStepsHint, null);
      }
      return upcoming();
    }
    default: {
      // Exaustividade: se um novo estado for adicionado à state machine sem
      // atualizar este mapa, falha em tempo de compilação (nunca client-side
      // "adivinha" um progresso para estado desconhecido).
      const exhaustiveCheck: never = currentState;
      return exhaustiveCheck;
    }
  }
}

export interface StepperProgressProps {
  /** Estado atual da sessão, vindo do servidor (ADR-006) — nunca inferido no client. */
  currentState: SessionFlowState;
  /** Ver documentação de `getStepperStepStatuses` — só relevante para `encerrada_parcial`. */
  approvedStepsHint?: readonly StepperStepId[];
  className?: string;
}

/**
 * Indicador de progresso do fluxo guiado (UX-SPEC.md Seção 3/§6).
 * Puramente informativo (não há navegação por clique no stepper em nenhuma
 * tela do UX-SPEC.md — o avanço sempre acontece pelos botões de ação de cada
 * etapa) — por isso não há elemento focável aqui: a regra de "navegação por
 * teclado completa" (UX-SPEC §5) é satisfeita por não introduzir nenhum
 * elemento interativo fora de ordem, não por tornar os passos clicáveis.
 *
 * Nenhuma etapa é comunicada só por cor (UX-SPEC §5): cada estado usa
 * ícone (check/círculo) + texto (nome da etapa), a cor `accent`/`success`
 * reforça, nunca substitui, essa distinção.
 */
export function StepperProgress({
  currentState,
  approvedStepsHint,
  className,
}: StepperProgressProps) {
  const statuses = getStepperStepStatuses(currentState, approvedStepsHint);
  const currentStep = STEPPER_STEP_IDS.find((id) => statuses[id] === "current");

  return (
    <nav aria-label="Progresso da viagem" className={cn("w-full", className)}>
      {/* Mobile (< md, UX-SPEC §6): indicador condensado — pontos + rótulo da etapa atual. */}
      <div className="flex items-center gap-3 md:hidden">
        <ol className="flex items-center gap-1.5" role="list">
          {STEPPER_STEP_IDS.map((id) => (
            <li key={id} aria-current={statuses[id] === "current" ? "step" : undefined}>
              <StepDot status={statuses[id]} />
            </li>
          ))}
        </ol>
        <span className="text-sm font-medium text-foreground">
          {currentStep ? STEP_LABELS[currentStep] : "Concluído"}
        </span>
      </div>

      {/* Desktop (>= md, UX-SPEC §6): trilha horizontal completa com nome de todas as etapas. */}
      <ol className="hidden w-full items-center md:flex" role="list">
        {STEPPER_STEP_IDS.map((id, index) => (
          <li key={id} className="flex flex-1 items-center last:flex-none">
            <div
              className="flex items-center gap-2"
              aria-current={statuses[id] === "current" ? "step" : undefined}
            >
              <StepDot status={statuses[id]} />
              <span
                className={cn(
                  "text-sm",
                  statuses[id] === "current" && "font-semibold text-foreground",
                  statuses[id] === "completed" && "font-medium text-foreground",
                  statuses[id] === "upcoming" && "text-foreground-muted",
                )}
              >
                {STEP_LABELS[id]}
              </span>
            </div>
            {index < STEPPER_STEP_IDS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-3 h-px flex-1",
                  statuses[id] === "completed" ? "bg-accent" : "bg-border",
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * RL5-T02: `title` sozinho tem suporte inconsistente em navegação por
 * virtual cursor (leitores de tela não anunciam `title` de forma
 * confiável). Cada `StepDot` mantém o `title` (tooltip visual em mouse
 * hover) mas também expõe o mesmo texto via um `span` `sr-only`, garantindo
 * que o status da etapa seja lido de forma confiável por tecnologia
 * assistiva independentemente de suporte a `title`.
 */
function StepDot({ status }: { status: StepperStepStatus }) {
  if (status === "completed") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
        title="Etapa concluída"
      >
        <span className="sr-only">Etapa concluída</span>
        <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-background"
        title="Etapa atual"
      >
        <span className="sr-only">Etapa atual</span>
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="h-5 w-5 shrink-0 rounded-full border border-border bg-background"
      title="Etapa futura"
    >
      <span className="sr-only">Etapa futura</span>
    </span>
  );
}
