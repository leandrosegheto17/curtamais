// V2-L7-T05 — Allowlist exata de destinos pós-login (UX-SPEC.md §8, RF-17.7),
// extraída de `src/app/entrar/page.tsx` (RL-V2-L7-T01) porque o App Router só
// permite exports específicos (`default`, `config`, etc.) de um `page.tsx` —
// exportar `resolveRetorno`/`RETORNO_ALLOWLIST`/`RETORNO_PADRAO` diretamente do
// arquivo de rota quebra o contrato de tipos gerado (`.next/types`).
//
// Comparação é sempre por igualdade estrita de string — nunca prefixo — para
// não abrir brecha do tipo `/meus-roteiros-evil.com` ou
// `/meus-roteiros/../outra-coisa` (proteção contra open redirect).
export const RETORNO_ALLOWLIST = [
  "/meus-roteiros",
  "/hospedagem",
  "/passeios",
  "/roteiro",
  "/destino/confirmacao",
] as const;

export const RETORNO_PADRAO = "/";

export function resolveRetorno(retorno: string | undefined): string {
  if (retorno && (RETORNO_ALLOWLIST as readonly string[]).includes(retorno)) {
    return retorno;
  }
  return RETORNO_PADRAO;
}
