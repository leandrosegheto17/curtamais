import { describe, expect, it } from "vitest";

import { resolveRetorno, RETORNO_ALLOWLIST, RETORNO_PADRAO } from "@/lib/auth/retorno-allowlist";

describe("resolveRetorno (V2-L7-T05, proteção contra open redirect)", () => {
  it.each(RETORNO_ALLOWLIST)(
    "aceita o destino permitido %s",
    (destino) => {
      expect(resolveRetorno(destino)).toBe(destino);
    },
  );

  it("cai em '/' quando `retorno` está ausente", () => {
    expect(resolveRetorno(undefined)).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para URL absoluta (open redirect)", () => {
    expect(resolveRetorno("https://evil.com")).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para protocolo javascript:", () => {
    expect(resolveRetorno("javascript:alert(1)")).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para prefixo malicioso (bypass tipo /meus-roteiros-evil.com)", () => {
    expect(resolveRetorno("/meus-roteiros-evil.com")).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para caminho com barra dupla (protocol-relative)", () => {
    expect(resolveRetorno("//evil.com")).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para caminho com querystring/hash anexados (comparação é exata)", () => {
    expect(resolveRetorno("/meus-roteiros?x=1")).toBe(RETORNO_PADRAO);
  });

  it("cai em '/' para caminho fora da allowlist mas plausível", () => {
    expect(resolveRetorno("/admin")).toBe(RETORNO_PADRAO);
  });
});
