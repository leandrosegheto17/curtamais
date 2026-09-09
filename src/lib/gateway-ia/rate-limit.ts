// L3-T05 — Rate limiting de chamadas ao Gateway de IA por sessão/IP
// (SDD.md §7, "Rate limiting"; GUARDRAILS.md regra 19).
//
// Escopo desta tarefa: só o contador/guarda em si. A composição da chave
// (sessão anônima via `anon_session_id`, `user_id` autenticado e/ou IP) é
// responsabilidade do chamador (Orquestrador de Sessão / Server Action da
// etapa, Lote 4+) — este módulo é agnóstico à origem da chave, só conta
// chamadas por chave numa janela de 1 minuto. Isso mantém a fronteira do
// Gateway de IA (TASK.md Seção 1, item 1): este arquivo não importa
// `next/headers` nem lê cookie/IP diretamente, permanecendo testável em
// isolamento (mesmo raciocínio de `anonymous-session.ts`).
//
// Implementação: contador em memória por processo (janela fixa de 60s por
// chave). Adequado ao estágio do projeto — SDD.md §1 justifica um monólito
// único sem infraestrutura distribuída para o MVP, e SDD.md §6 já aceita
// conscientemente que "monólito único concentra toda a carga" como risco de
// baixa severidade neste estágio; não introduz dependência externa (ex.
// Redis) sem necessidade real. Trade-off aceito: o contador não é
// compartilhado entre instâncias/processos e zera a cada reinício — se o
// projeto migrar para múltiplas instâncias, isso deve ser revisitado (fora
// de escopo desta tarefa).

const RATE_LIMIT_WINDOW_MS = 60_000;

/** Usado apenas se `AI_GATEWAY_RATE_LIMIT_PER_MINUTE` estiver ausente ou com
 * valor inválido (não numérico/≤0) — o valor real de produção deve sempre
 * vir da variável de ambiente (ver `.env.example`). */
const DEFAULT_LIMIT_PER_MINUTE = 10;

interface RateLimitWindowState {
  count: number;
  windowStart: number;
}

const counters = new Map<string, RateLimitWindowState>();

/**
 * Limite de chamadas por minuto configurado via
 * `AI_GATEWAY_RATE_LIMIT_PER_MINUTE` (SDD §7). Lido a cada chamada (não
 * cacheado) para permitir reconfiguração em teste, no mesmo padrão de
 * `getOpenAIModel()` em `./client.ts`.
 */
export function getGatewayIaRateLimitPerMinute(): number {
  const raw = process.env.AI_GATEWAY_RATE_LIMIT_PER_MINUTE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LIMIT_PER_MINUTE;
}

/**
 * Registra uma tentativa de chamada ao Gateway de IA para a chave informada
 * (identificador de sessão/IP, a critério do chamador) e informa se ela está
 * dentro do limite configurado.
 *
 * Nunca lança — apenas informa `true` (chamada permitida, já contabilizada)
 * ou `false` (limite já excedido na janela corrente, chamada NÃO
 * contabilizada). Cabe ao chamador (`checkGatewayIaRateLimit`, em
 * `./index.ts`) traduzir `false` num erro tratável do padrão do módulo.
 *
 * `now` só existe para permitir testar a expiração da janela de forma
 * determinística; o uso real nunca precisa informá-lo.
 */
export function registerGatewayIaCall(
  key: string,
  now: number = Date.now(),
): boolean {
  const limit = getGatewayIaRateLimitPerMinute();
  const existing = counters.get(key);

  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    counters.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

/**
 * Ponto de extensão para testes: limpa todos os contadores em memória entre
 * casos de teste, no mesmo padrão de `resetOpenAIClientForTests()` em
 * `./client.ts`. Não usado em código de produção.
 */
export function resetGatewayIaRateLimitForTests(): void {
  counters.clear();
}
