// L6-T04 — Rota da tela T02 (UX-SPEC.md Seção 1/2, RF-02.1).
//
// Server Component fino: só busca a lista já pronta via
// `getFeriadosProlongados` (L2-T02, cálculo determinístico local, ADR-007 —
// nenhuma chamada a LLM neste caminho) e delega toda a interatividade
// (seleção de feriado, campo de destino) para `FeriadosScreen`.
import { getFeriadosProlongados } from "@/lib/actions/feriados";

import { FeriadosScreen } from "./feriados-screen";

export default async function FeriadosPage() {
  const feriados = await getFeriadosProlongados();

  return <FeriadosScreen feriados={feriados} />;
}
