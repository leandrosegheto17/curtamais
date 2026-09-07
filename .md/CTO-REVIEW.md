# CTO-REVIEW.md

Log de governança do Gestor (chapéu CTO). Cada seção corresponde a um gate formal
(Gate 1, Gate 4) ou a um parecer ad hoc, com data e veredito.

---

## Gate 1 — Pré-descoberta — 2026-09-07

### Objetivo de negócio
Construir um planejador de viagens que resolve, num único produto, as duas dores
do ciclo completo de uma viagem: **decidir** (para onde ir, quando, com que
orçamento, roteiro e timing) e **organizar** (cronograma, checklist, reservas,
gastos) — com uma experiência guiada por IA que não exige que o usuário saiba
"conversar" com IA generativa por conta própria, e com um acabamento visual
diferenciado na web. Objetivo declarado em uma frase: *entregar, para quem tem um
período livre e não sabe/não quer conduzir uma conversa de IA generativa sozinho,
uma decisão de viagem guiada e um plano organizado, partindo do mesmo padrão de
qualidade que o fundador já produz manualmente hoje.*

O objetivo é verificável (existe um comportamento manual hoje, feito pelo próprio
fundador, que o produto propõe automatizar e tornar acessível a um público mais
amplo) — passa no critério de "não é só uma aspiração vaga".

### Alinhamento com roadmap
**Neutro, com nota.** Este é um projeto novo e independente dos demais em
andamento no portfólio do fundador (Metas Financeiras, Rastreador de Leitura
Bíblica, site institucional LJS Software) — não há roadmap de produto único que
amarre os quatro projetos entre si, então não há competição direta por escopo de
produto. Ponto de atenção registrado, não bloqueante: os quatro projetos competem
pela mesma capacidade de execução do fundador (mesma pessoa tocando múltiplos
projetos em paralelo) — isso é insumo para `capacity-and-timeline-validation`
mais adiante (ad hoc, quando o TASK.md existir), não motivo de reprovação aqui.
A escolha explícita de "produto que o próprio fundador usaria" é um sinal de
validação de mercado interno saudável (dogfooding), reforça — não compete com —
a lógica dos outros projetos do portfólio.

### Plausibilidade de orçamento/prazo
Sem estimativa detalhada (fora do escopo deste gate). Sinal de plausibilidade,
em nível de sinalização:
- O briefing já prioriza corretamente o MVP mais arriscado (Fase 1 — Decisão
  guiada) antes do mais previsível (Fase 2 — CRUD de organização), o que é uma
  escolha de sequenciamento saudável para validar a proposta de valor antes de
  investir no resto.
- O MVP da Fase 1 depende de LLM para geração de sugestões (destino, hotel,
  passeios, roteiro, timing) sem integração com APIs de preço real — isso reduz
  superfície de integração externa no MVP, o que é favorável a prazo enxuto.
- Nenhum sinal óbvio de incompatibilidade entre o escopo descrito e um esforço de
  MVP: o briefing já reconhece explicitamente pontos em aberto (conjunto de
  perguntas do quiz, stack, monetização) como decisões adiadas para depois dos
  primeiros testes de uso, em vez de tentar fechar tudo antes de começar — reduz
  risco de escopo inflado no Gate 1.
- Não há orçamento/prazo numérico declarado no briefing para comparar contra
  escopo — não é bloqueio (não é exigido neste gate), mas fica registrado como
  Pergunta em Aberto no PRD.md (Seção 7) para quando o TASK.md existir.

### Gap de roster
Nenhum papel/skill faltante para o tipo de projeto proposto, com uma ressalva
nomeada:
- O produto depende de uma camada de geração de sugestões por LLM (destino,
  preços aproximados, roteiro, timing) como núcleo do diferencial de produto.
  O roster de 4 agentes consolidados (Gestor, Coordenador, Executor, Validador)
  cobre esse tipo de integração dentro do escopo já previsto do Coordenador
  (arquitetura/decisão de provider de LLM) e do Executor (implementação da
  camada de prompt/orquestração) — não é um papel novo de "ml-ai-engineer"
  dedicado, já que o MVP não treina modelo próprio, só orquestra chamadas a um
  provider de LLM existente. Registrado como ressalva, não como gap bloqueante:
  o Coordenador deve tratar explicitamente, no SDD.md, a estratégia de prompt
  engineering, fallback de resposta da IA e custo por chamada como decisão de
  arquitetura de primeira classe — não um detalhe de implementação incidental.
- Nenhum gap de roster para a Fase 2 (CRUD de cronograma/checklist/gastos) —
  escopo tecnicamente previsível, coberto pelo Executor sem necessidade de papel
  adicional.

### Veredito
**Aprovado com ressalvas.**

Ressalvas (não bloqueiam o início do chapéu PM, mas devem ser levadas adiante):
1. O Coordenador deve tratar a estratégia de LLM (prompt, custo por chamada,
   fallback de resposta, limites de "alucinação" em preços/sugestões) como
   decisão de arquitetura de primeira classe no SDD.md — não incidental.
2. Quando o TASK.md existir, avaliar capacidade real do fundador considerando
   que ele toca este projeto em paralelo a outros três (parecer ad hoc, se
   solicitado).
3. O escopo do MVP da Fase 1 deve permanecer estritamente delimitado aos três
   caminhos de entrada descritos (data livre, feriados prolongados, quiz básico)
   e ao fluxo em etapas — qualquer expansão (ex.: feriados internacionais,
   integração de preço real) é Fase 2+ ou versão futura, não deste MVP.

Libera o Gestor para seguir com os chapéus PM e BA na mesma chamada.

---

## Governança de GUARDRAILS.md (rascunho inicial) — 2026-09-07

### Escopo do parecer
Aplicação da skill `guardrails-governance` sobre o rascunho inicial de
`GUARDRAILS.md` produzido pelo Coordenador junto com `TASK.md` (já aprovado
diretamente pelo usuário). Não é um gate técnico sobre `SDD.md`/`TASK.md` —
ambos já foram aprovados pelo usuário; este parecer cobre exclusivamente a
coerência e completude do conteúdo do próprio `GUARDRAILS.md` frente ao que já
foi validado (Gate 1, ADRs 001-007, `PRD-TECNICO.md`, `SDD.md`).

### Coerência com o já aprovado
- Regras 1-6 (negócio) reproduzem fielmente RN-01 a RN-06 do `PRD-TECNICO.md`
  §3, sem adicionar nem suprimir conteúdo.
- Regras 7-14 (arquitetura) foram verificadas contra os 7 ADRs em `.md/adr/`:
  ADR-002 (provider único GPT-4o-mini) e ADR-004 (retry único, sem fallback
  multi-provider) confirmam literalmente as regras 9 e 10; ADR-006 (state
  machine server-side) confirma as regras 11 e 12; ADR-007 (feriados
  determinísticos) confirma a regra 14. Nenhuma contradição encontrada.
- Regras 15-21 (segurança/compliance) reproduzem `SDD.md` §7 sem divergência
  (segredos via env/secrets manager, isolamento de sessão, exclusão de dados
  no atendimento a LGPD, restrição de dado pessoal no prompt, rate limiting,
  sanitização de entrada).
- Regras 25-27 (stack) reproduzem `SDD.md` §3 (Prisma/PostgreSQL, plataforma
  serverless, imutabilidade de ADR aceito) sem divergência.
- Nenhuma regra do rascunho contradiz o Gate 1 (`CTO-REVIEW.md`, acima) ou
  qualquer ADR aceito.

### Lacunas de cobertura (não bloqueantes)
1. A ressalva 3 do Gate 1 ("o escopo do MVP deve permanecer estritamente
   delimitado... qualquer expansão é Fase 2+, não deste MVP") não tem uma
   regra correspondente explícita no rascunho. O `SDD.md` §5 já cita as
   entidades de Fase 2 (`Checklist`, `TripDocument`, `Expense`, `TripMember`)
   como extensão prevista, mas o `GUARDRAILS.md` não trava explicitamente o
   Executor contra implementá-las neste ciclo.
2. ADR-001 (PWA vs. nativo) é a única decisão arquitetural aceita sem uma
   regra espelho de "não migrar sem novo ADR" no `GUARDRAILS.md` — as demais
   seis (ADR-002 a ADR-007) têm cobertura direta nas regras 7-14; a regra 26
   cobre plataforma de deploy, mas não a escolha PWA vs. nativo em si.

Nenhuma das duas lacunas contradiz conteúdo aprovado; ambas são omissões de
cobertura, corrigidas com duas linhas adicionais de baixo custo. Registradas
no Log de Alterações de `GUARDRAILS.md` como ressalvas não bloqueantes.

### Veredito
**Aprovado com ressalvas.**

As regras listadas são coerentes com Gate 1, ADRs e `PRD-TECNICO.md`, e
cobrem os pontos essenciais (negócio, arquitetura, segurança/compliance,
UX/acessibilidade, stack) com granularidade suficiente para orientar Executor
e Validador sem ambiguidade. As ressalvas acima não bloqueiam o uso do
documento nesta forma — o Coordenador pode incorporar as duas linhas
faltantes na próxima revisão do documento, sem necessidade de nova aprovação
formal deste parecer (correção de completude, não mudança estrutural de
regra já aprovada).

---
