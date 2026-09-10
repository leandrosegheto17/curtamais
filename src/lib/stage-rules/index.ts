// L7-T01 — Ponto de reexport público do módulo de regras de negócio por
// etapa (mesmo padrão de `src/lib/gateway-ia/index.ts`/
// `src/lib/session-flow/index.ts`): outros módulos devem importar via
// `@/lib/stage-rules`, nunca `@/lib/stage-rules/destino` diretamente.
//
// Contém as regras das etapas destino (RF-04, L7-T01), hospedagem (RF-06,
// L8-T01) e passeios (RF-07, L9-T01); roteiro (RF-08, L10-T01) deve seguir o
// mesmo padrão — um arquivo por etapa, reexportado aqui.

export { generateDestinationSuggestions } from "./destino";
export type {
  GenerateDestinationSuggestionsInput,
  DestinationSuggestionResult,
} from "./destino";
export { generateAccommodationSuggestions } from "./hospedagem";
export type {
  GenerateAccommodationSuggestionsInput,
  AccommodationSuggestionResult,
} from "./hospedagem";
export { generatePasseiosSuggestions } from "./passeios";
export type {
  GeneratePasseiosSuggestionsInput,
  PasseiosSuggestionResult,
} from "./passeios";
