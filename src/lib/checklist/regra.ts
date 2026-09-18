// Regra do checklist (ADR-013 decisão 4). Pura e determinística: o conteúdo
// entra por parâmetro; nada de Prisma, IA, stage-rules ou next/*.
import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";
import { normalizarNomeDestino } from "@/lib/catalogo/resolver-imagem";
import {
  duracaoEmDias,
  estacaoDoMes,
  faixaDeDuracao,
  mesesDoPeriodo,
} from "./calendario";
import {
  CATEGORIAS_CHECKLIST,
  type ChecklistGerado,
  type ConteudoChecklist,
  type EntradaChecklist,
  type ItemChecklist,
  type PerfilDoDestino,
} from "./tipos";

export const AVISO_SEM_DATAS =
  "Sem as datas não consigo ajustar a lista à época.";
export const AVISO_CONFERIR_ENTRADA =
  "Confira as regras de entrada do destino em fonte oficial.";

/** Correspondência exata (RF-15.4): nome/variantes normalizados, nunca aproximada. */
const SLUG_POR_NOME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const d of CATALOGO_DESTINOS) {
    m.set(normalizarNomeDestino(d.nome), d.slug);
    for (const v of d.variantes) m.set(normalizarNomeDestino(v), d.slug);
  }
  return m;
})();

function slugDoDestino(destino: string | null): string | null {
  if (!destino || destino.trim() === "") return null;
  return SLUG_POR_NOME.get(normalizarNomeDestino(destino)) ?? null;
}

type Periodo = { meses: number[]; duracao: ReturnType<typeof faixaDeDuracao> };

function periodoDe(e: EntradaChecklist): Periodo | null {
  if (!e.dataInicio || !e.dataFim) return null;
  try {
    const meses = mesesDoPeriodo(e.dataInicio, e.dataFim);
    if (meses.length === 0) return null;
    return {
      meses,
      duracao: faixaDeDuracao(duracaoEmDias(e.dataInicio, e.dataFim)),
    };
  } catch {
    return null;
  }
}

function aplica(
  item: ItemChecklist,
  perfil: PerfilDoDestino | null,
  periodo: Periodo | null,
): boolean {
  const q = item.quando;
  if (!q) return true;
  const dependeDestino =
    q.perfis !== undefined || q.tipos !== undefined || q.chuvoso !== undefined;
  if (dependeDestino && !perfil) return false;
  const dependeEpoca =
    q.estacoes !== undefined || q.chuvoso !== undefined || q.duracoes !== undefined;
  if (dependeEpoca && !periodo) return false;
  // Sem destino do catálogo: sem afirmação de clima (estação também é clima).
  if (q.estacoes !== undefined && !perfil) return false;

  if (q.perfis && perfil && !q.perfis.includes(perfil.perfil)) return false;
  if (q.tipos && perfil && !q.tipos.includes(perfil.tipo)) return false;
  if (q.estacoes && periodo) {
    const est = periodo.meses.map(estacaoDoMes);
    if (!q.estacoes.some((e) => est.includes(e))) return false;
  }
  if (q.chuvoso === true && perfil && periodo) {
    if (!periodo.meses.some((m) => perfil.mesesChuvosos.includes(m))) return false;
  }
  if (q.duracoes && periodo && !q.duracoes.includes(periodo.duracao)) return false;
  return true;
}

export function gerarChecklist(
  entrada: EntradaChecklist,
  conteudo: ConteudoChecklist,
): ChecklistGerado {
  const slug = slugDoDestino(entrada.destino);
  const perfil = slug ? (conteudo.perfilPorSlug[slug] ?? null) : null;
  const periodo = periodoDe(entrada);

  const avisos: string[] = [];
  if (!periodo) avisos.push(AVISO_SEM_DATAS);
  if (!perfil) avisos.push(AVISO_CONFERIR_ENTRADA);

  const vistos = new Set<string>();
  const candidatos: ItemChecklist[] = [];
  for (const item of [...conteudo.universais, ...conteudo.itensPorPerfil]) {
    if (vistos.has(item.itemKey)) continue;
    if (!aplica(item, perfil, periodo)) continue;
    vistos.add(item.itemKey);
    candidatos.push(item);
  }

  // Ordenação estável: categoria (ordem fixa), depois ordem de declaração.
  const itens = CATEGORIAS_CHECKLIST.flatMap((c) =>
    candidatos.filter((i) => i.categoria === c),
  );
  return { itens, avisos };
}
