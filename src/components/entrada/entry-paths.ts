// L6-T01 — dados dos 3 caminhos de entrada de T00 (UX-SPEC.md Seção 2).
//
// Extraído de `src/app/page.tsx` para um módulo próprio porque um arquivo
// `page.tsx` do App Router só pode ter exports reconhecidos pelo Next.js
// (`default`, `metadata`, etc.) — qualquer export extra (`ENTRY_PATHS`,
// usado pelo teste) quebra a checagem de tipos gerada pelo `next build`
// (`checkFields<Diff<...>>`). Mantido fora de `src/app` por esse motivo, não
// por reuso entre telas.
import type { LucideIcon } from "lucide-react";
import { CalendarDays, PartyPopper, Sparkles } from "lucide-react";

export interface EntryPath {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

// Ordem e textos exatos de UX-SPEC.md Seção 2 ("T00 — Seleção de caminho de
// entrada"): ícone + título curto (serifado) + frase de "quando usar" (sans).
// Rotas conferidas por último contra `src/app/entrada/*/page.tsx`, as páginas
// reais publicadas pelas tarefas paralelas deste lote (L6-T02/T04/T06) — não
// inventadas por esta tarefa. As 3 convergiram para o mesmo namespace
// `/entrada/...`. Se alguma dessas tarefas ainda renomear sua rota depois
// desta verificação, este arquivo precisa ser atualizado de novo (ver nota
// de implementação L6-T01 no TASK.md).
export const ENTRY_PATHS: EntryPath[] = [
  {
    href: "/entrada/data-livre",
    icon: CalendarDays,
    title: "Data livre",
    description: "Já sei quando posso viajar",
  },
  {
    href: "/entrada/feriados",
    icon: PartyPopper,
    title: "Feriados prolongados",
    description: "Quero aproveitar um feriado",
  },
  {
    href: "/entrada/quiz",
    icon: Sparkles,
    title: "Quiz guiado",
    description: "Não sei nem por onde começar",
  },
];

// Classe de moldura compartilhada pelos 3 blocos — idêntica nos três, sem
// nenhuma variação de destaque/prioridade entre eles (UX-SPEC.md Seção 2).
export const ENTRY_PATH_CLASSNAME =
  "flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
