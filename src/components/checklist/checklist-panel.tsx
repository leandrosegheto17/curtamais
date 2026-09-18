// V2-L9-T10 — Painel do checklist (UX-SPEC.md §9.2-§9.6). Apresentacional:
// itens, estado e handlers por props; sem Server Actions/Prisma.
import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { ChecklistItem } from "./checklist-item";
import {
  CHECKLIST_AVISO_CLIMA,
  CHECKLIST_AVISO_FORA_CATALOGO,
  CHECKLIST_AVISO_SEM_DATAS,
  CHECKLIST_TITULO,
  checklistProgresso,
} from "./checklist-copy";
import {
  CATEGORIAS_CHECKLIST,
  ROTULO_CATEGORIA,
  type ItemChecklist,
} from "@/lib/checklist/tipos";
import { cn } from "@/lib/utils";

export interface ChecklistContexto {
  destino: string;
  /** Ex.: "julho" ou "julho e agosto". Omitir sem datas. */
  meses?: string;
  /** Omitir sem datas. */
  duracaoDias?: number;
  /** Ex.: "Viagem de 4 a 7 dias". */
  faixa?: string;
}

export interface ChecklistPanelProps {
  itens: ItemChecklist[];
  /** itemKeys marcados. */
  marcados: ReadonlySet<string>;
  /** itemKeys com gravação em curso. */
  pendentes?: ReadonlySet<string>;
  /** itemKeys cuja gravação falhou. */
  comErro?: ReadonlySet<string>;
  onToggle: (itemKey: string, marcado: boolean) => void;
  contexto?: ChecklistContexto;
  /** Viagem sem datas (RF-21). */
  semDatas?: boolean;
  /** Destino fora do catálogo ou exterior (RF-21). */
  foraDoCatalogo?: boolean;
  /** Prefixo de id (evita colisão de ids). */
  idBase?: string;
  className?: string;
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function ChecklistPanel({
  itens,
  marcados,
  pendentes,
  comErro,
  onToggle,
  contexto,
  semDatas = false,
  foraDoCatalogo = false,
  idBase = "checklist",
  className,
}: ChecklistPanelProps) {
  const total = itens.length;
  const feitos = itens.filter((i) => marcados.has(i.itemKey)).length;
  const tituloId = `${idBase}-titulo`;
  const partesContexto = contexto
    ? [
        contexto.destino,
        contexto.meses,
        contexto.duracaoDias !== undefined
          ? `${contexto.duracaoDias} dias`
          : undefined,
      ].filter(Boolean)
    : [];

  return (
    <section
      aria-labelledby={tituloId}
      className={cn("checklist-panel flex flex-col gap-4", className)}
    >
      <h2 id={tituloId} className="font-serif text-xl text-foreground">
        {CHECKLIST_TITULO}
      </h2>

      {partesContexto.length > 0 ? (
        <p className="text-sm text-foreground-muted">
          {partesContexto.join(" · ")}
          {contexto?.faixa ? ` · ${contexto.faixa}` : ""}
        </p>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          {checklistProgresso(feitos, total)}
        </p>
        <progress
          aria-hidden="true"
          tabIndex={-1}
          max={total}
          value={feitos}
          className="checklist-print-hide h-2 w-full accent-primary"
        />
      </div>

      <Aviso>{CHECKLIST_AVISO_CLIMA}</Aviso>
      {semDatas ? <Aviso>{CHECKLIST_AVISO_SEM_DATAS}</Aviso> : null}
      {foraDoCatalogo ? <Aviso>{CHECKLIST_AVISO_FORA_CATALOGO}</Aviso> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIAS_CHECKLIST.map((cat) => {
          const doGrupo = itens.filter((i) => i.categoria === cat);
          if (doGrupo.length === 0) return null;
          const hId = `${idBase}-${cat}`;
          return (
            <section
              key={cat}
              aria-labelledby={hId}
              data-checklist-group={cat}
              className="checklist-group break-inside-avoid rounded-lg border border-border bg-surface p-4"
            >
              <h3 id={hId} className="font-serif text-lg text-foreground">
                {ROTULO_CATEGORIA[cat]}
              </h3>
              <ul className="mt-2 flex flex-col">
                {doGrupo.map((item) => (
                  <ChecklistItem
                    key={item.itemKey}
                    itemKey={item.itemKey}
                    texto={item.texto}
                    checked={marcados.has(item.itemKey)}
                    pending={pendentes?.has(item.itemKey)}
                    error={comErro?.has(item.itemKey)}
                    onChange={onToggle}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
