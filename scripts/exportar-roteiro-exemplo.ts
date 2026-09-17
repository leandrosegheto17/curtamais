// V2-L3-T01 — Script que gera `src/content/roteiro-exemplo.ts` (RF-14,
// ADR-011).
//
// Uso pretendido em ambiente de desenvolvimento com Postgres real e
// `OPENAI_API_KEY` configurados (ADR-011, item 4): rodar o fluxo real da
// jornada (T01→T05→T06→T07→T08) para Gramado, fim de semana de 3 dias,
// orçamento médio, até a `TripSession` chegar ao estado terminal
// `concluida`; então rodar
//   npx tsx scripts/exportar-roteiro-exemplo.ts --session-id <uuid>
// para ler essa sessão via Prisma (`DestinationApproval`/
// `AccommodationApproval`/`ActivityApproval`/`ItineraryItem`, já persistidos
// pelo fluxo real — mesmos modelos de `prisma/schema.prisma`) e gerar
// `src/content/roteiro-exemplo.ts`.
//
// ATENÇÃO — modo fixture (usado nesta execução, TASK.md V2-L3-T01): não há
// Postgres real alcançável neste ambiente de execução do Executor
// (`npx prisma db pull` contra a `DATABASE_URL` local falha com `P1001 —
// Can't reach database server at localhost:55432`, confirmado antes de
// escrever este script) nem `OPENAI_API_KEY` disponível para rodar o fluxo
// real ponta a ponta. Sem `--session-id` (ou sem uma `TripSession`
// alcançável para o id informado), o script cai automaticamente para
// `buildFixtureRoteiroExemplo()` abaixo — um roteiro de 3 dias para Gramado
// escrito manualmente por este Executor para ser estruturalmente
// representativo de uma saída real do fluxo (mesmos tipos, mesma forma,
// preços plausíveis, voz de consultor), mas que **não veio de uma execução
// real do Gateway de IA**. Isso é documentado explicitamente no arquivo
// gerado (`generatedFrom.note`) e na nota de implementação de `V2-L3-T01`
// em `.md/TASK.md` — a tarefa fica `Bloqueada`, aguardando revisão humana do
// dono do produto antes do commit definitivo do conteúdo (preços, nomes,
// afirmações factuais), nunca `Concluída` só por este script ter rodado
// (ver `.md/TASK.md` Seção 5, linha sobre V2-L3-T01, e `.md/BLOCKERS.md`).
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Import relativo (não `@/lib/prisma`) deliberado: este script roda fora do
// bundler do Next.js (via `tsx`, sem resolução de `paths` do `tsconfig.json`
// garantida em tempo de execução), então usa caminho relativo para o único
// import de valor (runtime) que precisa — o Prisma Client. O arquivo GERADO
// (`src/content/roteiro-exemplo.ts`) já usa o alias `@/*` normalmente,
// porque esse arquivo É consumido pelo bundler do Next.js.
import { prisma } from "../src/lib/prisma";

const WEEKDAY_FULL = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/** Mesmo shape de `RoteiroItemResult` (`src/lib/stage-rules/roteiro.ts`, L10-T01) — duplicado aqui deliberadamente (script roda fora do grafo de módulos do app, ver comentário acima sobre import relativo) em vez de importado do arquivo gerado, para não criar uma dependência circular entre o script e o arquivo que ele mesmo escreve. */
type ScriptRoteiroItemResult = {
  activity: string;
  suggestedTime: string;
  timingJustification: string | null;
  sequenceOrder: number;
};

/** Mesmo shape de `RoteiroDayResult` MENOS `date` (ADR-011: o exemplo nunca exibe data de calendário) mais `dayLabel` ("Dia N — dia da semana", UX-SPEC.md T-EX). */
type ScriptRoteiroExemploDay = {
  dayLabel: string;
  morning: ScriptRoteiroItemResult[];
  afternoon: ScriptRoteiroItemResult[];
  evening: ScriptRoteiroItemResult[];
};

type ScriptRoteiroExemploResumoItem = {
  label: string;
  value: string;
  priceRangeMin: number;
  priceRangeMax: number;
  free?: boolean;
  unitLabel?: string;
};

type ScriptRoteiroExemplo = {
  slug: "gramado";
  title: string;
  intro: string;
  destination: ScriptRoteiroExemploResumoItem;
  accommodation: ScriptRoteiroExemploResumoItem;
  activities: ScriptRoteiroExemploResumoItem[];
  days: ScriptRoteiroExemploDay[];
  generatedFrom: {
    sessionId: string;
    generatedAt: string;
    reviewedByOwner: boolean;
    note: string;
  };
};

/**
 * Lê uma `TripSession` concluída real via Prisma e monta o roteiro de
 * exemplo a partir dela (`DestinationApproval`/`AccommodationApproval`/
 * `ActivityApproval`/`ItineraryItem`, todos já persistidos pelo fluxo real,
 * `prisma/schema.prisma`). `null` se a sessão não existir/não estiver
 * acessível (o chamador decide o fallback).
 */
async function fetchRoteiroExemploFromSession(
  sessionId: string,
): Promise<ScriptRoteiroExemplo | null> {
  const [destination, accommodation, activities, itineraryItems] =
    await Promise.all([
      prisma.destinationApproval.findUnique({ where: { sessionId } }),
      prisma.accommodationApproval.findUnique({ where: { sessionId } }),
      prisma.activityApproval.findMany({
        where: { sessionId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.itineraryItem.findMany({
        where: { sessionId },
        orderBy: { sequenceOrder: "asc" },
      }),
    ]);

  if (!destination || !accommodation || itineraryItems.length === 0) {
    return null;
  }

  // Agrupa por `dayDate` distinto, na ordem em que aparecem (já vem ordenado
  // por `sequenceOrder`, que por sua vez já é cronológico — mesma garantia
  // de `normalizeRoteiroDays`, `src/lib/stage-rules/roteiro.ts`).
  const dayDatesInOrder: string[] = [];
  const byDate = new Map<string, typeof itineraryItems>();
  for (const item of itineraryItems) {
    const key = item.dayDate.toISOString().slice(0, 10);
    if (!byDate.has(key)) {
      byDate.set(key, []);
      dayDatesInOrder.push(key);
    }
    byDate.get(key)!.push(item);
  }

  const PERIOD_TO_FIELD = {
    manha: "morning",
    tarde: "afternoon",
    noite: "evening",
  } as const;

  const days: ScriptRoteiroExemploDay[] = dayDatesInOrder.map(
    (dateKey, index) => {
      const items = byDate.get(dateKey) ?? [];
      const weekday = WEEKDAY_FULL[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
      const day: ScriptRoteiroExemploDay = {
        dayLabel: `Dia ${index + 1} — ${weekday}`,
        morning: [],
        afternoon: [],
        evening: [],
      };
      for (const item of items) {
        const field = PERIOD_TO_FIELD[item.period];
        day[field].push({
          activity: item.activityId ?? "Atividade",
          suggestedTime: item.suggestedTime,
          timingJustification: item.timingJustification,
          sequenceOrder: item.sequenceOrder,
        });
      }
      return day;
    },
  );

  return {
    slug: "gramado",
    title: `${destination.name} em ${days.length} dias`,
    intro:
      "Um roteiro que eu montei para mostrar como fica o resultado. O seu vai ser feito para as suas datas e o seu orçamento.",
    destination: {
      label: "Destino",
      value: destination.name,
      priceRangeMin: Number(destination.priceRangeMin),
      priceRangeMax: Number(destination.priceRangeMax),
    },
    accommodation: {
      label: "Hospedagem",
      value: accommodation.name,
      priceRangeMin: Number(accommodation.pricePerNightMin),
      priceRangeMax: Number(accommodation.pricePerNightMax),
      unitLabel: "por noite",
    },
    activities: activities.map((activity) => ({
      label: "Passeio",
      value: activity.name,
      priceRangeMin: Number(activity.priceMin),
      priceRangeMax: Number(activity.priceMax),
      free: activity.isFree,
    })),
    days,
    generatedFrom: {
      sessionId,
      generatedAt: new Date().toISOString(),
      reviewedByOwner: false,
      note:
        "Gerado a partir de uma TripSession real concluída via scripts/exportar-roteiro-exemplo.ts.",
    },
  };
}

/**
 * Roteiro de exemplo escrito à mão por este Executor, estruturalmente
 * representativo de uma saída real do fluxo (RF-04→RF-08) para Gramado, fim
 * de semana de 3 dias, orçamento médio — usado só quando nenhuma
 * `TripSession` real está acessível (ver comentário de cabeçalho deste
 * arquivo: sem Postgres/`OPENAI_API_KEY` neste ambiente). Preços em faixa
 * plausível para o destino; nomes de hospedagem/passeios são exemplos
 * genéricos, não afirmações sobre um estabelecimento real específico —
 * **pendente de revisão humana do dono do produto antes do commit
 * definitivo** (ADR-011, TASK.md V2-L3-T01).
 */
function buildFixtureRoteiroExemplo(): ScriptRoteiroExemplo {
  let counter = 0;
  const next = () => counter++;

  const item = (
    activity: string,
    suggestedTime: string,
    timingJustification: string | null = null,
  ): ScriptRoteiroItemResult => ({
    activity,
    suggestedTime,
    timingJustification,
    sequenceOrder: next(),
  });

  const days: ScriptRoteiroExemploDay[] = [
    {
      dayLabel: "Dia 1 — sábado",
      morning: [
        item(
          "Chegada em Gramado e check-in na pousada",
          "11:00",
          "Horário de check-in da pousada — assim você já sai com o dia livre pela frente.",
        ),
      ],
      afternoon: [
        item(
          "Caminhada pela Rua Coberta",
          "14:30",
          "Mais tarde a Rua Coberta enche de gente e de fila nas barracas — esse horário evita a espera.",
        ),
        item("Visita ao Mini Mundo", "16:00"),
      ],
      evening: [
        item(
          "Jantar de fondue no centro",
          "20:00",
          "O friozinho do fim da tarde deixa o fondue ainda mais gostoso, e às 20h os restaurantes já abriram sem a lotação do início da noite.",
        ),
      ],
    },
    {
      dayLabel: "Dia 2 — domingo",
      morning: [
        item(
          "Café da manhã na pousada",
          "09:00",
          "Sem pressa nesse dia — o passeio do Lago Negro rende mais com calma.",
        ),
        item(
          "Pedalinho no Lago Negro",
          "09:45",
          "De manhã o lago está mais tranquilo, sem fila para o pedalinho.",
        ),
      ],
      afternoon: [
        item(
          "Mundo a Vapor",
          "14:00",
          "Programa coberto, bom para descansar depois da caminhada da manhã.",
        ),
        item("Compras de chocolate artesanal na Rua Coberta", "16:30"),
      ],
      evening: [
        item(
          "Passeio noturno pelo centro iluminado",
          "19:30",
          "O centro fica iluminado à noite o ano todo — um fechamento de dia tranquilo.",
        ),
        item("Jantar em uma cantina no centro", "20:30"),
      ],
    },
    {
      dayLabel: "Dia 3 — segunda-feira",
      morning: [
        item(
          "Café da manhã e checkout da pousada",
          "09:30",
          "Horário de checkout da pousada — dá tempo de aproveitar mais um pouco antes de ir embora.",
        ),
        item("Últimas compras na Rua Coberta", "10:30"),
      ],
      afternoon: [
        item(
          "Almoço leve antes da volta",
          "12:30",
          "Horário pensado para você almoçar com calma antes de pegar a estrada de volta.",
        ),
      ],
      evening: [],
    },
  ];

  return {
    slug: "gramado",
    title: "Gramado em 3 dias",
    intro:
      "Um roteiro que eu montei para mostrar como fica o resultado. O seu vai ser feito para as suas datas e o seu orçamento.",
    destination: {
      label: "Destino",
      value: "Gramado, RS",
      priceRangeMin: 1700,
      priceRangeMax: 2400,
    },
    accommodation: {
      label: "Hospedagem",
      value: "Pousada de charme no centro",
      priceRangeMin: 380,
      priceRangeMax: 520,
      unitLabel: "por noite",
    },
    activities: [
      {
        label: "Passeio",
        value: "Mini Mundo",
        priceRangeMin: 60,
        priceRangeMax: 80,
      },
      {
        label: "Passeio",
        value: "Pedalinho no Lago Negro",
        priceRangeMin: 40,
        priceRangeMax: 60,
      },
      {
        label: "Passeio",
        value: "Mundo a Vapor",
        priceRangeMin: 70,
        priceRangeMax: 90,
      },
      {
        label: "Passeio",
        value: "Feira de artesanato da Rua Coberta",
        priceRangeMin: 0,
        priceRangeMax: 0,
        free: true,
      },
    ],
    days,
    generatedFrom: {
      sessionId: "fixture-gramado-3-dias",
      generatedAt: new Date().toISOString(),
      reviewedByOwner: false,
      note:
        "MODO FIXTURE: sem Postgres/OPENAI_API_KEY alcançável neste ambiente " +
        "(ver cabeçalho de scripts/exportar-roteiro-exemplo.ts). Conteúdo " +
        "escrito à mão pelo Executor, estruturalmente representativo de uma " +
        "saída real do fluxo — PENDENTE DE REVISÃO HUMANA do dono do produto " +
        "antes de ser tratado como final (preços, nomes, afirmações factuais, " +
        "voz de consultor). V2-L3-T01 permanece 'Bloqueada' até essa revisão.",
    },
  };
}

function serializeRoteiroExemploFile(data: ScriptRoteiroExemplo): string {
  return `// AUTO-GERADO por \`scripts/exportar-roteiro-exemplo.ts\` (V2-L3-T01, RF-14,
// ADR-011) — não editar os dados abaixo à mão; rode o script de novo.
//
// ATENÇÃO (ver nota completa em \`generatedFrom.note\` abaixo e em
// \`.md/TASK.md\`, V2-L3-T01): este conteúdo está PENDENTE DE REVISÃO HUMANA
// do dono do produto antes de ser tratado como definitivo (sem preço fora de
// faixa, sem afirmação factual duvidosa, voz de consultor) — a tarefa que o
// gerou fica \`Bloqueada\`, não \`Concluída\`, até essa revisão acontecer e um
// novo commit confirmar o conteúdo revisado (ver \`.md/BLOCKERS.md\`).
//
// Tipos deliberadamente formatados como \`Omit<RoteiroDayResult, "date">\`
// (mais \`dayLabel\`) — mesmos tipos do roteiro real
// (\`@/lib/stage-rules/roteiro.ts\`, L10-T01), sem o campo \`date\` (ADR-011:
// o exemplo nunca exibe uma data de calendário, só "Dia N — dia da semana").
import type {
  RoteiroDayResult,
  RoteiroItemResult,
} from "@/lib/stage-rules/roteiro";

export type { RoteiroItemResult };

export type RoteiroExemploDay = Omit<RoteiroDayResult, "date"> & {
  /** "Dia 1 — sábado" (UX-SPEC.md T-EX) — nunca uma data de calendário (ADR-011). */
  dayLabel: string;
};

/** Uma linha do resumo de T-EX (UX-SPEC.md T-EX: "Resumo em 3 linhas... cada preço com PriceRangeBadge"). Campos \`priceRangeMin\`/\`Max\`/\`free\`/\`unitLabel\` mapeiam 1:1 para as props de \`PriceRangeBadge\` (\`src/components/design-system/price-range-badge.tsx\`). */
export interface RoteiroExemploResumoItem {
  label: string;
  value: string;
  priceRangeMin: number;
  priceRangeMax: number;
  free?: boolean;
  unitLabel?: string;
}

export interface RoteiroExemplo {
  /** Bate com \`catalogo/destinos.ts\` (\`slug: "gramado"\`, V2-L2-T01) — usado pelo CTA "Planejar minha viagem para Gramado" de T-EX. */
  slug: "gramado";
  title: string;
  intro: string;
  destination: RoteiroExemploResumoItem;
  accommodation: RoteiroExemploResumoItem;
  activities: RoteiroExemploResumoItem[];
  days: RoteiroExemploDay[];
  /** Proveniência — nunca exibido na UI, só para auditoria/rastreabilidade (ADR-011). */
  generatedFrom: {
    sessionId: string;
    generatedAt: string;
    reviewedByOwner: boolean;
    note: string;
  };
}

export const roteiroExemplo: RoteiroExemplo = ${JSON.stringify(data, null, 2)};
`;
}

async function main() {
  const args = process.argv.slice(2);
  const sessionIdFlagIndex = args.indexOf("--session-id");
  const sessionId =
    sessionIdFlagIndex >= 0 ? args[sessionIdFlagIndex + 1] : undefined;

  let data: ScriptRoteiroExemplo | null = null;

  if (sessionId) {
    try {
      data = await fetchRoteiroExemploFromSession(sessionId);
      if (!data) {
        console.warn(
          `[exportar-roteiro-exemplo] Sessão "${sessionId}" não encontrada ou incompleta — caindo para o fixture de Gramado.`,
        );
      }
    } catch (error) {
      console.warn(
        `[exportar-roteiro-exemplo] Não foi possível ler a sessão via Prisma (banco indisponível?) — caindo para o fixture de Gramado. Detalhe: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } else {
    console.warn(
      "[exportar-roteiro-exemplo] Nenhum --session-id informado — usando o fixture de Gramado (ver cabeçalho do script).",
    );
  }

  if (!data) {
    data = buildFixtureRoteiroExemplo();
  }

  const outputPath = resolve(__dirname, "../src/content/roteiro-exemplo.ts");
  const fileContents = serializeRoteiroExemploFile(data);
  writeFileSync(outputPath, fileContents, "utf8");

  console.log(
    `[exportar-roteiro-exemplo] Escrito em ${outputPath}${
      existsSync(outputPath) ? "" : " (novo arquivo)"
    }. Fonte: ${sessionId && data.generatedFrom.sessionId === sessionId ? `TripSession real (${sessionId})` : "fixture de Gramado (sem banco real disponível)"}.`,
  );
  console.warn(
    "[exportar-roteiro-exemplo] LEMBRETE: conteúdo pendente de revisão humana do dono do produto antes do commit definitivo (ADR-011). Não marcar V2-L3-T01 como Concluída sem essa revisão.",
  );
}

main().catch((error) => {
  console.error("[exportar-roteiro-exemplo] Falhou:", error);
  process.exitCode = 1;
});
