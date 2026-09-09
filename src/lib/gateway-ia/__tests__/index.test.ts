// @vitest-environment node
//
// L3-T01 — Client OpenAI + interface interna abstrata do Gateway de IA
// (ADR-002). Critério de aceite: uma chamada de teste retorna JSON validado
// contra um schema simples; API key só via env.
//
// O SDK da OpenAI é mockado (`vi.mock("openai", ...)`) — nenhuma chamada de
// rede real acontece neste teste (ADR-002/003 pedem determinismo em teste;
// retry/log real são L3-T04, fora de escopo aqui).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GatewayIaError, generateStructuredCompletion } from "@/lib/gateway-ia";
import { resetOpenAIClientForTests } from "@/lib/gateway-ia/client";
import { GATEWAY_IA_SCHEMA_NAMES, roteiroEstruturadoSchema } from "@/lib/gateway-ia/schemas";

const parseMock = vi.fn();

// `vi.mock` é hoisted pelo Vitest para o topo do módulo, antes dos imports
// acima — client.ts usa `import OpenAI from "openai"`, que resolve para este
// mock em tempo de teste (nenhuma chamada de rede real acontece aqui).
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          parse: parseMock,
        },
      },
    })),
  };
});

const destinoSchema = z.object({
  destino: z.string(),
  justificativa: z.string(),
});

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

describe("generateStructuredCompletion (Gateway de IA)", () => {
  beforeEach(() => {
    resetOpenAIClientForTests();
    parseMock.mockReset();
    process.env.OPENAI_API_KEY = "sk-test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  afterEach(() => {
    resetOpenAIClientForTests();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  });

  it("retorna dado JSON já validado e tipado contra o schema informado (critério de aceite)", async () => {
    parseMock.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      choices: [
        {
          message: {
            parsed: {
              destino: "Foz do Iguaçu",
              justificativa: "Dentro do orçamento informado e clima ameno no período.",
            },
            refusal: null,
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
    });

    const result = await generateStructuredCompletion({
      schemaName: "destino_sugestao_teste",
      schema: destinoSchema,
      messages: [
        { role: "system", content: "Você sugere destinos de viagem." },
        { role: "user", content: "Sugira um destino." },
      ],
    });

    // Validação real contra o schema Zod (não apenas shape solto) — garante
    // que o dado devolvido bate com o schema, não é texto livre reempacotado.
    expect(() => destinoSchema.parse(result.data)).not.toThrow();
    expect(result.data.destino).toBe("Foz do Iguaçu");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.usage).toEqual({
      promptTokens: 120,
      completionTokens: 40,
      totalTokens: 160,
    });

    // A chamada real ao SDK usou JSON mode/structured outputs (response_format
    // com schema), nunca texto livre — critério "proibido parsing de texto
    // livre" do TASK.md Seção 1, item 2.
    expect(parseMock).toHaveBeenCalledTimes(1);
    const callArgs = parseMock.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-4o-mini");
    expect(callArgs.response_format).toBeDefined();
    expect(callArgs.response_format.type).toBe("json_schema");
  });

  it("lança erro explícito se OPENAI_API_KEY não estiver configurada (env-only)", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateStructuredCompletion({
        schemaName: "destino_sugestao_teste",
        schema: destinoSchema,
        messages: [{ role: "user", content: "Sugira um destino." }],
      }),
    ).rejects.toThrow(/OPENAI_API_KEY/);

    expect(parseMock).not.toHaveBeenCalled();
  });

  it("normaliza falha do SDK em GatewayIaError, sem expor o erro nativo da OpenAI", async () => {
    parseMock.mockRejectedValueOnce(new Error("network timeout"));

    await expect(
      generateStructuredCompletion({
        schemaName: "destino_sugestao_teste",
        schema: destinoSchema,
        messages: [{ role: "user", content: "Sugira um destino." }],
      }),
    ).rejects.toBeInstanceOf(GatewayIaError);
  });

  it("lança GatewayIaError quando a resposta não pôde ser validada contra o schema", async () => {
    parseMock.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      choices: [{ message: { parsed: null, refusal: null } }],
      usage: null,
    });

    await expect(
      generateStructuredCompletion({
        schemaName: "destino_sugestao_teste",
        schema: destinoSchema,
        messages: [{ role: "user", content: "Sugira um destino." }],
      }),
    ).rejects.toThrow(GatewayIaError);
  });

  it("lança GatewayIaError quando o provider recusa a geração", async () => {
    parseMock.mockResolvedValueOnce({
      model: "gpt-4o-mini",
      choices: [
        { message: { parsed: null, refusal: "conteúdo não permitido" } },
      ],
      usage: null,
    });

    await expect(
      generateStructuredCompletion({
        schemaName: "destino_sugestao_teste",
        schema: destinoSchema,
        messages: [{ role: "user", content: "Sugira um destino." }],
      }),
    ).rejects.toThrow(/recusou/);
  });

  // L3-T03 — validação de plausibilidade de preço + grounding de data,
  // integrada dentro de `generateStructuredCompletion` (critério de aceite:
  // "resposta com preço fora de faixa plausível é rejeitada/reprocessada;
  // datas geradas nunca conflitam com o range da sessão").
  describe("validação de plausibilidade de preço/grounding de data (L3-T03)", () => {
    it("rejeita com GatewayIaError quando a etapa destino retorna preço implausível", async () => {
      parseMock.mockResolvedValueOnce({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              parsed: {
                destinos: [
                  {
                    nome: "Foz do Iguaçu",
                    justificativa: "Clima ameno.",
                    faixaPrecoMin: 0,
                    faixaPrecoMax: 0,
                  },
                  {
                    nome: "Gramado",
                    justificativa: "Boa opção.",
                    faixaPrecoMin: 1800,
                    faixaPrecoMax: 2800,
                  },
                ],
              },
              refusal: null,
            },
          },
        ],
        usage: null,
      });

      await expect(
        generateStructuredCompletion({
          schemaName: GATEWAY_IA_SCHEMA_NAMES.destino,
          schema: z.object({
            destinos: z.array(
              z.object({
                nome: z.string(),
                justificativa: z.string(),
                faixaPrecoMin: z.number(),
                faixaPrecoMax: z.number(),
              }),
            ),
          }),
          messages: [{ role: "user", content: "Sugira destinos." }],
        }),
      ).rejects.toBeInstanceOf(GatewayIaError);
    });

    it("aceita normalmente quando a faixa de preço da etapa destino é plausível", async () => {
      parseMock.mockResolvedValueOnce({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              parsed: {
                destinos: [
                  {
                    nome: "Foz do Iguaçu",
                    justificativa: "Clima ameno.",
                    faixaPrecoMin: 1500,
                    faixaPrecoMax: 2500,
                  },
                  {
                    nome: "Gramado",
                    justificativa: "Boa opção.",
                    faixaPrecoMin: 1800,
                    faixaPrecoMax: 2800,
                  },
                ],
              },
              refusal: null,
            },
          },
        ],
        usage: null,
      });

      const result = await generateStructuredCompletion({
        schemaName: GATEWAY_IA_SCHEMA_NAMES.destino,
        schema: z.object({
          destinos: z.array(
            z.object({
              nome: z.string(),
              justificativa: z.string(),
              faixaPrecoMin: z.number(),
              faixaPrecoMax: z.number(),
            }),
          ),
        }),
        messages: [{ role: "user", content: "Sugira destinos." }],
      });

      expect(result.data.destinos).toHaveLength(2);
    });

    it("rejeita com GatewayIaError quando o roteiro tem data fora do range da sessão", async () => {
      parseMock.mockResolvedValueOnce({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              parsed: {
                dias: [
                  {
                    data: "2026-11-01",
                    manha: [],
                    tarde: [],
                    noite: [],
                  },
                ],
              },
              refusal: null,
            },
          },
        ],
        usage: null,
      });

      await expect(
        generateStructuredCompletion({
          schemaName: GATEWAY_IA_SCHEMA_NAMES.roteiro,
          schema: roteiroEstruturadoSchema,
          messages: [{ role: "user", content: "Monte o roteiro." }],
          sessionDateRange: {
            dateRangeStart: "2026-10-10",
            dateRangeEnd: "2026-10-13",
          },
        }),
      ).rejects.toBeInstanceOf(GatewayIaError);
    });

    it("aceita normalmente quando toda data do roteiro está dentro do range da sessão", async () => {
      parseMock.mockResolvedValueOnce({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              parsed: {
                dias: [
                  {
                    data: "2026-10-11",
                    manha: [],
                    tarde: [],
                    noite: [],
                  },
                ],
              },
              refusal: null,
            },
          },
        ],
        usage: null,
      });

      const result = await generateStructuredCompletion({
        schemaName: GATEWAY_IA_SCHEMA_NAMES.roteiro,
        schema: roteiroEstruturadoSchema,
        messages: [{ role: "user", content: "Monte o roteiro." }],
        sessionDateRange: {
          dateRangeStart: "2026-10-10",
          dateRangeEnd: "2026-10-13",
        },
      });

      expect(result.data.dias).toHaveLength(1);
    });
  });
});
