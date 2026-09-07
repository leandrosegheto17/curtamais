# ADR-002 — Provider de LLM e estratégia de custo

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

O núcleo do diferencial de produto (PRD.md Seção 1) depende de geração por LLM
para destino, hospedagem, passeios, faixas de preço e roteiro (RF-04, RF-06,
RF-07, RF-08). O Gate 1 (`CTO-REVIEW.md`) registrou como ressalva explícita que
a estratégia de LLM — incluindo custo por chamada — deve ser tratada como
decisão de arquitetura de primeira classe, não incidental. Não há modelo de
monetização definido ainda (R-04 do PRD.md), então custo por chamada é um risco
direto de viabilidade do MVP sem receita.

## Alternativas Consideradas

1. **OpenAI GPT-4o-mini**, com JSON mode/structured outputs nativo.
2. **Anthropic Claude 3.5 Haiku**, qualidade de geração comparável, function
   calling maduro.
3. **Google Gemini 1.5/2.0 Flash**, custo por token historicamente competitivo.
4. **Múltiplos providers simultâneos** (roteamento por custo/disponibilidade) —
   descartado nesta decisão, tratado à parte em ADR-004 (fallback).

## Decisão

Adotar **OpenAI GPT-4o-mini** como provider único do MVP, usando saída
estruturada (JSON mode / structured outputs) para cada etapa do fluxo guiado.

## Racional

- Custo por chamada competitivo para geração de texto curto/estruturado (as
  respostas de cada etapa — 2-4 destinos, 3 hospedagens, lista de passeios,
  roteiro por dia — são todas respostas relativamente pequenas em tokens de
  saída), compatível com a ausência de modelo de monetização definido (R-04).
- Suporte maduro a saída estruturada via JSON schema, que é a base da mitigação
  de alucinação de formato (ver ADR-003) — reduz a chance de resposta
  malformada que ADR-004/RNF-05 precisaria tratar como falha.
- Não há requisito funcional do PRD-TECNICO.md que exija uma capacidade
  específica de um provider em particular (ex.: função exclusiva) — a escolha é
  primariamente de custo/maturidade de saída estruturada, não de capacidade
  única.
- Provider único (em vez de múltiplos) mantém a complexidade do Gateway de IA
  baixa, compatível com o monólito modular do SDD.md Seção 1 — múltiplos
  providers simultâneos seriam over-engineering sem uso real que justifique.

## Consequências

- Dependência de um único fornecedor externo (vendor lock-in parcial) — mitigado
  pela camada de abstração do Gateway de IA (SDD.md Seção 2): o restante do
  sistema não conhece detalhes do provider, apenas a interface interna, o que
  reduz o custo de trocar de provider se necessário.
- Sem fallback para outro provider em indisponibilidade prolongada (tratado
  como dívida técnica aceita em ADR-004/SDD.md Seção 6).
- Toda chamada é registrada em `LlmGenerationLog` (SDD.md Seção 5) para dar
  visibilidade de custo real desde o primeiro uso, permitindo decisão
  informada quando R-04 (modelo de monetização) for endereçado.
