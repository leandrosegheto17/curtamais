// @vitest-environment node
//
// L3-T02 — `streamStructuredCompletion`: variante de streaming do Gateway de
// IA, aplicando o mecanismo decidido em SPIKE-01 (Route Handler +
// `ReadableStream`) sobre o provider real (`client.chat.completions.stream`,
// SDK oficial da OpenAI). O SDK é mockado — nenhuma chamada de rede real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GatewayIaError, streamStructuredCompletion } from "@/lib/gateway-ia";
import { resetOpenAIClientForTests } from "@/lib/gateway-ia/client";

type Listener = (...args: unknown[]) => void;

/** Emissor de eventos falso, mesma forma pública de `ChatCompletionStream` do SDK usada por `streamStructuredCompletion`. */
function createFakeChatStream() {
  const listeners: Record<string, Listener[]> = {};
  let finalResolve!: (value: unknown) => void;
  let finalReject!: (error: unknown) => void;
  const finalPromise = new Promise((resolve, reject) => {
    finalResolve = resolve;
    finalReject = reject;
  });

  return {
    on: vi.fn((event: string, listener: Listener) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(listener);
    }),
    emit(event: string, payload?: unknown) {
      for (const listener of listeners[event] ?? []) listener(payload);
    },
    finalChatCompletion: vi.fn(() => finalPromise),
    resolveFinal(completion: unknown) {
      finalResolve(completion);
    },
    rejectFinal(error: unknown) {
      finalReject(error);
    },
    abort: vi.fn(),
  };
}

const streamMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          stream: streamMock,
        },
      },
    })),
  };
});

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

async function readAllText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value);
  }
  return full;
}

const schema = z.object({ destinos: z.array(z.string()) });

describe("streamStructuredCompletion (Gateway de IA)", () => {
  beforeEach(() => {
    resetOpenAIClientForTests();
    streamMock.mockReset();
    process.env.OPENAI_API_KEY = "sk-test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  afterEach(() => {
    resetOpenAIClientForTests();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  it("entrega os deltas de conteúdo de forma incremental e fecha o stream ao final (critério de aceite)", async () => {
    const fake = createFakeChatStream();
    streamMock.mockReturnValue(fake);

    const stream = streamStructuredCompletion({
      schemaName: "destino_sugestao_teste",
      schema,
      messages: [{ role: "user", content: "Sugira destinos." }],
    });

    // Emite dois deltas antes de finalizar — prova de entrega incremental
    // (mais de um chunk chegando via `content.delta`, não um único payload).
    queueMicrotask(() => {
      fake.emit("content.delta", { delta: '{"destinos":["Foz' });
      queueMicrotask(() => {
        fake.emit("content.delta", { delta: ' do Iguaçu"]}' });
        fake.resolveFinal({
          choices: [{ message: { refusal: null } }],
        });
      });
    });

    const full = await readAllText(stream);
    expect(full).toBe('{"destinos":["Foz do Iguaçu"]}');

    expect(streamMock).toHaveBeenCalledTimes(1);
    const callArgs = streamMock.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-4o-mini");
    expect(callArgs.response_format).toBeDefined();
    expect(callArgs.response_format.type).toBe("json_schema");
  });

  it("propaga GatewayIaError quando o provider recusa a geração", async () => {
    const fake = createFakeChatStream();
    streamMock.mockReturnValue(fake);

    const stream = streamStructuredCompletion({
      schemaName: "destino_sugestao_teste",
      schema,
      messages: [{ role: "user", content: "Sugira destinos." }],
    });

    queueMicrotask(() => {
      fake.resolveFinal({
        choices: [{ message: { refusal: "conteúdo não permitido" } }],
      });
    });

    await expect(readAllText(stream)).rejects.toBeInstanceOf(GatewayIaError);
  });

  it("propaga GatewayIaError quando o SDK emite um evento de erro durante o streaming", async () => {
    const fake = createFakeChatStream();
    streamMock.mockReturnValue(fake);

    const stream = streamStructuredCompletion({
      schemaName: "destino_sugestao_teste",
      schema,
      messages: [{ role: "user", content: "Sugira destinos." }],
    });

    queueMicrotask(() => {
      fake.emit("error", new Error("network timeout"));
    });

    await expect(readAllText(stream)).rejects.toBeInstanceOf(GatewayIaError);
  });

  it("aborta o chatStream do SDK se o consumidor cancelar a leitura", async () => {
    const fake = createFakeChatStream();
    streamMock.mockReturnValue(fake);

    const stream = streamStructuredCompletion({
      schemaName: "destino_sugestao_teste",
      schema,
      messages: [{ role: "user", content: "Sugira destinos." }],
    });

    await stream.cancel();
    expect(fake.abort).toHaveBeenCalledTimes(1);
  });
});
