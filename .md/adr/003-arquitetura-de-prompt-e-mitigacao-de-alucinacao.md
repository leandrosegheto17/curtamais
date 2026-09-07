# ADR-003 — Arquitetura de prompt e mitigação de alucinação

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

R-01 do PRD.md (risco explícito, ressalva 1 do Gate 1) identifica que sugestões
geradas por LLM podem "alucinar" preços ou informações desatualizadas. RNF-01
exige rotulagem de toda faixa de preço como aproximada; RN-05 reforça a mesma
regra. O PRD-TECNICO.md deixa explícito, na resolução de R-01 (Seção 6), que o
tratamento arquitetural completo (grounding, validação de faixa plausível) é
responsabilidade deste documento.

## Alternativas Consideradas

1. **Prompt único por sessão, contexto acumulado em texto livre** — mais simples
   de implementar, mas maior risco de o modelo "perder" restrições já
   aprovadas (ex.: orçamento) e maior dificuldade de parsear resposta de forma
   confiável.
2. **Prompt por etapa, com schema JSON explícito por etapa + validação
   server-side de plausibilidade** — mais trabalho de design de prompt, mas
   resposta previsível e verificável antes de chegar ao usuário.
3. **RAG com base de conhecimento externa de preços reais** — mitigaria melhor
   a alucinação de preço, mas exige a integração de preço real que o PRD.md
   explicitamente cortou do escopo do MVP (Seção 4).

## Decisão

Adotar **prompt por etapa com schema JSON explícito**, contexto acumulado
estruturado (não texto livre) das etapas já aprovadas, e uma camada de
**validação de plausibilidade de faixa de preço** no servidor, antes de expor
a sugestão ao usuário.

## Racional

- Cada etapa (destino, hospedagem, passeios, roteiro) tem um schema de saída
  fixo (nome, faixa de preço min/max, justificativa, etc. — mesmos campos do
  modelo de dados, SDD.md Seção 5), o que torna a resposta do LLM verificável
  automaticamente (campo ausente ou fora de tipo = falha tratada por ADR-004),
  em vez de exigir parsing heurístico de texto livre.
- Contexto acumulado estruturado (não a conversa inteira em texto livre) reduz
  a chance de o modelo "esquecer" uma restrição (ex.: orçamento, destino já
  aprovado) à medida que a sessão avança pelas etapas — cada chamada recebe
  exatamente os campos relevantes da etapa atual e das etapas já aprovadas.
- **Validação de plausibilidade de preço**: faixas de preço geradas passam por
  checagem server-side contra limites plausíveis por categoria/região (ex.:
  diária de hospedagem não pode ser negativa nem ordens de grandeza acima da
  faixa esperada para a região informada) — valores implausíveis disparam uma
  nova geração (mesmo mecanismo de retry do ADR-004), sem expor o valor
  implausível ao usuário. Os limites de plausibilidade são configuráveis e
  calibrados por região/categoria (não hardcoded por destino específico), o que
  os mantém sustentáveis dentro do MVP.
- **Grounding de data/calendário**: todo prompt de destino/roteiro recebe a
  data corrente e o range de datas da viagem já resolvido, para reduzir
  alucinação de sazonalidade (ex.: sugerir destino de inverno em mês de verão
  do hemisfério errado).
- Mitigação de RN-05/RNF-01 (rotulagem "faixa aproximada") é resolvida na
  camada de apresentação (UX-SPEC.md), não neste ADR — este ADR garante que o
  dado que chega à UI já passou por uma checagem de plausibilidade mínima, não
  que ele é garantidamente correto.
- O que este ADR **não resolve** (risco aceito conscientemente, documentado em
  SDD.md Seção 6): veracidade factual de informações não numéricas (ex.: regra
  de entrada em outro país, horário real de funcionamento de uma atração) —
  fora do escopo por não haver integração de preço/dado real no MVP (PRD.md
  Seção 4). Mitigado por disclaimer textual no roteiro final, coberto no
  UX-SPEC.md.

## Consequências

- Custo de manutenção de 4 schemas de prompt (um por etapa) em vez de um único
  prompt genérico — aceito, pois é o que torna a validação de plausibilidade
  possível.
- Validação de plausibilidade não elimina alucinação, apenas reduz casos
  grosseiros — expectativa comunicada explicitamente ao usuário via rotulagem
  (RNF-01), não como garantia de precisão.
