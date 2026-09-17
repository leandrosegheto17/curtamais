// V2-L8-T03 — teste unitário, sem Postgres/next-auth reais (mesmo raciocínio
// de `roteiro.test.ts`, V2-L6-T07: Postgres real indisponível neste
// ambiente). Mocka `@/lib/prisma` e `@/lib/session-flow` para isolar
// `obterRoteiroLeitura`.
//
// Critérios de aceite cobertos (TASK.md V2-L8-T03):
// - "Nenhuma chamada ao Gateway de IA": nenhum mock/spy de
//   `@/lib/gateway-ia`/`@/lib/stage-rules` é sequer registrado neste arquivo —
//   se `obterRoteiroLeitura` importasse algum desses módulos em runtime, o
//   teste falharia por módulo não mockado tentando inicializar dependências
//   reais (`next/headers`/providers de IA), então a ausência desses mocks já
//   é, por si, uma prova negativa.
// - "Divergência de posse devolve 404 lógico": `SessionNotFoundError`.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tripSessionFindUniqueMock = vi.fn();
const itineraryItemFindManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tripSession: {
      findUnique: (...args: unknown[]) => tripSessionFindUniqueMock(...args),
    },
    itineraryItem: {
      findMany: (...args: unknown[]) => itineraryItemFindManyMock(...args),
    },
  },
}));

const assertSessionAccessMock = vi.fn();

// `vi.mock` é hoisted — classes usadas na factory precisam de `vi.hoisted`
// (mesmo padrão de `roteiro.test.ts`).
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
  assertSessionAccess: (...args: unknown[]) => assertSessionAccessMock(...args),
  ContaNecessariaError: FakeContaNecessariaError,
  SessionNotFoundError: FakeSessionNotFoundError,
}));

import { obterRoteiroLeitura } from "@/lib/actions/obter-roteiro-leitura";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_RECORD = { userId: "user-1", anonSessionId: null };

beforeEach(() => {
  tripSessionFindUniqueMock.mockReset();
  itineraryItemFindManyMock.mockReset();
  assertSessionAccessMock.mockReset();
});

describe("obterRoteiroLeitura (V2-L8-T03)", () => {
  it("sessão inexistente: lança SessionNotFoundError antes mesmo de chamar o guard", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(null);

    await expect(obterRoteiroLeitura(SESSION_ID)).rejects.toBeInstanceOf(
      FakeSessionNotFoundError,
    );
    expect(assertSessionAccessMock).not.toHaveBeenCalled();
    expect(itineraryItemFindManyMock).not.toHaveBeenCalled();
  });

  it("posse negada (SessionNotFoundError) propaga como exceção — 404 lógico, nunca 403", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockRejectedValue(
      new FakeSessionNotFoundError(SESSION_ID),
    );

    await expect(obterRoteiroLeitura(SESSION_ID)).rejects.toBeInstanceOf(
      FakeSessionNotFoundError,
    );
    expect(itineraryItemFindManyMock).not.toHaveBeenCalled();
  });

  it("posse confirmada mas conta exigida: devolve resultado discriminado, nunca lança", async () => {
    tripSessionFindUniqueMock.mockResolvedValue({
      userId: null,
      anonSessionId: "anon-abc",
    });
    assertSessionAccessMock.mockRejectedValue(
      new FakeContaNecessariaError(SESSION_ID),
    );

    const result = await obterRoteiroLeitura(SESSION_ID);

    expect(result).toEqual({ status: "conta_necessaria", sessionId: SESSION_ID });
    expect(itineraryItemFindManyMock).not.toHaveBeenCalled();
  });

  it("leitura bem-sucedida: itens ordenados corretamente agrupados por dia, período e activity via join", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockResolvedValue(undefined);

    itineraryItemFindManyMock.mockResolvedValue([
      {
        dayDate: new Date("2026-12-20T00:00:00.000Z"),
        period: "manha",
        suggestedTime: "08h",
        timingJustification: "Antes do calor.",
        sequenceOrder: 0,
        activity: { name: "Trilha das Cataratas" },
      },
      {
        dayDate: new Date("2026-12-20T00:00:00.000Z"),
        period: "tarde",
        suggestedTime: "14h",
        timingJustification: null,
        sequenceOrder: 1,
        activity: null,
      },
      {
        dayDate: new Date("2026-12-21T00:00:00.000Z"),
        period: "noite",
        suggestedTime: "19h",
        timingJustification: null,
        sequenceOrder: 2,
        activity: { name: "Jantar típico" },
      },
    ]);

    const result = await obterRoteiroLeitura(SESSION_ID);

    expect(itineraryItemFindManyMock).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: [
        { dayDate: "asc" },
        { period: "asc" },
        { sequenceOrder: "asc" },
      ],
      select: {
        dayDate: true,
        period: true,
        suggestedTime: true,
        timingJustification: true,
        sequenceOrder: true,
        activity: { select: { name: true } },
      },
    });

    expect(result).toEqual([
      {
        date: "2026-12-20",
        morning: [
          {
            activity: "Trilha das Cataratas",
            suggestedTime: "08h",
            timingJustification: "Antes do calor.",
            sequenceOrder: 0,
          },
        ],
        afternoon: [
          {
            // Sem `ActivityApproval` vinculado — placeholder documentado
            // (GAP DE SCHEMA CONHECIDO, cabeçalho de
            // `obter-roteiro-leitura.ts`).
            activity: "Atividade do roteiro",
            suggestedTime: "14h",
            timingJustification: null,
            sequenceOrder: 1,
          },
        ],
        evening: [],
      },
      {
        date: "2026-12-21",
        morning: [],
        afternoon: [],
        evening: [
          {
            activity: "Jantar típico",
            suggestedTime: "19h",
            timingJustification: null,
            sequenceOrder: 2,
          },
        ],
      },
    ]);
  });

  it("nenhum item persistido: devolve array vazio", async () => {
    tripSessionFindUniqueMock.mockResolvedValue(SESSION_RECORD);
    assertSessionAccessMock.mockResolvedValue(undefined);
    itineraryItemFindManyMock.mockResolvedValue([]);

    const result = await obterRoteiroLeitura(SESSION_ID);

    expect(result).toEqual([]);
  });
});
