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
// RL3-T01 — Integração de `checkGatewayIaRateLimit` (L3-T05) a esta rota
// (SDD §7 / GUARDRAILS.md regra 19): esta é hoje a única rota HTTP pública
// do Gateway de IA sem guarda de rate limit, alcançável por qualquer
// requisição externa assim que deployada. A chave usa, em ordem de
// preferência, o identificador de sessão anônima já existente
// (`ANONYMOUS_SESSION_COOKIE`, `src/lib/anonymous-session.ts`) e, na
// ausência dele, o IP da requisição (`x-forwarded-for`/`x-real-ip`) — ambos
// satisfazem o critério mínimo do RL3-T01 (IP), mas o identificador de
// sessão é preferido por ser mais estável por visitante. Nunca deixa a
// requisição seguir para `streamStructuredCompletion` (e, portanto, para o
// provider) quando o limite é excedido.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ANONYMOUS_SESSION_COOKIE } from "@/lib/anonymous-session";
import {
  GATEWAY_IA_STAGES,
  GatewayIaError,
  checkGatewayIaRateLimit,
  isGatewayIaStage,
  stageContextSchema,
  streamStructuredCompletion,
} from "@/lib/gateway-ia";

/**
 * Resolve a chave de rate limit desta requisição (RL3-T01): prioriza o
 * identificador de sessão anônima já presente no cookie; na ausência dele,
 * cai para o IP informado pelos headers de proxy padrão
 * (`x-forwarded-for`/`x-real-ip`); na ausência de ambos (ex.: requisição
 * direta sem proxy em dev), usa um valor fixo — ainda assim aplica um limite
 * global compartilhado, nunca deixa a chamada passar sem guarda nenhuma.
 */
async function resolveRateLimitKey(request: Request): Promise<string> {
  const cookieStore = await cookies();
  const anonSessionId = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;
  if (anonSessionId) {
    return `session:${anonSessionId}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  const ip = firstForwarded || request.headers.get("x-real-ip");
  if (ip) {
    return `ip:${ip}`;
  }

  return "ip:unknown";
}

// Achado do SPIKE-01 (ver `streaming-spike/route.ts`): sem esta diretiva o
// Next.js 14 estatiza a rota em `next build`, bufferizando o stream uma
// única vez em build-time — inaceitável aqui, já que cada requisição depende
// do contexto da sessão e do provider real.
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ etapa: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { etapa } = await params;

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

  try {
    checkGatewayIaRateLimit(await resolveRateLimitKey(request));
  } catch (error) {
    const message =
      error instanceof GatewayIaError
        ? error.message
        : "Limite de chamadas ao Gateway de IA excedido. Tente novamente em instantes.";
    return NextResponse.json({ error: message }, { status: 429 });
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
