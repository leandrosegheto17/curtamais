// SPIKE-01 — Prototipo minimo do mecanismo de streaming escolhido (Route
// Handler + `ReadableStream`, ver TASK.md Secao 2 e nota de resolucao do
// spike). NAO produtivo: nao integra com o Gateway de IA real
// (`generateStructuredCompletion`), so prova que o Next.js 14.2.35 deste
// projeto consegue entregar chunks de texto ao cliente em momentos
// diferentes (streaming incremental real, nao um `await` seguido de envio
// unico). L3-T02 e quem troca a fonte simulada abaixo por tokens reais do
// provider de LLM, reaproveitando este mesmo mecanismo de transporte.
//
// Por que um `ReadableStream` de texto puro (nao SSE `data:`/`event:`) neste
// spike: o objetivo aqui e provar streaming incremental no transporte
// HTTP/Route Handler em si, no nivel mais simples possivel. Formatacao de
// evento (SSE) ou protocolo de patch incremental de JSON estruturado (para
// compor com `zodResponseFormat`, usado por `generateStructuredCompletion`)
// e decisao de design de L3-T02, fora do escopo deste spike.

/**
 * Divide um texto em tokens (palavras) para simular chegada gradual de
 * conteudo gerado por LLM.
 */
export function chunkText(text: string): string[] {
  return text.split(/(?<=\s)/).filter((chunk) => chunk.length > 0);
}

export type SimulatedTokenStreamOptions = {
  /** Delay (ms) antes do primeiro chunk — simula a latencia inicial do provider. */
  firstChunkDelayMs?: number;
  /** Delay (ms) entre chunks subsequentes — simula o ritmo de token-a-token. */
  interChunkDelayMs?: number;
};

const DEFAULT_FIRST_CHUNK_DELAY_MS = 50;
const DEFAULT_INTER_CHUNK_DELAY_MS = 40;

/**
 * Constroi um `ReadableStream<Uint8Array>` que emite os tokens de `text` de
 * forma incremental, com um delay configuravel entre eles — simula uma
 * resposta de LLM chegando aos poucos, sem chamar nenhum provider real.
 *
 * Usado tanto pela rota de spike (`app/api/gateway-ia/streaming-spike/route.ts`)
 * quanto diretamente pelos testes deste modulo (sem precisar de um servidor
 * HTTP de verdade rodando).
 */
export function createSimulatedTokenStream(
  text: string,
  options: SimulatedTokenStreamOptions = {},
): ReadableStream<Uint8Array> {
  const firstChunkDelayMs =
    options.firstChunkDelayMs ?? DEFAULT_FIRST_CHUNK_DELAY_MS;
  const interChunkDelayMs =
    options.interChunkDelayMs ?? DEFAULT_INTER_CHUNK_DELAY_MS;
  const tokens = chunkText(text);
  const encoder = new TextEncoder();

  let index = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const pushNext = () => {
        if (index >= tokens.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(tokens[index]));
        index += 1;
        timer = setTimeout(pushNext, interChunkDelayMs);
      };
      timer = setTimeout(pushNext, firstChunkDelayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
}
