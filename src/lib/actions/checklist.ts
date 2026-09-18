"use server";

// V2-L9-T08 — leitura do checklist de bagagem/documentos (ADR-013, RF-19/20).
// Sem Gateway de IA e sem escrita: gera a lista pela regra pura e cruza com as
// marcas persistidas. Guard de dono com `exigeConta: true`; divergência de
// posse vira `SessionNotFoundError` (404 lógico).
import { ITENS_UNIVERSAIS } from "@/lib/checklist/conteudo/universal";
import { ITENS_PERFIS_LITORANEOS } from "@/lib/checklist/conteudo/perfis-litoraneos";
import { ITENS_PERFIS_INTERIOR } from "@/lib/checklist/conteudo/perfis-interior";
import { MAPA_DESTINOS_CHECKLIST } from "@/lib/checklist/conteudo/destinos";
import { validarItemKey } from "@/lib/checklist/calendario";
import { gerarChecklist } from "@/lib/checklist/regra";
import type {
  CategoriaChecklist,
  ConteudoChecklist,
} from "@/lib/checklist/tipos";
import { prisma } from "@/lib/prisma";
import {
  assertSessionAccess,
  ContaNecessariaError,
  SessionNotFoundError,
} from "@/lib/session-flow";

export type ItemChecklistView = {
  itemKey: string;
  categoria: CategoriaChecklist;
  texto: string;
  marcado: boolean;
};

export type ObterChecklistResult =
  | { status: "ok"; itens: ItemChecklistView[]; avisos: string[] }
  | { status: "indisponivel" }
  | { status: "conta_necessaria"; sessionId: string };

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Conteúdo curado injetado na regra pura (a regra não importa `conteudo/*`). */
export async function conteudoDoChecklist(): Promise<ConteudoChecklist> {
  return {
    universais: ITENS_UNIVERSAIS,
    itensPorPerfil: [...ITENS_PERFIS_LITORANEOS, ...ITENS_PERFIS_INTERIOR],
    perfilPorSlug: MAPA_DESTINOS_CHECKLIST,
  };
}

export async function obterChecklist(
  sessionId: string,
): Promise<ObterChecklistResult> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      anonSessionId: true,
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      destinationApproval: { select: { name: true } },
    },
  });
  if (!session) throw new SessionNotFoundError(sessionId);

  try {
    await assertSessionAccess(sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return { status: "conta_necessaria", sessionId };
    }
    throw error;
  }

  if (session.flowState !== "concluida") return { status: "indisponivel" };

  const gerado = gerarChecklist(
    {
      destino: session.destinationApproval?.name ?? null,
      dataInicio: isoDate(session.dateRangeStart),
      dataFim: isoDate(session.dateRangeEnd),
    },
    await conteudoDoChecklist(),
  );

  const marcas = await prisma.tripChecklistMark.findMany({
    where: { sessionId },
    select: { itemKey: true, checked: true },
  });
  const porChave = new Map(marcas.map((m) => [m.itemKey, m.checked]));

  // Chaves obsoletas (sem item na lista atual) são ignoradas por construção.
  return {
    status: "ok",
    itens: gerado.itens.map((i) => ({
      itemKey: i.itemKey,
      categoria: i.categoria,
      texto: i.texto,
      marcado: porChave.get(i.itemKey) ?? false,
    })),
    avisos: gerado.avisos,
  };
}

// V2-L9-T09 — marcação de item (RF-20): guard de dono, só `concluida`,
// allowlist de `itemKey` contra a lista gerada e `upsert` idempotente em
// `tripChecklistMark` (nunca via `tripSession.update`: preserva `updatedAt`).
export type MarcarItemChecklistResult =
  | { status: "ok"; itemKey: string; marcado: boolean }
  | { status: "item_invalido" }
  | { status: "indisponivel" }
  | { status: "conta_necessaria"; sessionId: string };

export async function marcarItemChecklist(
  sessionId: string,
  itemKey: string,
  marcado: boolean,
): Promise<MarcarItemChecklistResult> {
  const session = await prisma.tripSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      anonSessionId: true,
      flowState: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      destinationApproval: { select: { name: true } },
    },
  });
  if (!session) throw new SessionNotFoundError(sessionId);

  try {
    await assertSessionAccess(sessionId, session, { exigeConta: true });
  } catch (error) {
    if (error instanceof ContaNecessariaError) {
      return { status: "conta_necessaria", sessionId };
    }
    throw error;
  }

  if (session.flowState !== "concluida") return { status: "indisponivel" };

  if (typeof marcado !== "boolean" || !validarItemKey(itemKey)) {
    return { status: "item_invalido" };
  }

  const lista = gerarChecklist(
    {
      destino: session.destinationApproval?.name ?? null,
      dataInicio: isoDate(session.dateRangeStart),
      dataFim: isoDate(session.dateRangeEnd),
    },
    await conteudoDoChecklist(),
  );
  if (!lista.itens.some((i) => i.itemKey === itemKey)) {
    return { status: "item_invalido" };
  }

  await prisma.tripChecklistMark.upsert({
    where: { sessionId_itemKey: { sessionId, itemKey } },
    create: { sessionId, itemKey, checked: marcado },
    update: { checked: marcado },
  });

  return { status: "ok", itemKey, marcado };
}
