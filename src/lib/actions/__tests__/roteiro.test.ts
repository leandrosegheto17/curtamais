// V2-L6-T07 (RF-16.7/ADR-009) — teste unitário, sem Postgres/next-auth reais
// (diferente de `roteiro.integration.test.ts`, que exige um Postgres
// acessível em `localhost:55432` — indisponível neste ambiente, mesma
// limitação já documentada nas notas de implementação de `V2-L6-T01/T02/T03`
// no TASK.md). Isola exatamente o comportamento do guard `exigeConta: true`
// em `gerarRoteiro`/`aprovarRoteiro`, mockando `@/lib/prisma`,
// `@/lib/session-flow` e `@/lib/stage-rules` (o "Gateway de IA" nesta
// fronteira — `generateRoteiro` é quem, internamente, chama o provider real).
//
// Critério de aceite (TASK.md V2-L6-T07, idêntico a T05/T06): "chamada sem
// conta é recusada SEM chamar o Gateway de IA" — coberto abaixo verificando
// que `generateRoteiro`/`applySessionFlowTransition` nunca são invocados
// quando `assertSessionAccess` lança `ContaNecessariaError`. "Com conta:
// comportamento inalterado" — coberto pelos casos de sucesso, que devem
// continuar devolvendo exatamente o mesmo shape de antes desta tarefa
// (`RoteiroDayResult[]`/`AprovarRoteiroResult`, sem o campo `status`).
import { beforeEach, describe, expect, it, vi } from "vitest";

const tripSessionFindUniqueMock = vi.fn();
const destinationApprovalFindUniqueMock = vi.fn();
const accommodationApprovalFindUniqueMock = vi.fn();
const activityApprovalFindManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tripSession: {
      findUnique: (...args: unknown[]) => tripSessionFindUniqueMock(...args),
    },
    destinationApproval: {
      findUnique: (...args: unknown[]) =>
        destinationApprovalFindUniqueMock(...args),
    },
    accommodationApproval: {
      findUnique: (...args: unknown[]) =>
        accommodationApprovalFindUniqueMock(...args),
    },
    activityApproval: {
      findMany: (...args: unknown[]) => activityApprovalFindManyMock(...args),
    },
  },
}));

const generateRoteiroMock = vi.fn();
vi.mock("@/lib/stage-rules", () => ({
  generateRoteiro: (...args: unknown[]) => generateRoteiroMock(...args),
}));

const assertSessionAccessMock = vi.fn();
const applySessionFlowTransitionMock = vi.fn();

// `vi.mock` é hoisted para o topo do módulo — as classes usadas dentro da
// factory precisam ser declaradas via `vi.hoisted` para não caírem em erro
// de "Cannot access before initialization" (TDZ).
const { FakeSessionNotFoundError, FakeContaNecessariaError } = vi.hoisted(
  () => {
    class FakeSessionNotFoundError extends Error {
      constructor(sessionId: string) {
        super(`Sessão "${sessionId}" não encontrada.`);
        this.name = "SessionNotFoundError";
      }
    }
    class FakeContaNecessariaError extends Error {
      readonly sessionId: string;
      constructor(sessionId: string) {
        super(`Conta necessária para "${sessionId}".`);
        this.name = "ContaNecessariaError";
        this.sessionId = sessionId;
      }
    }
    return { FakeSessionNotFoundError, FakeContaNecessariaError };
  },
);

vi.mock("@/lib/session-flow", () => ({
  applySessionFlowTransition: (...args: unknown[]) =>
    applySessionFlowTransitionMock(...args),
  assertSessionAccess: (...args: unknown[]) => assertSessionAccessMock(...args),
  ContaNecessariaError: FakeContaNecessariaError,
  SessionNotFoundError: FakeSessionNotFoundError,
}));

import { gerarRoteiro, aprovarRoteiro } from "@/lib/actions/roteiro";
import type { RoteiroDayResult } from "@/lib/stage-rules";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

const SESSION_RECORD = {
  flowState: "roteiro_pendente",
  dateRangeStart: new Date("2026-12-20"),
  dateRangeEnd: new Date("2026-12-21"),
  userId: null,
  anonSessionId: "anon-abc",
};

beforeEach(() => {
  tripSessionFindUniqueMock.mockReset();
  destinationApprovalFindUniqueMock.mockReset();
  accommodationApprovalFindUniqueMock.mockReset();
  activityApprovalFindManyMock.mockReset();
  generateRoteiroMock.mockReset();
  assertSessionAccessMock.mockReset();
  applySessionFlowTransitionMock.mockReset();
});

describe("gerarRoteiro — guard exigeConta: true (V2-L6-T07)", () => {
  it("sem conta: devolve resultado discriminado e nunca chama o Gateway de IA (generateRoteiro)", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockRejectedValue(
      new FakeContaNecessariaError(SESSION_ID),
    );

    const result = await gerarRoteiro(SESSION_ID);

    expect(result).toEqual({ status: "conta_necessaria", sessionId: SESSION_ID });
    expect(assertSessionAccessMock).toHaveBeenCalledWith(
      SESSION_ID,
      SESSION_RECORD,
      { exigeConta: true },
    );
    expect(generateRoteiroMock).not.toHaveBeenCalled();
    // Guard é chamado ANTES de qualquer leitura de contexto adicional.
    expect(destinationApprovalFindUniqueMock).not.toHaveBeenCalled();
    expect(accommodationApprovalFindUniqueMock).not.toHaveBeenCalled();
  });

  it("posse negada (SessionNotFoundError) propaga como exceção, nunca vira conta_necessaria", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockRejectedValue(
      new FakeSessionNotFoundError(SESSION_ID),
    );

    await expect(gerarRoteiro(SESSION_ID)).rejects.toBeInstanceOf(
      FakeSessionNotFoundError,
    );
    expect(generateRoteiroMock).not.toHaveBeenCalled();
  });

  it("com conta: comportamento inalterado — gera o roteiro normalmente", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockResolvedValue(undefined);
    destinationApprovalFindUniqueMock.mockResolvedValue({
      name: "Foz do Iguaçu",
      priceRangeMin: { toNumber: () => 800 },
      priceRangeMax: { toNumber: () => 1500 },
    });
    accommodationApprovalFindUniqueMock.mockResolvedValue({
      name: "Pousada Vista Mar",
      type: "pousada",
    });
    activityApprovalFindManyMock.mockResolvedValue([]);
    const fakeDias: RoteiroDayResult[] = [
      { date: "2026-12-20", morning: [], afternoon: [], evening: [] },
    ];
    generateRoteiroMock.mockResolvedValue(fakeDias);

    const result = await gerarRoteiro(SESSION_ID);

    expect(result).toBe(fakeDias);
    expect(generateRoteiroMock).toHaveBeenCalledTimes(1);
  });
});

const DIAS: RoteiroDayResult[] = [
  {
    date: "2026-12-20",
    morning: [
      {
        activity: "Trilha das Cataratas",
        suggestedTime: "08h",
        timingJustification: null,
        sequenceOrder: 0,
      },
    ],
    afternoon: [],
    evening: [],
  },
];

describe("aprovarRoteiro — guard exigeConta: true (V2-L6-T07)", () => {
  it("sem conta: devolve resultado discriminado e nunca persiste (applySessionFlowTransition não é chamado)", async () => {
    tripSessionFindUniqueMock.mockResolvedValue({
      userId: null,
      anonSessionId: "anon-abc",
    });
    assertSessionAccessMock.mockRejectedValue(
      new FakeContaNecessariaError(SESSION_ID),
    );

    const result = await aprovarRoteiro({ sessionId: SESSION_ID, dias: DIAS });

    expect(result).toEqual({ status: "conta_necessaria", sessionId: SESSION_ID });
    expect(assertSessionAccessMock).toHaveBeenCalledWith(
      SESSION_ID,
      { userId: null, anonSessionId: "anon-abc" },
      { exigeConta: true },
    );
    expect(applySessionFlowTransitionMock).not.toHaveBeenCalled();
  });

  it("posse negada (SessionNotFoundError) propaga como exceção, nunca vira conta_necessaria", async () => {
    tripSessionFindUniqueMock.mockResolvedValue({
      userId: null,
      anonSessionId: "anon-abc",
    });
    assertSessionAccessMock.mockRejectedValue(
      new FakeSessionNotFoundError(SESSION_ID),
    );

    await expect(
      aprovarRoteiro({ sessionId: SESSION_ID, dias: DIAS }),
    ).rejects.toBeInstanceOf(FakeSessionNotFoundError);
    expect(applySessionFlowTransitionMock).not.toHaveBeenCalled();
  });

  it("sessão inexistente: lança SessionNotFoundError antes mesmo de chamar o guard", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(null);

    await expect(
      aprovarRoteiro({ sessionId: SESSION_ID, dias: DIAS }),
    ).rejects.toBeInstanceOf(FakeSessionNotFoundError);
    expect(assertSessionAccessMock).not.toHaveBeenCalled();
    expect(applySessionFlowTransitionMock).not.toHaveBeenCalled();
  });

  it("com conta: comportamento inalterado — persiste e conclui a sessão", async () => {
    tripSessionFindUniqueMock.mockResolvedValue({
      userId: "user-1",
      anonSessionId: null,
    });
    assertSessionAccessMock.mockResolvedValue(undefined);
    applySessionFlowTransitionMock.mockResolvedValue({
      sessionId: SESSION_ID,
      flowState: "concluida",
      status: "completed",
    });

    const result = await aprovarRoteiro({ sessionId: SESSION_ID, dias: DIAS });

    expect(result).toEqual({
      proximaEtapa: "encerramento",
      sessionId: SESSION_ID,
      flowState: "concluida",
      totalItens: 1,
    });
    expect(applySessionFlowTransitionMock).toHaveBeenCalledTimes(2);
  });
});
