// L7-T02 — Rota da tela T04 (Sugestões de destino, RF-04, UX-SPEC.md Seção
// 1/2). Server Component fino: só valida `sessionId` e delega toda a
// interatividade para `DestinoSugestoesScreen`.
//
// Convenção de rota: `/destino` (mesmo prefixo `/destino/...` já reservado
// por L7-T04 para `/destino/confirmacao`, ver comentário de cabeçalho de
// `src/app/destino/confirmacao/page.tsx` — "Uma futura rota /destino (T04,
// sugestões — L7-T02) deve manter o mesmo prefixo `/destino/...`").
//
// `sessionId` chega via querystring — quem redireciona para esta rota (as
// Server Actions de T01/T02/T03 com destino NÃO informado, L6-T03/T05/T07)
// é responsável por montar essa querystring a partir do `sessionId` já
// persistido no servidor (Diretriz de Implementação 3 do TASK.md: nenhuma
// decisão de negócio tomada no client). Sem `sessionId`, não há o que gerar
// — volta ao início (mesmo padrão de guarda já usado por
// `ConfirmacaoDestinoPage`, L7-T04).
import { redirect } from "next/navigation";

import { DestinoSugestoesScreen } from "@/components/destino/destino-sugestoes-screen";

export interface DestinoSugestoesPageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export default async function DestinoSugestoesPage({
  searchParams,
}: DestinoSugestoesPageProps) {
  const { sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/");
  }

  return <DestinoSugestoesScreen sessionId={sessionId} />;
}
