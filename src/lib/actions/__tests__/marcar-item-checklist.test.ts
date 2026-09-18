// V2-L9-T09 — teste unitário de `marcarItemChecklist` (Postgres real
// indisponível; mocks de `@/lib/prisma` e `@/lib/session-flow`). Nenhum mock
// de Gateway de IA é registrado: se a ação o importasse, o teste falharia.
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const sessionUpdateMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tripSession: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      update: (...a: unknown[]) => sessionUpdateMock(...a),
    },
    tripChecklistMark: { upsert: (...a: unknown[]) => upsertMock(...a) },
  },
}));

const assertMock = vi.fn();
const { NotFound, ContaNec } = vi.hoisted(() => {
  class NotFound extends Error {}
  class ContaNec extends Error {}
  return { NotFound, ContaNec };
});
vi.mock("@/lib/session-flow", () => ({
  assertSessionAccess: (...a: unknown[]) => assertMock(...a),
  ContaNecessariaError: ContaNec,
  SessionNotFoundError: NotFound,
}));

import { marcarItemChecklist } from "@/lib/actions/checklist";

const SID = "11111111-1111-4111-8111-111111111111";
const sessao = (over: Record<string, unknown> = {}) => ({
  userId: "u1",
  anonSessionId: null,
  flowState: "concluida",
  dateRangeStart: new Date("2026-07-10"),
  dateRangeEnd: new Date("2026-07-14"),
  destinationApproval: { name: "Gramado" },
  ...over,
});

beforeEach(() => {
  findUniqueMock.mockReset().mockResolvedValue(sessao());
  upsertMock.mockReset().mockResolvedValue({});
  sessionUpdateMock.mockReset();
  assertMock.mockReset().mockResolvedValue(undefined);
});

describe("marcarItemChecklist (V2-L9-T09)", () => {
  it("marca e repete: upsert idempotente sobre a mesma chave única", async () => {
    const r1 = await marcarItemChecklist(SID, "documentos.cpf", true);
    const r2 = await marcarItemChecklist(SID, "documentos.cpf", true);
    expect(r1).toEqual({ status: "ok", itemKey: "documentos.cpf", marcado: true });
    expect(r2).toEqual(r1);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    for (const [arg] of upsertMock.mock.calls) {
      expect(arg.where).toEqual({
        sessionId_itemKey: { sessionId: SID, itemKey: "documentos.cpf" },
      });
    }
  });

  it("desmarcar grava checked=false; grava só sessionId/itemKey/checked", async () => {
    await marcarItemChecklist(SID, "documentos.cpf", false);
    const arg = upsertMock.mock.calls[0][0];
    expect(arg.create).toEqual({
      sessionId: SID,
      itemKey: "documentos.cpf",
      checked: false,
    });
    expect(arg.update).toEqual({ checked: false });
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });

  it.each(["Documentos.CPF", "documentos..cpf", "item com espaço", "", "x".repeat(70)])(
    "itemKey malformada %j -> item_invalido, nada gravado",
    async (k) => {
      expect(await marcarItemChecklist(SID, k, true)).toEqual({
        status: "item_invalido",
      });
      expect(upsertMock).not.toHaveBeenCalled();
    },
  );

  it("itemKey bem formada mas fora da lista -> item_invalido, nada gravado", async () => {
    expect(await marcarItemChecklist(SID, "documentos.nao-existe", true)).toEqual({
      status: "item_invalido",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("sessão inexistente ou conta não dona -> SessionNotFoundError, nada gravado", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(marcarItemChecklist(SID, "documentos.cpf", true)).rejects.toBeInstanceOf(NotFound);
    findUniqueMock.mockResolvedValue(sessao());
    assertMock.mockRejectedValue(new NotFound("x"));
    await expect(marcarItemChecklist(SID, "documentos.cpf", true)).rejects.toBeInstanceOf(NotFound);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("sessão não concluída -> recusa sem gravar", async () => {
    findUniqueMock.mockResolvedValue(sessao({ flowState: "encerrada_parcial" }));
    expect(await marcarItemChecklist(SID, "documentos.cpf", true)).toEqual({
      status: "indisponivel",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("sem conta -> conta_necessaria discriminado, nada gravado", async () => {
    assertMock.mockRejectedValue(new ContaNec("x"));
    expect(await marcarItemChecklist(SID, "documentos.cpf", true)).toEqual({
      status: "conta_necessaria",
      sessionId: SID,
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("exige conta no guard", async () => {
    await marcarItemChecklist(SID, "documentos.cpf", true);
    expect(assertMock.mock.calls[0][2]).toEqual({ exigeConta: true });
  });
});
