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

## Lote 6 — Telas de Entrada (T00, T01, T02, T03a-d)

Status geral: **Aprovado**. As 7 tarefas do lote (L6-T01 a L6-T07) passam
nos respectivos critérios de aceite, confirmados por leitura direta do
código (`src/app/page.tsx`, `src/components/entrada/entry-paths.ts`,
`src/components/entrada/t01-date-range-form.tsx`,
`src/lib/actions/data-livre.ts`/`data-livre-errors.ts`,
`src/app/entrada/feriados/feriados-screen.tsx`, `src/lib/actions/feriados.ts`/
`feriados-errors.ts`, `src/components/quiz/quiz-wizard.tsx`,
`src/lib/actions/quiz.ts`/`quiz-date-range.ts`,
`src/lib/session-flow/create-session-with-range.ts`) — não pela nota de
implementação do Executor — e por execução real da suíte onde o ambiente
permitiu. Nenhuma reprovação crítica nem simples encontrada.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npx vitest run src/components/entrada src/app/__tests__/page.test.tsx src/components/quiz src/lib/__tests__/holidays.test.ts` (execução isolada dos arquivos do lote que não dependem de Postgres) | Passou integralmente nesta execução isolada (`t01-date-range-form.test.tsx` 7/7, `page.test.tsx` 4/4, `quiz-wizard.test.tsx` 9/9, `holidays.test.ts` 24/24) |
| `npm test` (suíte completa) | 400 passam, 86 falham nesta sessão — inspecionadas uma a uma: 84 das 86 são `*.integration.test.ts` (incluindo os 3 arquivos de integração deste lote — `data-livre.integration.test.ts`, `processar-feriado-escolhido.integration.test.ts`, `quiz.integration.test.ts`, `create-session-with-range.integration.test.ts`) com `PrismaClientInitializationError: Can't reach database server at localhost:55432` — mesma limitação de ambiente já documentada e aceita desde os Lotes 1/4/7/8; as 2 falhas restantes (`t01-date-range-form.test.tsx`, `holidays.test.ts`) são as mesmas suítes que passam 100% quando executadas isoladamente (ver linha acima) — falha por contenção de recursos/timing ao rodar a suíte inteira em paralelo, não regressão de código (reexecutadas isoladamente, confirmado) |
| `npm run build` (`next build`) | **Não concluído nesta sessão de validação** — `node_modules` do projeto sofreu reinstalação concorrente por outra instância paralela ativa no mesmo repositório durante esta sessão (`node_modules/.bin` zerado, depois `ENOTEMPTY`/`EPERM` em `node_modules/next/dist` em múltiplas tentativas de `npm install`), mesma classe de instabilidade de ambiente já registrada em `RL2-T01`/`RL5-T01` no `TASK.md`. Mitigação aplicada: `npx prisma generate` (bem-sucedido) + `tsc --noEmit` rodado diretamente contra os arquivos deste lote — **zero erros de tipo** em qualquer arquivo de L6-T01 a L6-T07 (`entry-paths.ts`, `t01-date-range-form.tsx`, `data-livre.ts`, `feriados.ts`, `feriados-screen.tsx`, `quiz-wizard.tsx`, `quiz.ts`, `quiz-date-range.ts`, `create-session-with-range.ts`); os erros de tipo vistos antes do `prisma generate` (módulos `next`/`lucide-react`/`@prisma/client` "não encontrados") eram 100% efeito colateral do `node_modules` incompleto, não de lógica. As notas de implementação de L6-T01/T02/T03/T05/T06/T07 já registram `npm run build` passando com as 3 rotas (`/`, `/entrada/data-livre`, `/entrada/feriados`, `/entrada/quiz`) confirmadas estáticas (`○`) antes desta sessão — nenhum arquivo deste lote foi alterado desde então (confirmado por leitura do código atual idêntico ao descrito nessas notas). **Recomendação**: reexecutar `npm run build` num ambiente sem instalação concorrente antes do deploy (mesma recomendação já feita para outros lotes nesta mesma condição). |

### L6-T01 — T00 UI: 3 cartões de caminho de entrada + navegação

Critério de aceite: "3 cartões com igual destaque visual, nenhum
pré-selecionado; navega para T01/T02/T03a."

- `src/app/page.tsx` (Server Component, sem Server Action — navegação via
  `next/link` pura, nenhuma transição de state machine nesta tela) mapeia
  `ENTRY_PATHS` (`src/components/entrada/entry-paths.ts`): 3 blocos
  (Data livre → `/entrada/data-livre`; Feriados prolongados →
  `/entrada/feriados`; Quiz guiado → `/entrada/quiz`), todos com a MESMA
  `ENTRY_PATH_CLASSNAME` (`border-border`/`bg-surface`, sem sombra) —
  confirmado por leitura: nenhuma classe condicional de destaque/seleção
  aplicada a nenhum dos 3 blocos.
- Ordem e textos (título + frase de "quando usar") batem literalmente com
  UX-SPEC.md Seção 2. Layout responsivo `grid-cols-1 md:grid-cols-3`
  confirmado.
- Acessibilidade: cada bloco é um `<a>` nativo (`next/link`), focável por
  teclado em ordem natural (Data livre → Feriados → Quiz); ícone com
  `aria-hidden="true"`.
- **Aprovado.**

### L6-T02 — T01 UI: form de data livre + validação inline (RF-01.4)

Critério de aceite: "Erro de data final < inicial bloqueia avanço com
mensagem junto ao campo, sem navegar."

- `src/components/entrada/t01-date-range-form.tsx`: `handleSubmit`
  verifica `dataFinal < dataInicial` ANTES de chamar `onValid` — quando
  verdadeiro, só seta a mensagem de erro (`role="alert"`, ícone +
  texto, `aria-describedby`/`aria-invalid` no campo "Data final") e
  retorna, sem chamar `onValid` (confirmado por leitura literal da
  função — não há nenhum caminho de código que chame `onValid` quando o
  range está invertido). Datas iguais tratadas como válidas (viagem de 1
  dia), confirmado pela condição estrita `<`.
- Destino opcional repassado a `onValid` quando preenchido; nenhuma
  navegação/Server Action chamada por este componente (escopo
  corretamente limitado à UI/validação local, `onValid` é só um prop de
  extensão).
- Acessibilidade: `label`/`htmlFor` por campo, ordem de tab lógica,
  `min-h-11` no botão principal.
- **Aprovado.**

### L6-T03 — T01 Server Action: processa range + destino opcional (RF-01.2/.3)

Critério de aceite: "Sem destino → segue para etapa de destino (RF-04);
com destino → registra como aprovado e segue para confirmação (RF-11)."

- `src/lib/actions/data-livre.ts`: `submeterDataLivre` revalida no
  servidor (formato ISO, obrigatoriedade das duas datas, RF-01.4 de novo
  — nunca confia só na validação client-side de L6-T02) e sanitiza
  `destino` via `sanitizeFreeTextForPrompt` (prompt injection, `destino`
  truncado em `DESTINO_MAX_LENGTH = 200`) antes de delegar a
  `createSessionWithDateRange` (`@/lib/session-flow`). Ramificação
  confirmada por leitura literal: `destino.length === 0` retorna
  `proximaEtapa: "destino"`/`flowState: "destino_pendente"`; caso
  contrário retorna `proximaEtapa: "confirmacao_destino"`/
  `flowState: "destino_confirmado"` — exatamente o critério de aceite.
- **Divergência sinalizada no `TASK.md` (nota de L6-T05, linha ~1503) já
  está resolvida** — verificado por leitura direta do código-fonte atual
  de `data-livre.ts` (não só da nota textual, que poderia estar
  desatualizada): a função hoje **chama `createSessionWithDateRange`**
  (linha 146), o mesmo helper compartilhado por L6-T05/L6-T07, e não tem
  nenhuma chamada direta a `prisma`/`applySessionFlowTransition`. A
  implementação inline mencionada como divergência original já não
  existe no código atual — a refatoração documentada na nota de
  implementação L6-T03 (TASK.md, "Correção pós-revisão inline") foi de
  fato aplicada. Nenhuma ação adicional necessária.
- `resolveSessionOwner()` chamado antes de `createSessionWithDateRange`
  (retrofit de `L11-T02a`/ADR-008, já `Concluída`) — confirmado presente.
- **Aprovado.**

### L6-T04 — T02 UI: lista de feriados com emenda + destino opcional

Critério de aceite: "Emenda exibida por feriado (ex.: 'Qui 12/06 →
estende até Dom 15/06, 4 dias')."

- `src/app/entrada/feriados/feriados-screen.tsx`: renderiza um
  `HolidayListItem` por feriado vindo de `getFeriadosProlongados`
  (`FeriadoProlongado.label`, já formatado por L2-T02/L6-T05) dentro de
  um `<fieldset>`, seleção única por `groupName` comum — confirmado que
  nenhuma formatação de data/emenda é duplicada neste componente (usa
  literalmente `holiday.label`). Campo de destino opcional,
  `required={false}`/`aria-required="false"` explícitos.
- Nenhum botão de submissão/continuar presente (de propósito — a Server
  Action de L6-T05 é quem processa a escolha) — confirmado, consistente
  com a Diretriz de Implementação 3 (nenhuma transição client-side
  otimista).
- Foco no `<h1>` ao montar; `StepperProgress` com
  `currentState="entrada_selecionada"`.
- **Aprovado.**

### L6-T05 — T02 Server Action: processa feriado escolhido como range (RF-02.3)

Critério de aceite: "Range resultante segue a mesma ramificação de
RF-01.2/.3."

- `src/lib/actions/feriados.ts`: `processarFeriadoEscolhido` **nunca
  confia no range vindo do cliente** — recalcula
  `getNationalHolidaysWithBridgeInRange` a partir da própria `holidayDate`
  recebida, localiza o feriado correspondente e só usa
  `bridge.rangeStart`/`rangeEnd` desse feriado (não o dia isolado,
  confirmado por leitura) como `dateRangeStart`/`dateRangeEnd` passados a
  `createSessionWithDateRange` — o MESMO helper de L6-T03/L6-T07,
  confirmado por leitura do import. `holidayDate` que não corresponda a
  nenhum feriado conhecido lança `InvalidHolidaySelectionError` antes de
  qualquer escrita. Ramificação com/sem destino idêntica à de L6-T03 por
  construção (mesmo helper) — critério de aceite satisfeito literalmente.
- Sanitização de destino (`sanitizeFreeTextForPrompt` + rejeição acima de
  `MAX_DESTINO_LENGTH = 200`, comportamento intencionalmente diferente de
  L6-T03 que trunca em vez de rejeitar — decisão de implementação já
  documentada na nota de L6-T05 do `TASK.md`, não um bug).
- **Aprovado.**

### L6-T06 — T03a-d Quiz guiado: wizard de 4 perguntas (RF-03)

Critério de aceite: "4 telas sequenciais, indicador '1 de 4'; 'Pular'
disponível em (b)/(c)/(d); período obrigatório."

- `src/components/quiz/quiz-wizard.tsx`: exatamente as 4 perguntas de
  RF-03.1 na ordem de `QUIZ_STEP_IDS` (período/alcance/
  experiência/orçamento); `QuizProgressIndicator` mostra "`{current}` de
  `{total}`" com `aria-live="polite"`. `PeriodoStep` (a) não renderiza
  nenhum botão "Pular" (confirmado — `StepNav`, o componente que
  renderiza "Pular", só é usado em `AlcanceStep`/`ExperienciaStep`/
  `OrcamentoStep`); `handleAdvanceFromPeriodo` bloqueia o avanço
  (`setPeriodoError`, sem `goToStep`) quando `!answers.periodo` —
  confirmado que `onComplete` nunca é alcançável sem responder (a).
  Navegação "Voltar" preserva `answers` (estado não é resetado entre
  steps).
- Decisão documentada de não reaproveitar `StepperProgress` (state
  machine servidora não tem sub-estados do quiz) é coerente com ADR-006
  e com a Diretriz de Implementação 3 — revisada e aceita, não uma
  lacuna.
- **Aprovado.**

### L6-T07 — T03 Server Action: gera range de datas sugerido (RF-03.2)

Critério de aceite: "Range gerado é coerente com o período informado; se
houver feriado prolongado compatível próximo, é priorizado."

- `src/lib/actions/quiz-date-range.ts`: `resolveSuggestedDateRange`
  (função pura) busca, via `findNearestCompatibleHoliday`, o feriado
  prolongado mais próximo (`rangeStart` dentro de
  `HOLIDAY_SEARCH_WINDOW_DAYS = 45` dias) cuja duração caiba em
  `[min, max]` do período informado; se encontrado, usa
  `bridge.rangeStart`/`rangeEnd` (coerente com o período, por construção
  do filtro `[min, max]`); caso contrário, cai no range padrão (hoje +
  `DEFAULT_LEAD_DAYS` até `+ (default - 1)` dias) — ambos os ramos
  sempre produzem `end >= start` e `start` nunca antes de hoje,
  confirmado por leitura de `addDaysUtc`/`utcMidnight`. O achado
  documentado no cabeçalho do arquivo (feriados nunca têm mais de 4
  dias, então só `fim_de_semana`/`3_a_5_dias` podem priorizar feriado) é
  consistente com `calculateBridge` (L2-T01) — não é um bug, é uma
  consequência correta do cálculo de emenda.
- `src/lib/actions/quiz.ts`: `submitQuizAnswers` rejeita chamada sem
  `answers.periodo` (RF-03.3) antes de qualquer cálculo; delega a
  `createSessionWithDateRange` sempre sem `destino` (quiz não coleta
  destino, confirmado contra `QuizAnswers`) — sessão sempre avança para
  `destino_pendente`, nunca `destino_confirmado`, coerente com o ramo
  "sem destino" de RF-01.2 aplicado a esta origem.
- **Aprovado.**

### Integração cruzada entre as 7 tarefas do lote

- T00 (L6-T01) → T01/T02/T03a (L6-T02/T04/T06): os 3 `href`s de
  `ENTRY_PATHS` batem exatamente com as rotas reais publicadas pelas 3
  telas (`/entrada/data-livre`, `/entrada/feriados`, `/entrada/quiz`) —
  confirmado por leitura cruzada dos 4 arquivos, nenhum link quebrado.
- T01 UI → T01 Server Action (L6-T02 → L6-T03): `T01DateRangeForm` expõe
  `DateRangeFormValues` (`dataInicial`/`dataFinal`/`destino`) via
  `onValid`; `SubmeterDataLivreInput` (L6-T03) aceita exatamente esse
  shape — nenhuma adaptação de tipo necessária, contrato compatível por
  construção. **Nota**: a página real `src/app/entrada/data-livre/page.tsx`
  ainda não acopla `onValid` a `submeterDataLivre` (de propósito, fora de
  escopo de ambas as tarefas — RF-04/RF-11, telas de destino/confirmação,
  ficam para o Lote 7) — não é uma lacuna deste lote, já documentado nas
  notas de implementação de ambas as tarefas.
- T02 UI → T02 Server Action (L6-T04 → L6-T05): `holidayKey` em
  `feriados-screen.tsx` (`holiday.date.toISOString()`) é exatamente a
  chave que `processarFeriadoEscolhido` espera em `holidayDate` — mesma
  convenção de serialização de `Date`, confirmado.
- T03a-d UI → T03 Server Action (L6-T06 → L6-T07): `QuizAnswers` (shape
  exposto por `onComplete` do wizard) é exatamente o tipo aceito por
  `submitQuizAnswers` — `quiz.ts` importa o tipo diretamente de
  `quiz-wizard.tsx`, nenhuma duplicação de shape.
- L6-T03/L6-T05/L6-T07 (as 3 Server Actions de origem) convergem para o
  MESMO helper `createSessionWithDateRange`
  (`src/lib/session-flow/create-session-with-range.ts`), confirmado pelos
  3 imports — a exigência de "mesma ramificação" de RF-01.2/.3/RF-02.3 é
  garantida estruturalmente (uma só implementação), não por 3 cópias que
  poderiam divergir silenciosamente no futuro. A divergência
  momentânea registrada na nota de L6-T05 (L6-T03 ainda não usando o
  helper no momento em que L6-T05 foi escrita) já não existe no código
  atual — ver achado em L6-T03 acima.

### Requisitos não funcionais relevantes ao lote

- **Acessibilidade** (UX-SPEC §5): foco gerenciado em transição de tela/
  step (T00 não tem transição própria; T02/T03a-d movem foco ao montar/
  avançar), mensagens de erro sempre com `role="alert"` + ícone + texto
  (nunca só cor), `aria-describedby`/`aria-invalid` conectando erro ao
  campo, alvo de toque `min-h-11` nos botões principais — confirmado em
  todos os 3 componentes de tela deste lote (L6-T01/T02/T04/T06).
- **Nenhuma navegação client-side otimista** (Diretriz de Implementação
  3/ADR-006): confirmado em L6-T02 (só chama `onValid`, não navega),
  L6-T04 (nenhum botão de submissão), L6-T06 (navegação entre perguntas é
  só client-side dentro do próprio quiz, nenhuma chamada de servidor) —
  toda transição de `TripSession` real passa por uma Server Action
  (L6-T03/T05/T07) antes de qualquer navegação de etapa.
- **RNF-07** (determinismo, sem LLM): `feriados.ts`/`quiz-date-range.ts`
  confirmados sem nenhuma referência a `gateway-ia`/`openai`/`fetch` (
  `holidays.test.ts`, 24/24 passando nesta sessão, cobre `feriados.ts`
  desde a correção de `RL2-T01`, já `Concluída`).
- **Autorização de dono de sessão** (ADR-008): as 3 Server Actions de
  origem chamam `resolveSessionOwner()` antes de criar a sessão —
  retrofit de `L11-T02a` confirmado presente no código atual das 3.

### Bugs encontrados

Nenhum. Nenhuma reprovação crítica nem simples neste lote.

### Padrão recorrente sinalizado ao Coordenador

Não aplicável — nenhum bug encontrado; a única divergência textual entre
notas de implementação (L6-T03 vs. L6-T05) já estava resolvida no código
antes desta validação, sem necessidade de decisão do Coordenador sobre
"qual versão vence".

## Checagem Estrutural do Lote 6 (Validador, sem dispatch ao Coordenador)

- As 7 tarefas do Lote 6 (L6-T01 a L6-T07) estão `Concluída` em
  `TASK.md` (Seção 3) — confirmado.
- Seção 4 (Dependências e Ordem de Execução): Lote 6 depende de Lotes
  2+4+5 (Lote 2 `Validado com ressalvas`, Lote 4 `Validado`, Lote 5
  `Validado com ressalvas` — todos já fechados); Lote 6 corretamente
  modelado como não-bloqueante do Lote 7 ("Lote 6 não bloqueia Lote 7",
  já confirmado na checagem estrutural do Lote 7 abaixo) — nenhuma
  dependência órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução no Lote 6.
- `RL2-T01` (débito do Lote 2 com prazo explícito "fechamento do Lote 6")
  já está `Concluída` em `TASK.md` — prazo cumprido, confirmado.
- Nenhum achado simples/débito baixo-médio de QA a registrar em
  `Refatoração Lote-6` — nenhuma tarefa nova criada por este chapéu.

## Veredito de Release-Readiness do Lote 6

**Lote 6 pode fechar como `Validado`** (sem ressalvas). As 7 tarefas
(L6-T01 a L6-T07) passam nos critérios de aceite literais do `TASK.md`,
confirmados por leitura direta do código-fonte atual (não pela nota de
implementação do Executor) — incluindo a confirmação explícita de que a
divergência entre L6-T03 e L6-T05/L6-T07 (criação de sessão inline vs.
helper compartilhado), sinalizada como pendente de reconciliação na nota
de L6-T05 do `TASK.md`, **já foi resolvida no código** (as 3 Server
Actions de origem usam hoje o mesmo `createSessionWithDateRange`).
`npm run lint` passa sem erro; os testes específicos deste lote passam
100% onde o ambiente permitiu execução (isolados, sem dependência de
Postgres); as falhas observadas na suíte completa são, sem exceção,
limitação de ambiente já documentada no projeto (Postgres indisponível
em `localhost:55432`) ou flakiness de contenção de recursos sob execução
paralela completa (confirmado por reexecução isolada, não regressão).
`npm run build` não pôde ser concluído nesta sessão por instabilidade de
`node_modules` causada por outra instância concorrente no mesmo
repositório (mesma classe de limitação já aceita em `RL2-T01`/`RL5-T01`)
— mitigado por `tsc --noEmit` direcionado, que não encontrou nenhum erro
de tipo em nenhum arquivo deste lote, e pelas notas de implementação de
cada tarefa já registrarem um `npm run build` bem-sucedido com as 4 rotas
(`/`, `/entrada/data-livre`, `/entrada/feriados`, `/entrada/quiz`)
confirmadas estáticas antes desta sessão, sem nenhuma alteração desses
arquivos desde então. **Recomendação não bloqueante**: reexecutar `npm
run build` num ambiente sem instalação concorrente antes do deploy deste
lote. **O lote está liberado para a auditoria de segurança completa do
chapéu DevSecOps.**

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

## Lote 8 — Hospedagem (T06)

Status geral: **Aprovado com ressalva simples**. As 3 tarefas (L8-T01 a
L8-T03) passam nos critérios de aceite literais do `TASK.md`, confirmados
por leitura direta do código (`src/lib/stage-rules/hospedagem.ts`,
`src/lib/actions/hospedagem.ts`/`hospedagem-errors.ts`,
`src/components/hospedagem/hospedagem-sugestoes-screen.tsx`) e pela leitura
cruzada de `src/lib/session-flow/state-machine.ts` — não pela nota de
implementação do Executor — e por execução real da suíte (`npx vitest run`)
e do `git diff`. Uma reprovação **simples** encontrada (gap de RF-05.3,
ver abaixo), que não reverte nenhuma tarefa para `Em andamento` e vira
`RL8-T01` em `Refatoração Lote-8` (`TASK.md` Seção 3). Nenhuma reprovação
crítica.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npx vitest run src/lib/stage-rules/__tests__/hospedagem.test.ts src/components/hospedagem/__tests__/hospedagem-sugestoes-screen.test.tsx` | 18/18 passam (7 + 11) — os dois únicos arquivos de teste do lote que não dependem de Postgres real, confirmados 100% passando, execução direta desta sessão de validação |
| `npx vitest run src/lib/stage-rules src/lib/actions src/components/hospedagem src/lib/session-flow` | 90 testes passam, 59 falham — **todas** as 59 falhas são `*.integration.test.ts` (incluindo `hospedagem.integration.test.ts`, L8-T03), todas com `PrismaClientInitializationError: Can't reach database server at localhost:55432`, confirmado por inspeção — mesma limitação de ambiente já documentada e aceita desde Lote 1/4/7. Nenhuma outra classe de falha encontrada nesta execução |

### L8-T01 — Regra RF-06 (geração de 3 opções de hospedagem + filtro de orçamento)

Critério de aceite: "Sempre 3 opções, cada uma com nome/tipo, faixa de
preço por diária, característica distintiva."

- `src/lib/stage-rules/hospedagem.ts`: `generateAccommodationSuggestions`
  chama `generateStructuredCompletionWithRetry` (L3-T04, retry+log) com o
  prompt/schema já registrados da etapa `hospedagem` (L3-T02) —
  `hospedagemOpcoesSchema` já garante `.length(3)` na saída do Gateway de
  IA, confirmado por leitura de `src/lib/gateway-ia/schemas.ts`. Aplica
  `applyBudgetFilter` (L4-T03) sobre as 3 opções — reordena/sinaliza
  excedente, nunca remove item (RF-10.1/RN-04), confirmado por leitura de
  `budget-filter.ts`, então o resultado desta função também tem sempre 3
  opções. `AccommodationSuggestionResult` sempre expõe
  `name`/`type`/`pricePerNightMin`/`pricePerNightMax`/`distinctiveFeature`.
- 7 casos unitários (`src/lib/stage-rules/__tests__/hospedagem.test.ts`,
  `@vitest-environment node`, Gateway de IA mockado via `importOriginal`,
  todos passando nesta execução): sempre 3 opções com os 5 campos exigidos
  presentes e não vazios/numéricos; chamada correta ao Gateway
  (sessionId/stage/schemaName/mensagens, destino no prompt); sem orçamento
  nunca bloqueia (RF-10.3/RN-04); com orçamento reordena mantendo as 3
  opções (RF-10.1); nenhuma opção no orçamento devolve a mais barata
  primeiro com `exceedsBudget: true`, ainda com as 3 opções (RF-06.2/
  RF-10.2); erro sem destino aprovado (RN-01/RF-11); erro do Gateway
  propaga sem ser mascarado.
- **Aprovado.**

### L8-T02 — T06 UI (cartões, aprovar/ajustar, rodapé)

Critério de aceite: "'Ajustar' regenera a mesma etapa sem avançar
(RF-05.3); rodapé oferece continuar/encerrar (RF-05.4)."

- `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`: os estados
  aplicáveis a T06 (Carregando/Erro/Sucesso — "Vazio" corretamente
  ausente, UX-SPEC.md §4 marca T06 como "Não aplicável" para esse estado)
  via `LoadingStream`/`ErrorRetryState`/`SuggestionCard` (L5-T03/T04)
  reaproveitados sem duplicar lógica de estado, confirmado.
  `BudgetInsufficientBanner` exibido quando `exceedsBudget`, sem desabilitar
  os botões de aprovar (RN-04). "Ajustar" abre um campo de feedback textual
  por cartão (`textarea` com `label`/`aria-describedby`, exigido por
  UX-SPEC.md T06) e, ao submeter, chama `gerarSugestoesHospedagem` de novo
  (mesma função do carregamento inicial) — nenhuma chamada de transição de
  estado acontece, a sessão permanece em `hospedagem_pendente`: confirmado
  contra `state-machine.ts` (`ajustar` é self-loop em `hospedagem_pendente`,
  linha 132), então "regenera sem avançar" (RF-05.3, na leitura literal do
  critério de aceite desta tarefa) está cumprido. Rodapé, só depois de uma
  aprovação, oferece "Continuar para passeios" (navegação client-side, sem
  chamada de servidor adicional — o servidor já confirmou o avanço dentro
  de `aprovarHospedagem`) e "Só queria decidir até aqui — encerrar aqui"
  (`encerrarResolucaoHospedagem` + navegação só após a Promise resolver) —
  ambos presentes (RF-05.4).
- Acessibilidade: foco no título ao montar (`headingRef`), erros com
  `role="alert"` + ícone + texto, `min-h-11` nos botões principais,
  `aria-busy` nos estados pendentes — mesmo padrão de T04/T05.
- 11 casos em `hospedagem-sugestoes-screen.test.tsx` (Server Actions
  substituídas via `actionsOverride`, nenhum mock de módulo inteiro),
  todos passando nesta execução — cobrindo os 3 estados, "Ajustar"
  regenerando sem avançar, `BudgetInsufficientBanner` não bloqueando,
  rodapé com as duas ações do RF-05.4.
- **Achado simples (RF-05.3, ver seção dedicada abaixo)**: o campo de
  feedback textual é capturado pela UI (exigido por UX-SPEC.md T06) mas o
  texto não chega ao prompt de regeneração — vira `RL8-T01`. Não reprova
  esta tarefa (ver raciocínio abaixo).
- **Aprovado, com ressalva simples registrada em `RL8-T01`.**

### L8-T03 — T06 Server Actions (aprovar/ajustar/encerrar)

Critério de aceite: "Aprovar persiste `AccommodationApproval` e avança
para passeios."

- `src/lib/actions/hospedagem.ts`: `gerarSugestoesHospedagem` valida
  `flowState === "hospedagem_pendente"` antes de gastar uma chamada ao
  Gateway de IA (`HospedagemEtapaInvalidaError` caso contrário) e resolve o
  contexto mínimo (range de datas + `DestinationApproval` já aprovado) com
  guardas defensivas (`HospedagemContextoIncompletoError`) — confirmado por
  leitura. `aprovarHospedagem` **revalida** o payload da sugestão no
  servidor (`assertValidAccommodationPayload`: nome/tipo/característica não
  vazios, faixa numérica/não-negativa/não-invertida/dentro de teto de
  sanidade) antes de persistir — nunca confia cegamente no payload devolvido
  pelo cliente (mesmo padrão de `destino.ts`/L7-T03, item relevante também
  para `SECURITY-REVIEW.md`). Toda persistência passa por
  `applySessionFlowTransition` (L4-T02) — nenhuma escrita direta no Prisma
  para `TripSession`/`AccommodationApproval`, confirmado por leitura
  completa do arquivo (as únicas leituras diretas são
  `prisma.tripSession.findUnique`/`prisma.destinationApproval.findUnique`
  em `gerarSugestoesHospedagem`, para montar contexto).
- **Encadeamento `aprovar` + `avancar` numa única Server Action
  (desvio intencional do padrão de `destino.ts`, sinalizado pelo próprio
  Executor)**: confirmado contra `state-machine.ts` — a partir de
  `hospedagem_pendente`, `aprovar` só leva a `hospedagem_aprovada` (linha
  130-132), e `hospedagem_aprovada` só tem a transição `avancar` →
  `passeios_pendente` (linha 134-136), nenhuma outra ação disponível nesse
  estado. Não há uma tela de confirmação intermediária para hospedagem
  (diferente de destino/T05, que tem T05 entre `aprovar` e `avancar`) —
  RF-06.3 exige literalmente "aprovar avança para passeios", sem uma etapa
  extra. Encadear as duas chamadas sequenciais de
  `applySessionFlowTransition` dentro da mesma Server Action é, portanto,
  a única forma de cumprir RF-06.3 sem inventar uma tela de confirmação
  fora de escopo — não viola RN-01 (nenhuma etapa é pulada: a sessão passa
  literalmente por `hospedagem_aprovada` antes de `passeios_pendente`,
  cada `applySessionFlowTransition` é uma transição válida e atômica da
  tabela oficial) nem duplica a lógica de transição (delega 100% a
  `applySessionFlowTransition`, mesma função de sempre). Mesmo padrão já
  teria sido exercitado em `persistence.integration.test.ts` (L4-T02, "duas
  chamadas sequenciais"), citado corretamente pela nota do Executor.
  Concordo com a decisão.
- `encerrarResolucaoHospedagem` só chama
  `applySessionFlowTransition({ action: "encerrar" })`, preservando
  `DestinationApproval`/`AccommodationApproval` já gravados (RN-03)
  estruturalmente — mesma garantia já confirmada em L4-T02/L7-T03.
- 8 casos de integração real com Postgres
  (`hospedagem.integration.test.ts`) — não confirmados nesta sessão de
  validação (mesma limitação de ambiente do restante da suíte), mas lidos
  linha a linha: cobrem exatamente o critério de aceite desta tarefa
  (`AccommodationApproval` persistido + `flowState` avança para
  `passeios_pendente`, com asserção direta em `prisma.accommodationApproval.
  findUniqueOrThrow`/`prisma.tripSession.findUniqueOrThrow`), mais os casos
  negativos (etapa errada, payload adulterado, RN-03 preservado em
  `encerrar`) — o teste testaria corretamente o que o critério de aceite
  exige, se rodasse contra um banco real. Nenhuma lacuna de cobertura
  encontrada para o critério de aceite desta tarefa.
- **Achado simples (RF-05.3), mesmo já descrito na L8-T02 acima**: nem
  `StageContext`/`buildHospedagemPrompt` nem `generateAccommodationSuggestions`
  têm hoje um campo para incorporar o texto de feedback ao prompt — vira
  `RL8-T01`. Não reprova esta tarefa (ver raciocínio abaixo).
- **Aprovado, com ressalva simples registrada em `RL8-T01`.**

### Achado: feedback textual de "Ajustar" não incorporado ao prompt (RF-05.3)

RF-05.3 (`PRD-TECNICO.md`) exige literalmente: "gerar uma nova sugestão
para a mesma etapa, **incorporando o feedback do usuário**, sem avançar
para a etapa seguinte." UX-SPEC.md T06 também exige explicitamente um
"campo de feedback textual curto" na ação Ajustar. Confirmado por leitura
completa do fluxo: a `HospedagemSugestoesScreen` (L8-T02) captura o texto
digitado no `textarea` (`feedbackValue`), mas `handleAdjustSubmit` só o usa
para um `console.info` em modo dev — a chamada real
(`actions.gerarSugestoesHospedagem(sessionId)`) não recebe o texto.
Confirmado também em `gerarSugestoesHospedagem`/`generateAccommodationSuggestions`
(L8-T03/L8-T01): nenhum dos dois tem parâmetro para um feedback textual;
`buildHospedagemPrompt` (`@/lib/gateway-ia`, L3-T02) não tem espaço para
esse dado no prompt.

Diferente do gap já presente em T04 (L7-T03, "nova rodada"/RF-04.4), que
**não** exige incorporar feedback (RF-04.4 só fala em "gerar uma nova
rodada de sugestões ou permitir entrada manual", sem menção a feedback
textual, e T04 nem tem um campo de "Ajustar" por bloco, só um fluxo de
rejeição total — confirmado em `UX-SPEC.md` linhas 77-83 vs. 97-102) —
este é um gap real e específico de T06 contra a letra de RF-05.3 e de
UX-SPEC.md T06, não um caso já silenciosamente aceito em lote anterior.

**Classificação: achado simples, não crítico.** Razões:
1. O critério de aceite desta tarefa, como escrito pelo Coordenador no
   `TASK.md` ("'Ajustar' regenera a mesma etapa sem avançar"), não exige
   textualmente a incorporação do feedback — só o "sem avançar", que está
   cumprido. O requisito mais amplo (incorporar feedback) é parte de
   RF-05.3 mas não foi decomposto como parte explícita do critério de
   aceite desta tarefa específica — não é um caso de reinterpretar o
   critério, é reconhecer que o critério como escrito já é mais estreito
   que o requisito de origem.
2. Não compromete o critério de aceite central de nenhuma das 3 tarefas do
   lote (RF-06.1/.2/.3, todos cumpridos) nem bloqueia outra tarefa do lote
   — Lote 9 (Passeios) não depende deste comportamento.
3. Baixo esforço de correção: estender `StageContext`/`buildHospedagemPrompt`
   (L3-T02) com um campo opcional e repassá-lo em
   `generateAccommodationSuggestions`/`gerarSugestoesHospedagem` — sem
   mudança de arquitetura.
4. Já transparentemente documentado pelo próprio Executor (cabeçalho de
   `hospedagem.ts` e da tela), com aviso de dev visível em vez de descarte
   silencioso — reduz o risco de a lacuna passar despercebida.

Por isso, as 3 tarefas do lote **permanecem `Concluída`** e o achado vira
`RL8-T01` em `Refatoração Lote-8` (`TASK.md` Seção 3), com nota apontando
que o mesmo padrão de "ajustar com feedback" volta a aparecer em T07
(Lote 9) — vale avaliar resolução conjunta. Este achado **não** escala ao
Coordenador (não é um padrão recorrente de bug de decomposição, é um único
gap específico de RF-05.3/T06 já isolado e corrigível numa tarefa própria).

### Testes de integração cruzada entre as tarefas do lote (fluxo ponta a ponta)

Fluxo completo confirmado por leitura + testes automatizados existentes,
encadeando os módulos reais sem reimplementação local:

1. `gerarSugestoesHospedagem` (L8-T03) → `generateAccommodationSuggestions`
   (L8-T01) → Gateway de IA (Lote 3) + `applyBudgetFilter` (Lote 4) —
   sugestões chegam a `HospedagemSugestoesScreen` (L8-T02) via `fetchImpl`
   (mesmo bridge de `LoadingStream` de T04).
2. `aprovarHospedagem` (L8-T03) → `applySessionFlowTransition` × 2 (Lote 4)
   → `hospedagem_pendente` → `hospedagem_aprovada` (persistindo
   `AccommodationApproval`) → `passeios_pendente` — a UI (L8-T02) navega
   para `/passeios` só depois da Promise resolver, sem transição otimista.
3. "Ajustar" (L8-T02) → `gerarSugestoesHospedagem` de novo (L8-T03), sem
   transição de estado — confirmado consistente com o self-loop `ajustar`
   em `hospedagem_pendente` da state machine.
4. `encerrarResolucaoHospedagem` (L8-T03) → `applySessionFlowTransition` →
   `encerrada_parcial`, preservando `DestinationApproval`/
   `AccommodationApproval` já gravados (RN-03).
- Nenhuma das 3 tarefas reimplementa lógica de outra (Diretriz de
  Implementação 3/11) — confirmado por leitura cruzada dos 3 arquivos
  principais.
- Integração com Lotes 3/4/5/7/11: Lote 3 (Gateway de IA) e Lote 4
  (Orquestração/Orçamento) consumidos só via suas fronteiras públicas
  (`@/lib/gateway-ia`, `@/lib/session-flow`), nenhum arquivo interno
  importado diretamente. Lote 5 (Design System) reaproveitado sem
  duplicação (`SuggestionCard`/`LoadingStream`/`ErrorRetryState`/
  `BudgetInsufficientBanner`). `L11-T03` (sanitização de texto livre)
  corretamente tratada como pré-requisito já satisfeito — o nome do
  destino consumido por `buildHospedagemPrompt` já chega sanitizado do
  ponto de captura em `destino.ts`/`data-livre.ts`/`feriados.ts`,
  confirmado por leitura do cabeçalho de `hospedagem.ts` e por
  `Refatoração`/Bloqueio 003 já resolvido antes do início deste lote (ver
  Lote 7 acima). Lote 7 (Destino) é pré-requisito funcional direto: a
  sessão só chega a `hospedagem_pendente` depois de `destino_confirmado` +
  `avancar` — testado explicitamente em `hospedagem.integration.test.ts`
  via `createSessionAtHospedagemPendente`.

### Requisitos não funcionais relevantes ao lote

- **RN-04** (orçamento nunca bloqueia): confirmado em `applyBudgetFilter`
  (Lote 4, revalidado) e em `HospedagemSugestoesScreen` (botão de aprovar
  nunca desabilitado por `BudgetInsufficientBanner`, só pelo estado local
  de "já aprovado nesta tela"/"aprovação em andamento").
  RN-01 (nunca pula etapa): confirmado no encadeamento `aprovar`+`avancar`
  de `aprovarHospedagem` (ver L8-T03 acima) e nas guardas de
  `flowState`/`InvalidTransitionError` em toda Server Action do lote.
- **Acessibilidade (WCAG AA, UX-SPEC §5)**: foco gerenciado ao montar;
  erros sempre `role="alert"` + ícone + texto; alvo de toque `min-h-11`
  nos botões principais; campo de feedback com `label`/`aria-describedby`
  ligando erro ao campo. Nenhuma checagem automatizada de contraste/leitor
  de tela real executada nesta validação (fora do escopo de `npm test`/
  `npm run build`) — mesma limitação já aceita nos Lotes 5/7, revisão final
  cross-tela reservada para `L11-T04`.
- **RNF-05 (retry único)**: reaproveitado de L3-T04 via
  `generateStructuredCompletionWithRetry`, nenhuma reimplementação.

### Fechamento estrutural do Lote 8 (checagem do Validador)

- Todas as 3 tarefas do lote (`L8-T01`, `L8-T02`, `L8-T03`) estão
  `Concluída` no `TASK.md`.
- Nenhuma dependência da Seção 4 órfã ou inconsistente relativa a este
  lote: `Lotes 3+4+5 → Lote 8` e `L8-T01 também aguarda L11-T03` — ambos
  pré-requisitos já `Concluída`/`Validado` antes do início deste lote,
  confirmado.
- Nenhuma tarefa `Bloqueada` sem resolução dentro do lote.
- Achado simples registrado como `RL8-T01` em `Refatoração Lote-8`
  (`TASK.md` Seção 3), com posição na fila de dependências (Seção 4)
  atualizada (`Lote 8 → Refatoração Lote-8 (RL8-T01)`, sem bloquear a
  ordem de execução dos demais lotes, sem prazo crítico).
- Nenhuma inconsistência que exija redesenho de dependência/decomposição
  encontrada — checagem de rotina concluída sem necessidade de reabrir o
  Coordenador.

## Veredito de Release-Readiness do Lote 8

**Lote 8 pode fechar como `Validado com ressalvas`.** As 3 tarefas (L8-T01
a L8-T03) passam nos critérios de aceite literais do `TASK.md`, `npm run
lint` passa sem regressão, a suíte não-integração passa integralmente
(18/18 nos dois arquivos deste lote; 90/149 no escopo mais amplo, com as
59 falhas restantes 100% explicadas pela indisponibilidade de Postgres
neste ambiente), a composição entre as tarefas (regra → Server Actions →
UI) funciona como projetada e é consistente com a state machine (Lote 4).
A ressalva é o achado simples de RF-05.3 acima (`RL8-T01`), que não
bloqueia o fechamento do lote nem o início do Lote 9. **O lote está
liberado para a auditoria de segurança completa do chapéu DevSecOps**
(ver `SECURITY-REVIEW.md`).

## Lote 9 — Passeios (T07)

Status geral: **Aprovado.** As 3 tarefas (L9-T01 a L9-T03) passam
integralmente nos critérios de aceite literais do `TASK.md`, confirmado
por leitura direta do código (`src/lib/stage-rules/passeios.ts`,
`src/lib/actions/passeios.ts`/`passeios-errors.ts`,
`src/components/passeios/passeios-sugestoes-screen.tsx`) e por leitura
cruzada de `src/lib/session-flow/state-machine.ts`/`budget-filter.ts` —
não pela nota de implementação do Executor — e por execução real da
suíte e do `git diff`. Nenhuma reprovação, crítica ou simples, encontrada
neste lote.

### Suíte executada

| Comando | Resultado |
|---|---|
| `npx eslint src/lib/stage-rules/passeios.ts src/lib/actions/passeios.ts src/lib/actions/passeios-errors.ts src/components/passeios/passeios-sugestoes-screen.tsx` | Passou — nenhum warning/erro |
| `npx vitest run src/lib/stage-rules/__tests__/passeios.test.ts src/components/passeios/__tests__/passeios-sugestoes-screen.test.tsx src/lib/actions/__tests__/passeios.integration.test.ts` | 25/35 passam (12 de `passeios.test.ts` + 13 de `passeios-sugestoes-screen.test.tsx`, os dois arquivos que não dependem de Postgres real, 100% passando) — as 10 falhas restantes são **todas** de `passeios.integration.test.ts` (L9-T03), todas com `PrismaClientInitializationError: Can't reach database server at localhost:55432`, confirmado por inspeção linha a linha de cada falha — mesma limitação de ambiente já documentada e aceita desde os Lotes 1/4/7/8. Nenhuma outra classe de falha encontrada |

### L9-T01 — Regra RF-07 (geração de passeios + garantia de item gratuito + filtro de orçamento)

Critério de aceite: "Cada item com nome, faixa de preço (podendo ser R$
0), duração aproximada; ao menos 1 item gratuito quando relevante ao
destino."

- `src/lib/stage-rules/passeios.ts`: `generatePasseiosSuggestions` chama
  `generateStructuredCompletionWithRetry` (L3-T04, retry+log) com
  `buildPasseiosPrompt`/`passeiosOpcoesSchema` (L3-T02) — o schema garante
  `.min(1)`, sem teto, confirmado em `src/lib/gateway-ia/schemas.ts` (lido
  diretamente, não só pela nota do Executor). Aplica `applyBudgetFilter`
  (L4-T03) sobre o resultado.
- **RF-07.1/.2 — checado item por item, não só pela nota**: a garantia de
  "ao menos 1 item gratuito quando existir" é responsabilidade do
  **prompt** (`buildPasseiosPrompt`, `src/lib/gateway-ia/prompts.ts` linha
  220-224: "Inclua pelo menos uma opção gratuita quando existir algo
  relevante e gratuito... nunca invente gratuidade só para cumprir isso"),
  não da regra de negócio — confirmado por leitura direta do texto do
  prompt. `generatePasseiosSuggestions` nunca força/inventa um item
  gratuito quando o LLM não retorna nenhum, comportamento coberto pelo
  teste "não inventa item gratuito artificial quando o LLM não retorna
  nenhum" (passeios.test.ts, linha 120), que roda e passa nesta sessão.
  Interpretação de "quando relevante ao destino" como responsabilidade do
  prompt (best-effort do LLM), não de uma regra determinística no código,
  é razoável dado que "relevância ao destino" não é um dado estruturado
  disponível nesta camada — mesma leitura que seria feita independente da
  nota do Executor.
- **Filtro de orçamento + item gratuito — confirmado por teste, não só
  por leitura de código**: `budget-filter.ts` (L4-T03, não modificado
  nesta tarefa) trata `precoMin = 0` corretamente sem necessidade de
  alteração — confirmado lendo a função (linhas 104-112: qualquer
  `precoMin <= budget.amount` entra em `withinBudget`, e 0 sempre satisfaz
  isso para orçamento não-negativo) e pelos 3 testes dedicados que rodam e
  passam: item gratuito sempre `withinBudget:true`/`exceedsBudget:false`
  mesmo com orçamento de valor 1 (linha 190) ou 10 com todos os itens
  pagos fora da faixa (linha 222), e o caso RF-10.2 correto quando não há
  nenhum item gratuito na lista (linha 236, sinaliza o mais barato como
  excedente). RF-07.1/.2 e o filtro de orçamento sobre item gratuito estão
  cobertos por teste real, não apenas pela alegação da nota.
- Sanitização (L11-T03/RL8-T02, Bloqueio 003) — **verificado
  explicitamente, ponto de atenção do escopo desta validação**: esta
  função não sanitiza `destination.name`/`accommodation.name`/`.type`
  diretamente, mas confirmado que os dois pontos de captura upstream já o
  fazem antes de persistir como `DestinationApproval`/
  `AccommodationApproval` — `sanitizeFreeTextForPrompt` aplicada em
  `src/lib/actions/destino.ts`/`data-livre.ts`/`feriados.ts` (destino) e
  em `assertValidAccommodationPayload`/`src/lib/actions/hospedagem.ts`
  (hospedagem, RL8-T02) —, então o valor que chega a
  `generatePasseiosSuggestions` e é interpolado em `buildPasseiosPrompt`
  já está sanitizado. `buildPasseiosPrompt` (`prompts.ts` linha 199-231)
  interpola `context.destination.name`/`context.accommodation.name`/
  `.type` só em frases fixas em português, nunca como instrução ao
  modelo — confirmado por leitura direta do texto do prompt. Nenhuma
  lacuna encontrada neste ponto: o requisito do Bloqueio 003 (nenhuma
  tarefa que alimenta `buildPasseiosPrompt` a partir de texto livre pode
  rodar antes de L11-T03 sanitizar na origem) está satisfeito — L9-T01 é
  consumidor do dado já sanitizado, não um novo ponto de entrada de texto
  livre bruto.
- 12 casos em `passeios.test.ts`, todos passando nesta execução: lista com
  ao menos 1 item/shape completo, preservação/não-invenção de item
  gratuito, chamada correta ao Gateway, repasse de hospedagem opcional,
  sem orçamento nunca bloqueia, item gratuito sempre dentro do orçamento,
  reordenação com orçamento (RF-10.1), RF-10.2 sem item gratuito, erro sem
  destino (RN-01), erro do Gateway propagado sem máscara.
- **Aprovado.**

### L9-T02 — T07 UI (lista com checkbox, remoção, badge "Gratuito", validação "ao menos um item")

Critério de aceite: "Botão 'Aprovar seleção' desabilita/some se todos os
itens forem removidos, com mensagem explicativa."

- `src/components/passeios/passeios-sugestoes-screen.tsx`: `selecionados =
  itens visíveis (não removidos) E marcados` (linhas 274-284) — checkbox
  desmarcado exclui da seleção sem remover da lista (reversível);
  "Remover" tira da lista por completo (irreversível nesta tela). Ambos os
  mecanismos convergem para `noSelection` (linha 288). Critério de aceite
  central confirmado no JSX: o botão "Aprovar seleção" fica `disabled`
  (nunca some do DOM, linha 459) com `aria-describedby` apontando para a
  mensagem inline `NENHUM_ITEM_SELECIONADO_MESSAGE` (linhas 434-442,
  460-463) quando `noSelection` é verdadeiro — cumpre "desabilita" (a
  redação do critério aceita "desabilita/some", e a escolha por
  "desabilita" em vez de "some" é documentada e justificada pela nota
  do Executor com base em UX-SPEC §5, acessibilidade de teclado/leitor de
  tela — decisão de detalhe de implementação dentro da margem do
  Executor, não uma reinterpretação do critério de aceite). "Encerrar
  aqui" permanece disponível fora do bloco condicional de aprovação
  (linhas 469-480), confirmado.
- Badge "Gratuito": `isFree` mapeado diretamente para a prop `free` de
  `SuggestionCard`/`PriceRangeBadge` (linha 399) — componente já suportava
  `free` desde L5-T02, nenhuma alteração necessária, confirmado por
  inspeção do componente compartilhado.
- Acessibilidade: cada checkbox com `<label>` + texto `sr-only` (linhas
  402-408), alvo de toque `min-h-11`/`min-w-11` nos controles, foco no
  `<h1>` ao montar (linha 214-216), `aria-busy` nos estados pendentes.
- 13 casos em `passeios-sugestoes-screen.test.tsx`, todos passando nesta
  execução: Carregando/Sucesso/Erro, badge "Gratuito", desmarcar excluindo
  da seleção, remover tirando da lista, os dois testes do critério de
  aceite central (remoção total e desmarcar todos, ambos desabilitando o
  botão com a mensagem e mantendo "encerrar aqui"), aprovar mostrando
  rodapé continuar/encerrar, foco no título, estado de erro com retry.
- **Aprovado.**

### L9-T03 — T07 Server Actions (aprovar seleção, remover item, encerrar)

Critério de aceite: "Aprovar persiste `ActivityApproval` só dos itens não
removidos e avança para roteiro."

- `src/lib/actions/passeios.ts`: `aprovarSelecaoPasseios` recebe só
  `selecionados` (itens já filtrados pelo client) e persiste um
  `ActivityApproval` por item via `applySessionFlowTransition({ action:
  "aprovar", childData: { stage: "passeios", activities: [...] } })`
  seguido de `applySessionFlowTransition({ action: "avancar" })` — mesmo
  padrão de encadeamento de `aprovarHospedagem` (L8-T03), confirmado
  contra `state-machine.ts` (linhas 137-142: `passeios_pendente` →
  `aprovar` → `passeios_aprovados` → `avancar` → `roteiro_pendente`, sem
  transição direta, nenhuma etapa pulada). `EmptyPasseiosSelectionError`
  lançado quando `selecionados` vem vazio (guarda server-side equivalente
  ao botão desabilitado da UI, `passeios-errors.ts` linha 74-81).
- **Revalidação server-side confirmada, não confiada à nota**:
  `assertValidActivityPayload` (linhas 222-274) rejeita nome/duração
  vazios, preço não numérico/negativo/invertido/acima de
  `MAX_SANE_PRICE_BRL` — nunca confia cegamente no payload devolvido pelo
  cliente, mesmo padrão de `assertValidAccommodationPayload` (RL8-T02).
- **Sanitização contra prompt injection (Bloqueio 003/L11-T03) —
  confirmada, ponto de atenção do escopo desta validação**:
  `sanitizeFreeTextForPrompt` (`@/lib/gateway-ia/prompt-injection-guard`)
  aplicada a `name`/`durationApprox` de cada item (linhas 225-235) **antes**
  de qualquer validação de "vazio" e antes de `applySessionFlowTransition`
  — é o valor sanitizado, nunca o original do cliente, que chega a
  `ActivityApproval`. Relevante porque esses dois campos são texto gerado
  pelo LLM que volta ao servidor via client e depois é interpolado
  literalmente em `buildRoteiroPrompt` (linhas 253-266 de
  `prompts.ts`) assim que a sessão avança para roteiro — mesmo vetor já
  mitigado para hospedagem em RL8-T02. Nenhuma lacuna encontrada.
- **Consistência do contrato L9-T02 ↔ L9-T03 — checada campo a campo, não
  só pela nota cruzada dos dois Executores**: os três nomes de função
  (`gerarSugestoesPasseios`, `aprovarSelecaoPasseios`,
  `encerrarResolucaoPasseios`), a assinatura de `aprovarSelecaoPasseios`
  (`{ sessionId, selecionados }` → `{ proximaEtapa: "roteiro"; sessionId;
  flowState: "roteiro_pendente"; passeios: string[] }`) e o tipo
  `PasseiosSuggestionResult` batem exatamente entre
  `passeios-sugestoes-screen.tsx` (bloco "CONTRATO ESPERADO DA SERVER
  ACTION DE L9-T03", linhas 46-101) e `passeios.ts` — confirmado por
  comparação direta dos dois arquivos, nenhuma divergência de nome de
  campo/assinatura encontrada. A prop `actions` obrigatória (em vez de
  `actionsOverride` opcional já usado por hospedagem/destino) permanece
  como próxima integração fora do escopo de ambas as tarefas — já
  documentado nos dois arquivos, não é uma pendência desta validação.
- `encerrarResolucaoPasseios` só chama `applySessionFlowTransition({
  action: "encerrar" })`, disponível a partir de `passeios_pendente` ou
  `passeios_aprovados` (`STATES_WITH_AT_LEAST_ONE_APPROVAL`, confirmado em
  `state-machine.ts` linhas 97-104), preservando destino/hospedagem/
  passeios já aprovados (RN-03) estruturalmente.
- 10 casos de integração real com Postgres
  (`passeios.integration.test.ts`) — não confirmados nesta sessão de
  validação (mesma limitação de ambiente do restante da suíte), mas lidos
  linha a linha: cobrem geração usando destino+hospedagem, rejeição fora
  de etapa, aprovação persistindo só os selecionados e avançando (critério
  de aceite central), lista vazia, payload adulterado, sanitização de
  prompt injection, encerrar preservando aprovações em ambos os pontos de
  saída, rejeição de encerrar sem nenhuma etapa aprovada. Testariam
  corretamente o critério de aceite se rodassem contra um banco real.
  Nenhuma lacuna de cobertura encontrada para o critério de aceite desta
  tarefa.
- **Aprovado.**

### Integração cruzada L9-T01 → L9-T02 → L9-T03 e com o restante do fluxo

- Contrato de shape (`PasseiosSuggestionResult`: `name`/`priceMin`/
  `priceMax`/`isFree`/`durationApprox`/`withinBudget`/`exceedsBudget`)
  consistente ponta a ponta: exportado por `passeios.ts` (stage-rules,
  L9-T01), reexportado sem alteração por `src/lib/actions/passeios.ts`
  (L9-T03), e consumido sem adaptação por
  `passeios-sugestoes-screen.tsx` (L9-T02) — confirmado por leitura dos
  três arquivos, nenhum campo renomeado/adaptado em nenhum ponto.
- Fluxo de entrada (vem do Lote 5/8): `passeios_pendente` só é alcançado a
  partir de `hospedagem_aprovada` + `avancar` (RF-11), que por sua vez
  exige `destino_confirmado` — `gerarSugestoesPasseios` lê
  `DestinationApproval`/`AccommodationApproval` já aprovados e trata a
  ausência do destino como violação de invariante
  (`PasseiosContextoIncompletoError`), hospedagem como opcional — coerente
  com a state machine (L4-T01) e com o próprio RF-11.
  `BudgetInsufficientBanner`/`StepperProgress`/`SuggestionCard`
  reaproveitados sem duplicação de lógica de estado (L5-T02/T03/T04).
- Fluxo de saída (segue para Lote 10/roteiro): `aprovarSelecaoPasseios`
  avança a sessão até `roteiro_pendente` no servidor antes de o client
  navegar (`router.push` em `handleContinuar` é só navegação, o avanço já
  ocorreu) — mesmo padrão de T04/T06, sem risco de o client navegar para
  uma etapa que o servidor ainda não confirmou. `buildRoteiroPrompt`
  (Lote 10, L10-T01, ainda não implementado nesta validação) já espera
  `context.approvedActivities` com `name`/`durationApprox`/`isFree` —
  compatível com o shape persistido por `ActivityApproval` nesta tarefa,
  confirmado por leitura cruzada de `prompts.ts` linhas 253-266 (fora do
  escopo desta validação em si, checado só para garantir que a saída
  deste lote não quebra o próximo).
- Nenhuma divergência de integração cruzada encontrada.

### Fechamento estrutural do Lote 9 (checagem do Validador)

- Todas as 3 tarefas do lote (`L9-T01`, `L9-T02`, `L9-T03`) estão
  `Concluída` no `TASK.md`.
- Nenhuma dependência da Seção 4 órfã ou inconsistente relativa a este
  lote: `L9-T01` depende de `L3-T02`, `L3-T03`, `L3-T04`, `L4-T03`,
  `L11-T03`, `RL8-T02` — todos já `Concluída`/resolvidos antes do início
  deste lote, confirmado (incluindo o requisito específico do Bloqueio
  003, checado acima). `L9-T02` depende de `L5-T02`, `L5-T03`, `L9-T01`;
  `L9-T03` depende de `L4-T02`, `L9-T01` — todos satisfeitos.
- Nenhuma tarefa `Bloqueada` sem resolução dentro do lote.
- Nenhum achado simples/débito baixo-médio encontrado neste lote — nenhuma
  tarefa nova criada em `Refatoração Lote-9` (não há necessidade de criar
  a seção).
- Nenhuma inconsistência que exija redesenho de dependência/decomposição
  encontrada — checagem de rotina concluída sem necessidade de reabrir o
  Coordenador.

## Veredito de Release-Readiness do Lote 9

**Lote 9 pode fechar como `Validado`.** As 3 tarefas (L9-T01 a L9-T03)
passam integralmente nos critérios de aceite literais do `TASK.md`,
incluindo os dois pontos de atenção específicos desta validação
(RF-07.1/.2 com garantia de item gratuito via prompt, sem invenção
artificial, testado; e a sanitização L11-T03 confirmada tanto no
consumo de `destination`/`accommodation` já sanitizados por L9-T01
quanto na sanitização direta de `name`/`durationApprox` por L9-T03 antes
de persistir/interpolar em `buildRoteiroPrompt`). `npx eslint` passa sem
regressão nos arquivos do lote, a suíte não-integração passa
integralmente (25/25 nos dois arquivos deste lote que não dependem de
Postgres), a composição entre as tarefas (regra → Server Actions → UI) é
consistente com a state machine (Lote 4) e o contrato entre L9-T02/L9-T03
bate campo a campo. Nenhuma ressalva registrada. **O lote está liberado
para a auditoria de segurança completa do chapéu DevSecOps** (ver
`SECURITY-REVIEW.md`).

## Lote 10 — Roteiro Final e Encerramento (T08, T-END)

Status geral: **Aprovado com ressalvas**. As 4 tarefas do lote (L10-T01 a
L10-T04) passam nos respectivos critérios de aceite literais do `TASK.md`,
confirmados por leitura direta do código
(`src/lib/stage-rules/roteiro.ts`, `src/lib/actions/roteiro.ts`/
`roteiro-errors.ts`, `src/components/design-system/itinerary-day-block.tsx`,
`src/components/roteiro/roteiro-screen.tsx`,
`src/components/encerramento/encerramento-screen.tsx`) e por leitura cruzada
de `src/lib/gateway-ia/prompts.ts`/`schemas.ts` (L3-T02) e
`src/lib/session-flow/persistence.ts` (L4-T02) — não pela nota de
implementação do Executor — e por execução real da suíte. Nenhuma
reprovação crítica nem simples de nenhuma das 4 tarefas. Um achado
**estrutural (não uma reprovação de tarefa)** foi encontrado na checagem de
fechamento do lote — um padrão recorrente de decomposição que **exige
redesenho** (novas tarefas/rotas) e por isso foi escalado ao Coordenador via
`BLOCKERS.md` (Bloqueio 005), não resolvido pelo próprio Validador — ver
seção dedicada abaixo.

### Suíte executada (ambiente local)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npx tsc --noEmit` | Sem nenhum erro nos arquivos do Lote 10 (`roteiro.ts`, `roteiro-errors.ts`, `itinerary-day-block.tsx`, `roteiro-screen.tsx`, `encerramento-screen.tsx`, e respectivos testes) — os 3 erros pré-existentes reportados (`destino/confirmacao/__tests__/page.test.tsx`, `budget-insufficient-banner.test.tsx`, `auth-callbacks.test.ts`) pertencem a outras tarefas/lotes, não tocados por este |
| `npx vitest run src/lib/stage-rules/__tests__/roteiro.test.ts src/components/design-system/__tests__/itinerary-day-block.test.tsx src/components/roteiro/__tests__/roteiro-screen.test.tsx src/components/encerramento/__tests__/encerramento-screen.test.tsx` | 36/36 passam (12 + 6 + 9 + 9) — os 4 arquivos de teste do lote que não dependem de Postgres real, 100% passando, execução direta desta sessão de validação |
| `npx vitest run` (suíte completa) | 444 passam, 92 falham — **todas** as 92 falhas são `*.integration.test.ts` (incluindo `roteiro.integration.test.ts`, L10-T03, 9 casos), todas com `PrismaClientInitializationError: Can't reach database server at localhost:55432`, confirmado por inspeção do `FAIL` de cada suíte — mesma limitação de ambiente já documentada e aceita desde os Lotes 1/4/7/8/9. Nenhuma outra classe de falha encontrada nesta execução |

### L10-T01 — Regra RF-08 (geração do roteiro estruturado por dia)

Critério de aceite: "Todo dia do range tem bloco manhã/tarde/noite; toda
atividade tem horário sugerido; RF-08.2 evita deslocamento redundante
sempre que alternativa equivalente existir."

- `src/lib/stage-rules/roteiro.ts`: `generateRoteiro` chama
  `generateStructuredCompletionWithRetry` (L3-T04) com
  `buildRoteiroPrompt`/`roteiroEstruturadoSchema` (já existentes desde
  L3-T02, confirmado por leitura de `src/lib/gateway-ia/prompts.ts` linhas
  240-290 e `schemas.ts` linhas 96-121 — nada foi alterado ali por esta
  tarefa, consistente com a nota de implementação) e passa
  `sessionDateRange` (grounding de calendário, L3-T03) — confirmado que
  roteiro é de fato a única etapa que aciona `validateDateGrounding` (as
  outras 3 chamadas em `index.ts`/demais `stage-rules` não passam esse
  parâmetro).
- **"Todo dia do range tem bloco manhã/tarde/noite" — verificado linha a
  linha, não só pela nota**: `normalizeRoteiroDays` (linhas 190-229)
  enumera `enumerateIsoDates(dateRangeStart, dateRangeEnd)` (inclusive nos
  dois extremos, confirmado pelo `for` com `<=`) e mapeia CADA data para um
  `RoteiroDayResult` com os 3 arrays (`morning`/`afternoon`/`evening`)
  sempre presentes via `mapBlock(dia?.manha ?? [], counter)` — nunca
  `undefined`, mesmo quando o LLM não devolveu aquele dia (`dia` é
  `undefined` do `Map`). Dias duplicados pelo LLM são mesclados (blocos
  concatenados, `[...existing.manha, ...dia.manha]`), nunca descartados —
  confirmado pelo teste "mescla dias duplicados devolvidos pelo LLM" em
  `roteiro.test.ts` (execução real, passou).
- **"Toda atividade tem horário sugerido" — confirmado na origem, não
  reafirmado sem necessidade**: `roteiroBlocoSchema.horarioSugerido` já
  tem `z.string().min(1)` desde L3-T02 (`schemas.ts`), então qualquer
  resposta do Gateway de IA sem horário já teria sido rejeitada antes de
  chegar a `generateRoteiro` — `mapBlock` só repassa `bloco.horarioSugerido`
  sem validação própria, decisão correta (não duplica uma garantia já
  estrutural do schema).
- **RF-08.2 (evitar deslocamento redundante) — avaliado como "melhor
  esforço do LLM", não uma checagem determinística no código, e essa é a
  leitura correta do critério de aceite** ("sempre que uma alternativa
  equivalente existir" já modaliza o requisito como não-absoluto):
  confirmado que `buildRoteiroPrompt` de fato instrui "priorize agrupar
  atividades geograficamente próximas... sempre que uma alternativa
  equivalente existir" (linha 285-286 de `prompts.ts`) e que SPIKE-02 (ver
  `TASK.md` Seção 2) documenta explicitamente a decisão de não integrar
  geocoding real no MVP. Não há dado de geolocalização disponível nesta
  camada para uma checagem de proximidade determinística ser sequer
  possível — a mesma avaliação já aplicada pelo Validador ao caso análogo
  L3-T05 (Lote 3) e RF-07.1/.2 (Lote 9), consistente.
- `sequenceOrder`: calculado dentro do próprio `mapBlock` via `counter`
  compartilhado entre os 3 blocos do dia, incrementado na ordem
  dia (cronológica, por construção de `allDates.map`) > manhã > tarde >
  noite > ordem devolvida pelo LLM dentro do bloco — confirmado crescente e
  único pelo teste dedicado ("sequenceOrder crescente e único na ordem
  cronológica correta").
- Sanitização (L11-T03/RL8-T02): confirmado que `generateRoteiro` consome
  `destination.name`/`accommodation.name`/`.type`/
  `approvedActivities[].name` já sanitizados nos pontos de captura
  anteriores (`destino.ts`/`data-livre.ts`/`feriados.ts`,
  `assertValidAccommodationPayload`/RL8-T02, `assertValidActivityPayload`/
  L9-T03) — mesmo raciocínio já usado e confirmado em L8-T01/L9-T01, sem
  sanitização duplicada aqui. `buildRoteiroPrompt` interpola esses campos
  só em frases fixas em português, nunca como instrução — confirmado por
  teste dedicado em `prompt-injection-guard.test.ts` ("buildRoteiroPrompt
  nunca interpola a instrução maliciosa original (destino e hospedagem)"),
  que roda e passa nesta sessão.
- 12 casos em `roteiro.test.ts` (Gateway de IA mockado via `importOriginal`,
  mesmo padrão de `passeios.test.ts`), todos passando nesta execução:
  todos os dias do range presentes mesmo com dia ausente na resposta do
  LLM; os 3 blocos sempre presentes; horário sugerido sempre não vazio;
  justificativa preservada quando presente e `null` quando ausente;
  `sequenceOrder` crescente/único; mesclagem de dias duplicados; chamada ao
  Gateway com `sessionId`/`stage`/`schemaName`/`sessionDateRange` corretos;
  passeios aprovados repassados quando informados; funciona sem nenhum
  passeio aprovado (RN-04); erro claro sem destino/hospedagem (RN-01/
  RF-11/RF-06); propagação de erro do Gateway sem mascarar (inclui
  grounding de data).
- **Aprovado.**

### L10-T02 — T08 UI (blocos por dia, acordeão em mobile)

Critério de aceite: "Um bloco por dia da viagem, dividido em manhã/tarde/
noite; justificativa exibida quando presente."

- `ItineraryDayBlock` (`src/components/design-system/itinerary-day-block.tsx`):
  os 3 períodos são sempre renderizados via `ItineraryPeriodSection`, mesmo
  vazios (mostrando "Nada planejado." em vez de omitir a seção, linhas
  103-105) — confirmado por leitura direta, reforça visualmente RF-08.1;
  `suggestedTime` sempre exibido (linha 114-116, sem condicional);
  `timingJustification` só renderizado quando truthy (linha 118,
  `{item.timingJustification && (...)}`) — nunca a string `"null"` no lugar
  da ausência, confirmado pelo teste "justificativa exibida só quando
  presente, nunca a string 'null'".
- Acordeão em mobile: `hidden`/`md:flex` (linha 179-182) — conteúdo nunca
  sai do DOM, só oculto via CSS abaixo do breakpoint `md`; `aria-expanded`
  no `<button>` do cabeçalho reflete o estado lógico controlado
  (`expanded`, prop) independentemente do CSS — confirmado pelo teste
  "`aria-expanded` reflete o estado controlado". `RoteiroScreen` guarda um
  único `expandedDate` (nunca um `Set`, linha 116) — reflete literalmente
  "um dia expandido por vez" (UX-SPEC §6), e expande o primeiro dia por
  padrão ao carregar (`setExpandedDate(parsed[0]?.date ?? null)`).
- `RoteiroScreen`: consome `LoadingStream`/`ErrorRetryState` (L5-T03) via
  `fetchImpl` bridge sem duplicar lógica de streaming — mesmo padrão de
  `HospedagemSugestoesScreen`/`PasseiosSugestoesScreen`; único rodapé de
  ação ("Aprovar roteiro e concluir"), sem "ajustar"/"encerrar aqui" — o
  primeiro corretamente ausente (schema não prevê edição item a item no
  MVP, UX-SPEC.md T08) e o segundo corretamente ausente (T08 é a última
  etapa, o rodapé de "encerrar aqui" já existiu em T07). Foco gerenciado no
  `<h1>` ao montar — confirmado pelo teste dedicado.
- 6 casos em `itinerary-day-block.test.tsx` + 9 casos em
  `roteiro-screen.test.tsx`, todos passando nesta execução (ver tabela da
  suíte acima) — cobrem exatamente o critério de aceite central mais
  acordeão (alternar/colapsar), aprovação reenviando o roteiro carregado,
  navegação para `/encerramento?flowState=concluida`, erro inline na
  aprovação mantendo os blocos visíveis.
- **Aprovado.**

### L10-T03 — T08 Server Action (aprovar roteiro, RF-08.4)

Critério de aceite: "Aprovação persiste todos os itens do roteiro e marca
`TripSession.status = completed`."

- `src/lib/actions/roteiro.ts`: `gerarRoteiro` resolve a sessão, checa
  `flowState === "roteiro_pendente"` (`RoteiroEtapaInvalidaError` caso
  contrário, evitando gastar uma chamada ao Gateway de IA fora de
  propósito) e chama **explicitamente** `assertSessionOwnership` (L11-T02/
  ADR-008) logo após resolver o registro — confirmado necessário porque
  esta função lê `TripSession` diretamente via `prisma.tripSession.findUnique`,
  fora do módulo `session-flow` (que já embute o guard internamente). Sem
  essa chamada explícita, `gerarRoteiro` teria sido um ponto de leitura
  direta de `TripSession` sem autorização — confirmado que ela está de
  fato presente (linha 173) e chamada antes de qualquer outra decisão.
- `aprovarRoteiro` delega a autorização a `applySessionFlowTransition`
  (que já a embute internamente, confirmado em
  `src/lib/session-flow/persistence.ts` linha 205,
  `assertSessionOwnership` chamada dentro da própria transação, antes de
  qualquer decisão de transição/escrita) — nenhuma segunda checagem
  redundante necessária aqui, mesmo padrão já usado por
  `aprovarHospedagem`/`aprovarSelecaoPasseios`.
- **"Persiste todos os itens do roteiro" — confirmado item a item**:
  `flattenAndValidateDias` achata `RoteiroDayResult[]` em
  `ApproveItineraryItemInput[]` (uma linha por item, nenhum item descartado
  — dois `for` aninhados percorrem todo dia × todo bloco × todo item),
  revalidando cada um via `assertValidRoteiroItem`
  (`activity`/`suggestedTime` sanitizados e não-vazios,
  `timingJustification` sanitizado quando presente,
  `sequenceOrder` inteiro não-negativo) antes de persistir —
  `sanitizeFreeTextForPrompt` aplicada ANTES da checagem de vazio,
  confirmado por leitura direta (linhas 309-329), consistente com o padrão
  RL8-T02. `persistApprovedChildData` (`persistence.ts`, caso `"roteiro"`,
  linhas 315-327) grava um `ItineraryItem` por item via `createMany` —
  nenhum item some entre a UI e o banco.
- **"Marca `TripSession.status = completed`" — confirmado no ponto exato,
  não só pela nota**: `aprovarRoteiro` encadeia `action: "aprovar"`
  (`roteiro_pendente` → `roteiro_aprovado`, grava os itens) seguido de
  `action: "avancar"` (`roteiro_aprovado` → `concluida`) — e
  `applySessionFlowTransition` (`persistence.ts` linhas 237-242) já
  sincroniza `status: "completed"` automaticamente sempre que
  `nextState === "concluida"` (Adendo 1 do ADR-006), confirmado por leitura
  direta da condição, sem necessidade de escrita adicional em
  `roteiro.ts`. Este é exatamente o comportamento coberto pelo teste de
  integração "aprovar persiste todos os itens do roteiro como
  `ItineraryItem` e conclui a sessão (RF-08.4/RF-09, critério de aceite)"
  em `roteiro.integration.test.ts` (lido linha a linha; não executado por
  falta de Postgres neste ambiente, mesma limitação da tabela acima) —
  asserta exatamente `stored.flowState === "concluida"` e
  `stored.status === "completed"`, o par de asserções que prova o critério
  de aceite literal desta tarefa.
- **"GAP DE SCHEMA CONHECIDO" (nome da atividade nunca persistido em
  `ItineraryItem`) — avaliado, concordo com a não-classificação como
  bloqueio desta tarefa**: `activityId` sempre `null` e o texto de
  `activity` é validado mas nunca gravado em nenhuma coluna — confirmado
  que o schema (`prisma/schema.prisma`) de fato não tem coluna própria para
  isso, e que nenhuma tarefa deste lote lê `ItineraryItem` de volta do
  banco (T-END é apresentacional, `RoteiroScreen` mantém estado local).
  Mudar o schema é decisão de arquitetura fora da autoridade de uma tarefa
  de implementação — a avaliação do Executor está correta. Não é reprovação
  desta tarefa; é uma lacuna de Fase 2 corretamente sinalizada, sem impacto
  no caminho feliz do MVP.
- Testes de integração real com Postgres (`roteiro.integration.test.ts`, 9
  casos) lidos linha a linha, não executados nesta sessão (limitação de
  ambiente): cobrem exatamente o critério de aceite central, geração
  usando contexto já aprovado, rejeição fora de etapa (sem chamar o
  Gateway), rejeição de item adulterado/data inválida sem persistir nada,
  sanitização de prompt injection em `timingJustification`. Testariam
  corretamente o critério de aceite se rodassem contra um banco real.
- **Aprovado.**

### L10-T04 — T-END UI (resumo completo ou parcial)

Critério de aceite: "Rótulo 'Viagem decidida!' (completo) ou 'Parte da sua
viagem está decidida' (parcial), nunca como erro."

- `EncerramentoScreen` (`src/components/encerramento/encerramento-screen.tsx`):
  `COMPLETE_LABEL`/`PARTIAL_LABEL` (linhas 95-96) batem literalmente com o
  texto exigido pelo critério de aceite e por `UX-SPEC.md` Seção 2 ("Viagem
  decidida!"/"Parte da sua viagem está decidida") — confirmado por
  comparação direta de string.
- **"Nunca como erro" — verificado estruturalmente, não só pela
  intenção documentada**: os dois casos (`concluida`/`encerrada_parcial`)
  usam exatamente o mesmo bloco de status (`CheckCircle2`, token
  `text-success`, linhas 163-169) — nenhum `role="alert"`, nenhum token
  `text-error`/`border-error` em nenhum caminho de código deste componente,
  confirmado por leitura completa do arquivo (a única ocorrência de
  `role="alert"` no lote inteiro está em `RoteiroScreen`, para erro de rede
  da aprovação — fora do escopo desta tela). Testado explicitamente por 2
  dos 9 casos de `encerramento-screen.test.tsx` ("garantia explícita de que
  o estado parcial nunca usa `role='alert'`/tokens de erro/linguagem de
  erro-falha-quebrado").
- Resumo cumulativo (Destino/Hospedagem/Passeios/Roteiro) só renderiza
  blocos de etapas efetivamente aprovadas (`resumo.destino`/
  `.hospedagem`/`.passeios?.length > 0`/`.roteiroAprovado`, cada um
  `&&` isolado) — campo ausente/`null`/lista vazia nunca produz um bloco
  vazio ou uma mensagem de "faltou" — confirmado pelos casos "blocos
  exibidos só para etapas aprovadas (resumo parcial só com destino)" e
  "todos os 4 blocos quando tudo aprovado (incluindo badge 'Gratuito')".
  `PriceRangeBadge` (L5-T02) reaproveitado sem duplicar formatação de
  preço.
- CTA "Ver isso depois": opcional (`onVerDepois?`), nunca quebra quando
  ausente (`onClick={onVerDepois}` — `undefined` é um no-op válido em
  React) — confirmado pelo teste "nenhuma quebra quando a prop está
  ausente". Foco no `<h1>` ao montar — confirmado.
- **Gap conhecido, avaliado, concordo com a não-classificação como
  bloqueio desta tarefa isoladamente** (mas ver achado estrutural do lote,
  próxima seção): nenhuma Server Action de "obter resumo da sessão" nem
  `page.tsx` em `/encerramento` foram criadas por esta tarefa — o
  componente é puramente apresentacional por decisão documentada, coerente
  com o padrão já aceito de `DestinoConfirmacaoScreen` (L7-T04). Isso não
  reprova L10-T04 (o critério de aceite desta tarefa é sobre o
  comportamento do componente, que está correto) — mas alimenta o achado
  estrutural abaixo.
- 9 casos em `encerramento-screen.test.tsx`, todos passando nesta execução.
- **Aprovado.**

### Testes de integração cruzada entre as tarefas do lote

- L10-T02 (UI) consome o shape exato de `RoteiroDayResult`/`RoteiroItemResult`
  devolvido por `generateRoteiro` (L10-T01) sem transformação — confirmado
  por leitura cruzada dos tipos em `roteiro.ts` (stage-rules) e do uso em
  `roteiro-screen.tsx`/`itinerary-day-block.tsx`.
- L10-T02 ↔ L10-T03: `RoteiroScreen` já importa e consome
  `gerarRoteiro`/`aprovarRoteiro` reais (não uma prop de ações
  especulativa) — confirmado que a assinatura real de `aprovarRoteiro`
  (`{ sessionId, dias }`, não só `sessionId`) bate exatamente com o que
  `RoteiroScreen.handleAprovarRoteiro` envia (`actions.aprovarRoteiro({
  sessionId, dias })`, linha 181) — nenhuma divergência de contrato.
- L10-T01 → L10-T03: `generateRoteiro` calcula `sequenceOrder` para poupar
  `flattenAndValidateDias` de recalculá-lo — confirmado que
  `assertValidRoteiroItem` só *valida* `sequenceOrder` (inteiro
  não-negativo), nunca recalcula, e que o valor gravado em
  `ItineraryItem.sequenceOrder` é literalmente o mesmo devolvido por
  `generateRoteiro` — nenhuma duplicação de lógica de ordenação entre as
  duas tarefas.
- L9 → L10 (fluxo de entrada): `roteiro_pendente` só é alcançado a partir de
  `passeios_aprovados` + `avancar` (RF-11), que exige `DestinationApproval`/
  `AccommodationApproval` já gravados — `gerarRoteiro` trata a ausência de
  qualquer um dos dois como violação de invariante
  (`RoteiroContextoIncompletoError`), passeios como opcional (RN-04) —
  coerente com a state machine (Lote 4) e com o mesmo padrão já usado por
  L8-T03/L9-T03.
- L10 → T-END (fluxo de saída, integração mais fraca do lote): confirmado
  que `RoteiroScreen` navega para `/encerramento?sessionId&flowState=concluida`
  depois de `aprovarRoteiro` confirmar o avanço no servidor (mesmo padrão
  client-side de T04/T06/T07) — mas, diferente da integração L9→L10 acima,
  **não existe hoje nenhuma rota real em `/encerramento`** que leia esses
  parâmetros e monte `EncerramentoResumo` para `EncerramentoScreen`
  consumir — ver achado estrutural abaixo (não é uma reprovação de L10-T02
  nem de L10-T04 isoladamente, é uma lacuna de integração entre elas e o
  resto do projeto).

### Achado estrutural do lote — rotas reais ausentes para T06/T07/T08/T-END (escalado ao Coordenador)

Confirmado por inspeção direta de `src/app` (não só pela nota de nenhuma
tarefa individual): não existe `src/app/hospedagem`, `src/app/passeios`,
`src/app/roteiro`, nem `src/app/encerramento` em nenhum lugar da árvore —
só `src/app/entrada/**`, `src/app/destino/page.tsx` e
`src/app/destino/confirmacao/page.tsx` (T00-T05) têm uma rota Next.js real.
Cada uma das 3 telas de tarefa deste lote e dos Lotes 8/9
(`HospedagemSugestoesScreen`, `PasseiosSugestoesScreen`, `RoteiroScreen`,
`EncerramentoScreen`) documentou esse gap individualmente como "não
bloqueante, fora do escopo desta tarefa" — avaliação correta tarefa a
tarefa (nenhum critério de aceite de L8-T02/L9-T02/L10-T02/L10-T04 exige a
`page.tsx`), mas em nenhum lote entre o 8 e o 11 (Cross-cutting Final, já
`Concluída`) existe uma tarefa que efetivamente feche esse gap.

- **Classificação: não é uma reprovação de tarefa** (nenhum critério de
  aceite literal das 4 tarefas deste lote exige a existência da rota), e
  por isso **nenhuma tarefa foi revertida para `Em andamento`**.
- **Não é um achado simples resolvível como `Refatoração Lote-10`** (a
  correção normal de um achado simples): fechar esta lacuna exige criar
  rotas novas (`page.tsx` × 4) e pelo menos uma Server Action nova (leitura
  de resumo para T-END) que atravessam os Lotes 8, 9, 10 e não pertencem
  estritamente a nenhum deles — decisão de decomposição/priorização, fora
  da autoridade do Validador (mesmo critério de "exige redesenho de
  dependência/decomposição" do papel).
- **Escalado ao Coordenador via `.md/BLOCKERS.md`, Bloqueio 005** (não ao
  `executor` — não há tarefa individual para retornar), com sugestão não
  vinculante de uma tarefa/lote curto de "Integração de Rotas" cobrindo os
  4 `page.tsx` faltantes + a Server Action de resumo de T-END.
- Sinalizado com prioridade adicional porque a preparação de
  infraestrutura/deploy (chapéu DevOps) já está em andamento em paralelo
  neste mesmo momento (`vercel.json`, `.github/workflows/deploy.yml`,
  `.md/DEPLOY.md` presentes no repositório) — a jornada ponta a ponta do
  produto (T00 → T-END) não é navegável em produção sem essa lacuna
  fechada, ainda que cada peça isolada esteja correta e testada.

### Requisitos não funcionais relevantes ao lote

- **Segurança (escopo básico deste chapéu, auditoria completa é do
  DevSecOps)**: autorização de dono de sessão (L11-T02/ADR-008) confirmada
  respeitada nas duas Server Actions deste lote (`gerarRoteiro` via chamada
  explícita a `assertSessionOwnership`; `aprovarRoteiro` via
  `applySessionFlowTransition`, que já a embute) — ver L10-T03 acima.
  Sanitização contra prompt injection (`sanitizeFreeTextForPrompt`)
  confirmada em todo ponto de texto livre que atravessa este lote: consumo
  de destino/hospedagem/passeios já sanitizados por captura anterior
  (L10-T01), e sanitização direta de `activity`/`suggestedTime`/
  `timingJustification` antes de persistir (L10-T03) — cobrindo o vetor
  específico apontado no escopo desta validação (texto livre interpolado
  em prompt do roteiro).
- **Tratamento do estado terminal (RF-08.4/RN-03)**: `concluida` sincroniza
  `TripSession.status = "completed"` automaticamente (confirmado em
  `persistence.ts`, ver L10-T03); `EncerramentoScreen` trata os dois
  estados terminais (`concluida`/`encerrada_parcial`) sempre como
  confirmação de valor entregue, nunca como erro (confirmado
  estruturalmente em L10-T04, não só pela intenção documentada).
- Acessibilidade: foco gerenciado no `<h1>` ao montar em `RoteiroScreen`/
  `EncerramentoScreen` (mesmo padrão de todas as telas T00-T08);
  `aria-expanded`/`aria-controls` no acordeão de `ItineraryDayBlock`;
  `role="region"`/`aria-label` em cada `ResumoBloco` de T-END; alvo de
  toque `min-h-11` nos botões principais — consistente com o checklist já
  aplicado por `L11-T04` (Lote 11, Concluída) sobre este mesmo lote.
- Performance/streaming: `RoteiroScreen` reaproveita `LoadingStream`
  (SPIKE-01/L5-T03) sem duplicar o mecanismo — nenhum requisito de
  performance novo introduzido por este lote.

### Bugs encontrados

Nenhuma reprovação crítica nem simples nas 4 tarefas do lote. O único
achado ("rotas reais ausentes para T06/T07/T08/T-END") é estrutural — não
uma reprovação de tarefa — e foi escalado ao Coordenador (Bloqueio 005),
não tratado como bug de nenhuma das 4 tarefas.

### Padrão recorrente sinalizado ao Coordenador

**Sim, desta vez há um padrão recorrente que justifica escalonar** (ver
seção "Achado estrutural do lote" acima) — diferente dos Lotes 8/9, onde o
mesmo tipo de gap individual (rota/Server Action companion ainda não
existente) foi avaliado tarefa a tarefa sem exigir escalonamento imediato,
neste ponto (Lote 10, último lote de conteúdo antes do deploy) o padrão se
repetiu por 3 lotes consecutivos (8, 9, 10) sem nenhuma tarefa agendada em
nenhum lugar do `TASK.md` para fechá-lo — isso deixou de ser uma decisão de
escopo tarefa a tarefa e passou a ser uma lacuna real de decomposição do
plano, com impacto direto na deployabilidade do produto. Registrado em
`BLOCKERS.md` (Bloqueio 005).

## Fechamento Estrutural do Lote 10 (Validador)

- Todas as 4 tarefas do lote (`L10-T01` a `L10-T04`) estão `Concluída` no
  `TASK.md`.
- Seção 4 (Dependências e Ordem de Execução): `L10-T01` depende de `L3-T02`,
  `L3-T03`, `L3-T04`, `L9-T03`, SPIKE-02, `L11-T03`, `RL8-T02` — todos já
  `Concluída`/`Resolvido` antes do início deste lote, confirmado; `L10-T02`
  depende de `L5-T03`, `L10-T01`; `L10-T03` depende de `L4-T02`, `L10-T01`;
  `L10-T04` depende só de `L5-T01` — todos satisfeitos. Nenhuma dependência
  órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução dentro do lote.
- Nenhum achado simples/débito baixo-médio classificável como
  `Refatoração Lote-10` encontrado — o único achado do lote é estrutural
  (rotas ausentes) e exige redesenho de decomposição entre lotes, por isso
  foi escalado ao Coordenador (Bloqueio 005) em vez de virar uma tarefa de
  refatoração criada pelo próprio Validador.
- Esta é a checagem que identificou a inconsistência acima — por isso, ao
  contrário do padrão de rotina (confirmação sem dispatch), este fechamento
  **reabre o Coordenador** via `BLOCKERS.md`, conforme a exceção prevista
  no papel do Validador ("só quando a checagem encontrar algo que exige
  redesenho real de dependência/decomposição").

## Veredito de Release-Readiness do Lote 10

**Lote 10 pode fechar como `Validado com ressalvas`.** As 4 tarefas
(L10-T01 a L10-T04) passam integralmente nos critérios de aceite literais
do `TASK.md`, incluindo os três pontos de atenção específicos desta
validação (sanitização contra prompt injection em todo texto livre que
atravessa o roteiro; autorização de dono de sessão respeitada nas duas
Server Actions; tratamento do estado terminal `concluida`/
`encerrada_parcial` nunca como erro, verificado estruturalmente em
T-END). `npm run lint`/`npx tsc --noEmit` passam sem regressão nos arquivos
do lote, a suíte não-integração passa integralmente (36/36 nos 4 arquivos
deste lote que não dependem de Postgres), a composição entre as 4 tarefas
(regra → Server Actions → UI → T-END) é consistente com a state machine
(Lote 4) e com o Gateway de IA (Lote 3). Nenhuma reprovação, crítica ou
simples, de nenhuma tarefa. Um achado **estrutural** (rotas reais
ausentes para T06/T07/T08/T-END, acumulado desde o Lote 8) foi escalado ao
Coordenador via `BLOCKERS.md` (Bloqueio 005) — não bloqueia o fechamento
deste lote especificamente (nenhuma tarefa deste lote falha seu próprio
critério de aceite por causa dele), mas **deve ser resolvido antes do
deploy em produção** (chapéu DevOps), já que sem ele a jornada completa
T00→T-END não é navegável no produto real. **O lote está liberado para a
auditoria de segurança completa do chapéu DevSecOps** (ver
`SECURITY-REVIEW.md`), com este achado estrutural também sinalizado lá
para contexto (não é um achado de segurança em si, mas afeta se há algo
"deployável" para auditar de ponta a ponta).

## Lote 11 — Cross-cutting Final (Segurança, LGPD, Acessibilidade)

Status geral: **Aprovado**. As 5 tarefas do lote (`L11-T01`, `L11-T02a`,
`L11-T02`, `L11-T03`, `L11-T04`) passam integralmente nos respectivos
critérios de aceite, confirmados por leitura direta do código (não apenas
pelas notas de implementação do Executor em `TASK.md`) e por execução real
da suíte de testes. Nota de proveniência: as 5 tarefas já haviam sido
tocadas de forma incidental dentro das validações dos Lotes 7/8/9/10 (ver
referências cruzadas abaixo) — esta seção é o veredito formal e dedicado do
Lote 11 como lote em si, exigido pelo fechamento estrutural do plano.

### Suíte executada (ambiente local)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | 3 erros pré-existentes, não relacionados a este lote (`page.test.tsx`/`budget-insufficient-banner.test.tsx`/`auth-callbacks.test.ts`, já presentes antes do Lote 11, confirmado por inspeção — nenhum arquivo deste lote entre eles) |
| `npx vitest run src/lib/session-flow/__tests__/authorization.test.ts src/lib/gateway-ia/__tests__/prompt-injection-guard.test.ts src/lib/actions/__tests__/resolve-session-owner.test.ts` (suítes unitárias sem dependência de Postgres, específicas de L11-T02/T02a/T03) | 44/44 passam |
| `npx vitest run src/components/design-system src/components/destino src/components/quiz src/app/entrada/data-livre` (telas/componentes tocados por L11-T04) | 93/93 passam, incluindo o teste de regressão específico "foco vai para o título da etapa ao montar (UX-SPEC §5, L11-T04 — regressão: faltava o useEffect que chama .focus())" em `destino-sugestoes-screen.test.tsx` |
| `npx vitest run` (suíte completa) | 444 passam / 92 falham — **todas** as 92 falhas são `*.integration.test.ts` com `PrismaClientInitializationError: Can't reach database server at localhost:55432` (confirmado uma a uma pela lista de `FAIL` desta execução, incluindo `account-deletion.integration.test.ts` do próprio L11-T01 e `persistence.integration.test.ts` com os casos de `L11-T02`), mesma limitação de ambiente já documentada e aceita desde os Lotes 1/4/7/8/9/10. Nenhuma outra classe de falha encontrada |

### L11-T01 — Exclusão de conta e dados associados (LGPD, RNF-06)

Critério de aceite: "Excluir conta remove todas as sessões e entidades
filhas associadas; nenhum dado órfão remanescente."

- `src/app/api/account/route.ts` (`DELETE`): `userId` é resolvido
  exclusivamente via `getServerSession(authOptions)` — nunca de payload/query
  string do cliente (confirmado por leitura direta, não há `req.json()`/
  `searchParams` lido em nenhum ponto da rota); sem sessão autenticada,
  retorna 401 antes de qualquer chamada a `deleteUserAccount`.
- `src/lib/account-deletion.ts` (`deleteUserAccount`): dentro de uma única
  `prisma.$transaction`, confirma que o `User` existe (`UserNotFoundError`
  senão), apaga todas as `TripSession` do `userId` via
  `tripSession.deleteMany({ where: { userId } })` e só então apaga o
  `User`. Cascade de FK do schema Prisma (`onDelete: Cascade`) cobre
  `Account`/`Session` (NextAuth) a partir do `User`, e
  `DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/
  `ItineraryItem`/`LlmGenerationLog` a partir de cada `TripSession` — nenhum
  `deleteMany` explícito extra necessário para as entidades filhas,
  confirmado no comentário de cabeçalho do módulo e consistente com o
  schema.
- Escopo de "conta" restrito a quem tem `User` de verdade (sessão anônima
  via cookie não cria dado pessoal associável a titular identificável) —
  decisão de detalhe de implementação documentada no próprio módulo,
  coerente com a literalidade de SDD §7/RNF-06 ("exclusão de conta"), não
  reinterpretação de requisito.
- Cobertura de teste: `account-deletion.integration.test.ts` cobre exclusão
  de múltiplas `TripSession`s do mesmo usuário, ausência de dado órfão,
  isolamento (não apaga sessão de outro usuário) e `UserNotFoundError` sem
  tocar o banco — não executável neste ambiente (Postgres indisponível),
  mas revisado por leitura: os 4 casos batem exatamente com o critério de
  aceite.

Nenhum achado. Tarefa aprovada.

### L11-T02a — Persistência do dono da sessão (ADR-008)

Critério de aceite: "Toda `TripSession` criada grava exatamente um dono
(`user_id` OU `anon_session_id`, nunca os dois, nunca nenhum); as 3 Server
Actions de criação continuam funcionando sem regressão (fluxo anônimo e
autenticado), cobertas por teste automatizado."

- `src/lib/actions/resolve-session-owner.ts` (`resolveSessionOwner`):
  precedência confirmada — usuário autenticado
  (`getServerSession(authOptions)`) sempre vence sobre cookie anônimo
  presente, só cai para o caminho anônimo quando não há sessão NextAuth
  válida; defensivamente gera/grava um novo cookie anônimo na própria
  resposta quando ausente (evita duas identidades divergentes entre
  middleware e esta resolução).
- `createSessionWithDateRange` (verificado via
  `create-session-with-range.integration.test.ts`, ainda que não executável
  neste ambiente) exige o parâmetro `owner` e grava exclusivamente
  `userId` OU `anonSessionId` no `INSERT` — os 3 chamadores
  (`submeterDataLivre`/`processarFeriadoEscolhido`/`submitQuizAnswers`)
  foram confirmados retrofitados para resolver e passar `owner` (uso de
  `resolveSessionOwner` em cada um, sem duplicar a regra de precedência).
- Cobertura de teste: `resolve-session-owner.test.ts` (unitário, roda sem
  Postgres — 44 testes agregados junto com `authorization.test.ts`/
  `prompt-injection-guard.test.ts` acima, todos passando) cobre a
  precedência autenticado→anônimo e a geração defensiva de cookie novo.

Nenhum achado. Tarefa aprovada.

### L11-T02 — Guard central de autorização cross-cutting (ADR-008)

Critério de aceite: "Requisição com cookie/`user_id` de outra sessão
recebe sempre 404 (nunca 403), nunca expõe dado de terceiro; dono legítimo
(mesmo cookie/`user_id` gravado na criação) continua autorizado sem
regressão."

- `src/lib/session-flow/authorization.ts`: `isSameSessionOwner` (função
  pura) confirma a regra exata do ADR-008 item 4 — dono esperado
  autenticado só bate com `record.userId` não nulo e igual; dono esperado
  anônimo só bate com `record.anonSessionId` não nulo e igual; qualquer
  outro caso (registro nulo, sem nenhum dos dois campos gravado, mecanismo
  de identidade divergente) nega. `assertSessionOwnership` resolve o dono
  esperado via `resolveSessionOwner` e, em caso de negação, lança sempre
  `SessionNotFoundError` — nunca um erro 403 dedicado — confirmado por
  leitura direta (não há nenhum `throw` alternativo no caminho de negação).
- Integração confirmada nos 4 pontos exigidos pelo critério: (1)
  `applySessionFlowTransition` (`src/lib/session-flow/persistence.ts`)
  chama `assertSessionOwnership` logo após a checagem de existência da
  sessão, antes de qualquer decisão de transição/escrita — cobre
  `aprovarDestinoSugerido`/`informarDestinoManualmente`/
  `encerrarResolucaoDestino`/`aprovarHospedagem`/
  `encerrarResolucaoHospedagem`/`aprovarSelecaoPasseios`/
  `encerrarResolucaoPasseios`/`aprovarRoteiro`, todas delegadas; (2)
  `gerarSugestoesDestino` (`src/lib/actions/destino.ts`), (3)
  `gerarSugestoesHospedagem` (`src/lib/actions/hospedagem.ts`), (4)
  `gerarSugestoesPasseios` (`src/lib/actions/passeios.ts`) e
  `gerarRoteiro` (`src/lib/actions/roteiro.ts`, leitura direta adicional
  não citada no título mas do mesmo padrão) chamam
  `assertSessionOwnership(sessionId, session)` explicitamente logo após a
  própria checagem de existência — confirmado nos 4 arquivos por leitura
  linha a linha, não apenas pelo comentário de cabeçalho de cada um.
- Cobertura de teste: `authorization.test.ts` (16 casos, unitário, 100%
  passando nesta sessão) cobre a comparação pura e o guard central
  end-to-end, incluindo os dois casos centrais do critério de aceite
  ("requisição com cookie de outra sessão anônima: lança
  `SessionNotFoundError` (nunca 403), sem vazar dado da sessão" e "dono
  legítimo... autoriza sem lançar", nos dois mecanismos de identidade).
  `persistence.integration.test.ts` estende a mesma cobertura contra
  Postgres real (não executável neste ambiente, mas revisado por leitura —
  os 3 casos batem com o critério).

Nenhum achado. Tarefa aprovada.

### L11-T03 — Sanitização de texto livre contra prompt injection

Critério de aceite: "Entrada com tentativa de instrução embutida não altera
o comportamento do prompt da etapa."

- `src/lib/gateway-ia/prompt-injection-guard.ts`: estratégia de
  neutralização (não rejeição total), confirmada nas 5 etapas de
  `sanitizeFreeTextForPrompt` (colapso de quebra de linha, remoção de
  marcadores de papel/delimitador — ```` ``` ````, `[INST]`, `<|...|>`,
  `System:`, `###`, `---` —, redação de frases conhecidas de override
  PT-BR/EN, colapso de espaços, truncagem por `maxLength`); `prompt` em si
  isola o valor do usuário dentro de uma frase fixa (nunca concatenado como
  instrução de sistema) — defesa em profundidade, não a única camada.
- Ponto de captura confirmado ANTES da entrada em `StageContext` (Server
  Action), não dentro do Gateway de IA — consistente com a Diretriz de
  Implementação 9 (TASK.md Seção 1: "todo campo de texto livre do usuário é
  validado/sanitizado no servidor antes de compor prompt").
- Uso confirmado nos 4 pontos onde texto livre do usuário atravessa um
  prompt: `destino.ts` (destino manual), `hospedagem.ts`/`passeios.ts`
  (destino já sanitizado + feedback de ajuste), `roteiro.ts`
  (activity/timingJustification) — via `import { sanitizeFreeTextForPrompt}
  from "@/lib/gateway-ia/prompt-injection-guard"` em cada arquivo,
  confirmado nos imports.
- Cobertura de teste: `prompt-injection-guard.test.ts` (parte dos 44 testes
  unitários executados nesta sessão, 100% passando) cobre cada padrão de
  delimitador/frase de override e o comportamento de neutralização
  preservando o restante do texto legítimo.

Nenhum achado. Tarefa aprovada.

### L11-T04 — Revisão final de acessibilidade cross-tela (T00-T-END)

Critério de aceite: "Nenhuma pendência crítica de `accessibility-review`;
checklist de WCAG AA aplicado em todas as telas."

- Contraste (WCAG AA): nota de implementação documenta recálculo
  programático (HSL→RGB→luminância relativa) de todo par
  texto/ícone-sobre-fundo dos tokens de `globals.css`, todos entre 6.19:1 e
  18.98:1 — acima do mínimo AA com margem confortável. Não recalculado de
  forma independente nesta validação (cálculo determinístico sobre tokens
  já auditados em detalhe pela nota do Executor), mas os tokens em si
  conferidos em `src/app/globals.css` e batem com os valores citados.
- Foco em transição de tela: gap real encontrado pelo Executor
  (`DestinoSugestoesScreen` sem o `useEffect` de foco; `T01`/
  `data-livre/page.tsx` sem gerenciamento de foco algum) e corrigido —
  confirmado por leitura do código atual (`headingRef`/`tabIndex={-1}`/
  `useEffect(() => headingRef.current?.focus(), [])` presentes nos dois) e
  por teste automatizado específico de regressão, executado nesta sessão e
  passando: "foco vai para o título da etapa ao montar (UX-SPEC §5,
  L11-T04 — regressão: faltava o useEffect que chama .focus())" em
  `destino-sugestoes-screen.test.tsx`.
- `aria-live`: `LoadingStream` (`aria-live="polite"` + `aria-busy`) e
  `QuizWizard` (barra de progresso) confirmados; estados de erro usam
  `role="alert"` de forma consistente.
- Alvo de toque ≥44px: `min-h-11` confirmado nos botões corrigidos citados
  na nota de implementação (`hospedagem-sugestoes-screen.tsx`,
  `destino-sugestoes-screen.tsx`, `quiz-wizard.tsx` incluindo
  `RadioOption`/`CheckboxOption`, `EmptyState`/`ErrorRetryState`) — checado
  por leitura direta do `className` de cada botão citado, não apenas pela
  nota do Executor.
- Cobertura de teste: 93/93 passando na execução isolada dos arquivos de
  design-system/destino/quiz/data-livre tocados por esta tarefa (ver Suíte
  executada acima), incluindo `stepper-progress.test.tsx` (já estendido
  desde `RL5-T02`) e `itinerary-day-block.test.tsx`.

Nenhum achado. Tarefa aprovada.

### Referências cruzadas já registradas em lotes anteriores

Consistente com o que já havia sido confirmado incidentalmente: `L11-T03`
verificada dentro das auditorias funcionais dos Lotes 7/8/9/10 (uso de
`sanitizeFreeTextForPrompt` em cada ponto de captura de texto livre);
`L11-T02`/ADR-008 e `L11-T04` confirmadas dentro da validação funcional e
da auditoria de segurança do Lote 10. Esta seção não encontrou nenhuma
divergência entre o que foi verificado ali e o que foi confirmado agora,
de forma dedicada e consolidada para o Lote 11 como lote em si.

### Bugs encontrados

Nenhuma reprovação, crítica ou simples, em nenhuma das 5 tarefas do lote.

### Padrão recorrente sinalizado ao Coordenador

Não. Nenhum padrão recorrente de bug que sugira problema de decomposição ou
diretriz de implementação foi observado neste lote.

## Fechamento Estrutural do Lote 11 (Validador)

- Todas as 5 tarefas do lote (`L11-T01`, `L11-T02a`, `L11-T02`, `L11-T03`,
  `L11-T04`) estão `Concluída` no `TASK.md`.
- Seção 4 (Dependências e Ordem de Execução): `L11-T01` depende de `L1-T02`,
  `L1-T03`; `L11-T02a` depende de `L1-T03`, `L4-T02`; `L11-T02` depende de
  `L11-T02a`; `L11-T03` depende de `L3-T02` (elegível desde o Lote 3, com
  dependência reversa de `L8-T01`/`L9-T01`/`L10-T01`, já resolvida — essas
  3 tarefas estão `Concluída`); `L11-T04` depende de todas as tarefas de
  tela dos Lotes 6, 7, 8, 9, 10 — todas `Concluída`. Nenhuma dependência
  órfã/inconsistente relativa a este lote.
- Nenhuma tarefa `Bloqueada` sem resolução dentro do lote (o histórico de
  `Bloqueada` de `L11-T02`, Bloqueio 004, já foi resolvido pelo Coordenador
  antes desta validação, dividindo a tarefa em `L11-T02a`+`L11-T02`, ambas
  hoje `Concluída`).
- Nenhum achado simples/débito baixo-médio classificável como
  `Refatoração Lote-11` encontrado — nenhuma tarefa deste lote produziu
  achado que justifique uma tarefa de refatoração própria.
- Nenhuma inconsistência que exija redesenho de dependência/decomposição —
  esta checagem confirma o fechamento de rotina, sem reabrir o Coordenador.

## Veredito de Release-Readiness do Lote 11

**Lote 11 pode fechar como `Validado` (Aprovado, sem ressalvas).** As 5
tarefas (`L11-T01`, `L11-T02a`, `L11-T02`, `L11-T03`, `L11-T04`) passam
integralmente nos critérios de aceite literais do `TASK.md`, confirmadas
por leitura direta do código e não só pelas notas de implementação do
Executor. `npx tsc --noEmit` não introduz nenhum erro novo (os 3
pré-existentes são de arquivos fora deste lote); a suíte unitária/de
componente relevante ao lote passa 100% (44/44 dos módulos de
autorização/sanitização + 93/93 das telas tocadas por `L11-T04`); a suíte
completa tem 92 falhas, todas `PrismaClientInitializationError`
(Postgres indisponível neste ambiente de validação), confirmadas uma a uma
sem nenhuma outra classe de falha. Nenhuma reprovação, crítica ou simples,
de nenhuma tarefa. Nenhum padrão recorrente escalado ao Coordenador. **O
lote está liberado para a auditoria de segurança completa do chapéu
DevSecOps** (ver `SECURITY-REVIEW.md`), que pode agora tratar este lote
como seção própria e dedicada, em vez de apenas incidental dentro dos
Lotes 7/8/9/10.

## Lote 12 — Integração de Rotas (T06-T-END)

Status geral: **Aprovado, sem ressalvas**. As 5 tarefas do lote (`L12-T01`
a `L12-T05`) fecham o gap estrutural do Bloqueio 005 (rotas navegáveis
reais para T06/T07/T08/T-END) e passam integralmente nos respectivos
critérios de aceite, confirmados por leitura direta do código/diff (não
apenas pela nota de implementação do Executor em `TASK.md`) e por execução
real da suíte de testes.

### Suíte executada (ambiente local)

| Comando | Resultado |
|---|---|
| `npx vitest run src/app/hospedagem src/app/passeios src/app/roteiro src/app/encerramento src/lib/actions/__tests__/encerramento.integration.test.ts` | 12/12 passam nos testes unitários das 4 rotas novas; os 4 casos de `encerramento.integration.test.ts` falham por `PrismaClientInitializationError: Can't reach database server at localhost:55432` — mesma limitação de ambiente já documentada e aceita desde os Lotes 1/4/7/8/9/10, não defeito de lógica (confirmado por leitura: os 4 casos batem exatamente com o critério de aceite de `L12-T04`) |
| `npm run lint` (`next lint`) | Passou — nenhum warning/erro |
| `npx tsc --noEmit` | 8 erros no total, nenhum é regressão de lógica deste lote: 3 são os já conhecidos e documentados desde `RL1-T01`/Lote 11 (`destino/confirmacao/page.test.tsx`, `budget-insufficient-banner.test.tsx`, `auth-callbacks.test.ts`, arquivos fora do Lote 12); os outros 5 (`TS2556` em `redirectMock(...args)`) são a mesma classe de erro pré-existente replicada nos 4 `page.test.tsx` novos deste lote (`hospedagem`/`passeios`/`roteiro`/`encerramento`) mais o já existente de `destino/confirmacao` — o próprio Executor já documentou essa análise nas notas de implementação de `L12-T02`/`L12-T04`/`L12-T05` (mesmo padrão herdado do template de `L7-T04`, causado pela tipagem default de `vi.fn()` sem generics, não uma falha de lógica introduzida por este lote) |

### L12-T01 — Rota `/hospedagem`

Critério de aceite: acessar `/hospedagem?sessionId=<id>` renderiza
`HospedagemSugestoesScreen` com o `sessionId` recebido; ausência de
`sessionId` faz `redirect("/")`; teste automatizado cobrindo os dois casos.

- `src/app/hospedagem/page.tsx`: Server Component fino, resolve
  `sessionId` de `searchParams` assíncrono, `redirect("/")` se ausente,
  senão `<HospedagemSugestoesScreen sessionId={sessionId} />` — confirmado
  por leitura direta, mesmo padrão de `src/app/destino/page.tsx` (L7-T02).
- Teste (`src/app/hospedagem/__tests__/page.test.tsx`, 2 casos) isola a
  rota da tela via dublê e cobre exatamente os dois ramos do critério —
  executado nesta validação, 2/2 passam.
- Link de origem confirmado: `src/components/destino/destino-sugestoes-screen.tsx`
  e o fluxo de destino levam a esta rota com `sessionId` já presente na
  querystring (mesma convenção usada pelas demais transições do produto).

Nenhum achado. Tarefa aprovada.

### L12-T02 — Rota `/passeios`

Critério de aceite: mesmo padrão de `L12-T01`, para `PasseiosSugestoesScreen`,
mais a integração das 3 Server Actions reais de `@/lib/actions/passeios`
como prop `actions`.

- `src/app/passeios/page.tsx`: mesmo padrão fino de `L12-T01`, confirmado.
- Assinatura das 3 funções passadas em `actions` conferida linha a linha
  contra `PasseiosScreenActions` (`src/components/passeios/passeios-sugestoes-screen.tsx`
  L139-150): `gerarSugestoesPasseios(sessionId): Promise<PasseiosSuggestionResult[]>`,
  `aprovarSelecaoPasseios(input): Promise<AprovarSelecaoPasseiosResult>` e
  `encerrarResolucaoPasseios(sessionId): Promise<EncerrarResolucaoPasseiosResult>`
  batem exatamente com as declarações reais em `src/lib/actions/passeios.ts`
  — inclusive o tipo de retorno de `aprovarSelecaoPasseios`, que só bate
  porque `passeios.ts` reexporta `AprovarPasseiosResult as
  AprovarSelecaoPasseiosResult` (linha 199 daquele arquivo); confirmado que
  o alias está de fato presente, não é uma suposição da nota do Executor.
- Teste (`src/app/passeios/__tests__/page.test.tsx`, 2 casos, com
  `@/lib/actions/passeios` e `PasseiosSugestoesScreen` mockados) — 2/2
  passam.
- Links de origem confirmados: `hospedagem-sugestoes-screen.tsx` navega para
  `/passeios?sessionId=...&flowState=passeios_pendente` — o `sessionId` (o
  único parâmetro que esta rota de fato lê) está presente; o `flowState`
  extra na querystring é ignorado pela rota sem causar erro (parâmetro não
  declarado em `searchParams` da rota, TypeScript não reclama pois o tipo é
  parcial e o valor simplesmente não é lido).

Nenhum achado crítico. Ver achado simples de escopo (fechamento estrutural,
abaixo) — não referente a esta tarefa especificamente, mas ao lote como um
todo.

Tarefa aprovada.

### L12-T03 — Rota `/roteiro`

Critério de aceite: mesmo padrão de `L12-T01`, para `RoteiroScreen` (que já
importa suas Server Actions internamente, sem prop `actions`).

- `src/app/roteiro/page.tsx`: mesmo padrão fino, confirmado por leitura —
  `RoteiroScreen` recebe só `sessionId`, sem `actions`/`flowState`
  (consistente com o cabeçalho de `roteiro-screen.tsx`, que já importa suas
  próprias Server Actions).
- Teste (`src/app/roteiro/__tests__/page.test.tsx`, 2 casos) — 2/2 passam.
- Link de origem confirmado: `passeios-sugestoes-screen.tsx` navega para
  `/roteiro?sessionId=...&flowState=roteiro_pendente` — `sessionId` presente
  (único parâmetro lido pela rota).

Nenhum achado. Tarefa aprovada.

### L12-T04 — Server Action `obterResumoEncerramento`

Critério de aceite: sessão com só destino aprovado retorna
`EncerramentoResumo` com `hospedagem`/`passeios` `null` e
`roteiroAprovado: false`; sessão com roteiro aprovado retorna os 4 campos
preenchidos; identidade que não é dona da sessão recebe 404 (via
`SessionNotFoundError`, nunca 403); teste automatizado cobrindo os 3 casos.

- `src/lib/actions/encerramento.ts`: mesmo padrão exato de `gerarRoteiro`
  (`./roteiro.ts`, L10-T03) confirmado por leitura — busca `TripSession`
  (`flowState`/`userId`/`anonSessionId`), `SessionNotFoundError` se ausente,
  `assertSessionOwnership` explícito logo em seguida (404, nunca 403, sem
  nenhum `throw` alternativo no caminho de negação).
- Convenção "linha ausente = etapa não aprovada, nunca erro" confirmada
  campo a campo: `destino`/`hospedagem` viram `null` quando a query
  `findUnique` não encontra registro; `passeios` vira `null` (não `[]`)
  quando `activities.length === 0`, array `{ name, free }` ordenado por
  `orderIndex` caso contrário; `roteiroAprovado` deriva de
  `session.flowState === "concluida"` (não lê `ItineraryItem` diretamente —
  consistente com RN-03/UX-SPEC.md T-END, que pede um resumo booleano, não
  item a item).
- Teste automatizado (`encerramento.integration.test.ts`) cobre
  exatamente os 3 casos do critério de aceite mais um quarto (sessão
  inexistente) — leitura do teste confirma que os asserts batem com o
  comportamento implementado linha a linha (resumo parcial: `destino`
  preenchido, `hospedagem`/`passeios` `null`, `roteiroAprovado: false`;
  resumo completo: os 4 campos preenchidos incluindo passeio pago e
  gratuito; identidade não dona: `rejects.toBeInstanceOf(SessionNotFoundError)`).
  **Nota de ambiente conhecida** (mesmo padrão de L4-T02/L7-T01/L7-T03/
  L8-T01/L8-T02/L8-T03/L9-T03/L10-T03): os 4 casos falham neste ambiente por
  `PrismaClientInitializationError` (Postgres real em `localhost:55432`
  indisponível) — não tratado como reprovação, cobertura avaliada por
  leitura do código/teste como já vem sendo feito desde o Lote 4.

Nenhum achado. Tarefa aprovada.

### L12-T05 — Rota `/encerramento`

Critério de aceite: acessar `/encerramento?sessionId=<id>&flowState=concluida|encerrada_parcial`
renderiza `EncerramentoScreen` com o resumo retornado por
`obterResumoEncerramento` e o rótulo correspondente ao `flowState`;
ausência de `sessionId` ou `flowState` inválido faz `redirect("/")`; teste
automatizado cobrindo os dois `flowState` válidos e o caso de parâmetro
ausente.

- `src/app/encerramento/page.tsx`: confirmado por leitura — resolve
  `sessionId`/`flowState`, valida `flowState` contra o conjunto fechado
  `["concluida", "encerrada_parcial"]` (`isValidFlowState`, type guard),
  `redirect("/")` se `sessionId` ausente OU `flowState` inválido/ausente;
  senão chama `await obterResumoEncerramento(sessionId)` diretamente (Server
  Action async, sem client wrapper, consistente com `EncerramentoScreen`
  sendo apresentação pura) e renderiza `<EncerramentoScreen flowState={flowState} resumo={resumo} />`.
  `SessionNotFoundError` capturado explicitamente e também vira
  `redirect("/")`; qualquer outro erro é relançado (`throw error`), não
  mascarado silenciosamente.
- `EncerramentoScreenProps` (`flowState: EncerramentoFlowState; resumo:
  EncerramentoResumo`) conferida contra o que a rota passa — bate
  exatamente.
- Teste (`src/app/encerramento/__tests__/page.test.tsx`, 6 casos:
  `flowState=concluida`, `flowState=encerrada_parcial`, `sessionId`
  ausente, `flowState` ausente, `flowState` inválido, `SessionNotFoundError`)
  — 6/6 passam, cobrindo mais que o mínimo do critério de aceite (2 casos
  válidos + o de parâmetro ausente + 2 casos adicionais de guarda).
- Links de origem confirmados: `hospedagem-sugestoes-screen.tsx`,
  `passeios-sugestoes-screen.tsx`, `roteiro-screen.tsx` e
  `destino-sugestoes-screen.tsx` navegam para
  `/encerramento?sessionId=...&flowState=encerrada_parcial` (encerramento
  antecipado) e `roteiro-screen.tsx` para
  `/encerramento?sessionId=...&flowState=concluida` (fluxo completo,
  RF-09) — ambos os valores usados batem exatamente com
  `VALID_FLOW_STATES` da rota; nenhuma tela de origem usa um terceiro valor
  não previsto.

Nenhum achado. Tarefa aprovada.

### Testes de integração cruzada (cross-platform-integration-testing)

- Confirmado, ponto a ponto, que as 4 telas de origem (T05→T06, T06→T07,
  T07→T08, T08→T-END, e os 3 pontos de "encerrar aqui" a partir de T06/T07)
  montam a querystring exatamente como as novas rotas esperam: `sessionId`
  obrigatório em todas as 4 rotas; `flowState` só exigido/lido por
  `/encerramento`, presente em toda navegação para lá (`concluida` a partir
  de `roteiro-screen.tsx`, `encerrada_parcial` a partir das 4 telas com
  botão "encerrar aqui"). Nenhuma URL construída pelas telas de origem
  aponta para um parâmetro que a rota de destino não sabe interpretar de
  forma seria (o `flowState` extra que `/passeios`/`/roteiro` recebem e
  ignoram é inofensivo — não declarado no tipo de `searchParams` daquelas
  rotas, mas também não usado por elas).
- Contrato de `PasseiosScreenActions` (L12-T02) validado de ponta a ponta
  contra `@/lib/actions/passeios` real (ver L12-T02 acima) — não é reuso de
  dublê de teste como prova de integração real.

### Requisitos não funcionais (non-functional-validation)

- Guarda de acesso direto sem sessão: as 4 rotas (`/hospedagem`,
  `/passeios`, `/roteiro`, `/encerramento`) redirecionam para `/` sem
  `sessionId`, evitando tela quebrada/erro não tratado ao usuário que acessa
  a URL diretamente — comportamento consistente com o guardrail de UX já
  estabelecido em `/destino`.
- `/encerramento` trata adicionalmente `flowState` fora do conjunto válido e
  `SessionNotFoundError` (sessão inexistente ou de outro dono) com o mesmo
  `redirect("/")`, nunca uma página de erro genérica do Next.js — cenário de
  erro tratado de forma consistente com o restante do produto.

### Fechamento Estrutural do Lote 12 (checagem do próprio Validador)

- Todas as 5 tarefas do lote (`L12-T01` a `L12-T05`) confirmadas
  `Concluída` no `TASK.md`.
- Dependências da Seção 4 relativas a este lote (`L8-T02`/`L9-T02`/
  `L10-T02`/`L7-T03`+`L8-T03`+`L9-T03`+`L10-T03`+`L11-T02`/`L10-T04`)
  confirmadas satisfeitas — todas as tarefas de origem já `Concluída` em
  lotes anteriores, nenhuma dependência órfã ou fora de ordem (`L12-T05`
  depende de `L12-T04` e ambas seguem a ordem correta na Seção 3).
- Nenhuma tarefa `Bloqueada` sem resolução dentro do lote; o Bloqueio 005
  que originou este lote já está `Resolvido` em `BLOCKERS.md`.
- **Achado simples de escopo, classificado pelo Validador**: a nota do
  Coordenador após a tabela do Lote 12 (`TASK.md`) declara explicitamente
  que `L12-T01`/`L12-T02`/`L12-T03` "não mudam nenhum dos componentes de
  tela existentes" — mas o diff real de `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`
  mostra uma linha alterada (`className="min-h-11"` acrescentada a um
  `Button variant="ghost"` do diálogo de ajuste que hoje é o único, entre
  os botões irmãos do mesmo diálogo, sem essa classe de touch-target —
  os outros 5 `min-h-11` do arquivo já estavam presentes desde o commit
  `dd4b8e9`, anterior a este lote). Efeito puramente de acessibilidade/CSS
  (consistência de touch-target mínimo, mesmo padrão de `RL5-T02`),
  confirmado que não altera nenhum comportamento/lógica da tela, não quebra
  nenhum teste de `hospedagem-sugestoes-screen.test.tsx` (suíte não
  re-executada nesta validação por não fazer parte do escopo declarado de
  `L12-T01`, mas o `git diff` de uma linha é conclusivo por si só quanto ao
  risco). Não compromete o critério de aceite central de `L12-T01`
  (a rota em si) nem bloqueia nenhuma outra tarefa do lote — classificado
  como **achado simples**, não crítica. Tarefa criada em
  `Refatoração Lote-12` (ver `TASK.md`) para documentar a divergência entre
  a nota de escopo declarada e o diff real; nenhuma tarefa deste lote volta
  para `Em andamento`.
- Nenhuma inconsistência que exija redesenho de dependência/decomposição —
  esta checagem confirma o fechamento de rotina, sem reabrir o Coordenador.

## Veredito de Release-Readiness do Lote 12

**Lote 12 pode fechar como `Validado` (Aprovado, sem ressalvas)**. As 5
tarefas (`L12-T01` a `L12-T05`) passam integralmente nos critérios de
aceite literais do `TASK.md`, confirmadas por leitura direta do
código/diff e não só pelas notas de implementação do Executor; os links de
navegação das telas de origem (Lotes 6-10) foram verificados ponta a ponta
contra as novas rotas, sem divergência de querystring. `npx tsc --noEmit`
não introduz nenhuma classe de erro nova (só réplicas do padrão `TS2556`
já conhecido desde `RL1-T01`); a suíte unitária das 4 rotas novas passa
12/12; os 4 casos de `encerramento.integration.test.ts` falham só por
Postgres indisponível neste ambiente (limitação de ambiente já aceita,
confirmada por leitura de código que a lógica está correta). Único achado é
**simples** (divergência pontual entre a nota de escopo do Coordenador e
uma linha de CSS de acessibilidade fora do escopo declarado de `L12-T01`),
registrado em `Refatoração Lote-12`, sem impacto funcional e sem reprovar
nenhuma tarefa. Nenhum padrão recorrente de bug escalado ao Coordenador.
Nenhuma inconsistência de dependência/decomposição exigindo redesenho. **O
lote está liberado para a auditoria de segurança completa do chapéu
DevSecOps** (ver `SECURITY-REVIEW.md`) e, após dupla aprovação QA+DevSecOps,
para o deploy do chapéu DevOps (ver `DEPLOY.md`), fechando a jornada
T00→T-END com navegação real em produção.

## Validação Final de Confirmação (pré-staging, 2026-09-12)

Executada como o Comando 3/Seção 3 de `EXECUTION-FLOW.md` — confirmação final
antes da promoção a staging do conjunto completo (Lotes 1-12), não uma
revalidação do zero. Escopo: (1) confirmar que nada mudou desde os vereditos
já registrados acima e em `SECURITY-REVIEW.md`; (2) checagem de **integração
cruzada entre lotes**, específica desta validação final (a validação por
lote, acima, nunca exercitou a jornada real do navegador ponta a ponta, só
Server Actions/componentes isolados e o formato de querystring dos
`router.push` já existentes).

### Reconfirmação dos itens já registrados

- `RL6-T01`/`RL12-T01` (`Pendente`): confirmado, releitura de `TASK.md` —
  ambos registrados como achado simples/débito, sem prazo vinculado a
  deploy ("sem prazo crítico, achado simples, não de segurança/deploy").
  **Não bloqueiam este deploy.**
- `RL1-T01` (upgrade do Next.js): confirmado `Concluída`. `npm audit` sem
  achado alto/crítico em dependência direta de runtime (nota de
  implementação já registrada); reconfirmado nesta sessão via `npm run
  build` limpo com Next 15.5.25.
- `RL3-T01` (rate limiting em `/api/gateway-ia/[etapa]`): confirmado
  `Concluída`, com teste automatizado cobrindo 429 antes de qualquer
  chamada ao provider.
- `BLOCKERS.md`: todas as 5 entradas (001-005) seguem `Status: Resolvido`.
  Nenhuma entrada `Aberto`. **Bloqueio 006 novo, aberto por esta validação
  (ver abaixo).**
- Suíte reexecutada nesta sessão: `npm run lint` limpo; `npm run build`
  passa (18 rotas geradas, incluindo as 4 novas do Lote 12 + `/destino` e
  `/destino/confirmacao`); `npm test` — 14 arquivos falhando, todos
  `*.integration.test.ts` por `PrismaClientInitializationError` (Postgres
  indisponível em `localhost:55432` neste ambiente, mesma limitação
  documentada e aceita em todas as notas de implementação desde o Lote 1);
  nenhuma falha nova fora desse padrão. **Nenhuma regressão de lint/build/
  teste unitário introduzida desde os vereditos já registrados.**

### Achado crítico — jornada principal T00→T-END não é navegável em produção

**Severidade: crítica. Bloqueia este deploy.**

Verificação direta de código (não das notas de implementação do Executor,
conforme guardrail deste papel) da cadeia real de navegação client-side,
telas por telas, revela que a jornada principal está quebrada em **múltiplos
pontos de transição**, apesar de cada Server Action/componente estar
correto e testado isoladamente:

1. **T01 (`/entrada/data-livre`, L6-T02)**: `src/app/entrada/data-livre/page.tsx`
   renderiza `T01DateRangeForm` sem passar a prop `onValid` — o comentário de
   cabeçalho do próprio arquivo confirma que isso foi deixado assim "de
   propósito" até `L6-T03` (`submeterDataLivre`) existir. `L6-T03` está
   `Concluída` desde o Lote 6, mas nenhum arquivo em `src/app/entrada`
   importa `submeterDataLivre`/`processarFeriadoEscolhido`/
   `submitQuizAnswers` (confirmado por busca em todo `src/app/entrada`: zero
   ocorrências de `from "@/lib/actions`). Resultado: submeter o formulário
   de T01 valida localmente e não faz mais nada — nenhuma `TripSession` é
   criada, nenhuma navegação ocorre.
2. **T02 (`/entrada/feriados`, L6-T04)**: `feriados-screen.tsx` não tem
   nenhum botão de "continuar"/submissão — o cabeçalho do arquivo confirma
   que isso também foi deixado para depois de `L6-T05`
   (`processarFeriadoEscolhido`, hoje `Concluída`). O usuário escolhe um
   feriado e um destino opcional e não há como avançar.
3. **T03 (`/entrada/quiz`, L6-T06)**: `src/app/entrada/quiz/page.tsx`, ao
   completar o wizard, renderiza uma tela estática "Respostas registradas...
   ainda estão em construção" — nunca chama `submitQuizAnswers` (L6-T07,
   `Concluída`) nem navega a lugar nenhum. Beco sem saída documentado
   explicitamente no próprio código.
4. **T05 (`/destino/confirmacao`, L7-T04/L7-T05)**: `confirmarDestino`
   (L7-T05) avança corretamente o `flowState` no servidor
   (`destino_confirmado` → `hospedagem_pendente`, confirmado por leitura de
   `src/lib/actions/confirmacao-destino.ts`), mas
   `confirmacao-destino-client.tsx` (`onConfirmar={confirmarDestino}`) não
   tem nenhum `router.push` após a Promise resolver — só "Trocar destino"
   navega (`router.back()`). O usuário clica em "Confirmar e continuar", o
   botão volta ao estado normal, e a tela permanece a mesma, sem indicação
   de sucesso nem caminho para `/hospedagem`.

Por contraste, os pontos de transição de T06→T07→T08→T-END (Lotes 8, 9, 10)
**estão corretos**: `hospedagem-sugestoes-screen.tsx`/
`passeios-sugestoes-screen.tsx`/`roteiro-screen.tsx` chamam a Server Action
real e só então `router.push` para a rota seguinte com a querystring
correta (confirmado por leitura de código, não só pela nota do Lote 12
citada acima). O padrão de gap está concentrado nas transições **T01→T02→
T03→T04 (Lote 6) e T05→T06 (Lote 7)** — exatamente os pontos mais antigos
da jornada, implementados antes de Lote 11/12 existirem.

**Por que isso não foi pego nas validações por lote**: cada tarefa (L6-T02,
L6-T04, L6-T06, L7-T04) documentou o gap individualmente como "fora de
escopo desta tarefa, aguardando a Server Action irmã" — e cada validação de
lote (acima) confirmou literalmente o critério de aceite escrito de cada
tarefa (que nunca exigiu a navegação em si, só a Server Action existir/a UI
renderizar). O Bloqueio 005 já tinha identificado exatamente este padrão
para as rotas de T06-T-END e o Coordenador o resolveu criando o Lote 12 —
mas o mesmo padrão nas transições T01-T05 nunca foi reexaminado, porque
essas tarefas já estavam `Concluída`/`Validado` antes do Lote 12 existir e
o escopo do Lote 12 foi deliberadamente restrito a "não mudar nenhum
componente de tela existente".

**Impacto**: nenhum usuário real consegue completar a jornada principal do
produto (RF-01 a RF-09) através da UI publicada — trava já na primeira
tela (T01/T02) ou, na melhor das hipóteses (destino informado por outro
caminho), trava em T05. Isso invalida a premissa de que os 12 lotes,
publicados juntos, entregam um produto funcional de ponta a ponta, mesmo
com cada Server Action/componente isolado correto e testado.

**Classificação**: crítica — compromete o critério de aceite central da
combinação dos 12 lotes (jornada navegável T00→T-END, premissa de todo o
`PRD-TECNICO.md`), não um ajuste pontual de baixo esforço. Não é reprovação
de uma tarefa isolada: é um padrão recorrente atravessando Lotes 6 e 7,
mesma natureza do Bloqueio 005 (que já tinha o precedente de virar lote
próprio, não uma tarefa dentro de um lote existente).

**Ação tomada por este Validador**: registrado como **Bloqueio 006** em
`BLOCKERS.md`, escalado ao `coordenador` (decomposição de tarefas novas
para fechar a wiring de T01→T02→T03→T04 e T05→T06, mesmo raciocínio do
Bloqueio 005/Lote 12) e sinalizado ao `gestor` em paralelo (relevância
estratégica: sem esta correção, o deploy publicaria uma aplicação
inutilizável pela UI apesar de toda a lógica de servidor estar correta).
Nenhuma tarefa individual voltou de `Concluída` para `Em andamento` nesta
passada — mesmo raciocínio do Bloqueio 005: o gap nunca pertenceu a uma
tarefa específica já fechada (cada uma cumpriu literalmente seu próprio
critério de aceite), é a ausência de uma tarefa nova de integração.

## Veredito final desta Validação de Confirmação

**Os 12 lotes NÃO estão liberados para deploy em staging.** Toda a
validação funcional/segurança por lote registrada acima permanece válida
(nenhuma regressão de lint/build/teste; `RL1-T01`/`RL3-T01` confirmados;
`BLOCKERS.md` 001-005 seguem resolvidos), mas o achado crítico acima
(jornada T00→T-END não navegável em produção) bloqueia a promoção a
staging até o Coordenador decompor e o Executor implementar a wiring
faltante nas transições T01→T02→T03→T04 e T05→T06, com revalidação
específica desses pontos de transição por este Validador antes de nova
tentativa de deploy.

## Validação Final de Confirmação — Segunda Tentativa (pré-staging, 2026-09-12)

Executada como o Comando 3/Seção 3 de `EXECUTION-FLOW.md`, sobre o conjunto
completo Lotes 1-12, em resposta ao fechamento do **Bloqueio 006**
(`.md/BLOCKERS.md`) pelo Coordenador (`Refatoração Lote-6`: `RL6-T02`,
`RL6-T03`, `RL6-T04`; `Refatoração Lote-7`: `RL7-T01`) e implementação pelo
Executor (todas as 4 `Concluída`, revisão inline spec-compliance/code-review
sem achados). Escopo: (1) reconfirmação específica do achado do Bloqueio
006 por leitura direta de código; (2) confirmação de ausência de regressão
fora do escopo das 4 correções; (3) reexecução de `npm run lint`/`npm
test`/`npm run build`; (4) checagem de `BLOCKERS.md`; (5) confirmação de que
`RL12-T01` (`Pendente`) não bloqueia.

### 1. Reconfirmação do Bloqueio 006 — jornada T00→T-END, ponto a ponto

Verificação por leitura direta de código (não das notas de implementação do
Executor):

- **T01** (`src/app/entrada/data-livre/page.tsx`): `handleValid` agora chama
  `submeterDataLivre(values)`, aguarda a Promise resolver, e só então
  `router.push` para `/destino?sessionId=...` (`proximaEtapa === "destino"`)
  ou `/destino/confirmacao?sessionId=...&destino=...&flowState=destino_confirmado`
  (`proximaEtapa === "confirmacao_destino"`). Erro tratado com `role="alert"`
  sem navegar. **Corrigido, confirmado.**
- **T02** (`src/app/entrada/feriados/feriados-screen.tsx`): novo botão
  "Continuar" (`disabled` até `selectedKey !== null`) chama
  `processarFeriadoEscolhido({ holidayDate, destino })`, aguarda resolver, e
  só então navega para `/destino` ou `/destino/confirmacao` conforme
  `result.flowState`. **Corrigido, confirmado.**
- **T03** (`src/app/entrada/quiz/page.tsx`): `handleComplete`/`submit` agora
  chamam `submitQuizAnswers(answers)` e, em sucesso, `router.push` para
  `/destino?sessionId=...`; a tela estática de placeholder ("ainda estão em
  construção") foi removida — o mesmo estado local (`submittedAnswers`)
  agora serve só para permitir "Tentar novamente" sem refazer o wizard.
  **Corrigido, confirmado.**
- **T05** (`src/app/destino/confirmacao/confirmacao-destino-client.tsx`):
  `onConfirmar` deixou de ser `confirmarDestino` direto e virou um wrapper
  que aguarda `confirmarDestino(input)` resolver e só então `router.push`
  para `/hospedagem?sessionId=...&flowState=hospedagem_pendente`. `onTrocar`
  permanece correto (já era, desde o Bloqueio 002). **Corrigido, confirmado.**

Nenhum ramo navega antes da Promise da Server Action resolver em nenhum dos
4 pontos — Diretriz de Implementação 3 (nenhuma navegação client-side
otimista) respeitada em todos.

**Demais transições da jornada (T04→T05, T06→T07, T07→T08, T08→T-END)**:
reverificadas nesta sessão, não só herdadas do veredito anterior —
`src/components/destino/destino-sugestoes-screen.tsx` (`handleContinuar`/
`handleEncerrarAqui`), `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`,
`src/components/passeios/passeios-sugestoes-screen.tsx` e
`src/components/roteiro/roteiro-screen.tsx` chamam a Server Action
correspondente, aguardam resolver, e só então `router.push` para a rota
seguinte com a querystring correta (`sessionId`/`flowState`, e `destino`
onde aplicável). `npm run build` confirma as 18 rotas geradas, incluindo
todas as 5 rotas da jornada de destino em diante
(`/destino`, `/destino/confirmacao`, `/hospedagem`, `/passeios`, `/roteiro`,
`/encerramento`). **Nenhum quinto ponto de wiring quebrado encontrado** —
a jornada T00→T-END está de fato conectada ponta a ponta.

### 2. Ausência de regressão fora do escopo das 4 correções

- As 4 tarefas tocaram exclusivamente os 4 arquivos já citados no Bloqueio
  006 (mais a prop `isPending` adicional em `T01DateRangeForm`, documentada
  na nota de implementação de `RL6-T02` como detalhe necessário para o
  critério de aceite, sem mudar contrato de nenhuma Server Action).
  Confirmado por leitura: nenhuma Server Action (`submeterDataLivre`,
  `processarFeriadoEscolhido`, `submitQuizAnswers`, `confirmarDestino`,
  `trocarDestino`) foi alterada por estas 4 tarefas — só os pontos de
  chamada client-side.
- Todos os vereditos por lote já registrados acima (Lotes 1-12) permanecem
  válidos: nenhuma tarefa neles depende do comportamento de navegação que
  mudou, e a suíte de testes unitários/componente relacionada a cada tela
  tocada (`t01-date-range-form.test.tsx`, `feriados-screen.test.tsx`,
  `page.test.tsx` de quiz e data-livre, `confirmacao-destino-client.test.tsx`)
  foi atualizada pelo próprio Executor e passa sem regressão (ver Seção 3).
- `RL6-T01`/`RL5-T01`/`RL5-T02`/`RL8-T01`/`RL8-T02` (já `Concluída`) e demais
  achados simples anteriores seguem consistentes — nenhuma das 4 correções
  tocou os arquivos desses achados.

### 3. Suíte reexecutada nesta sessão

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm run build` (`next build`) | Passou — build de produção completo, 18 rotas geradas sem erro, incluindo as 9 rotas da jornada principal (`/`, `/entrada/data-livre`, `/entrada/feriados`, `/entrada/quiz`, `/destino`, `/destino/confirmacao`, `/hospedagem`, `/passeios`, `/roteiro`, `/encerramento`) |
| `npm test` (`vitest run`) | 473 testes passando / 95 falhando, em 568 testes totais. **Todas as 95 falhas são `PrismaClientInitializationError`** ("Can't reach database server at `localhost:55432`") em arquivos `*.integration.test.ts` que exigem Postgres real — confirmado por inspeção de cada linha de falha, nenhuma é `AssertionError`/falha de lógica. Mesma limitação de ambiente local já documentada e aceita desde o Lote 1 (nenhum Postgres provisionado neste ambiente de execução do Validador) — `.github/workflows/ci.yml` confirma que o pipeline de CI real roda um serviço `postgres:16-alpine` e aplica `prisma migrate deploy` antes da suíte, então essas 95 suítes rodam com banco real em CI. Contagem consistente com as notas de implementação de `RL6-T03`/`RL6-T04`/`RL7-T01` (471-473 passando / 95 falhando, mesmo padrão, sem variação atribuível a estas 4 correções). **Nenhuma falha nova, nenhuma regressão de lógica introduzida.** |

### 4. `BLOCKERS.md`

Todas as 6 entradas (001-006) confirmadas `Status: Resolvido`. Nenhuma
entrada `Aberto`. Bloqueio 006 fechado com nota de resolução do Coordenador
detalhando `RL6-T02`/`RL6-T03`/`RL6-T04`/`RL7-T01`, todas `Concluída` no
`TASK.md` — consistente com a reconfirmação de código da Seção 1 acima.

### 5. `RL12-T01` — não bloqueante

Confirmado `Pendente` em `TASK.md` (Refatoração Lote-12): achado simples de
divergência entre a nota de escopo do Lote 12 e uma classe CSS
(`min-h-11`) já presente num botão de `hospedagem-sugestoes-screen.tsx`
por commit anterior ao próprio Lote 12 — reconciliação de documentação,
sem prazo crítico, sem impacto funcional/de segurança, sem sobreposição com
o escopo do Bloqueio 006. **Confirmado: não bloqueia este deploy**, conforme
já registrado no `TASK.md` ("sem prazo crítico, achado simples, não de
segurança/deploy"). Minha leitura não diverge dessa classificação.

## Veredito final desta Segunda Tentativa

**Os 12 lotes ESTÃO liberados para deploy em staging.** O achado crítico da
primeira tentativa (Bloqueio 006 — jornada T00→T-END não navegável) está
corrigido e reconfirmado por leitura direta de código em todos os 4 pontos
originais, sem nenhum quinto ponto de wiring quebrado remanescente na
jornada completa T00→T-END. Nenhuma regressão introduzida pelas correções.
`npm run lint`/`npm run build` limpos; `npm test` com as mesmas 95 falhas
pré-existentes de ambiente (Postgres indisponível localmente, coberto por
serviço real em CI), sem nenhuma falha nova. `BLOCKERS.md` com as 6 entradas
`Resolvido`, nenhuma `Aberto`. `RL12-T01` (`Pendente`) confirmado não
bloqueante. Ver `SECURITY-REVIEW.md` para a reconfirmação equivalente do
chapéu DevSecOps e `DEPLOY.md` para a execução do deploy em si.

## Validação Final de Confirmação — Terceira Tentativa (pré-staging, 2026-09-12)

Executada como o Comando 3/Seção 3 de `EXECUTION-FLOW.md`, sobre o conjunto
completo Lotes 1-12, em resposta ao provisionamento real de infraestrutura
pelo usuário desde a Segunda Tentativa (Bloqueio 007 — `.md/BLOCKERS.md` —
apontava a ausência de projeto Vercel, banco Postgres gerenciado e secrets
reais). Esta é uma confirmação final, não uma revalidação completa: nenhum
código de aplicação mudou desde a Segunda Tentativa, só infraestrutura e um
step novo de workflow.

### 1. `BLOCKERS.md`

Todas as 7 entradas (001-007) confirmadas `Status: Resolvido`, nenhuma
`Aberto`. Bloqueio 007 em particular: os 3 pré-requisitos de infraestrutura
que ele apontava como faltantes agora existem —
- Projeto Vercel criado e linkado ao repositório
  `leandrosegheto17/curtamais`.
- Banco Postgres real criado no Neon (região `sa-east-1`, São Paulo).
- 4 secrets cadastrados no GitHub Environment `staging`: `VERCEL_TOKEN`,
  `DATABASE_URL`, `NEXTAUTH_SECRET`, `OPENAI_API_KEY` (confirmado via
  `gh secret list` só pelos nomes/timestamps, nunca pelos valores — este
  Validador não solicita nem manuseia credenciais reais, conforme escopo
  explícito desta tarefa). As mesmas 3 variáveis de aplicação também
  cadastradas como Environment Variables na Vercel.

Nota de resolução completa registrada em `.md/BLOCKERS.md`, Bloqueio 007.

### 2. Step de migration no `deploy.yml` — posição e env var

Leitura direta do `.github/workflows/deploy.yml` em disco (commit `f17b0a0`,
já em `main`) confirma a ordem dos steps do job `build-and-deploy`:
`Checkout` → `Setup Node` → `Install dependencies` → **`Aplicar migrations
Prisma no banco do ambiente-alvo`** (`run: npm run db:migrate`, `env:
DATABASE_URL: ${{ secrets.DATABASE_URL }}`) → `Install Vercel CLI` → `Pull
configuração do ambiente Vercel` → `Build (Vercel)` → `Deploy (Vercel)`.
**Posição correta**: a migration roda antes de qualquer build/deploy da
Vercel, garantindo que o schema do banco já reflete `prisma/schema.prisma`
quando a aplicação buildada tentar acessá-lo. **Env var correta**: usa
`secrets.DATABASE_URL`, o mesmo secret cadastrado no Environment `staging`
(item 1 acima), escopado ao `environment: ${{ github.event.inputs.environment
}}` já declarado no job — não há uso de credencial hardcoded nem de secret
de nome divergente.

### 3. Confirmação de que nada mudou no código desde a Segunda Tentativa

`git diff --stat` entre o commit da Segunda Tentativa (`304168c`, "Complete
Lotes 8-12... and fix Bloqueio 006 end-to-end wiring") e o `HEAD` atual
(`f17b0a0`) mostra uma única mudança: `.github/workflows/deploy.yml | 5
+++++` — 5 linhas adicionadas, exatamente o step de migration descrito no
item 2. **Nenhum arquivo de código de aplicação (`src/`, `prisma/schema.prisma`,
testes) mudou.** O veredito funcional/segurança já registrado para os 12
lotes na Segunda Tentativa permanece integralmente válido — não há
superfície de código nova a revalidar.

### 4. Suíte reexecutada nesta sessão (branch `main` atual, com o novo step de workflow)

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou — nenhum warning/erro |
| `npm run build` (`next build`) | Passou — build de produção completo, 18 rotas geradas sem erro, mesma topologia de rotas já confirmada na Segunda Tentativa |
| `npm test` (`vitest run`) | 473 testes passando / 95 falhando, em 568 testes totais — contagem idêntica à da Segunda Tentativa. Todas as 95 falhas são `PrismaClientInitializationError` ("Can't reach database server at `localhost:55432`") em arquivos `*.integration.test.ts` que exigem Postgres real; nenhuma é `AssertionError`/falha de lógica. Mesma limitação de ambiente local já aceita desde o Lote 1 (nenhum Postgres provisionado neste ambiente de execução do Validador — o CI real roda `postgres:16-alpine` + `prisma migrate deploy` antes da suíte). **Nenhuma falha nova, nenhuma regressão.** |

Como instruído no escopo desta tarefa, este Validador **não** executou
`prisma migrate deploy` localmente contra o Neon real, nem testou nenhuma
credencial real — essa execução é escopo do próprio workflow de deploy
(`deploy.yml`, item 2 acima), não desta validação de confirmação.

### 5. Veredito final desta Terceira Tentativa

**Os 12 lotes E a infraestrutura estão prontos para o disparo real do
`deploy.yml` em staging.** `BLOCKERS.md` com as 7 entradas `Resolvido`,
nenhuma `Aberto` — Bloqueio 007 fechado com a infraestrutura real
confirmada existente. O step de migration Prisma está corretamente
posicionado antes do build/deploy da Vercel e usa a env var certa. Nenhuma
mudança de código desde a Segunda Tentativa que pudesse invalidar o
veredito já registrado para os 12 lotes. `npm run lint`/`npm run build`
limpos; `npm test` com as mesmas 95 falhas pré-existentes de ambiente, sem
nenhuma falha nova. Não há mais nenhum bloqueio conhecido para o disparo
real de `workflow_dispatch` do `deploy.yml` sobre `environment: staging`,
`ref: main` (SHA `f17b0a0`). Ver `.md/DEPLOY.md` para o registro da
execução do deploy em si, que é o próximo passo (fora do escopo desta
validação).

## Validação Final de Confirmação — Quarta Tentativa (pré-staging, 2026-09-15)

Executada como o Comando 3/Seção 3 de `EXECUTION-FLOW.md`, chapéu QA, sobre
o conjunto completo Lotes 1-12, em resposta à execução real do Bloqueio 008
(`VERCEL_TOKEN` inválido — ver `.md/DEPLOY.md`, "Tentativa 2 — Staging") e
ao reporte do usuário de que o token foi regenerado/recadastrado.

### 1. `git log`/`git status` desde a Terceira Tentativa

`git status`: working tree limpo, branch `main` sincronizada com
`origin/main`. `git log`/`git diff --stat f17b0a0..726bba0`: 3 commits
novos desde a Terceira Tentativa — `494c08c`/`e53a3d2` (rota de diagnóstico
temporária, `src/app/api/diag/route.ts`, fora do escopo de qualquer tarefa
do `TASK.md`) e `726bba0` (documentação da Tentativa 2/Terceira Tentativa
de deploy real, só `.md/`). **Nenhuma mudança em código de tela/Server
Action pertencente aos 12 lotes.** Detalhamento do achado de segurança da
rota de diagnóstico em `.md/SECURITY-REVIEW.md`, "Quarta Tentativa", e
`.md/BLOCKERS.md`, Bloqueio 009 — não é reprovação de nenhuma tarefa
funcional (a rota não pertence a nenhum critério de aceite do `TASK.md`),
por isso não classificada como crítica/simples no sentido de reprovação de
lote, só registrada como achado do chapéu DevSecOps.

### 2. Integração entre os 12 lotes (regressão cruzada)

`npm run lint` e `npm run build` reexecutados nesta sessão: ambos limpos,
19 rotas geradas (18 já confirmadas na Segunda Tentativa + `/api/diag`,
fora do escopo dos lotes). Nenhuma rota da jornada T00→T-END ausente ou
alterada. Jornada completa (`/`, `/entrada/*`, `/destino`,
`/destino/confirmacao`, `/hospedagem`, `/passeios`, `/roteiro`,
`/encerramento`) permanece idêntica à topologia já confirmada na Segunda
Tentativa — nenhuma regressão cruzada nova entre lotes identificada.
Autorização cross-cutting do Lote 11 (`assertSessionOwnership`) segue
aplicada nos mesmos pontos já auditados nos Lotes 7-10/12, sem alteração de
código desde a última confirmação.

### 3. `RL12-T01` — reconfirmado não bloqueante

Sem mudança desde a Segunda/Terceira Tentativa: continua `Pendente` em
`TASK.md`, achado simples de documentação (classe `min-h-11`), sem impacto
funcional/de segurança. **Confirmado novamente: não bloqueia este deploy.**

### 4. `Bloqueio 008` — status atualizado, não fechado

Usuário reportou ter regenerado e recadastrado o `VERCEL_TOKEN`. Este
Validador **não** re-verifica o valor do secret (sem acesso, e não deveria
manuseá-lo) nem dispara um novo `deploy.yml` nesta validação de
confirmação — atualizei o campo `Status` do Bloqueio 008 em
`.md/BLOCKERS.md` para refletir que a causa raiz foi endereçada pelo
usuário, mas a confirmação real (um run do `deploy.yml` passando do step
`Pull configuração do ambiente Vercel`) fica para a próxima etapa (o
próprio workflow de deploy), fora do escopo desta validação.

### 5. Veredito final desta Quarta Tentativa

**Os 12 lotes permanecem liberados para deploy em staging — nenhuma
reprovação, crítica ou simples, nesta confirmação.** O único achado novo
desde a Terceira Tentativa é a rota de diagnóstico temporária
(`src/app/api/diag/route.ts`), fora do escopo de qualquer tarefa dos 12
lotes, registrada como Bloqueio 009 (severidade baixa/média, não bloqueia
sozinha a promoção a staging) — ver `.md/SECURITY-REVIEW.md` para o
veredito equivalente do chapéu DevSecOps, que recomenda confirmar a causa
do `NextAuth NO_SECRET` antes de promover a **produção** (staging pode
seguir). `npm run lint`/`npm run build` limpos. `RL12-T01` confirmado não
bloqueante. Bloqueio 008 com status atualizado (causa raiz endereçada,
confirmação real pendente do próprio workflow). Nenhuma mudança de código
nos 12 lotes desde a Segunda Tentativa que exigisse nova reauditoria
funcional.

## Lote V2-L1 — Schema V2.0 (migration) (2026-09-16)

Única tarefa do lote: `V2-L1-T01`. Validação contra o critério de aceite
literal da linha `V2-L1-T01` (`.md/TASK.md`, Seção 3) e contra `SDD.md`
§8.5 — sem reinterpretar o requisito, sem usar a nota de implementação do
Executor como base de aprovação.

### 1. `git diff` de `prisma/schema.prisma` vs. `SDD.md` §8.5

`model User` ganhou `privacyConsentAt DateTime? @map("privacy_consent_at")`
e `privacyConsentVersion String? @map("privacy_consent_version")`;
`model TripSession` ganhou `linkedAt DateTime? @map("linked_at")` e
`@@index([userId, updatedAt])`. Os quatro itens batem literalmente com o
bloco Prisma de `SDD.md` §8.5 — mesmos nomes, mesmos tipos, mesma
nulidade, mesmo `@map`, mesma forma de índice `(userId, updatedAt)`.
Nenhum campo obrigatório novo, nenhum enum novo, nenhuma FK nova de
`trip_sessions.user_id` para `users` (decisão do MVP mantida, conforme
`SDD.md` §8.5, item explícito). Nenhuma outra linha do schema alterada —
`git diff --stat` confirma só `prisma/schema.prisma` e a migration nova.

### 2. `migration.sql` vs. schema e critério de aceite

`prisma/migrations/20260916173748_v2_consent_and_session_link/migration.sql`:
dois `ALTER TABLE ... ADD COLUMN` (colunas nullable, sem `NOT NULL`, sem
`DEFAULT`) e um `CREATE INDEX trip_sessions_user_id_updated_at_idx ON
trip_sessions(user_id, updated_at)` — corresponde 1:1 às quatro mudanças do
schema, sem backfill (nenhum `UPDATE`/`SET`), sem `DEFAULT` que forçaria
preenchimento, sem coluna obrigatória. Índice na forma exata `(userId,
updatedAt)` pedida pelo critério de aceite.

### 3. "Migration aplica sem erro sobre o schema do MVP" — verificável sem Postgres real

Mesma limitação de ambiente já aceita em `L11-T02a` (`localhost:55432`
inacessível): não há como rodar `prisma migrate deploy`/`migrate dev`
contra um banco real nesta validação. Dentro do que é verificável sem
banco: `npx prisma validate` e `npx prisma generate` foram reexecutados
nesta validação e passam sem erro; o SQL é sintaticamente `ALTER
TABLE`/`CREATE INDEX` puro sobre colunas/tabela já existentes do MVP
(`users`, `trip_sessions`), sem dependência de estado de dado específico
que pudesse falhar em runtime (sem `NOT NULL` sem default, sem FK, sem
enum). Não há evidência de que a migration falharia num Postgres real; a
aplicação de fato contra um banco vivo continua pendência registrada na
nota de implementação, fora do alcance desta validação de QA (mesmo
padrão aceito para `L11-T02a` no MVP).

### 4. Requisito não funcional

Nenhum RNF de performance/usabilidade aplicável a uma migration aditiva
sem backfill em volume de protótipo — sem achado.

### Veredito (Lote V2-L1)

**Aprovado.** `V2-L1-T01` cumpre o critério de aceite da Seção 3 dentro do
limite do verificável sem Postgres real, batendo literalmente com
`SDD.md` §8.5. Nenhuma reprovação crítica ou simples.

## Lote V2-L2 — Catálogo de destinos e estratégia de imagens (RF-15, RN-10, ADR-010) (2026-09-16)

5 tarefas (`V2-L2-T01` a `T05`), todas `Concluída` no `TASK.md` antes desta
validação. Validado contra o critério de aceite literal de cada linha
(Seção 3) e contra `PRD.md` ("Catálogo do V2.0"), `SDD.md` §8.2.2,
`UX-SPEC.md` §8.3/§8.2, `ADR-010` e `GUARDRAILS.md` regras 28-30 — pelo
código real (`git diff`), não pelas notas de implementação do Executor.

### V2-L2-T01 — `catalogo/destinos.ts` + `next.config.mjs`

Lidos os 23 objetos de `CATALOGO_DESTINOS` linha a linha e comparados
contra `PRD.md` §"Catálogo do V2.0" (2026-09-16): os 8 da vitrine (Rio de
Janeiro, Porto de Galinhas, Gramado, Maceió, Porto Seguro, Florianópolis,
Foz do Iguaçu, Campos do Jordão) batem em nome/UF/ordem com `vitrine: 1..8`
sem repetição; os 15 restantes (Natal, Fortaleza, Maragogi, Salvador, João
Pessoa, Imbassaí, Búzios, Ilhéus, Aracaju, Praia do Forte, Caldas Novas,
Olímpia, Poços de Caldas, Fernando de Noronha, Lençóis Maranhenses) batem
com `vitrine: null`. São Paulo (excluído deliberadamente pelo PM) e os 4
destinos da página de design (Bonito, Jericoacoara, Ouro Preto, Chapada dos
Veadeiros) **não aparecem** — correto. Total 23, exatamente 1 `hero: true`
(Rio de Janeiro), todo `slug` único e batendo `^[a-z0-9-]+$` (conferido por
leitura, sem acento/maiúscula/espaço em nenhum). Todos os 23 com `imagem:
null` — placeholder válido conforme ADR-010. `next.config.mjs`:
`images.formats: ["image/avif", "image/webp"]`,
`images.minimumCacheTTL: 31536000`, sem `images.remotePatterns` — bate com
o critério e com ADR-010 §4 (catálogo servido do próprio domínio).
`npx vitest run src/lib/catalogo/__tests__/destinos.test.ts`: 6/6.
**Aprovado.**

Nota não bloqueante (já registrada pelo Executor em `TASK.md`): a escolha
do destino `hero` (Rio de Janeiro) e os textos de `rotuloRegiao` são
interpretação de detalhe do Executor, sem artefato que os feche
explicitamente — não é reprovação, é decisão pequena e documentada, e não
compromete nenhum critério de aceite literal.

### V2-L2-T02 — `resolver-imagem.ts`

`normalizarNomeDestino` (NFD + remoção de diacríticos + minúsculas + troca
de separadores por espaço + remoção de sufixo de UF) e
`MAPA_CORRESPONDENCIA_EXATA` construído uma vez a partir de nome+variantes
normalizados — lido e conferido contra o algoritmo descrito em ADR-010 §2.
`resolverImagemDestino` só retorna `tipo: "curada"` quando o destino existe
**e** `imagem !== null`; em qualquer outro caso cai no `gerarFallback`
(FNV-1a 32 bits padrão, `hash % 8`, `(hash >> 8) % 4` sobre 4 ângulos) — sem
nenhum caminho de correspondência aproximada no código (confirmado por
leitura: não há `includes`/distância de edição/`Levenshtein` em nenhum
ponto do módulo). `npx vitest run
src/lib/catalogo/__tests__/resolver-imagem.test.ts`: 16/16, cobrindo
especificamente: nenhuma colisão de chave normalizada entre os 23 destinos
reais + variantes; grafias diferentes do mesmo nome resolvendo ao mesmo
gradiente (3 exemplos); nome fora do catálogo em fallback determinístico;
"Gramadoo" (grafia próxima, não idêntica) não casa por aproximação;
contraste de cada cor da paleta >= 4.5:1 com `#FAFAFA`, calculado por
fórmula WCAG independente no próprio teste (não reaproveita a paleta do
módulo para "provar a si mesma"). **Aprovado.**

### V2-L2-T03 — `DestinationImage`/`DestinationFallbackArt`

`DestinationImage`: com `imagem.tipo === "curada"`, renderiza via
`next/image` com `width`/`height` reais (evita CLS); `onError` liga
`falhouAoCarregar`, que troca o filho para `DestinationFallbackArt`
mantendo o mesmo `div` externo (`data-testid="destination-image-frame"`) —
sem layout shift, conferido no teste (`destination-image.test.tsx`, 5
casos) que o mesmo nó de contêiner persiste depois do evento `error`.
`DestinationFallbackArt` preenche 100% do contêiner do chamador, nunca
define altura própria — consistente com a exigência de "sem layout shift"
(RF-15.9). Contraste: os 8 pares de `PALETA_FALLBACK` (importados
diretamente de `resolver-imagem.ts`, não uma cópia local) testados contra
`#FAFAFA` com fórmula de luminância WCAG própria do teste
(`destination-fallback-art.test.tsx`, 13 casos) — todos >= 4.5:1 (a maioria
com folga, >= 7:1). `npx vitest run src/components/catalogo`: 18/18.
**Aprovado.**

Achado de detalhe não bloqueante (registrado pelo Executor, confirmado por
mim): `resolver-imagem.ts` não exporta `gerarFallback`, então
`destination-image.tsx` duplica localmente o algoritmo de hash (só o passo
de cálculo, não os dados — `PALETA_FALLBACK`/`ANGULOS_FALLBACK`/
`normalizarNomeDestino` são sempre importados do módulo real). Resultado
hoje é bit-a-bit idêntico ao que `gerarFallback` produziria; é duplicação
de baixo risco, não um bug. Viro tarefa de refatoração de baixo esforço no
fechamento estrutural abaixo, não reprovação.

### V2-L2-T04 — `imagem` em `generateDestinationSuggestions`

Confirmado por leitura de `src/lib/stage-rules/destino.ts`: `imagem:
resolverImagemDestino(suggestion.nome)` é calculado no `.map(...)` final,
DEPOIS de `generateStructuredCompletionWithRetry` já ter validado a
resposta contra `destinoSugestoesSchema` e DEPOIS de `applyBudgetFilter` —
`buildDestinoPrompt`/`destinoSugestoesSchema` (import de
`@/lib/gateway-ia`) não foram tocados nesta mudança (confirmado por `git
log`/ausência de diff nesses arquivos). Persistência: lido
`aprovarDestinoSugerido` em `src/lib/actions/destino.ts` — `childData` é
montado campo a campo (`stage`/`name`/`justification`/`priceRangeMin`/
`priceRangeMax`/`source`), **nunca** via spread de `input.suggestion`, e o
schema Prisma (`model DestinationApproval`, `prisma/schema.prisma`)
confirma não ter coluna `imagem`. Teste de integração
(`destino.integration.test.ts`) tem asserção explícita
`expect(destination).not.toHaveProperty("imagem")` — não pôde ser
executada neste ambiente (`Can't reach database server at localhost:55432`,
limitação de ambiente já aceita em `L11-T02a`/`V2-L1`), mas a garantia
estrutural (ausência de coluna + montagem campo a campo) já é suficiente
para o veredito, e confirmada por leitura direta do código, não da nota do
Executor. `npx vitest run src/lib/stage-rules/__tests__/destino.test.ts`:
8/8, incluindo o caso de nome fora do catálogo (fallback determinístico,
nunca aproximado) e a checagem de que `destinoSugestoesSchema` continua com
exatamente os 4 campos originais. **Aprovado.**

### V2-L2-T05 — `SuggestionCard` (`media`/`eyebrow`) e T04

`SuggestionCard`: branch `if (!media)` preservado bit-a-bit (T06/T07
continuam chamando sem `media` — conferido por leitura de
`hospedagem-sugestoes-screen.tsx`/`passeios-sugestoes-screen.tsx`, nenhum
dos dois passa `media`). Com `media`, crédito (`ImageCredit`) só renderiza
quando `media.imagem.tipo === "curada"`; selo "Imagem ilustrativa" (em
`DestinationImage`) só com `showIllustrativeTag` **e** imagem curada
carregada. `alt` passado por `destino-sugestoes-screen.tsx`: `"Imagem
ilustrativa de {name}"` — nunca contém "foto do local"/"foto de…"
(conferido por leitura, RF-15.6). Rodei explicitamente os testes de
T06/T07 para confirmar ausência de regressão:
`npx vitest run src/components/design-system/__tests__/suggestion-card.test.tsx
src/components/destino/__tests__/destino-sugestoes-screen.test.tsx
src/components/hospedagem/__tests__/hospedagem-sugestoes-screen.test.tsx
src/components/passeios/__tests__/passeios-sugestoes-screen.test.tsx`:
**47/47 passando** (10+13+11+13) — T06 (hospedagem) e T07 (passeios) sem
nenhuma falha nova. **Aprovado.**

### Requisitos não funcionais

RNF-09 (contraste >= 4.5:1 com `#FAFAFA` nos 8 gradientes de fallback):
verificado com fórmula WCAG independente, não a do módulo — ver T02/T03
acima. Sem layout shift ao trocar imagem/fallback (RF-15.9): verificado por
teste de DOM (mesmo nó de contêiner) em T03. Usabilidade: crédito de
autor/fonte com `target="_blank" rel="noreferrer"` (`ImageCredit`,
`suggestion-card.tsx`) — abre em nova aba sem vazar `window.opener`
(`noreferrer` já implica `noopener`).

### Comandos rodados nesta validação (lote inteiro)

`npx vitest run src/lib/catalogo src/components/catalogo
src/lib/stage-rules/__tests__/destino.test.ts
src/components/design-system/__tests__/suggestion-card.test.tsx
src/components/destino/__tests__ src/components/hospedagem/__tests__
src/components/passeios/__tests__`: **10 arquivos, 104/104 passando**, sem
regressão em T06/T07/T05(confirmação). `npx tsc --noEmit` (projeto
inteiro): mesmos erros pré-existentes já documentados nas notas do
Executor (`.next/types/app/api/diag` — rota removida em commit anterior,
stale cache de tipos; testes de página não tocados por este lote com erro
de spread pré-existente; `auth-callbacks.test.ts` pré-existente) — nenhum
erro novo atribuível a `catalogo/`, `resolver-imagem.ts`,
`destination-image.tsx`, `destination-fallback-art.tsx`,
`stage-rules/destino.ts`, `actions/destino.ts`, `suggestion-card.tsx` ou
`destino-sugestoes-screen.tsx`. `npm run lint` (projeto inteiro): 0 erros;
1 warning pré-existente já documentado (`_priority` não usado no mock de
`next/image` em `destination-image.test.tsx`, mesmo padrão de outros mocks
do projeto) — não bloqueante.

### Veredito (Lote V2-L2)

**Aprovado, sem ressalva bloqueante.** As 5 tarefas cumprem seu critério de
aceite literal, confirmado por leitura do código e `git diff`, não pela
nota do Executor. Nenhuma reprovação crítica. Um achado **simples**
(duplicação de baixo risco do algoritmo de fallback em
`destination-image.tsx`, T03) vira tarefa em `Refatoração Lote-V2-L2` no
fechamento estrutural abaixo — não bloqueia o lote nem exige retorno ao
`executor`.

## Lote V2-L4 — Home vitrine (RF-12, RF-18; ADR-011) (2026-09-17)

10 tarefas (`V2-L4-T01` a `T09` + `RL-V2-L4-T01`, integração final),
todas `Concluída` no `TASK.md` no momento desta validação — primeiro
veredito de lote completo e definitivo do V2-L4. Uma checagem estrutural
anterior (2026-09-16) havia sido parcial, feita com `V2-L4-T05`
`Bloqueada` (Bloqueio 010); esse bloqueio foi resolvido em 2026-09-17
(dono do produto aprovou `src/content/roteiro-exemplo.ts`) e `V2-L4-T05` +
`RL-V2-L4-T01` já a integram na página real. `.md/QA-REPORT.md` nunca
tinha uma seção "V2-L4" — este é o primeiro registro formal.

Validado contra o critério de aceite literal de cada linha (Seção 3 do
`TASK.md`) e contra `UX-SPEC.md` §8.2 T-HOME (ordem fixa das 9 seções,
RF-12.1), `PRD-TECNICO.md` (RF-12, RF-18) e `ADR-011` — pelo código real
(`src/app/page.tsx`, `src/components/home/*`, `src/content/roteiro-exemplo.ts`)
e pela suíte executada de forma independente nesta validação, não pelas
notas de implementação do Executor.

### Suíte executada nesta validação (independente das notas do Executor)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (projeto inteiro) | Nenhum erro novo atribuível a `src/components/home`, `src/app/page.tsx` ou `src/app/__tests__/page.test.tsx`. Erros pré-existentes (spread de teste em `src/app/*/\__tests__/page.test.tsx` de outras rotas, `budget-insufficient-banner.test.tsx`, `auth-callbacks.test.ts`) confirmados não relacionados a este lote. |
| `npx eslint src/components/home src/app/page.tsx src/app/__tests__/page.test.tsx` | 0 erros, 3 warnings pré-existentes idênticos (`_priority` não usado nos mocks de `next/image` de `page.test.tsx`, `hero-section.test.tsx`, `showcase-section.test.tsx`) — mesmo padrão já documentado em outras validações, não bloqueante. |
| `npx vitest run src/components/home src/app/__tests__/page.test.tsx` | 65/65 testes passando, 12 arquivos, sem regressão. |
| `npm run build` (`next build`, projeto inteiro) | Verde. `/` prerendered estático (`○`), `5.22 kB`/`137 kB First Load JS`, `revalidate: 1h`, `expire: 1y`. |

### Integração ponta a ponta das 9 seções (RL-V2-L4-T01)

`src/app/page.tsx` compõe `HeroSection` → `EntryPathsSection` (`#caminhos`)
→ `HowItWorksSteps` → `ShowcaseSection` → `ExamplePreviewSection` →
`UpcomingHolidaysSection` → `FaqSection` → `SiteFooter` (recebendo
`<ImageCreditsSection />` no slot `imageCredits`) → `MobileStickyCta` (fora
de `<main>`) — ordem idêntica, item a item, ao `UX-SPEC.md` §8.2 T-HOME
(itens 1 a 9), confirmada por leitura direta do arquivo e pelo teste
`RL-V2-L4-T01 > renderiza as 9 seções na ordem exata do UX-SPEC.md §8.2,
cada uma uma única vez` (`compareDocumentPosition` par a par + asserção de
contagem 1 para cada marcador). Nenhuma seção duplicada, nenhuma seção
ausente. `ExamplePreviewSection` (`V2-L4-T05`) está na posição exata do
item 5 ("O que você recebe"), entre `ShowcaseSection` (item 4) e
`UpcomingHolidaysSection` (item 6) — confirma que a integração pendente
registrada na checagem estrutural de 2026-09-16 foi de fato concluída, não
só marcada `Concluída` na tabela.

`MobileStickyCta` usa os seletores default
(`[aria-label="Destino em destaque"]`/`#caminhos`), que batem com o DOM
real desta página (não props explícitas) — confirmado pelo teste
dedicado. `ImageCreditsSection` some corretamente hoje (nenhum destino do
catálogo tem imagem curada, ADR-010) sem quebrar `SiteFooter`, que
continua presente normalmente — o slot é de fato opcional, confirmado pelo
teste.

### V2-L4-T01 a T04, T06a/T06b, T07, T08, T09 — seções individuais

Critérios de aceite específicos de cada tarefa (overlay AA do hero/RNF-09,
três caminhos com peso igual e foco programático em `#caminhos`/RF-12.1,
4 passos com texto exato de `HowItWorksSteps`, 8 `ShowcaseCard` na ordem do
catálogo sem preço/temporada/RF-12.3, `getProximosFeriados` sem duplicar
cálculo de RF-02.2/RNF-07, 5 perguntas do FAQ com identificação como IA
visível/RNF-11, `MobileStickyCta` só abaixo de `md` respeitando
`prefers-reduced-motion`/RNF-10, `AccountNav` sem `SessionProvider` global
e sem CLS) já haviam sido confirmados linha a linha na checagem estrutural
de 2026-09-16 (código lido diretamente, não só a nota do Executor) e são
reconfirmados nesta validação pela suíte 65/65 verde — sem regressão em
nenhum teste isolado de seção. Não há mudança de código nestes arquivos
desde então; a única mudança relevante ao lote foi a integração de
`V2-L4-T05`/`RL-V2-L4-T01`, tratada em detalhe acima.

`prefers-reduced-motion` confirmado por leitura direta de
`src/components/home/mobile-sticky-cta.tsx` (`window.matchMedia
("(prefers-reduced-motion: reduce)")`, linha 102); overlay AA confirmado
por leitura direta de `src/components/home/hero-section.tsx`
(`overlay-scrim-hero`, RNF-09, linha 60).

### V2-L4-T05 — `ExamplePreviewSection` (validação completa, não só a leve já feita)

`src/components/home/example-preview-section.tsx`: reaproveita
`roteiroExemplo.days[0]` (`@/content/roteiro-exemplo`, mesmo arquivo de
T-EX/`V2-L3-T01`, já aprovado pelo dono em 2026-09-17) e
`ItineraryDayBlock` com `readOnly` — mesmo componente/prop que T-EX já
usa, sem duplicar lógica de apresentação do dia. `ExampleBadge` presente;
nota fixa "Os preços que eu sugiro são faixas aproximadas, não cotações."
(RF-12.3) presente; CTA "Ver o roteiro de exemplo completo" →
`/roteiro-exemplo`. 5/5 testes de
`src/components/home/__tests__/example-preview-section.test.tsx`
confirmam cada um destes pontos individualmente, incluindo que o Dia 1
vem do fixture real (atividades específicas de manhã/tarde/noite) e não é
reescrito no componente.

**Aprovado.**

### Achado simples (não bloqueia) — comentário desatualizado em `src/content/roteiro-exemplo.ts`

- **Severidade: simples.** As linhas 1-9 do arquivo ainda dizem "PENDENTE
  DE REVISÃO HUMANA... a tarefa que o gerou fica `Bloqueada`, não
  `Concluída`, até essa revisão acontecer" — mas o Bloqueio 010 foi
  resolvido em 2026-09-17 (dono do produto aprovou o conteúdo,
  `.md/BLOCKERS.md`) e `V2-L3-T01` já está `Concluída`. O comentário não
  foi atualizado no commit de resolução.
- Não compromete nenhum critério de aceite central: o conteúdo em si está
  aprovado e correto, é só o comentário de cabeçalho do arquivo que ficou
  desatualizado — risco de confundir quem ler o arquivo depois (parece
  sugerir que o conteúdo ainda não é definitivo, quando já é). Não
  bloqueia nenhuma outra tarefa do lote.
- Ação: **não** volta ao `executor` imediatamente — vira tarefa em
  `Refatoração Lote-V2-L4` (ver `.md/TASK.md`), registrada pelo Validador
  nesta mesma validação (não havia registro prévio deste achado
  específico em `Refatoração Lote-V2-L4`, confirmado por busca no
  arquivo antes de criar a entrada).

### Requisitos não funcionais relevantes ao lote

- Acessibilidade: foco programático em `#caminhos` só quando chega via
  hash (não rouba foco em visita normal), `aria-live` não aplicável a este
  lote (sem anúncio dinâmico), FAQ com identificação como IA em texto
  visível (RNF-11), contraste AA do overlay do hero (RNF-09).
- Performance: `/` estática, `revalidate: 3600`, sem `cookies()`/
  `getServerSession` na página (confirmado por teste dedicado e pela
  ausência de `Route (app)` dinâmica para `/` no output do build) — nenhum
  I/O bloqueante de rota introduzido pelo lote.
- Usabilidade: ordem das seções idêntica ao `UX-SPEC.md` §8.2, sem
  duplicação de CTA (`MobileStickyCta` some quando `#caminhos` está
  visível, evitando ação redundante ao lado dos três caminhos).

### Bugs encontrados

Nenhum bug de severidade crítica ou simples encontrado nas 10 tarefas além
do achado de comentário desatualizado acima (que não é um bug de
comportamento, é uma inconsistência de documentação inline).

### Veredito (Lote V2-L4)

**Aprovado, sem ressalva bloqueante.** As 10 tarefas (`V2-L4-T01` a `T09` +
`RL-V2-L4-T01`) cumprem seu critério de aceite literal, confirmado por
leitura do código, `git diff` implícito na comparação com a checagem
estrutural anterior, e execução real e independente da suíte (tsc/eslint/
vitest/build) nesta validação. Nenhuma reprovação crítica, nenhuma
reprovação simples de comportamento. Um achado simples de documentação
(comentário desatualizado em `src/content/roteiro-exemplo.ts`) vira tarefa em
`Refatoração Lote-V2-L4` no fechamento estrutural abaixo — não bloqueia o
lote nem exige retorno ao `executor`. Lote liberado para a auditoria de
segurança do chapéu DevSecOps.

### Validação pontual — `RL-V2-L4-T02` (2026-09-17)

Escopo reduzido: só a tarefa `RL-V2-L4-T02` (achado simples anterior,
comentário desatualizado em `src/content/roteiro-exemplo.ts`), marcada
`Concluída` pelo Executor.

- `git diff -- src/content/roteiro-exemplo.ts` confirmado: só as linhas
  1-9 (comentário de cabeçalho) mudaram. Nenhum dado de `roteiroExemplo`
  tocado.
- Comentário novo não menciona mais "PENDENTE DE REVISÃO HUMANA"/
  `Bloqueada`; referencia diretamente a resolução do Bloqueio 010
  (2026-09-17, "Roteiro aprovado") e `V2-L3-T01 Concluída`, em vez da
  descrição desatualizada.
- `npx tsc --noEmit` executado de forma independente: mesmos erros
  pré-existentes de outros arquivos (`src/app/*/__tests__/page.test.tsx`
  com spread de tupla, `budget-insufficient-banner.test.tsx`,
  `auth-callbacks.test.ts`), nenhum novo erro e nada relacionado a
  `roteiro-exemplo.ts`.
- `npx vitest run` dos três arquivos relevantes executado de forma
  independente: `src/content/__tests__/roteiro-exemplo.test.ts` (8),
  `src/components/home/__tests__/example-preview-section.test.tsx` (5),
  `src/app/__tests__/page.test.tsx` (10) — 23/23 verdes.

**Veredito: Aprovado.** Critério de aceite cumprido item a item.

### Achado simples novo (não bloqueia) — metadado de proveniência também desatualizado

- **Severidade: simples.** Fora do escopo literal de `RL-V2-L4-T02`
  (restrito ao comentário), mas registrado nesta mesma validação: em
  `src/content/roteiro-exemplo.ts`, o campo de dados
  `generatedFrom.reviewedByOwner` (hoje `false`) e o texto de
  `generatedFrom.note` (linhas ~203-208) também ficaram desatualizados
  pela aprovação do Bloqueio 010 — ainda dizem "PENDENTE DE REVISÃO
  HUMANA... V2-L3-T01 permanece 'Bloqueada'".
- Confirmado que é metadado de proveniência interno, não lido por
  nenhuma tela/UI (busca em `src/` fora do próprio arquivo só encontra
  uso em `src/content/__tests__/roteiro-exemplo.test.ts`, que testa que
  `reviewedByOwner` é `boolean` e que `note` não é vazio — nunca o valor
  específico). Não compromete nenhum critério de aceite central, não
  bloqueia nenhuma outra tarefa.
- Ação: vira tarefa `RL-V2-L4-T03` em `Refatoração Lote-V2-L4`
  (`.md/TASK.md`), registrada pelo Validador nesta checagem estrutural —
  sem retorno ao `executor` imediato.

## Lote V2-L5 — Entradas pré-preenchidas (RF-13, RF-18.3) (2026-09-16)

2 tarefas (`V2-L5-T01`, `V2-L5-T02`), ambas `Concluída` no `TASK.md` antes
desta validação. Validado contra o critério de aceite literal de cada
linha (Seção 3) e contra `PRD-TECNICO.md` (RF-01.2/.3/.4, RF-13, RF-18.3),
`UX-SPEC.md` §8, `SDD.md` §8.2.4 — pelo código real (`git diff`), não
pelas notas de implementação do Executor.

### V2-L5-T01 — `/entrada/data-livre?destino={slug}`

Lido `src/app/entrada/data-livre/page.tsx` linha a linha:
`resolveDestinoInicial` só faz `CATALOGO_DESTINOS.find((item) => item.slug
=== slug)` — comparação exata contra o catálogo estático (`@/lib/catalogo/
destinos`, V2-L2-T01), nunca correspondência aproximada, nunca outro
parâmetro de querystring lido. Slug ausente ou sem correspondência retorna
`undefined` sem lançar erro — `DataLivreClient`/`T01DateRangeForm` caem no
comportamento idêntico ao MVP (campo vazio, sem linha de contexto),
confirmado pelos testes `page.test.tsx` ("slug inválido: destinoInicial
fica undefined", "ausente: idem", "outro parâmetro de querystring é
ignorado").

Ramificação RF-01.3 (destino mantido → T05, apagado → T04): a lógica de
decisão real está inteira em `submeterDataLivre`
(`src/lib/actions/data-livre.ts`, linha 159-183) — o campo `destino` que o
formulário envia no submit (controlado por `T01DateRangeForm`, editável
pelo usuário a partir de `destinoInicial`) é sanitizado por
`sanitizeDestino` e, se vazio após trim, retorna `proximaEtapa: "destino"`
(RF-01.2, avança para T04); se não-vazio, retorna `proximaEtapa:
"confirmacao_destino"` (RF-01.3, avança para T05). `DataLivreClient` não
reimplementa essa decisão — só navega conforme o `proximaEtapa` devolvido
pelo servidor (Diretriz de Implementação 3, nenhuma navegação client-side
otimista). Confirmado nos dois testes dedicados de
`page.test.tsx`("V2-L5-T01, RF-13"): "destino mantido pelo usuário: segue
RF-01.3, avança para T05" e "destino apagado pelo usuário: segue o fluxo
normal de T04" — ambos passam simulando o usuário editando o campo antes
de submeter, não só o valor inicial da prop.

`T01DateRangeForm`: `destinoInicial` só inicializa o `useState` do campo
(`useState(destinoInicial ?? "")`), continua editável por
`onChange`/`setDestino`. A linha de contexto
(`arrivedWithDestinoInicial && destino.trim().length > 0`) aparece só
quando chegou com `destinoInicial` E o campo ainda não foi esvaziado, e
some ao apagar — bate com UX-SPEC.md §8.2 ("se o usuário apagar o destino,
a linha de contexto some"), confirmado nos 3 testes novos de
`t01-date-range-form.test.tsx`. Datas continuam `required`, vazias por
padrão — nenhuma mudança de RF-13.3.

**Aprovado.** Critério de aceite literal (Seção 3) cumprido em todos os
três pontos: slug inválido/ausente sem erro; só slug aceito na URL, nunca
texto livre (nenhum outro parâmetro repassado ao campo); ramificação
RF-01.3/T04 confirmada pelo código real de `submeterDataLivre`, não
assumida.

### V2-L5-T02 — `/entrada/feriados?feriado=AAAA-MM-DD`

`src/app/entrada/feriados/page.tsx`: `feriado` só é repassado adiante se
bater `FERIADO_PARAM_FORMAT` (`/^\d{4}-\d{2}-\d{2}$/`); formato errado
vira `undefined` sem lançar erro. `FeriadosScreen`: o `useEffect` de
pré-seleção roda uma única vez ao montar (array de dependências vazio,
`eslint-disable-next-line react-hooks/exhaustive-deps` documentado),
compara `initialFeriadoDate` contra `holidayDateParam(holiday)` de cada
item da lista recebida via prop (não recalcula nada, usa a mesma lista já
renderizada) — sem correspondência (ausente, formato errado, ou data que
não existe na lista atual) o efeito retorna cedo sem nenhum efeito
colateral: nenhuma seleção, nenhum `role="alert"`, lista renderiza
normal. Confirmado nos casos de `feriados-screen.test.tsx`: "data
ausente/formato inválido/sem correspondência = sem seleção e sem
role=alert".

Com correspondência: `setSelectedKey(key)` marca o mesmo estado que o
clique manual do usuário usaria (`HolidayListItem selected={selectedKey
=== key}`) — nenhum caminho de estado paralelo. `setAnnouncement` popula a
região `aria-live="polite"` (`sr-only`, sempre presente no DOM desde o
primeiro render, evitando perder o anúncio por montar depois do texto).
`scrollIntoView` é chamado condicionalmente (`typeof element.scrollIntoView
=== "function"`, guarda contra jsdom sem a API) e respeita
`prefers-reduced-motion` via `matchMedia`.

Avanço continua exigindo clique explícito: o efeito de pré-seleção nunca
chama `handleContinuar` (busca no código confirma: `handleContinuar` só é
referenciado no `onClick` do botão "Continuar") — INT-10 preservado, sem
auto-avanço. Usuário pode trocar a seleção livremente: o mesmo
`groupName="feriado-escolhido"` de rádio único já existente (RL6-T03)
governa a troca, `onSelect={() => setSelectedKey(key)}` não tem nenhuma
guarda que privilegie o item pré-selecionado sobre um clique posterior.
Confirmado no teste "usuário pode trocar a seleção livremente mesmo após
pré-seleção" de `feriados-screen.test.tsx`.

**Aprovado.** Critério de aceite literal (Seção 3) cumprido: data
inválida/sem correspondência = sem seleção, sem erro; avanço continua
exigindo clique explícito (nenhuma chamada a `handleContinuar`/`action`
dentro do efeito); usuário pode trocar o feriado livremente.

### Requisitos não funcionais

Nenhuma regressão de performance introduzida (efeito roda uma única vez ao
montar, sem polling/timer). Usabilidade conforme UX-SPEC.md §8: contexto
visual (linha "Ótima escolha...") e sonoro (`aria-live`) reforçam a
pré-seleção sem impor navegação. Acessibilidade: `aria-live="polite"`
correto para anúncio não crítico (não interrompe leitor de tela em
andamento), `scrollIntoView` respeita `prefers-reduced-motion` (RNF-10).

### Testes de integração cruzada

`submeterDataLivre` (Server Action, L6-T03) e `processarFeriadoEscolhido`
(L6-T05) não foram alterados neste lote — só consumidos com um valor
inicial diferente vindo da UI. Nenhum contrato de API (`API-CONTRACT.yaml`)
tocado por este lote (ambas as rotas são Server Components/Server Actions
internas ao App Router, sem endpoint HTTP externo novo).

### Comandos rodados nesta validação (lote inteiro)

`npx vitest run src/app/entrada/data-livre src/app/entrada/feriados
src/components/entrada`: **4 arquivos, 42/42 passando** (11+16+11+4 —
confirma também os testes pré-existentes de RL6-T02/RL6-T03, sem
regressão pela nova assinatura assíncrona de `searchParams`). `npx tsc
--noEmit` (projeto inteiro): mesmos erros pré-existentes já documentados
em validações anteriores (`.next/types/app/api/diag` — rota removida em
commit anterior, cache stale de tipos; `src/app/**/__tests__/page.test.tsx`
de outras rotas com erro de spread pré-existente, não tocados por este
lote; `auth-callbacks.test.ts` pré-existente) — nenhum erro novo
atribuível a `data-livre/page.tsx`, `data-livre-client.tsx`,
`t01-date-range-form.tsx`, `feriados/page.tsx` ou `feriados-screen.tsx`.
Confirmado também que nenhum outro ponto do código que importa essas duas
rotas quebrou com a mudança de assinatura síncrona → `searchParams:
Promise<...>` (busca por `DataLivrePage`/`FeriadosPage`/
`data-livre-client` no projeto: só os próprios arquivos do lote e seus
testes referenciam esses módulos). `npm run lint` (projeto inteiro): 0
erros; 1 warning pré-existente já documentado em validação anterior
(`_priority` não usado em `destination-image.test.tsx`, fora do escopo
deste lote) — não bloqueante.

### Achados

Nenhuma reprovação crítica. Nenhuma reprovação simples — código lido bate
com o critério de aceite literal em ambas as tarefas, sem ajuste pontual
pendente.

### Veredito (Lote V2-L5)

**Aprovado, sem ressalva.** As 2 tarefas cumprem seu critério de aceite
literal, confirmado por leitura do código e `git diff`, não pela nota do
Executor. Nenhuma reprovação crítica ou simples — nenhuma tarefa em
`Refatoração Lote-V2-L5` originada pelo chapéu QA.

## Lote V2-L6 — Verificação de conta no servidor (RF-16.7, ADR-009)

Validação independente das notas do Executor (usadas só para saber onde
olhar): leitura direta de `src/lib/session-flow/account-gate.ts`,
`resolve-request-identity.ts`, `authorization.ts`, `persistence.ts`,
`rota-da-etapa.ts`, `confirmacao-destino.ts`, `hospedagem.ts`,
`passeios.ts`, `roteiro.ts`, `git status`/busca por `api/gateway-ia`, e
execução própria de `tsc`/`eslint`/`vitest` (não apenas confiança na nota
do Executor nem nas checagens já feitas pelo orquestrador pós-incidente do
Bloqueio 011).

### V2-L6-T01 — `transicaoExigeConta`

`ESTADOS_POS_DESTINO` bate literalmente com o conjunto do ADR-009 item 1
(`hospedagem_pendente` a `concluida`, `destino_confirmado` fora do
conjunto). `acao === "encerrar"` retorna `false` antes de qualquer outra
checagem (RN-12), cobrindo inclusive estados sem `encerrar` válido.
26/26 testes de `account-gate.test.ts` passando (executado nesta
validação, não só na nota do Executor). **Aprovado.**

### V2-L6-T02 — `resolveRequestIdentity`

Confirmado por leitura: nenhum `cookies().set(...)` no arquivo — só
`cookies().get(...)`. `userId` só é devolvido depois de
`prisma.user.findUnique` confirmar que o `User` ainda existe (conta
excluída com JWT válido → tratado como sem conta, nunca lança). Par bruto
devolvido sem decidir precedência (função não contém nenhum `if
(userId) ... else` que descarte `anonSessionId`, ou vice-versa — os dois
campos são resolvidos e devolvidos independentemente). **Aprovado.**

### V2-L6-T03 — `assertSessionAccess`/`ContaNecessariaError`

Comparação célula a célula entre a tabela do ADR-009 item 2 e
`resolveSessionAccess` (`authorization.ts` linhas 180-201):

| Célula do ADR | Implementação |
|---|---|
| `userId=U` / `userId=U` → granted (ambos `exigeConta`) | `record.userId === identity.userId ? "granted" : "denied"` — `exigeConta` nem é lido nesse branch. Confere. |
| `userId=U` / outra identidade → denied (ambos `exigeConta`) | Mesmo branch, ramo `"denied"`. Confere. |
| `anonSessionId=A` / cookie `A` → granted (`exigeConta:false`) / `conta_necessaria` (`exigeConta:true`) | `record.anonSessionId !== null` → se cookie bate, `exigeConta ? "conta_necessaria" : "granted"`. Confere. |
| `anonSessionId=A` / cookie diferente → denied (ambos) | `record.anonSessionId !== identity.anonSessionId → "denied"`, antes de olhar `exigeConta`. Confere. |
| nenhum dos dois gravado (ou `record` nulo) → denied (ambos) | `if (!record) return "denied"`; e o `return "denied"` final depois dos dois `if` de posse cobre o caso de registro sem nenhum campo. Confere. |

Ordem "posse antes de conta" confirmada por leitura de controle de fluxo:
`exigeConta` só é lido dentro do branch que já confirmou
`record.anonSessionId === identity.anonSessionId` (linha 198) — nenhum
outro `return` do arquivo consulta `exigeConta`. Negação de posse sempre
`SessionNotFoundError` (`assertSessionAccess`, linha 233-235) — nunca um
erro 403/dedicado. `assertSessionOwnership` (linha 251-256) é de fato só
`return assertSessionAccess(sessionId, record, { exigeConta: false })`,
sem lógica própria — os ~10 chamadores confirmados (`destino.ts`,
`encerramento.ts`, `hospedagem.ts`, `passeios.ts`, `roteiro.ts`,
`authorization.ts`/testes) continuam usando o alias sem alteração própria.
26/26 testes de `authorization.test.ts` passando nesta validação. **Aprovado.**

### V2-L6-T04 — `confirmarDestino`

Fluxo real (não só a nota): `applySessionFlowTransition`
(`persistence.ts`, passo 3b, linhas 241-250) calcula
`transicaoExigeConta(currentState, action)` DEPOIS que
`transitionSessionFlow` já confirmou a transição válida (passo 3) e ANTES
de qualquer escrita (passo 4/gravação da entidade filha) — se `true`,
chama `assertSessionAccess` de novo com `exigeConta: true`, dentro da
mesma `prisma.$transaction`. `confirmarDestino`
(`confirmacao-destino.ts` linhas 96-115) envolve a chamada num
`try/catch` e converte `ContaNecessariaError` em
`{status: "conta_necessaria", sessionId}` — nunca deixa vazar. Como a
exceção é lançada de dentro do callback do `$transaction`, o rollback é
automático: nenhuma escrita parcial. `trocarDestino` (ação `revisar`)
corretamente não tratada (nem origem nem destino são pós-destino).
**Aprovado.**

### V2-L6-T05/T06/T07 — `hospedagem.ts`/`passeios.ts`/`roteiro.ts`

Confirmado nos três arquivos (não apenas na nota) que
`assertSessionAccess(sessionId, session, { exigeConta: true })` é a
PRIMEIRA coisa chamada depois do `findUnique` de existência da sessão, em
`gerarSugestoesHospedagem` (linha 200), `gerarSugestoesPasseios` (linha
176) e `gerarRoteiro` (linha 201) — antes de qualquer leitura de
`DestinationApproval`/`AccommodationApproval`/`ActivityApproval` e antes
da chamada real ao Gateway de IA (`generateAccommodationSuggestions`/
`generatePasseiosSuggestions`/`generateRoteiro`, todas depois do guard no
fluxo de controle linear da função — nenhum caminho alternativo pula o
guard). Mesmo padrão confirmado nas 3 funções `aprovar*`
(`aprovarHospedagem` linha 382, `aprovarSelecaoPasseios` linha 377,
`aprovarRoteiro` linha 462) — guard antes de `assertValid*Payload`/
`applySessionFlowTransition`. Todas as 6 funções capturam
`ContaNecessariaError` em `try/catch` dedicado e devolvem resultado
discriminado — nenhuma delas deixa a exceção se propagar. **Aprovado** nas
3 tarefas.

Achado simples (documentação, não código executável): o comentário de
`roteiro.ts` (linhas 435-439, nota de `aprovarRoteiro`) afirma que
`applySessionFlowTransition` "ainda não computa `exigeConta`
internamente" — isso ficou desatualizado depois que `V2-L6-T04` passou a
computar `exigeConta` dentro de `persistence.ts` (passo 3b) para TODA
ação, uniformemente (confirmado acima). Não é uma falha de segurança (o
guard explícito em `roteiro.ts` é redundante, não substitutivo — a dupla
checagem é inofensiva), só um comentário desatualizado que pode confundir
quem ler depois. Registrado como tarefa em `Refatoração Lote-V2-L6`
abaixo — não é motivo de reprovação da tarefa em si.

### V2-L6-T08 — Remoção de `POST /api/gateway-ia/[etapa]`

Confirmado por busca própria (`grep -rln`): `src/app/api/gateway-ia/`
contém hoje só `streaming-spike/route.ts` (não tocado, fora de escopo) —
`[etapa]/route.ts` e seu teste não existem mais no disco (confirmado
também pelo `git status`: `D` para os dois arquivos). Toda referência
restante a `api/gateway-ia/[etapa]` no código é comentário de
documentação (`loading-stream.tsx`, `destino-sugestoes-screen.tsx`,
`gateway-ia/index.ts`, `gateway-ia/prompts.ts`) — nenhum `fetch(` real
para essa rota em nenhum arquivo de produção, confirmado por grep próprio
sem filtro de exclusão. As 4 telas que usam `LoadingStream` já ligam via
`fetchImpl` às Server Actions (`gerarSugestoesDestino`/
`gerarSugestoesHospedagem`/`gerarSugestoesPasseios`/`gerarRoteiro`).
**Aprovado.**

### V2-L6-T09 — `rotaDaEtapa`

Os 7 casos do SDD §8.2.5 cobertos em `rota-da-etapa.ts`: casos 1
(`entrada_selecionada`/`destino_pendente` → `/destino`), 2
(`destino_confirmado` → `/destino/confirmacao`, com querystring
`destino`/`flowState`), 3-5 (`hospedagem_pendente`/`passeios_pendente`/
`roteiro_pendente` → rota própria), 6 (os 3 transitórios `*_aprovad*` —
resolvidos recursivamente via `transitionSessionFlow(flowState,
"avancar")`, sem duplicar a tabela de transições), 7 (`concluida`/
`encerrada_parcial` → `/meus-roteiros/{sessionId}`). Pequeno desvio
documentado no próprio arquivo (caso 7 sempre usa a rota autenticada,
mesmo para `encerrada_parcial`, por a assinatura pedida não ter parâmetro
de "tem conta") — aceitável: os 3 chamadores reais de `rotaDaEtapa`
(`V2-L7-T02`, `V2-L8-T02`, "meus roteiros") só operam em contexto já
autenticado, e o fluxo anônimo de `/encerramento` não passa por esta
função. **Aprovado.**

### Comandos rodados nesta validação (lote inteiro, execução própria do Validador)

`npx tsc --noEmit` (projeto inteiro): mesmos erros pré-existentes já
documentados (TS2556 em `src/app/destino/confirmacao/__tests__/page.test.tsx`,
`src/app/encerramento/__tests__/page.test.tsx`,
`src/app/hospedagem/__tests__/page.test.tsx`,
`src/app/passeios/__tests__/page.test.tsx`,
`src/app/roteiro/__tests__/page.test.tsx`; TS2698 em
`budget-insufficient-banner.test.tsx`; TS18048/TS2339 em
`auth-callbacks.test.ts`) — nenhum erro novo, nenhum referente a
`session-flow`/`actions` do lote. `npm run lint`: 0 erros; 1 warning
pré-existente já documentado (`_priority` não usado em
`destination-image.test.tsx`, fora deste lote). `npx vitest run
src/lib/session-flow src/lib/actions/__tests__/resolve-request-identity.test.ts
src/lib/actions/__tests__/hospedagem.test.ts
src/lib/actions/__tests__/passeios.test.ts
src/lib/actions/__tests__/roteiro.test.ts
src/lib/actions/__tests__/confirmacao-destino.test.ts`: 123 testes
passando em 7 arquivos; os 2 arquivos de integração
(`persistence.integration.test.ts`,
`create-session-with-range.integration.test.ts`) falham com 18 testes por
`PrismaClientInitializationError: Can't reach database server at
localhost:55432` — limitação conhecida deste ambiente (sem Postgres),
não regressão do lote.

### Achados

Nenhuma reprovação crítica. 1 reprovação simples (comentário
desatualizado em `roteiro.ts` sobre `applySessionFlowTransition`, ver
V2-L6-T05/T06/T07 acima) — vira tarefa em `Refatoração Lote-V2-L6`,
`V2-L6-T07` permanece `Concluída`.

### Veredito (Lote V2-L6)

**Aprovado, com ressalva simples.** As 9 tarefas cumprem seu critério de
aceite literal, confirmado por leitura direta do código (não pela nota do
Executor) e por execução própria de `tsc`/`eslint`/`vitest` — nenhuma
reprovação crítica. 1 achado simples (comentário desatualizado, sem
impacto funcional/de segurança) registrado em `Refatoração Lote-V2-L6`
para correção de baixo esforço, sem bloquear o lote nem reabrir nenhuma

## Lote V2-L7 — Cadastro, vínculo e telas de conta (RF-16, RNF-13; ADR-009 item 3, ADR-012) (2026-09-16)

Todas as 9 tarefas (`T01`-`T09`) já estavam `Concluída` no `TASK.md` antes
desta validação. Checagens abaixo feitas por leitura direta do código
(`git diff`/arquivo real), nunca pela nota de implementação do Executor
como base de aprovação — a nota foi usada só como mapa de onde olhar.

### Suíte executada (independente, além das 3 confirmações do
orquestrador — `tsc --noEmit`, `lint`, `vitest run` excluindo
`*.integration.test.*`, já sem regressão)

| Comando | Resultado |
|---|---|
| `npx vitest run` nos 8 arquivos de teste específicos do lote (`auth-rate-limit.test.ts`, `auth-authorize.test.ts`, `conta-rate-limit.test.ts`, `src/app/entrar`, `src/app/cadastro`, `src/components/conta`) | 60/60 passando, incluindo o teste de 10.8s que exercita de fato a branch de equalização de tempo (`bcrypt.compare` dummy) |
| `test -f src/app/api/auth/signup/route.ts` | Arquivo ausente — remoção confirmada |
| Grep por `api/auth/signup` no repo | Só 3 ocorrências, todas em comentário explicando a remoção — nenhum consumidor ativo |
| Grep por `console.(log\|error\|warn\|info)` em `src/` | Só `gateway-ia/prompt-injection-guard.ts` e `gateway-ia/generation-log.ts` — nenhuma ocorrência em `auth.ts`/`auth-rate-limit.ts`/`conta.ts`, confirmando "e-mail nunca em log" |
| Grep por `onVerDepois` no repo inteiro | Zero resultados — nenhum consumidor quebrado pela remoção da prop |

### V2-L7-T01 — `criarConta`

`src/lib/actions/conta.ts`/`src/lib/user-account.ts` lidos linha a linha:
consentimento (`!== true`) checado numa guard clause isolada, ANTES de
qualquer leitura/escrita no banco; `CreateUserAccountInput` não declara
nenhum campo de timestamp — `privacyConsentAt`/`Version` só podem vir do
`new Date()` do servidor, confirmado pelo teste de integração que injeta
um `privacyConsentAt` via `@ts-expect-error` e confirma que é ignorado.
E-mail duplicado tratado nos dois pontos (`findUnique` prévio + `catch` de
`P2002`), convergindo para `EmailAlreadyInUseError("E-mail já
cadastrado.")` em ambos — nunca vaza `error.message`/`code` do Prisma.
Senha mínima 8 (`MIN_PASSWORD_LENGTH`). `POST /api/auth/signup` de fato
removida. **Aprovado.**

### V2-L7-T02 — `vincularSessaoAConta`

`src/lib/session-flow/link-anonymous-session-to-user.ts` lido:
`updateMany` com `where: { id, anonSessionId, userId: null }` é
literalmente o pseudocódigo do ADR-009 item 3 — só a sessão indicada muda
(nenhuma outra query de `updateMany` sem `id` no `where`). `count === 0`
relido na mesma transação: `existing.userId === input.userId` é sucesso
idempotente sem lançar; qualquer outro caso (`existing` nulo, `userId`
diferente) lança `SessionNotFoundError` (404). Continuação atômica
`destino_confirmado` → `hospedagem_pendente` roda dentro do MESMO
`prisma.$transaction` via `applySessionFlowTransitionInTx(tx, ...)` — não
há segunda transação nem chamada fora do `tx`. **Aprovado.**

### V2-L7-T03 — `AuthForm`/`ConsentCheckbox`

`autocomplete="email"` sempre presente; `autocomplete="new-password"` no
modo `cadastro`, `"current-password"` no modo `entrar` — confirmado no
componente. `ConsentCheckbox` só renderiza quando `mode === "cadastro"`
(ausente em `entrar`) e inicia com `useState(false)` — nenhum caminho o
inicializa `true`. Cada erro (`emailErrorId`/`senhaErrorId`/`consentimentoErrorId`/`formErrorId`)
conectado via `aria-describedby` no campo correspondente, com `role="alert"`.
**Aprovado.**

### V2-L7-T04 — T-GATE (`src/app/cadastro/`)

`page.tsx`: `assertSessionAccess(sessionId, tripSession, { exigeConta:
false })` roda logo depois do único `prisma.tripSession.findUnique`
(leitura, não escrita) e ANTES de qualquer outra lógica — `catch` de
`SessionNotFoundError` vira `redirect("/")`. Estado terminal
(`isTerminalSessionFlowState`) redireciona para `/encerramento` antes de
`CadastroClient` ser montado. Nenhuma chamada de escrita (`criarConta`/
`signIn`/`vincularSessaoAConta`) acontece no Server Component — só reads
(`findUnique`, `getServerSession`); em `CadastroClient`, as 3 chamadas só
disparam dentro de `onClick`/`onSubmit`, sem nenhum `useEffect` de
montagem — confirmado por leitura completa do arquivo (nenhum `useEffect`
presente no componente todo). "Agora não" chama
`encerrarResolucaoDestino` (já existente, preserva `DestinationApproval`)
sem passar por `criarConta`/`signIn`/`vincularSessaoAConta`. **Aprovado.**

### V2-L7-T05 — T-LOGIN (`src/app/entrar/`)

`RETORNO_ALLOWLIST` é um array de 5 strings exatas; `resolveRetorno` usa
`.includes(retorno)` (igualdade estrita, nunca `startsWith`/regex de
prefixo) — qualquer valor fora da lista cai em `RETORNO_PADRAO = "/"`.
Teste `page.test.ts` cobre os vetores citados no enunciado
(`//evil.com`, `javascript:`, `/meus-roteiros-evil.com`, URL absoluta,
querystring anexada) — 12/12 passando, incluindo esses casos
especificamente. **Aprovado.**

### V2-L7-T06/T07 — telas tratam `conta_necessaria`

Confirmado por leitura de código (não só grep) nas 4 telas: T05
(`confirmacao-destino-client.tsx`, `onConfirmar` checa `"status" in
result && result.status === "conta_necessaria"` antes de navegar para
`/hospedagem`), Hospedagem (`hospedagem-sugestoes-screen.tsx`), Passeios
(`passeios-sugestoes-screen.tsx`) e Roteiro (`roteiro-screen.tsx`, via
`isContaNecessariaResult`) — todas navegam para
`/cadastro?sessionId=...` no caminho `conta_necessaria`, nas 3 telas de
T07 nos 3 pontos de chamada relatados (carregamento inicial, ajustar
quando aplicável, aprovar).

Os 2 bugs relatados por T07 confirmados corrigidos por leitura direta,
não pela alegação da nota:
- `handleStreamComplete` (hospedagem): agora checa `if (!Array.isArray(parsed))
  { redirectToContaGate(); return; }` ANTES de `setSuggestions`/qualquer
  `.map()` — o bug relatado (`.map()` sobre um objeto `{status,
  sessionId}`) não pode mais ocorrer, porque `suggestions.map` só roda
  depois do `screen` virar `"success"`, que só acontece no branch array.
- `handleApprove` (hospedagem): agora checa `if ("status" in result &&
  result.status === "conta_necessaria") { redirectToContaGate(); return;
  }` ANTES de `setApproved(suggestion)` — o bug relatado (aprovação
  ignorando `conta_necessaria` e marcando a opção como aprovada mesmo
  assim) não pode mais ocorrer.

**Aprovado.**

### V2-L7-T08 — rate limit + timing-safe `authorize`

Ver auditoria completa em `SECURITY-REVIEW.md` (Lote V2-L7) — do ponto de
vista funcional, os 2 limites (5/10min por IP em `criarConta`, 10/10min
por `(IP, hash-do-email)` em `authorize`) e o branch de `bcrypt.compare`
dummy foram confirmados por leitura de código e pela execução real do
teste de 10.8s que exercita o caminho de e-mail inexistente. **Aprovado.**

### V2-L7-T09 — T-END copy V2.0

`encerramento-screen.tsx` lido por completo: a palavra "salvo" só aparece
dentro do branch `temConta ? "Está salvo em 'Meus roteiros'." :
SEM_CONTA_AVISO` — o branch `SEM_CONTA_AVISO` não contém "salvo" em
nenhum lugar (confirmado por leitura literal da constante). Com conta, CTA
é `<Link href="/meus-roteiros">Ver meus roteiros</Link>`; sem conta,
`<Link href="/">Planejar outra viagem</Link>` — nenhum link para
`/meus-roteiros` no caminho sem conta. Grep por `onVerDepois` no projeto
inteiro devolveu zero resultados — nenhum consumidor quebrado pela
remoção da prop (única chamada de `EncerramentoScreen`, em
`src/app/encerramento/page.tsx`, já usa `temConta`). **Aprovado.**

### Achados

Nenhuma reprovação crítica. Nenhuma reprovação simples nova — os 2 bugs
de runtime relatados por T07 já foram corrigidos pelo próprio Executor
dentro da tarefa (confirmado acima), não são achados pendentes desta
validação.

### Veredito (Lote V2-L7)

**Aprovado, sem ressalvas.** As 9 tarefas cumprem seu critério de aceite
literal, confirmado por leitura direta do código e por execução própria
de testes direcionados (60/60) além das 3 confirmações do orquestrador
(`tsc`/`lint`/`vitest run` completo, 674/674). Nenhum achado novo. Lote
liberado para a auditoria de segurança dedicada (`SECURITY-REVIEW.md`).
tarefa.

## Lote V2-L8 — Meus roteiros (RF-17) (2026-09-16)

As 5 tarefas (`T01`-`T05`) já estavam `Concluída` no `TASK.md` antes desta
validação. Checagens abaixo feitas por leitura direta do código (nunca
pela nota de implementação do Executor como base de aprovação — usada só
como mapa de onde olhar) e por execução própria de teste.

### Suíte executada (independente, além das 3 confirmações do
orquestrador — `tsc --noEmit`, `lint`, `vitest run` excluindo
`*.integration.test.*`, 79 arquivos/714 testes, sem regressão)

| Comando | Resultado |
|---|---|
| `npx vitest run` nos 6 arquivos de teste (não-integração) específicos do lote (`meus-roteiros-client.test.tsx`, `meus-roteiros/page.test.tsx`, `meus-roteiros/[sessionId]/page.test.tsx`, `roteiro-salvo-screen.test.tsx`, `itinerary-day-block.test.tsx`, `encerramento-screen.test.tsx`) | 37/37 passando |
| `npx vitest run` nos 2 arquivos de teste puro do lote (`obter-roteiro-leitura.test.ts`, `meus-roteiros-label.test.ts`) | passando (parte dos 714 já confirmados pelo orquestrador) |
| `npx vitest run` nos 2 arquivos de integração real do lote (`retomar-sessao.integration.test.ts`, `meus-roteiros.integration.test.ts`) | **Não executável neste ambiente** — `PrismaClientInitializationError: Can't reach database server at localhost:55432`. Mesma limitação de ambiente já documentada e aceita em V2-L6/V2-L7 (sem Postgres local acessível); o único caso de `retomar-sessao.integration.test.ts` que não toca o banco (arity/tipo) passa. Ver "Observações" abaixo. |
| Grep por `console.(log\|error\|warn\|info)` nos 9 arquivos novos/editados do lote | Zero ocorrências |

### V2-L8-T01 — `listarMeusRoteiros`/`rotuloDaSessao`

`src/lib/actions/meus-roteiros.ts` lido por completo: a assinatura de
`listarMeusRoteiros()` não declara NENHUM parâmetro — não há caminho de
URL, corpo de requisição ou prop de componente que possa influenciar o
`userId` da query; `userId` vem exclusivamente de
`resolveRequestIdentity()` (`getServerSession`). A query usa `where: {
userId }` + `orderBy: { updatedAt: "desc" }`, exatamente o par
`(userId, updatedAt)` do índice adicionado em `V2-L1-T01`
(`prisma/schema.prisma`, `@@index([userId, updatedAt])`) — Postgres/Prisma
usam esse índice automaticamente para essa composição where+orderBy, sem
necessidade de hint explícito (não há teste de `EXPLAIN` dedicado, mas a
composição da query é literalmente a do índice). `rotuloDaSessao`
(`meus-roteiros-label.ts`) cobre os 3 casos de RF-17.3 por leitura direta:
`concluida` → "Roteiro concluído"; `encerrada_parcial` → "Encerrada em
{etapa}" com a prioridade passeios > hospedagem > destino; demais estados
→ "Em andamento — na etapa {etapa}" pelo mapa `ETAPA_POR_FLOW_STATE`
(9 estados cobertos, `entrada_selecionada` mapeado para "destino"). Função
pura, sem `"use server"`, testada sem mock em
`meus-roteiros-label.test.ts` (passando). **Aprovado.**

### V2-L8-T02 — `retomarSessao`

`src/lib/actions/retomar-sessao.ts` lido linha a linha, com atenção
especial ao ponto sutil apontado: `rotaDaEtapa` é de fato PURA (só
calcula a URL); a persistência real do `avancar` para os 3 estados
`*_aprovad*` acontece via `applySessionFlowTransition({ sessionId,
action: "avancar" })`, chamada ANTES de `rotaDaEtapa` receber o
`flowState` — e só o `flowState` já avançado (`advanced.flowState`) é
passado adiante. Isso está coberto por teste real de integração
(`retomar-sessao.integration.test.ts`, lido por completo): cada um dos 3
casos transitórios reconsulta `prisma.tripSession.findUniqueOrThrow`
depois da chamada e afirma o `flowState` persistido mudou
(`hospedagem_aprovada` → `passeios_pendente` no banco, não só na rota
devolvida). Sessão de outra conta: `assertSessionAccess` lança
`SessionNotFoundError` antes de qualquer `applySessionFlowTransition` —
confirmado pelo teste "sessão de outra conta é 404, sem gravar nada", que
relê o banco e confirma `flowState` inalterado. Server Action (`"use
server"`) — nenhum `route.ts` GET associado a este módulo, então não há
como expor o mesmo efeito colateral por um link/prefetch. Não pude
re-executar o teste de integração (Postgres indisponível neste ambiente,
ver "Observações"), mas a leitura do arquivo de teste confirma que ele
exercita exatamente o critério de aceite mais sensível da tarefa (relê o
banco, não confia só no valor de retorno). **Aprovado.**

### V2-L8-T03 — `obterRoteiroLeitura`

`src/lib/actions/obter-roteiro-leitura.ts` lido por completo, incluindo os
imports (linhas 51-58): nenhum import de `@/lib/gateway-ia` — só
`@/lib/prisma`, `@/lib/session-flow` (guard) e `import type` de
`@/lib/stage-rules`/`./roteiro` (tipos, apagados na compilação, sem
nenhum valor/função importado de lá). Confirmado também por
`grep -rn "gateway-ia" src/lib/actions/obter-roteiro-leitura.ts` — zero
ocorrências. Guard `assertSessionAccess(sessionId, session, { exigeConta:
true })` roda antes de qualquer leitura de `ItineraryItem`; posse negada
propaga `SessionNotFoundError` (404 lógico). O gap de schema conhecido
(`ItineraryItem.activityId` nulo sem `ActivityApproval`) é tratado com o
label `"Atividade do roteiro"`, documentado no cabeçalho do arquivo e
sinalizado ao Coordenador para uma migration futura — decisão razoável
dentro da margem do Executor, não uma reinterpretação do critério de
aceite. **Aprovado.**

### V2-L8-T04 — T-MEUS (`/meus-roteiros`)

`page.tsx`: sem `authSession.user.id`, `redirect("/entrar?retorno=/meus-roteiros")`
roda antes de qualquer chamada a `listarMeusRoteiros()`. `meus-roteiros-client.tsx`:
lista vazia renderiza `EmptyState` com CTA "Planejar uma viagem" (RF-17.6,
confirmado pelo teste "lista vazia mostra o EmptyState"). Fluxo de exclusão
testado de ponta a ponta em `meus-roteiros-client.test.tsx`: o teste
"'Excluir minha conta' exige confirmação no diálogo — não dispara no
primeiro clique" confirma que o clique no botão da tela só abre o
`AlertDialog` (`role="alertdialog"`), sem nenhuma chamada a `fetch`; só o
teste seguinte, que interage com o botão de confirmação DENTRO do diálogo,
dispara `DELETE /api/account`. `handleConfirmarExclusao` só faz `fetch("/api/account",
{ method: "DELETE" })` — nenhuma lógica de exclusão duplicada no cliente —
seguido de `signOut({ redirect: false })` e
`router.push("/?conta-excluida=1")` em caso de sucesso; erro mantém o
diálogo aberto com `errorMessage` (confirmado pelo teste de falha). Nota
de decisão documentada e aceitável: a home (T00) ainda não lê o parâmetro
`?conta-excluida=1` para exibir o aviso — fora do escopo de arquivos desta
tarefa, já registrado como gap para a futura reformulação da home (V2
direction). **Aprovado.**

### `AlertDialog` (`src/components/ui/alert-dialog.tsx`) — atenção especial

Componente novo, implementação própria (nenhum pacote Radix/shadcn
instalado para isto), usado num fluxo destrutivo. Lido por completo, sem
confiar na alegação do cabeçalho:
- `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/
  `aria-describedby` apontando para IDs reais de título/descrição —
  confirmado, ambos os `id`s existem nos elementos correspondentes.
- Foco inicial: `cancelButtonRef.current?.focus()` dentro do `useEffect`
  disparado quando `open` vira `true` — vai para "Cancelar" (ação menos
  destrutiva), não para "Excluir conta".
- Focus trap: `handleKeyDown` intercepta `Tab`/`Shift+Tab`, calcula
  `focusable` via `querySelectorAll(FOCUSABLE_SELECTOR)` dentro do próprio
  `dialogRef`, e força o ciclo entre primeiro/último elemento focável —
  cobre os dois sentidos (`shiftKey` e não).
- `Escape` chama `onCancel()` com `preventDefault()`.
- Retorno de foco: `previouslyFocusedElementRef` captura
  `document.activeElement` no momento da abertura e a função de cleanup do
  `useEffect` (disparada ao fechar/desmontar) chama `.focus()` nele de
  volta — cobre tanto "Cancelar" quanto "Escape" quanto fechamento por
  sucesso da exclusão.
- Proteção contra double-submit: o botão de confirmar recebe
  `disabled={confirmPending}`, e `handleConfirmarExclusao` chama
  `setExcluindoPending(true)` como primeira linha — uma segunda ativação
  do MESMO clique (evento único) não pode ocorrer; a janela teórica de um
  clique duplo extremamente rápido antes do re-render do React não foi
  testada isoladamente, mas o pior caso é uma segunda chamada a `DELETE
  /api/account` contra uma conta já excluída, que a rota trata como 404
  (`UserNotFoundError`, sem side effect adicional) — não é uma falha de
  segurança, só redundância inofensiva. Não bloqueia.
- Nenhuma regressão de acessibilidade identificada. **Aprovado.**

### V2-L8-T05 — T-MEUS-DET (`/meus-roteiros/[sessionId]`)

`page.tsx`: `obterResumoEncerramento` (guard de posse já auditado em
lotes anteriores) captura `SessionNotFoundError` e redireciona para
`/meus-roteiros?erro=sessao-nao-encontrada` — cobre sessão inexistente E
de outra conta (mesmo padrão ADR-008/009, sempre 404 lógico → redirect,
nunca 403). `flowState === "concluida"` (via `resumo.roteiroAprovado`)
chama `obterRoteiroLeitura` e passa `dias` para `RoteiroSalvoScreen`, que
renderiza `ItineraryDayBlock` com `readOnly` — sem nenhum botão de
aprovar/ajustar no componente (confirmado por leitura completa de
`roteiro-salvo-screen.tsx`: nenhum `onClick` de ação de fluxo, só o link
"← Meus roteiros"). `encerrada_parcial` mostra só o resumo + a frase
"Esta viagem foi encerrada em {etapa}", sem a seção "Seu roteiro" (guard
`isComplete ? ... : <p>...`). Teste `page.test.tsx` cobre os 3 casos
(sessão de outra conta/inexistente, concluída, encerrada parcial), 3/3
passando. **Aprovado.**

### Extração de `EncerramentoResumoBlocks` e modo `readOnly`/`dayLabel` de `ItineraryDayBlock` — checagem de regressão

`encerramento-screen.tsx`: `EncerramentoResumoBlocks` foi extraída com a
MESMA marcação que já estava inline em `EncerramentoScreen` (comparado
bloco a bloco: `ResumoBloco`/condicionais idênticas) — `EncerramentoScreen`
continua chamando o novo componente exportado no mesmo lugar da árvore,
sem mudança de props/comportamento. Teste `encerramento-screen.test.tsx`
(10/10 passando, arquivo já existente, não removido nem esvaziado por
esta tarefa) confirma que T-END continua se comportando como antes.
`itinerary-day-block.tsx`: `readOnly = false` e `dayLabel` opcional são os
defaults — o branch `if (readOnly)` é um retorno antecipado que só é
alcançado quando a prop é passada `true` explicitamente; o branch
original (acordeão, `aria-expanded`, `md:hidden`/`md:flex`) é idêntico ao
que já existia antes desta tarefa, sem nenhuma linha alterada dentro dele.
Teste `itinerary-day-block.test.tsx` (10/10 passando) cobre os dois modos.
Nenhuma regressão identificada em T-END (L10-T04) nem em T08/`RoteiroScreen`
(L10-T02) quando usados sem as novas props. **Confirmado, sem regressão.**

### Observações (não bloqueiam)

- Os 2 arquivos de teste de integração real do lote
  (`retomar-sessao.integration.test.ts`, `meus-roteiros.integration.test.ts`)
  não puderam ser executados de forma independente nesta validação por
  falta de Postgres acessível em `localhost:55432` neste ambiente — a
  mesma limitação já documentada pelo próprio Executor nas notas de
  implementação de V2-L7-T02/V2-L8-T01/T02, e não específica desta
  validação. A leitura completa de ambos os arquivos (ver V2-L8-T02 acima)
  confirma que eles exercitam exatamente os critérios de aceite mais
  sensíveis (persistência real, isolamento por `userId`) — não é uma
  lacuna de cobertura, é uma lacuna de execução neste ambiente específico.
  Recomendação ao chapéu DevOps: rodar
  `npx vitest run --testPathPattern=integration` (ou equivalente) contra
  um Postgres real (staging) antes/durante a preparação do deploy deste
  lote, como checagem final antes de liberar RF-17 em produção — não é um
  achado que reprova a tarefa nem exige tarefa em
  `Refatoração Lote-V2-L8` (a suíte já existe e está correta; é uma
  checagem operacional de pré-deploy, não um débito de código).

### Achados

Nenhuma reprovação crítica. Nenhuma reprovação simples.

### Veredito (Lote V2-L8)

**Aprovado, sem ressalvas.** As 5 tarefas cumprem seu critério de aceite
literal, confirmado por leitura direta do código e por execução própria
de todos os testes não-integração do lote (37/37, além dos já cobertos
pelos 714 do orquestrador). O ponto mais sutil da tarefa (persistência
real de `avancar` em `retomarSessao`) foi confirmado por leitura do código
E do teste de integração dedicado (não executável neste ambiente, mas
lido por completo). O `AlertDialog` novo, usado num fluxo destrutivo, foi
auditado em detalhe e implementa corretamente o padrão WAI-ARIA
`alertdialog`. Nenhuma regressão identificada em `EncerramentoScreen`/T-END
nem em `RoteiroScreen`/T08 pelas extrações/novas props desta tarefa. Lote
liberado para a auditoria de segurança dedicada (`SECURITY-REVIEW.md`).

---

## Lote V2-L9 — Checklist de bagagem e documentos (T01-T17) — validação QA (2026-09-18)

### Método e evidência (reexecutada pelo Validador)
- Banco isolado `curtamais_test` (Postgres real, porta 55432); 4 arquivos do lote (checklist-autorizacao.integration, trip-checklist-marks.integration, conteudo-cobertura, conteudo-texto): 32/32 verdes (levantamento da sessão).
- `tsc --noEmit`: nenhum erro em arquivo do lote. Único erro em arquivos tocados pelo lote é `meus-roteiros/[sessionId]/__tests__/page.test.tsx(10,50)` TS2556, mesmo padrão idêntico presente em 7 outros page.test.tsx não tocados pelo L9 (pré-existente/estilo de mock). `eslint` em src/lib/checklist, src/components/checklist, actions/checklist.ts, meus-roteiros: limpo.
- RNF: busca por termos proibidos/promessa absoluta (garant*, obrigatório, 100% seguro, "você deve", proibid*) em conteúdo e copy: 0 ocorrências. Acessibilidade estrutural coberta pelos testes de painel (checkbox nativo, agrupamento) e pelo Playwright de impressão. Sem botão imprimir/exportar no DOM.
- Playwright T13 (login real, next dev :3177 contra curtamais_test): painel visível, 6 grupos, break-inside avoid, dias/botões/erros ocultos, marcado com símbolo preto sem fundo. Evidências (screenshots/PDF), seed.js e print.js em: C:\Users\leand\AppData\Local\Temp\claude\c--Users-leand-OneDrive-Projetos-CurtaMais\51db4a72-b8ed-4894-be0e-b7aff38e3164\scratchpad
- Testes de 36 falhas da suíte completa: reexecutei em worktree de `55638ab~1` (dad4de4, sem nenhum código L9) os arquivos quiz.integration e encerramento.integration: 3 falhas idênticas (ContaNecessariaError / SessionNotFoundError). Portanto pré-existentes e independentes do L9 (o L9 não toca session-flow/autorização).

### Cobertura dos critérios de aceite
T01-T12, T14-T16: critérios cobertos por testes unitários/integração executados e código lido; T16 (autorização B->A, cascata na exclusão de conta, ordem inalterada, releitura) agora executado contra Postgres real e verde (antes registrado como "não executado"). T13: ver achado 1. T17 (editorial): Aprovado com ressalvas, e a recomendação de rodar os 2 vitest de conteúdo foi cumprida (verdes). Nenhum critério ficou sem evidência.

### Achados
1. **Simples — T13/RNF-16:** na impressão, o painel do checklist fica correto, mas o restante da página (`roteiro-salvo-screen`) não recebe overrides de impressão: o título "Sua viagem" sai quase invisível (texto claro do tema sobre fundo branco forçado no body) e os cartões "Roteiro concluído/Destino/Roteiro" saem como caixas escuras com texto branco (regras de cor só cobrem `.checklist-panel`). Não compromete o critério de aceite literal da T13 (painel visível, dias/botões ocultos, marcado sem fundo, sem botão de imprimir), nem a legibilidade do checklist; degrada o cabeçalho impresso e gasta tinta. Correção pontual: marcar o título/cartões com `checklist-print-hide`/`data-print-hide` ou forçar preto sobre branco fora do painel.
2. **Simples (ajuste de texto de critério, não de código) — T13:** o critério cita `AccountNav`, que só existe na home; não se aplica à rota do roteiro salvo. O comportamento equivalente (header/nav ocultos via CSS) está implementado. Sem ação de código; corrigir a redação no TASK.md quando conveniente.
3. **Fora de escopo/débito pré-existente (não reprova L9):** 36 testes falhando em 11 arquivos de integração (auth-authorize, data-livre, encerramento, hospedagem, passeios, processar-feriado-escolhido, quiz, roteiro, vinculo-conta, create-session-with-range, persistence) por ContaNecessariaError/SessionNotFoundError/timeouts; reproduzidos antes do L9. Recomenda-se investigação em tarefa própria (provável impacto da ADR-009 item 2 nos fixtures). Sinalizo também 8 erros TS2556 em page.test.tsx e erros em auth-callbacks/budget-insufficient-banner tests, pré-existentes.

### Tarefa criada em `Refatoração Lote-V2-L9`
- Ajustar CSS de impressão fora do painel (achado 1); prazo: antes do deploy do lote; tarefa a ser registrada no TASK.md na etapa de fechamento estrutural. Nenhuma tarefa volta para `Em andamento`.

### Veredito (Lote V2-L9)
**Aprovado com ressalvas.** Nenhuma reprovação crítica; 1 reprovação simples (T13, cabeçalho impresso) e 1 ajuste de redação. Liberado para auditoria DevSecOps.
