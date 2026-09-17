// AUTO-GERADO por `scripts/exportar-roteiro-exemplo.ts` (V2-L3-T01, RF-14,
// ADR-011) — não editar os dados abaixo à mão; rode o script de novo.
//
// Conteúdo revisado e aprovado como definitivo pelo dono do produto em
// 2026-09-17 ("Roteiro aprovado" — nomes de hospedagem/passeios, faixas de
// preço e tom de voz aceitos como estão) — ver resolução do Bloqueio 010 em
// `.md/BLOCKERS.md`. `V2-L3-T01` está `Concluída` em `.md/TASK.md`.
//
// Tipos deliberadamente formatados como `Omit<RoteiroDayResult, "date">`
// (mais `dayLabel`) — mesmos tipos do roteiro real
// (`@/lib/stage-rules/roteiro.ts`, L10-T01), sem o campo `date` (ADR-011:
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

/** Uma linha do resumo de T-EX (UX-SPEC.md T-EX: "Resumo em 3 linhas... cada preço com PriceRangeBadge"). Campos `priceRangeMin`/`Max`/`free`/`unitLabel` mapeiam 1:1 para as props de `PriceRangeBadge` (`src/components/design-system/price-range-badge.tsx`). */
export interface RoteiroExemploResumoItem {
  label: string;
  value: string;
  priceRangeMin: number;
  priceRangeMax: number;
  free?: boolean;
  unitLabel?: string;
}

export interface RoteiroExemplo {
  /** Bate com `catalogo/destinos.ts` (`slug: "gramado"`, V2-L2-T01) — usado pelo CTA "Planejar minha viagem para Gramado" de T-EX. */
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

export const roteiroExemplo: RoteiroExemplo = {
  "slug": "gramado",
  "title": "Gramado em 3 dias",
  "intro": "Um roteiro que eu montei para mostrar como fica o resultado. O seu vai ser feito para as suas datas e o seu orçamento.",
  "destination": {
    "label": "Destino",
    "value": "Gramado, RS",
    "priceRangeMin": 1700,
    "priceRangeMax": 2400
  },
  "accommodation": {
    "label": "Hospedagem",
    "value": "Pousada de charme no centro",
    "priceRangeMin": 380,
    "priceRangeMax": 520,
    "unitLabel": "por noite"
  },
  "activities": [
    {
      "label": "Passeio",
      "value": "Mini Mundo",
      "priceRangeMin": 60,
      "priceRangeMax": 80
    },
    {
      "label": "Passeio",
      "value": "Pedalinho no Lago Negro",
      "priceRangeMin": 40,
      "priceRangeMax": 60
    },
    {
      "label": "Passeio",
      "value": "Mundo a Vapor",
      "priceRangeMin": 70,
      "priceRangeMax": 90
    },
    {
      "label": "Passeio",
      "value": "Feira de artesanato da Rua Coberta",
      "priceRangeMin": 0,
      "priceRangeMax": 0,
      "free": true
    }
  ],
  "days": [
    {
      "dayLabel": "Dia 1 — sábado",
      "morning": [
        {
          "activity": "Chegada em Gramado e check-in na pousada",
          "suggestedTime": "11:00",
          "timingJustification": "Horário de check-in da pousada — assim você já sai com o dia livre pela frente.",
          "sequenceOrder": 0
        }
      ],
      "afternoon": [
        {
          "activity": "Caminhada pela Rua Coberta",
          "suggestedTime": "14:30",
          "timingJustification": "Mais tarde a Rua Coberta enche de gente e de fila nas barracas — esse horário evita a espera.",
          "sequenceOrder": 1
        },
        {
          "activity": "Visita ao Mini Mundo",
          "suggestedTime": "16:00",
          "timingJustification": null,
          "sequenceOrder": 2
        }
      ],
      "evening": [
        {
          "activity": "Jantar de fondue no centro",
          "suggestedTime": "20:00",
          "timingJustification": "O friozinho do fim da tarde deixa o fondue ainda mais gostoso, e às 20h os restaurantes já abriram sem a lotação do início da noite.",
          "sequenceOrder": 3
        }
      ]
    },
    {
      "dayLabel": "Dia 2 — domingo",
      "morning": [
        {
          "activity": "Café da manhã na pousada",
          "suggestedTime": "09:00",
          "timingJustification": "Sem pressa nesse dia — o passeio do Lago Negro rende mais com calma.",
          "sequenceOrder": 4
        },
        {
          "activity": "Pedalinho no Lago Negro",
          "suggestedTime": "09:45",
          "timingJustification": "De manhã o lago está mais tranquilo, sem fila para o pedalinho.",
          "sequenceOrder": 5
        }
      ],
      "afternoon": [
        {
          "activity": "Mundo a Vapor",
          "suggestedTime": "14:00",
          "timingJustification": "Programa coberto, bom para descansar depois da caminhada da manhã.",
          "sequenceOrder": 6
        },
        {
          "activity": "Compras de chocolate artesanal na Rua Coberta",
          "suggestedTime": "16:30",
          "timingJustification": null,
          "sequenceOrder": 7
        }
      ],
      "evening": [
        {
          "activity": "Passeio noturno pelo centro iluminado",
          "suggestedTime": "19:30",
          "timingJustification": "O centro fica iluminado à noite o ano todo — um fechamento de dia tranquilo.",
          "sequenceOrder": 8
        },
        {
          "activity": "Jantar em uma cantina no centro",
          "suggestedTime": "20:30",
          "timingJustification": null,
          "sequenceOrder": 9
        }
      ]
    },
    {
      "dayLabel": "Dia 3 — segunda-feira",
      "morning": [
        {
          "activity": "Café da manhã e checkout da pousada",
          "suggestedTime": "09:30",
          "timingJustification": "Horário de checkout da pousada — dá tempo de aproveitar mais um pouco antes de ir embora.",
          "sequenceOrder": 10
        },
        {
          "activity": "Últimas compras na Rua Coberta",
          "suggestedTime": "10:30",
          "timingJustification": null,
          "sequenceOrder": 11
        }
      ],
      "afternoon": [
        {
          "activity": "Almoço leve antes da volta",
          "suggestedTime": "12:30",
          "timingJustification": "Horário pensado para você almoçar com calma antes de pegar a estrada de volta.",
          "sequenceOrder": 12
        }
      ],
      "evening": []
    }
  ],
  "generatedFrom": {
    "sessionId": "fixture-gramado-3-dias",
    "generatedAt": "2026-09-16T21:15:39.477Z",
    "reviewedByOwner": false,
    "note": "MODO FIXTURE: sem Postgres/OPENAI_API_KEY alcançável neste ambiente (ver cabeçalho de scripts/exportar-roteiro-exemplo.ts). Conteúdo escrito à mão pelo Executor, estruturalmente representativo de uma saída real do fluxo — PENDENTE DE REVISÃO HUMANA do dono do produto antes de ser tratado como final (preços, nomes, afirmações factuais, voz de consultor). V2-L3-T01 permanece 'Bloqueada' até essa revisão."
  }
};
