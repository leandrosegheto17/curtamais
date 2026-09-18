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

## Parecer ad hoc — Estratégia de monetização / controle de custo de IA — 2026-09-16

### Escopo do parecer
Reabertura pontual solicitada pelo usuário (dono do produto), não uma nova
ideia de produto. Reavalia o risco R-04 do `PRD.md` §6 ("Modelo de
monetização não definido pode afetar decisões de arquitetura") e o item de
escopo "Modelo de monetização — não decidido nesta release" do `PRD.md` §4,
à luz do estado atual real do projeto: os 12 lotes de implementação estão
`Validado` em `TASK.md`, a sessão anônima e autenticada já está implementada
(ADR-008), rate limiting por sessão/IP já existe (L3-T05/RL3-T01), e há
tentativas de deploy em staging em andamento (bloqueadas hoje por
`VERCEL_TOKEN` inválido, não por decisão de produto).

### Análise de urgência/criticidade (skill `tech-strategy-review`)
A pergunta do usuário mistura duas questões de naturezas diferentes, que
precisam ser respondidas separadamente:

1. **"Precisa de cadastro para usar?"** — já está resolvida tecnicamente.
   ADR-008 e o fluxo atual já suportam uso 100% anônimo (cookie httpOnly
   `anon_session_id`) e uso autenticado opcional. Não há necessidade de
   mudança de arquitetura para responder isso; a pergunta real do usuário é
   se deve *tornar o cadastro obrigatório como controle de custo/monetização*
   — isso é decisão de produto/negócio, não uma lacuna técnica.
2. **"Estratégia de monetização"** — de fato não existe hoje (era decisão
   explicitamente adiada no `PRD.md` §4 e §7, risco R-04). O que existe é
   *observabilidade* de custo (`LlmGenerationLog` grava tokens/custo/latência
   por chamada) e *defesa contra abuso técnico* (rate limiting por
   sessão/IP) — nenhuma das duas é controle de cobrança, plano ou paywall.

Veredito de urgência: **não é bloqueante para o primeiro deploy em
staging/soft launch com escopo controlado**, mas **é recomendável decidir
antes de qualquer divulgação pública ampla ou deploy de produção aberto ao
público**, pelo seguinte motivo de risco: sem nenhum limite de custo por
usuário/dia (só por sessão/IP), o pior caso de exposição financeira em
produção aberta é proporcional ao tráfego, não a um teto orçamentário
definido — isso é uma lacuna de controle financeiro, não de segurança. Em
staging fechado (uso do próprio fundador e eventuais testadores conhecidos),
o risco é baixo e pode ser aceito conscientemente por mais um ciclo.

Recomendação: tratar a decisão de estratégia de monetização/controle de
custo como pré-requisito do lançamento de produção público (não do staging
já em curso), com uma salvaguarda mínima de baixo custo antes disso —
detalhado abaixo.

### Opções levantadas (chapéu CTO + PM, para decisão do usuário — nenhuma
das três é adotada por este parecer)
Ver relatório completo desta rodada no handback do Gestor. Resumo dos
trade-offs centrais: (a) cadastro obrigatório vs. anônimo com limite,
(b) modelo de cobrança (freemium por sessões grátis, paywall total,
doação/patrocínio), (c) impacto sobre o rate limiting hoje implementado
(por sessão/IP, não por usuário pagante/identidade).

### Veredito
**Consultivo — não bloqueia o pipeline nem o deploy de staging em curso.**
Recomenda-se decisão do usuário antes do primeiro deploy de produção aberto
ao público em geral. Nenhuma mudança de arquitetura/GUARDRAILS.md é proposta
por este parecer; se o usuário aprovar uma das opções, o Coordenador deve
ser acionado para desenhar a implementação técnica (rate limiting por
identidade, integração de pagamento, etc.) via ADR novo.

---

## Gate 4 — Fechamento pós-deploy de produção — 2026-09-17

### Escopo do gate
Registro de fechamento (PIPELINE-CONVENTIONS.md §1) do primeiro deploy de
produção real deste projeto. Sem poder de veto — o deploy já aconteceu; este
gate apenas formaliza o encerramento do ciclo com base em `DEPLOY.md`,
`QA-REPORT.md`, `SECURITY-REVIEW.md` e `BLOCKERS.md`.

### Resultado
**Sucesso.** Commit `73287ff` (branch `main`) publicado em produção.

- URL: `https://destino-ideal-ljs.vercel.app`, confirmado `HTTP/1.1 200 OK`
  servindo o conteúdo correto (verificado por `curl` + presença do texto do
  CTA de `ExamplePreviewSection`).
- Run do workflow: `gh workflow run deploy.yml -f environment=production
  -f ref=main` → run
  [`35260873990`](https://github.com/leandrosegheto17/curtamais/actions/runs/35260873990),
  todos os steps verdes (checkout, migration Prisma, deploy Vercel `--prod`).
- Escopo publicado: todo o backlog do MVP (Lotes 1-12, `TASK.md`) e todo o
  backlog do V2.0 (Lotes V2-L1 a V2-L8, incluindo V2-L4 — Home vitrine,
  validado no mesmo dia, e as refatorações `RL-V2-L4-T01`/`T02`). Dupla
  aprovação QA + DevSecOps registrada para todos em `QA-REPORT.md` e
  `SECURITY-REVIEW.md`.
- Nenhum rollback ou incidente pós-deploy. Houve uma tentativa anterior no
  mesmo dia que falhou por ausência de credenciais no GitHub Environment
  `production`, corrigida antes deste run — ver `BLOCKERS.md`, Bloqueio 013,
  status `Resolvido`.

### Ressalvas registradas (não bloqueantes)
1. **Infraestrutura de banco de dados** — `staging` e `production`
   compartilham o mesmo Postgres (Neon), por decisão explícita e consciente
   do usuário (dono do produto), não erro técnico. Recomendado provisionar
   banco separado para produção quando o produto tiver usuários reais.
2. **Débito técnico pendente, não bloqueante** — `RL-V2-L4-T03` (`TASK.md`,
   status `Pendente`): atualizar o metadado interno
   `generatedFrom.reviewedByOwner`/`note` em
   `src/content/roteiro-exemplo.ts`; não é lido por nenhuma UI hoje.
3. Reforça-se a recomendação já registrada no parecer ad hoc de 2026-09-16
   (monetização/controle de custo de IA): segue pendente de decisão do
   usuário antes de qualquer divulgação pública ampla — este deploy é o
   primeiro em produção, mas ainda sem tráfego externo divulgado.

### Veredito
**Registrado — sem poder de veto.** Ciclo de deploy encerrado com sucesso.
Nenhuma ação corretiva obrigatória antes de seguir; ressalvas acima ficam
como itens de acompanhamento para o próximo ciclo.

---

## Gate 1 (escopado) — Checklist de bagagem e documentos por destino e época — 2026-09-18

### Escopo
Demanda pontual (`/planejar_tarefa`), item #5 das 8 funcionalidades
recomendadas em 2026-09-18 e escolhido pelo dono. Skill
`tech-strategy-review` + `risk-and-compliance-check` em nível estratégico.

### Achados
- **Objetivo de negócio:** explícito (motivo de retorno ao app após o
  roteiro concluído, esforço P). Alinhado ao V2 (consultor de roteiros).
- **Custo de IA:** zero se determinístico (recomendado); sem teto de gasto
  hoje, então qualquer chamada nova de IA ficaria fora sem limite por
  roteiro.
- **Conflito com "Fora do V2":** nenhum. State machine intacta (painel de
  leitura pós-conclusão, marcação em tabela própria).
- **Tensão com a Fase 2:** checklist e documentos constam na Fase 2 do
  `PRD.md`; a demanda antecipa uma fatia mínima. Exige confirmação do dono.
- **LGPD:** marcação persistida por usuário é dado pessoal de baixo risco
  se gravar só `itemKey` + marcado + data, sem texto livre nem item que
  infira saúde/menores, com exclusão em cascata (GUARDRAILS 17, 20, 21).
- **INT-15:** a marcação abre a primeira escrita em "Meus roteiros";
  exceção declarada e restrita.
- **Capacidade:** sem gap; sem integração externa nova.

### Veredito
**Aprovado com ressalvas.** Ressalvas: (1) dono confirma antecipar a fatia
da Fase 2; (2) sem IA nem texto livre na primeira entrega; (3) conteúdo
curado revisado pelo dono antes do deploy; (4) sem afirmação de regras de
entrada/visto/passaporte; (5) Validador confere cascade de exclusão e
autorização de dono nas rotas. Libera os chapéus PM/BA para o rascunho.

### Atualização da rodada 2 — 2026-09-18 (rascunho aguardando aprovação final do dono)
O dono respondeu às 10 perguntas (`PRD.md` Seção 7, "Decisões do dono e do
Gestor"). **Veredito mantido: Aprovado**, com as ressalvas 2, 4 e 5
mantidas e as ressalvas 1 e 3 fechadas:
- **Ressalva 1 — FECHADA.** O dono aprovou explicitamente, em 2026-09-18,
  antecipar a fatia mínima da Fase 2 (checklist de bagagem e lembrete de
  documentos, sem dados de documento). Fica registrada como exceção à
  sequência "Fase 2 só depois de validar a Fase 1".
- **Ressalva 3 — FECHADA e substituída.** O dono delegou ao Gestor a
  aprovação do conteúdo curado dos 23 destinos, sem revisão dele antes do
  deploy. O PM redige; o Gestor aprova como tarefa do lote, quando o
  conteúdo existir. Critérios objetivos: (i) nenhuma afirmação de regra de
  entrada, visto, passaporte ou vacina; (ii) clima sempre "típico da
  época", nunca previsão; (iii) itens coerentes com clima e época de cada
  destino; (iv) nenhum item que infira saúde ou menores, além dos dois
  condicionais estáticos; (v) sem vocabulário de reserva/venda; (vi)
  `itemKey` estável e único. A aprovação ainda **não** foi dada: o conteúdo
  não existe.
- **Ressalva 2 mantida:** sem IA e sem item próprio (decisão final).
- **Ressalva 4 mantida:** sem regra de entrada/visto/passaporte/vacina.
- **Ressalva 5 mantida:** Validador confere cascade de exclusão e
  autorização de dono.
- Escopo ajustado pelo dono/Gestor: só roteiro concluído; seis categorias;
  dois itens condicionais estáticos; impressão do navegador (sem
  exportar/PDF); sem lembrete por e-mail/push.

---
