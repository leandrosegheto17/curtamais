// Criação de conta para o provider de Credenciais (L1-T03), estendida por
// ADR-012 (V2-L7-T01, RNF-13) para exigir consentimento LGPD explícito.
//
// O NextAuth não cria usuários automaticamente para o Credentials Provider
// (isso só acontece com providers OAuth via Prisma Adapter) — o cadastro é
// responsabilidade da aplicação. Esta função é a única forma de criar um
// `User` com senha, usada pela Server Action `criarConta`
// (`src/lib/actions/conta.ts`, V2-L7-T01). A antiga rota
// `POST /api/auth/signup` foi removida por este ADR (item 4).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { CONSENTIMENTO_VERSAO } from "@/lib/consentimento";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export type InvalidAccountInputField = "email" | "senha";

export class InvalidAccountInputError extends Error {
  readonly field: InvalidAccountInputField;

  constructor(message: string, field: InvalidAccountInputField) {
    super(message);
    this.field = field;
  }
}

export class EmailAlreadyInUseError extends Error {}

// ADR-012: "sem consentimento === true, a ação devolve
// `{ status: "erro", campo: "consentimento" }` sem consultar o banco" —
// esta é a exceção interna que `criarConta` traduz para esse shape.
export class ConsentimentoAusenteError extends Error {}

export interface CreateUserAccountInput {
  email: string;
  password: string;
  name?: string | null;
  /** ADR-012 — precisa ser exatamente `true`; qualquer outro valor (incluindo
   * `false`/`undefined`) é rejeitado ANTES de qualquer leitura/escrita no
   * banco. */
  consentimento: boolean;
}

export interface CreatedUserAccount {
  id: string;
  email: string;
  name: string | null;
}

function validateInput(input: CreateUserAccountInput): void {
  // Checado primeiro e de forma isolada (guard clause própria, não dentro do
  // mesmo `if` de e-mail/senha) porque, ao contrário dos outros dois campos,
  // sua ausência não é um "detalhe de formulário inválido" — é o gate legal
  // do RNF-13: nenhuma escrita pode acontecer sem ele, então a checagem
  // acontece antes de qualquer outra validação ou consulta ao banco.
  if (input.consentimento !== true) {
    throw new ConsentimentoAusenteError(
      "É necessário aceitar o uso dos dados para criar a conta.",
    );
  }
  // Mensagens abaixo reproduzem literalmente UX-SPEC.md §8.2 item 9
  // ("Erros"), mesmo texto já duplicado em `AuthForm`
  // (`EMAIL_INVALIDO_MENSAGEM`/`SENHA_CURTA_MENSAGEM`,
  // `src/components/conta/auth-form.tsx`, V2-L7-T03) para a validação local
  // — aqui é a revalidação de servidor para o caso de payload adulterado.
  if (!input.email || !EMAIL_REGEX.test(input.email)) {
    throw new InvalidAccountInputError(
      "Esse e-mail não parece válido.",
      "email",
    );
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidAccountInputError(
      "A senha precisa ter pelo menos 8 caracteres.",
      "senha",
    );
  }
}

/**
 * Cria uma conta (usuário) autenticável via e-mail/senha, já com o
 * consentimento LGPD do cadastro (ADR-012/RNF-13) registrado com o relógio
 * do SERVIDOR — `privacyConsentAt`/`privacyConsentVersion` nunca vêm do
 * input, só o booleano `consentimento` é lido do cliente. `userId` do
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

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: input.name ?? null,
        passwordHash,
        // ADR-012: relógio do servidor, nunca do cliente — nenhum campo de
        // timestamp é aceito no `CreateUserAccountInput` para começo de
        // conversa, então não há como um valor do cliente chegar aqui.
        privacyConsentAt: new Date(),
        privacyConsentVersion: CONSENTIMENTO_VERSAO,
      },
    });
    return { id: user.id, email: user.email as string, name: user.name };
  } catch (error) {
    // Corrida entre dois cadastros com o mesmo e-mail (janela entre o
    // `findUnique` acima e este `create`) — mesma mensagem amigável da
    // checagem prévia, nunca vazando o erro do Prisma (ADR-012, item 3).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new EmailAlreadyInUseError("E-mail já cadastrado.");
    }
    throw error;
  }
}
