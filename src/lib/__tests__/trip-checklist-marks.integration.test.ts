// @vitest-environment node
//
// V2-L9-T01 — integração real com Postgres (ADR-013 §5): UNIQUE, cascata e
// preservação de trip_sessions.updated_at ao gravar marca.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const criadas: string[] = [];

async function criarSessao() {
  const s = await prisma.tripSession.create({
    data: { anonSessionId: `anon-l9t01-${Date.now()}-${Math.random()}`, entryPath: "data_livre", dateRangeEnd: new Date("2026-12-20") },
  });
  criadas.push(s.id);
  return s;
}

afterAll(async () => {
  await prisma.tripSession.deleteMany({ where: { id: { in: criadas } } });
  await prisma.$disconnect();
});

describe("TripChecklistMark (V2-L9-T01)", () => {
  it("UNIQUE(session_id,item_key) rejeita duplicata", async () => {
    const s = await criarSessao();
    await prisma.tripChecklistMark.create({ data: { sessionId: s.id, itemKey: "documentos.rg-ou-cnh", checked: true } });
    await expect(
      prisma.tripChecklistMark.create({ data: { sessionId: s.id, itemKey: "documentos.rg-ou-cnh", checked: false } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("apagar a TripSession remove as marcas (cascata)", async () => {
    const s = await criarSessao();
    await prisma.tripChecklistMark.create({ data: { sessionId: s.id, itemKey: "clima.agasalho-pesado", checked: true } });
    await prisma.tripSession.delete({ where: { id: s.id } });
    expect(await prisma.tripChecklistMark.count({ where: { sessionId: s.id } })).toBe(0);
  });

  it("inserir/atualizar marca não altera trip_sessions.updated_at", async () => {
    const s = await criarSessao();
    await prisma.tripChecklistMark.upsert({
      where: { sessionId_itemKey: { sessionId: s.id, itemKey: "antes.pet" } },
      create: { sessionId: s.id, itemKey: "antes.pet", checked: true },
      update: { checked: true },
    });
    await prisma.tripChecklistMark.upsert({
      where: { sessionId_itemKey: { sessionId: s.id, itemKey: "antes.pet" } },
      create: { sessionId: s.id, itemKey: "antes.pet", checked: true },
      update: { checked: false },
    });
    const depois = await prisma.tripSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(depois.updatedAt.getTime()).toBe(s.updatedAt.getTime());
  });

  it("não há colunas de texto livre nem user_id na tabela", async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'trip_checklist_marks' ORDER BY column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(["checked", "id", "item_key", "session_id", "updated_at"]);
  });
});
