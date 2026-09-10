// @vitest-environment node
//
// L7-T05 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/session-flow/__tests__/persistence.integration.test.ts`, L4-T02, e
// `src/lib/actions/__tests__/data-livre.integration.test.ts`, L6-T03): prova
// que `confirmarDestino` avança o `flowState` de `destino_confirmado` para
// `hospedagem_pendente` via `@/lib/session-flow`, cobrindo a parte "confirmar
// avança para hospedagem" do critério de aceite de L7-T05.
//
// Retomada de 2026-09-10 (Bloqueio 002 resolvido, ADR-006 Adendo 2): também
// prova que `trocarDestino` regride `flowState` de `destino_confirmado` para
// `destino_pendente` via a nova ação `revisar` e apaga a `DestinationApproval`
// já aprovada — cobrindo a parte "trocar volta ao campo de destino" do
// critério de aceite.
//
// L11-T02 (ADR-008): `applySessionFlowTransition` agora aplica o guard
// central de autorização internamente — `next-auth`/`next/headers` são
// mockados (mesmo padrão de `data-livre.integration.test.ts`, L11-T02a),
// simulando por padrão o mesmo solicitante anônimo (`ANON_ID`) dono de toda
// sessão criada por `createSessionAtDestinoConfirmado`.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { applySessionFlowTransition } from "@/lib/session-flow";
import { InvalidTransitionError } from "@/lib/session-flow/errors";
import {
  confirmarDestino,
  trocarDestino,
} from "@/lib/actions/confirmacao-destino";
import { InvalidConfirmacaoDestinoInputError } from "@/lib/actions/confirmacao-destino-errors";

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

const ANON_ID = "14141414-1414-4141-8141-141414141414";

beforeEach(() => {
  getServerSessionMock.mockReset();
  cookieGetMock.mockReset();
  cookieSetMock.mockReset();
  getServerSessionMock.mockResolvedValue(null);
  cookieGetMock.mockReturnValue({ value: ANON_ID });
});

async function createSessionAtDestinoConfirmado() {
  const session = await prisma.tripSession.create({
    data: {
      entryPath: "data_livre",
      dateRangeEnd: new Date("2026-12-20"),
      anonSessionId: ANON_ID,
    },
  });
  await applySessionFlowTransition({ sessionId: session.id, action: "iniciar" });
  await applySessionFlowTransition({
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
  return session;
}

describe("confirmarDestino — integração real com Postgres (L7-T05)", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("confirmar avança de destino_confirmado para hospedagem_pendente (RF-11, critério de aceite)", async () => {
    const session = await createSessionAtDestinoConfirmado();
    sessionIds.push(session.id);

    const result = await confirmarDestino({ sessionId: session.id });

    expect(result.proximaEtapa).toBe("hospedagem");
    expect(result.flowState).toBe("hospedagem_pendente");
    expect(result.sessionId).toBe(session.id);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("hospedagem_pendente");
    expect(stored.status).toBe("in_progress");

    // RN-03/DestinationApproval já aprovado permanece intocado por "avancar".
    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(destination.name).toBe("Foz do Iguaçu");
  });

  it("rejeita confirmar a partir de um estado que não é destino_confirmado (sem pular etapa)", async () => {
    const session = await prisma.tripSession.create({
      data: { entryPath: "data_livre", dateRangeEnd: new Date("2026-12-20"), anonSessionId: ANON_ID },
    });
    sessionIds.push(session.id);
    // Sessão ainda em entrada_selecionada — nunca chegou a destino_confirmado.

    await expect(
      confirmarDestino({ sessionId: session.id }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("entrada_selecionada");
  });

  it("rejeita sessionId ausente/vazio sem consultar o banco", async () => {
    await expect(
      confirmarDestino({ sessionId: "" }),
    ).rejects.toBeInstanceOf(InvalidConfirmacaoDestinoInputError);
  });
});

describe("trocarDestino — integração real com Postgres (L7-T05, retomada)", () => {
  const sessionIds: string[] = [];

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("trocar volta de destino_confirmado para destino_pendente e apaga a DestinationApproval (RF-11, critério de aceite)", async () => {
    const session = await createSessionAtDestinoConfirmado();
    sessionIds.push(session.id);

    const result = await trocarDestino({ sessionId: session.id });

    expect(result.proximaEtapa).toBe("destino");
    expect(result.flowState).toBe("destino_pendente");
    expect(result.sessionId).toBe(session.id);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("destino_pendente");
    expect(stored.status).toBe("in_progress");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: session.id },
    });
    expect(destination).toBeNull();
  });

  it("rejeita trocar a partir de um estado que não é destino_confirmado (sem pular etapa)", async () => {
    const session = await prisma.tripSession.create({
      data: { entryPath: "data_livre", dateRangeEnd: new Date("2026-12-20"), anonSessionId: ANON_ID },
    });
    sessionIds.push(session.id);
    // Sessão ainda em entrada_selecionada — nunca chegou a destino_confirmado.

    await expect(
      trocarDestino({ sessionId: session.id }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("entrada_selecionada");
  });

  it("rejeita sessionId ausente/vazio sem consultar o banco", async () => {
    await expect(
      trocarDestino({ sessionId: "" }),
    ).rejects.toBeInstanceOf(InvalidConfirmacaoDestinoInputError);
  });
});
