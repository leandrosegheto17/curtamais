# ADR-001 — PWA/web responsivo vs. abordagem nativa

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

O PRD.md deixa a escolha final de stack/plataforma explicitamente para o
Coordenador, citando como opção a herança do padrão PWA/web responsivo já usado
no projeto de Leitura Bíblica do mesmo portfólio, versus outra abordagem
(RNF-04). O produto precisa funcionar em desktop e mobile via navegador, e a
qualidade visual é requisito de primeira classe (RNF-03/R11 do PRD.md), não um
detalhe secundário de plataforma.

## Alternativas Consideradas

1. **PWA (Next.js + Web App Manifest + Service Worker)** — web responsivo,
   instalável opcionalmente na tela inicial, sem distribuição via loja de apps.
2. **Aplicativo nativo (iOS/Android)** — melhor integração com recursos nativos
   (notificação push, câmera), mas exige build/manutenção duplicada e
   distribuição via loja.
3. **Framework híbrido (React Native/Flutter)** — um único código-fonte para
   mobile nativo, mas ainda exige pipeline de build/distribuição separado da
   web, e não resolve o requisito de uso via navegador desktop citado em
   RNF-04.

## Decisão

Adotar **PWA com Next.js** (web responsivo, mobile-first, instalável), a mesma
família de abordagem já usada no projeto de Leitura Bíblica do portfólio.

## Racional

- RNF-04 exige uso via navegador em desktop e mobile — nenhuma das alternativas
  nativas/híbridas cobre desktop sem uma segunda solução, o que aumentaria
  escopo sem necessidade comprovada.
- O fluxo de decisão guiada (RF-01 a RF-11) depende de chamadas de rede a um
  provider de LLM em praticamente toda etapa — não há caso de uso relevante de
  operação 100% offline que justifique o investimento em app nativo neste MVP.
- Reduz fricção de distribuição (sem loja de app, sem processo de review) — o
  que favorece a validação rápida de proposta de valor priorizada no PRD.md
  (Seção 4: "validar a proposta antes de investir no resto").
- Reaproveita precedente e conhecimento técnico já validado no portfólio (menor
  custo de aprendizado/operação), sem abrir mão de qualidade visual — Next.js
  com Tailwind/shadcn permite o "visual cuidado" exigido por RNF-03/R11 tanto
  quanto uma stack nativa permitiria.
- PWA ainda oferece instalação opcional na tela inicial do dispositivo,
  cobrindo o ganho de "sensação de app" sem o custo de loja.

## Consequências

- Recursos nativos avançados (notificação push nativa, deep integration com
  calendário do sistema) ficam limitados às capacidades que Service
  Worker/Web APIs oferecem — aceitável para o escopo do MVP, sem requisito
  funcional que dependa disso.
- Se uma evidência real de demanda por app nativo aparecer pós-lançamento, será
  uma decisão nova, com ADR próprio superseding este, não um ajuste incremental.
