// V2-L5-T01 — Rota de T01 (Data livre, RF-13, UX-SPEC.md §8.2, SDD.md
// §8.2.4). Server Component fina: resolve `?destino={slug}` contra
// `CATALOGO_DESTINOS` (`@/lib/catalogo/destinos`, V2-L2-T01, já concluída) e
// repassa `destinoInicial = "{Nome}, {UF}"` (editável) para o client
// component `DataLivreClient`, que continua concentrando toda a
// interatividade (foco, submissão via `submeterDataLivre`, navegação).
//
// Só o parâmetro `destino` é lido da querystring, e é tratado sempre como um
// slug a resolver contra o catálogo — nunca como texto livre exibido
// diretamente (SDD.md §8.2.4: "Só slug é aceito na URL, nunca texto livre,
// para não refletir conteúdo arbitrário vindo de link externo"). Um slug
// desconhecido ou ausente é ignorado sem erro: `destinoInicial` fica
// `undefined` e `DataLivreClient`/`T01DateRangeForm` se comportam
// exatamente como no MVP (campo vazio, sem linha de contexto).
import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";
import { DataLivreClient } from "./data-livre-client";

export interface DataLivrePageProps {
  searchParams: Promise<{ destino?: string }>;
}

function resolveDestinoInicial(slug: string | undefined): string | undefined {
  if (!slug) {
    return undefined;
  }
  const destino = CATALOGO_DESTINOS.find((item) => item.slug === slug);
  if (!destino) {
    return undefined;
  }
  return `${destino.nome}, ${destino.uf}`;
}

export default async function DataLivrePage({
  searchParams,
}: DataLivrePageProps) {
  const { destino } = await searchParams;

  return (
    <DataLivreClient destinoInicial={resolveDestinoInicial(destino)} />
  );
}
