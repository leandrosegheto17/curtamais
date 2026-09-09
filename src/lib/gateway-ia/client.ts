// L3-T01 — Client OpenAI (ADR-002).
//
// Este arquivo é interno ao módulo `gateway-ia` e NUNCA deve ser importado
// fora deste diretório (TASK.md Seção 1, item 1 / GUARDRAILS.md regra 7):
// nenhuma tela ou Server Action fora do Gateway de IA pode obter uma
// referência ao client OpenAI bruto. O único ponto de entrada público do
// módulo é `src/lib/gateway-ia/index.ts`.
//
// A API key/modelo só vêm de variável de ambiente (GUARDRAILS.md regra 15) —
// nunca hardcoded, nunca versionada. `.env.example` documenta
// `OPENAI_API_KEY`/`OPENAI_MODEL` a partir desta tarefa.

import OpenAI from "openai";

let cachedClient: OpenAI | undefined;

/**
 * Modelo padrão do Gateway de IA (ADR-002: OpenAI GPT-4o-mini), usado caso
 * `OPENAI_MODEL` não esteja definida no ambiente. O valor real de produção
 * deve sempre vir de `OPENAI_MODEL` (ver `.env.example`); este default só
 * existe para não quebrar ambientes de desenvolvimento incompletos.
 */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Retorna a API key configurada via variável de ambiente. Lança erro
 * explícito se ausente — nenhuma chamada ao provider é feita sem chave
 * configurada (critério de aceite de L3-T01: "API key só via env").
 */
function readApiKeyFromEnv(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Defina a variável de ambiente " +
        "(ver .env.example) antes de chamar o Gateway de IA.",
    );
  }
  return apiKey;
}

/**
 * Client OpenAI singleton (evita recriar a instância a cada chamada dentro
 * do mesmo processo — mesmo padrão de singleton já usado para o Prisma
 * Client em `src/lib/prisma.ts`). Uso restrito a `src/lib/gateway-ia/`.
 */
export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: readApiKeyFromEnv() });
  }
  return cachedClient;
}

/** Modelo configurado via `OPENAI_MODEL` (ADR-002), com fallback de dev. */
export function getOpenAIModel(): string {
  const configured = process.env.OPENAI_MODEL;
  return configured && configured.trim().length > 0
    ? configured
    : DEFAULT_MODEL;
}

/**
 * Ponto de extensão para testes: permite resetar o singleton entre casos de
 * teste (ex. para forçar recriação do client com env mockada). Não usado em
 * código de produção.
 */
export function resetOpenAIClientForTests(): void {
  cachedClient = undefined;
}
