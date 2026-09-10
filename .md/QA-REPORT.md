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

## Lote 5 — Design System Base (componentes compartilhados)

Status geral: **Aprovado com ressalvas**. As 5 tarefas do lote (L5-T01 a
L5-T05) passam nos respectivos critérios de aceite, confirmados por
leitura direta do código-fonte de cada componente (não pela nota do
Executor) e por execução real da suíte. Dois achados **simples** foram
encontrados na revisão cruzada (ver abaixo) — nenhum compromete o
critério de aceite central de nenhuma tarefa, nenhum bloqueia outra
tarefa do lote.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm test` (`vitest run`) | Passou — 30 arquivos, **242 testes**, sem regressão |
| `npm run build` (`next build`) | Passou — build de produção completo; `/offline` gerada como rota estática (`○`); `/api/gateway-ia/[etapa]` e demais rotas de API seguem dinâmicas (`ƒ`) |

### L5-T01 — Tokens visuais + `StepperProgress`

Critério de aceite: "Paleta semântica (sucesso/atenção/erro) definida;
`StepperProgress` reflete estado vindo do servidor, nunca client-only."

- Paleta semântica confirmada em `src/app/globals.css`
  (`--success`/`--warning`/`--error`, com foreground dedicado cada) e
  exposta em `tailwind.config.ts` (`success`/`warning`/`error`) — presente
  e utilizável pelos componentes de L5-T02/L5-T03.
- `StepperProgress` (`src/components/design-system/stepper-progress.tsx`):
  único estado de entrada é a prop `currentState: SessionFlowState` (o
  mesmo tipo de `src/lib/session-flow/state-machine.ts`, L4-T01) — nenhum
  `useState`/lógica de navegação própria no componente; `getStepperStepStatuses`
  é função pura, sem efeito colateral. Confirmado: componente é
  estritamente controlado (mesma prop → mesmo markup), nunca decide
  sozinho o próprio avanço — conforme "nunca client-only".
- Contraste WCAG AA: os 7 pares texto/fundo citados na nota de
  implementação (`foreground`/`background` 18.96:1 etc.) foram
  reconferidos manualmente a partir dos valores HSL reais de
  `globals.css` (conversão HSL→RGB→luminância relativa) — todos batem com
  os valores documentados, folgados acima do mínimo de 4.5:1. **Conforme.**
- **Aprovado.**

### L5-T02 — `PriceRangeBadge` + `BudgetInsufficientBanner`

Critério de aceite: "Badge sempre com ícone + texto 'aproximado'; banner
nunca desabilita botões da tela."

- `PriceRangeBadge`: todo caminho de código que produz `label` sempre
  inclui `"(aproximado)"` para faixa normal (não há `return`/branch que
  omita o texto), e o ícone `Tag` é renderizado incondicionalmente antes
  do `label`, inclusive no caso "Gratuito" — confirmado lendo a função
  inteira, não só os testes.
- `BudgetInsufficientBanner`: contrato de props (`show`/`differenceLabel`/
  `className`) não inclui nenhuma prop capaz de tocar um elemento irmão;
  o componente é `role="status"` autocontido, sem `onDismiss` bloqueante.
  RN-04 garantido estruturalmente (não só por convenção de uso) —
  confirmado por teste dedicado (`toBeEnabled()` de um botão irmão nos
  dois estados de `show`).
- **Aprovado.**

### L5-T03 — `LoadingStream` + `ErrorRetryState` + `EmptyState`

Critério de aceite: "`LoadingStream` renderiza conteúdo progressivo real
(não spinner genérico) conforme mecanismo escolhido no spike;
`aria-live='polite'` presente."

- `LoadingStream` consome exatamente o mecanismo do SPIKE-01 (`fetch` +
  `response.body.getReader()` + `TextDecoder`), sem `Server Actions`/
  `ai/rsc` — confirmado por leitura do `useEffect` inteiro. O estado
  `streaming` acumula o texto real chegado (`accumulated += decoder.decode(...)`)
  e é isso que é renderizado, não um placeholder genérico — teste
  `loading-stream.test.tsx` prova entrega incremental real com
  timestamps distintos.
- `aria-live="polite"` presente na região única que cobre rótulo +
  conteúdo; `aria-busy` reflete `connecting`/`streaming`. Trade-off de
  granularidade de anúncio (documentado no próprio arquivo) é aceitável
  para esta tarefa — nenhuma tela real consome o componente ainda para
  validar com leitor de tela real.
- `ErrorRetryState`/`EmptyState`: sem retry automático embutido (conforme
  Diretriz de Implementação 7) — `onRetry` só é chamado pelo clique
  explícito do usuário, nunca de forma automática/em loop. Confirmado por
  teste ("`onRetry` chamado exatamente uma vez por clique e nunca
  sozinho").
- **Aprovado.**

### L5-T04 — `SuggestionCard`

Critério de aceite: "Estrutura visual idêntica entre os 3 usos, conteúdo
variável, acessível por teclado."

- Estrutura idêntica confirmada por teste dedicado que compara o
  `className` do container raiz nos 3 casos simulados (T04/T06/T07).
- Acessibilidade por teclado: o card não introduz `onClick`/`tabIndex`
  próprio — toda a ordem de tab vem de `leading`/`actions` (elementos
  nativos passados pelo chamador); teste com `userEvent.tab()` confirma a
  ordem natural do DOM sem "trap" de foco.
- **Aprovado.**

### L5-T05 — PWA (Manifest + Service Worker)

Critério de aceite: "App instalável; assets estáticos em cache; funciona
offline apenas para shell da UI, não para geração de conteúdo."

- Manifest com todos os campos de instalabilidade (`name`/`short_name`/
  `start_url`/`display: "standalone"`/ícones 192/512) — confirmado por
  leitura de `public/manifest.webmanifest` e reforçado pelo teste
  automatizado (`pwa.test.ts`).
- Service Worker (`public/sw.js`): shell estático (`/`, `/offline`,
  manifest, ícones) precacheado; demais assets same-origin em cache-first
  sob demanda; **nenhuma rota `/api/` é interceptada** (guard
  `isNeverCachePath` roda antes de qualquer `caches.match`/`cache.put` e
  retorna sem `event.respondWith` — confirmado por leitura direta do
  handler `fetch`, não só pela nota do Executor). Isso cobre literalmente
  o critério "não funciona offline para geração de conteúdo", já que toda
  geração passa por `/api/gateway-ia/[etapa]`.
- `/offline` é 100% estático (sem Server Action/DB/Gateway de IA) —
  confirmado no output de `npm run build` (rota `○`, estática) e por
  leitura do código (nenhum `fetch`/import de módulo de dado).
- **Aprovado.**

### Integração cruzada entre os 5 componentes do Lote 5

- `SuggestionCard` (L5-T04) usa `PriceRangeBadge` (L5-T02) via spread de
  props (`<PriceRangeBadge {...price} />`), sem reimplementar formatação
  de preço — confirmado por leitura direta, consistente com a Diretriz de
  Implementação 6 ("proibido renderizar preço fora dele").
- `StepperProgress` (L5-T01) usa exclusivamente os tokens Tailwind do
  próprio L5-T01 (`accent`, `border`, `background`, `foreground[-muted]`)
  — nenhuma cor hardcoded fora da paleta definida, sem colisão com os
  tokens semânticos consumidos por L5-T02/L5-T03 (`success`/`warning`/
  `error`, usados só onde fazem sentido semanticamente — atenção/erro —,
  nunca reaproveitados incorretamente pelo Stepper).
- `LoadingStream`/`ErrorRetryState`/`EmptyState`/`SuggestionCard`
  (L5-T03/L5-T04) usam a mesma classe base `border-border bg-surface` —
  moldura visual consistente entre os componentes de bloco de conteúdo do
  design system, sem um usar `card`/`popover` (aliases shadcn) enquanto
  outro usa `surface` diretamente.
- Service Worker (L5-T05) x Gateway de IA (Lote 3) e demais componentes
  deste lote que dependem de rede: confirmado que **nenhuma** rota sob
  `/api/` é interceptada pelo SW — isso cobre tanto
  `/api/gateway-ia/[etapa]` (consumido futuramente por `LoadingStream`)
  quanto `/api/auth/*`/`/api/anonymous-session` (Lote 1). Testado que o
  guard de exclusão por prefixo roda antes de qualquer leitura/escrita de
  cache, e que o path é resolvido via `URL.pathname` (normalizado pelo
  parser — não há bypass trivial por `..`/variação de path para escapar
  do prefixo `/api/`, ver também `SECURITY-REVIEW.md`).
- **Achado simples 1 (inconsistência cross-componente L5-T01 ↔ L5-T05)**:
  `public/manifest.webmanifest` define `background_color`/`theme_color`
  como `"#0F172A"` (azul-marinho, próximo do `slate-900` padrão do
  Tailwind) — mas o token real `--background` definido em L5-T01
  (`src/app/globals.css`) é `240 5% 4%` (~`#0a0a0b`, quase preto, tema
  "Concierge Noturno"). Isso não quebra nenhuma funcionalidade, mas a tela
  de splash/status bar do PWA instalado (que usa esses dois campos do
  manifest) vai mostrar uma cor visivelmente diferente do fundo real do
  app assim que o conteúdo carregar — inconsistência visual perceptível,
  não um requisito de UX-SPEC.md violado literalmente (o UX-SPEC.md não
  fala de manifest), mas contraria a intenção de L5-T01 (tokens
  centralizados, "nenhum sistema paralelo de cor").
  - **Classificação: simples** — não compromete o critério de aceite
    central de L5-T01 nem de L5-T05 (ambos satisfeitos, isoladamente,
    hoje), não bloqueia nenhuma outra tarefa do lote (lote completo).
    Ajuste pontual: alinhar `background_color`/`theme_color` do manifest
    ao valor real de `--background` (~`#0a0a0b`).
- **Achado simples 2 (acessibilidade — `StepperProgress`)**: cada
  `StepDot` (`src/components/design-system/stepper-progress.tsx`) usa
  ícone `Check` com `aria-hidden="true"` + atributo HTML `title` (ex.
  "Etapa concluída") como o diferencial não-visual exigido pelo UX-SPEC
  §5 ("nenhuma etapa comunicada só por cor"). O atributo `title` em um
  `<span>` sem papel/atributo ARIA adicional não é anunciado de forma
  confiável por todos os leitores de tela durante navegação por
  virtual cursor/browse mode (funciona melhor como tooltip de hover para
  usuário de mouse do que como texto acessível para usuário de leitor de
  tela) — como o ícone que acompanha é `aria-hidden`, um usuário de
  leitor de tela pode não receber nenhuma pista textual confiável do
  status de cada etapa além da posição relativa no DOM. Não é uma
  violação literal do UX-SPEC.md (que não especifica a técnica exata de
  texto alternativo), e a intenção documentada no componente (ícone +
  `title` além de cor) é correta — mas a implementação escolhida para o
  "texto" tem suporte de AT inconsistente.
  - **Classificação: simples** — não compromete o critério de aceite
    central de L5-T01 (que não menciona leitor de tela explicitamente
    para o Stepper) nem bloqueia outra tarefa do lote. Ajuste pontual:
    adicionar um `<span className="sr-only">` com o mesmo texto de
    `title` dentro de cada `StepDot` (ou `aria-label` no elemento pai),
    garantindo que o status de cada etapa seja exposto de forma confiável
    à árvore de acessibilidade independentemente de suporte a `title`.
- Nenhum outro bug de integração cruzada encontrado.

### Requisitos não funcionais relevantes ao lote

- Acessibilidade WCAG AA (TASK.md Seção 1, item 10 — não-negociável),
  conferida em todos os 6 componentes deste lote:
  - Contraste: todos os pares texto/fundo usados pelos componentes do
    Lote 5 (`foreground`/`background`, `foreground-muted`/`surface`,
    `warning`/`surface`, `error`/`surface`, `accent`(-foreground)/
    `accent`) reconferidos acima do mínimo AA (ver L5-T01).
  - Navegação por teclado: nenhum componente deste lote introduz
    elemento focável fora de ordem natural do DOM; `StepperProgress`
    deliberadamente não é focável (justificado — não há navegação por
    clique nele em nenhuma tela do UX-SPEC.md); `SuggestionCard`
    confirmado por teste de tabulação.
  - `aria-live`/`role`/`aria-current`: `LoadingStream`
    (`aria-live="polite"` + `aria-busy`), `ErrorRetryState`
    (`role="alert"`), `BudgetInsufficientBanner` (`role="status"`),
    `StepperProgress` (`aria-current="step"` só na etapa ativa) — todos
    presentes e usados na semântica correta (status não-urgente vs. alerta
    imediato vs. progresso).
  - Nenhuma informação só por cor: confirmado em todos os 6 componentes
    (ícone + texto sempre, nunca só cor/borda) — **exceto** o achado
    simples 2 acima (title vs. sr-only no `StepperProgress`), que é uma
    lacuna de robustez de implementação da regra, não uma ausência da
    regra.
- Performance/streaming: não aplicável de forma mensurável neste lote
  (sem endpoint real consumido por `LoadingStream` ainda — isso ocorre a
  partir do Lote 7); o mecanismo (SPIKE-01) já foi validado
  empiricamente no próprio spike.

### Bugs encontrados

Dois achados **simples** (ver "Integração cruzada" acima) — nenhuma
reprovação crítica. Todas as 5 tarefas do Lote 5 **permanecem
`Concluída`**.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — os dois achados são pontuais (um de dado de configuração
estático, outro de técnica de acessibilidade num único componente), não
um padrão recorrente de decomposição/diretriz de implementação.

## Checagem Estrutural do Lote 5 (Validador, sem dispatch ao Coordenador)

- As 5 tarefas do Lote 5 (L5-T01 a L5-T05) estão `Concluída` em `TASK.md`
  (Seção 3) — confirmado.
- Seção 4 (Dependências e Ordem de Execução): Lote 5 depende de Lote 1
  (já `Validado`) e do SPIKE-01 (já `Resolvido`, ver Seção 2) — ambos
  íntegros; os lotes que dependem do Lote 5 (Lotes 6, 7, 8, 9, 10, todos
  ainda não iniciados) seguem consistentes na tabela — nenhuma dependência
  órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 5.
- Dois achados simples (inconsistência de cor do manifest; robustez de
  acessibilidade do `StepperProgress`) registrados em `Refatoração
  Lote-5` (ver `TASK.md`) — não bloqueiam o fechamento deste lote.

## Veredito de Release-Readiness do Lote 5

**Lote 5 pode fechar como `Validado com ressalvas`.** Nenhuma reprovação
crítica ou simples que exija retorno ao Executor. Dois achados simples
(cor de manifest desalinhada do token real; robustez de acessibilidade de
`title` vs. `sr-only` no `StepperProgress`) registrados como tarefas em
`Refatoração Lote-5` (RL5-T01/RL5-T02), sem bloquear o fechamento deste
lote. Ver também `SECURITY-REVIEW.md` para o veredito do chapéu DevSecOps
sobre o mesmo lote (auditoria com atenção especial ao Service Worker,
entre outros pontos do lote).

## Lote 3 — Gateway de IA

Status geral: **Aprovado**. As 5 tarefas do lote (L3-T01 a L3-T05) passam
nos respectivos critérios de aceite, confirmados por leitura direta do
código (`src/lib/gateway-ia/`, `src/app/api/gateway-ia/[etapa]/route.ts`) —
não pela nota de implementação do Executor — e por execução real da suíte.
Nenhuma reprovação crítica ou simples encontrada.

### Suíte executada (ambiente local)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm test` (`vitest run`) | Passou — 41 arquivos, **300 testes** no total, incluindo as 9 suítes do módulo `gateway-ia` (`index.test.ts`, `stream.test.ts`, `generation-log.test.ts`, `rate-limit.test.ts`, `validation.test.ts`, `prompts.test.ts`, `schemas.test.ts`) e a suíte da rota (`src/app/api/gateway-ia/[etapa]/__tests__/route.test.ts`), todas com SDK da OpenAI/Prisma mockados (sem chamada de rede/banco real) |
| `npm run build` (`next build`) | Passou — build de produção completo; `/api/gateway-ia/[etapa]` confirmada como rota dinâmica (`ƒ`), não estática (`○`), consistente com o achado do SPIKE-01 |

### L3-T01 — Client OpenAI + interface interna abstrata do Gateway de IA

Critério de aceite: "Chamada de teste retorna JSON validado contra schema
simples; API key só via env."

- `src/lib/gateway-ia/client.ts`: `getOpenAIClient()`/`getOpenAIModel()` só
  leem `process.env.OPENAI_API_KEY`/`OPENAI_MODEL`; `readApiKeyFromEnv()`
  lança erro explícito se a variável estiver ausente/vazia — nenhuma
  chamada ao provider é feita sem chave configurada. Nenhum valor de
  API key hardcoded em nenhum arquivo do módulo (confirmado por leitura de
  `client.ts`, `index.ts`, `.env.example` — só placeholder `"sk-..."`).
  `client.ts` não é reexportado por `index.ts` (fronteira interna mantida).
- `generateStructuredCompletion` (`index.ts`) usa
  `client.chat.completions.parse` + `zodResponseFormat` (SDK oficial da
  OpenAI) — retorna `result.data` já validado contra o schema Zod
  informado (não texto livre reempacotado); confirmado por
  `index.test.ts`, primeiro caso: `destinoSchema.parse(result.data)` não
  lança, e `callArgs.response_format.type === "json_schema"`.
- Segundo caso de `index.test.ts` confirma que a ausência de
  `OPENAI_API_KEY` lança erro explícito citando a variável, sem nenhuma
  chamada ao SDK (`parseMock` não é chamado).
- **Aprovado.**

### L3-T02 — Prompt design por etapa + streaming (SPIKE-01)

Critério de aceite: "Prompt de cada etapa documentado; schema de saída
validado; mecanismo de streaming escolhido no spike aplicado."

- `src/lib/gateway-ia/prompts.ts`: 4 `buildXPrompt` (destino, hospedagem,
  passeios, roteiro), cada um documentado com o RF correspondente,
  grounding de data (`formatDateRangeLine`) e orçamento
  (`formatBudgetLine`, nunca bloqueante — RF-10.3, confirmado pelo caso de
  teste "orçamento não informado nunca bloqueia" em `prompts.test.ts`).
  Etapas com pré-condição (hospedagem precisa de destino; roteiro precisa
  de destino+hospedagem) lançam erro explícito quando chamadas sem ela —
  12 casos em `prompts.test.ts` cobrindo cada etapa + os erros de
  pré-condição.
- `src/lib/gateway-ia/schemas.ts`: 4 schemas Zod (`destinoSugestoesSchema`
  2-4 itens, `hospedagemOpcoesSchema` exatamente 3, `passeiosOpcoesSchema`
  mín. 1 podendo ter preço 0, `roteiroEstruturadoSchema` dias com
  manhã/tarde/noite) — 13 casos em `schemas.test.ts` cobrindo payload
  válido e inválido de cada um.
- Streaming: `streamStructuredCompletion` (`index.ts`) usa
  `client.chat.completions.stream(...)` (SDK oficial), o mesmo
  `response_format` de `generateStructuredCompletion`, encapsulado num
  `ReadableStream<Uint8Array>` que emite deltas via `content.delta` e
  fecha via `finalChatCompletion()` — mecanismo Route Handler +
  `ReadableStream` decidido em SPIKE-01, efetivamente aplicado, não só
  citado em comentário. `cancel()` aborta o `chatStream` do SDK
  (confirmado por caso dedicado em `stream.test.ts`, SDK mockado, 4 casos:
  entrega incremental real por timestamps diferentes, propagação de
  `GatewayIaError` em recusa/erro, abort no `cancel()`).
- `src/app/api/gateway-ia/[etapa]/route.ts`: `export const dynamic =
  "force-dynamic"` presente (repete o achado do SPIKE-01 — sem essa
  diretiva o Next 14 estatiza a rota em build); confirmado empiricamente
  pelo `npm run build` acima (rota listada como `ƒ`, não `○`). Valida o
  corpo contra `stageContextSchema` (400 em contexto inválido/pré-condição
  não atendida), resolve a etapa via `GATEWAY_IA_STAGES` (404 em etapa
  desconhecida), devolve 502 em falha do Gateway de IA — 5 casos em
  `route.test.ts`, incluindo entrega incremental do corpo 200 (chunks em
  timestamps diferentes, mesmo padrão de prova do SPIKE-01). Nenhum
  `import` de `openai` fora do módulo `gateway-ia` (fronteira mantida,
  confirmado por leitura do arquivo).
- **Aprovado.**

### L3-T03 — Validação de plausibilidade de preço + grounding de data

Critério de aceite: "Resposta com preço fora de faixa plausível é
rejeitada/reprocessada; datas geradas nunca conflitam com o range da
sessão."

- `src/lib/gateway-ia/validation.ts`: `validatePricePlausibility` rejeita
  faixa invertida, acima de `MAX_PLAUSIBLE_PRICE_BRL`, "zero-zero" quando
  não gratuito, e razão `max/min` acima de `MAX_PLAUSIBLE_PRICE_RATIO` —
  aplicado às 3 etapas com preço (`destino`/`hospedagem`/`passeios`);
  `validateDateGrounding` rejeita data fora do range ou não interpretável
  como ISO, só para a etapa `roteiro`. 18 casos em `validation.test.ts`.
- Integração confirmada dentro de `generateStructuredCompletion`
  (`index.ts`): chamada de `validateGatewayIaOutput` acontece DEPOIS da
  checagem de schema/recusa (`message.parsed`) e ANTES do `return` — ordem
  correta (rejeita antes de expor ao chamador), lançando `GatewayIaError`
  (mesmo tipo do módulo). Confirmado por leitura direta do código (linhas
  236-271 de `index.ts`) e por 4 casos de integração em `index.test.ts`
  (preço implausível rejeitado/plausível aceito na etapa destino; data
  fora do range rejeitada/dentro do range aceita na etapa roteiro), usando
  o schema real da etapa (não um schema de teste arbitrário).
- A variante de streaming (`streamStructuredCompletion`) deliberadamente
  não aplica esta validação — documentado no código como decisão de
  design (streaming só entrega percepção de progresso; a decisão de
  negócio real usa a variante não-streaming) — confirmado consistente:
  nenhuma chamada a `validateGatewayIaOutput` dentro de
  `streamStructuredCompletion`. Não é uma lacuna, é escopo correto.
- **Aprovado.**

### L3-T04 — Retry único automático + `LlmGenerationLog`

Critério de aceite: "Falha simulada gera exatamente 1 retry automático;
log gravado em sucesso e falha; erro exposto ao chamador após 2ª falha."

- `generateStructuredCompletionWithRetry` (`index.ts`): laço com teto
  rígido `MAX_GATEWAY_IA_ADDITIONAL_RETRIES = 1` (nunca loop aberto) ao
  redor de `generateStructuredCompletion` (já incluindo a validação de
  L3-T03) — falha por qualquer motivo (erro do provider OU rejeição de
  `validateGatewayIaOutput`) dispara exatamente 1 tentativa adicional;
  falha na 2ª propaga `GatewayIaError`. Confirmado por 5 casos em
  `generation-log.test.ts` (SDK OpenAI e Prisma Client mockados, sem
  chamada de rede/banco real): sucesso de 1ª sem retry (`parseMock` 1x);
  falha simulada + sucesso na 2ª (`parseMock` 2x, `retryCount: 1`); falha
  nas duas (`GatewayIaError`, log `status: "failed_after_retry"`,
  `retryCount: 1`); rejeição de `validateGatewayIaOutput` (L3-T03) também
  dispara o retry; falha ao gravar o log não derruba um resultado de
  sucesso já obtido (não-fatal, `console.error` chamado).
- `writeLlmGenerationLog` (`generation-log.ts`) grava todos os 9 campos
  não-automáticos de `LlmGenerationLog` (`prisma/schema.prisma` linhas
  275-296): `sessionId`, `stage`, `provider` ("openai" fixo, único
  provider do ADR-002), `promptVersion` (reaproveita `schemaName`,
  decisão documentada), `tokensInput`/`tokensOutput` (de `usage`, ou `0`
  em falha antes de retornar `usage` — campos `Int` não anuláveis do
  schema, decisão correta), `costEstimateUsd` (calculado,
  `estimateGatewayIaCostUsd`), `latencyMs`, `retryCount`, `status` — nenhum
  campo do modelo fica de fora (`createdAt` é `@default(now())`,
  automático). Confirmado campo a campo por leitura cruzada de
  `generation-log.ts` × `prisma/schema.prisma` × os `toMatchObject` dos 5
  testes.
- `latencyMs`: `startedAt = Date.now()` está ANTES do laço `for` em
  `generateStructuredCompletionWithRetry` (não dentro dele) — mede a
  chamada lógica inteira, incluindo eventual retry, não só a última
  tentativa. Este é o ponto que já foi objeto de uma correção pós-revisão
  registrada em `TASK.md` (nota "Correção pós-revisão inline"); confirmado
  aqui que a correção está de fato aplicada no código atual, não é apenas
  uma nota histórica.
- Falha ao gravar o log é não-fatal (`try/catch`, nunca lança) — confirmado
  por teste dedicado e por leitura do `catch` em `writeLlmGenerationLog`.
- **Aprovado.**

### L3-T05 — Rate limiting por sessão/IP

Critério de aceite: "Limite configurável; excesso retorna erro tratável,
não exceção não capturada."

- `src/lib/gateway-ia/rate-limit.ts`: contador em memória por processo,
  janela fixa de 60s por chave; `getGatewayIaRateLimitPerMinute()` lê
  `AI_GATEWAY_RATE_LIMIT_PER_MINUTE` a cada chamada, com fallback seguro
  de 10/min se ausente/inválida (documentado e reservado em
  `.env.example`). `registerGatewayIaCall` nunca lança — só retorna
  `true`/`false`. `checkGatewayIaRateLimit` (`index.ts`) traduz `false`
  para `GatewayIaError` (mesmo tipo do módulo, nunca exceção não tratada).
  7 casos em `rate-limit.test.ts`: limite respeitado dentro da janela,
  configurável via env, contadores independentes por chave, expiração de
  janela, excesso tratável tanto no contador de baixo nível quanto na
  guarda pública.
- **Aprovado.**

### Testes de integração cruzada entre as tarefas do lote

- L3-T02 usa o client de L3-T01: `generateStructuredCompletion` e
  `streamStructuredCompletion` (ambos em `index.ts`, escritos/estendidos
  em L3-T02) chamam `getOpenAIClient()`/`getOpenAIModel()` de `./client.ts`
  (L3-T01) — confirmado por leitura direta; nenhuma segunda instância de
  client é criada fora deste ponto.
- L3-T03 (validação) e L3-T04 (retry+log) estão de fato integrados dentro
  de `generateStructuredCompletion`/`generateStructuredCompletionWithRetry`
  em `index.ts`, na ordem certa: schema → recusa → **validação semântica
  (L3-T03)** dentro do "núcleo de uma tentativa"
  (`generateStructuredCompletion`) → **retry + log (L3-T04)** envolvendo
  esse núcleo inteiro em `generateStructuredCompletionWithRetry`. Uma
  rejeição de L3-T03 portanto participa do retry de L3-T04 (confirmado
  pelo caso de teste dedicado em `generation-log.test.ts`) — a composição
  funciona como projetada, não como duas peças desconectadas.
- L3-T05 (rate limiting) é uma guarda separada
  (`checkGatewayIaRateLimit`), **não** integrada automaticamente dentro de
  `generateStructuredCompletion`/`WithRetry`. Confirmado por leitura: nem
  `generateStructuredCompletion` nem `generateStructuredCompletionWithRetry`
  chamam `registerGatewayIaCall`/`checkGatewayIaRateLimit` internamente.
  **Avaliação: é uma decisão de design documentada, não uma lacuna real
  desta tarefa.** O critério de aceite de L3-T05 ("limite configurável;
  excesso retorna erro tratável") não exige integração automática, e o
  próprio módulo justifica a separação: `rate-limit.ts` não importa
  `next/headers` nem lê cookie/IP para preservar a fronteira do Gateway de
  IA (SDD §7 trata a composição da chave — sessão anônima/`user_id`/IP —
  como responsabilidade de quem tem acesso à requisição HTTP, que não é
  este módulo). A tabela de tarefas também modela `L3-T05` como
  paralelizável com `L3-T02` (não sequencial/dependente), reforçando que a
  integração automática nunca foi esperada dentro do Lote 3. O ponto de
  chamada real (Orquestrador de Sessão/Server Action de cada etapa,
  L7-T01/L8-T01/L9-T01/L10-T01) ainda não existe no projeto — o risco de
  "esquecer de chamar `checkGatewayIaRateLimit`" quando essas tarefas
  forem implementadas é uma preocupação válida, mas é responsabilidade de
  validação de **lotes futuros** (7/8/9/10), não algo que este lote possa
  ou deva antecipar sem essas tarefas existirem — não gera achado/tarefa
  de Refatoração Lote-3 agora.

### Requisitos não funcionais relevantes ao lote

- **Observabilidade (SDD §5/§6, TASK.md Seção 1 item 8)**: todos os 9
  campos não-automáticos de `LlmGenerationLog` são de fato gravados a cada
  chamada lógica ao provider, em sucesso e em falha — nenhuma chamada
  "silenciosa" (ver L3-T04 acima). Falha ao gravar o log não derruba uma
  chamada que teve sucesso no provider, mas também não é engolida
  silenciosamente (`console.error`).
- **Segurança básica (TASK.md Seção 1 item 9, escopo deste chapéu)**: API
  key só via `process.env.OPENAI_API_KEY`/`OPENAI_MODEL`
  (`client.ts`) — nenhum segredo hardcoded em nenhum arquivo do módulo
  `gateway-ia` ou da rota (`route.ts`), confirmado por leitura de todos os
  arquivos do módulo. `.env.example` documenta as 3 variáveis
  (`OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_GATEWAY_RATE_LIMIT_PER_MINUTE`)
  só com placeholders. Nenhum log grava conteúdo de prompt/resposta bruta
  (só metadados: contagem de tokens, custo, latência, status) — sem
  exposição de dado potencialmente sensível do usuário (orçamento,
  destino) em `LlmGenerationLog`. Auditoria de segurança completa
  (autorização de dono de sessão, prompt injection, etc.) é escopo do
  chapéu DevSecOps, não repetida aqui — mas nada encontrado nesta
  checagem básica que a antecipe negativamente.
- Retry único (RNF-05/ADR-004): confirmado teto rígido de 1 tentativa
  adicional, nunca loop — ver L3-T04 acima.

### Bugs encontrados

Nenhum. Nenhuma reprovação crítica nem simples neste lote.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — nenhum bug encontrado, logo nenhum padrão a sinalizar.

## Checagem Estrutural do Lote 3 (Validador, sem dispatch ao Coordenador)

- As 5 tarefas do Lote 3 (L3-T01 a L3-T05) estão `Concluída` em `TASK.md`
  (Seção 3) — confirmado.
- Seção 4 (Dependências e Ordem de Execução): Lote 3 depende de L1-T01/
  L1-T02/L1-T03 (Lote 1, já `Validado`) e do SPIKE-01 (já `Resolvido`); os
  lotes que dependem do Lote 3 (L7-T01, L8-T01, L9-T01, L10-T01, L11-T03,
  todos ainda não iniciados/fora do escopo desta validação) referenciam
  L3-T02/L3-T03/L3-T04 corretamente na tabela — nenhuma dependência
  órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 3.
- Nenhum achado simples/débito baixo-médio a registrar em
  `Refatoração Lote-3` — nenhuma tarefa nova criada.

## Veredito de Release-Readiness do Lote 3

**Lote 3 pode fechar como `Validado`** (sem ressalvas). As 5 tarefas
(L3-T01 a L3-T05) passam nos critérios de aceite literais do `TASK.md`,
`npm run lint`/`npm test` (300 testes)/`npm run build` passam sem
regressão, a composição entre as tarefas (client → prompt/schema →
validação → retry/log; rate limiting como guarda separada e
intencionalmente não integrada ainda) funciona como projetada, e a
checagem de segurança básica (API key só via env, nenhum segredo
hardcoded, nenhum dado sensível em log) não encontrou problema. **O lote
está liberado para a auditoria de segurança completa do chapéu DevSecOps
(Seção 3 do comando `/validar`)** — nenhuma reprovação crítica exige parar
aqui.
`public/sw.js`).

## Lote 4 — Orquestração de Sessão e Regra de Orçamento

**Nota de processo**: as 3 tarefas deste lote (L4-T01 a L4-T03) já estavam
`Concluída` em `TASK.md` desde 2026-09-09, mas o lote nunca recebeu uma
seção própria de validação neste relatório (nem em `SECURITY-REVIEW.md`) —
os Lotes 6/7/8/9/10, que dependem diretamente dele, começaram a ser
executados sem essa validação ter sido registrada. Achado durante a
checagem estrutural do Lote 7 (ver seção correspondente abaixo). Validado
retroativamente agora, antes de prosseguir com o veredito do Lote 7 (que
inclui uma extensão dos próprios arquivos deste lote, ADR-006 Adendo 2).

Status geral: **Aprovado**. As 3 tarefas passam nos critérios de aceite,
confirmados por leitura direta do código (`src/lib/session-flow/`) — não
pela nota de implementação do Executor. Nenhuma reprovação crítica ou
simples encontrada.

### L4-T01 — State machine server-side (ADR-006)

Critério de aceite: "Transição inválida (pular etapa) é rejeitada; todos os
estados do ADR-006 implementados."

- `src/lib/session-flow/state-machine.ts`: os 11 estados de
  `SESSION_FLOW_STATES` batem literalmente com o vocabulário do ADR-006.
  `transitionSessionFlow` rejeita pular etapa e qualquer ação a partir de
  estado terminal (`TERMINAL_STATES`), via `InvalidTransitionError`
  (confirmado por leitura de `SEQUENTIAL_TRANSITIONS`/`STATES_WITH_AT_LEAST_ONE_APPROVAL`).
  Módulo puro, sem import de Prisma/runtime — confirmado.
- **Aprovado.**

### L4-T02 — Persistência de transição de etapa (RF-09, RN-03)

Critério de aceite: "Aprovar uma etapa persiste a entidade filha certa;
encerrar em qualquer ponto preserva o já aprovado (RN-03)."

- `src/lib/session-flow/persistence.ts`: `applySessionFlowTransition`
  decide via `transitionSessionFlow` (L4-T01) ANTES de qualquer escrita,
  valida `childData.stage` contra `APPROVAL_STAGE_BY_PENDING_STATE`, e só
  então grava `tx.tripSession.update` + `tx.<entidade>.create`/`createMany`
  dentro de uma única `prisma.$transaction` — rollback automático garante
  atomicidade. `encerrar` nunca passa pelo branch de criação de entidade
  filha (RN-03, confirmado por leitura: o `if (input.action === "aprovar")`
  é o único ponto de chamada de `persistApprovedChildData`).
- Sincronização de `status` só nos terminais (`concluida`→`completed`,
  `encerrada_parcial`→`partial`), conforme ADR-006 Adendo 1 — confirmado.
- **Aprovado.**

### L4-T03 — Regra RF-10 (filtro/priorização de orçamento)

Critério de aceite: "Com orçamento informado, sugestões fora da faixa não
aparecem como prioritárias; sem opção na faixa, retorna a mais barata com
flag de excedente; ausência de orçamento nunca bloqueia."

- `src/lib/session-flow/budget-filter.ts`: `applyBudgetFilter` — sem
  orçamento, devolve a lista original inalterada, todas `withinBudget: true`
  (RF-10.3/RN-04, nunca bloqueia); com orçamento e ao menos uma opção
  dentro, reordena (dentro primeiro, fora depois, sem remover nenhuma —
  interpretação documentada e consistente com RN-04); sem nenhuma opção
  dentro, devolve a mais barata primeiro com `exceedsBudget: true`, nunca
  lista vazia nem erro (RF-10.2). Lógica pura, sem I/O — confirmado por
  leitura completa do arquivo.
- **Aprovado.**

### Integração entre as 3 tarefas do lote

- L4-T02 consome `transitionSessionFlow` de L4-T01 como decisão pura antes
  de qualquer escrita — confirmado (não duplica a lógica de transição).
- L4-T03 é ortogonal à state machine/persistência (função pura,
  co-localizada no mesmo diretório) — consumida de fato só a partir de
  L7-T01 (`generateDestinationSuggestions`), fora do escopo deste lote em
  si; consistente com a tabela de dependências (L4-T03 não bloqueia
  L4-T01/L4-T02).

### Requisitos não funcionais relevantes ao lote

- **RN-03** (sessão parcial nunca é erro): garantida estruturalmente pela
  separação de branches em `persistence.ts` — confirmado acima.
- **Autorização de dono de sessão** (SDD §7, GUARDRAILS.md regra 16): não
  implementada neste lote, de propósito — `applySessionFlowTransition`
  recebe `sessionId` já resolvido pelo chamador, sem checar dono. Consistente
  com a lacuna já rastreada e aceita em `L11-T02` (Lote 11, cross-cutting),
  não uma omissão deste lote.

### Bugs encontrados

Nenhum. Nenhuma reprovação crítica nem simples neste lote.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — nenhum bug encontrado.

## Checagem Estrutural do Lote 4 (Validador, sem dispatch ao Coordenador)

- As 3 tarefas do Lote 4 (L4-T01 a L4-T03) estão `Concluída` em `TASK.md`
  (Seção 3) — confirmado.
- Seção 4: Lote 4 depende de L1-T02 (Lote 1, já `Validado`); os lotes que
  dependem do Lote 4 (6, 7, 8, 9, 10, 11) referenciam L4-T01/T02/T03
  corretamente — nenhuma dependência órfã/inconsistente relativa a este
  lote.
- Bloqueio 001 (`.md/BLOCKERS.md`) está `Resolvido`, com a resolução
  (ADR-006 Adendo 1) de fato aplicada no código (`flowState`/enum
  `SessionFlowState` migrados, confirmado por leitura de
  `prisma/schema.prisma` e do código de `persistence.ts`).
- Nenhum achado simples/débito baixo-médio a registrar em
  `Refatoração Lote-4` — nenhuma tarefa nova criada.

## Veredito de Release-Readiness do Lote 4

**Lote 4 pode fechar como `Validado`** (sem ressalvas), retroativamente.
As 3 tarefas passam nos critérios de aceite literais do `TASK.md`, a
composição entre elas funciona como projetada, e nenhum problema foi
encontrado. **Nota de processo registrada**: este lote deveria ter sido
validado antes do início dos Lotes 6/7/8/9/10 que dependem dele — nenhum
dano concreto foi identificado retroativamente (o código de L4-T01/T02/T03
está correto), mas o gate de validação por lote não foi seguido à risca
neste ponto do projeto. Sinalizado no veredito do Lote 7 abaixo, sem
necessidade de reabrir nenhuma tarefa.

## Lote 7 — Resolução de Destino (T04, T05)

Status geral: **Aprovado**. As 5 tarefas do lote (L7-T01 a L7-T05) passam
nos respectivos critérios de aceite, confirmados por leitura direta do
código (`src/lib/stage-rules/destino.ts`, `src/lib/actions/destino.ts`,
`src/lib/actions/confirmacao-destino.ts`,
`src/components/destino/destino-sugestoes-screen.tsx`,
`src/components/destino/destino-confirmacao-screen.tsx`, rotas
`src/app/destino/**`) e pela extensão da state machine (ADR-006 Adendo 2,
`src/lib/session-flow/state-machine.ts`/`persistence.ts`) — não pela nota
de implementação do Executor — e por execução real da suíte. Nenhuma
reprovação crítica ou simples encontrada.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npx vitest run src/lib/stage-rules src/lib/actions src/components/destino src/app/destino src/lib/session-flow` | 95 testes passam, 47 falham — **todas** as 47 falhas são `*.integration.test.ts` que exigem Postgres real em `localhost:55432` (indisponível neste ambiente de validação), mesma limitação documentada desde L4-T02/L7-T01/T02/T03/T04/T05 no `TASK.md`; confirmado por inspeção de cada `FAIL` (todas em arquivos `*.integration.test.ts`, todas com `PrismaClientInitializationError: Can't reach database server`, nenhuma falha de asserção/tipo/compilação). Nenhuma outra classe de falha encontrada. |
| `npm run build` (`next build`) | Passou — build de produção completo; `/destino` e `/destino/confirmacao` confirmadas como rotas dinâmicas (`ƒ`) |

### L7-T01 — Regra RF-04 (geração de sugestões + filtro de orçamento)

Critério de aceite: "Cada sugestão tem nome, justificativa curta, faixa de
preço; respeita orçamento quando informado."

- `src/lib/stage-rules/destino.ts`: `generateDestinationSuggestions` chama
  `generateStructuredCompletionWithRetry` (L3-T04, retry+log) com o prompt/
  schema já registrados de `destino` (L3-T02) — reaproveita, não duplica.
  Aplica `applyBudgetFilter` (L4-T03) sobre o resultado, convertendo o shape
  do schema (`faixaPrecoMin`/`Max`) para o shape genérico esperado —
  confirmado por leitura. `DestinationSuggestionResult` sempre tem
  `name`/`justification`/`priceRangeMin`/`Max`.
- 6 casos unitários (`src/lib/stage-rules/__tests__/destino.test.ts`,
  `@vitest-environment node`, Gateway de IA mockado via `importOriginal`) —
  todos passam: nome/justificativa/faixa presentes; chamada correta ao
  Gateway (sessionId/stage/schemaName/mensagens); sem orçamento nunca
  bloqueia; com orçamento reordena; sem opção na faixa devolve a mais
  barata com `exceedsBudget: true`; erro do Gateway propaga sem ser
  mascarado.
- **Aprovado.**

### L7-T02 — T04 UI (cartões, 4 estados, rodapé)

Critério de aceite: "4 estados presentes conforme UX-SPEC §4; rodapé
oferece 'continuar' e 'encerrar aqui' (RF-04.5)."

- `src/components/destino/destino-sugestoes-screen.tsx`: os 4 estados
  (`loading`/`error`/`empty`/`success`) implementados via
  `LoadingStream`/`ErrorRetryState`/`EmptyState`/`SuggestionCard` (L5-T03/
  T04) reaproveitados, nenhuma lógica de estado duplicada — confirmado.
  `BudgetInsufficientBanner` exibido quando `exceedsBudget`, nunca
  desabilitando os botões de aprovar (RN-04, confirmado: `disabled` dos
  botões de aprovar não depende de `hasBudgetExceeded`). Rodapé de decisão
  após aprovar oferece "Continuar para hospedagem"
  (`router.push("/destino/confirmacao?...")`) e "Só queria decidir o
  destino — encerrar aqui" (`encerrarResolucaoDestino` + navegação) — ambos
  presentes e navegando só após a Promise resolver (nenhuma navegação
  otimista).
- Preço sempre via `SuggestionCard`/`PriceRangeBadge` embutido (Diretriz 6);
  erros com `role="alert"` + ícone + texto (Diretriz de acessibilidade,
  UX-SPEC §5); foco no título ao montar; `min-h-11` nos botões principais.
- 11 casos em `destino-sugestoes-screen.test.tsx` (Server Actions
  substituídas via `actionsOverride`, nenhum mock de módulo inteiro) — todos
  passam, cobrindo os 4 estados, `BudgetInsufficientBanner` não bloqueando,
  rodapé de decisão com as duas ações, atalho de destino manual.
- **Aprovado.**

### L7-T03 — T04 Server Actions (aprovar/rejeitar-nova rodada/informar manual/encerrar)

Critério de aceite: "Aprovar avança para confirmação; rejeitar todas
permite nova rodada ou entrada manual; encerrar preserva destino aprovado."

- `src/lib/actions/destino.ts`: `gerarSugestoesDestino` valida
  `flowState === "destino_pendente"` antes de gastar uma chamada ao Gateway
  de IA (`DestinoEtapaInvalidaError` caso contrário); "nova rodada" é a
  mesma função chamada de novo pela UI, sem transição de estado —
  confirmado, consistente com RF-04.4. `aprovarDestinoSugerido` **revalida**
  o payload da sugestão no servidor
  (`assertValidSuggestionPayload`: nome/justificativa não vazios, faixa
  numérica/não-negativa/não-invertida/dentro de teto de sanidade) antes de
  chamar `applySessionFlowTransition` — nunca confia cegamente no payload
  devolvido pelo cliente, mesmo sendo originalmente gerado pelo servidor
  (item de segurança relevante, ver `SECURITY-REVIEW.md`). Toda persistência
  passa por `applySessionFlowTransition` (L4-T02) — nenhuma escrita direta
  no Prisma para `TripSession`/entidades filhas, confirmado por leitura
  completa do arquivo (a única leitura direta é `prisma.tripSession.findUnique`
  em `gerarSugestoesDestino`, para montar contexto). `encerrarResolucaoDestino`
  só chama `applySessionFlowTransition({ action: "encerrar" })`, preservando
  `DestinationApproval` (RN-03) estruturalmente (mesma garantia já
  confirmada em L4-T02).
- **Investigação da possível inconsistência RF-04.5 × state machine
  (documentada no `TASK.md`)**: confirmada como NÃO sendo uma inconsistência
  real — "encerrar aqui" só é oferecido pela UI depois de uma aprovação,
  quando a sessão já está em `destino_confirmado`, estado já elegível para
  `encerrar` desde L4-T01. Concordo com a conclusão do Executor após
  reler `UX-SPEC.md` (linhas 86-88, "Depois de aprovar um bloco...") e a
  tabela `STATES_WITH_AT_LEAST_ONE_APPROVAL` (`state-machine.ts`).
- 14 casos de integração real com Postgres (`destino.integration.test.ts`)
  — não confirmados nesta sessão de validação (mesma limitação de ambiente
  de todo o restante da suíte), mas o código foi lido linha a linha e é
  consistente com o que os testes afirmam cobrir.
- **Aprovado.**

### L7-T04 — T05 UI (confirmação de destino)

Critério de aceite: "Nome do destino em destaque; botões 'Confirmar e
continuar' / 'Trocar destino'; sempre aparece, mesmo vindo de T04."

- `src/components/destino/destino-confirmacao-screen.tsx`: destino em
  destaque (`font-serif text-3xl text-accent`), os dois botões exigidos
  (`min-h-11`), cada um com estado de "processando" (`aria-busy`) enquanto
  aguarda o servidor, erro acessível (`role="alert"`) sem travar os botões.
  Componente agnóstico da origem do destino (T01/T02/T03 vs. T04) —
  confirmado, recebe só `destino`/`sessionId` já resolvidos.
- `src/app/destino/confirmacao/page.tsx`: sem `sessionId`/`destino`,
  redireciona para `/` em vez de renderizar tela quebrada — confirmado
  (RF-11 "sempre aparece" cumprido pelo lado inverso: nunca aparece sem
  dado válido).
- **"Trocar destino" (retomada pós Bloqueio 002)**: confirmado que
  `confirmacao-destino-client.tsx` hoje chama a Server Action real
  `trocarDestino` (não mais `router.back()` isolado) e só navega
  (`router.back()`) depois da Promise resolver — sem navegação otimista.
- 9 + 3 + 4 casos (`destino-confirmacao-screen.test.tsx`,
  `confirmacao-destino-client.test.tsx`, `page.test.tsx`) — todos passam
  (unitários/componente, sem dependência de Postgres).
- **Aprovado.**

### L7-T05 — T05 Server Action (confirmar/trocar destino)

Critério de aceite: "Confirmar avança para hospedagem; trocar volta ao
campo de destino da tela de origem."

- `src/lib/actions/confirmacao-destino.ts`: `confirmarDestino` delega
  `applySessionFlowTransition({ action: "avancar" })` a partir de
  `destino_confirmado` → `hospedagem_pendente` — único caminho válido na
  state machine a partir desse estado, confirmado.
- **`trocarDestino` (retomada, ADR-006 Adendo 2)**: delega
  `applySessionFlowTransition({ action: "revisar" })`. Confirmado por
  leitura cruzada de `state-machine.ts` (`REVISAR_TRANSITIONS`,
  `destino_confirmado → destino_pendente`) e `persistence.ts`
  (`deleteRevisarChildData` apaga só `DestinationApproval` da própria
  sessão, via `deleteMany({ where: { sessionId } })`, antes de gravar o
  novo `flowState`, na mesma transação) — critério de aceite cumprido
  literalmente ("trocar volta ao campo de destino da tela de origem": o
  `flowState` regride e o dado antigo é removido, permitindo nova
  aprovação). Rejeição a partir de outro estado propaga
  `InvalidTransitionError` sem persistir nada (mesmo padrão de
  `confirmarDestino`).
- **Aprovado.**

### Testes de integração cruzada entre as tarefas do lote (fluxo ponta a ponta)

Fluxo completo confirmado por leitura + testes automatizados existentes,
encadeando os módulos reais sem nenhuma reimplementação local:

1. `gerarSugestoesDestino` (L7-T03) → `generateDestinationSuggestions`
   (L7-T01) → Gateway de IA (Lote 3) + `applyBudgetFilter` (Lote 4) —
   sugestões chegam a `DestinoSugestoesScreen` (L7-T02) via `fetchImpl`.
2. `aprovarDestinoSugerido`/`informarDestinoManualmente` (L7-T03) →
   `applySessionFlowTransition` (Lote 4) → `destino_pendente` →
   `destino_confirmado`, persistindo `DestinationApproval` — a UI (L7-T02)
   navega para `/destino/confirmacao` só depois da Promise resolver.
3. `ConfirmacaoDestinoPage`/`ConfirmacaoDestinoClient` (L7-T04) → chama
   `confirmarDestino`/`trocarDestino` (L7-T05) → `applySessionFlowTransition`
   → `hospedagem_pendente` (avança) ou `destino_pendente` (regride,
   apagando `DestinationApproval`).
4. `encerrarResolucaoDestino` (L7-T03) → `applySessionFlowTransition` →
   `encerrada_parcial`, preservando `DestinationApproval` (RN-03).
- Nenhuma das 5 tarefas reimplementa lógica de outra (Diretriz de
  Implementação 3/11) — confirmado por leitura cruzada dos 5 arquivos
  principais listados no cabeçalho desta seção do Lote 7.
- Integração com Lotes 3/4/5/6: Lote 3 (Gateway de IA) e Lote 4
  (Orquestração/Orçamento, agora retroativamente `Validado` acima) — ambos
  consumidos só via suas fronteiras públicas (`@/lib/gateway-ia`,
  `@/lib/session-flow`), nenhum arquivo interno importado diretamente.
  Lote 5 (Design System) — componentes reutilizados sem duplicação (L7-T02/
  T04, confirmado acima). Lote 6 (Telas de Entrada) não bloqueia o Lote 7
  (confirmado pela Seção 4 do `TASK.md`) e nenhuma tela de origem de Lote 6
  navega de fato para `/destino`/`/destino/confirmacao` ainda — gap já
  documentado como integração cross-lote futura, consistente em todo o
  projeto (não é um achado novo).

### Requisitos não funcionais relevantes ao lote

- **RN-04** (orçamento nunca bloqueia): confirmado em `applyBudgetFilter`
  (Lote 4, revalidado acima) e em `DestinoSugestoesScreen` (botões de
  aprovar nunca desabilitados por `BudgetInsufficientBanner`).
- **Acessibilidade (WCAG AA, UX-SPEC §5)**: foco gerenciado ao montar em
  ambas as telas (T04/T05); erros sempre `role="alert"` + ícone + texto,
  nunca só cor; alvo de toque `min-h-11` nos botões principais; formulário
  manual de T04 com `aria-describedby` ligando erro ao campo. Nenhuma
  checagem automatizada de contraste/leitor de tela real foi executada
  nesta validação (fora do escopo de `npm test`/`npm run build`) — mesma
  limitação já aceita nos lotes anteriores (Lote 5), com a revisão final
  cross-tela reservada para `L11-T04`. Nenhuma pendência nova encontrada
  além do que já está registrado em `RL5-T02` (não deste lote).
- **RNF-05 (retry único)**: reaproveitado de L3-T04 via
  `generateStructuredCompletionWithRetry`, nenhuma reimplementação — RN-04
  confirma consistência com o restante do projeto.

### Bugs encontrados

Nenhum. Nenhuma reprovação crítica nem simples neste lote.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — nenhum bug encontrado. (A sinalização real deste lote —
sequenciamento de `L11-T03`, ver `SECURITY-REVIEW.md` — é um achado de
segurança/dependência, não um padrão de bug de implementação; registrada
como Bloqueio 003 em `.md/BLOCKERS.md`, escalada ao coordenador.)

## Checagem Estrutural do Lote 7 (Validador, sem dispatch ao Coordenador)

- As 5 tarefas do Lote 7 (L7-T01 a L7-T05) estão `Concluída` em `TASK.md`
  (Seção 3) — confirmado.
- **Achado de processo (resolvido nesta sessão, sem necessidade de
  redesenho)**: o Lote 4, do qual o Lote 7 depende diretamente, nunca havia
  sido validado (nenhuma seção em `QA-REPORT.md`/`SECURITY-REVIEW.md`, nenhum
  "Status do lote" em `TASK.md`) — corrigido acima, validado retroativamente
  nesta mesma sessão, sem problema encontrado no código.
- **Extensão da state machine (ADR-006 Adendo 2) sobre módulos do Lote 4
  já em produção de código**: confirmado por leitura de
  `src/lib/session-flow/state-machine.ts`/`persistence.ts` que a mudança
  foi puramente ADITIVA — nova ação `"revisar"` acrescentada à união
  `SessionFlowAction` (não removeu/alterou nenhuma ação existente), nova
  tabela `REVISAR_TRANSITIONS` separada de `SEQUENTIAL_TRANSITIONS` (não
  tocada), novo branch `if (input.action === "revisar")` em
  `applySessionFlowTransition` (o branch de `"aprovar"` e a lógica de
  `encerrar`/sincronização de `status` permanecem exatamente como estavam).
  Nenhuma assinatura pública existente (`transitionSessionFlow`,
  `applySessionFlowTransition`) mudou de shape para os chamadores já
  existentes (L4-T02, e os consumidores de L6/L7 anteriores a esta
  extensão) — retrocompatível. `npx vitest run
  src/lib/session-flow/__tests__/state-machine.test.ts` → 37/37 passam
  (confirmado nesta sessão), incluindo os casos pré-existentes de L4-T01 —
  **nenhuma regressão encontrada** nas tarefas L4-T01/L4-T02 por causa desta
  extensão.
- Seção 4 (Dependências): Lote 7 depende de Lotes 3+4+5 (todos já
  `Validado`/`Validado com ressalvas` acima) — nenhuma dependência
  órfã/inconsistente relativa a este lote. Lote 6 corretamente modelado
  como não-bloqueante.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 7 (Bloqueio 002 já
  `Resolvido`).
- **Achado de segurança com implicação de sequenciamento** (não um achado
  de código deste lote em si): ver `SECURITY-REVIEW.md`, Lote 7 — registrado
  como Bloqueio 003 em `.md/BLOCKERS.md`, escalado ao coordenador (decisão
  de dependência entre `L11-T03` e `L8-T01`/`L9-T01`/`L10-T01`, fora da
  autoridade do Validador). **Não bloqueia o fechamento do Lote 7** — as 5
  tarefas cumprem seus critérios de aceite integralmente; o achado é sobre
  uma tarefa futura (Lote 8) que ainda não existe.
- Nenhum achado simples/débito baixo-médio de QA a registrar em
  `Refatoração Lote-7` — nenhuma tarefa nova criada por este chapéu (o
  achado de segurança vira registro em `BLOCKERS.md`, não uma tarefa de
  refatoração, já que a correção em si — `L11-T03` — já existe planejada;
  o que falta é só a decisão de sequenciamento do Coordenador).

## Veredito de Release-Readiness do Lote 7

**Lote 7 pode fechar como `Validado com ressalvas`.** As 5 tarefas (L7-T01
a L7-T05) passam nos critérios de aceite literais do `TASK.md`, `npm run
lint`/`npm run build` passam sem regressão, a suíte não-integração passa
integralmente (95/95), a composição entre as tarefas (regra → Server
Actions → UI → confirmação/troca) funciona como projetada, a extensão da
state machine do Lote 4 foi aditiva e sem regressão, e o Lote 4
(pré-requisito nunca antes validado) foi validado retroativamente sem
problema. A ressalva não é um bug de nenhuma das 5 tarefas — é um achado de
segurança sobre uma dependência futura ainda não implementada
(sequenciamento de `L11-T03` antes de `L8-T01`/`L9-T01`/`L10-T01`, ver
`SECURITY-REVIEW.md` e Bloqueio 003 em `BLOCKERS.md`), que não impede este
lote de fechar mas precisa de decisão do Coordenador antes do início do
Lote 8. **O lote está liberado para a auditoria de segurança completa do
chapéu DevSecOps** (mesma sessão, ver `SECURITY-REVIEW.md` abaixo).
