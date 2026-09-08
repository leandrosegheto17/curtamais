// Criação de conta para o provider de Credenciais (L1-T03).
//
// O NextAuth não cria usuários automaticamente para o Credentials Provider
// (isso só acontece com providers OAuth via Prisma Adapter) — o cadastro é
// responsabilidade da aplicação. Esta função é a única forma de criar um
// `User` com senha, usada pela rota `POST /api/auth/signup`.
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export class InvalidAccountInputError extends Error {}
export class EmailAlreadyInUseError extends Error {}

export interface CreateUserAccountInput {
  email: string;
  password: string;
  name?: string | null;
}

export interface CreatedUserAccount {
  id: string;
  email: string;
  name: string | null;
}

function validateInput(input: CreateUserAccountInput): void {
  if (!input.email || !EMAIL_REGEX.test(input.email)) {
    throw new InvalidAccountInputError("E-mail inválido.");
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidAccountInputError(
      `Senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
}

/**
 * Cria uma conta (usuário) autenticável via e-mail/senha. `userId` do
 * usuário criado fica disponível a partir daqui para uso futuro (ex.: L4
 * associar `TripSession.userId`) — esta função não toca `TripSession`.
 */
export async function createUserAccount(
  input: CreateUserAccountInput,
): Promise<CreatedUserAccount> {
  validateInput(input);

  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    throw new EmailAlreadyInUseError("E-mail já cadastrado.");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: input.name ?? null,
      passwordHash,
    },
  });

  return { id: user.id, email: user.email as string, name: user.name };
}
