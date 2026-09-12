// L12-T02 — Rota `/passeios` (tela T07, Sugestões de passeios, RF-07,
// UX-SPEC.md Seção 2/4). Server Component fino: só valida `sessionId` e
// delega toda a interatividade para `PasseiosSugestoesScreen` (L9-T02) —
// mesmo padrão de `src/app/destino/page.tsx` (L7-T02) e
// `src/app/hospedagem/page.tsx` (L12-T01). Diferente da rota `/destino`,
// `PasseiosSugestoesScreen` só recebe `sessionId` como prop obrigatória de
// identidade (não há `flowState`/`destino` aqui, ver cabeçalho de
// `src/components/passeios/passeios-sugestoes-screen.tsx`).
//
// `PasseiosSugestoesScreen` ainda mantém a prop `actions` OBRIGATÓRIA (não
// `actionsOverride` opcional como `HospedagemSugestoesScreen`/
// `DestinoSugestoesScreen`) — ver bloco "CONTRATO ESPERADO DA SERVER ACTION
// DE L9-T03" no cabeçalho daquele arquivo: a tela foi escrita antes de
// `@/lib/actions/passeios.ts` existir e documentou que a instância que
// integrasse a rota deveria decidir a forma de conectar as funções reais.
// `@/lib/actions/passeios.ts` (L9-T03) já existe e expõe exatamente as três
// funções esperadas (`gerarSugestoesPasseios`/`aprovarSelecaoPasseios`/
// `encerrarResolucaoPasseios`, mesmos nomes e assinaturas de
// `PasseiosScreenActions`) — esta rota as passa diretamente como prop
// `actions`, sem precisar alterar `PasseiosSugestoesScreen` (fora do escopo
// desta tarefa, L12-T02).
//
// `sessionId` chega via querystring — quem redireciona para esta rota é
// responsável por montar essa querystring a partir do `sessionId` já
// persistido no servidor (Diretriz de Implementação 3 do TASK.md: nenhuma
// decisão de negócio tomada no client). Sem `sessionId`, não há o que gerar
// — volta ao início (mesmo padrão de guarda já usado por
// `DestinoSugestoesPage`/`HospedagemSugestoesPage`).
import { redirect } from "next/navigation";

import { PasseiosSugestoesScreen } from "@/components/passeios/passeios-sugestoes-screen";
import {
  aprovarSelecaoPasseios,
  encerrarResolucaoPasseios,
  gerarSugestoesPasseios,
} from "@/lib/actions/passeios";

export interface PasseiosSugestoesPageProps {
  searchParams: Promise<{
    sessionId?: string;
  }>;
}

export default async function PasseiosSugestoesPage({
  searchParams,
}: PasseiosSugestoesPageProps) {
  const { sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/");
  }

  return (
    <PasseiosSugestoesScreen
      sessionId={sessionId}
      actions={{
        gerarSugestoesPasseios,
        aprovarSelecaoPasseios,
        encerrarResolucaoPasseios,
      }}
    />
  );
}
