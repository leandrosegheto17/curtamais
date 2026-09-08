// @vitest-environment node
//
// Teste de integração leve contra Postgres real (mesmo padrão de
// prisma/__tests__/schema.integration.test.ts), cobrindo o critério de
// aceite "criar conta associa user_id" de L1-T03.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  createUserAccount,
  EmailAlreadyInUseError,
  InvalidAccountInputError,
} from "@/lib/user-account";

describe("createUserAccount — integração real com Postgres (L1-T03)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("cria a conta e retorna um userId utilizável (associação user_id)", async () => {
    const account = await createUserAccount({
      email: `executor-l1t03-${Date.now()}@example.com`,
      password: "senha-segura-123",
      name: "Executor de Teste",
    });
    createdUserIds.push(account.id);

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
  });

  it("rejeita e-mail duplicado (EmailAlreadyInUseError)", async () => {
    const email = `executor-l1t03-dup-${Date.now()}@example.com`;
    const first = await createUserAccount({
      email,
      password: "senha-segura-123",
    });
    createdUserIds.push(first.id);

    await expect(
      createUserAccount({ email, password: "outra-senha-123" }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  it("rejeita e-mail/senha inválidos antes de tocar o banco (InvalidAccountInputError)", async () => {
    await expect(
      createUserAccount({ email: "nao-e-email", password: "senha-segura-123" }),
    ).rejects.toBeInstanceOf(InvalidAccountInputError);

    await expect(
      createUserAccount({ email: "valido@example.com", password: "curta" }),
    ).rejects.toBeInstanceOf(InvalidAccountInputError);
  });
});
