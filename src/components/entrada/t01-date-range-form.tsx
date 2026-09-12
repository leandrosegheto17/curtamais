// L6-T02 — T01 UI: form de data livre + validação inline (RF-01.4).
//
// Apresentação + validação client-side pura. NÃO chama nenhuma Server Action
// diretamente — só valida localmente e expõe `onValid` para o chamador
// acoplar a submissão real (Diretriz de Implementação 3 do TASK.md: nenhuma
// navegação client-side otimista; esta tela nunca decide sozinha para onde
// ir, só bloqueia ou libera o avanço local).
//
// RL6-T02 (Bloqueio 006) — `isPending` foi adicionado para que o chamador
// (`src/app/entrada/data-livre/page.tsx`) possa refletir o estado de
// pendência da Server Action `submeterDataLivre` no botão "Continuar"
// (`aria-busy`/`disabled`), mesmo padrão de `DestinoConfirmacaoScreen`
// (L7-T04) — este componente continua sem chamar a Server Action
// diretamente, só expõe o estado visual.
//
// Campos (UX-SPEC.md Seção 4, T01): dois seletores de data (início/fim) e um
// campo opcional de destino (texto — UX-SPEC menciona "autocomplete simples",
// mas não há fonte de dado de destino especificada em nenhum artefato ainda;
// como a Server Action de T01 [L6-T03] é quem decide a ramificação RF-01.2/
// .3 a partir do texto puro do destino, um `<input type="text">` já satisfaz
// o critério de aceite desta tarefa — autocomplete real, se necessário, é
// decisão de uma tarefa futura de UX/dado, não desta).
//
// RF-01.4: SE a data final for anterior à data inicial, ENTÃO rejeita com
// mensagem de erro explícita junto ao campo, sem avançar. Texto exato da
// mensagem não está definido em UX-SPEC.md/PRD-TECNICO.md — decisão de
// detalhe de implementação desta tarefa (documentada na nota de
// implementação L6-T02 do TASK.md): "A data final não pode ser anterior à
// data inicial.". Erro conectado ao campo via `aria-describedby` (UX-SPEC
// Seção 5: "mensagem de erro conectada via aria-describedby") e comunicado
// também por ícone + texto (nunca só cor, UX-SPEC Seção 5).
"use client";

import { useId, useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DATE_ORDER_ERROR_MESSAGE =
  "A data final não pode ser anterior à data inicial.";

export interface DateRangeFormValues {
  dataInicial: string;
  dataFinal: string;
  destino: string;
}

export interface T01DateRangeFormProps {
  /**
   * Chamado só quando a validação local passa (data final >= data inicial).
   * A integração real com a Server Action de T01 (L6-T03) é responsabilidade
   * de quem compõe este componente numa página — este formulário não navega
   * nem persiste nada sozinho.
   */
  onValid?: (values: DateRangeFormValues) => void;
  /**
   * RL6-T02 — reflete o estado de pendência da Server Action disparada pelo
   * chamador a partir de `onValid` (`aria-busy`/`disabled` no botão
   * "Continuar", mesmo padrão de `DestinoConfirmacaoScreen`, L7-T04). `false`
   * por padrão — formulários usados sem integração real (ex.: testes)
   * continuam funcionando sem precisar passar esta prop.
   */
  isPending?: boolean;
  className?: string;
}

/**
 * T01 — Data livre (RF-01). Formulário com validação inline de RF-01.4:
 * bloqueia o avanço (nunca chama `onValid`) e mostra mensagem de erro junto
 * ao campo "Data final" enquanto o range estiver invertido.
 */
export function T01DateRangeForm({
  onValid,
  isPending = false,
  className,
}: T01DateRangeFormProps) {
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [destino, setDestino] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dataFinalErrorId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (dataInicial && dataFinal && dataFinal < dataInicial) {
      // RF-01.4: bloqueia o avanço, sem chamar `onValid` (sem navegar).
      setError(DATE_ORDER_ERROR_MESSAGE);
      return;
    }

    setError(null);
    onValid?.({ dataInicial, dataFinal, destino });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn(
        "flex w-full max-w-md flex-col gap-4 md:mx-auto",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="data-inicial" className="text-sm font-medium text-foreground">
          Data inicial
        </label>
        <input
          id="data-inicial"
          name="dataInicial"
          type="date"
          required
          value={dataInicial}
          onChange={(event) => setDataInicial(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="data-final" className="text-sm font-medium text-foreground">
          Data final
        </label>
        <input
          id="data-final"
          name="dataFinal"
          type="date"
          required
          value={dataFinal}
          onChange={(event) => setDataFinal(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? dataFinalErrorId : undefined}
          className={cn(
            "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            error && "border-error",
          )}
        />
        {error ? (
          <p
            id={dataFinalErrorId}
            role="alert"
            className="flex items-center gap-1.5 text-sm text-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="destino" className="text-sm font-medium text-foreground">
          Destino <span className="text-foreground-muted">(opcional)</span>
        </label>
        <input
          id="destino"
          name="destino"
          type="text"
          value={destino}
          onChange={(event) => setDestino(event.target.value)}
          placeholder="Ex.: Foz do Iguaçu"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <Button
        type="submit"
        className="mt-2 min-h-11"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? "Enviando..." : "Continuar"}
      </Button>
    </form>
  );
}
