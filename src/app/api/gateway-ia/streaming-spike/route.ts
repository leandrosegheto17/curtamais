// SPIKE-01 — Rota de prova de conceito do mecanismo escolhido (Route
// Handler + `ReadableStream`) para streaming de resposta do Gateway de IA
// (RNF-02, SDD.md Secao 2/3/6; ver TASK.md Secao 2, resolucao do spike).
//
// NAO produtivo: nao chama `generateStructuredCompletion` nem o provider de
// LLM real, apenas um `ReadableStream` simulado
// (`simulate-stream.ts`), so para provar que o Next.js 14.2.35 deste
// projeto entrega chunks de texto ao cliente de forma incremental via Route
// Handler. Esta rota existe apenas enquanto o spike estiver referenciado no
// TASK.md — L3-T02 implementa o endpoint real de streaming por etapa
// (destino/hospedagem/passeios/roteiro), reaproveitando este mesmo
// mecanismo de transporte (Route Handler + `ReadableStream`), nao esta rota
// em si.
import { createSimulatedTokenStream } from "@/lib/gateway-ia/streaming-spike/simulate-stream";

// Achado do spike: sem esta diretiva, o Next.js 14 estatiza esta rota em
// `next build` (nenhuma API dinamica — `cookies()`/`headers()`/`request` —
// e usada aqui), o que faria o `ReadableStream` ser consumido/bufferizado
// UMA VEZ em build-time e servido depois como resposta estatica pronta —
// destruindo o streaming incremental por requisicao em producao. L3-T02 (e
// qualquer rota real de streaming do Gateway de IA) precisa desta mesma
// diretiva: uma chamada ao Gateway de IA e por natureza dinamica (depende
// do estado da sessao), entao isso nao deve se repetir la, mas fica
// registrado aqui como o achado concreto que motivou a checagem.
export const dynamic = "force-dynamic";

const SPIKE_TEXT =
  "Recife eh uma otima escolha para uma viagem de fim de semana: praias " +
  "urbanas, historia colonial no Recife Antigo e uma cena gastronomica " +
  "forte. ";

export async function GET() {
  const stream = createSimulatedTokenStream(SPIKE_TEXT);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
