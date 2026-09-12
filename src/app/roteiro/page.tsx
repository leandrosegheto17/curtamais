// L12-T03 — Rota da tela T08 (Roteiro final, RF-08, UX-SPEC.md Seção 2/4/6).
// Server Component fino: só valida `sessionId` e delega toda a
// interatividade para `RoteiroScreen` (L10-T02) — mesmo padrão de
// `src/app/destino/page.tsx` (L7-T02).
//
// `sessionId` chega via querystring — quem redireciona para esta rota (a
// Server Action `aprovarPasseios`/fluxo de passeios, L9-T03) é responsável
// por montar essa querystring a partir do `sessionId` já persistido no
// servidor (Diretriz de Implementação 3 do TASK.md: nenhuma decisão de
// negócio tomada no client). Sem `sessionId`, não há o que gerar — volta ao
// início (mesmo padrão de guarda já usado por `DestinoSugestoesPage`).
//
// `RoteiroScreen` só recebe `sessionId` como prop obrigatória (ver
// `src/components/roteiro/roteiro-screen.tsx`) — nenhum `flowState` a
// resolver aqui, diferente de `ConfirmacaoDestinoPage`.
import { redirect } from "next/navigation";

import { RoteiroScreen } from "@/components/roteiro/roteiro-screen";

export interface RoteiroPageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export default async function RoteiroPage({ searchParams }: RoteiroPageProps) {
  const { sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/");
  }

  return <RoteiroScreen sessionId={sessionId} />;
}
