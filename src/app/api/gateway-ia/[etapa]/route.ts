// L3-T02 — Route Handler real de streaming por etapa do Gateway de IA
// (RF-04/RF-06/RF-07/RF-08, RNF-02), aplicando o mecanismo decidido em
// SPIKE-01 (Route Handler + `ReadableStream`, ver `.md/TASK.md` Seção 2).
//
// Diferença para a rota de spike (`app/api/gateway-ia/streaming-spike/route.ts`):
// esta rota chama o provider real via `streamStructuredCompletion`
// (`src/lib/gateway-ia/index.ts`), não um stream simulado.
//
// Fronteira do Gateway de IA (TASK.md Seção 1, item 1): esta rota NUNCA
// importa `openai` diretamente — só chama funções exportadas de
// `@/lib/gateway-ia`.
//
// Contrato de entrada: o corpo da requisição já traz o contexto acumulado da
// sessão (`StageContext`/`stageContextSchema`) pronto — esta rota não lê
// `TripSession` do banco nem valida dono de sessão, porque o Orquestrador de
// Sessão (Lote 4) ainda não existe neste ponto do projeto; quem monta e
// valida esse contexto a partir da sessão real (e aplica a checagem de
// autorização de dono de registro, TASK.md Seção 1 item 9/GUARDRAILS.md) é
// responsabilidade de quem chamar esta rota a partir de L7-T01/L8-T01/
// L9-T01/L10-T01 — ver nota de implementação L3-T02 no TASK.md.
//
// Rate limiting (L3-T05, `checkGatewayIaRateLimit`) não é chamado aqui de
// propósito — fora do escopo desta tarefa (ver contexto do L3-T02 no
// TASK.md); a interface pública não foi alterada, só ainda não está
// integrada a este ponto de entrada específico.
import { NextResponse } from "next/server";
import {
  GATEWAY_IA_STAGES,
  GatewayIaError,
  isGatewayIaStage,
  stageContextSchema,
  streamStructuredCompletion,
} from "@/lib/gateway-ia";

// Achado do SPIKE-01 (ver `streaming-spike/route.ts`): sem esta diretiva o
// Next.js 14 estatiza a rota em `next build`, bufferizando o stream uma
// única vez em build-time — inaceitável aqui, já que cada requisição depende
// do contexto da sessão e do provider real.
export const dynamic = "force-dynamic";

type RouteParams = { params: { etapa: string } };

export async function POST(request: Request, { params }: RouteParams) {
  const { etapa } = params;

  if (!isGatewayIaStage(etapa)) {
    return NextResponse.json(
      {
        error: `Etapa "${etapa}" desconhecida. Etapas válidas: destino, hospedagem, passeios, roteiro.`,
      },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição precisa ser um JSON válido." },
      { status: 400 },
    );
  }

  const parsedContext = stageContextSchema.safeParse(body);
  if (!parsedContext.success) {
    return NextResponse.json(
      {
        error: "Contexto de sessão inválido para esta etapa.",
        issues: parsedContext.error.issues,
      },
      { status: 400 },
    );
  }

  const stageDefinition = GATEWAY_IA_STAGES[etapa];

  let messages;
  try {
    messages = stageDefinition.buildMessages(parsedContext.data);
  } catch (error) {
    // Erros de pré-condição de contexto (ex.: chamar hospedagem sem destino
    // já aprovado, ver `prompts.ts`) — erro do chamador, não do provider.
    const message =
      error instanceof Error ? error.message : "Contexto insuficiente para esta etapa.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = streamStructuredCompletion({
      schemaName: stageDefinition.schemaName,
      schema: stageDefinition.schema,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof GatewayIaError
        ? error.message
        : "Falha ao iniciar a geração desta etapa.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
