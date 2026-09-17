// @vitest-environment node
//
// Teste de integração leve contra Postgres real (mesmo padrão de
// prisma/__tests__/schema.integration.test.ts), cobrindo o critério de
// aceite "criar conta associa user_id" de L1-T03, estendido por V2-L7-T01
// (ADR-012/RNF-13) com os critérios de consentimento.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { CONSENTIMENTO_VERSAO } from "@/lib/consentimento";
import {
  ConsentimentoAusenteError,
  createUserAccount,
  EmailAlreadyInUseError,
  InvalidAccountInputError,
} from "@/lib/user-account";

describe("createUserAccount — integração real com Postgres (L1-T03, V2-L7-T01)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("cria a conta, grava consentimento com relógio do servidor e retorna um userId utilizável", async () => {
    const before = new Date();
    const account = await createUserAccount({
      email: `executor-l1t03-${Date.now()}@example.com`,
      password: "senha-segura-123",
      name: "Executor de Teste",
      consentimento: true,
    });
    createdUserIds.push(account.id);
    const after = new Date();

    expect(account.id).toBeTruthy();

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
    });

    // A senha nunca é persistida em texto plano — só o hash.
    expect(stored.passwordHash).not.toBe("senha-segura-123");
    expect(stored.passwordHash).toBeTruthy();
    expect(
      await verifyPassword("senha-segura-123", stored.passwordHash as string),
    ).toBe(true);

    // ADR-012: `privacyConsentAt`/`privacyConsentVersion` gravados com o
    // relógio do servidor (dentro da janela de execução do teste) e a
    // versão do texto vigente — nunca um valor vindo do input (que nem
    // aceita timestamp nenhum).
    expect(stored.privacyConsentAt).not.toBeNull();
    const consentAt = stored.privacyConsentAt as Date;
    expect(consentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(consentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(stored.privacyConsentVersion).toBe(CONSENTIMENTO_VERSAO);
  });

  it("não grava nada quando consentimento não é true (ConsentimentoAusenteError)", async () => {
    const email = `executor-v2l7t01-sem-consentimento-${Date.now()}@example.com`;

    await expect(
      createUserAccount({
        email,
        password: "senha-segura-123",
        consentimento: false,
      }),
    ).rejects.toBeInstanceOf(ConsentimentoAusenteError);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toBeNull();
  });

  it("rejeita e-mail duplicado (EmailAlreadyInUseError)", async () => {
    const email = `executor-l1t03-dup-${Date.now()}@example.com`;
    const first = await createUserAccount({
      email,
      password: "senha-segura-123",
      consentimento: true,
    });
    createdUserIds.push(first.id);

    await expect(
      createUserAccount({
        email,
        password: "outra-senha-123",
        consentimento: true,
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  it("rejeita e-mail/senha inválidos antes de tocar o banco (InvalidAccountInputError)", async () => {
    await expect(
      createUserAccount({
        email: "nao-e-email",
        password: "senha-segura-123",
        consentimento: true,
      }),
    ).rejects.toBeInstanceOf(InvalidAccountInputError);

    await expect(
      createUserAccount({
        email: "valido@example.com",
        password: "curta",
        consentimento: true,
      }),
    ).rejects.toBeInstanceOf(InvalidAccountInputError);
  });
});
