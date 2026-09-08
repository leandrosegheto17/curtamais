# QA-REPORT.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Validador (chapéu QA). Valida contra `TASK.md` (Seção 1 e Seção 3),
`SDD.md` e `GUARDRAILS.md`. Não reinterpreta critério de aceite — valida o
que está escrito.

## Lote 1 — Fundação de Infraestrutura e Persistência

Status geral: **Aprovado**. As 3 tarefas do lote passam nos respectivos
critérios de aceite, confirmados por leitura direta do código (não apenas
pela nota do Executor) e por execução real da suíte.

### Suíte executada (ambiente local + verificação equivalente ao CI)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm test` (`vitest run`) | Passou — 8 arquivos, 31 testes, incluindo 2 suítes de integração real contra Postgres (`prisma/__tests__/schema.integration.test.ts`, `src/lib/__tests__/user-account.integration.test.ts`) |
| `npm run build` (`next build`) | Passou — build de produção completo, 3 rotas de API dinâmicas + middleware de 26.6 kB gerados sem erro |

### L1-T01 — Scaffold Next.js 14, lint/test/CI, env/secrets

Critério de aceite: "Projeto builda, lint/test rodam em CI, `.env.example`
documentado, nenhum segredo versionado."

- Build/lint/test confirmados acima, localmente equivalentes ao pipeline
  definido em `.github/workflows/ci.yml` (Postgres real como serviço,
  `prisma migrate deploy` antes da suíte, depois lint/test/build).
- `.env.example` presente e documentado por seção (banco, NextAuth, OpenAI,
  rate limit), com comentário direcionando para não versionar `.env`.
- `.env` real confirmado como **não rastreado** pelo git (`git ls-files` não
  o lista) e coberto por `.gitignore` (`.env`, `.env.local`,
  `.env.*.local`, etc.) — nenhum segredo versionado.
- **Aprovado.**

### L1-T02 — Migration Prisma do schema completo (SDD §5)

Critério de aceite: "Migration aplicada em ambiente local, todos os
campos/enums do SDD §5 presentes, campos opcionais realmente nullable."

- Todas as 6 entidades de domínio do SDD §5 presentes em
  `prisma/schema.prisma`: `TripSession`, `DestinationApproval`,
  `AccommodationApproval`, `ActivityApproval`, `ItineraryItem`,
  `LlmGenerationLog`, com todos os enums (`TripEntryPath`,
  `TripSessionStatus`, `DestinationSource`, `ItineraryPeriod`, `LlmStage`,
  `LlmGenerationStatus`) espelhando literalmente o SDD.
- Nullability conferida campo a campo contra o SDD (literal "nullable" no
  diagrama): `TripSession.userId`, `.dateRangeStart`, `.budgetAmount`,
  `.budgetCurrency`; `DestinationApproval.justification`;
  `ItineraryItem.activityId`, `.timingJustification` — todos `?` no schema.
  Confirmado empiricamente (não só por leitura estática) pelo teste de
  integração real contra Postgres em
  `prisma/__tests__/schema.integration.test.ts` ("cria uma TripSession com
  campos opcionais omitidos (nullable de fato)").
- Migration real aplicada e exercida: teste de integração grava o grafo
  completo (destino, hospedagem, passeio+roteiro, log de LLM), valida
  cascade delete (sem dado órfão ao remover `TripSession`) e valida a
  constraint 1:1 opcional `TripSession`↔`DestinationApproval`
  (`session_id` único rejeita segundo registro).
- **Aprovado.**

### L1-T03 — Autenticação NextAuth.js + sessão anônima

Critério de aceite: "Usuário consegue navegar sem conta (cookie de
sessão); criar conta associa `user_id`; sessão sobrevive a reload."

- Navegar sem conta: `src/middleware.ts` garante `anon_session_id`
  (httpOnly, `secure` condicionado a produção, `sameSite=lax`) em toda
  rota exceto assets estáticos e `api/auth/*`; testado end-to-end via
  `NextRequest`/`NextResponse` reais em `src/__tests__/middleware.test.ts`
  (não é teste de unidade da função pura isolada — instancia o middleware
  de fato).
- Criar conta associa `user_id`: `POST /api/auth/signup` →
  `createUserAccount` cria `User` com `passwordHash` (bcrypt, 12 rounds) e
  retorna `id` utilizável; confirmado por teste de integração real contra
  Postgres (`src/lib/__tests__/user-account.integration.test.ts`), que
  também confere que a senha em texto plano nunca é persistida.
- Sessão sobrevive a reload: caminho anônimo confirmado pelo teste de
  middleware (cookie já presente não é reescrito, mesmo id preservado);
  caminho autenticado confirmado por
  `src/lib/__tests__/auth-callbacks.test.ts`, que exercita o callback
  `jwt` real do NextAuth simulando login seguido de reload (chamada sem
  `user`) e confirma que `userId` sobrevive no token, projetado depois por
  `session.user.id`.
- **Aprovado.**

### Integração entre as 3 tarefas do lote (checagem end-to-end do lote, não das tarefas isoladas)

- Schema do NextAuth (`User`/`Account`/`Session`/`VerificationToken`,
  convenção `@map` do Prisma Adapter) coexiste no mesmo
  `prisma/schema.prisma` sem colisão de nome de tabela/campo com o schema
  de domínio da L1-T02 (`trip_sessions`, `destination_approvals`, etc. —
  todos com `@@map` próprio). Migrations aplicadas em sequência
  (`20260908013916_init_schema` seguida de
  `20260908015150_l1_t03_nextauth_tables`) sem conflito.
- Autenticação e persistência de domínio realmente compartilham o mesmo
  Postgres provisionado: `src/lib/auth.ts` usa `PrismaAdapter(prisma)` com
  a mesma instância de `src/lib/prisma.ts` usada pelos testes de
  integração de L1-T02 e pela `DATABASE_URL` única definida em
  `.env`/CI — não há duas fontes de dado divergentes.
- `TripSession.userId` é nullable e **ainda sem relation/FK formal** para
  `User` — isso é uma decisão documentada em comentário no próprio schema
  (associação `TripSession`→`userId` autenticado é escopo do Lote 4,
  L4-T02), não uma inconsistência: L1-T03 só precisa deixar `userId`
  disponível para uso futuro, o que está satisfeito. Confirmado consistente
  com a Seção 4 do TASK.md (Lote 4 depende de L1-T02, não o contrário).
- Nenhum bug encontrado nesta integração cruzada.

### Requisitos não funcionais relevantes ao lote

- Segurança de cookie (httpOnly/secure/sameSite) — validado acima e também
  no chapéu DevSecOps (ver `SECURITY-REVIEW.md`).
- Nenhum requisito de UX/acessibilidade aplicável ainda (lote não introduz
  tela) — UX-SPEC.md só entra a partir do Lote 5/6.
- Nenhum requisito de performance aplicável ainda (sem geração via LLM
  neste lote).

### Bugs encontrados

Nenhum. Nenhuma reprovação crítica ou simples neste lote.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — não há bug, logo não há padrão recorrente a sinalizar.

## Checagem Estrutural do Lote (Validador, sem dispatch ao Coordenador)

- Todas as 3 tarefas do Lote 1 estão `Concluída` em `TASK.md` (Seção 3) —
  confirmado.
- Seção 4 (Dependências e Ordem de Execução): Lote 1 é a raiz, sem
  dependências de entrada; os lotes que dependem dele (2, 3, 4, 5) seguem
  íntegros na tabela — nenhuma dependência órfã/inconsistente relativa a
  este lote.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 1.
- Achado de DevSecOps (vulnerabilidades de dependência de terceiros, ver
  `SECURITY-REVIEW.md`) classificado como débito de severidade média,
  vinculado ao Gate de deploy — tarefa criada em `Refatoração Lote-1` (ver
  `TASK.md` Seção 3), não retorno ao Executor.

## Veredito de Release-Readiness do Lote 1

**Lote 1 pode fechar como `Validado`.** Nenhuma reprovação crítica ou
simples de QA. Achado de segurança de dependências (DevSecOps) registrado
como débito com prazo em `Refatoração Lote-1`, não bloqueante para o
fechamento deste lote (não bloqueia deploy imediato porque não há deploy
real neste ponto do plano; torna-se gate obrigatório antes do primeiro
deploy em produção — ver `SECURITY-REVIEW.md`).

## Lote 2 — Módulo de Feriados (determinístico, ADR-007)

Status geral: **Aprovado**. As 2 tarefas do lote passam nos respectivos
critérios de aceite, confirmados por leitura direta do código (não pela
nota do Executor) e por execução real da suíte. Um achado **simples** de
cobertura de teste foi encontrado (ver abaixo) — não compromete o critério
de aceite de nenhuma das 2 tarefas.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm test` (`vitest run`) | Passou — 10 arquivos, 60 testes (23 em `holidays.test.ts`, 6 em `feriados.test.ts`, restantes do Lote 1 sem regressão) |
| `npm run build` (`next build`) | Passou — build de produção completo, sem erro |

### L2-T01 — Cálculo determinístico de feriados nacionais BR + emenda

Critério de aceite: "Testes unitários cobrindo feriado em cada dia da
semana; nenhuma chamada a LLM no caminho de cálculo."

- `src/lib/__tests__/holidays.test.ts` cobre `calculateBridge` para os 7
  dias da semana (segunda a domingo), cada um com um caso de data real e
  asserção de `rangeStart`/`rangeEnd`/`totalDays`/`bridgeDays` — critério
  satisfeito literalmente.
- `getFixedHolidays`/`getMovableHolidays`/`calculateEaster` testados com
  múltiplos anos, sem hardcode de ano (confirmado por teste dedicado
  "não tem nenhum ano hardcoded").
- Confirmação de "nenhuma chamada a LLM no caminho de cálculo": além do
  teste automatizado (ver achado abaixo), fiz busca manual por
  `gateway-ia|openai|fetch\(|await fetch` em `src/lib/holidays.ts` e
  também em `src/lib/actions/feriados.ts` — **nenhuma ocorrência em
  nenhum dos dois arquivos**. RNF-07 está de fato satisfeito na
  implementação, não só no arquivo coberto pelo teste automatizado.
- RN-02 ("só feriados nacionais brasileiros"): `getFixedHolidays` lista
  exatamente os 8 feriados civis nacionais fixos; `getMovableHolidays`
  lista exatamente Carnaval, Sexta-feira Santa e Corpus Christi (móveis,
  derivados da Páscoa). Nenhum feriado estadual/municipal, comemorativo
  não-federal, ou de outro país presente em nenhuma das duas listas —
  **conforme RN-02/RF-02.4**. A decisão documentada de deixar de fora o
  Dia Nacional de Zumbi e da Consciência Negra (federal desde 2023, sem
  regra de vigência por ano implementada) é razoável para o escopo desta
  tarefa e foi corretamente registrada como decisão de produto pendente,
  não decidida em silêncio — não é lacuna que precise voltar ao
  Coordenador agora.
- Regra de emenda para dias diferentes de quinta-feira (único exemplo
  fechado no PRD-TECNICO.md): avaliada caso a caso contra o código
  (`calculateBridge`) — segunda/sexta (já contíguos ao fim de semana, sem
  emenda), terça/domingo (emenda de 1 dia para trás), quinta (emenda de 1
  dia para frente, o exemplo do PRD), quarta/sábado (sem emenda, dia
  isolado ou já no fim de semana). A lógica é internamente consistente
  (sempre emenda o mínimo de dias úteis necessários para conectar a um
  único fim de semana adjacente, nunca os dois lados) e não contradiz o
  único exemplo fechado no PRD-TECNICO.md. **Decisão de implementação
  razoável, não uma lacuna estrutural** — não escala ao Coordenador.
- **Aprovado.**

### L2-T02 — Server Action `getFeriadosProlongados`

Critério de aceite: "Retorna lista ordenada por data, com emenda
formatada, ano corrente e seguinte."

- Ano corrente resolvido via `new Date().getFullYear()` em tempo de
  execução (nunca hardcoded) — confirmado por teste com `vi.useFakeTimers`
  simulando datas diferentes (2026, 2030) e conferindo que o resultado
  sempre cobre `[anoAtual, anoAtual+1]`.
- Ordenação por data: garantida duas vezes (na fonte pura e novamente na
  borda de saída da Server Action) e testada explicitamente.
- Emenda formatada: `formatBridgeLabel` cobre os 3 casos possíveis
  (extensão para frente, para trás, sem emenda) com testes que comparam
  contra a fonte pura (`getNationalHolidaysWithBridgeInRange`), incluindo
  o exemplo literal do PRD-TECNICO.md/TASK.md ("Qui ... → estende até
  Dom ..., 4 dias"). Direção da seta ("estende até" vs. "emenda desde")
  coerente com a semântica de `calculateBridge` — confirmado lendo os
  dois arquivos lado a lado, não só a nota do Executor.
- **Aprovado.**

### Integração cruzada L2-T01 ↔ L2-T02

- `feriados.ts` consome exclusivamente as funções públicas de
  `holidays.ts` (nenhuma lógica de calendário duplicada); a Server Action
  reordena defensivamente por data na borda de saída em vez de confiar
  implicitamente no detalhe interno do módulo puro — boa prática de
  fronteira de camada, sem custo de teste (a ordenação já era garantida na
  origem, mas o teste de L2-T02 confirma o contrato também na borda
  pública).
- Nenhum bug de integração encontrado.

### Requisitos não funcionais relevantes ao lote

- RNF-07 (determinismo, sem LLM): validado (ver acima), com achado
  simples de cobertura de teste automatizado.
- Nenhum requisito de UX/acessibilidade aplicável ainda — este lote não
  introduz tela (consumo visual é do Lote 6, L6-T04/L6-T07).
- Nenhum requisito de performance aplicável — função pura síncrona, sem
  I/O.

### Bugs encontrados

**Achado simples (não crítico)** — Cobertura do teste automatizado de
RNF-07 não inclui `src/lib/actions/feriados.ts`: o teste "o código-fonte
de holidays.ts não referencia gateway de IA/LLM/rede"
(`src/lib/__tests__/holidays.test.ts`, describe "Determinismo /
independência de LLM (RNF-07)") faz `readFileSync` só de
`../holidays.ts`. A Server Action `getFeriadosProlongados`
(`src/lib/actions/feriados.ts`) é parte do mesmo caminho de cálculo
exposto ao usuário (RF-02.1) e hoje está de fato livre de qualquer
referência a LLM/rede (confirmado manualmente via busca acima), mas essa
garantia não é reforçada automaticamente por teste — uma mudança futura
nesse arquivo (ex.: alguém adicionar uma chamada a I/O na camada de
apresentação) não seria pega por este guardrail automatizado.
- **Classificação: simples** — não compromete o critério de aceite
  central de L2-T01 nem de L2-T02 (ambos já satisfeitos hoje, confirmado
  por revisão manual), não bloqueia nenhuma outra tarefa do lote (Lote 2
  está completo e fechando). Ajuste pontual: estender o `readFileSync`/
  regex do teste existente para cobrir também
  `src/lib/actions/feriados.ts` (e, por extensão, qualquer arquivo futuro
  do módulo de feriados).
- Tarefa criada em `Refatoração Lote-2` (ver `TASK.md`), a tarefa
  **permanece `Concluída`** (L2-T01 e L2-T02, ambas), conforme regra de
  achado simples.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — achado é pontual (escopo de teste de um guardrail
específico), não um padrão recorrente de decomposição/diretriz.

## Checagem Estrutural do Lote 2 (Validador, sem dispatch ao Coordenador)

- L2-T01 e L2-T02 estão `Concluída` em `TASK.md` (Seção 3) — confirmado.
- Seção 4 (Dependências e Ordem de Execução): Lote 2 depende de Lote 1
  (já `Validado`); os lotes que dependem do Lote 2 (L6-T04 depende de
  L2-T02, L6-T07 depende de L2-T01, ambos no Lote 6) seguem íntegros na
  tabela — nenhuma dependência órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 2.
- Achado simples de cobertura de teste (RNF-07) registrado em
  `Refatoração Lote-2` (ver `TASK.md`, RL2-T01) — sem prazo crítico
  (não é achado de segurança nem regressão funcional), sugerido antes do
  fechamento do Lote 6 (quando a UI passa a consumir este módulo em
  produção real de tela).

## Veredito de Release-Readiness do Lote 2

**Lote 2 pode fechar como `Validado com ressalvas`.** Nenhuma reprovação
crítica ou simples que exija retorno ao Executor. Um achado simples de
cobertura de teste (RNF-07) registrado como tarefa em `Refatoração
Lote-2` (RL2-T01), sem bloquear o fechamento deste lote. Ver também
`SECURITY-REVIEW.md` para o veredito do chapéu DevSecOps sobre o mesmo
lote.
