// L3-T01 — Interface interna abstrata do Gateway de IA (ADR-002/003, SDD.md
// Seção 1/2).
//
// Fronteira desta camada (TASK.md Seção 1, itens 1 e 2 / GUARDRAILS.md
// regras 7 e 8): esta é a ÚNICA porta de entrada para chamadas ao provider
// de LLM em todo o projeto. Nenhuma tela ou Server Action fora deste módulo
// pode importar `openai` diretamente ou fazer `fetch` cru para a API da
// OpenAI (TASK.md Seção 1, item 12). Toda resposta é consumida via JSON
// mode/structured outputs (schema Zod por chamada) — nunca parsing de texto
// livre de resposta de LLM.
//
// Escopo desta tarefa (L3-T01): só o client + esta interface + validação de
// que a saída bate com um schema. As tarefas seguintes do Lote 3 constroem
// em cima deste ponto de extensão, sem alterar sua fronteira pública:
// - L3-T02: prompt design por etapa (usa `messages`/`schema` deste módulo).
// - L3-T03: validação de plausibilidade de preço/grounding de data (roda
//   sobre o `data` já retornado por `generateStructuredCompletion`).
// - L3-T04: retry único automático + escrita em `LlmGenerationLog` (deve
//   envolver a chamada a `generateStructuredCompletion` feita aqui).
// - L3-T05 (IMPLEMENTADA nesta tarefa): rate limiting por sessão/IP — ver
//   `checkGatewayIaRateLimit` abaixo, guarda a ser chamada pelo Orquestrador
//   de Sessão/Server Action da etapa ANTES de `generateStructuredCompletion`.
// Nenhuma outra lógica listada acima é implementada nesta tarefa.

import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "./client";
import { registerGatewayIaCall } from "./rate-limit";

export {
  getGatewayIaRateLimitPerMinute,
  resetGatewayIaRateLimitForTests,
} from "./rate-limit";

/** Papel de uma mensagem enviada ao provider — sem "assistant" nesta versão porque o Gateway de IA (L3-T02+) monta prompts de uma única rodada por etapa, sem histórico de conversa em texto livre (ADR-003: contexto acumulado estruturado, não texto livre). */
export type GatewayIaRole = "system" | "user";

export type GatewayIaMessage = {
  role: GatewayIaRole;
  content: string;
};

export type StructuredCompletionRequest<Schema extends z.ZodTypeAny> = {
  /**
   * Nome curto e estável do schema desta chamada (ex.: "destino_sugestoes",
   * "hospedagem_opcoes"). Usado como nome do JSON Schema enviado à OpenAI e,
   * futuramente (L3-T04), como identificador em `LlmGenerationLog`.
   */
  schemaName: string;
  /**
   * Schema Zod que valida e tipa a saída estruturada desta chamada. Cada
   * etapa do fluxo guiado (destino/hospedagem/passeios/roteiro, L3-T02)
   * define o seu próprio schema — este módulo é agnóstico ao formato.
   */
  schema: Schema;
  /**
   * Mensagens da chamada. A composição do prompt por etapa (contexto
   * acumulado, dados já aprovados, orçamento, datas) é responsabilidade do
   * chamador (L3-T02/ADR-003) — este módulo não conhece o domínio de
   * viagens, só encaminha mensagens e valida a saída estruturada.
   */
  messages: GatewayIaMessage[];
  /**
   * Temperatura da chamada. Default conservador (0.4) para saída mais
   * previsível, alinhado à mitigação de alucinação do ADR-003; o chamador
   * pode ajustar por etapa se necessário.
   */
  temperature?: number;
};

export type StructuredCompletionUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type StructuredCompletionResult<T> = {
  /** Dado já validado e tipado contra o schema informado. */
  data: T;
  /** Modelo efetivamente usado na chamada (ADR-002). */
  model: string;
  /**
   * Metadados de uso da chamada, expostos para uso futuro por observabilidade
   * (L3-T04/`LlmGenerationLog`) — este módulo não persiste nada sozinho.
   */
  usage: StructuredCompletionUsage | null;
};

/**
 * Erro de fronteira do Gateway de IA. Todo erro de chamada ao provider
 * (rede, timeout, recusa, resposta que não bate com o schema) é normalizado
 * para este tipo antes de sair do módulo — o chamador nunca precisa
 * conhecer o formato de erro nativo do SDK da OpenAI. Tratamento de
 * retry/log fica em L3-T04.
 */
export class GatewayIaError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GatewayIaError";
    this.cause = cause;
  }
}

/**
 * Guarda de rate limiting (L3-T05, SDD §7 / GUARDRAILS.md regra 19): deve ser
 * chamada pelo Orquestrador de Sessão/Server Action da etapa ANTES de
 * `generateStructuredCompletion`, com uma chave que identifique a sessão
 * (ex. `anon_session_id`/`user_id`, ver `src/lib/anonymous-session.ts`) e/ou
 * o IP da requisição — a composição da chave é decisão do chamador, este
 * módulo só aplica o limite.
 *
 * Limite configurável via `AI_GATEWAY_RATE_LIMIT_PER_MINUTE` (`.env.example`).
 * Ao exceder, lança `GatewayIaError` (mesmo tipo de erro já usado em todo o
 * módulo) — nunca deixa uma exceção não tratada estourar; o chamador trata
 * este erro com o mesmo mecanismo já usado para os demais erros do Gateway
 * de IA (ex. exibindo `ErrorRetryState`).
 */
export function checkGatewayIaRateLimit(key: string): void {
  const allowed = registerGatewayIaCall(key);
  if (!allowed) {
    throw new GatewayIaError(
      "Limite de chamadas ao Gateway de IA excedido para esta sessão/IP. " +
        "Tente novamente em instantes.",
    );
  }
}

/**
 * Interface interna abstrata do Gateway de IA (L3-T01): faz uma chamada ao
 * provider de LLM configurado (ADR-002) usando JSON mode/structured outputs
 * (`response_format` gerado a partir de um schema Zod), e retorna o
 * resultado já validado e tipado contra esse schema — nunca texto livre.
 *
 * Não implementa (fora do escopo de L3-T01, ver cabeçalho do arquivo):
 * retry automático, validação de plausibilidade de preço, escrita em
 * `LlmGenerationLog`. Rate limiting (L3-T05) é uma guarda separada
 * (`checkGatewayIaRateLimit`, acima) — este módulo não a chama
 * automaticamente, para deixar a composição da chave (sessão/IP) a critério
 * do chamador.
 */
export async function generateStructuredCompletion<
  Schema extends z.ZodTypeAny,
>(
  request: StructuredCompletionRequest<Schema>,
): Promise<StructuredCompletionResult<z.infer<Schema>>> {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const completion = await client.chat.completions
    .parse({
      model,
      messages: request.messages,
      response_format: zodResponseFormat(request.schema, request.schemaName),
      temperature: request.temperature ?? 0.4,
    })
    .catch((error: unknown) => {
      throw new GatewayIaError(
        "Falha ao chamar o provider de LLM (OpenAI).",
        error,
      );
    });

  const message = completion.choices[0]?.message;
  if (!message) {
    throw new GatewayIaError(
      "Resposta do provider de LLM sem nenhuma choice.",
    );
  }
  if (message.refusal) {
    throw new GatewayIaError(
      `Provider de LLM recusou a geração: ${message.refusal}`,
    );
  }
  if (message.parsed === null || message.parsed === undefined) {
    throw new GatewayIaError(
      "Resposta do provider de LLM não pôde ser validada contra o schema " +
        `"${request.schemaName}" esperado.`,
    );
  }

  const usage = completion.usage
    ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      }
    : null;

  return {
    // `message.parsed` já foi produzido pelo SDK a partir do
    // `response_format` gerado por `zodResponseFormat(request.schema, ...)`
    // (checado acima quanto a nulo/ausente) — o cast só reconcilia o tipo
    // inferido internamente pelo SDK (`ParsedT`) com `z.infer<Schema>`, sem
    // pular nenhuma validação real de schema.
    data: message.parsed as z.infer<Schema>,
    model: completion.model,
    usage,
  };
}
