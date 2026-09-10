// L11-T01 — Exclusão de conta e dados associados (LGPD, RNF-06).
//
// Rota de API própria (Route Handler), mesmo padrão de
// `src/app/api/auth/signup/route.ts` (rota de conta que não é o próprio
// NextAuth, mas usa a sessão dele). Não é uma Server Action porque o gatilho
// natural é uma ação destrutiva de conta chamada por `fetch` do cliente, no
// mesmo estilo de cadastro (`signup`) — nenhuma convenção de Server Action
// para ações de conta existe ainda no projeto além do login do NextAuth em
// si (que é gerenciado pela própria lib via `[...nextauth]`).
//
// SEGURANÇA (SDD §7, GUARDRAILS.md regras 9/16): `userId` é SEMPRE resolvido
// da sessão autenticada real via `getServerSession(authOptions)` — esta rota
// nunca lê/aceita `user_id` do corpo da requisição nem de query string, então
// não há como um cliente disparar exclusão da conta de outro usuário.
//
// UI que dispare esta rota (ex.: botão "Excluir minha conta" em alguma tela
// de configurações) não existe ainda em nenhum lugar do projeto — fora de
// escopo desta tarefa (BE), que só entrega a capacidade de servidor.
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { deleteUserAccount, UserNotFoundError } from "@/lib/account-deletion";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const result = await deleteUserAccount(userId);
    return NextResponse.json(
      {
        deleted: true,
        deletedTripSessionCount: result.deletedTripSessionCount,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
