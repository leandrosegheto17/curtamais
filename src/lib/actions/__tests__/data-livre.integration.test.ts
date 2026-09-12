// @vitest-environment node
//
// L6-T03 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/session-flow/__tests__/persistence.integration.test.ts`, L4-T02):
// prova que `submeterDataLivre` de fato cria a `TripSession`, avança o
// `flowState` via `@/lib/session-flow` e persiste `DestinationApproval`
// quando um destino é informado, cobrindo o critério de aceite de L6-T03
// (RF-01.2/.3).
// L11-T02a (ADR-008): `submeterDataLivre` agora resolve o dono da sessão via
// `resolveSessionOwner` (`getServerSession`/cookie anônimo), que exige um
// contexto de requisição real do Next.js indisponível ao chamar a Server
// Action diretamente num teste — `next-auth`/`next/headers` são mockados
// para simular os dois fluxos (mesmo padrão de mock já usado no projeto,
// ver `resolve-session-owner.test.ts`). Sem sessão autenticada mockada
// (`getServerSessionMock` resolve `null` por padrão), os testes pré-
// existentes seguem cobrindo o caminho anônimo, mais representativo do
// caminho principal do produto (RF-01/02/03 não exigem conta).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { submeterDataLivre } from "@/lib/actions/data-livre";
import { InvalidDataLivreInputError } from "@/lib/actions/data-livre-errors";
import { InvalidDestinoLengthError } from "@/lib/actions/destino-length-error";

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

const ANON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("submeterDataLivre — integração real com Postgres (L6-T03)", () => {
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

  it("sem destino: cria a sessão e avança para destino_pendente (RF-01.2)", async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-11-10",
      dataFinal: "2026-11-15",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("destino");
    expect(result.flowState).toBe("destino_pendente");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.entryPath).toBe("data_livre");
    expect(stored.flowState).toBe("destino_pendente");
    expect(stored.status).toBe("in_progress");
    expect(stored.dateRangeStart?.toISOString().slice(0, 10)).toBe(
      "2026-11-10",
    );
    expect(stored.dateRangeEnd.toISOString().slice(0, 10)).toBe("2026-11-15");

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();

    // ADR-008/L11-T02a: fluxo anônimo grava anon_session_id, nunca user_id.
    expect(stored.anonSessionId).toBe(ANON_ID);
    expect(stored.userId).toBeNull();
  });

  it("com usuário autenticado: cria a sessão gravando user_id (nunca anon_session_id), mesmo com cookie anônimo presente (ADR-008)", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "user-abc-123" } });

    const result = await submeterDataLivre({
      dataInicial: "2026-11-10",
      dataFinal: "2026-11-15",
    });
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.userId).toBe("user-abc-123");
    expect(stored.anonSessionId).toBeNull();
  });

  it('destino em branco (só espaços) é tratado como "sem destino" (RF-01.2)', async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-11-10",
      dataFinal: "2026-11-15",
      destino: "   ",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("destino");
  });

  it("com destino: aprova direto (source=user_provided) e avança para destino_confirmado (RF-01.3/RF-11)", async () => {
    const result = await submeterDataLivre({
      dataInicial: "2026-12-01",
      dataFinal: "2026-12-10",
      destino: "  Foz do Iguaçu  ",
    });
    sessionIds.push(result.sessionId);

    expect(result.proximaEtapa).toBe("confirmacao_destino");
    expect(result.flowState).toBe("destino_confirmado");
    if (result.proximaEtapa === "confirmacao_destino") {
      // Trim aplicado no servidor (RF-01.3 revalidada, não confia só no client).
      expect(result.destino).toBe("Foz do Iguaçu");
    }

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.flowState).toBe("destino_confirmado");

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });
    expect(destination.name).toBe("Foz do Iguaçu");
    expect(destination.source).toBe("user_provided");
    expect(destination.justification).toBeNull();
    expect(destination.priceRangeMin.toNumber()).toBe(0);
    expect(destination.priceRangeMax.toNumber()).toBe(0);
  });

  it("RF-01.4 revalidado no servidor: data final < data inicial rejeita sem criar sessão", async () => {
    const countBefore = await prisma.tripSession.count();

    await expect(
      submeterDataLivre({
        dataInicial: "2026-12-10",
        dataFinal: "2026-12-01",
      }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    const countAfter = await prisma.tripSession.count();
    expect(countAfter).toBe(countBefore);
  });

  it("rejeita datas ausentes/malformadas sem criar sessão", async () => {
    const countBefore = await prisma.tripSession.count();

    await expect(
      submeterDataLivre({ dataInicial: "", dataFinal: "2026-12-01" }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    await expect(
      submeterDataLivre({
        dataInicial: "10/12/2026",
        dataFinal: "2026-12-15",
      }),
    ).rejects.toBeInstanceOf(InvalidDataLivreInputError);

    const countAfter = await prisma.tripSession.count();
    expect(countAfter).toBe(countBefore);
  });

  it("RL6-T01: destino além do limite de tamanho é REJEITADO (não truncado), sem criar sessão", async () => {
    const longDestino = "a".repeat(500);

    // Validação do tamanho do destino ocorre antes de qualquer acesso ao
    // banco (mesmo padrão dos testes acima de datas ausentes/malformadas) —
    // não depende de Postgres disponível.
    await expect(
      submeterDataLivre({
        dataInicial: "2027-01-05",
        dataFinal: "2027-01-10",
        destino: longDestino,
      }),
    ).rejects.toBeInstanceOf(InvalidDestinoLengthError);
  });
});
