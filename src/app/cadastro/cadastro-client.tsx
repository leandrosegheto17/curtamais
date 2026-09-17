"use client";

// V2-L7-T04 — `CadastroClient`, wrapper "use client" da rota T-GATE
// (`/cadastro?sessionId=`, RF-16, RNF-13, UX-SPEC.md §8.2, ADR-009 item 3).
//
// Orquestra os 4 sub-estados descritos no UX-SPEC (item 4 "Alternância",
// item 5 "Formulário Criar conta", item 6 "Formulário Já tenho conta", item 7
// "Usuário já autenticado") sobre o `AuthForm` compartilhado (V2-L7-T03,
// `@/components/conta/auth-form`) e as duas saídas do item 8 ("Agora não" /
// "Voltar").
//
// Orquestração de 3 chamadas em sequência (cadastro): `criarConta` →
// `signIn("credentials", { redirect: false })` → `vincularSessaoAConta`. Cada
// etapa tem tratamento de erro PRÓPRIO (comentado em cada bloco abaixo) —
// nunca deixa o usuário num estado inconsistente sem explicação (ex.: conta
// criada mas vínculo falhou não tenta `criarConta`/`signIn` de novo
// automaticamente, UX-SPEC item 9). "Já tenho conta" é a mesma orquestração
// sem o primeiro passo. "Continuar com esta conta" (já autenticado) é só o
// terceiro passo.
//
// NENHUMA chamada de `criarConta`/`signIn`/`vincularSessaoAConta` acontece
// fora de um `onClick`/`onSubmit` explícito — o componente não tem nenhum
// `useEffect` de montagem que dispare rede (crítério de aceite desta tarefa:
// "vínculo só ocorre no clique explícito do usuário, NUNCA no GET/
// carregamento da página").
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AuthForm,
  type AuthFormServerError,
  type AuthFormMode,
  type AuthFormValues,
} from "@/components/conta/auth-form";
import { criarConta } from "@/lib/actions/conta";
import { vincularSessaoAConta } from "@/lib/actions/vinculo-conta";
import { encerrarResolucaoDestino } from "@/lib/actions/destino";

// UX-SPEC.md §8.2 item 9 — mesma mensagem literal usada por `EmailAlreadyInUseError`
// (`src/lib/user-account.ts`) e reproduzida por `criarConta`
// (`src/lib/actions/conta.ts`). Comparação por igualdade de string (não há
// código de erro discriminado além do `campo: "email"`) — decisão pequena de
// implementação, documentada aqui: se o texto de `criarConta` mudar um dia,
// este `===` para de casar e o fluxo cai no tratamento genérico de erro de
// e-mail (ainda correto, só perde o CTA extra "Entrar com este e-mail").
const EMAIL_JA_CADASTRADO_MENSAGEM = "E-mail já cadastrado.";

const ERRO_SERVIDOR_MENSAGEM =
  "Não consegui concluir agora. Seu destino continua guardado aqui; tente de novo.";
const CREDENCIAL_INCORRETA_MENSAGEM = "E-mail ou senha incorretos.";
const CONTA_CRIADA_ENTRADA_FALHOU_MENSAGEM =
  "Sua conta foi criada. Entre para continuar.";

type EtapaOrquestracao = "criando" | "entrando" | "vinculando" | null;

/** Passo pendente de retentativa quando só uma parte da orquestração falhou
 * (ex.: conta criada e `signIn` funcionou, mas `vincularSessaoAConta` deu
 * erro de rede) — "Tentar de novo" refaz só esse passo, nunca a orquestração
 * inteira, para não recriar a conta nem logar de novo à toa. */
type RetentativaPendente =
  | { tipo: "vincular"; email: string; senha: string }
  | null;

export interface CadastroClientProps {
  sessionId: string;
  /** Nome do destino já aprovado, se houver (`DestinationApproval.name`). */
  destino: string | null;
  /** Período formatado ("10/10 a 12/10/2026"), se houver. */
  periodo: string | null;
  /** E-mail da conta já autenticada nesta requisição, se houver (resolvido
   * no servidor via `getServerSession`, UX-SPEC item 7 "Usuário já
   * autenticado"). */
  contaAutenticadaEmail: string | null;
  /** Rota de "Voltar" (T05), já resolvida no servidor via `rotaDaEtapa`. */
  voltarHref: string;
}

export function CadastroClient({
  sessionId,
  destino,
  periodo,
  contaAutenticadaEmail,
  voltarHref,
}: CadastroClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthFormMode>("cadastro");
  const [isPending, startTransition] = useTransition();
  const [etapa, setEtapa] = useState<EtapaOrquestracao>(null);
  const [serverError, setServerError] = useState<AuthFormServerError | null>(
    null,
  );
  const [emailJaCadastrado, setEmailJaCadastrado] = useState(false);
  const [retentativa, setRetentativa] = useState<RetentativaPendente>(null);
  const [saindoPending, setSaindoPending] = useState(false);
  const [agoraNaoPending, setAgoraNaoPending] = useState(false);
  const [agoraNaoErro, setAgoraNaoErro] = useState<string | null>(null);

  function limparErros() {
    setServerError(null);
    setEmailJaCadastrado(false);
    setRetentativa(null);
  }

  async function vincularEContinuar(): Promise<void> {
    setEtapa("vinculando");
    const resultado = await vincularSessaoAConta({ sessionId });
    if (resultado.status === "nao_autenticado") {
      // Não deveria acontecer neste ponto (só chamado depois de `signIn`
      // resolver com sucesso, ou a partir do estado "já autenticado") — trata
      // como erro de servidor em vez de assumir qualquer navegação, mesmo
      // raciocínio defensivo do resto do arquivo.
      throw new Error("vincular_sem_autenticacao");
    }
    router.push(resultado.rota);
  }

  function handleCadastroSubmit(values: AuthFormValues) {
    limparErros();
    setEtapa("criando");
    startTransition(async () => {
      try {
        const criado = await criarConta({
          email: values.email,
          senha: values.senha,
          consentimento: values.consentimento,
        });

        if (criado.status === "erro") {
          if (
            criado.campo === "email" &&
            criado.mensagem === EMAIL_JA_CADASTRADO_MENSAGEM
          ) {
            setEmailJaCadastrado(true);
          } else {
            setServerError({ mensagem: criado.mensagem, campo: criado.campo });
          }
          setEtapa(null);
          return;
        }

        setEtapa("entrando");
        const entrada = await signIn("credentials", {
          email: values.email,
          password: values.senha,
          redirect: false,
        });

        if (!entrada || entrada.error) {
          // UX-SPEC item 9, "Conta criada, mas a entrada falhou": troca para
          // o modo entrar com o e-mail já preenchido (o mesmo `AuthForm`
          // segue montado, então o e-mail digitado persiste sozinho) e a
          // mensagem exata do spec.
          setMode("entrar");
          setServerError({ mensagem: CONTA_CRIADA_ENTRADA_FALHOU_MENSAGEM });
          setEtapa(null);
          return;
        }

        await vincularEContinuar();
      } catch {
        // Vínculo falhou depois de conta criada + entrada bem-sucedida (ex.:
        // erro de rede) — não tenta `criarConta`/`signIn` de novo (a conta já
        // existe e já está autenticada), só oferece retentar o vínculo.
        setRetentativa({ tipo: "vincular", email: values.email, senha: values.senha });
        setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
        setEtapa(null);
      }
    });
  }

  function handleEntrarSubmit(values: AuthFormValues) {
    limparErros();
    setEtapa("entrando");
    startTransition(async () => {
      try {
        const entrada = await signIn("credentials", {
          email: values.email,
          password: values.senha,
          redirect: false,
        });

        if (!entrada || entrada.error) {
          setServerError({ mensagem: CREDENCIAL_INCORRETA_MENSAGEM });
          setEtapa(null);
          return;
        }

        await vincularEContinuar();
      } catch {
        setRetentativa({ tipo: "vincular", email: values.email, senha: values.senha });
        setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
        setEtapa(null);
      }
    });
  }

  function handleTentarDeNovo() {
    if (!retentativa) {
      return;
    }
    limparErros();
    startTransition(async () => {
      try {
        await vincularEContinuar();
      } catch {
        setRetentativa(retentativa);
        setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
        setEtapa(null);
      }
    });
  }

  function handleContinuarComEstaConta() {
    limparErros();
    setEtapa("vinculando");
    startTransition(async () => {
      try {
        await vincularEContinuar();
      } catch {
        setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
        setEtapa(null);
      }
    });
  }

  function handleSair() {
    setSaindoPending(true);
    signOut({ redirect: false }).finally(() => {
      setSaindoPending(false);
      // `contaAutenticadaEmail` vem do servidor (`getServerSession`) — depois
      // de sair, precisa refletir a nova ausência de conta sem recarregar a
      // página inteira.
      router.refresh();
    });
  }

  function handleAgoraNao() {
    setAgoraNaoErro(null);
    setAgoraNaoPending(true);
    startTransition(async () => {
      try {
        // RF-16.5/RN-03 — preserva o `DestinationApproval` já gravado
        // (`encerrarResolucaoDestino` só grava `TripSession.flowState`,
        // nunca toca entidade filha, ver `@/lib/actions/destino.ts`). A
        // sessão permanece anônima: nenhuma chamada de `criarConta`/`signIn`/
        // `vincularSessaoAConta` acontece neste caminho.
        const resultado = await encerrarResolucaoDestino(sessionId);
        const params = new URLSearchParams({
          sessionId: resultado.sessionId,
          flowState: resultado.flowState,
        });
        router.push(`/encerramento?${params.toString()}`);
      } catch {
        setAgoraNaoErro(ERRO_SERVIDOR_MENSAGEM);
        setAgoraNaoPending(false);
      }
    });
  }

  const pendingLabel =
    etapa === "criando"
      ? "Criando sua conta…"
      : etapa === "entrando"
        ? "Entrando…"
        : etapa === "vinculando"
          ? "Guardando sua viagem…"
          : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 sm:px-6">
      {destino ? (
        <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-foreground-muted">
          Destino escolhido: <span className="text-foreground">{destino}</span>
          {periodo ? ` · ${periodo}` : ""}
        </div>
      ) : null}

      <h1 className="font-serif text-2xl text-foreground">
        Vamos guardar a sua viagem?
      </h1>

      <p className="text-sm text-foreground-muted">
        Com uma conta, eu salvo o que você já decidiu e seguimos juntos para
        hospedagem, passeios e roteiro.
      </p>

      {contaAutenticadaEmail ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            Você está na conta {contaAutenticadaEmail}.
          </p>

          {serverError?.mensagem ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm text-error"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {serverError.mensagem}
            </p>
          ) : null}

          <Button
            type="button"
            className="min-h-11"
            disabled={isPending}
            aria-busy={etapa === "vinculando"}
            onClick={handleContinuarComEstaConta}
          >
            {etapa === "vinculando" ? "Guardando sua viagem…" : "Continuar com esta conta"}
          </Button>
          <Button
            type="button"
            variant="link"
            disabled={saindoPending}
            onClick={handleSair}
            className="self-start px-0"
          >
            Não é você? Sair
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex gap-2" role="group" aria-label="Alternar entre criar conta e entrar">
            <Button
              type="button"
              variant={mode === "cadastro" ? "default" : "outline"}
              aria-pressed={mode === "cadastro"}
              disabled={isPending}
              onClick={() => {
                setMode("cadastro");
                limparErros();
              }}
              className="flex-1"
            >
              Criar conta
            </Button>
            <Button
              type="button"
              variant={mode === "entrar" ? "default" : "outline"}
              aria-pressed={mode === "entrar"}
              disabled={isPending}
              onClick={() => {
                setMode("entrar");
                limparErros();
              }}
              className="flex-1"
            >
              Já tenho conta
            </Button>
          </div>

          {emailJaCadastrado ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
            >
              <p className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Esse e-mail já tem conta. Quer entrar com ele?
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setMode("entrar");
                  setEmailJaCadastrado(false);
                }}
              >
                Entrar com este e-mail
              </Button>
            </div>
          ) : null}

          {retentativa && serverError?.mensagem ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-error/40 bg-surface p-3 text-sm text-error"
            >
              <p className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {serverError.mensagem}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={isPending}
                onClick={handleTentarDeNovo}
              >
                Tentar de novo
              </Button>
            </div>
          ) : null}

          <AuthForm
            mode={mode}
            onSubmit={mode === "cadastro" ? handleCadastroSubmit : handleEntrarSubmit}
            isPending={isPending}
            pendingLabel={pendingLabel}
            serverError={retentativa ? null : emailJaCadastrado ? null : serverError}
          />

          {mode === "cadastro" ? (
            <p className="text-sm text-foreground-muted">
              No próximo passo eu peço um e-mail para guardar a sua viagem.
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">
              Não lembra a senha? Por enquanto não consigo recuperá-la; você
              pode criar outra conta com outro e-mail.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {agoraNaoErro ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-sm text-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {agoraNaoErro}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={agoraNaoPending}
          aria-busy={agoraNaoPending}
          onClick={handleAgoraNao}
        >
          {agoraNaoPending ? "Guardando..." : "Agora não — ficar só com o destino"}
        </Button>
        <Button type="button" variant="link" asChild className="self-start px-0">
          <Link href={voltarHref}>Voltar</Link>
        </Button>
      </div>
    </main>
  );
}
