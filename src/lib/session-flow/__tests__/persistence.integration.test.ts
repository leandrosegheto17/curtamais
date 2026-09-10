// @vitest-environment node
//
// L4-T02 — Teste de integração real com Postgres (mesmo padrão de
// `prisma/__tests__/schema.integration.test.ts` /
// `src/lib/__tests__/user-account.integration.test.ts`), provando que a
// migration `l4_t02_flow_state` funciona de ponta a ponta e que
// `applySessionFlowTransition` grava exatamente o que RF-09/RN-03 exigem.
//
// Requer DATABASE_URL apontando para um Postgres com a migration aplicada
// (mesmo banco usado pelos demais testes de integração do projeto).
//
// L11-T02 (ADR-008): `applySessionFlowTransition` agora chama o guard
// central de autorização (`assertSessionOwnership`) logo após checar que a
// sessão existe, o que exige resolver o dono esperado da requisição corrente
// via `resolveSessionOwner` — `next-auth`/`next/headers` são mockados (mesmo
// padrão de `src/lib/actions/__tests__/data-livre.integration.test.ts`,
// L11-T02a), simulando por padrão o caminho anônimo. `createTestSession`
// agora grava `anonSessionId: ANON_ID` (o mesmo id devolvido pelo cookie
// mockado) para que toda sessão criada nos testes já nasça pertencendo ao
// "solicitante" simulado — sem isso, o guard negaria (404) toda chamada
// subsequente a `applySessionFlowTransition`, já que nenhuma sessão teria
// dono gravado (edge case coberto por `authorization.test.ts`).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  applySessionFlowTransition,
  InvalidChildDataError,
} from "@/lib/session-flow";
import {
  InvalidTransitionError,
  SessionNotFoundError,
} from "@/lib/session-flow/errors";

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

const ANON_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

async function createTestSession() {
  return prisma.tripSession.create({
    data: {
      entryPath: "data_livre",
      dateRangeEnd: new Date("2026-12-20"),
      anonSessionId: ANON_ID,
    },
  });
}

describe("applySessionFlowTransition — integração real com Postgres (L4-T02)", () => {
  const sessionIds: string[] = [];

  beforeEach(() => {
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

  it("nasce em entrada_selecionada/in_progress (default do schema)", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);

    expect(session.flowState).toBe("entrada_selecionada");
    expect(session.status).toBe("in_progress");
  });

  it("iniciar avança flowState sem tocar status nem criar entidade filha", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "iniciar",
    });

    expect(result.flowState).toBe("destino_pendente");
    expect(result.status).toBe("in_progress");
  });

  it("aprovar destino persiste DestinationApproval e avança flowState (RF-09)", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Foz do Iguaçu",
        justification: "Clima ameno e dentro do orçamento.",
        priceRangeMin: "800.00",
        priceRangeMax: "1500.00",
        source: "ia_suggested",
      },
    });

    expect(result.flowState).toBe("destino_confirmado");

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(destination.name).toBe("Foz do Iguaçu");
    expect(destination.source).toBe("ia_suggested");
  });

  it("aprovar hospedagem persiste AccommodationApproval e avança flowState", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
    await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Ouro Preto",
        justification: null,
        priceRangeMin: "500.00",
        priceRangeMax: "900.00",
        source: "user_provided",
      },
    });
    await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "hospedagem",
        name: "Pousada Central",
        type: "pousada",
        pricePerNightMin: "150.00",
        pricePerNightMax: "250.00",
        distinctiveFeature: "vista para a igreja matriz",
      },
    });

    expect(result.flowState).toBe("hospedagem_aprovada");

    const accommodation = await prisma.accommodationApproval.findUniqueOrThrow(
      { where: { sessionId: session.id } },
    );
    expect(accommodation.name).toBe("Pousada Central");
  });

  async function advanceToPasseiosPendente(sessionId: string) {
    await applySessionFlowTransition({ sessionId, action: "iniciar" });
    await applySessionFlowTransition({
      sessionId,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Bonito",
        justification: "Ecoturismo.",
        priceRangeMin: "600.00",
        priceRangeMax: "1000.00",
        source: "ia_suggested",
      },
    });
    await applySessionFlowTransition({ sessionId, action: "avancar" });
    await applySessionFlowTransition({
      sessionId,
      action: "aprovar",
      childData: {
        stage: "hospedagem",
        name: "Hotel Bonito",
        type: "hotel",
        pricePerNightMin: "200.00",
        pricePerNightMax: "300.00",
        distinctiveFeature: "café da manhã incluso",
      },
    });
    await applySessionFlowTransition({ sessionId, action: "avancar" });
  }

  it("aprovar passeios persiste ActivityApproval(ns) e avança flowState", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await advanceToPasseiosPendente(session.id);

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "passeios",
        activities: [
          {
            name: "Trilha na Serra",
            priceMin: "0.00",
            priceMax: "0.00",
            isFree: true,
            durationApprox: "3 horas",
            orderIndex: 0,
          },
          {
            name: "Passeio de barco",
            priceMin: "80.00",
            priceMax: "120.00",
            isFree: false,
            durationApprox: "2 horas",
            orderIndex: 1,
          },
        ],
      },
    });

    expect(result.flowState).toBe("passeios_aprovados");

    const activities = await prisma.activityApproval.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: "asc" },
    });
    expect(activities).toHaveLength(2);
    expect(activities[0].name).toBe("Trilha na Serra");
    expect(activities[1].name).toBe("Passeio de barco");
  });

  it("aprovar roteiro persiste ItineraryItem(ns), avança flowState e sincroniza status=completed", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await advanceToPasseiosPendente(session.id);
    await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "passeios",
        activities: [
          {
            name: "Trilha na Serra",
            priceMin: "0.00",
            priceMax: "0.00",
            isFree: true,
            durationApprox: "3 horas",
            orderIndex: 0,
          },
        ],
      },
    });
    await applySessionFlowTransition({ sessionId: session.id, action: "avancar" });

    const activity = await prisma.activityApproval.findFirstOrThrow({
      where: { sessionId: session.id },
    });

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "roteiro",
        items: [
          {
            activityId: activity.id,
            dayDate: new Date("2026-12-21"),
            period: "manha",
            suggestedTime: "08:00",
            timingJustification: "Clima mais ameno pela manhã.",
            sequenceOrder: 0,
          },
        ],
      },
    });

    expect(result.flowState).toBe("roteiro_aprovado");

    const advanced = await applySessionFlowTransition({
      sessionId: session.id,
      action: "avancar",
    });
    expect(advanced.flowState).toBe("concluida");
    expect(advanced.status).toBe("completed");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.status).toBe("completed");
    expect(stored.flowState).toBe("concluida");

    const items = await prisma.itineraryItem.findMany({
      where: { sessionId: session.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].activityId).toBe(activity.id);
  });

  it("RN-03: encerrar em qualquer ponto preserva o já aprovado (não apaga DestinationApproval)", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
    await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Paraty",
        justification: "Cidade histórica.",
        priceRangeMin: "500.00",
        priceRangeMax: "900.00",
        source: "ia_suggested",
      },
    });

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "encerrar",
    });

    expect(result.flowState).toBe("encerrada_parcial");
    expect(result.status).toBe("partial");

    // A entidade filha aprovada antes de encerrar continua existindo — RN-03.
    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(destination.name).toBe("Paraty");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("encerrada_parcial");
    expect(stored.status).toBe("partial");
  });

  it("transição inválida (pular etapa) não persiste nada — nem flowState, nem entidade filha", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    // Estado inicial é entrada_selecionada — "aprovar" direto é pular etapa.

    await expect(
      applySessionFlowTransition({
        sessionId: session.id,
        action: "aprovar",
        childData: {
          stage: "destino",
          name: "Não deveria ser gravado",
          justification: null,
          priceRangeMin: "1.00",
          priceRangeMax: "2.00",
          source: "ia_suggested",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("entrada_selecionada");
    expect(stored.status).toBe("in_progress");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: session.id },
    });
    expect(destination).toBeNull();
  });

  it("revisar (L7-T05 retomada, ADR-006 Adendo 2) regride destino_confirmado para destino_pendente e apaga a DestinationApproval", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
    await applySessionFlowTransition({
      sessionId: session.id,
      action: "aprovar",
      childData: {
        stage: "destino",
        name: "Gramado",
        justification: "Clima frio e gastronomia.",
        priceRangeMin: "700.00",
        priceRangeMax: "1200.00",
        source: "ia_suggested",
      },
    });

    const result = await applySessionFlowTransition({
      sessionId: session.id,
      action: "revisar",
    });

    expect(result.flowState).toBe("destino_pendente");
    expect(result.status).toBe("in_progress");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("destino_pendente");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: session.id },
    });
    expect(destination).toBeNull();
  });

  it("revisar a partir de um estado que não é destino_confirmado/hospedagem_aprovada/passeios_aprovados/roteiro_aprovado não persiste nada", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
    // Estado atual: destino_pendente — não é um dos estados que aceitam "revisar".

    await expect(
      applySessionFlowTransition({ sessionId: session.id, action: "revisar" }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("destino_pendente");
  });

  it("aprovar sem os dados da entidade filha correta não persiste nada (InvalidChildDataError)", async () => {
    const session = await createTestSession();
    sessionIds.push(session.id);
    await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
    // Estado atual: destino_pendente — envia childData de outra etapa.

    await expect(
      applySessionFlowTransition({
        sessionId: session.id,
        action: "aprovar",
        childData: {
          stage: "hospedagem",
          name: "Hotel errado",
          type: "hotel",
          pricePerNightMin: "100.00",
          pricePerNightMax: "200.00",
          distinctiveFeature: "não deveria ser gravado",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidChildDataError);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("destino_pendente");

    const accommodation = await prisma.accommodationApproval.findUnique({
      where: { sessionId: session.id },
    });
    expect(accommodation).toBeNull();
  });

  describe("L11-T02 (ADR-008) — guard central de autorização", () => {
    it("dono legítimo (mesmo cookie anônimo gravado na criação) continua autorizado sem regressão", async () => {
      const session = await createTestSession();
      sessionIds.push(session.id);

      const result = await applySessionFlowTransition({
        sessionId: session.id,
        action: "iniciar",
      });

      expect(result.flowState).toBe("destino_pendente");
    });

    it("requisição com cookie de outra sessão anônima recebe SessionNotFoundError (sempre 404, nunca 403), sem vazar dado da sessão", async () => {
      const session = await createTestSession();
      sessionIds.push(session.id);

      // Simula um solicitante ilegítimo: cookie de sessão anônima diferente
      // do dono real (`ANON_ID`) gravado por `createTestSession`.
      cookieGetMock.mockReturnValue({
        value: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      });

      await expect(
        applySessionFlowTransition({ sessionId: session.id, action: "iniciar" }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);

      // Nada foi persistido pela tentativa não autorizada.
      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(stored.flowState).toBe("entrada_selecionada");
    });

    it("registro sem nenhum dono gravado (edge case defensivo, ex.: dado pré-L11-T02a) recebe SessionNotFoundError mesmo para um solicitante anônimo válido", async () => {
      const session = await prisma.tripSession.create({
        data: { entryPath: "data_livre", dateRangeEnd: new Date("2026-12-20") },
      });
      sessionIds.push(session.id);

      await expect(
        applySessionFlowTransition({ sessionId: session.id, action: "iniciar" }),
      ).rejects.toBeInstanceOf(SessionNotFoundError);

      const stored = await prisma.tripSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(stored.flowState).toBe("entrada_selecionada");
    });
  });
});
