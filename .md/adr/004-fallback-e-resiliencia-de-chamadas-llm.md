# ADR-004 — Fallback e resiliência de chamadas ao provider de LLM

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

RNF-05 exige que toda chamada ao provider de LLM tenha tratamento de falha
(timeout, erro, resposta malformada) que não quebre a sessão do usuário, com
pelo menos uma tentativa de nova geração antes de expor erro. Esta decisão
complementa ADR-002 (provider único) e ADR-003 (schema de saída validável).

## Alternativas Consideradas

1. **Retry único automático no mesmo provider, depois erro explícito ao
   usuário com CTA manual de "tentar novamente"** — simples, atende o mínimo
   de RNF-05.
2. **Fallback para um segundo provider de LLM em caso de falha persistente** —
   maior resiliência, mas dobra a superfície de manutenção de prompt/schema
   (um schema por provider, já que formatos de structured output variam) sem
   evidência de necessidade real ainda.
3. **Fila assíncrona com nova tentativa em background e notificação ao
   usuário** — resiliência maior, mas quebra a percepção de fluidez do fluxo
   guiado (RNF-02) ao introduzir espera indefinida/notificação assíncrona num
   fluxo pensado para ser conversacional e imediato.

## Decisão

Adotar **retry único automático no mesmo provider** (mesmo definido em
ADR-002), seguido de **estado de erro explícito na UI com ação manual de nova
tentativa**, quando a falha persistir após o retry.

## Racional

- Atende exatamente o mínimo exigido por RNF-05, sem introduzir a complexidade
  de manter prompts/schemas equivalentes em dois providers (ADR-003 já
  concentra esforço real em schema por etapa) — critério de "não fazer
  over-engineering sem evidência" já usado em ADR-002.
- Falha classificada em 3 categorias tratadas de forma diferente: (a) timeout —
  retry automático; (b) erro de API (rate limit, 5xx) — retry automático com
  backoff curto; (c) resposta malformada (schema inválido, ADR-003) — retry
  automático com prompt reforçado (reforço explícito do schema esperado).
  Qualquer uma dessas categorias, se falhar após o retry único, resulta no
  mesmo estado de erro explícito na UI.
- Estado de erro explícito nunca quebra a sessão (RNF-05): o estado da sessão
  já persistido (etapas anteriores aprovadas) permanece intacto; só a etapa em
  falha fica pendente de nova tentativa manual.

## Consequências

- Em indisponibilidade prolongada do provider único (ADR-002), o usuário pode
  enfrentar falhas repetidas sem alternativa automática — dívida técnica
  aceita conscientemente (SDD.md Seção 6), reavaliável se o volume de uso real
  demonstrar necessidade de um segundo provider.
- `LlmGenerationLog` (SDD.md Seção 5) registra `retry_count` e `status`,
  permitindo medir a taxa real de falha/retry pós-lançamento como insumo para
  decidir se este ADR precisa ser superseded.
