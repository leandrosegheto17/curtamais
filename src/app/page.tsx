// L6-T01 — T00 UI: Seleção de caminho de entrada (UX-SPEC.md Seção 2 "T00" /
// Seção 6, RF-01/RF-02/RF-03).
//
// Três blocos de igual destaque, um por caminho de entrada (Data livre /
// Feriados prolongados / Quiz guiado), "separados por borda fina (não cartão
// com sombra — Concierge Noturno)... Nenhum caminho é pré-selecionado ou
// visualmente priorizado sobre os outros — os três são igualmente Must-have"
// (UX-SPEC.md Seção 2). Navegação de rota normal do Next.js (`next/link`),
// não uma transição de state machine (Diretriz de Implementação 3 do
// TASK.md) — por isso nenhuma Server Action nesta tarefa.
//
// Dados dos 3 caminhos (rotas/textos/ícones) vivem em
// `src/components/entrada/entry-paths.ts`, não neste arquivo — um
// `page.tsx` do App Router só pode expor os exports reconhecidos pelo
// Next.js, ver comentário naquele módulo.
import Link from "next/link";

import { ENTRY_PATH_CLASSNAME, ENTRY_PATHS } from "@/components/entrada/entry-paths";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex max-w-2xl flex-col items-center gap-2 text-center">
        <h1 className="font-serif text-3xl text-foreground">
          Para onde vamos?
        </h1>
        <p className="text-foreground-muted">
          Escolha como você quer começar a planejar sua próxima viagem.
        </p>
      </div>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
        {ENTRY_PATHS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className={ENTRY_PATH_CLASSNAME}>
            <Icon className="h-8 w-8 text-accent" aria-hidden="true" />
            <span className="font-serif text-lg text-foreground">
              {title}
            </span>
            <span className="text-sm text-foreground-muted">
              {description}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
