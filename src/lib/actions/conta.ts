"use server";

// V2-L7-T01 — Server Action de cadastro (RF-16, RNF-13, ADR-012).
//
// Substitui `POST /api/auth/signup` (removida por este ADR, item 4): a
// criação de conta passa a ser uma Server Action, que já tem verificação de
// origem (CSRF) nativa do Next.js. Toda a lógica de hash/validação/gravação
// é reaproveitada de `createUserAccount` (`@/lib/user-account`, L1-T03) —
// esta função só traduz as exceções dela para um resultado discriminado,
// sem duplicar regra nenhuma.
//
// Fora de escopo desta tarefa: `signIn` e o vínculo de `TripSession.userId`
// (ADR-009/ADR-012 item 5) — ambos acontecem DEPOIS que `criarConta` retorna
// sucesso, orquestrados pela UI (V2-L7-T03, tarefa paralela) e pelo
// Orquestrador de Sessão, não por esta função.
// V2-L7-T08 — rate limit por IP (SDD.md §8.7): 5 cadastros por IP a cada 10
// min, checado ANTES de qualquer outra validação/escrita (mesma prioridade
// já dada à checagem de consentimento em `createUserAccount`). Mesmo
// mecanismo em memória do Gateway de IA (L3-T05), ver
// `@/lib/auth-rate-limit`.
import { headers } from "next/headers";
import {
  criarContaRateLimiter,
  extractClientIp,
} from "@/lib/auth-rate-limit";
import {
  ConsentimentoAusenteError,
  createUserAccount,
  EmailAlreadyInUseError,
  InvalidAccountInputError,
} from "@/lib/user-account";

export type CriarContaResult =
  | { status: "sucesso"; userId: string }
  | { status: "erro"; campo: "consentimento"; mensagem: string }
  | { status: "erro"; campo: "email"; mensagem: string }
  | { status: "erro"; campo: "senha"; mensagem: string }
  // V2-L7-T08 — sem `campo` (fica `undefined`, mesmo shape/comportamento de
  // `AuthFormServerError` já usado por `AuthForm`/`LoginScreen`: sem campo
  // específico, o erro aparece como mensagem geral do formulário, não preso
  // a um input). Deliberadamente não é um novo valor de `campo` (que exigiria
  // estender o enum de `AuthFormServerError` numa tela de UI, fora do escopo
  // desta tarefa).
  | { status: "erro"; campo?: undefined; mensagem: string };

// UX-SPEC.md §8.2 item 9 ("Erros") — mesma mensagem reproduzida
// literalmente aqui e em `AuthForm`/`CONSENTIMENTO_OBRIGATORIO_MENSAGEM`
// (`src/components/conta/auth-form.tsx`, V2-L7-T03). Duplicada
// deliberadamente em vez de importada: aquele é um componente de cliente
// (`"use client"`), este módulo é server-only — a duplicação é o mesmo
// padrão já adotado pelo próprio `AuthForm` para as mensagens de validação
// local. Em condições normais o servidor nunca chega a devolver este erro,
// já que `AuthForm` bloqueia o envio localmente sem o checkbox marcado;
// existe para o caso de um payload adulterado que pule a validação do
// cliente.
const CONSENTIMENTO_AUSENTE_MENSAGEM =
  "Para criar a conta, preciso que você concorde com o armazenamento dos dados.";

// V2-L7-T08 — mesma mensagem genérica usada pela guarda de rate limit do
// Gateway de IA (`checkGatewayIaRateLimit`), adaptada ao contexto de
// cadastro. Não confirma nem nega nada sobre o e-mail informado.
const CADASTRO_RATE_LIMIT_MENSAGEM =
  "Muitas tentativas. Tente novamente em alguns minutos.";

export interface CriarContaInput {
  email: string;
  senha: string;
  consentimento: boolean;
}

/**
 * RF-16/RNF-13 (ADR-012) — cria a conta (e-mail/senha) só depois de
 * confirmado `consentimento === true`. Nunca lança para o chamador em
 * nenhum dos casos de erro esperados abaixo (consentimento ausente, e-mail
 * inválido/duplicado, senha curta) — todos viram um `CriarContaResult`
 * discriminado, para a UI (V2-L7-T03) tratar sem `try/catch`.
 */
export async function criarConta(
  input: CriarContaInput,
): Promise<CriarContaResult> {
  // V2-L7-T08 — checagem de rate limit por IP ANTES de qualquer outra
  // validação/escrita (mesma prioridade da checagem de consentimento acima
  // dela em `createUserAccount`: nada é lido/gravado no banco antes disso).
  const headerList = await headers();
  const clientIp = extractClientIp(headerList.get("x-forwarded-for"));
  const allowed = criarContaRateLimiter.register(clientIp);
  if (!allowed) {
    return { status: "erro", mensagem: CADASTRO_RATE_LIMIT_MENSAGEM };
  }

  try {
    const user = await createUserAccount({
      email: input.email,
      password: input.senha,
      consentimento: input.consentimento,
    });
    return { status: "sucesso", userId: user.id };
  } catch (error) {
    if (error instanceof ConsentimentoAusenteError) {
      return {
        status: "erro",
        campo: "consentimento",
        mensagem: CONSENTIMENTO_AUSENTE_MENSAGEM,
      };
    }
    if (error instanceof EmailAlreadyInUseError) {
      return { status: "erro", campo: "email", mensagem: error.message };
    }
    if (error instanceof InvalidAccountInputError) {
      return { status: "erro", campo: error.field, mensagem: error.message };
    }
    // Erro inesperado (ex.: banco fora do ar) — não é um dos casos de
    // validação de negócio mapeados acima, deixa subir para o tratamento
    // padrão de erro de Server Action do Next.js em vez de mascarar.
    throw error;
  }
}
