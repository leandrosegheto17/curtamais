// V2-L9-T08 — teste unitário com Prisma e session-flow mockados. Nenhum mock de
// `@/lib/gateway-ia`/`llmGenerationLog`: se a ação os tocasse, falharia.
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();
const marksFindManyMock = vi.fn();
const assertMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tripSession: { findUnique: (...a: unknown[]) => findUniqueMock(...a) },
    tripChecklistMark: { findMany: (...a: unknown[]) => marksFindManyMock(...a) },
  },
}));

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

import { obterChecklist } from "@/lib/actions/checklist";

const ID = "11111111-1111-4111-8111-111111111111";
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
  findUniqueMock.mockReset();
  marksFindManyMock.mockReset().mockResolvedValue([]);
  assertMock.mockReset().mockResolvedValue(undefined);
});

describe("obterChecklist (V2-L9-T08)", () => {
  it("dono de sessão concluída recebe a lista com o estado gravado", async () => {
    findUniqueMock.mockResolvedValue(sessao());
    const base = await obterChecklist(ID);
    if (base.status !== "ok") throw new Error("esperava ok");
    expect(base.itens.length).toBeGreaterThan(0);
    expect(base.itens.every((i) => i.marcado === false)).toBe(true);

    const chave = base.itens[0].itemKey;
    marksFindManyMock.mockResolvedValue([{ itemKey: chave, checked: true }]);
    const r = await obterChecklist(ID);
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.itens.find((i) => i.itemKey === chave)?.marcado).toBe(true);
    expect(assertMock).toHaveBeenCalledWith(ID, expect.anything(), {
      exigeConta: true,
    });
  });

  it("inexistente ou não dono: SessionNotFoundError", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(obterChecklist(ID)).rejects.toBeInstanceOf(NotFound);

    findUniqueMock.mockResolvedValue(sessao());
    assertMock.mockRejectedValue(new NotFound());
    await expect(obterChecklist(ID)).rejects.toBeInstanceOf(NotFound);
    expect(marksFindManyMock).not.toHaveBeenCalled();
  });

  it.each(["encerrada_parcial", "roteiro_aprovado", "entrada_selecionada"])(
    "flowState %s -> indisponivel",
    async (flowState) => {
      findUniqueMock.mockResolvedValue(sessao({ flowState }));
      expect(await obterChecklist(ID)).toEqual({ status: "indisponivel" });
      expect(marksFindManyMock).not.toHaveBeenCalled();
    },
  );

  it("marca obsoleta é ignorada; chave nova vem marcado:false", async () => {
    findUniqueMock.mockResolvedValue(sessao());
    marksFindManyMock.mockResolvedValue([
      { itemKey: "documentos.item-que-nao-existe-mais", checked: true },
    ]);
    const r = await obterChecklist(ID);
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(
      r.itens.some((i) => i.itemKey === "documentos.item-que-nao-existe-mais"),
    ).toBe(false);
    expect(r.itens.every((i) => i.marcado === false)).toBe(true);
  });

  it("sem conta: resultado discriminado conta_necessaria, sem exceção", async () => {
    findUniqueMock.mockResolvedValue(sessao({ userId: null }));
    assertMock.mockRejectedValue(new ContaNec());
    expect(await obterChecklist(ID)).toEqual({
      status: "conta_necessaria",
      sessionId: ID,
    });
  });
});
