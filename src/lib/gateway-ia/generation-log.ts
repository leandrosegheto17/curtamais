// L3-T04 — Escrita em `LlmGenerationLog` (ADR-004/RNF-05, SDD.md Seção 5,
// `prisma/schema.prisma`, modelo já migrado em L1-T02).
//
// Isolado em arquivo próprio (mesmo padrão de `./rate-limit.ts`) para manter
// `./index.ts` focado na fronteira pública do Gateway de IA. Este é o ÚNICO
// arquivo do módulo `gateway-ia` que toca o Prisma Client diretamente.
//
// Decisão de granularidade do log (lacuna entre a redação da tarefa L3-T04 —
// "grave a cada chamada ao provider, cada tentativa" — e o schema já
// migrado): `LlmGenerationLog.status` só tem DOIS valores possíveis
// (`LlmGenerationStatus`: "success" | "failed_after_retry") — não existe um
// terceiro estado para "esta tentativa isolada falhou, mas ainda vai haver
// retry". Não é possível representar corretamente uma tentativa intermediária
// reprovada sem inventar um valor de enum fora do schema já migrado (proibido
// pelo enunciado da tarefa). Por isso, a decisão tomada aqui (dentro da
// margem de "detalhe de implementação" do papel de Executor, não uma
// alteração de schema) é: grava-se UMA linha por CHAMADA LÓGICA completa ao
// Gateway de IA — a sequência inteira de até 2 tentativas feita por
// `generateStructuredCompletionWithRetry` (`./index.ts`) — nunca uma linha
// por tentativa HTTP crua individual. Isso é consistente com o nome do
// modelo ("LlmGenerationLog", uma geração, não "LlmProviderCallLog") e com os
// dois únicos status suportados. `retryCount` registra quantas tentativas
// ADICIONAIS foram usadas nessa chamada lógica (0 = sucesso já na 1ª
// tentativa; 1 = só teve sucesso, ou falhou definitivamente, na 2ª
// tentativa) — o critério de aceite ("log gravado em sucesso e falha") é
// cumprido integralmente por este desenho, sem inventar nada fora do schema.
//
// Decisão de custo estimado (não há tabela de preços por token no
// SDD.md/PRD-TECNICO.md): preço fixo por 1k tokens, hardcoded abaixo,
// aproximado ao preço público do modelo default do Gateway de IA
// (`gpt-4o-mini`, ADR-002, `./client.ts`) no momento desta implementação.
// Não é uma tabela multi-modelo nem busca preço em tempo real — se
// `OPENAI_MODEL` for reconfigurado para um modelo com preço muito diferente,
// esta estimativa fica imprecisa (aceitável: é uma ESTIMATIVA de
// observabilidade, nunca uma fatura real; manter uma tabela de preços por
// modelo é fora de escopo desta tarefa). Quando a chamada falha antes de
// retornar `usage` (ex. timeout de rede), tokens/custo são gravados como 0 —
// o schema não permite `null` nesses campos (`Int`/`Decimal` não anuláveis),
// então 0 é o valor mais honesto disponível ("nenhum token consumido nesta
// chamada lógica, já que ela não completou").

import { prisma } from "@/lib/prisma";
import type { GatewayIaStage } from "./prompts";

/** Preço aproximado (USD) por 1.000 tokens de entrada do modelo default do Gateway de IA (`gpt-4o-mini`, ADR-002) — ver decisão de custo estimado no cabeçalho deste arquivo. */
const PRICE_PER_1K_INPUT_TOKENS_USD = 0.00015;

/** Preço aproximado (USD) por 1.000 tokens de saída do modelo default do Gateway de IA (`gpt-4o-mini`, ADR-002) — ver decisão de custo estimado no cabeçalho deste arquivo. */
const PRICE_PER_1K_OUTPUT_TOKENS_USD = 0.0006;

/** Nome do provider gravado em `LlmGenerationLog.provider` — único provider suportado hoje (ADR-002, SDK oficial da OpenAI). */
const GATEWAY_IA_PROVIDER_NAME = "openai";

/**
 * Estimativa de custo em USD para a chamada, a partir dos preços fixos acima.
 * Arredondado a 6 casas decimais (mesma precisão de
 * `LlmGenerationLog.costEstimateUsd`, `@db.Decimal(10, 6)`).
 */
export function estimateGatewayIaCostUsd(
  tokensInput: number,
  tokensOutput: number,
): number {
  const cost =
    (tokensInput / 1000) * PRICE_PER_1K_INPUT_TOKENS_USD +
    (tokensOutput / 1000) * PRICE_PER_1K_OUTPUT_TOKENS_USD;
  return Number(cost.toFixed(6));
}

export type LlmGenerationLogInput = {
  /** `TripSession.id` à qual esta chamada pertence (FK obrigatória no schema já migrado) — composto/resolvido pelo chamador (Orquestrador de Sessão, Lote 4+; ainda não existe, ver nota de implementação L3-T04 no TASK.md). */
  sessionId: string;
  /** Etapa do fluxo guiado desta chamada — mesmos valores de `GatewayIaStage`/enum Prisma `LlmStage`. */
  stage: GatewayIaStage;
  /** Identificador estável do prompt/schema desta chamada (hoje reaproveita `StructuredCompletionRequest.schemaName`, ex. "destino_sugestoes" — não existe um mecanismo de versionamento semântico de prompt no projeto ainda; decisão documentada aqui, já sinalizada como uso futuro no comentário de `GATEWAY_IA_SCHEMA_NAMES`, `./schemas.ts`). */
  promptVersion: string;
  /** Tokens de entrada consumidos por esta chamada lógica (0 quando a chamada falhou antes de retornar `usage`). */
  tokensInput: number;
  /** Tokens de saída consumidos por esta chamada lógica (0 quando a chamada falhou antes de retornar `usage`). */
  tokensOutput: number;
  /** Latência (ms) medida ao redor de toda a chamada lógica (todas as tentativas somadas até o resultado final). */
  latencyMs: number;
  /** Tentativas ADICIONAIS usadas (0 = sucesso de primeira; 1 = usou o único retry permitido pelo ADR-004/RNF-05). */
  retryCount: number;
  /** Resultado final desta chamada lógica — só os dois valores suportados pelo enum `LlmGenerationStatus` já migrado. */
  status: "success" | "failed_after_retry";
};

/**
 * Grava uma linha em `LlmGenerationLog` para a chamada lógica concluída
 * (sucesso ou falha final após o retry único do ADR-004/RNF-05). Nunca lança:
 * falha ao GRAVAR o log é tratada como não-fatal para o fluxo principal
 * (observabilidade não deve derrubar uma chamada que teve sucesso no
 * provider) — mas não é engolida silenciosamente, já que não há logger
 * estruturado no projeto ainda (`console.error` é o mecanismo mínimo
 * aceitável, TASK.md L3-T04 item 4).
 */
export async function writeLlmGenerationLog(
  input: LlmGenerationLogInput,
): Promise<void> {
  try {
    await prisma.llmGenerationLog.create({
      data: {
        sessionId: input.sessionId,
        stage: input.stage,
        provider: GATEWAY_IA_PROVIDER_NAME,
        promptVersion: input.promptVersion,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
        costEstimateUsd: estimateGatewayIaCostUsd(
          input.tokensInput,
          input.tokensOutput,
        ),
        latencyMs: input.latencyMs,
        retryCount: input.retryCount,
        status: input.status,
      },
    });
  } catch (error) {
    console.error(
      "[gateway-ia] Falha ao gravar LlmGenerationLog (não-fatal, chamada ao provider já concluída):",
      error,
    );
  }
}
