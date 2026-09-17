"use client";

// V2-L4-T09 — `AccountNav` (UX-SPEC.md §8.3 item "N `AccountNav`", §8.4
// T-HOME, §8.7 "Home sem sessão no servidor (ADR-011)"): componente cliente
// standalone, sem `SessionProvider` global (decisão do projeto para manter a
// home estática/ADR-011 — ver TASK.md V2-L4-T09). Por isso usa `getSession()`
// (chamada imperativa) dentro de `useEffect`, nunca o hook `useSession()`
// (que exige o Provider).
//
// Esta tarefa cria só o componente, sem integrá-lo a `src/app/page.tsx`
// (escopo de `V2-L4-T01`, que roda em paralelo e consome este arquivo depois
// que ele existir).
//
// Estados (UX-SPEC §8.4 T-HOME, coluna "Carregando"/"Erro"):
//   - carregando: espaço reservado (mesma altura do conteúdo final, sem
//     texto) até `getSession` resolver — evita CLS;
//   - sem conta (ou `getSession` falhou — "padrão seguro"): link "Entrar";
//   - com conta: links "Meus roteiros" e "Sair".
//
// Rotas (não inventadas — já existentes no projeto):
//   - "Entrar" → `/entrar` (V2-L7-T05), com `retorno=/meus-roteiros` (destino
//     mais provável de quem clica em "Entrar" a partir da navegação de
//     conta, já que é o único destino da allowlist ligado a conta);
//   - "Meus roteiros" → `/meus-roteiros` (V2-L8-T04);
//   - "Sair" → `signOut` de `next-auth/react` (mesmo padrão de
//     `MeusRoteirosClient`, V2-L8-T04: `signOut({ redirect: false })`, sem
//     navegação própria — quem está na home permanece na home depois de
//     sair).
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signOut } from "next-auth/react";

const ENTRAR_HREF = "/entrar?retorno=/meus-roteiros";
const MEUS_ROTEIROS_HREF = "/meus-roteiros";

type AccountNavState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated" };

export function AccountNav() {
  const [state, setState] = useState<AccountNavState>({ status: "loading" });
  const [saindoPending, setSaindoPending] = useState(false);

  useEffect(() => {
    let ativo = true;

    getSession()
      .then((session) => {
        if (!ativo) return;
        setState(
          session?.user
            ? { status: "authenticated" }
            : { status: "unauthenticated" },
        );
      })
      .catch(() => {
        if (!ativo) return;
        // UX-SPEC §8.4 T-HOME: "getSession falhou: mostra 'Entrar' (padrão
        // seguro)".
        setState({ status: "unauthenticated" });
      });

    return () => {
      ativo = false;
    };
  }, []);

  async function handleSair() {
    setSaindoPending(true);
    await signOut({ redirect: false });
    setSaindoPending(false);
    setState({ status: "unauthenticated" });
  }

  return (
    <nav
      aria-label="Conta"
      className="flex h-9 min-w-[8.5rem] items-center justify-end gap-4 text-sm font-medium text-foreground"
    >
      {state.status === "loading" && (
        <span
          data-testid="account-nav-skeleton"
          aria-hidden="true"
          className="h-4 w-20 animate-pulse rounded bg-surface"
        />
      )}

      {state.status === "unauthenticated" && (
        <Link
          href={ENTRAR_HREF}
          className="flex min-h-11 items-center hover:underline"
        >
          Entrar
        </Link>
      )}

      {state.status === "authenticated" && (
        <>
          <Link
            href={MEUS_ROTEIROS_HREF}
            className="flex min-h-11 items-center hover:underline"
          >
            Meus roteiros
          </Link>
          <button
            type="button"
            disabled={saindoPending}
            onClick={() => void handleSair()}
            className="flex min-h-11 items-center hover:underline disabled:opacity-50"
          >
            {saindoPending ? "Saindo..." : "Sair"}
          </button>
        </>
      )}
    </nav>
  );
}
