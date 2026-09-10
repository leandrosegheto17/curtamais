// @vitest-environment node
//
// L7-T03 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/actions/__tests__/data-livre.integration.test.ts`, L6-T03, e
// `src/lib/session-flow/__tests__/persistence.integration.test.ts`, L4-T02),
// combinado com mock do Gateway de IA (mesmo padrão de
// `src/lib/stage-rules/__tests__/destino.test.ts`, L7-T01) — nenhuma chamada
// de rede real ao provider, mas persistência real via `applySessionFlowTransition`.
//
// Cobre o critério de aceite de L7-T03: "Aprovar avança para confirmação;
// rejeitar todas permite nova rodada ou entrada manual; encerrar preserva
// destino aprovado."
//
// L11-T02 (ADR-008): `gerarSugestoesDestino`/`applySessionFlowTransition`
// (via as demais Server Actions deste arquivo) agora aplicam o guard central
// de autorização — `next-auth`/`next/headers` são mockados (mesmo padrão de
// `data-livre.integration.test.ts`, L11-T02a), simulando por padrão o mesmo
// solicitante anônimo (`ANON_ID`) que "criou" as sessões de teste via
// `createSessionWithDateRange`.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionWithDateRange } from "@/lib/session-flow";
import { InvalidTransitionError } from "@/lib/session-flow";

const getServerSessionMock = vi.fn();
const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (...args: unknown[]) => cookieGetMock(...args),
    set: (...args: unknown[]) => cookieSetMock(...args),
  }),
}));

const ANON_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
import {
  aprovarDestinoSugerido,
  encerrarResolucaoDestino,
  gerarSugestoesDestino,
  informarDestinoManualmente,
} from "@/lib/actions/destino";
import {
  DestinoEtapaInvalidaError,
  InvalidDestinoSuggestionError,
  InvalidManualDestinoError,
} from "@/lib/actions/destino-errors";
import { SessionNotFoundError } from "@/lib/session-flow";

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

function mockDestinos(
  destinos: {
    nome: string;
    justificativa: string;
    faixaPrecoMin: number;
    faixaPrecoMax: number;
  }[],
) {
  generateStructuredCompletionWithRetryMock.mockResolvedValueOnce({
    data: { destinos },
    model: "gpt-4o-mini",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  });
}

describe("Server Actions de T04 — integração real com Postgres (L7-T03)", () => {
  const sessionIds: string[] = [];

  async function createPendingSession(): Promise<string> {
    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-10T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-11-15T00:00:00.000Z"),
      // ADR-008/L11-T02a: owner obrigatório desde o retrofit desta tarefa;
      // mesmo id anônimo mockado (`ANON_ID`) usado pelo guard central
      // (L11-T02) para autorizar as Server Actions deste arquivo.
      owner: { type: "anonymous", anonSessionId: ANON_ID },
    });
    sessionIds.push(result.sessionId);
    expect(result.flowState).toBe("destino_pendente");
    return result.sessionId;
  }

  async function createConfirmedSession(): Promise<string> {
    const result = await createSessionWithDateRange({
      entryPath: "data_livre",
      dateRangeStart: new Date("2026-11-10T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-11-15T00:00:00.000Z"),
      destino: "Foz do Iguaçu",
      owner: { type: "anonymous", anonSessionId: ANON_ID },
    });
    sessionIds.push(result.sessionId);
    expect(result.flowState).toBe("destino_confirmado");
    return result.sessionId;
  }

  beforeEach(() => {
    generateStructuredCompletionWithRetryMock.mockReset();
    getServerSessionMock.mockReset();
    cookieGetMock.mockReset();
    cookieSetMock.mockReset();
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: ANON_ID });
  });

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  describe("gerarSugestoesDestino (RF-04.1, e nova rodada RF-04.4)", () => {
    it("gera sugestões para uma sessão em destino_pendente sem persistir nada", async () => {
      const sessionId = await createPendingSession();
      mockDestinos([
        { nome: "Gramado", justificativa: "Clima ameno.", faixaPrecoMin: 1000, faixaPrecoMax: 2000 },
        { nome: "Bonito", justificativa: "Ecoturismo.", faixaPrecoMin: 1200, faixaPrecoMax: 2200 },
      ]);

      const result = await gerarSugestoesDestino(sessionId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Gramado");

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_pendente");
      const destination = await prisma.destinationApproval.findUnique({
        where: { sessionId },
      });
      expect(destination).toBeNull();
    });

    it("suporta chamadas repetidas (nova rodada, RF-04.4) sem mudar de estado", async () => {
      const sessionId = await createPendingSession();
      mockDestinos([
        { nome: "A", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
        { nome: "B", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
      ]);
      const first = await gerarSugestoesDestino(sessionId);
      expect(first.map((r) => r.name)).toEqual(["A", "B"]);

      mockDestinos([
        { nome: "C", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
        { nome: "D", justificativa: "J", faixaPrecoMin: 100, faixaPrecoMax: 200 },
      ]);
      const second = await gerarSugestoesDestino(sessionId);
      expect(second.map((r) => r.name)).toEqual(["C", "D"]);

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_pendente");
    });

    it("lança SessionNotFoundError para sessão inexistente", async () => {
      await expect(
        gerarSugestoesDestino("00000000-0000-0000-0000-000000000000"),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });

    it("lança DestinoEtapaInvalidaError quando a sessão já não está em destino_pendente", async () => {
      const sessionId = await createConfirmedSession();
      await expect(gerarSugestoesDestino(sessionId)).rejects.toBeInstanceOf(
        DestinoEtapaInvalidaError,
      );
      expect(generateStructuredCompletionWithRetryMock).not.toHaveBeenCalled();
    });
  });

  describe("aprovarDestinoSugerido (RF-04.3)", () => {
    it("aprova a sugestão escolhida, persiste com source=ia_suggested e avança para destino_confirmado", async () => {
      const sessionId = await createPendingSession();

      const result = await aprovarDestinoSugerido({
        sessionId,
        suggestion: {
          name: "Gramado",
          justification: "Clima ameno no período.",
          priceRangeMin: 1000,
          priceRangeMax: 2000,
          withinBudget: true,
          exceedsBudget: false,
        },
      });

      expect(result).toEqual({
        proximaEtapa: "confirmacao_destino",
        sessionId,
        flowState: "destino_confirmado",
        destino: "Gramado",
      });

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_confirmado");

      const destination = await prisma.destinationApproval.findUniqueOrThrow({
        where: { sessionId },
      });
      expect(destination.name).toBe("Gramado");
      expect(destination.source).toBe("ia_suggested");
      expect(destination.justification).toBe("Clima ameno no período.");
      expect(destination.priceRangeMin.toNumber()).toBe(1000);
      expect(destination.priceRangeMax.toNumber()).toBe(2000);
    });

    it("rejeita payload adulterado (faixa de preço invertida) sem persistir nada", async () => {
      const sessionId = await createPendingSession();

      await expect(
        aprovarDestinoSugerido({
          sessionId,
          suggestion: {
            name: "Gramado",
            justification: "Justificativa.",
            priceRangeMin: 5000,
            priceRangeMax: 1000,
            withinBudget: true,
            exceedsBudget: false,
          },
        }),
      ).rejects.toBeInstanceOf(InvalidDestinoSuggestionError);

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_pendente");
      const destination = await prisma.destinationApproval.findUnique({
        where: { sessionId },
      });
      expect(destination).toBeNull();
    });

    it("rejeita payload com nome vazio sem persistir nada", async () => {
      const sessionId = await createPendingSession();

      await expect(
        aprovarDestinoSugerido({
          sessionId,
          suggestion: {
            name: "   ",
            justification: "Justificativa.",
            priceRangeMin: 100,
            priceRangeMax: 200,
            withinBudget: true,
            exceedsBudget: false,
          },
        }),
      ).rejects.toBeInstanceOf(InvalidDestinoSuggestionError);
    });

    it("propaga InvalidTransitionError ao tentar aprovar uma sessão que já está destino_confirmado", async () => {
      const sessionId = await createConfirmedSession();

      await expect(
        aprovarDestinoSugerido({
          sessionId,
          suggestion: {
            name: "Outro",
            justification: "Justificativa.",
            priceRangeMin: 100,
            priceRangeMax: 200,
            withinBudget: true,
            exceedsBudget: false,
          },
        }),
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });
  });

  describe("informarDestinoManualmente (atalho manual de T04)", () => {
    it("aprova destino manual com source=user_provided, justification=null e preço 0/0", async () => {
      const sessionId = await createPendingSession();

      const result = await informarDestinoManualmente({
        sessionId,
        destino: "  Serra Gaúcha  ",
      });

      expect(result).toEqual({
        proximaEtapa: "confirmacao_destino",
        sessionId,
        flowState: "destino_confirmado",
        destino: "Serra Gaúcha",
      });

      const destination = await prisma.destinationApproval.findUniqueOrThrow({
        where: { sessionId },
      });
      expect(destination.source).toBe("user_provided");
      expect(destination.justification).toBeNull();
      expect(destination.priceRangeMin.toNumber()).toBe(0);
      expect(destination.priceRangeMax.toNumber()).toBe(0);
    });

    it("rejeita destino em branco (só espaços) sem persistir nada", async () => {
      const sessionId = await createPendingSession();

      await expect(
        informarDestinoManualmente({ sessionId, destino: "   " }),
      ).rejects.toBeInstanceOf(InvalidManualDestinoError);

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_pendente");
    });

    it("trunca destino acima do limite de tamanho antes de persistir", async () => {
      const sessionId = await createPendingSession();
      const longDestino = "a".repeat(500);

      const result = await informarDestinoManualmente({
        sessionId,
        destino: longDestino,
      });

      expect(result.destino).toHaveLength(200);
    });
  });

  describe("encerrarResolucaoDestino (RF-04.5 → T-END parcial)", () => {
    it("encerra a partir de destino_confirmado preservando o DestinationApproval já aprovado (RN-03)", async () => {
      const sessionId = await createConfirmedSession();

      const result = await encerrarResolucaoDestino(sessionId);

      expect(result).toEqual({
        proximaEtapa: "encerramento",
        sessionId,
        flowState: "encerrada_parcial",
      });

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("encerrada_parcial");
      expect(stored.status).toBe("partial");

      const destination = await prisma.destinationApproval.findUniqueOrThrow({
        where: { sessionId },
      });
      expect(destination.name).toBe("Foz do Iguaçu");
    });

    it("confirma a investigação desta tarefa: encerrar a partir de destino_pendente (antes de aprovar) continua inválido na state machine", async () => {
      const sessionId = await createPendingSession();

      await expect(encerrarResolucaoDestino(sessionId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(stored.flowState).toBe("destino_pendente");
    });
  });
});
