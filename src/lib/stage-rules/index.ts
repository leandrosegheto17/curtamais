// L7-T01 — Ponto de reexport público do módulo de regras de negócio por
// etapa (mesmo padrão de `src/lib/gateway-ia/index.ts`/
// `src/lib/session-flow/index.ts`): outros módulos devem importar via
// `@/lib/stage-rules`, nunca `@/lib/stage-rules/destino` diretamente.
//
// Hoje só contém a regra da etapa destino (RF-04, L7-T01); hospedagem/
// passeios/roteiro (RF-06/RF-07/RF-08, L8-T01/L9-T01/L10-T01) devem seguir o
// mesmo padrão — um arquivo por etapa, reexportado aqui.

export { generateDestinationSuggestions } from "./destino";
export type {
  GenerateDestinationSuggestionsInput,
  DestinationSuggestionResult,
} from "./destino";
