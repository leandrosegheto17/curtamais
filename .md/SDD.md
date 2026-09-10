# SDD.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Coordenador (chapéu Software Architect). Baseado em `PRD.md` e
`PRD-TECNICO.md` (2026-09-07), e nas ressalvas do Gate 1 em `CTO-REVIEW.md`.
Cobre exclusivamente o escopo do MVP (Fase 1 — Decisão guiada). O schema de
persistência (Seção 5) é desenhado para ser estendido, não recriado, pela Fase 2.

## 1. Visão Geral

O sistema é uma aplicação web responsiva (PWA) de página única por sessão de
planejamento, organizada como um fluxo guiado em etapas (RF-05/RN-01): o usuário
entra por um de três caminhos (RF-01/RF-02/RF-03), o sistema resolve o destino
(sugerido por IA ou confirmado, RF-04/RF-11), e então avança etapa a etapa —
hospedagem (RF-06) → passeios (RF-07) → roteiro (RF-08) — com aprovação ou ajuste
explícito do usuário a cada etapa, nunca mostrando duas etapas na mesma tela.

Arquitetura escolhida: **monólito modular server-rendered**, um único deployable
(aplicação Next.js) com camadas internas bem separadas por responsabilidade.
Justificativa: o MVP tem um único time (o fundador), prazo enxuto e nenhuma
integração de preço real (PRD.md Seção 4) — um monólito modular entrega o
isolamento de responsabilidade necessário (orquestração de fluxo, gateway de LLM,
persistência, cálculo de feriado) sem o custo operacional de múltiplos serviços,
que não se paga neste estágio. Este é o mesmo raciocínio que já levou a cortar
integração de preço real do MVP (PRD.md Seção 4): reduzir superfície antes de
validar a proposta de decisão guiada.

Padrão arquitetural interno: separação em 4 camadas dentro do monólito —
**Apresentação** (UI + componentes de fluxo), **Orquestração de Sessão** (state
machine do fluxo em etapas, RN-01/RF-05), **Gateway de IA** (prompt design,
provider, fallback, validação de plausibilidade — ver Seção 4, ADR-002/003/004),
e **Persistência** (schema estruturado, Seção 5). Cada camada é um módulo isolado
com fronteira de import explícita (nenhuma tela chama o provider de LLM
diretamente; toda chamada passa pelo Gateway de IA).

## 2. Componentes e Fluxo de Dados

```mermaid
flowchart TD
    subgraph Cliente["Apresentação (Next.js App Router + React)"]
        UI[Telas do fluxo guiado]
        SW[Service Worker / PWA]
    end

    subgraph Servidor["Aplicação Next.js (Route Handlers / Server Actions)"]
        Orq[Orquestrador de Sessão\n(state machine de etapas)]
        Gateway[Gateway de IA\n(prompt build + validação + retry)]
        Feriados[Módulo de Feriados\n(determinístico, sem LLM)]
        Persist[Camada de Persistência\n(Prisma ORM)]
    end

    subgraph Externo["Serviços Externos"]
        LLM[Provider de LLM\n(ver ADR-002)]
        DB[(PostgreSQL gerenciado)]
    end

    UI --> Orq
    Orq --> Feriados
    Orq --> Gateway
    Gateway -->|prompt por etapa + JSON schema| LLM
    LLM -->|resposta estruturada| Gateway
    Gateway -->|sugestão validada| Orq
    Orq --> Persist
    Persist --> DB
    Orq --> UI
    SW -.cache de assets estáticos.-> UI
```

Fluxo de dados por etapa (destino/hospedagem/passeios/roteiro): a UI dispara uma
ação de servidor → o Orquestrador de Sessão valida em que etapa a sessão está e
monta o contexto (dados já aprovados, orçamento, destino, datas) → o Gateway de
IA constrói o prompt específico da etapa (ADR-003), chama o provider com saída
estruturada (JSON mode/function calling), valida plausibilidade de preço
(ADR-003) e aplica retry único em falha (ADR-004, RNF-05) → o resultado validado
volta ao Orquestrador, que persiste o estado da sessão (Seção 5) e devolve à UI
para renderização, com streaming quando disponível (Seção 3, RNF-02).

## 3. Stack Tecnológica

| Camada | Escolha | Justificativa |
|---|---|---|
| Frontend/Framework | Next.js 14+ (App Router), TypeScript, React Server Components + Server Actions | Um único framework cobre apresentação e backend leve do MVP, reduzindo superfície operacional; suporte nativo a streaming de resposta (necessário para RNF-02 com chamadas de LLM); ecossistema maduro para PWA |
| PWA / Responsividade | Web App Manifest + Service Worker (`next-pwa` ou implementação nativa equivalente), design responsivo mobile-first | Resolve RNF-04 (desktop + mobile via navegador) sem o custo de build/distribuição de app nativo; ver ADR-001 para a decisão completa PWA vs. nativo |
| Estilização / Design System | Tailwind CSS + shadcn/ui (componentes acessíveis, customizáveis) como base do design system do `UX-SPEC.md` | Suporta o requisito de "visual cuidado" de primeira classe (RNF-03/R11) com velocidade de implementação compatível com o prazo enxuto do MVP; shadcn/ui já resolve boa parte da acessibilidade base (WCAG) exigida |
| Backend | Route Handlers/Server Actions do próprio Next.js (sem serviço backend separado) | Evita duplicar camada de API para um único deployable; mantém o monólito modular da Seção 1 |
| ORM / Persistência | Prisma ORM sobre PostgreSQL gerenciado (ex.: Neon/Supabase — provedor específico é decisão de infraestrutura, não de arquitetura) | Schema relacional se encaixa bem na estrutura de RF-09 (campos opcionais por etapa aprovada); Prisma dá migração versionada, necessária para a Fase 2 estender o schema sem recriá-lo |
| Provider de LLM | Ver ADR-002 | Decisão de arquitetura de primeira classe, conforme ressalva 1 do Gate 1 em `CTO-REVIEW.md` |
| Autenticação | NextAuth.js (ou equivalente), e-mail/senha ou magic link — conta opcional no MVP | Suficiente para RNF-06 (LGPD) sem exigir provedor social de terceiros ainda não decidido; sessão de planejamento funciona mesmo sem conta (ver Seção 5) |
| Cálculo de feriados | Lógica determinística interna (biblioteca de feriados nacionais BR ou tabela própria versionada), sem chamada a LLM | Atende RNF-07 diretamente; feriados nacionais BR são um domínio fechado e conhecido, não exige geração |
| Hospedagem/Deploy | Plataforma serverless compatível com Next.js (ex.: Vercel) | Reduz operação de infraestrutura no MVP; mesma família de escolha já validada no precedente de PWA citado no PRD.md |

## 4. Decisões Arquiteturais (Índice de ADRs)

Todos os ADRs completos estão em `.md/adr/`. Um ADR nunca é editado após aceito —
mudança de decisão gera novo ADR com `Status: Superseded by ADR-NNN`.

| ADR | Título | Decisão resumida |
|---|---|---|
| [ADR-001](adr/001-pwa-web-responsivo-vs-nativo.md) | PWA/web responsivo vs. abordagem nativa | Adota PWA (Next.js), rejeita nativo/híbrido para o MVP |
| [ADR-002](adr/002-provider-llm-e-estrategia-de-custo.md) | Provider de LLM e estratégia de custo | Adota OpenAI GPT-4o-mini com saída estruturada (JSON mode) como provider único do MVP |
| [ADR-003](adr/003-arquitetura-de-prompt-e-mitigacao-de-alucinacao.md) | Arquitetura de prompt e mitigação de alucinação | Prompt por etapa, contexto acumulado, validação de faixa de preço plausível, grounding de data/calendário |
| [ADR-004](adr/004-fallback-e-resiliencia-de-chamadas-llm.md) | Fallback e resiliência de chamadas ao provider de LLM | Retry único automático (RNF-05), sem fallback multi-provider no MVP |
| [ADR-005](adr/005-schema-persistencia-estruturada-rf09.md) | Schema de persistência estruturada (RF-09) | Modelo relacional normalizado por etapa aprovada, campos opcionais, extensível pela Fase 2 |
| [ADR-006](adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md) | Orquestração do fluxo em etapas | State machine explícita server-side, persistida a cada transição |
| [ADR-007](adr/007-calculo-deterministico-de-feriados.md) | Cálculo de feriados nacionais | Lógica determinística interna, sem chamada a LLM |
| [ADR-008](adr/008-propriedade-e-autorizacao-de-trip-session.md) | Propriedade (dono) de `TripSession` e resolução de identidade | Novo campo `anon_session_id`; dono gravado no momento da criação (cookie anônimo ou `user_id`); guard de autorização sempre retorna 404 em divergência |

## 5. Modelo de Dados de Alto Nível

Schema relacional (PostgreSQL via Prisma), desenhado para satisfazer RF-09.1
(campos independentemente opcionais por etapa aprovada) e para ser estendido —
não recriado — pela Fase 2 (RF-09 depende disso, conforme PRD.md Seção 7,
pergunta 2, e INT-03 do PRD-TECNICO.md).

```mermaid
erDiagram
    TripSession ||--o| DestinationApproval : "0..1"
    TripSession ||--o| AccommodationApproval : "0..1"
    TripSession ||--o{ ActivityApproval : "0..n"
    TripSession ||--o{ ItineraryItem : "0..n"
    TripSession ||--o{ LlmGenerationLog : "0..n"
    ActivityApproval ||--o| ItineraryItem : "0..1"

    TripSession {
        uuid id PK
        uuid user_id "nullable, FK futura para Account; dono se conta autenticada (ADR-008)"
        string anon_session_id "nullable, dono se sessão anônima (ADR-008); mutuamente exclusivo com user_id"
        enum entry_path "data_livre|feriado|quiz"
        date date_range_start "nullable ate RF-04 resolver"
        date date_range_end
        decimal budget_amount "nullable"
        string budget_currency "nullable"
        enum status "in_progress|partial|completed|abandoned"
        enum flow_state "11 estados granulares (ADR-006 Adendo 1)"
        timestamp created_at
        timestamp updated_at
    }
    DestinationApproval {
        uuid id PK
        uuid session_id FK
        string name
        text justification "nullable quando source=user_provided"
        decimal price_range_min
        decimal price_range_max
        enum source "ia_suggested|user_provided"
        timestamp approved_at
    }
    AccommodationApproval {
        uuid id PK
        uuid session_id FK
        string name
        string type
        decimal price_per_night_min
        decimal price_per_night_max
        string distinctive_feature
        timestamp approved_at
    }
    ActivityApproval {
        uuid id PK
        uuid session_id FK
        string name
        decimal price_min
        decimal price_max
        boolean is_free
        string duration_approx
        int order_index
        timestamp approved_at
    }
    ItineraryItem {
        uuid id PK
        uuid session_id FK
        uuid activity_id FK "nullable"
        date day_date
        enum period "manha|tarde|noite"
        string suggested_time
        text timing_justification "nullable"
        int sequence_order
    }
    LlmGenerationLog {
        uuid id PK
        uuid session_id FK
        enum stage "destino|hospedagem|passeios|roteiro"
        string provider
        string prompt_version
        int tokens_input
        int tokens_output
        decimal cost_estimate_usd
        int latency_ms
        int retry_count
        enum status "success|failed_after_retry"
        timestamp created_at
    }
```

Notas de design:
- `TripSession` é a raiz de agregação; cada uma das quatro entidades de etapa
  (`DestinationApproval`, `AccommodationApproval`, `ActivityApproval`,
  `ItineraryItem`) só existe quando a etapa correspondente foi aprovada — reflete
  diretamente RN-03 (sessão "concluída com valor" com só uma etapa aprovada).
- ADR-006 Adendo 2 (2026-09-10): a state machine (`SessionFlowAction`) ganhou
  uma ação regressiva `revisar`, que leva um estado `*_confirmado`/
  `*_aprovada(o)`/`*_aprovados` de volta ao `*_pendente` da mesma etapa (ex.:
  `destino_confirmado` → `destino_pendente`). Como `DestinationApproval`/
  `AccommodationApproval` são 0..1 por sessão e `ActivityApproval`/
  `ItineraryItem` são o conjunto de linhas da própria etapa, não existe
  tabela de histórico de aprovação — `revisar` apaga a(s) linha(s) de
  aprovação só da etapa reaberta (nunca de etapa anterior) na mesma
  transação que grava o novo `flow_state`; nenhum campo/enum novo é
  necessário. Detalhe completo no ADR.
- `LlmGenerationLog` não é requisito funcional do PRD-TECNICO.md, mas é
  necessário para operar a mitigação de custo/alucinação exigida pela ressalva 1
  do Gate 1 (observabilidade de custo por chamada e taxa de retry) — registrado
  aqui como decisão de arquitetura, não como escopo de produto novo.
- Extensão prevista pela Fase 2 (fora deste MVP, documentada só para não quebrar
  a herança): tabelas `Checklist`, `TripDocument`, `Expense`, `TripMember`
  referenciando `TripSession.id` como FK — nenhuma delas é criada neste SDD.md.
- `user_id` é nullable porque o fluxo de decisão guiada (RF-01 a RF-11) não exige
  conta criada — só é usado quando o usuário opta por persistir/recuperar sessão
  entre dispositivos (ver Seção 7, RNF-06).
- `flow_state` (enum `SessionFlowState`, 11 valores, default
  `entrada_selecionada`) foi acrescentado a `TripSession` pelo ADR-006 Adendo 1
  (`.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`) para
  persistir o estado granular da state machine do Orquestrador de Sessão
  (`src/lib/session-flow/state-machine.ts`, L4-T01/L4-T02). Coexiste com
  `status` (`TripSessionStatus`, 4 valores): `status` permanece a
  granularidade grosseira para filtros administrativos e para o estado
  `abandoned` (fora do vocabulário da state machine); `flow_state` é a fonte
  de verdade das 11 etapas, sincronizada com `status` só nos dois terminais
  (`concluida` → `completed`, `encerrada_parcial` → `partial`). Ver o ADR
  para o detalhamento completo.
- `anon_session_id` (ADR-008, `.md/adr/008-propriedade-e-autorizacao-de-trip-session.md`)
  foi acrescentado a `TripSession` para resolver o Bloqueio 004
  (`.md/BLOCKERS.md`): `user_id` existia no schema desde L1-T02, mas nunca era
  de fato gravado por nenhum ponto de criação real, e não havia nenhum campo
  equivalente para sessão anônima — sem isso, o guard de autorização de
  `L11-T02` (Seção 7) não tinha contra o que comparar. `anon_session_id` e
  `user_id` são mutuamente exclusivos na prática (sessão anônima vs.
  autenticada), gravados uma única vez no momento da criação
  (`createSessionWithDateRange`), sem `CHECK` constraint formal — a garantia é
  de responsabilidade do único ponto de criação real, reforçada em tempo de
  compilação pelo tipo `owner` discriminado. Ver o ADR para a regra completa
  de resolução de dono (precedência: conta autenticada > cookie anônimo).

## 6. Riscos Técnicos

| Risco | Severidade | Mitigação / decisão | Dívida técnica aceita |
|---|---|---|---|
| Alucinação de preço/informação pela LLM (R-01 do PRD.md) | Alta | ADR-003: saída estruturada + validação de faixa plausível server-side + rotulagem "faixa aproximada" (RNF-01, tratado no UX-SPEC.md) | Não há verificação factual contra fonte externa real (ex.: preço real de ingresso) — aceito conscientemente, pois integração de preço real está fora do MVP (PRD.md Seção 4); mitigado por disclaimer explícito no roteiro final |
| Custo por chamada de LLM não controlado (sem modelo de monetização definido, R-04 do PRD.md) | Média | `LlmGenerationLog` (Seção 5) dá observabilidade de custo desde o dia 1; limite de chamadas por sessão não implementado no MVP | Aceito: limite de uso por usuário fica para quando o modelo de monetização for decidido (R-04, fora do MVP) |
| Latência de chamada de LLM quebrando a percepção de fluidez do fluxo guiado (RNF-02) | Média | Streaming de resposta via Server Actions + skeleton state; meta de p95 ≤ 8s por etapa, com primeiro conteúdo perceptível em até 2s via streaming | — |
| Retry único (ADR-004) insuficiente em instabilidade prolongada do provider | Baixa/Média | RNF-05 exige só uma tentativa adicional antes de expor erro; estado de erro explícito com CTA de "tentar novamente" manual coberto no UX-SPEC.md | Aceito para o MVP: fallback multi-provider é over-engineering sem uso real que justifique o custo adicional |
| Schema de persistência (Seção 5) não antecipar corretamente uma necessidade real da Fase 2 | Média | Schema revisado deliberadamente contra RF-09.1 e a Pergunta em Aberto 2 do PRD.md; qualquer gap real só aparecerá ao especificar o PRD-TECNICO.md da Fase 2 | Aceito: não é possível eliminar 100% o risco de retrabalho de schema sem especificar a Fase 2 agora, o que contradiz a priorização do PRD.md (Fase 1 antes de Fase 2) |
| Monólito único concentra toda a carga (apresentação + orquestração + gateway de IA) num só deployable | Baixa | Aceitável para o volume esperado de um MVP recém-lançado (PRD.md Seção 3, meta de conclusão de fluxo, não de escala); camadas internas já isoladas (Seção 1) facilitam extração futura se necessário | Aceito conscientemente; extração para serviços separados só se justifica com evidência real de gargalo |

## 7. Requisitos de Segurança

- **Autenticação**: conta opcional (NextAuth.js), obrigatória apenas para
  recuperar sessão entre dispositivos; sessão de planejamento em andamento
  funciona sem login, usando identificador de sessão assinado (cookie
  httpOnly + secure).
- **Autorização**: toda leitura/escrita em `TripSession` e entidades filhas exige
  que o identificador de sessão (cookie) ou `user_id` autenticado corresponda ao
  dono do registro; nenhuma rota expõe `TripSession` de outro usuário/sessão.
  O dono é gravado explicitamente no momento da criação da `TripSession`
  (`user_id` se autenticado, `anon_session_id` se anônimo — mutuamente
  exclusivos, precedência de conta autenticada sobre cookie anônimo quando
  ambos presentes na requisição de criação) e comparado pelo guard central
  contra a identidade resolvida da requisição corrente a cada leitura/escrita
  subsequente; qualquer divergência (incluindo registro sem dono gravado)
  retorna **404, nunca 403**, para não revelar a existência do registro a um
  solicitante ilegítimo. Ver ADR-008
  (`.md/adr/008-propriedade-e-autorizacao-de-trip-session.md`) para o
  detalhamento completo.
- **Criptografia**: TLS obrigatório em todo tráfego (cliente-servidor e
  servidor-provider de LLM); dados pessoais em repouso (e-mail de conta, quando
  aplicável) armazenados com criptografia em nível de coluna/disco do provedor
  gerenciado de PostgreSQL; segredos (API key do provider de LLM, string de
  conexão do banco) mantidos em variáveis de ambiente/secrets manager da
  plataforma de deploy, nunca versionados no repositório.
- **Isolamento**: dados enviados ao provider de LLM ficam restritos ao contexto
  necessário da sessão (datas, destino, orçamento, feedback do usuário) — nenhum
  dado pessoal de conta (e-mail, senha) é enviado ao prompt em nenhuma etapa.
- **LGPD (RNF-06)**: coleta mínima de dado pessoal (e-mail, quando conta é
  criada); finalidade declarada (recuperar sessão); mecanismo de exclusão de
  conta e dados associados previsto como requisito de implementação (detalhado
  no TASK.md); nenhum dado pessoal é usado para treinar/fine-tunar modelo — só
  passa por inferência via API do provider.
- **Rate limiting**: limite de chamadas ao Gateway de IA por sessão/IP no nível
  de aplicação, para conter abuso e custo (complementa o risco de custo não
  controlado da Seção 6), mesmo sem modelo de monetização definido ainda.
- **Validação de entrada**: toda entrada de usuário (range de datas, orçamento,
  texto livre do quiz) validada e sanitizada no servidor antes de compor o
  prompt, mitigando prompt injection via campo de texto livre de orçamento
  (RF-03.1 item 4).
- Nota explícita: os itens acima definem o requisito de arquitetura de
  segurança; SAST/DAST/hardening tático é responsabilidade do Validador na fase
  de execução, não deste documento.
