// V2-L7-T03 — `AuthForm` (modos cadastro/entrar) + `ConsentCheckbox`,
// componentes compartilhados entre T-GATE e T-LOGIN (UX-SPEC.md §8.2, item 5
// "Formulário Criar conta", item 6 "Formulário Já tenho conta", item 9
// "Erros"; RF-16, RNF-13; ADR-012).
//
// CONTRATO ESPERADO DE QUEM INTEGRA (T-GATE = V2-L7-T04, T-LOGIN =
// V2-L7-T05, tarefas futuras que ainda não existem no momento em que este
// arquivo foi escrito):
//
//   - Este componente NÃO chama `criarConta`/`vincularSessaoAConta`/`signIn`
//     nem nenhuma Server Action diretamente (Diretriz de Implementação 3 do
//     TASK.md: nenhuma navegação/efeito client-side otimista; só a página
//     pai decide o que fazer com um envio válido). Ele só valida localmente
//     (formato de e-mail, tamanho mínimo de senha, consentimento marcado no
//     modo cadastro) e chama `onSubmit` com os valores já validados.
//   - `onSubmit(values: AuthFormValues): void` é chamado só depois da
//     validação local passar. O chamador é quem dispara a Server Action
//     (`criarConta`/`signIn`/`vincularSessaoAConta`, em sequência — ver
//     UX-SPEC.md §8.2 T-GATE) e decide navegação/estado de pendência.
//   - `isPending` (prop, default `false`) — mesmo padrão já usado por
//     `T01DateRangeForm`/`DestinoConfirmacaoScreen`: desabilita os campos e
//     o botão primário enquanto a Server Action do chamador está em voo,
//     refletindo o texto de estado ("Criando sua conta…" / "Entrando…") via
//     prop `pendingLabel` (o texto muda conforme a etapa da orquestração —
//     "Criando sua conta…" → "Entrando…" → "Guardando sua viagem…" — algo
//     que só o chamador, orquestrando 3 chamadas em sequência, sabe refletir
//     corretamente; este componente só usa o texto que a prop mandar).
//   - `serverError` (prop opcional, `{ mensagem, campo? }`) — para os erros
//     que só o servidor pode detectar e que não são validação local: e-mail
//     já cadastrado (item 9), credencial incorreta, limite de tentativas,
//     erro de servidor/rede, "conta criada mas entrada falhou". Quando
//     `campo` aponta para "email"/"senha", o erro aparece inline junto do
//     campo (mesmo tratamento dos erros locais); sem `campo`, aparece como
//     erro geral do formulário (`role="alert"` acima do botão). Fica a
//     cargo do chamador limpar `serverError` a cada nova tentativa de envio.
//   - `emailInicial` (prop opcional) — usado pelo chamador para preservar o
//     e-mail digitado ao trocar de modo (item 4, "Trocar de modo preserva o
//     e-mail digitado") e para o caso "E-mail já cadastrado" (o botão
//     "Entrar com este e-mail" troca `mode` para "entrar" com o e-mail já
//     preenchido) — a troca de `mode` em si é responsabilidade do chamador
//     (`AuthForm` é controlado em `mode`, não guarda esse estado sozinho).
//
// Acessibilidade: mesmo padrão já estabelecido por `T01DateRangeForm`
// (`src/components/entrada/t01-date-range-form.tsx`) — erro inline
// conectado ao campo via `aria-describedby` + `aria-invalid`, texto com
// ícone (nunca só cor) e `role="alert"`.
"use client";

import { useId, useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSENTIMENTO_TEXTO } from "@/lib/consentimento";

export type AuthFormMode = "cadastro" | "entrar";

export const EMAIL_INVALIDO_MENSAGEM = "Esse e-mail não parece válido.";
export const SENHA_CURTA_MENSAGEM =
  "A senha precisa ter pelo menos 8 caracteres.";
export const CONSENTIMENTO_OBRIGATORIO_MENSAGEM =
  "Para criar a conta, preciso que você concorde com o armazenamento dos dados.";
export const SENHA_MINIMA = 8;

// Validação de formato de e-mail deliberadamente simples (não é a fonte da
// verdade de validade — o servidor sempre reconfirma). Mesmo espírito de
// "decisão de detalhe de implementação" documentada em `T01DateRangeForm`.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthFormValues {
  email: string;
  senha: string;
  /** Só relevante no modo "cadastro"; sempre `true` quando chega em `onSubmit`. */
  consentimento: boolean;
}

export interface AuthFormServerError {
  mensagem: string;
  /** Quando apontar para "email" ou "senha", o erro aparece junto do campo. */
  campo?: "email" | "senha" | "consentimento";
}

export interface AuthFormProps {
  mode: AuthFormMode;
  /** Ver bloco "CONTRATO ESPERADO" no cabeçalho do arquivo. */
  onSubmit: (values: AuthFormValues) => void;
  isPending?: boolean;
  /** Texto do botão primário enquanto `isPending` é `true`. */
  pendingLabel?: string;
  serverError?: AuthFormServerError | null;
  emailInicial?: string;
  className?: string;
}

/**
 * `AuthForm` — formulário compartilhado por T-GATE (RF-16) e T-LOGIN
 * (RF-17.7), UX-SPEC.md §8.2. Modo "cadastro": e-mail + senha (nova) +
 * `ConsentCheckbox`. Modo "entrar": e-mail + senha (atual), sem checkbox de
 * consentimento (item 6: "Já tenho conta" não exige consentimento de novo).
 */
export function AuthForm({
  mode,
  onSubmit,
  isPending = false,
  pendingLabel,
  serverError = null,
  emailInicial,
  className,
}: AuthFormProps) {
  const [email, setEmail] = useState(emailInicial ?? "");
  const [senha, setSenha] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [localErrors, setLocalErrors] = useState<{
    email?: string;
    senha?: string;
    consentimento?: string;
  }>({});

  const emailErrorId = useId();
  const senhaErrorId = useId();
  const senhaDicaId = useId();
  const consentimentoErrorId = useId();
  const formErrorId = useId();

  const emailError =
    localErrors.email ??
    (serverError?.campo === "email" ? serverError.mensagem : undefined);
  const senhaError =
    localErrors.senha ??
    (serverError?.campo === "senha" ? serverError.mensagem : undefined);
  const consentimentoError =
    localErrors.consentimento ??
    (serverError?.campo === "consentimento" ? serverError.mensagem : undefined);
  const formError = serverError && !serverError.campo ? serverError.mensagem : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: typeof localErrors = {};

    if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = EMAIL_INVALIDO_MENSAGEM;
    }

    if (mode === "cadastro" && senha.length < SENHA_MINIMA) {
      errors.senha = SENHA_CURTA_MENSAGEM;
    } else if (mode === "entrar" && senha.length === 0) {
      errors.senha = SENHA_CURTA_MENSAGEM;
    }

    if (mode === "cadastro" && !consentimento) {
      errors.consentimento = CONSENTIMENTO_OBRIGATORIO_MENSAGEM;
    }

    setLocalErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    onSubmit({ email: email.trim(), senha, consentimento });
  }

  const senhaAutoComplete = mode === "cadastro" ? "new-password" : "current-password";
  const botaoLabelPadrao =
    mode === "cadastro"
      ? "Criar conta e seguir para a hospedagem"
      : "Entrar e seguir para a hospedagem";

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex w-full max-w-md flex-col gap-4", className)}
    >
      {formError ? (
        <p
          id={formErrorId}
          role="alert"
          className="flex items-center gap-1.5 text-sm text-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-email" className="text-sm font-medium text-foreground">
          E-mail
        </label>
        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className={cn(
            "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
            emailError && "border-error",
          )}
        />
        {emailError ? (
          <p
            id={emailErrorId}
            role="alert"
            className="flex items-center gap-1.5 text-sm text-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="auth-senha" className="text-sm font-medium text-foreground">
          Senha
        </label>
        <div className="flex items-center gap-2">
          <input
            id="auth-senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete={senhaAutoComplete}
            required
            disabled={isPending}
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            aria-invalid={senhaError ? true : undefined}
            aria-describedby={
              [senhaError ? senhaErrorId : null, mode === "cadastro" ? senhaDicaId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={cn(
              "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
              senhaError && "border-error",
            )}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setMostrarSenha((value) => !value)}
            aria-pressed={mostrarSenha}
          >
            Mostrar senha
          </Button>
        </div>
        {mode === "cadastro" ? (
          <p id={senhaDicaId} className="text-sm text-foreground-muted">
            Mínimo de 8 caracteres.
          </p>
        ) : null}
        {senhaError ? (
          <p
            id={senhaErrorId}
            role="alert"
            className="flex items-center gap-1.5 text-sm text-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {senhaError}
          </p>
        ) : null}
      </div>

      {mode === "cadastro" ? (
        <ConsentCheckbox
          checked={consentimento}
          onCheckedChange={setConsentimento}
          disabled={isPending}
          error={consentimentoError}
          errorId={consentimentoErrorId}
        />
      ) : null}

      {mode === "cadastro" ? (
        <p className="text-sm text-foreground-muted">
          Uso seu e-mail só para isso. Não envio marketing. Você pode excluir
          sua conta quando quiser, em &ldquo;Meus roteiros&rdquo;.
        </p>
      ) : null}

      <Button
        type="submit"
        className="mt-2 min-h-11"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? pendingLabel ?? "Enviando..." : botaoLabelPadrao}
      </Button>
    </form>
  );
}

export interface ConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  errorId?: string;
  className?: string;
}

/**
 * `ConsentCheckbox` — checkbox de consentimento LGPD (RNF-13, ADR-012).
 * Desmarcado por padrão (controlado pelo chamador, `checked` sem valor
 * inicial `true` em nenhum lugar deste componente ou de `AuthForm`). O texto
 * exibido é exatamente `CONSENTIMENTO_TEXTO`
 * (`src/lib/consentimento.ts`, já definido por ADR-012/V2-L7-T01 — este
 * componente importa a constante em vez de redefinir o texto, para nunca
 * divergir do que o servidor grava como `privacyConsentVersion`).
 */
export function ConsentCheckbox({
  checked,
  onCheckedChange,
  disabled = false,
  error,
  errorId,
  className,
}: ConsentCheckboxProps) {
  const generatedErrorId = useId();
  const resolvedErrorId = errorId ?? generatedErrorId;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-start gap-2">
        <input
          id="consentimento"
          name="consentimento"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? resolvedErrorId : undefined}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
            error && "border-error",
          )}
        />
        <label htmlFor="consentimento" className="text-sm text-foreground">
          {CONSENTIMENTO_TEXTO}
        </label>
      </div>
      {error ? (
        <p
          id={resolvedErrorId}
          role="alert"
          className="flex items-center gap-1.5 text-sm text-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
