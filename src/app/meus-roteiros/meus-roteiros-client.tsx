"use client";

// V2-L8-T04 — `MeusRoteirosClient`, wrapper "use client" da rota T-MEUS
// (`/meus-roteiros`, RF-17, UX-SPEC.md §8 "T-MEUS").
//
// Lista de `TripListItem` (uma por sessão, RF-17.1/17.2/17.3), estado vazio
// (`EmptyState`, RF-17.6) e rodapé com "Sua conta: {e-mail}" / "Sair" /
// "Excluir minha conta" (`AlertDialog` de confirmação — nunca exclusão de um
// clique só).
//
// "Continuar de onde parei" chama a Server Action `retomarSessao`
// (V2-L8-T02, `@/lib/actions/retomar-sessao`) e só navega DEPOIS que ela
// resolve com sucesso (mesma diretriz de navegação não-otimista já usada em
// `CadastroClient`/`ConfirmacaoDestinoClient` — Diretriz de Implementação 3
// do TASK.md). Falha (`SessionNotFoundError` ou qualquer exceção) mostra uma
// mensagem inline NA PRÓPRIA LINHA, sem navegar (UX-SPEC §8.4).
//
// "Excluir minha conta" reaproveita a API já existente do MVP (Lote 11,
// `DELETE /api/account`, `src/app/api/account/route.ts`) via `fetch` direto
// — esta tela NUNCA reimplementa a lógica de exclusão de conta. Depois de um
// 200 de sucesso: `signOut({ redirect: false })` (para não deixar o
// NextAuth fazer a navegação por conta própria) e só então
// `router.push("/?conta-excluida=1")`.
//
// Nota de decisão (UX-SPEC §8.2 T-MEUS pede "vai para `/` com o aviso 'Sua
// conta foi excluída.'"): a home (`src/app/page.tsx`) é a tela T00 do MVP,
// fora do escopo de arquivos desta tarefa e já marcada para redesenho
// completo no V2 ("V2 direction" — home do consultor de roteiro, memória do
// projeto), então este componente não edita `page.tsx` para renderizar um
// banner ali. O aviso fica registrado como parâmetro de query
// (`?conta-excluida=1`) para uma tarefa futura (a própria reformulação da
// home) ler e exibir — decisão documentada aqui e na nota de implementação
// do `TASK.md`, não uma reinterpretação silenciosa do UX-SPEC.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/design-system/empty-state";
import {
  TripListItem,
  type TripListItemAction,
} from "@/components/design-system/trip-list-item";
import { statusPillStatusFromFlowState } from "@/components/design-system/status-pill";
import { retomarSessao } from "@/lib/actions/retomar-sessao";
import type { MeuRoteiroItem } from "@/lib/actions/meus-roteiros";

const CONTINUAR_ERRO_MENSAGEM = "Não consegui abrir esta viagem agora.";
const EXCLUSAO_ERRO_MENSAGEM_PADRAO = "Não consegui excluir sua conta agora.";
const ESTADOS_TERMINAIS = new Set(["concluida", "encerrada_parcial"]);

export interface MeusRoteirosClientProps {
  sessoes: MeuRoteiroItem[];
  email: string | null;
}

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function formatarPeriodo(
  inicio: Date | null,
  fim: Date | null,
): string | null {
  if (!fim) return null;
  if (!inicio) return formatarData(fim);
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

interface LinhaEstado {
  pending: boolean;
  erro: string | null;
}

export function MeusRoteirosClient({ sessoes, email }: MeusRoteirosClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [estadosLinha, setEstadosLinha] = useState<Record<string, LinhaEstado>>({});
  const [dialogAberto, setDialogAberto] = useState(false);
  const [excluindoPending, setExcluindoPending] = useState(false);
  const [excluirErro, setExcluirErro] = useState<string | null>(null);
  const [saindoPending, setSaindoPending] = useState(false);

  function atualizarLinha(sessionId: string, estado: Partial<LinhaEstado>) {
    setEstadosLinha((atual) => {
      const base: LinhaEstado = atual[sessionId] ?? { pending: false, erro: null };
      return { ...atual, [sessionId]: { ...base, ...estado } };
    });
  }

  function handleContinuar(sessionId: string) {
    atualizarLinha(sessionId, { pending: true, erro: null });
    startTransition(async () => {
      try {
        const resultado = await retomarSessao(sessionId);
        if (resultado.status === "conta_necessaria") {
          atualizarLinha(sessionId, {
            pending: false,
            erro: CONTINUAR_ERRO_MENSAGEM,
          });
          return;
        }
        router.push(resultado.rota);
      } catch {
        atualizarLinha(sessionId, {
          pending: false,
          erro: CONTINUAR_ERRO_MENSAGEM,
        });
      }
    });
  }

  async function handleSair() {
    setSaindoPending(true);
    await signOut({ redirect: false });
    router.push("/");
  }

  async function handleConfirmarExclusao() {
    setExcluindoPending(true);
    setExcluirErro(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        setExcluirErro(EXCLUSAO_ERRO_MENSAGEM_PADRAO);
        setExcluindoPending(false);
        return;
      }
      await signOut({ redirect: false });
      router.push("/?conta-excluida=1");
    } catch {
      setExcluirErro(EXCLUSAO_ERRO_MENSAGEM_PADRAO);
      setExcluindoPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl text-foreground">Meus roteiros</h1>
        <p className="text-sm text-foreground-muted">
          Tudo o que você já decidiu comigo, do mais recente para o mais
          antigo.
        </p>
      </div>

      {sessoes.length === 0 ? (
        <EmptyState
          title="Você ainda não tem roteiros salvos."
          description="Quando você escolher um destino e seguir para a hospedagem, a viagem aparece aqui."
          actions={[
            {
              label: "Planejar uma viagem",
              onClick: () => router.push("/#caminhos"),
            },
          ]}
        />
      ) : (
        <ul className="flex flex-col">
          {sessoes.map((sessao) => {
            const linhaEstado = estadosLinha[sessao.id] ?? {
              pending: false,
              erro: null,
            };
            const status = statusPillStatusFromFlowState(sessao.flowState);
            const statusLabel = sessao.rotulo;

            const action: TripListItemAction = ESTADOS_TERMINAIS.has(
              sessao.flowState,
            )
              ? { type: "ver", href: `/meus-roteiros/${sessao.id}` }
              : {
                  type: "continuar",
                  onContinuar: () => handleContinuar(sessao.id),
                  pending: linhaEstado.pending,
                  errorMessage: linhaEstado.erro,
                };

            return (
              <TripListItem
                key={sessao.id}
                destinationName={sessao.destinationName}
                periodo={formatarPeriodo(sessao.dateRangeStart, sessao.dateRangeEnd)}
                updatedLabel={formatarData(sessao.updatedAt)}
                status={status}
                statusLabel={statusLabel}
                action={action}
              />
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {email && (
          <p className="text-sm text-foreground-muted">Sua conta: {email}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={saindoPending}
            onClick={handleSair}
          >
            {saindoPending ? "Saindo..." : "Sair"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-error text-error hover:bg-error/10"
            onClick={() => {
              setExcluirErro(null);
              setDialogAberto(true);
            }}
          >
            Excluir minha conta
          </Button>
        </div>
      </div>

      <AlertDialog
        open={dialogAberto}
        title="Excluir sua conta?"
        description="Excluir a conta apaga seu e-mail e todos os roteiros salvos. Isso não pode ser desfeito."
        confirmLabel="Excluir conta"
        confirmPending={excluindoPending}
        errorMessage={excluirErro}
        onCancel={() => setDialogAberto(false)}
        onConfirm={handleConfirmarExclusao}
      />
    </main>
  );
}
