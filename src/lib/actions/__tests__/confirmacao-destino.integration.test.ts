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
//
// V2-L6-T04 (ADR-009 item 1/2, RF-16.7) — `confirmarDestino` (ação
// `avancar`, `destino_confirmado` → `hospedagem_pendente`) agora exige conta
// verificada (o estado de chegada `hospedagem_pendente` é "pós-destino",
// `transicaoExigeConta` sempre `true` para essa transição). Por isso:
// - `createSessionAtDestinoConfirmado` passou a aceitar um `owner` explícito
//   (mesmo padrão de `mockOwner`/mesma convenção de
//   `create-session-with-range.integration.test.ts`, L6-T03/L6-T05): sessão
//   "com conta" (`userId`, sem `anonSessionId`) para o teste de sucesso de
//   `confirmarDestino`, e sessão anônima (`anonSessionId`, sem `userId`)
//   para o teste novo "sem conta" abaixo.
// - `trocarDestino` (ação `revisar`, `destino_confirmado` → `destino_pendente`)
//   nunca exige conta (nem o estado de origem nem o de destino são
//   "pós-destino") — seus testes continuam usando sessão anônima, sem
//   alteração de comportamento.
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

/** Mesma convenção de `account-deletion.integration.test.ts` (L11-T01). */
async function createUser() {
  return prisma.user.create({
    data: { email: `executor-v2l6t04-${Date.now()}-${Math.random()}@example.com` },
  });
}

type SessionOwnerInput =
  | { type: "user"; userId: string }
  | { type: "anonymous"; anonSessionId: string };

/**
 * Alinha o mock de identidade (`resolveRequestIdentity`) com o `owner` que o
 * teste vai usar para criar a `TripSession` — mesma convenção de `mockOwner`
 * em `create-session-with-range.integration.test.ts` (L6-T03/L6-T05).
 */
function mockOwner(owner: SessionOwnerInput) {
  if (owner.type === "user") {
    getServerSessionMock.mockResolvedValue({ user: { id: owner.userId } });
  } else {
    getServerSessionMock.mockResolvedValue(null);
    cookieGetMock.mockReturnValue({ value: owner.anonSessionId });
  }
}

async function createSessionAtDestinoConfirmado(owner: SessionOwnerInput) {
  mockOwner(owner);
  const session = await prisma.tripSession.create({
    data: {
      entryPath: "data_livre",
      dateRangeEnd: new Date("2026-12-20"),
      ...(owner.type === "user"
        ? { userId: owner.userId }
        : { anonSessionId: owner.anonSessionId }),
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

  it("com conta: confirmar avança de destino_confirmado para hospedagem_pendente (RF-11, critério de aceite)", async () => {
    const user = await createUser();
    const session = await createSessionAtDestinoConfirmado({
      type: "user",
      userId: user.id,
    });
    sessionIds.push(session.id);

    const result = await confirmarDestino({ sessionId: session.id });

    if (!("proximaEtapa" in result)) {
      throw new Error(
        `Esperava avançar para hospedagem, recebeu resultado discriminado: ${JSON.stringify(result)}`,
      );
    }
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

  it("sem conta: confirmar devolve conta_necessaria e mantém a sessão em destino_confirmado (RF-16.7, ADR-009, critério de aceite V2-L6-T04)", async () => {
    const session = await createSessionAtDestinoConfirmado({
      type: "anonymous",
      anonSessionId: ANON_ID,
    });
    sessionIds.push(session.id);

    const result = await confirmarDestino({ sessionId: session.id });

    expect(result).toEqual({
      status: "conta_necessaria",
      sessionId: session.id,
    });

    // Sessão permanece em destino_confirmado — nenhuma escrita de transição
    // aconteceu (rollback da transação Prisma ao lançar ContaNecessariaError).
    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stored.flowState).toBe("destino_confirmado");
    expect(stored.status).toBe("in_progress");

    // A DestinationApproval já gravada anteriormente não é desfeita.
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
    const session = await createSessionAtDestinoConfirmado({
      type: "anonymous",
      anonSessionId: ANON_ID,
    });
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
