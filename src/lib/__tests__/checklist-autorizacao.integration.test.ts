// @vitest-environment node
//
// V2-L9-T16 — integração real com Postgres: autorização (B não marca a
// sessão de A), cascata na exclusão de conta, ordem de "Meus roteiros"
// preservada ao marcar e leitura do estado gravado. Só a identidade da
// requisição é controlada (mock de `resolveRequestIdentity`); guard, ações e
// Prisma são os reais.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const identidade = vi.hoisted(() => ({
  atual: { userId: null as string | null, anonSessionId: null as string | null },
}));
vi.mock("@/lib/actions/resolve-request-identity", () => ({
  resolveRequestIdentity: async () => identidade.atual,
}));

import { prisma } from "@/lib/prisma";
import { deleteUserAccount } from "@/lib/account-deletion";
import { SessionNotFoundError } from "@/lib/session-flow";
import { marcarItemChecklist, obterChecklist } from "@/lib/actions/checklist";
import { listarMeusRoteiros } from "@/lib/actions/meus-roteiros";

const usuarios: string[] = [];
const rand = () => `${Date.now()}-${Math.random()}`;

async function criarUsuario() {
  const u = await prisma.user.create({
    data: { email: `executor-l9t16-${rand()}@example.com` },
  });
  usuarios.push(u.id);
  return u;
}

async function criarSessaoConcluida(userId: string) {
  const s = await prisma.tripSession.create({
    data: {
      userId,
      entryPath: "data_livre",
      flowState: "concluida",
      dateRangeStart: new Date("2026-07-10"),
      dateRangeEnd: new Date("2026-07-14"),
    },
  });
  await prisma.destinationApproval.create({
    data: {
      sessionId: s.id,
      name: "Gramado",
      priceRangeMin: "800.00",
      priceRangeMax: "1500.00",
      source: "ia_suggested",
      approvedAt: new Date(),
    },
  });
  return s;
}

const comoUsuario = (userId: string) => {
  identidade.atual = { userId, anonSessionId: null };
};

beforeEach(() => {
  identidade.atual = { userId: null, anonSessionId: null };
});

afterAll(async () => {
  await prisma.tripSession.deleteMany({ where: { userId: { in: usuarios } } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.$disconnect();
});

describe("Checklist: autorização, cascata e ordem (V2-L9-T16)", () => {
  it("usuário B não marca item da sessão de A: recusa e nenhuma linha criada", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const sessao = await criarSessaoConcluida(a.id);

    comoUsuario(b.id);
    await expect(
      marcarItemChecklist(sessao.id, "documentos.cpf", true),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(obterChecklist(sessao.id)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );

    expect(
      await prisma.tripChecklistMark.count({ where: { sessionId: sessao.id } }),
    ).toBe(0);
  });

  it("excluir a conta remove as marcas do usuário", async () => {
    const u = await criarUsuario();
    const s1 = await criarSessaoConcluida(u.id);
    const s2 = await criarSessaoConcluida(u.id);
    comoUsuario(u.id);
    await marcarItemChecklist(s1.id, "documentos.cpf", true);
    await marcarItemChecklist(s2.id, "documentos.rg-ou-cnh", true);

    const ids = [s1.id, s2.id];
    expect(
      await prisma.tripChecklistMark.count({ where: { sessionId: { in: ids } } }),
    ).toBe(2);

    await deleteUserAccount(u.id);

    expect(
      await prisma.tripChecklistMark.count({ where: { sessionId: { in: ids } } }),
    ).toBe(0);
    expect(await prisma.tripSession.count({ where: { id: { in: ids } } })).toBe(0);
  });

  it("marcar não muda a ordem de 'Meus roteiros' nem o estado da sessão", async () => {
    const u = await criarUsuario();
    const antiga = await criarSessaoConcluida(u.id);
    const nova = await criarSessaoConcluida(u.id);
    comoUsuario(u.id);

    const antes = await listarMeusRoteiros();
    if (antes.status !== "ok") throw new Error("esperava status ok");
    const ordemAntes = antes.sessoes.map((s) => s.id);
    expect(ordemAntes).toEqual([nova.id, antiga.id]);

    // Marca na sessão mais antiga: se mexesse em updatedAt, ela subiria.
    await marcarItemChecklist(antiga.id, "documentos.cpf", true);

    const depois = await listarMeusRoteiros();
    if (depois.status !== "ok") throw new Error("esperava status ok");
    expect(depois.sessoes.map((s) => s.id)).toEqual(ordemAntes);
    expect(depois.sessoes.map((s) => s.rotulo)).toEqual(
      antes.sessoes.map((s) => s.rotulo),
    );
    const reler = await prisma.tripSession.findUniqueOrThrow({
      where: { id: antiga.id },
    });
    expect(reler.flowState).toBe("concluida");
    expect(reler.updatedAt.getTime()).toBe(antiga.updatedAt.getTime());
  });

  it("marcar 3 itens e reler devolve os 3 marcados; só itemKey é gravado", async () => {
    const u = await criarUsuario();
    const s = await criarSessaoConcluida(u.id);
    comoUsuario(u.id);

    const chaves = [
      "documentos.cpf",
      "documentos.rg-ou-cnh",
      "documentos.dinheiro-e-cartoes",
    ];
    for (const k of chaves) {
      expect(await marcarItemChecklist(s.id, k, true)).toMatchObject({
        status: "ok",
      });
    }

    const r = await obterChecklist(s.id);
    if (r.status !== "ok") throw new Error("esperava status ok");
    expect(r.itens.filter((i) => i.marcado).map((i) => i.itemKey).sort()).toEqual(
      [...chaves].sort(),
    );

    const linhas = await prisma.tripChecklistMark.findMany({
      where: { sessionId: s.id },
    });
    expect(linhas).toHaveLength(3);
    for (const l of linhas) {
      expect(Object.keys(l).sort()).toEqual([
        "checked",
        "id",
        "itemKey",
        "sessionId",
        "updatedAt",
      ]);
      expect(chaves).toContain(l.itemKey);
    }
  });
});
