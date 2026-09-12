// L6-T06 — T03a-d Quiz guiado (UX-SPEC.md Seção 2 "T03a-d", RF-03.1/RF-03.3).
//
// Escopo desta tarefa (ver TASK.md, Seção 3, L6-T06): SÓ a navegação
// client-side entre as 4 perguntas do wizard + validação de campo obrigatório
// (período). A geração do range de datas a partir das respostas (RF-03.2) é
// responsabilidade de L6-T07 (Server Action, ainda não implementada) — este
// componente coleta as respostas e as expõe via `onComplete`, mas nunca chama
// nenhuma Server Action/provider de LLM diretamente (Diretriz de Implementação
// 1 do TASK.md).
//
// RN-06 (Diretriz de Implementação 13 do TASK.md): exatamente as 4 perguntas
// de RF-03.1, nesta ordem — nenhuma pergunta extra foi adicionada.
//
// Decisão sobre indicador de progresso ("1 de 4", documentada aqui por não
// estar explícita no UX-SPEC.md além do próprio rótulo):
// `StepperProgress` (L5-T01) é orientado por `SessionFlowState`, a state
// machine SERVIDORA (ADR-006) com granularidade de 4 macro-etapas
// (destino/hospedagem/passeios/roteiro) — ela não tem nenhum conceito das 4
// perguntas internas do quiz, que são um sub-passo client-side *anterior* a
// qualquer chamada ao servidor (a sessão sequer tem destino ainda). Reusar
// `StepperProgress` aqui seria incorreto: ou (a) forçaria a state machine do
// servidor a conhecer sub-estados do quiz que não são dela (violando "state
// machine é a única fonte de verdade", Diretriz 3), ou (b) o indicador visual
// mentiria sobre o real progresso do fluxo de sessão. Por isso este arquivo
// define um indicador de progresso PRÓPRIO e local ao wizard
// (`QuizProgressIndicator`), puramente uma contagem de "pergunta X de 4"
// dentro do sub-fluxo client-side do RF-03 — não navega por clique (mesma
// regra de acessibilidade do `StepperProgress`, UX-SPEC §5) e não é
// reaproveitado fora deste wizard.
"use client";

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** As 4 perguntas fixas do quiz guiado, nesta ordem (RF-03.1, RN-06). */
export const QUIZ_STEP_IDS = [
  "periodo",
  "alcance",
  "experiencia",
  "orcamento",
] as const;

export type QuizStepId = (typeof QUIZ_STEP_IDS)[number];

const TOTAL_STEPS = QUIZ_STEP_IDS.length;

/** RF-03.1(1): período disponível aproximado. */
export const PERIODO_OPTIONS = [
  { value: "fim_de_semana", label: "Fim de semana" },
  { value: "3_a_5_dias", label: "3 a 5 dias" },
  { value: "1_semana", label: "1 semana" },
  { value: "mais_de_1_semana", label: "Mais de 1 semana" },
] as const;

/** RF-03.1(2): alcance geográfico desejado. */
export const ALCANCE_OPTIONS = [
  { value: "brasil", label: "Brasil" },
  { value: "america_do_sul", label: "América do Sul" },
  { value: "eua", label: "EUA" },
  { value: "europa", label: "Europa" },
  { value: "sem_preferencia", label: "Sem preferência" },
] as const;

/** RF-03.1(3): tipo de experiência preferida (multi-select). */
export const EXPERIENCIA_OPTIONS = [
  { value: "praia", label: "Praia" },
  { value: "cidade_urbano", label: "Cidade/urbano" },
  { value: "natureza_aventura", label: "Natureza/aventura" },
  { value: "cultura_historia", label: "Cultura/história" },
] as const;

export interface QuizAnswers {
  /** Obrigatório (RF-03.3) — `null` só antes de responder. */
  periodo: (typeof PERIODO_OPTIONS)[number]["value"] | null;
  /** Opcional — `null` quando pulado ou "sem preferência". */
  alcance: (typeof ALCANCE_OPTIONS)[number]["value"] | null;
  /** Opcional, multi-select — lista vazia quando pulado/"sem preferência". */
  experiencia: Array<(typeof EXPERIENCIA_OPTIONS)[number]["value"]>;
  /** Opcional, texto livre — `null`/string vazia quando pulado. */
  orcamento: string | null;
}

const INITIAL_ANSWERS: QuizAnswers = {
  periodo: null,
  alcance: null,
  experiencia: [],
  orcamento: null,
};

export interface QuizWizardProps {
  /**
   * Chamado quando o usuário conclui a última pergunta (avança ou pula em
   * "orçamento"). Fora do escopo desta tarefa gerar o range de datas a partir
   * disso (L6-T07) — o chamador decide o que fazer com as respostas.
   */
  onComplete?: (answers: QuizAnswers) => void;
  className?: string;
}

/**
 * Wizard de 4 telas sequenciais do quiz guiado (T03a-d, RF-03).
 * Nenhuma navegação client-side otimista é feita em direção à state machine
 * do servidor (Diretriz 3) — este componente só navega entre as 4 perguntas
 * do próprio quiz, um sub-fluxo anterior a qualquer chamada de servidor.
 */
export function QuizWizard({ onComplete, className }: QuizWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(INITIAL_ANSWERS);
  const [periodoError, setPeriodoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const stepId = QUIZ_STEP_IDS[stepIndex];
  const stepNumber = stepIndex + 1;

  function focusHeading() {
    // Diretriz de Implementação 10 (foco gerenciado na transição de etapa).
    // `setTimeout` garante que o DOM da nova pergunta já foi commitado antes
    // do foco ser movido.
    setTimeout(() => headingRef.current?.focus(), 0);
  }

  function goToStep(nextIndex: number) {
    setStepIndex(nextIndex);
    focusHeading();
  }

  function handleAdvanceFromPeriodo(event: FormEvent) {
    event.preventDefault();
    if (!answers.periodo) {
      setPeriodoError("Selecione um período para continuar.");
      return;
    }
    setPeriodoError(null);
    goToStep(stepIndex + 1);
  }

  function handleSkip() {
    goToStep(stepIndex + 1);
  }

  function handleFinish(finalAnswers: QuizAnswers) {
    onComplete?.(finalAnswers);
  }

  function handleBack() {
    if (stepIndex === 0) return;
    goToStep(stepIndex - 1);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-6", className)}>
      <QuizProgressIndicator current={stepNumber} total={TOTAL_STEPS} />

      {stepId === "periodo" && (
        <PeriodoStep
          headingRef={headingRef}
          value={answers.periodo}
          error={periodoError}
          onChange={(value) => {
            setAnswers((prev) => ({ ...prev, periodo: value }));
            setPeriodoError(null);
          }}
          onSubmit={handleAdvanceFromPeriodo}
        />
      )}

      {stepId === "alcance" && (
        <AlcanceStep
          headingRef={headingRef}
          value={answers.alcance}
          onSelect={(value) => {
            setAnswers((prev) => ({ ...prev, alcance: value }));
            goToStep(stepIndex + 1);
          }}
          onSkip={handleSkip}
          onBack={handleBack}
        />
      )}

      {stepId === "experiencia" && (
        <ExperienciaStep
          headingRef={headingRef}
          value={answers.experiencia}
          onToggle={(value) => {
            setAnswers((prev) => {
              const already = prev.experiencia.includes(value);
              return {
                ...prev,
                experiencia: already
                  ? prev.experiencia.filter((item) => item !== value)
                  : [...prev.experiencia, value],
              };
            });
          }}
          onAdvance={() => goToStep(stepIndex + 1)}
          onSkip={handleSkip}
          onBack={handleBack}
        />
      )}

      {stepId === "orcamento" && (
        <OrcamentoStep
          headingRef={headingRef}
          value={answers.orcamento}
          onChange={(value) =>
            setAnswers((prev) => ({ ...prev, orcamento: value }))
          }
          onFinish={() => handleFinish(answers)}
          onSkip={() => handleFinish({ ...answers, orcamento: null })}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

/**
 * Indicador de progresso PRÓPRIO do wizard do quiz — ver justificativa no
 * cabeçalho do arquivo sobre por que não reaproveita `StepperProgress`.
 * Puramente informativo, sem elemento focável (mesma regra do
 * `StepperProgress`, UX-SPEC §5) e com status comunicado por texto (não só
 * visualmente), atualizado via `aria-live` para leitores de tela.
 */
function QuizProgressIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div aria-live="polite" className="text-sm font-medium text-foreground-muted">
      {current} de {total}
    </div>
  );
}

interface StepHeadingProps {
  headingRef: React.RefObject<HTMLHeadingElement>;
  children: React.ReactNode;
}

function StepHeading({ headingRef, children }: StepHeadingProps) {
  return (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="font-serif text-xl text-foreground outline-none"
    >
      {children}
    </h2>
  );
}

interface PeriodoStepProps {
  headingRef: React.RefObject<HTMLHeadingElement>;
  value: QuizAnswers["periodo"];
  error: string | null;
  onChange: (value: QuizAnswers["periodo"]) => void;
  onSubmit: (event: FormEvent) => void;
}

/** (a) Período disponível — obrigatório, sem "Pular" (RF-03.3). */
function PeriodoStep({
  headingRef,
  value,
  error,
  onChange,
  onSubmit,
}: PeriodoStepProps) {
  const groupId = useId();
  const errorId = useId();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <StepHeading headingRef={headingRef}>
        Qual período você tem disponível?
      </StepHeading>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="sr-only">Período disponível</legend>
        {PERIODO_OPTIONS.map((option) => (
          <RadioOption
            key={option.value}
            name={groupId}
            label={option.label}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
        ))}
      </fieldset>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" className="min-h-11">
          Avançar
        </Button>
      </div>
    </form>
  );
}

interface AlcanceStepProps {
  headingRef: React.RefObject<HTMLHeadingElement>;
  value: QuizAnswers["alcance"];
  onSelect: (value: QuizAnswers["alcance"]) => void;
  onSkip: () => void;
  onBack: () => void;
}

/** (b) Alcance geográfico — opcional, "Pular" disponível (RF-03.3). */
function AlcanceStep({
  headingRef,
  value,
  onSelect,
  onSkip,
  onBack,
}: AlcanceStepProps) {
  const groupId = useId();

  return (
    <div className="flex flex-col gap-4">
      <StepHeading headingRef={headingRef}>
        Qual alcance geográfico você prefere?
      </StepHeading>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Alcance geográfico</legend>
        {ALCANCE_OPTIONS.map((option) => (
          <RadioOption
            key={option.value}
            name={groupId}
            label={option.label}
            checked={value === option.value}
            onChange={() => onSelect(option.value)}
          />
        ))}
      </fieldset>
      <StepNav onBack={onBack} onSkip={onSkip} />
    </div>
  );
}

interface ExperienciaStepProps {
  headingRef: React.RefObject<HTMLHeadingElement>;
  value: QuizAnswers["experiencia"];
  onToggle: (value: QuizAnswers["experiencia"][number]) => void;
  onAdvance: () => void;
  onSkip: () => void;
  onBack: () => void;
}

/** (c) Tipo de experiência — opcional, multi-select, "Pular" disponível. */
function ExperienciaStep({
  headingRef,
  value,
  onToggle,
  onAdvance,
  onSkip,
  onBack,
}: ExperienciaStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading headingRef={headingRef}>
        Que tipo de experiência você prefere? (pode escolher mais de uma)
      </StepHeading>
      <div className="flex flex-col gap-2" role="group" aria-label="Tipo de experiência">
        {EXPERIENCIA_OPTIONS.map((option) => (
          <CheckboxOption
            key={option.value}
            label={option.label}
            checked={value.includes(option.value)}
            onChange={() => onToggle(option.value)}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <StepNav onBack={onBack} onSkip={onSkip} />
        <Button type="button" className="min-h-11" onClick={onAdvance}>
          Avançar
        </Button>
      </div>
    </div>
  );
}

interface OrcamentoStepProps {
  headingRef: React.RefObject<HTMLHeadingElement>;
  value: QuizAnswers["orcamento"];
  onChange: (value: string) => void;
  onFinish: () => void;
  onSkip: () => void;
  onBack: () => void;
}

/** (d) Orçamento — opcional, texto livre, "Pular" disponível. */
function OrcamentoStep({
  headingRef,
  value,
  onChange,
  onFinish,
  onSkip,
  onBack,
}: OrcamentoStepProps) {
  const inputId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onFinish();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <StepHeading headingRef={headingRef}>
        Qual orçamento disponível para a viagem? (opcional)
      </StepHeading>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm text-foreground-muted">
          Faixa de valor
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="ex.: R$ 2.000 a R$ 3.500"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <StepNav onBack={onBack} onSkip={onSkip} />
        <Button type="submit" className="min-h-11">
          Concluir
        </Button>
      </div>
    </form>
  );
}

function StepNav({ onBack, onSkip }: { onBack: () => void; onSkip: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="ghost" className="min-h-11" onClick={onBack}>
        Voltar
      </Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={onSkip}>
        Pular
      </Button>
    </div>
  );
}

function RadioOption({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `${name}-${label}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground",
        checked && "border-accent",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );
}

function CheckboxOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground",
        checked && "border-accent",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );
}
