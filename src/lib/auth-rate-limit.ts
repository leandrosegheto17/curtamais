// V2-L7-T08 — Rate limit de `criarConta`/`authorize` (SDD.md §8.7) + apoio à
// mitigação de enumeração de e-mail (RF-16.8).
//
// Reaproveita EXATAMENTE o mesmo mecanismo/storage já usado por
// `src/lib/gateway-ia/rate-limit.ts` (L3-T05): contador em memória por
// processo, janela fixa por chave. Mesmo trade-off já aceito em SDD.md §8.6
// ("Rate limit em memória, por instância, contornável" — aceito no
// protótipo). Este módulo generaliza aquele padrão (fábrica parametrizável
// por janela/limite) em vez de duplicar a lógica de contagem, mas usa uma
// estrutura de dados própria (não importa `./gateway-ia/rate-limit.ts`) para
// não acoplar os dois domínios (Gateway de IA vs. autenticação) nem arriscar
// alterar um arquivo possivelmente tocado por outra tarefa em paralelo.
//
// Duas instâncias são criadas abaixo:
// - `criarContaRateLimiter`: 5 tentativas de cadastro por IP a cada 10 min
//   (`src/lib/actions/conta.ts`).
// - `authorizeRateLimiter`: 10 tentativas de entrada por (IP, hash do
//   e-mail) a cada 10 min (`src/lib/auth.ts`).
//
// A chave de `authorizeRateLimiter` usa `hashEmailForRateLimit` (SHA-256) —
// o e-mail em texto plano NUNCA compõe a chave do contador nem é logado
// (SDD.md §8.7, "o e-mail nunca é registrado em log").
import { createHash } from "node:crypto";

const TEN_MINUTES_MS = 10 * 60_000;

/** Limites do critério de aceite V2-L7-T08 (SDD.md §8.7). Não configurados
 * via env (ao contrário do Gateway de IA) porque não há necessidade de
 * ajuste por ambiente para este protótipo — valor fixo e documentado. */
export const CRIAR_CONTA_RATE_LIMIT_MAX_PER_WINDOW = 5;
export const AUTHORIZE_RATE_LIMIT_MAX_PER_WINDOW = 10;

interface RateLimitWindowState {
  count: number;
  windowStart: number;
}

/**
 * Fábrica de um contador de janela fixa em memória, mesmo mecanismo de
 * `registerGatewayIaCall` (`./gateway-ia/rate-limit.ts`), parametrizado por
 * janela/limite para ser reutilizado pelos dois limitadores deste módulo sem
 * duplicar a lógica de contagem.
 */
function createFixedWindowRateLimiter(windowMs: number, limit: number) {
  const counters = new Map<string, RateLimitWindowState>();

  return {
    /**
     * Registra uma tentativa para `key` e informa se ela está dentro do
     * limite. Nunca lança. `now` só existe para testes determinísticos de
     * expiração de janela (mesmo padrão de `registerGatewayIaCall`).
     */
    register(key: string, now: number = Date.now()): boolean {
      const existing = counters.get(key);

      if (!existing || now - existing.windowStart >= windowMs) {
        counters.set(key, { count: 1, windowStart: now });
        return true;
      }

      if (existing.count >= limit) {
        return false;
      }

      existing.count += 1;
      return true;
    },

    /** Só para uso em teste — limpa todos os contadores. */
    resetForTests(): void {
      counters.clear();
    },
  };
}

export const criarContaRateLimiter = createFixedWindowRateLimiter(
  TEN_MINUTES_MS,
  CRIAR_CONTA_RATE_LIMIT_MAX_PER_WINDOW,
);

export const authorizeRateLimiter = createFixedWindowRateLimiter(
  TEN_MINUTES_MS,
  AUTHORIZE_RATE_LIMIT_MAX_PER_WINDOW,
);

/**
 * Hash de e-mail para compor chave de rate limit sem nunca guardar/logar o
 * e-mail em texto plano (SDD.md §8.7). SHA-256 simples (não é um hash de
 * senha — não precisa de custo alto/sal por registro: o objetivo aqui é só
 * evitar texto plano na chave do contador em memória e em qualquer log
 * futuro, não resistir a ataque de força bruta offline sobre a chave).
 * E-mail normalizado (trim + lowercase) antes do hash, mesma normalização
 * já usada por `createUserAccount`/`authorize`, para que variações de
 * caixa/espaço não escapem do limite.
 */
export function hashEmailForRateLimit(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

const FALLBACK_IP = "unknown";

/**
 * Extrai o primeiro IP de um cabeçalho `X-Forwarded-For` (formato
 * `"cliente, proxy1, proxy2"` — o mais à esquerda é o cliente original).
 * Usada pelos dois pontos de chamada (`headers()` do Next em Server Actions,
 * `req.headers` do NextAuth em `authorize`) para não duplicar o parsing.
 * Nunca lança; sem cabeçalho, devolve um valor fixo (`"unknown"`) — melhor
 * agrupar todas as chamadas sem IP identificável sob uma única chave restrita
 * do que deixar de aplicar rate limit nelas.
 */
export function extractClientIp(
  forwardedFor: string | string[] | null | undefined,
): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (!raw) return FALLBACK_IP;
  const [first] = raw.split(",");
  const trimmed = first?.trim();
  return trimmed || FALLBACK_IP;
}

/** Só para uso em teste. */
export function resetAuthRateLimitersForTests(): void {
  criarContaRateLimiter.resetForTests();
  authorizeRateLimiter.resetForTests();
}
