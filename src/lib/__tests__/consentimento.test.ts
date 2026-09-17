// ADR-012 — "Mudar o texto exige mudar a versão (verificado por teste com
// snapshot do texto por versão)". Este teste falha sempre que
// `CONSENTIMENTO_TEXTO` mudar sem que `CONSENTIMENTO_VERSAO` também mude —
// forçando quem editar o texto a atualizar o snapshot E a versão juntos.
import { describe, expect, it } from "vitest";
import { CONSENTIMENTO_TEXTO, CONSENTIMENTO_VERSAO } from "@/lib/consentimento";

describe("consentimento (ADR-012)", () => {
  it("mantém texto e versão emparelhados (snapshot)", () => {
    expect({ versao: CONSENTIMENTO_VERSAO, texto: CONSENTIMENTO_TEXTO }).toMatchInlineSnapshot(`
      {
        "texto": "Concordo com o armazenamento dos meus dados (e-mail e roteiros) para salvar e recuperar meus roteiros.",
        "versao": "2026-09-16-v1",
      }
    `);
  });

  it("reproduz literalmente o texto exigido por UX-SPEC.md §8.2 item 5", () => {
    expect(CONSENTIMENTO_TEXTO).toBe(
      "Concordo com o armazenamento dos meus dados (e-mail e roteiros) para salvar e recuperar meus roteiros.",
    );
  });
});
