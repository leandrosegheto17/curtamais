// Cadastro de conta (e-mail/senha) para o provider de Credenciais (L1-T03).
// Não é parte do NextAuth em si (que não cria usuários para Credentials) —
// rota própria da aplicação, chamada pela tela de criação de conta (fora de
// escopo desta tarefa; aqui só a capacidade de servidor).
import { NextResponse } from "next/server";
import {
  createUserAccount,
  EmailAlreadyInUseError,
  InvalidAccountInputError,
} from "@/lib/user-account";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const { email, password, name } = (body ?? {}) as Record<string, unknown>;

  try {
    const user = await createUserAccount({
      email: typeof email === "string" ? email : "",
      password: typeof password === "string" ? password : "",
      name: typeof name === "string" ? name : null,
    });

    // A partir daqui, `user.id` é o `userId` autenticável — a associação
    // efetiva de uma `TripSession` anônima em andamento a este `userId` é
    // responsabilidade do Orquestrador de Sessão (Lote 4), fora do escopo
    // desta tarefa.
    return NextResponse.json({ id: user.id, email: user.email }, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof InvalidAccountInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EmailAlreadyInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
