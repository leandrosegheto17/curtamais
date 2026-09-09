// @vitest-environment node
//
// SPIKE-01 — prova executavel de que o mecanismo escolhido (Route Handler +
// `ReadableStream`) entrega conteudo de forma incremental no Next.js
// 14.2.35 deste projeto: chunks chegam em momentos diferentes (com o delay
// configurado entre eles), nao tudo de uma vez ao final. Ver TASK.md Secao 2
// para a decisao/justificativa completa do spike.
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/gateway-ia/streaming-spike/route";
import {
  chunkText,
  createSimulatedTokenStream,
} from "@/lib/gateway-ia/streaming-spike/simulate-stream";

describe("SPIKE-01 — streaming incremental via ReadableStream", () => {
  it("chunkText divide o texto em varios tokens (nao um bloco unico)", () => {
    const tokens = chunkText("um dois tres quatro");
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join("")).toBe("um dois tres quatro");
  });

  it("createSimulatedTokenStream emite chunks em momentos diferentes (nao tudo de uma vez)", async () => {
    const text = "alfa beta gama delta epsilon";
    const stream = createSimulatedTokenStream(text, {
      firstChunkDelayMs: 10,
      interChunkDelayMs: 10,
    });
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const receivedAt: number[] = [];
    const chunks: string[] = [];
    const start = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedAt.push(Date.now() - start);
      chunks.push(decoder.decode(value));
    }

    // Prova de streaming incremental real: mais de um chunk chegou, e nao
    // todos no mesmo instante (a diferenca entre o primeiro e o ultimo
    // timestamp precisa refletir o delay configurado entre eles).
    expect(chunks.length).toBe(chunkText(text).length);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);

    const first = receivedAt[0];
    const last = receivedAt[receivedAt.length - 1];
    expect(last - first).toBeGreaterThanOrEqual(
      10 * (chunks.length - 1) - 5, // tolerancia pequena de agendamento do timer
    );
  });

  it("closes o stream ao final (sem pendencia de leitura)", async () => {
    const stream = createSimulatedTokenStream("so um token", {
      firstChunkDelayMs: 5,
      interChunkDelayMs: 5,
    });
    const reader = stream.getReader();
    // consome tudo
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    // uma leitura extra apos o fechamento deve continuar reportando `done`.
    const extra = await reader.read();
    expect(extra.done).toBe(true);
  });

  it("a Route Handler real (GET) devolve uma Response com corpo em streaming", async () => {
    const response = await GET();
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

    expect(receivedAt.length).toBeGreaterThan(1);
    expect(full).toContain("Recife");
    // Confirma que a Route Handler nao bufferizou tudo antes de responder:
    // o ultimo chunk chega depois do primeiro, com intervalo perceptivel.
    expect(receivedAt[receivedAt.length - 1]).toBeGreaterThan(receivedAt[0]);
  });
});
