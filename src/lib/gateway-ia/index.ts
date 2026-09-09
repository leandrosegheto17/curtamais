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
// Escopo original (L3-T01): só o client + esta interface + validação de que
// a saída bate com um schema. As tarefas seguintes do Lote 3 constroem em
// cima deste ponto de extensão, sem alterar sua fronteira pública:
// - L3-T02 (IMPLEMENTADA nesta tarefa): prompt design + schema de saída por
//   etapa (ver `./prompts.ts`/`./schemas.ts`, reexportados abaixo), e a
//   variante de streaming `streamStructuredCompletion` (mecanismo decidido
//   em SPIKE-01: Route Handler + `ReadableStream`, ver TASK.md Seção 2),
//   consumida por `src/app/api/gateway-ia/[etapa]/route.ts`.
// - L3-T03 (IMPLEMENTADA nesta tarefa): validação de plausibilidade de
//   preço/grounding de data (ver `./validation.ts`), integrada dentro de
//   `generateStructuredCompletion` logo após a validação de schema.
// - L3-T04: retry único automático + escrita em `LlmGenerationLog` (deve
//   envolver a chamada a `generateStructuredCompletion` feita aqui, que já
//   inclui a validação de L3-T03).
// - L3-T05 (IMPLEMENTADA): rate limiting por sessão/IP — ver
//   `checkGatewayIaRateLimit` abaixo, guarda a ser chamada pelo Orquestrador
//   de Sessão/Server Action da etapa ANTES de `generateStructuredCompletion`.
// Nenhuma outra lógica listada acima (L3-T04) é implementada aqui.

import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getOpenAIClient, getOpenAIModel } from "./client";
import { GatewayIaError } from "./errors";
import { registerGatewayIaCall } from "./rate-limit";
import { validateGatewayIaOutput } from "./validation";
import type { SessionDateRange } from "./validation";

export {
  getGatewayIaRateLimitPerMinute,
  resetGatewayIaRateLimitForTests,
} from "./rate-limit";

export {
  GATEWAY_IA_STAGE_IDS,
  GATEWAY_IA_STAGES,
  buildDestinoPrompt,
  buildHospedagemPrompt,
  buildPasseiosPrompt,
  buildRoteiroPrompt,
  isGatewayIaStage,
  stageContextSchema,
} from "./prompts";
export type {
  ApprovedAccommodationContext,
  ApprovedActivityContext,
  ApprovedDestinationContext,
  GatewayIaStage,
  GatewayIaStageDefinition,
  StageContext,
} from "./prompts";

export {
  GATEWAY_IA_SCHEMA_NAMES,
  destinoSugestoesSchema,
  hospedagemOpcoesSchema,
  passeiosOpcoesSchema,
  roteiroEstruturadoSchema,
} from "./schemas";
export type {
  DestinoSugestoes,
  HospedagemOpcoes,
  PasseiosOpcoes,
  RoteiroEstruturado,
} from "./schemas";

// L3-T03 — validação de plausibilidade de preço/grounding de data, aplicada
// automaticamente dentro de `generateStructuredCompletion` (abaixo) para as
// 4 etapas do fluxo guiado. Reexportado para permitir que L7-T01/L8-T01/
// L9-T01/L10-T01 (ou testes) invoquem a mesma checagem isoladamente quando
// precisarem, sem duplicar a lógica.
export {
  MAX_PLAUSIBLE_PRICE_BRL,
  MAX_PLAUSIBLE_PRICE_RATIO,
  validateDateGrounding,
  validateGatewayIaOutput,
  validatePricePlausibility,
} from "./validation";
export type { SessionDateRange } from "./validation";

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
  /**
   * Range de datas da sessão (L3-T03, ADR-003) usado para grounding de
   * calendário: quando informado e `schemaName` for o da etapa `roteiro`
   * (`GATEWAY_IA_SCHEMA_NAMES.roteiro`), `generateStructuredCompletion`
   * rejeita a resposta caso alguma data gerada caia fora deste range
   * (ver `./validation.ts`). Opcional porque as etapas destino/hospedagem/
   * passeios não geram datas na saída — só a etapa roteiro precisa informar
   * isto (mesmos valores de `StageContext.dateRangeStart/End`, `./prompts.ts`).
   */
  sessionDateRange?: SessionDateRange;
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

// `GatewayIaError` vive em `./errors.ts` desde L3-T03 (extraído sem mudança
// de comportamento, só para permitir que `./validation.ts` reutilize o
// mesmo tipo sem criar um ciclo de import com este arquivo) — reexportado
// aqui para manter a API pública (`import { GatewayIaError } from
// "@/lib/gateway-ia"`) idêntica à de antes desta tarefa.
export { GatewayIaError } from "./errors";

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
 * (`response_format` gerado a partir de um schema Zod), retorna o
 * resultado já validado contra esse schema (nunca texto livre) e, desde
 * L3-T03, também já validado semanticamente (plausibilidade de preço +
 * grounding de data/calendário, `./validation.ts`) — uma resposta reprovada
 * nunca é devolvida ao chamador, sempre vira `GatewayIaError`.
 *
 * Não implementa (fora do escopo desta função, ver cabeçalho do arquivo):
 * retry automático nem escrita em `LlmGenerationLog` (L3-T04) — hoje uma
 * resposta reprovada por `validateGatewayIaOutput` simplesmente propaga o
 * erro na primeira tentativa; L3-T04 deve envolver esta chamada inteira
 * (incluindo a validação) num laço de exatamente 1 retry automático antes de
 * expor o erro ao chamador, e logar cada tentativa em `LlmGenerationLog`.
 * Rate limiting (L3-T05) é uma guarda separada (`checkGatewayIaRateLimit`,
 * acima) — este módulo não a chama automaticamente, para deixar a
 * composição da chave (sessão/IP) a critério do chamador.
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

  // L3-T03: validação semântica pós-schema (plausibilidade de preço +
  // grounding de data/calendário, ver `./validation.ts`). Lança
  // `GatewayIaError` diretamente (mesmo tipo já usado acima) quando reprova —
  // uma resposta implausível/fora do range de datas nunca chega ao chamador.
  validateGatewayIaOutput(
    request.schemaName,
    message.parsed,
    request.sessionDateRange,
  );

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

/**
 * Variante de streaming de `generateStructuredCompletion` (L3-T02, aplica o
 * mecanismo decidido no SPIKE-01: Route Handler + `ReadableStream`, ver
 * TASK.md Seção 2). Usada pelo Route Handler de streaming por etapa
 * (`src/app/api/gateway-ia/[etapa]/route.ts`) — nenhum outro lugar do
 * projeto deve chamar `client.chat.completions.stream` diretamente (TASK.md
 * Seção 1, item 1: fronteira do Gateway de IA).
 *
 * Ainda usa `response_format` com o schema Zod da etapa (JSON mode/structured
 * outputs, ADR-002/003) — os deltas emitidos são fragmentos do JSON
 * estruturado sendo montado pelo provider, nunca texto livre reempacotado.
 * Isso mantém a regra "proibido parsing de texto livre" (TASK.md Seção 1,
 * item 2): o formato da resposta continua sendo JSON Schema-constrained, só
 * a ENTREGA ao cliente passa a ser incremental em vez de um único payload.
 *
 * Validação de plausibilidade de preço/grounding de data (L3-T03), retry
 * automático e escrita em `LlmGenerationLog` (L3-T04) não fazem parte desta
 * variante — elas operam sobre o resultado final já validado de
 * `generateStructuredCompletion` (chamada não-streaming), consumida pelas
 * regras de negócio por etapa
 * (L7-T01/L8-T01/L9-T01/L10-T01). Esta função serve apenas para o requisito
 * de streaming perceptível ao usuário (SDD §6, RNF-02) enquanto a geração
 * acontece — a etapa ainda usa `generateStructuredCompletion` internamente
 * (não-streaming) para o fluxo de decisão real, quando essas tarefas
 * existirem.
 */
export function streamStructuredCompletion<Schema extends z.ZodTypeAny>(
  request: StructuredCompletionRequest<Schema>,
): ReadableStream<Uint8Array> {
  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const encoder = new TextEncoder();

  // Hospedado no escopo da função (não dentro de `start`) para que `cancel`
  // (abaixo) também consiga acessar a mesma instância e abortar a chamada ao
  // provider se o cliente parar de ler o stream (ex. navegou para outra
  // etapa antes do streaming terminar).
  let chatStream: ReturnType<typeof client.chat.completions.stream> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const closeWithError = (message: string, cause?: unknown) => {
        if (closed) return;
        closed = true;
        controller.error(new GatewayIaError(message, cause));
      };

      try {
        chatStream = client.chat.completions.stream({
          model,
          messages: request.messages,
          response_format: zodResponseFormat(request.schema, request.schemaName),
          temperature: request.temperature ?? 0.4,
        });
      } catch (error) {
        closeWithError(
          "Falha ao iniciar streaming do provider de LLM (OpenAI).",
          error,
        );
        return;
      }

      chatStream.on("content.delta", ({ delta }) => {
        if (closed || !delta) return;
        controller.enqueue(encoder.encode(delta));
      });

      chatStream.on("error", (error) => {
        closeWithError(
          "Falha durante o streaming do provider de LLM (OpenAI).",
          error,
        );
      });

      chatStream
        .finalChatCompletion()
        .then((completion) => {
          if (closed) return;
          const message = completion.choices[0]?.message;
          if (message?.refusal) {
            closeWithError(
              `Provider de LLM recusou a geração: ${message.refusal}`,
            );
            return;
          }
          closed = true;
          controller.close();
        })
        .catch((error: unknown) => {
          closeWithError(
            "Falha ao finalizar streaming do provider de LLM (OpenAI).",
            error,
          );
        });
    },
    cancel() {
      chatStream?.abort();
    },
  });
}
