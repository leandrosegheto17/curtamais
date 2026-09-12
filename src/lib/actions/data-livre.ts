"use server";

// L6-T03 — Server Action da tela T01 (Data livre, RF-01.2/.3/.4, RF-04, RF-11).
//
// Consome o payload já validado localmente por `T01DateRangeForm`
// (`src/components/entrada/t01-date-range-form.tsx`, L6-T02) e é o primeiro
// ponto do fluxo a de fato criar uma `TripSession` real (nenhuma Server
// Action anterior grava range de datas). Duas responsabilidades distintas,
// nesta ordem:
//
// 1. Validação/sanitização específica desta tela (RF-01.4 revalidado no
//    servidor, formato ISO das datas, sanitização do destino em texto
//    livre) — nada disso pertence ao helper compartilhado abaixo, é
//    específico de como T01 coleta o input.
// 2. Delegar a criação da `TripSession` + a ramificação RF-01.2/.3 (iniciar,
//    e opcionalmente aprovar o destino informado) para
//    `createSessionWithDateRange` (`@/lib/session-flow`) — o mesmo helper
//    usado por L6-T05 (`processarFeriadoEscolhido`, feriado+emenda) e L6-T07
//    (`submitQuizAnswers`, quiz), para que as 3 Server Actions de entrada
//    apliquem exatamente a mesma lógica de criação de sessão + transição, em
//    vez de três implementações potencialmente divergentes da mesma regra de
//    negócio (RF-01.2/.3/RF-02.3 exigem explicitamente "a mesma
//    ramificação"). Esta Server Action NUNCA chama `prisma`/
//    `applySessionFlowTransition` diretamente (Diretriz de Implementação 3 do
//    TASK.md Seção 1) — só o helper.
//
// Ramificação RF-01.2/.3 (critério de aceite desta tarefa, aplicada pelo
// helper): sem destino → só `iniciar` (entrada_selecionada→destino_pendente),
// UI segue para a etapa de sugestão de destino (RF-04, Lote 7); com destino →
// `iniciar` + `aprovar` com `source: "user_provided"`
// (destino_pendente→destino_confirmado), UI segue direto para a etapa de
// confirmação (RF-11, Lote 7), pulando RF-04 (RF-01.3).
//
// Fora de escopo desta tarefa (fica para Lote 7, ainda não iniciado): as
// telas de destino (RF-04)/confirmação (RF-11) em si — esta Server Action só
// retorna `proximaEtapa` para quem já tiver essas telas navegar. Também fora
// de escopo: autorização de dono de sessão (cookie de sessão anônima/usuário
// autenticado, L11-T02 — `applySessionFlowTransition` já documenta essa
// mesma lacuna) e a regra de orçamento (RF-10, L4-T03, ortogonal — esta tela
// não coleta orçamento).

import { createSessionWithDateRange } from "@/lib/session-flow";
import { sanitizeFreeTextForPrompt } from "@/lib/gateway-ia/prompt-injection-guard";
import { InvalidDataLivreInputError } from "./data-livre-errors";
import { InvalidDestinoLengthError } from "./destino-length-error";
import { resolveSessionOwner } from "./resolve-session-owner";

/**
 * Mesmo texto de `DATE_ORDER_ERROR_MESSAGE`
 * (`src/components/entrada/t01-date-range-form.tsx`, L6-T02) — duplicado
 * aqui de propósito em vez de importado: aquele módulo é `"use client"` e
 * esta é uma Server Action; manter os dois desacoplados evita puxar um
 * componente de UI (e seus hooks) para o bundle do servidor só por causa de
 * uma constante de string. Se a mensagem mudar em um lugar, precisa mudar no
 * outro também (nenhum teste de igualdade entre os dois arquivos hoje).
 */
const DATE_ORDER_ERROR_MESSAGE =
  "A data final não pode ser anterior à data inicial.";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Limite de tamanho do destino em texto livre (TASK.md Seção 1, item 9 —
 * todo campo de texto livre do usuário é validado/sanitizado no servidor).
 * Não há um valor definido em UX-SPEC.md/PRD-TECNICO.md para este campo;
 * 200 caracteres é uma decisão de detalhe de implementação desta tarefa
 * (folga generosa para nome de destino real, sem permitir payload
 * arbitrariamente grande indo compor um prompt de LLM em etapas futuras). */
const DESTINO_MAX_LENGTH = 200;

export interface SubmeterDataLivreInput {
  /** Formato `YYYY-MM-DD` (mesmo formato de `<input type="date">`, T01DateRangeForm). */
  dataInicial: string;
  /** Formato `YYYY-MM-DD`. */
  dataFinal: string;
  /** Texto livre opcional — validado/sanitizado nesta função antes de repassar ao helper. */
  destino?: string;
}

export type SubmeterDataLivreResult =
  | {
      /** RF-01.2 — sem destino, segue para a etapa de sugestão (RF-04). */
      proximaEtapa: "destino";
      sessionId: string;
      flowState: "destino_pendente";
    }
  | {
      /** RF-01.3/RF-11 — com destino, aprovado direto, segue para confirmação. */
      proximaEtapa: "confirmacao_destino";
      sessionId: string;
      flowState: "destino_confirmado";
      destino: string;
    };

function parseIsoDateOrThrow(value: string, label: string): Date {
  if (!ISO_DATE_REGEX.test(value)) {
    throw new InvalidDataLivreInputError(`${label} inválida.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidDataLivreInputError(`${label} inválida.`);
  }
  return date;
}

/** Trim + limite de tamanho + sanitização contra prompt injection
 * (L11-T03, SDD.md Seção 7 / GUARDRAILS.md regra 18 — via
 * `sanitizeFreeTextForPrompt`, `@/lib/gateway-ia/prompt-injection-guard`);
 * string vazia (ou só espaços, ou reduzida a vazio pela sanitização) vira
 * `""`, tratado como "sem destino" pelo chamador (mesma regra do form
 * client-side, que já envia `""` quando o campo opcional fica em branco, e
 * do próprio helper `createSessionWithDateRange`, que também trata string
 * vazia/só espaços como "sem destino").
 *
 * RL6-T01: destino acima de `DESTINO_MAX_LENGTH` é REJEITADO (lança
 * `InvalidDestinoLengthError`, `./destino-length-error.ts`), não truncado —
 * antes desta tarefa este era o único dos 3 pontos de captura de destino do
 * Lote 6 que truncava silenciosamente via `sanitizeFreeTextForPrompt(...,
 * { maxLength })` (`String.prototype.slice`); alinhado aqui ao comportamento
 * já usado por `processarFeriadoEscolhido` (`./feriados.ts`), que já
 * rejeitava. O limite é checado sobre o texto já "trimado" mas ANTES da
 * sanitização (mesma ordem de `processarFeriadoEscolhido`), para que o
 * limite reflita o tamanho do texto realmente digitado pelo usuário, não o
 * tamanho depois de neutralizar marcadores/frases de prompt injection. */
function sanitizeDestino(rawDestino: string | undefined): string {
  const trimmed = (rawDestino ?? "").trim();
  if (trimmed.length > DESTINO_MAX_LENGTH) {
    throw new InvalidDestinoLengthError(DESTINO_MAX_LENGTH);
  }
  return sanitizeFreeTextForPrompt(trimmed, {
    maxLength: DESTINO_MAX_LENGTH,
  });
}

/**
 * Server Action de T01 (Data livre). Recebe o payload já validado
 * client-side por `T01DateRangeForm` (L6-T02), revalida no servidor (Diretriz
 * de Implementação 3 — nenhuma navegação client-side otimista, toda transição
 * depende de confirmação do servidor) e delega a criação da sessão + a
 * ramificação RF-01.2/.3 para `createSessionWithDateRange`
 * (`@/lib/session-flow`), o mesmo helper compartilhado com L6-T05/L6-T07.
 */
export async function submeterDataLivre(
  input: SubmeterDataLivreInput,
): Promise<SubmeterDataLivreResult> {
  if (!input.dataInicial || !input.dataFinal) {
    throw new InvalidDataLivreInputError(
      "Data inicial e data final são obrigatórias.",
    );
  }

  const dateRangeStart = parseIsoDateOrThrow(input.dataInicial, "Data inicial");
  const dateRangeEnd = parseIsoDateOrThrow(input.dataFinal, "Data final");

  if (dateRangeEnd.getTime() < dateRangeStart.getTime()) {
    // RF-01.4, revalidado no servidor — nunca confia só na checagem client-side.
    throw new InvalidDataLivreInputError(DATE_ORDER_ERROR_MESSAGE);
  }

  const destino = sanitizeDestino(input.destino);
  const owner = await resolveSessionOwner();

  const result = await createSessionWithDateRange({
    entryPath: "data_livre",
    dateRangeStart,
    dateRangeEnd,
    destino,
    owner,
  });

  if (destino.length === 0) {
    return {
      proximaEtapa: "destino",
      sessionId: result.sessionId,
      flowState: "destino_pendente",
    };
  }

  return {
    proximaEtapa: "confirmacao_destino",
    sessionId: result.sessionId,
    flowState: "destino_confirmado",
    destino,
  };
}
