// L6-T04 — Rota da tela T02 (UX-SPEC.md Seção 1/2, RF-02.1).
//
// Server Component fino: só busca a lista já pronta via
// `getFeriadosProlongados` (L2-T02, cálculo determinístico local, ADR-007 —
// nenhuma chamada a LLM neste caminho) e delega toda a interatividade
// (seleção de feriado, campo de destino) para `FeriadosScreen`.
//
// V2-L5-T02 (UX-SPEC.md §8, RF-18.3): `?feriado=AAAA-MM-DD` opcional
// pré-seleciona o item correspondente. Este componente só valida o *formato*
// da querystring (evita repassar lixo óbvio adiante); casar a data com um
// feriado real da lista — ou silenciosamente não achar nenhum — é
// responsabilidade de `FeriadosScreen`, que é quem tem a lista em mãos.
const FERIADO_PARAM_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

import { getFeriadosProlongados } from "@/lib/actions/feriados";

import { FeriadosScreen } from "./feriados-screen";

export interface FeriadosPageProps {
  searchParams: Promise<{
    feriado?: string;
  }>;
}

export default async function FeriadosPage({
  searchParams,
}: FeriadosPageProps) {
  const feriados = await getFeriadosProlongados();
  const { feriado } = await searchParams;
  const initialFeriadoDate =
    feriado && FERIADO_PARAM_FORMAT.test(feriado) ? feriado : undefined;

  return (
    <FeriadosScreen feriados={feriados} initialFeriadoDate={initialFeriadoDate} />
  );
}
