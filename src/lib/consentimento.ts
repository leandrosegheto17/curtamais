// ADR-012 (RNF-13) — texto e versão do consentimento LGPD exibido no
// cadastro. A tela (V2-L7-T03, componente `ConsentCheckbox`) exibe
// exatamente `CONSENTIMENTO_TEXTO`; o servidor (`criarConta`,
// `src/lib/actions/conta.ts`) grava exatamente `CONSENTIMENTO_VERSAO` em
// `User.privacyConsentVersion`, nunca um valor vindo do cliente.
//
// A política de privacidade completa fica para depois do V2.0 (ADR-012,
// Contexto) — este texto é deliberadamente curto e é o único conteúdo legal
// do produto até lá. Mudar o texto EXIGE mudar a versão (verificado por
// teste de snapshot em `__tests__/consentimento.test.ts`), para que
// `privacyConsentVersion` sempre identifique sem ambiguidade qual texto a
// pessoa aceitou.
export const CONSENTIMENTO_VERSAO = "2026-09-16-v1";

// Texto exato definido em UX-SPEC.md §8.2 item 5 — a tela (`ConsentCheckbox`,
// V2-L7-T03) exibe esta constante literalmente, nunca uma paráfrase.
export const CONSENTIMENTO_TEXTO =
  "Concordo com o armazenamento dos meus dados (e-mail e roteiros) para " +
  "salvar e recuperar meus roteiros.";
