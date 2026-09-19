"use client";

// V2-L9-T11 — Cliente do painel: liga `ChecklistPanel` a `marcarItemChecklist`
// com atualização otimista. Falha (ou `conta_necessaria`/`item_invalido`)
// reverte o item ao último estado confirmado e mostra o alerta inline; o foco
// nunca se move (o checkbox nativo segue montado). Cliques rápidos no mesmo
// item: só a última resposta vale (contador por item).
import { useCallback, useRef, useState } from "react";

import {
  ChecklistPanel,
  type ChecklistPanelProps,
} from "./checklist-panel";
import { marcarItemChecklist } from "@/lib/actions/checklist";
import type { ItemChecklistView } from "@/lib/actions/checklist";

export interface ChecklistPanelConnectedProps
  extends Pick<
    ChecklistPanelProps,
    "contexto" | "semDatas" | "foraDoCatalogo" | "idBase" | "className"
  > {
  sessionId: string;
  itens: ItemChecklistView[];
}

function comChave(set: ReadonlySet<string>, key: string, incluir: boolean) {
  const next = new Set(set);
  if (incluir) next.add(key);
  else next.delete(key);
  return next;
}

export function ChecklistPanelConnected({
  sessionId,
  itens,
  ...panel
}: ChecklistPanelConnectedProps) {
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(
    () => new Set(itens.filter((i) => i.marcado).map((i) => i.itemKey)),
  );
  const [pendentes, setPendentes] = useState<ReadonlySet<string>>(new Set());
  const [comErro, setComErro] = useState<ReadonlySet<string>>(new Set());

  const confirmados = useRef(
    new Map(itens.map((i) => [i.itemKey, i.marcado])),
  );
  const sequencia = useRef(new Map<string, number>());

  const onToggle = useCallback(
    async (itemKey: string, marcado: boolean) => {
      const seq = (sequencia.current.get(itemKey) ?? 0) + 1;
      sequencia.current.set(itemKey, seq);

      setMarcados((s) => comChave(s, itemKey, marcado));
      setPendentes((s) => comChave(s, itemKey, true));
      setComErro((s) => comChave(s, itemKey, false));

      let ok = false;
      try {
        const r = await marcarItemChecklist(sessionId, itemKey, marcado);
        ok = r.status === "ok";
      } catch {
        ok = false;
      }

      // Uma marcação mais nova do mesmo item assume o desfecho.
      if (sequencia.current.get(itemKey) !== seq) return;

      setPendentes((s) => comChave(s, itemKey, false));
      if (ok) {
        confirmados.current.set(itemKey, marcado);
      } else {
        const anterior = confirmados.current.get(itemKey) ?? false;
        setMarcados((s) => comChave(s, itemKey, anterior));
        setComErro((s) => comChave(s, itemKey, true));
      }
    },
    [sessionId],
  );

  return (
    <ChecklistPanel
      {...panel}
      itens={itens}
      marcados={marcados}
      pendentes={pendentes}
      comErro={comErro}
      onToggle={onToggle}
    />
  );
}
