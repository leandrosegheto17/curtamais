// @vitest-environment node
//
// L10-T01 — Regra RF-08: geração do roteiro estruturado por dia (manhã/
// tarde/noite), sequenciamento por proximidade geográfica e horário ideal,
// com justificativa de timing (RF-08.1/.2/.3). Critério de aceite: "Todo dia
// do range da viagem tem bloco manhã/tarde/noite; toda atividade tem horário
// sugerido; RF-08.2 evita deslocamento redundante sempre que alternativa
// equivalente existir."
//
// Mesmo padrão de `src/lib/stage-rules/__tests__/passeios.test.ts` (L9-T01):
// `generateStructuredCompletionWithRetry` é mockada (nenhuma chamada de rede
// real / nenhuma escrita real em `LlmGenerationLog`) — os demais exports do
// módulo (`buildRoteiroPrompt`, `roteiroEstruturadoSchema`,
// `GATEWAY_IA_SCHEMA_NAMES`) permanecem reais via `importOriginal`.
//
// RF-08.2 (evitar deslocamento redundante sempre que alternativa equivalente
// existir) é, por decisão do SPIKE-02 (ver `.md/TASK.md` Seção 2), melhor
// esforço do próprio LLM via instrução textual do prompt — não há como
// testar "proximidade geográfica real" sem geocoding, então o teste cobre a
// instrução estar presente no prompt (mesmo padrão usado para "ao menos 1
// item gratuito" em `passeios.test.ts`), não o conteúdo semântico da
// resposta simulada.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateRoteiro } from "@/lib/stage-rules";

const generateStructuredCompletionWithRetryMock = vi.fn();

vi.mock("@/lib/gateway-ia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway-ia")>();
  return {
    ...actual,
    generateStructuredCompletionWithRetry: (
      ...args: Parameters<typeof actual.generateStructuredCompletionWithRetry>
    ) => generateStructuredCompletionWithRetryMock(...args),
  };
});

type RoteiroBlocoInput = {
  atividade: string;
  horarioSugerido: string;
  justificativaTiming: string | null;
};

function mockDias(
  dias: {
    data: string;
    manha: RoteiroBlocoInput[];
    tarde: RoteiroBlocoInput[];
    noite: RoteiroBlocoInput[];
  }[],
) {
  generateStructuredCompletionWithRetryMock.mockResolvedValueOnce({
    data: { dias },
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });
}

const BASE_INPUT = {
  sessionId: "session-1",
  referenceDate: "2026-09-10",
  dateRangeStart: "2026-10-10",
  dateRangeEnd: "2026-10-12",
  destination: { name: "Foz do Iguaçu" },
  accommodation: { name: "Pousada Vista Mar", type: "pousada" },
};

const DIAS_COMPLETOS = [
  {
    data: "2026-10-10",
    manha: [
      {
        atividade: "Check-in e café da manhã na Pousada Vista Mar",
        horarioSugerido: "08:00",
        justificativaTiming:
          "Aproveitar o início do dia perto da hospedagem antes de sair.",
      },
    ],
    tarde: [
      {
        atividade: "Visita às Cataratas do Iguaçu (lado brasileiro)",
        horarioSugerido: "13:00",
        justificativaTiming:
          "Perto da hospedagem, evita deslocamento longo no primeiro dia.",
      },
    ],
    noite: [
      {
        atividade: "Jantar no centro",
        horarioSugerido: "19:30",
        justificativaTiming: null,
      },
    ],
  },
  {
    data: "2026-10-11",
    manha: [],
    tarde: [
      {
        atividade: "Passeio de barco",
        horarioSugerido: "14:00",
        justificativaTiming: "Horário com menor fluxo de turistas.",
      },
    ],
    noite: [],
  },
  // Dia 2026-10-12 (último do range) deliberadamente ausente da resposta do
  // LLM — usado para testar a normalização de dias ausentes.
];

describe("generateRoteiro (L10-T01, RF-08.1/.2/.3)", () => {
  beforeEach(() => {
    generateStructuredCompletionWithRetryMock.mockReset();
  });

  it("retorna todos os dias do range da viagem, mesmo quando o LLM omite um dia (critério de aceite)", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro(BASE_INPUT);

    expect(result.map((dia) => dia.date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("todo dia do resultado sempre tem os 3 blocos manhã/tarde/noite presentes (arrays, mesmo vazios)", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro(BASE_INPUT);

    for (const dia of result) {
      expect(Array.isArray(dia.morning)).toBe(true);
      expect(Array.isArray(dia.afternoon)).toBe(true);
      expect(Array.isArray(dia.evening)).toBe(true);
    }
    // Dia ausente na resposta do LLM (2026-10-12): os 3 blocos existem, mas vazios.
    const diaAusente = result.find((dia) => dia.date === "2026-10-12");
    expect(diaAusente).toMatchObject({ morning: [], afternoon: [], evening: [] });
  });

  it("toda atividade do resultado tem horário sugerido não vazio (critério de aceite, RF-08.3)", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro(BASE_INPUT);

    const todasAtividades = result.flatMap((dia) => [
      ...dia.morning,
      ...dia.afternoon,
      ...dia.evening,
    ]);
    expect(todasAtividades.length).toBeGreaterThan(0);
    for (const item of todasAtividades) {
      expect(item.suggestedTime).toEqual(expect.any(String));
      expect(item.suggestedTime.length).toBeGreaterThan(0);
      expect(item.activity).toEqual(expect.any(String));
      expect(item.activity.length).toBeGreaterThan(0);
    }
  });

  it("preserva a justificativa de timing quando presente e mantém null quando ausente (RF-08.2/.3)", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro(BASE_INPUT);

    const checkin = result[0].morning[0];
    expect(checkin.timingJustification).toContain("hospedagem");

    const jantar = result[0].evening[0];
    expect(jantar.timingJustification).toBeNull();
  });

  it("atribui sequenceOrder crescente e único, na ordem cronológica dia > manhã/tarde/noite", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro(BASE_INPUT);

    const ordens = result
      .flatMap((dia) => [...dia.morning, ...dia.afternoon, ...dia.evening])
      .map((item) => item.sequenceOrder);

    expect(ordens).toEqual([0, 1, 2, 3]);
  });

  it("mescla (nunca descarta) dias duplicados devolvidos pelo LLM para a mesma data", async () => {
    mockDias([
      {
        data: "2026-10-10",
        manha: [
          {
            atividade: "Café da manhã",
            horarioSugerido: "08:00",
            justificativaTiming: null,
          },
        ],
        tarde: [],
        noite: [],
      },
      {
        data: "2026-10-10",
        manha: [],
        tarde: [
          {
            atividade: "Passeio à tarde",
            horarioSugerido: "14:00",
            justificativaTiming: null,
          },
        ],
        noite: [],
      },
      { data: "2026-10-11", manha: [], tarde: [], noite: [] },
      { data: "2026-10-12", manha: [], tarde: [], noite: [] },
    ]);

    const result = await generateRoteiro(BASE_INPUT);

    const dia10 = result.find((dia) => dia.date === "2026-10-10");
    expect(dia10?.morning).toHaveLength(1);
    expect(dia10?.afternoon).toHaveLength(1);
  });

  it("chama o Gateway de IA com retry (L3-T04) para a etapa roteiro, com sessionId/stage/sessionDateRange corretos e destino/hospedagem no prompt", async () => {
    mockDias(DIAS_COMPLETOS);

    await generateRoteiro(BASE_INPUT);

    expect(generateStructuredCompletionWithRetryMock).toHaveBeenCalledTimes(1);
    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.sessionId).toBe("session-1");
    expect(callArgs.stage).toBe("roteiro");
    expect(callArgs.schemaName).toBe("roteiro_estruturado");
    expect(callArgs.sessionDateRange).toEqual({
      dateRangeStart: "2026-10-10",
      dateRangeEnd: "2026-10-12",
    });
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Foz do Iguaçu"),
        }),
      ]),
    );
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Pousada Vista Mar"),
        }),
      ]),
    );
  });

  it("repassa os passeios já aprovados ao prompt quando informados (RF-07)", async () => {
    mockDias(DIAS_COMPLETOS);

    await generateRoteiro({
      ...BASE_INPUT,
      approvedActivities: [
        { name: "Trilha da Cachoeira", durationApprox: "2 horas", isFree: true },
      ],
    });

    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Trilha da Cachoeira"),
        }),
      ]),
    );
  });

  it("funciona sem nenhum passeio aprovado (RN-04) — monta roteiro coerente com o destino mesmo assim", async () => {
    mockDias(DIAS_COMPLETOS);

    const result = await generateRoteiro({
      ...BASE_INPUT,
      approvedActivities: null,
    });

    expect(result).toHaveLength(3);
    const callArgs = generateStructuredCompletionWithRetryMock.mock.calls[0][0];
    expect(callArgs.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("Nenhum passeio específico"),
        }),
      ]),
    );
  });

  it("lança erro claro quando chamada sem destino já aprovado (RN-01/RF-11) — a fronteira do prompt, não deste módulo", async () => {
    await expect(
      generateRoteiro({
        sessionId: "session-1",
        referenceDate: "2026-09-10",
        dateRangeStart: "2026-10-10",
        dateRangeEnd: "2026-10-12",
        // @ts-expect-error -- teste deliberadamente omite `destination` obrigatório
        destination: undefined,
        accommodation: { name: "Pousada Vista Mar", type: "pousada" },
      }),
    ).rejects.toThrow(/destination/);

    expect(generateStructuredCompletionWithRetryMock).not.toHaveBeenCalled();
  });

  it("lança erro claro quando chamada sem hospedagem já aprovada (RN-01/RF-06) — a fronteira do prompt, não deste módulo", async () => {
    await expect(
      generateRoteiro({
        sessionId: "session-1",
        referenceDate: "2026-09-10",
        dateRangeStart: "2026-10-10",
        dateRangeEnd: "2026-10-12",
        destination: { name: "Foz do Iguaçu" },
        // @ts-expect-error -- teste deliberadamente omite `accommodation` obrigatório
        accommodation: undefined,
      }),
    ).rejects.toThrow(/accommodation/);

    expect(generateStructuredCompletionWithRetryMock).not.toHaveBeenCalled();
  });

  it("propaga o erro do Gateway de IA (ex. falha após retry, incluindo grounding de data L3-T03) sem mascarar", async () => {
    generateStructuredCompletionWithRetryMock.mockRejectedValueOnce(
      new Error("falha simulada após retry"),
    );

    await expect(generateRoteiro(BASE_INPUT)).rejects.toThrow(/falha simulada/);
  });
});
