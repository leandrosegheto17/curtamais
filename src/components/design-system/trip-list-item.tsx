"use client";

// V2-L8-T04 — `TripListItem` (UX-SPEC.md §8, T-MEUS, RF-17).
//
// Uma linha da lista "Meus roteiros": miniatura decorativa (catálogo ou
// fallback, `alt=""` — UX-SPEC §8.2), nome do destino (ou "Destino ainda não
// escolhido"), período, "Atualizado em", `StatusPill` e UM único botão de
// ação por linha (UX-SPEC: "o item não é inteiro clicável, para evitar
// ambiguidade").
//
// A ação é uma união discriminada: "continuar" chama `onContinuar` (a tela
// decide o que fazer com o resultado, ex.: `retomarSessao` + navegação) com
// estado de processamento local (`pending`) e mensagem de erro inline sem
// navegar (UX-SPEC §8.4: "Falha em 'Continuar': mensagem inline na própria
// linha... sem navegar"); "ver" é um link puro (`href`) para T-MEUS-DET.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DestinationImage } from "@/components/catalogo/destination-image";
import { resolverImagemDestino } from "@/lib/catalogo/resolver-imagem";
import { StatusPill, type StatusPillStatus } from "./status-pill";

export type TripListItemAction =
  | {
      type: "continuar";
      onContinuar: () => void;
      pending: boolean;
      errorMessage?: string | null;
    }
  | {
      type: "ver";
      href: string;
    };

export interface TripListItemProps {
  destinationName: string | null;
  /** Período já formatado ("10/10 a 12/10/2026"), ou `null` se ainda não houver data confirmada suficiente. */
  periodo: string | null;
  /** "Atualizado em 16/09/2026", já formatado. */
  updatedLabel: string;
  status: StatusPillStatus;
  statusLabel: string;
  action: TripListItemAction;
}

/** Miniatura quadrada decorativa do destino (catálogo ou fallback) — `alt=""` (UX-SPEC §8.2). */
function TripThumbnail({ destinationName }: { destinationName: string | null }) {
  if (!destinationName) {
    return (
      <div
        aria-hidden="true"
        className="h-14 w-14 shrink-0 rounded-md bg-surface-raised"
      />
    );
  }

  const imagem = resolverImagemDestino(destinationName);
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md">
      <DestinationImage imagem={imagem} alt="" sizes="56px" />
    </div>
  );
}

export function TripListItem({
  destinationName,
  periodo,
  updatedLabel,
  status,
  statusLabel,
  action,
}: TripListItemProps) {
  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <TripThumbnail destinationName={destinationName} />
        <div className="flex flex-col gap-1">
          <p className="font-serif text-lg text-foreground">
            {destinationName ?? "Destino ainda não escolhido"}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
            {periodo && <span>{periodo}</span>}
            <span>Atualizado em {updatedLabel}</span>
          </div>
          <StatusPill status={status} label={statusLabel} />
        </div>
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        {action.type === "ver" ? (
          <Button asChild type="button" variant="outline" className="min-h-11">
            <Link href={action.href}>Ver</Link>
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="default"
              className="min-h-11"
              disabled={action.pending}
              onClick={action.onContinuar}
            >
              {action.pending ? "Continuando..." : "Continuar de onde parei"}
            </Button>
            {action.errorMessage && (
              <p role="alert" className="text-sm text-error">
                {action.errorMessage}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
