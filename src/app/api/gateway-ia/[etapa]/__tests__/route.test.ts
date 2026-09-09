// @vitest-environment node
//
// L3-T02 — Route Handler real de streaming por etapa (SPIKE-01: Route
// Handler + `ReadableStream`). Mocka só `streamStructuredCompletion` do
// Gateway de IA (não o SDK da OpenAI) — o objetivo aqui é provar que a rota
// entrega o corpo da resposta de forma incremental e valida o contrato de
// entrada, não repetir os testes do SDK já cobertos em `stream.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { streamStructuredCompletionMock } = vi.hoisted(() => ({
  streamStructuredCompletionMock: vi.fn(),
}));

vi.mock("@/lib/gateway-ia", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway-ia")>(
    "@/lib/gateway-ia",
  );
  return {
    ...actual,
    streamStructuredCompletion: streamStructuredCompletionMock,
  };
});

import { POST } from "@/app/api/gateway-ia/[etapa]/route";

function createIncrementalStream(chunks: string[], delayMs = 5) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;
      const pushNext = () => {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        setTimeout(pushNext, delayMs);
      };
      setTimeout(pushNext, delayMs);
    },
  });
}

function makeRequest(etapa: string, body: unknown): Request {
  return new Request(`http://localhost/api/gateway-ia/${etapa}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validDestinoContext = {
  referenceDate: "2026-09-09",
  dateRangeStart: "2026-10-10",
  dateRangeEnd: "2026-10-13",
  budgetAmount: 2000,
  budgetCurrency: "BRL",
};

describe("POST /api/gateway-ia/[etapa]", () => {
  beforeEach(() => {
    streamStructuredCompletionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna 404 para etapa desconhecida", async () => {
    const response = await POST(makeRequest("inexistente", validDestinoContext), {
      params: { etapa: "inexistente" },
    });
    expect(response.status).toBe(404);
  });

  it("retorna 400 para corpo que não bate com o contrato de contexto", async () => {
    const response = await POST(
      makeRequest("destino", { dateRangeStart: "2026-10-10" }),
      { params: { etapa: "destino" } },
    );
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando o contexto não atende a pré-condição da etapa (ex.: hospedagem sem destino aprovado)", async () => {
    const response = await POST(
      makeRequest("hospedagem", validDestinoContext),
      { params: { etapa: "hospedagem" } },
    );
    expect(response.status).toBe(400);
    expect(streamStructuredCompletionMock).not.toHaveBeenCalled();
  });

  it("entrega o corpo da resposta de forma incremental para um contexto válido (mecanismo do SPIKE-01 aplicado)", async () => {
    streamStructuredCompletionMock.mockReturnValue(
      createIncrementalStream(['{"destinos":', '["Foz do Iguaçu"]}']),
    );

    const response = await POST(makeRequest("destino", validDestinoContext), {
      params: { etapa: "destino" },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const receivedAt: number[] = [];
    const start = Date.now();
    let full = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedAt.push(Date.now() - start);
      full += decoder.decode(value);
    }

    expect(full).toBe('{"destinos":["Foz do Iguaçu"]}');
    expect(receivedAt.length).toBeGreaterThan(1);
    expect(receivedAt[receivedAt.length - 1]).toBeGreaterThan(receivedAt[0]);

    expect(streamStructuredCompletionMock).toHaveBeenCalledTimes(1);
    const callArgs = streamStructuredCompletionMock.mock.calls[0][0];
    expect(callArgs.schemaName).toBe("destino_sugestoes");
    expect(callArgs.messages[0].role).toBe("system");
  });

  it("retorna 502 quando o Gateway de IA falha ao iniciar o streaming", async () => {
    const { GatewayIaError } = await import("@/lib/gateway-ia");
    streamStructuredCompletionMock.mockImplementation(() => {
      throw new GatewayIaError("Falha ao chamar o provider de LLM (OpenAI).");
    });

    const response = await POST(makeRequest("destino", validDestinoContext), {
      params: { etapa: "destino" },
    });
    expect(response.status).toBe(502);
  });
});
