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
// Cookie de sessão anônima mockado (mesmo padrão de
// `resolve-session-owner.test.ts`): por padrão sem cookie, para que os
// testes de rate limit (RL3-T01) exercitem a chave por IP.
const cookieGetMock = vi.fn<
  (name: string) => { value: string } | undefined
>();

vi.mock("@/lib/gateway-ia", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway-ia")>(
    "@/lib/gateway-ia",
  );
  return {
    ...actual,
    streamStructuredCompletion: streamStructuredCompletionMock,
  };
});

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (...args: unknown[]) => cookieGetMock(...(args as [string])),
  }),
}));

import {
  resetGatewayIaRateLimitForTests,
} from "@/lib/gateway-ia/rate-limit";
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

function makeRequest(
  etapa: string,
  body: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost/api/gateway-ia/${etapa}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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

const originalLimitEnv = process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;

describe("POST /api/gateway-ia/[etapa]", () => {
  beforeEach(() => {
    streamStructuredCompletionMock.mockReset();
    cookieGetMock.mockReset();
    cookieGetMock.mockReturnValue(undefined);
    resetGatewayIaRateLimitForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetGatewayIaRateLimitForTests();
    if (originalLimitEnv === undefined) {
      delete process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;
    } else {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = originalLimitEnv;
    }
  });

  it("retorna 404 para etapa desconhecida", async () => {
    const response = await POST(makeRequest("inexistente", validDestinoContext), {
      params: Promise.resolve({ etapa: "inexistente" }),
    });
    expect(response.status).toBe(404);
  });

  it("retorna 400 para corpo que não bate com o contrato de contexto", async () => {
    const response = await POST(
      makeRequest("destino", { dateRangeStart: "2026-10-10" }),
      { params: Promise.resolve({ etapa: "destino" }) },
    );
    expect(response.status).toBe(400);
  });

  it("retorna 400 quando o contexto não atende a pré-condição da etapa (ex.: hospedagem sem destino aprovado)", async () => {
    const response = await POST(
      makeRequest("hospedagem", validDestinoContext),
      { params: Promise.resolve({ etapa: "hospedagem" }) },
    );
    expect(response.status).toBe(400);
    expect(streamStructuredCompletionMock).not.toHaveBeenCalled();
  });

  it("entrega o corpo da resposta de forma incremental para um contexto válido (mecanismo do SPIKE-01 aplicado)", async () => {
    streamStructuredCompletionMock.mockReturnValue(
      createIncrementalStream(['{"destinos":', '["Foz do Iguaçu"]}']),
    );

    const response = await POST(makeRequest("destino", validDestinoContext), {
      params: Promise.resolve({ etapa: "destino" }),
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
      params: Promise.resolve({ etapa: "destino" }),
    });
    expect(response.status).toBe(502);
  });

  describe("rate limiting (RL3-T01, L3-T05 integrado a esta rota)", () => {
    it("retorna 429 (erro tratável, não exceção não capturada) ao exceder o limite configurado, sem chamar o provider", async () => {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
      streamStructuredCompletionMock.mockReturnValue(
        createIncrementalStream(['{"destinos":["Foz do Iguaçu"]}']),
      );

      const first = await POST(makeRequest("destino", validDestinoContext), {
        params: Promise.resolve({ etapa: "destino" }),
      });
      expect(first.status).toBe(200);

      const second = await POST(makeRequest("destino", validDestinoContext), {
        params: Promise.resolve({ etapa: "destino" }),
      });
      expect(second.status).toBe(429);
      const body = await second.json();
      expect(typeof body.error).toBe("string");

      // A 2ª requisição (bloqueada) nunca deve ter chegado ao provider.
      expect(streamStructuredCompletionMock).toHaveBeenCalledTimes(1);
    });

    it("usa o identificador de sessão anônima (cookie) como chave quando presente, isolando o limite por visitante", async () => {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
      streamStructuredCompletionMock.mockReturnValue(
        createIncrementalStream(['{"destinos":["Foz do Iguaçu"]}']),
      );

      cookieGetMock.mockReturnValue({ value: "sessao-a" });
      const firstVisitorFirstCall = await POST(
        makeRequest("destino", validDestinoContext),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(firstVisitorFirstCall.status).toBe(200);

      const firstVisitorSecondCall = await POST(
        makeRequest("destino", validDestinoContext),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(firstVisitorSecondCall.status).toBe(429);

      // Outro visitante (outro cookie de sessão) não é afetado pelo limite
      // já consumido pelo primeiro.
      cookieGetMock.mockReturnValue({ value: "sessao-b" });
      const secondVisitorFirstCall = await POST(
        makeRequest("destino", validDestinoContext),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(secondVisitorFirstCall.status).toBe(200);
    });

    it("cai para o IP da requisição (x-forwarded-for) quando não há cookie de sessão anônima", async () => {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
      streamStructuredCompletionMock.mockReturnValue(
        createIncrementalStream(['{"destinos":["Foz do Iguaçu"]}']),
      );

      const headersIpA = { "x-forwarded-for": "203.0.113.10" };
      const headersIpB = { "x-forwarded-for": "203.0.113.20" };

      const ipAFirstCall = await POST(
        makeRequest("destino", validDestinoContext, headersIpA),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(ipAFirstCall.status).toBe(200);

      const ipASecondCall = await POST(
        makeRequest("destino", validDestinoContext, headersIpA),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(ipASecondCall.status).toBe(429);

      const ipBFirstCall = await POST(
        makeRequest("destino", validDestinoContext, headersIpB),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(ipBFirstCall.status).toBe(200);
    });

    it("checagem de rate limit acontece antes da checagem de pré-condição de contexto da etapa", async () => {
      process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE = "1";
      const headers = { "x-forwarded-for": "198.51.100.5" };

      // Consome o limite com uma etapa/contexto válido.
      streamStructuredCompletionMock.mockReturnValue(
        createIncrementalStream(['{"destinos":["Foz do Iguaçu"]}']),
      );
      const first = await POST(
        makeRequest("destino", validDestinoContext, headers),
        { params: Promise.resolve({ etapa: "destino" }) },
      );
      expect(first.status).toBe(200);

      // Uma 2ª requisição do mesmo IP, mesmo com contexto que violaria a
      // pré-condição de outra etapa (hospedagem sem destino aprovado),
      // ainda deve ser barrada pelo rate limit (429), não pela validação de
      // pré-condição (400) — a guarda de rate limit vem primeiro.
      const second = await POST(
        makeRequest("hospedagem", validDestinoContext, headers),
        { params: Promise.resolve({ etapa: "hospedagem" }) },
      );
      expect(second.status).toBe(429);
    });
  });
});
