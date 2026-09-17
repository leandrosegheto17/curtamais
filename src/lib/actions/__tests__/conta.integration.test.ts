// @vitest-environment node
//
// V2-L7-T01 (RF-16, RNF-13, ADR-012) — testes de integração da Server
// Action `criarConta` contra Postgres real, mesmo padrão de
// `src/lib/__tests__/user-account.integration.test.ts`.
//
// V2-L7-T08 — `criarConta` passou a ler `headers()` (rate limit por IP,
// SDD.md §8.7); mockado aqui no mesmo padrão de
// `destino.integration.test.ts`/`data-livre.integration.test.ts` (Next
// dynamic APIs não funcionam fora de uma requisição real).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerGetMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (...args: unknown[]) => headerGetMock(...args),
  }),
}));

import { prisma } from "@/lib/prisma";
import { CONSENTIMENTO_VERSAO } from "@/lib/consentimento";
import { criarConta } from "@/lib/actions/conta";
import { resetAuthRateLimitersForTests } from "@/lib/auth-rate-limit";

describe("criarConta — integração real com Postgres (V2-L7-T01)", () => {
  const createdUserIds: string[] = [];
  let ipCounter = 0;

  // V2-L7-T08 — cada teste usa um IP distinto (não é o alvo do rate limit
  // aqui, ver `conta-rate-limit.test.ts`) para que os vários `criarConta`
  // deste arquivo nunca se acumulem no mesmo contador de 5/10min.
  beforeEach(() => {
    ipCounter += 1;
    headerGetMock.mockReturnValue(`203.0.113.${ipCounter}`);
  });

  afterEach(() => {
    resetAuthRateLimitersForTests();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("sem consentimento === true não grava nada e devolve erro discriminado", async () => {
    const email = `executor-v2l7t01-acao-sem-consentimento-${Date.now()}@example.com`;

    const result = await criarConta({
      email,
      senha: "senha-segura-123",
      consentimento: false,
    });

    expect(result).toMatchObject({ status: "erro", campo: "consentimento" });

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toBeNull();
  });

  it("também rejeita consentimento ausente/undefined, sem gravar nada", async () => {
    const email = `executor-v2l7t01-acao-consentimento-ausente-${Date.now()}@example.com`;

    const result = await criarConta({
      email,
      senha: "senha-segura-123",
      // @ts-expect-error — simula payload adulterado/ausente vindo do cliente.
      consentimento: undefined,
    });

    expect(result).toMatchObject({ status: "erro", campo: "consentimento" });

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toBeNull();
  });

  it("rejeita senha com menos de 8 caracteres", async () => {
    const email = `executor-v2l7t01-acao-senha-curta-${Date.now()}@example.com`;

    const result = await criarConta({
      email,
      senha: "curta",
      consentimento: true,
    });

    expect(result.status).toBe("erro");
    expect(result).toMatchObject({ status: "erro", campo: "senha" });

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toBeNull();
  });

  it("e-mail duplicado devolve erro amigável, sem vazar detalhe do Prisma (P2002)", async () => {
    const email = `executor-v2l7t01-acao-duplicado-${Date.now()}@example.com`;

    const first = await criarConta({
      email,
      senha: "senha-segura-123",
      consentimento: true,
    });
    expect(first.status).toBe("sucesso");
    if (first.status === "sucesso") {
      createdUserIds.push(first.userId);
    }

    const second = await criarConta({
      email,
      senha: "outra-senha-123",
      consentimento: true,
    });

    expect(second).toEqual({
      status: "erro",
      campo: "email",
      mensagem: "E-mail já cadastrado.",
    });
    // Garantia explícita: nenhum vestígio de erro interno do Prisma (nome
    // da constraint, código P2002, etc.) vaza na mensagem.
    if (second.status === "erro" && second.campo === "email") {
      expect(second.mensagem).not.toMatch(/prisma|p2002|constraint/i);
    }
  });

  it("sucesso grava privacyConsentAt com o relógio do servidor (ignora timestamp injetado no input) e privacyConsentVersion", async () => {
    const email = `executor-v2l7t01-acao-sucesso-${Date.now()}@example.com`;
    const before = new Date();

    const result = await criarConta({
      email,
      senha: "senha-segura-123",
      consentimento: true,
      // @ts-expect-error — `CriarContaInput` não tem campo de timestamp;
      // simula uma tentativa de payload adulterado tentando injetar uma
      // data arbitrária vinda do cliente, que deve ser ignorada.
      privacyConsentAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    const after = new Date();

    expect(result.status).toBe("sucesso");
    if (result.status !== "sucesso") return;
    createdUserIds.push(result.userId);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });

    expect(stored.privacyConsentAt).not.toBeNull();
    const consentAt = stored.privacyConsentAt as Date;
    expect(consentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(consentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(stored.privacyConsentVersion).toBe(CONSENTIMENTO_VERSAO);
  });
});
