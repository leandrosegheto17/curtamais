// @vitest-environment node
//
// L6-T05 — Teste de integração real com Postgres (mesmo padrão de
// `src/lib/session-flow/__tests__/persistence.integration.test.ts`),
// cobrindo o critério de aceite de `processarFeriadoEscolhido` (RF-02.3):
// o range resultante (feriado + emenda) segue a MESMA ramificação de
// RF-01.2/RF-01.3 conforme destino informado ou não, e o range gravado bate
// com o cálculo determinístico de `src/lib/holidays.ts`.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { processarFeriadoEscolhido } from "@/lib/actions/feriados";
import { InvalidHolidaySelectionError } from "@/lib/actions/feriados-errors";
import { getNationalHolidaysWithBridgeInRange } from "@/lib/holidays";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("processarFeriadoEscolhido — integração real com Postgres (L6-T05, RF-02.3)", () => {
  const sessionIds: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await prisma.tripSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.$disconnect();
  });

  it("sem destino: cria TripSession com entryPath=feriado, range da emenda, e fica em destino_pendente (RF-01.2)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);
    const thursdayHoliday = pure.find((h) => h.bridge.weekday === "thursday");
    expect(thursdayHoliday).toBeDefined();

    const result = await processarFeriadoEscolhido({
      holidayDate: thursdayHoliday!.date.toISOString(),
    });
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_pendente");

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(stored.entryPath).toBe("feriado");
    expect(iso(stored.dateRangeStart!)).toBe(iso(thursdayHoliday!.bridge.rangeStart));
    expect(iso(stored.dateRangeEnd)).toBe(iso(thursdayHoliday!.bridge.rangeEnd));

    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();
  });

  it("com destino: registra DestinationApproval (user_provided) e avança para destino_confirmado (RF-01.3/RF-11)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);
    const thursdayHoliday = pure.find((h) => h.bridge.weekday === "thursday");
    expect(thursdayHoliday).toBeDefined();

    const result = await processarFeriadoEscolhido({
      holidayDate: thursdayHoliday!.date.toISOString(),
      destino: "  Gramado, RS  ",
    });
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_confirmado");

    const destination = await prisma.destinationApproval.findUniqueOrThrow({
      where: { sessionId: result.sessionId },
    });
    expect(destination.name).toBe("Gramado, RS");
    expect(destination.source).toBe("user_provided");
    expect(destination.justification).toBeNull();

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(iso(stored.dateRangeStart!)).toBe(iso(thursdayHoliday!.bridge.rangeStart));
    expect(iso(stored.dateRangeEnd)).toBe(iso(thursdayHoliday!.bridge.rangeEnd));
  });

  it("destino em branco (só espaços) é tratado como ausência de destino (RF-01.2)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);
    const mondayOrAnyHoliday = pure[0];

    const result = await processarFeriadoEscolhido({
      holidayDate: mondayOrAnyHoliday.date.toISOString(),
      destino: "   ",
    });
    sessionIds.push(result.sessionId);

    expect(result.flowState).toBe("destino_pendente");
    const destination = await prisma.destinationApproval.findUnique({
      where: { sessionId: result.sessionId },
    });
    expect(destination).toBeNull();
  });

  it("calcula o range real a partir do feriado + emenda (não do dia isolado do feriado)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);
    // Feriado com emenda de mais de 1 dia (ex.: quinta ou segunda-feira),
    // para garantir que o range gravado não é só o dia do feriado.
    const holidayWithBridge = pure.find((h) => h.bridge.totalDays > 1);
    expect(holidayWithBridge).toBeDefined();

    const result = await processarFeriadoEscolhido({
      holidayDate: holidayWithBridge!.date.toISOString(),
    });
    sessionIds.push(result.sessionId);

    const stored = await prisma.tripSession.findUniqueOrThrow({
      where: { id: result.sessionId },
    });
    expect(iso(stored.dateRangeStart!)).toBe(
      iso(holidayWithBridge!.bridge.rangeStart),
    );
    expect(iso(stored.dateRangeEnd)).toBe(iso(holidayWithBridge!.bridge.rangeEnd));
    // O range gravado cobre mais de 1 dia (a emenda), não só o dia isolado
    // do feriado — pelo menos uma das pontas diverge da data do feriado.
    const startDiffersFromHoliday =
      iso(stored.dateRangeStart!) !== iso(holidayWithBridge!.date);
    const endDiffersFromHoliday =
      iso(stored.dateRangeEnd) !== iso(holidayWithBridge!.date);
    expect(startDiffersFromHoliday || endDiffersFromHoliday).toBe(true);
  });

  it("rejeita uma data que não corresponde a nenhum feriado conhecido, sem criar sessão", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const bogusDate = new Date(Date.UTC(2026, 5, 15)).toISOString(); // não é feriado nacional

    await expect(
      processarFeriadoEscolhido({ holidayDate: bogusDate }),
    ).rejects.toBeInstanceOf(InvalidHolidaySelectionError);
  });

  it("rejeita uma string de data inválida, sem criar sessão", async () => {
    await expect(
      processarFeriadoEscolhido({ holidayDate: "não-é-uma-data" }),
    ).rejects.toBeInstanceOf(InvalidHolidaySelectionError);
  });

  it("rejeita destino acima do tamanho máximo permitido, sem criar sessão", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    const pure = getNationalHolidaysWithBridgeInRange(2026, 2027);
    const holiday = pure[0];

    await expect(
      processarFeriadoEscolhido({
        holidayDate: holiday.date.toISOString(),
        destino: "a".repeat(201),
      }),
    ).rejects.toThrow(/tamanho máximo/);
  });
});
