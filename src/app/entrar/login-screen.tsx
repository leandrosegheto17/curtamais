"use client";

// V2-L7-T05 — Tela T-LOGIN (UX-SPEC.md §8, RF-17.7): "Entre para ver seus
// roteiros", mesmo `AuthForm` (V2-L7-T03) usado por T-GATE, sem a faixa de
// contexto de destino (não há sessão de viagem em andamento aqui) e sem as
// saídas ("Agora não" / "Voltar") do T-GATE.
//
// Modo padrão é "entrar" (item 1 do UX-SPEC §8, T-LOGIN); a alternância para
// "Criar conta" continua disponível, com o mesmo `ConsentCheckbox`.
//
// Diretriz de Implementação 3 (TASK.md): nenhuma navegação client-side
// otimista — só navega depois que `signIn` resolve com sucesso confirmado
// (`result.ok`). Falha (`result.error`) mostra a mensagem genérica "E-mail
// ou senha incorretos." via `serverError` do `AuthForm`, nunca distinguindo
// se o e-mail existe ou não (mesma exigência de T-GATE, item 9).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import {
  AuthForm,
  type AuthFormMode,
  type AuthFormServerError,
  type AuthFormValues,
} from "@/components/conta/auth-form";
import { criarConta } from "@/lib/actions/conta";

const CREDENCIAL_INCORRETA_MENSAGEM = "E-mail ou senha incorretos.";
const ERRO_SERVIDOR_MENSAGEM =
  "Não consegui concluir agora. Tente de novo.";

export interface LoginScreenProps {
  /** Já validado contra a allowlist por `page.tsx` — nunca lido de novo aqui. */
  retorno: string;
}

export function LoginScreen({ retorno }: LoginScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthFormMode>("entrar");
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<string | undefined>(
    undefined,
  );
  const [serverError, setServerError] = useState<AuthFormServerError | null>(
    null,
  );

  async function handleEntrar(values: AuthFormValues) {
    setServerError(null);
    setIsPending(true);
    setPendingLabel("Entrando...");

    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.senha,
        redirect: false,
      });

      if (!result || result.error || !result.ok) {
        setServerError({ mensagem: CREDENCIAL_INCORRETA_MENSAGEM });
        setIsPending(false);
        return;
      }

      router.push(retorno);
    } catch {
      setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
      setIsPending(false);
    }
  }

  async function handleCadastro(values: AuthFormValues) {
    setServerError(null);
    setIsPending(true);
    setPendingLabel("Criando sua conta...");

    try {
      const resultado = await criarConta({
        email: values.email,
        senha: values.senha,
        consentimento: values.consentimento,
      });

      if (resultado.status !== "sucesso") {
        setServerError({
          mensagem: resultado.mensagem,
          campo: resultado.campo,
        });
        setIsPending(false);
        return;
      }

      setPendingLabel("Entrando...");
      const signInResult = await signIn("credentials", {
        email: values.email,
        password: values.senha,
        redirect: false,
      });

      if (!signInResult || signInResult.error || !signInResult.ok) {
        // "Conta criada, mas a entrada falhou" (UX-SPEC.md §8.2 item 9):
        // troca para o modo entrar com o e-mail já preenchido.
        setEmail(values.email);
        setMode("entrar");
        setServerError({
          mensagem: "Sua conta foi criada. Entre para continuar.",
        });
        setIsPending(false);
        return;
      }

      router.push(retorno);
    } catch {
      setServerError({ mensagem: ERRO_SERVIDOR_MENSAGEM });
      setIsPending(false);
    }
  }

  function handleSubmit(values: AuthFormValues) {
    if (mode === "entrar") {
      void handleEntrar(values);
    } else {
      void handleCadastro(values);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl text-foreground">
        Entre para ver seus roteiros
      </h1>

      <div className="flex gap-2" role="group" aria-label="Modo de acesso">
        <button
          type="button"
          aria-pressed={mode === "entrar"}
          onClick={() => setMode("entrar")}
          className="min-h-9 flex-1 rounded-md border border-input px-3 text-sm font-medium text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          Já tenho conta
        </button>
        <button
          type="button"
          aria-pressed={mode === "cadastro"}
          onClick={() => setMode("cadastro")}
          className="min-h-9 flex-1 rounded-md border border-input px-3 text-sm font-medium text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          Criar conta
        </button>
      </div>

      <AuthForm
        mode={mode}
        onSubmit={handleSubmit}
        isPending={isPending}
        pendingLabel={pendingLabel}
        serverError={serverError}
        emailInicial={email}
      />
    </main>
  );
}
