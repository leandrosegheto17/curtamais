// L12-T01 — Rota `/hospedagem` (tela T06, Sugestões de hospedagem, RF-06,
// UX-SPEC.md Seção 2/4). Server Component fino: só valida `sessionId` e
// delega toda a interatividade para `HospedagemSugestoesScreen` (L8-T02) —
// mesmo padrão de `src/app/destino/page.tsx` (L7-T02). Diferente da rota
// `/destino`, `HospedagemSugestoesScreen` só recebe `sessionId` como prop
// (não há `flowState`/`destino` aqui, ver cabeçalho de
// `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`).
//
// `sessionId` chega via querystring — quem redireciona para esta rota é
// responsável por montar essa querystring a partir do `sessionId` já
// persistido no servidor (Diretriz de Implementação 3 do TASK.md: nenhuma
// decisão de negócio tomada no client). Sem `sessionId`, não há o que gerar
// — volta ao início (mesmo padrão de guarda já usado por
// `DestinoSugestoesPage`, L7-T02).
import { redirect } from "next/navigation";

import { HospedagemSugestoesScreen } from "@/components/hospedagem/hospedagem-sugestoes-screen";

export interface HospedagemSugestoesPageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export default async function HospedagemSugestoesPage({
  searchParams,
}: HospedagemSugestoesPageProps) {
  const { sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/");
  }

  return <HospedagemSugestoesScreen sessionId={sessionId} />;
}
