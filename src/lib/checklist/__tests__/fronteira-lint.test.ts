// @vitest-environment node
// V2-L9-T02 — a regra no-restricted-imports de src/lib/checklist/** bloqueia
// Prisma, Gateway de IA, stage-rules, openai e next/* (ADR-013 decisão 1).
// eslint não traz tipos neste projeto (sem @types/eslint).
// @ts-expect-error TS7016
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });
const arquivo = "src/lib/checklist/regra.ts";

async function lint(codigo: string) {
  const [r] = await eslint.lintText(codigo, { filePath: arquivo });
  return r.messages.filter((m: { ruleId?: string | null }) => m.ruleId?.includes("no-restricted-imports"));
}

describe("fronteira do módulo checklist", () => {
  it.each([
    'import { prisma } from "@/lib/prisma";\nexport const a = prisma;\n',
    'import { x } from "@/lib/gateway-ia";\nexport const a = x;\n',
    'import { x } from "@/lib/stage-rules";\nexport const a = x;\n',
    'import { x } from "openai";\nexport const a = x;\n',
    'import { headers } from "next/headers";\nexport const a = headers;\n',
  ])("bloqueia import proibido: %s", async (codigo) => {
    expect((await lint(codigo)).length).toBeGreaterThan(0);
  });

  it("permite import relativo do próprio módulo", async () => {
    const m = await lint('import type { Estacao } from "./tipos";\nexport type A = Estacao;\n');
    expect(m).toHaveLength(0);
  });
});
