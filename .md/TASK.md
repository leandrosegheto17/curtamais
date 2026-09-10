# TASK.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Coordenador (chapéu Tech Lead). Baseado em `SDD.md`, `UX-SPEC.md` (ambos
aprovados, 2026-09-07) e `PRD-TECNICO.md`. Decompõe as 4 camadas do SDD.md
(Apresentação, Orquestração de Sessão, Gateway de IA, Persistência) e as 9 telas
+ T-END do UX-SPEC.md em tarefas pequenas, agrupadas em 11 lotes, priorizando
granularidade fina para paralelismo real do Executor dentro de cada lote.

Autocheck mecânico de granularidade (tamanho-alvo ~1 dia-pessoa, não-mistura
tela/endpoint/regra de negócio/SQL, canário de ~300k tokens de contexto de
trabalho) foi rodado sobre a decomposição antes de publicar este documento — ver
Seção 6 para o registro de divisões feitas durante o autocheck.

## 1. Diretrizes de Implementação

Regras práticas extraídas dos 7 ADRs e do `SDD.md`/`UX-SPEC.md`, obrigatórias
para todo Executor, independentemente da tarefa:

1. **Fronteira do Gateway de IA (ADR-002/003/004, SDD §1)**: nenhuma tela ou
   Server Action fora do módulo `gateway-ia` chama o provider de LLM
   diretamente. Toda chamada passa pela interface interna do Gateway de IA.
2. **Saída estruturada obrigatória (ADR-002/003)**: toda resposta do provider é
   consumida via JSON mode/structured outputs com schema definido por etapa;
   proibido fazer parsing de texto livre de resposta de LLM.
3. **State machine é a única fonte de verdade (ADR-006)**: nenhuma escrita em
   `TripSession`/entidades filhas fora do Orquestrador de Sessão; nenhuma
   navegação client-side otimista entre etapas — toda transição depende de
   confirmação do servidor.
4. **RN-01 nunca é violado**: cada Server Action de tela resolve exatamente uma
   etapa; nenhuma resposta/tela combina duas etapas (destino, hospedagem,
   passeios, roteiro) simultaneamente.
5. **RN-04/RF-10.3**: orçamento insuficiente nunca desabilita botão de ação —
   `BudgetInsufficientBanner` é sempre não-bloqueante, em qualquer tela que o
   use.
6. **RNF-01/RN-05**: toda faixa de preço exibida usa o componente
   `PriceRangeBadge` — proibido renderizar preço fora dele.
7. **Retry único (ADR-004/RNF-05)**: no máximo uma tentativa automática
   adicional em falha de chamada ao provider; após isso, expor
   `ErrorRetryState` com CTA manual. Nunca implementar retry em loop.
8. **Observabilidade (SDD §5/§6)**: toda chamada ao provider de LLM é
   registrada em `LlmGenerationLog` (tokens, custo estimado, latência,
   retry_count, status) — nenhuma chamada "silenciosa".
9. **Segurança (SDD §7)**: segredos só via variável de ambiente/secrets
   manager da plataforma de deploy, nunca versionados; toda rota que lê/escreve
   `TripSession` valida que o cookie de sessão (ou `user_id` autenticado)
   corresponde ao dono do registro; todo campo de texto livre do usuário
   (orçamento, destino manual) é validado/sanitizado no servidor antes de
   compor prompt.
10. **Acessibilidade (UX-SPEC §5)**: WCAG AA é critério não negociável — toda
    tela nova implementa contraste mínimo, navegação por teclado, foco
    gerenciado na transição de etapa, e nenhuma informação de status só por
    cor. Nenhuma tarefa de tela é considerada concluída sem isso.
11. **Componentes compartilhados não são recriados localmente**: toda tela que
    depende de geração por LLM (T04/T06/T07/T08) reutiliza `LoadingStream`,
    `ErrorRetryState`, `EmptyState` e `PriceRangeBadge`/`SuggestionCard` do
    Lote 5 — proibido duplicar a lógica de estado em cada tela.
12. **Bibliotecas obrigatórias**: Next.js 14+ App Router, TypeScript, Prisma
    ORM sobre PostgreSQL, Tailwind CSS + shadcn/ui, NextAuth.js, SDK oficial da
    OpenAI. **Proibido**: `fetch` cru para a API da OpenAI fora do Gateway de
    IA; ORM alternativo a Prisma; CSS-in-JS fora de Tailwind/shadcn; qualquer
    chamada a segundo provider de LLM sem novo ADR (supersede de ADR-002/004).
13. **RN-06**: nenhuma tarefa expande o quiz guiado além das 4 perguntas de
    RF-03.1 sem nova rodada de validação de uso real — fora de escopo deste
    TASK.md.

## 2. Spikes Técnicos

| ID | Spike | Motivo | Bloqueia | Prazo sugerido | Status |
|---|---|---|---|---|---|
| SPIKE-01 | Viabilidade de streaming de resposta LLM via Next.js Server Actions vs. Route Handler com `ReadableStream` (RNF-02, SDD §2/§3) | Server Actions têm suporte a streaming token-a-token menos maduro/documentado que Route Handlers; a meta de p95 ≤ 8s com primeiro conteúdo perceptível em até 2s (SDD §6) depende de qual mecanismo é usado — decisão técnica de incerteza alta, não deve ser estimada com confiança sem spike | L3-T02 (prompt design), L5-T03 (`LoadingStream`) | Antes do início do Lote 3 | **Resolvido** (2026-09-09, Executor/BE) |
| SPIKE-02 | Estratégia de proximidade geográfica no roteiro (RF-08.2) sem API de mapas/geocoding real — o SDD.md não define fonte de dado de geolocalização; a ordenação por proximidade dependerá do conhecimento geral do LLM sobre o destino, não de coordenadas reais | Incerteza sobre qualidade de resultado sem validação empírica com o provider escolhido (ADR-002); risco de sequenciamento incoerente sem checagem prévia | L10-T01 (regra de geração do roteiro) | Antes do início do Lote 10 | Pendente |

Nenhuma tarefa de implementação bloqueada por spike recebe estimativa de
esforço até o spike ser resolvido (ver Seção 3, linhas correspondentes).

### Resolução do SPIKE-01 (2026-09-09, Executor/BE)

**Decisão: Route Handler (`app/api/.../route.ts`) retornando `ReadableStream`**,
consumido no client via `fetch` + `response.body.getReader()`, não Server
Actions. Justificativa: (1) Route Handlers dão controle direto sobre a
`Response`/`ReadableStream` do Web Streams API, sem camada extra de
serialização — Server Actions só suportam valor "streamable" via padrão
`createStreamableValue`/`readStreamableValue` do pacote `ai/rsc` (Vercel AI
SDK), uma dependência nova não coberta pela lista de bibliotecas obrigatórias
do item 12 desta Seção 1 e com maturidade documentada inferior num app Next
14.2.35 (não-canary); (2) a interface pública já existente do Gateway de IA
(`generateStructuredCompletion`, `src/lib/gateway-ia/index.ts`) usa
`client.chat.completions.parse` (SDK oficial OpenAI) e retorna o JSON já
completo — expor streaming exigirá uma variante que emita deltas de texto
brutos (ex. `client.chat.completions.stream(...)`) encapsulados num
`ReadableStream` por um Route Handler; isso é uma extensão natural da
fronteira do módulo (nova função exportada), não uma reescrita, e é o
mecanismo já validado neste spike; (3) meta de performance do SDD §6 (p95
≤ 8s, primeiro conteúdo perceptível em ≤ 2s): Route Handler não introduz
overhead de serialização RSC entre o primeiro chunk e o cliente — TTFB é
dominado só pela rede + tempo do provider até o primeiro token, confirmado
empiricamente no protótipo (curl local: TTFB ~0.96s vs. tempo total ~2.0s
para uma resposta simulada, mostrando entrega incremental real, não
bufferizada); (4) esforço de troca se o Next.js for atualizado depois
(RL1-T01, 14.2.35 → 16.x): Route Handlers + `Response`/`ReadableStream` são
API estável do App Router desde a introdução, sem sinalização de mudança
depreciada — risco de retrabalho no upgrade é baixo, ao contrário de uma
dependência adicional (`ai/rsc`) hoje classificada como experimental.

Protótipo mínimo funcional (não produtivo, não integra com o provider real):
- `src/lib/gateway-ia/streaming-spike/simulate-stream.ts` — constrói um
  `ReadableStream<Uint8Array>` que emite tokens de um texto fixo com delay
  configurável, simulando chegada gradual de conteúdo de LLM.
- `src/app/api/gateway-ia/streaming-spike/route.ts` — Route Handler GET que
  expõe o stream simulado; usa `export const dynamic = "force-dynamic"`
  (achado do spike: sem essa diretiva o Next.js 14 estatiza a rota em
  `next build` por não usar nenhuma API dinâmica, bufferizando o stream uma
  única vez em build-time e servindo sempre a mesma resposta pronta em
  produção — L3-T02 deve repetir essa diretiva em toda rota real de
  streaming do Gateway de IA).
- `src/lib/gateway-ia/streaming-spike/__tests__/simulate-stream.test.ts` —
  4 testes automatizados provando entrega incremental real (chunks chegando
  em timestamps diferentes, tanto no builder isolado quanto invocando a
  função `GET` da Route Handler diretamente).

`npm run lint`, `npm test` (76 testes, incluindo os 4 novos) e `npm run
build` passam sem regressão; `npm run build` confirma a rota como dinâmica
(`ƒ`), não estática (`○`).

Não implementado neste spike (fora de escopo, fica para L3-T02/L5-T03):
integração com `generateStructuredCompletion`/provider real, protocolo de
framing (texto puro vs. SSE `data:`/`event:` vs. patch incremental de JSON
estruturado), e o componente `LoadingStream` do lado do cliente.

## 3. Lista de Tarefas

Legenda de chapéu: **BE** = Backend, **FE** = Frontend. Este projeto não tem
app nativo — "mobile" é só responsividade web (FE), coberta dentro das
próprias tarefas de tela via Tailwind (SDD §3/UX-SPEC §6), não uma tarefa
separada.

### Lote 1 — Fundação de Infraestrutura e Persistência

**Status do lote: Validado** (2026-09-08, Validador — chapéus QA e
DevSecOps aprovaram; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`). Débito de
severidade média em dependências de terceiros registrado em
`Refatoração Lote-1` (RL1-T01), com prazo antes do primeiro deploy em
produção — não bloqueia o fechamento deste lote.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L1-T01 | Scaffold do projeto Next.js 14 (App Router, TS, Tailwind, shadcn/ui), lint/test/CI básico, configuração de env/secrets | BE+FE | 1 dia | — | — | Concluída | Projeto builda, lint/test rodam em CI, `.env.example` documentado, nenhum segredo versionado |
| L1-T02 | Migration Prisma do schema completo (ADR-005, SDD §5): `TripSession`, `DestinationApproval`, `AccommodationApproval`, `ActivityApproval`, `ItineraryItem`, `LlmGenerationLog` | BE | 1 dia | L1-T01 | — | Concluída | Migration aplicada em ambiente local, todos os campos/enums do SDD §5 presentes, campos opcionais realmente nullable |
| L1-T03 | Autenticação — NextAuth.js (conta opcional, e-mail/senha ou magic link) + sessão anônima via cookie httpOnly/secure (SDD §7) | BE | 1 dia | L1-T01, L1-T02 | — | Concluída | Usuário consegue navegar sem conta (cookie de sessão); criar conta associa `user_id`; sessão sobrevive a reload |

### Lote 2 — Módulo de Feriados (determinístico, ADR-007)

**Status do lote: Validado com ressalvas** (2026-09-08, Validador — chapéus
QA e DevSecOps aprovaram; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`). Achado
simples de cobertura de teste (guardrail automatizado de RNF-07 não cobre
`src/lib/actions/feriados.ts`) registrado em `Refatoração Lote-2` (RL2-T01)
— não bloqueia o fechamento deste lote; ambas as tarefas permanecem
`Concluída`.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L2-T01 | Cálculo determinístico de feriados nacionais BR (fixos+móveis) + cálculo de emenda com fim de semana adjacente (RF-02.2, RNF-07) | BE | 1 dia | L1-T01 | — | Concluída | Testes unitários cobrindo feriado em cada dia da semana; nenhuma chamada a LLM no caminho de cálculo |
| L2-T02 | Server Action `getFeriadosProlongados` — lista de feriados ano corrente + seguinte com emenda calculada (RF-02.1) | BE | 0.5 dia | L2-T01 | — | Concluída | Retorna lista ordenada por data, com emenda formatada, ano corrente e seguinte |

### Lote 3 — Gateway de IA

**Status do lote: Validado com ressalvas** (2026-09-09, Validador — chapéus QA e
DevSecOps aprovaram as 5 tarefas; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`).
Achado de severidade média (rate limiting não integrado à rota pública)
registrado em `Refatoração Lote-3` (RL3-T01), com prazo antes do primeiro
deploy que exponha a rota a tráfego público — não bloqueia o fechamento deste
lote.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L3-T01 | Client OpenAI GPT-4o-mini com JSON mode/structured outputs + interface interna abstrata do Gateway de IA (ADR-002) | BE | 1 dia | L1-T01, L1-T03 | L3-T05 | Concluída | Chamada de teste retorna JSON validado contra schema simples; API key só via env |
| L3-T02 | Prompt design + contexto acumulado por etapa (destino/hospedagem/passeios/roteiro) com JSON schema de saída por etapa (ADR-003); aplica o mecanismo de streaming decidido em SPIKE-01 (Route Handler + `ReadableStream`, ver Seção 2) | BE | 1 dia | L3-T01, SPIKE-01 (resolvido) | — | Concluída | Prompt de cada etapa documentado; schema de saída validado; mecanismo de streaming escolhido no spike aplicado |
| L3-T03 | Validação de plausibilidade de preço + grounding de data/calendário (ADR-003) | BE | 1 dia | L3-T02, L2-T01 | L3-T04 | Concluída | Resposta com preço fora de faixa plausível é rejeitada/reprocessada; datas geradas nunca conflitam com o range da sessão |
| L3-T04 | Retry único automático + tratamento de falha (timeout/erro/malformado) + escrita em `LlmGenerationLog` (ADR-004, RNF-05) | BE | 1 dia | L3-T02, L1-T02 | L3-T03 | Concluída | Falha simulada gera exatamente 1 retry automático; log gravado em sucesso e falha; erro exposto ao chamador após 2ª falha |
| L3-T05 | Rate limiting de chamadas ao Gateway de IA por sessão/IP (SDD §7) | BE | 0.5 dia | L3-T01 | L3-T02 | Concluída | Limite configurável; excesso retorna erro tratável, não exceção não capturada |

Nota de implementação L3-T01 (2026-09-09, Executor/BE): client OpenAI singleton
+ leitura de `OPENAI_API_KEY`/`OPENAI_MODEL` só via `process.env` em
`src/lib/gateway-ia/client.ts` (interno ao módulo, não exportado fora dele);
interface pública `generateStructuredCompletion` em `src/lib/gateway-ia/index.ts`,
usando `client.chat.completions.parse` + `zodResponseFormat` (SDK oficial da
OpenAI, `openai/helpers/zod`) — schema Zod por chamada, sem parsing de texto
livre; erros normalizados em `GatewayIaError`. Testes em
`src/lib/gateway-ia/__tests__/index.test.ts` (5 casos, SDK mockado via
`vi.mock("openai")`, sem chamada de rede real), cobrindo o critério de aceite
(JSON validado contra schema simples) e a regra "API key só via env". Dependências
novas adicionadas a `package.json`: `openai@^7.12.1`, `zod@^4.5.4`. Não
implementado nesta tarefa (fora de escopo, ver L3-T02/T03/T04/T05): prompt
por etapa, validação de plausibilidade de preço, retry/`LlmGenerationLog`,
rate limiting — pontos de extensão deixados explícitos no cabeçalho de
`src/lib/gateway-ia/index.ts`. `npm run lint`, `npm test` e `npm run build`
passam sem regressão.

Nota de implementação L3-T05 (2026-09-09, Executor/BE): contador em memória
por processo (janela fixa de 60s por chave) em
`src/lib/gateway-ia/rate-limit.ts` (`registerGatewayIaCall`), lendo o limite
de `AI_GATEWAY_RATE_LIMIT_PER_MINUTE` a cada chamada (já reservada em
`.env.example`, com default seguro de 10/min caso ausente/inválida) — sem
dependência de infraestrutura externa (Redis etc.), consistente com o
monólito único sem infra distribuída do MVP (SDD §1/§6). Guarda pública
`checkGatewayIaRateLimit(key)` adicionada em `src/lib/gateway-ia/index.ts`,
para ser chamada pelo Orquestrador de Sessão/Server Action da etapa ANTES de
`generateStructuredCompletion`; a composição da chave (sessão anônima
`anon_session_id`/`user_id`, ver `src/lib/anonymous-session.ts`, e/ou IP) fica
a critério do chamador — este módulo não lê cookie/IP diretamente, mantendo a
fronteira do Gateway de IA. Ao exceder o limite, lança `GatewayIaError` (o
mesmo tipo já usado em todo o módulo desde L3-T01), nunca uma exceção não
capturada. Testes em `src/lib/gateway-ia/__tests__/rate-limit.test.ts` (7
casos), cobrindo o critério de aceite: limite respeitado dentro da janela,
configurável via env, contadores independentes por chave, expiração de
janela, e excesso retornando erro tratável (`GatewayIaError`) tanto pelo
contador de baixo nível quanto pela guarda pública. `npm run lint` e
`npm test` passam sem regressão (72 testes no total).

Nota de implementação L3-T02 (2026-09-09, Executor/BE): schemas de saída por
etapa em `src/lib/gateway-ia/schemas.ts` (`destinoSugestoesSchema` — 2-4
destinos; `hospedagemOpcoesSchema` — exatamente 3 opções; `passeiosOpcoesSchema`
— lista com faixa de preço podendo ser 0; `roteiroEstruturadoSchema` — dias
com blocos manhã/tarde/noite), com campos espelhando o modelo de dados de
cada entidade filha (`prisma/schema.prisma`), consistente com ADR-003.
Prompt design por etapa em `src/lib/gateway-ia/prompts.ts`: `StageContext`
(contexto acumulado estruturado — datas, orçamento, destino/hospedagem/
passeios já aprovados quando aplicável) e 4 `buildXPrompt` (destino,
hospedagem, passeios, roteiro), cada um documentado no código e com
grounding de data corrente + range de datas (ADR-003); etapas que dependem
de uma decisão anterior (hospedagem precisa de destino aprovado; roteiro
precisa de destino e hospedagem) lançam erro explícito se chamadas sem essa
pré-condição, em vez de gerar conteúdo incoerente. `GATEWAY_IA_STAGES`
centraliza schema+prompt por etapa (`destino`/`hospedagem`/`passeios`/
`roteiro`), reexportado por `src/lib/gateway-ia/index.ts`.

Streaming (SPIKE-01 aplicado): `streamStructuredCompletion` em
`src/lib/gateway-ia/index.ts` usa `client.chat.completions.stream(...)` (SDK
oficial da OpenAI) com o mesmo `response_format`/`zodResponseFormat` de
`generateStructuredCompletion`, encapsulado num `ReadableStream<Uint8Array>`
que emite os deltas de `content.delta` incrementalmente e fecha ao receber
`finalChatCompletion()` (ou propaga `GatewayIaError` em recusa/erro do SDK);
`cancel()` do stream aborta o `chatStream` do SDK, evitando consumo órfão da
resposta do provider. Consumida por
`src/app/api/gateway-ia/[etapa]/route.ts` (`POST`, `export const dynamic =
"force-dynamic"` — mesmo achado do SPIKE-01 repetido aqui), que valida o
corpo da requisição contra `stageContextSchema`, resolve a etapa via
`GATEWAY_IA_STAGES`, e devolve a `Response` com o `ReadableStream` — nenhuma
chamada a `openai` fora do módulo `gateway-ia` (fronteira mantida).

Decisão de design registrada: esta rota recebe o contexto acumulado já
pronto no corpo da requisição (JSON), sem ler `TripSession` do banco nem
validar dono de sessão — o Orquestrador de Sessão (Lote 4) ainda não existe
neste ponto do projeto. A montagem do contexto a partir da sessão real e a
checagem de autorização de dono de registro (TASK.md Seção 1, item 9) ficam
para quem passar a chamar esta rota a partir de L7-T01/L8-T01/L9-T01/L10-T01
(ou de um guard equivalente a L11-T02). Rate limiting (L3-T05,
`checkGatewayIaRateLimit`) também não foi integrado nesta rota de propósito
(fora do escopo declarado desta tarefa) — a interface pública não foi
alterada, só ainda não há chamador aqui.

Testes: `src/lib/gateway-ia/__tests__/prompts.test.ts` (12 casos — prompt de
cada etapa a partir do contexto, incluindo erro de pré-condição e o caso
"orçamento não informado nunca bloqueia", RF-10.3), `schemas.test.ts` (13
casos — payload válido e inválido para as 4 etapas), `stream.test.ts` (4
casos — SDK mockado via `vi.mock("openai")`, entrega incremental real de
deltas, propagação de `GatewayIaError` em recusa/erro, abort no `cancel()`),
e `src/app/api/gateway-ia/[etapa]/__tests__/route.test.ts` (5 casos — 404 de
etapa desconhecida, 400 de contexto inválido/pré-condição não atendida, 200
com corpo entregue de forma incremental — chunks chegando em timestamps
diferentes, mesmo padrão de prova usado no SPIKE-01 —, e 502 em falha do
Gateway de IA). Fora de escopo desta tarefa (fica para L3-T03/L3-T04/
L7-T01/L8-T01/L9-T01/L10-T01): validação de plausibilidade de preço/
grounding de data (a validação em si, não só o dado no prompt), retry
automático e escrita em `LlmGenerationLog`, filtro/priorização de orçamento
sobre a saída, persistência das entidades filhas, e a integração real desta
rota com o Orquestrador de Sessão/autenticação/rate limiting. `npm run
lint`, `npm test` (110 testes no total) e `npm run build` passam sem
regressão; `npm run build` confirma `/api/gateway-ia/[etapa]` como rota
dinâmica (`ƒ`), não estática (`○`).

Nota de implementação L3-T03 (2026-09-09, Executor/BE): validação semântica
pós-schema em `src/lib/gateway-ia/validation.ts`, rodando sobre o `data` já
validado estruturalmente pelos schemas Zod de L3-T02 — integrada dentro de
`generateStructuredCompletion` (`src/lib/gateway-ia/index.ts`), logo após a
checagem de schema/recusa e antes de devolver o resultado ao chamador; uma
resposta reprovada nunca sai do módulo, sempre vira `GatewayIaError` (mesmo
tipo já usado desde L3-T01). A variante de streaming
(`streamStructuredCompletion`) continua sem essa validação, de propósito
(comentário já existente desde L3-T02: ela só entrega texto incremental para
percepção de progresso na UI; a etapa real usa `generateStructuredCompletion`
para a decisão de negócio).

Critério de plausibilidade de preço adotado (decisão de implementação desta
tarefa — não havia um valor numérico definido no SDD.md/PRD-TECNICO.md para
"faixa plausível", então a escala abaixo foi escolhida e documentada no
cabeçalho de `validation.ts`, dentro da margem de "detalhe de implementação"
do papel de Executor): (1) faixa invertida (`min > max`) é sempre rejeitada;
(2) nenhum valor pode exceder `MAX_PLAUSIBLE_PRICE_BRL` (R$ 1.000.000,
teto de sanidade por item de viagem individual do MVP); (3) faixa "zero-zero"
é rejeitada para destino/hospedagem (nunca são gratuitos por natureza) e para
passeio quando `gratuito !== true` (evita "preço zero quando não deveria");
(4) quando `min > 0`, a razão `max / min` não pode ultrapassar
`MAX_PLAUSIBLE_PRICE_RATIO` (20x), pegando "ordem de grandeza absurda" mesmo
dentro do teto absoluto (ex.: min=100/max=50000 tem ambos os valores plausíveis
isoladamente, mas a faixa entre eles não é uma faixa de preço real). Aplicado
às 3 etapas com preço na saída (`destino`/`hospedagem`/`passeios`,
`GATEWAY_IA_SCHEMA_NAMES`); a etapa `roteiro` não tem campo de preço, e
qualquer `schemaName` fora dessas 4 etapas conhecidas não sofre nenhuma
checagem (mantém `generateStructuredCompletion` agnóstico ao domínio para
outros usos, ex. os testes de L3-T01/T02 que usam schemas de teste
arbitrários).

Grounding de data/calendário: `validateDateGrounding` só se aplica à etapa
`roteiro` (única cuja saída tem datas concretas, `RoteiroEstruturado.dias[].data`)
— rejeita qualquer dia cuja data caia fora de
`[dateRangeStart, dateRangeEnd]` (inclusive) ou não seja interpretável como
`YYYY-MM-DD`. Como o range de datas não fazia parte de
`StructuredCompletionRequest` até agora, foi adicionado um campo opcional
`sessionDateRange` (mesmos valores de `StageContext.dateRangeStart/End`,
`./prompts.ts`) — opcional porque destino/hospedagem/passeios não geram data
na saída e continuam podendo chamar `generateStructuredCompletion` sem esse
campo. Um tipo próprio `SessionDateRange` foi criado em `validation.ts` (em
vez de importar `StageContext` de `prompts.ts`) para não criar um ciclo de
import, já que `prompts.ts` já importa `index.ts`.

Ajuste estrutural sem mudança de comportamento: `GatewayIaError` foi extraído
de `index.ts` para `src/lib/gateway-ia/errors.ts`, para permitir que
`validation.ts` reutilize o mesmo tipo sem criar um ciclo de import com
`index.ts` (que agora importa `validation.ts`); `index.ts` reexporta
`GatewayIaError` normalmente, então a API pública (`import { GatewayIaError }
from "@/lib/gateway-ia"`) não mudou.

Arquivos novos: `src/lib/gateway-ia/validation.ts`, `src/lib/gateway-ia/errors.ts`,
`src/lib/gateway-ia/__tests__/validation.test.ts`. Arquivos alterados:
`src/lib/gateway-ia/index.ts` (integração da validação + reexport de
`GatewayIaError`/tipos de validação + campo `sessionDateRange`),
`src/lib/gateway-ia/__tests__/index.test.ts` (4 casos novos de integração:
preço implausível rejeitado, preço plausível aceito, data fora do range
rejeitada, data dentro do range aceita — todos via
`generateStructuredCompletion` com SDK mockado), `src/lib/gateway-ia/schemas.ts`
(comentário de cabeçalho atualizado). Testes: `validation.test.ts` (18 casos —
plausibilidade de preço para as 3 etapas com preço, grounding de data para
roteiro, e `validateGatewayIaOutput` como ponto único) + 4 casos novos em
`index.test.ts` (total do módulo `gateway-ia` cobrindo o critério de aceite
desta tarefa). Fora de escopo desta tarefa (fica para L3-T04, não iniciada):
retry automático em cima de uma resposta reprovada por esta validação (hoje
propaga o erro na 1ª tentativa) e escrita em `LlmGenerationLog` — o ponto de
extensão para L3-T04 envolver `generateStructuredCompletion` (validação
incluída) num laço de 1 retry está documentado no comentário da própria
função. Também fora de escopo: persistência em `TripSession`/entidades
filhas (Orquestrador de Sessão, Lote 4, ainda não existe) e qualquer
integração desta validação com regras de negócio por etapa (L7-T01/L8-T01/
L9-T01/L10-T01, que ainda vão montar `sessionDateRange`/chamar
`generateStructuredCompletion` a partir de uma `TripSession` real). `npm run
lint`, `npm test` (132 testes no total) e `npm run build` passam sem
regressão.

Nota de implementação L3-T04 (2026-09-09, Executor/BE): retry único
automático (ADR-004/RNF-05) implementado como uma nova função pública
`generateStructuredCompletionWithRetry` em `src/lib/gateway-ia/index.ts`, que
envolve `generateStructuredCompletion` (já com a validação de schema + a
validação semântica de L3-T03) num laço com teto rígido de
`MAX_GATEWAY_IA_ADDITIONAL_RETRIES = 1` (nunca um loop): falha por qualquer
motivo (erro de rede/timeout do provider, resposta malformada/recusa, OU
rejeição por `validateGatewayIaOutput`) dispara exatamente 1 tentativa
adicional; se a 2ª também falhar, propaga `GatewayIaError` ao chamador.
`generateStructuredCompletion` foi mantida intocada como o "núcleo de uma
tentativa" — todos os testes/chamadores já existentes de L3-T01/T02/T03 que a
usam diretamente continuam funcionando sem retry/log, sem quebra de
contrato; `generateStructuredCompletionWithRetry` é o ponto de entrada que
L7-T01/L8-T01/L9-T01/L10-T01 devem usar a partir de agora.

Escrita em `LlmGenerationLog`: isolada em `src/lib/gateway-ia/generation-log.ts`
(`writeLlmGenerationLog`, único arquivo do módulo que toca o Prisma Client
diretamente, mesmo padrão de `rate-limit.ts`). Decisão de granularidade
(lacuna entre o enunciado da tarefa — "grave a cada chamada ao provider, cada
tentativa" — e o schema já migrado em L1-T02): `LlmGenerationLog.status`
(`LlmGenerationStatus`) só tem dois valores possíveis (`success` |
`failed_after_retry`) — não existe um terceiro estado para "esta tentativa
isolada falhou, mas ainda vai haver retry", e o enunciado da própria tarefa
proíbe inventar campo/valor fora do schema já migrado. Decisão tomada (dentro
da margem de "detalhe de implementação" do Executor, sem alterar o schema):
grava-se UMA linha por CHAMADA LÓGICA completa (a sequência inteira de até 2
tentativas feita por `generateStructuredCompletionWithRetry`), não uma linha
por tentativa HTTP crua — consistente com o nome do modelo ("LlmGenerationLog",
uma geração, não "LlmProviderCallLog") e com os dois status suportados; em
sucesso, `retryCount` registra quantas tentativas adicionais foram usadas (0
ou 1); em falha final, `status: "failed_after_retry"` e `retryCount: 1`. Isso
cumpre integralmente o critério de aceite ("log gravado em sucesso e falha")
sem inventar nada fora do schema — decisão documentada no cabeçalho de
`generation-log.ts` e sinalizada aqui por divergir da redação literal do item
3 do enunciado da tarefa.

Campos exatos gravados (batendo com `prisma/schema.prisma`, sem alterar o
schema): `sessionId` (obrigatório — `TripSession.id`, FK; adicionado como
novo campo obrigatório de `StructuredCompletionWithRetryRequest`, resolvido
pelo chamador, já que o Orquestrador de Sessão do Lote 4 ainda não existe),
`stage` (novo campo obrigatório também, mesmos valores de `GatewayIaStage`/
enum Prisma `LlmStage`), `provider` (constante `"openai"`, único provider do
ADR-002), `promptVersion` (reaproveita `schemaName` da chamada — não existe
mecanismo de versionamento semântico de prompt no projeto ainda; já
sinalizado como uso futuro no comentário de `GATEWAY_IA_SCHEMA_NAMES`,
`./schemas.ts` — decisão documentada, não inventa um novo conceito),
`tokensInput`/`tokensOutput` (de `result.usage`, ou `0` quando a chamada
falhou antes de retornar `usage` — o schema não aceita `null` nesses campos,
`Int` não anulável), `costEstimateUsd` (calculado, ver decisão de custo
abaixo), `latencyMs` (medido com `Date.now()` ao redor de TODA a chamada
lógica — desde antes da 1ª tentativa até o resultado final, somando o tempo
de eventual retry; ver correção abaixo), `retryCount` e `status` (ver acima).

Decisão de custo estimado (não há tabela de preços por token no
SDD.md/PRD-TECNICO.md): preço fixo por 1k tokens hardcoded em
`generation-log.ts` (`PRICE_PER_1K_INPUT_TOKENS_USD`/
`PRICE_PER_1K_OUTPUT_TOKENS_USD`), aproximado ao preço público do modelo
default do Gateway de IA (`gpt-4o-mini`, ADR-002) no momento desta
implementação — não é uma tabela multi-modelo nem busca preço em tempo real;
se `OPENAI_MODEL` mudar para um modelo com preço muito diferente, a
estimativa fica imprecisa (aceitável: é uma estimativa de observabilidade,
nunca uma fatura real; manter uma tabela de preços por modelo é fora de
escopo desta tarefa).

Falha ao gravar o log é tratada como não-fatal (try/catch em
`writeLlmGenerationLog`, nunca lança) — uma chamada que teve sucesso no
provider não é derrubada por indisponibilidade do banco — mas não é engolida
silenciosamente: como o projeto ainda não tem logger estruturado,
`console.error` é usado como mecanismo mínimo (coberto por teste dedicado).

Arquivos novos: `src/lib/gateway-ia/generation-log.ts`,
`src/lib/gateway-ia/__tests__/generation-log.test.ts`. Arquivos alterados:
`src/lib/gateway-ia/index.ts` (nova função pública
`generateStructuredCompletionWithRetry` + tipo
`StructuredCompletionWithRetryRequest`, comentários de cabeçalho atualizados
para refletir L3-T04 implementada). Testes: 5 casos novos em
`generation-log.test.ts` (sucesso de primeira sem retry; falha simulada gera
exatamente 1 retry automático com sucesso na 2ª tentativa — critério de
aceite; falha nas duas tentativas propaga `GatewayIaError` e grava log de
falha — critério de aceite; rejeição de `validateGatewayIaOutput`/L3-T03
também dispara o retry; falha ao gravar o log não derruba um resultado de
sucesso). SDK da OpenAI e Prisma Client mockados (`vi.mock`), sem chamada de
rede/banco real. `npm run lint`, `npm test` (137 testes no total) e `npm run
build` passam sem regressão.

Correção pós-revisão inline (2026-09-09, Executor/BE, achado do validador):
`startedAt` estava declarado DENTRO do laço `for` de
`generateStructuredCompletionWithRetry`, reiniciando a cada tentativa — isso
fazia `latencyMs` medir só a duração da ÚLTIMA tentativa, não da chamada
lógica inteira como o doc comment de `LlmGenerationLogInput.latencyMs`
(`generation-log.ts`) já prometia, subestimando a latência real registrada
sempre que havia retry. Corrigido movendo `startedAt = Date.now()` para
ANTES do laço `for` (uma única marcação por chamada lógica), em
`src/lib/gateway-ia/index.ts`. Nenhum teste precisou mudar (os existentes só
verificam `typeof logData.latencyMs === "number"`, não um valor exato).
`npm run lint`, `npm test` (137 testes, mesma contagem) e `npm run build`
reexecutados sem regressão após a correção.

Fora de escopo desta tarefa: qualquer integração real com o Orquestrador de
Sessão (Lote 4, ainda não existe) — `sessionId`/`stage` são hoje parâmetros
que só um teste ou uma futura L7-T01/L8-T01/L9-T01/L10-T01 vai preencher com
dados reais de uma `TripSession`; nenhuma tela/Server Action foi tocada;
`streamStructuredCompletion` continua sem retry/log, de propósito (só entrega
percepção de progresso, a decisão de negócio real usa a variante
não-streaming, ver comentário já existente no cabeçalho do arquivo desde
L3-T02).

### Lote 4 — Orquestração de Sessão e Regra de Orçamento

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L4-T01 | State machine server-side — estados e transições (ADR-006): `entrada_selecionada` → `destino_pendente/confirmado` → `hospedagem_pendente/aprovada` → `passeios_pendente/aprovados` → `roteiro_pendente/aprovado` → `concluida`, com `encerrada_parcial` a partir de qualquer etapa aprovada | BE | 1 dia | L1-T02 | — | Concluída | Transição inválida (pular etapa) é rejeitada; todos os estados do ADR-006 implementados |
| L4-T02 | Persistência de transição de etapa — aprovar/ajustar/encerrar grava `TripSession` + entidade filha correspondente (RF-09, RN-03) | BE | 1 dia | L4-T01, L1-T02 | L4-T03 | Concluída | Aprovar uma etapa persiste a entidade filha certa; encerrar em qualquer ponto preserva o já aprovado (RN-03) |
| L4-T03 | Regra RF-10 — filtro/priorização de orçamento nas sugestões e mensagem de "opção mais barata" quando fora da faixa (RF-10.1/.2/.3) | BE | 1 dia | L4-T01 | L4-T02 | Concluída | Com orçamento informado, sugestões fora da faixa não aparecem como prioritárias; sem opção na faixa, retorna a mais barata com flag de excedente; ausência de orçamento nunca bloqueia |

Nota de implementação L4-T01 (2026-09-09, Executor/BE): state machine pura do
Orquestrador de Sessão (ADR-006) implementada em novo módulo
`src/lib/session-flow/` (`state-machine.ts` + `errors.ts`, reexportados via
`index.ts`, mesmo padrão de fronteira de `src/lib/gateway-ia/index.ts`). Os 11
estados do ADR-006 (`entrada_selecionada`, `destino_pendente`,
`destino_confirmado`, `hospedagem_pendente`, `hospedagem_aprovada`,
`passeios_pendente`, `passeios_aprovados`, `roteiro_pendente`,
`roteiro_aprovado`, `concluida`, `encerrada_parcial`) foram modelados
literalmente com o vocabulário do ADR-006 (`.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`,
seção "Consequências") como um tipo TS autônomo (`SessionFlowState`), não como
enum do Prisma (ver bloqueio abaixo). Ações modeladas: `iniciar`, `aprovar`,
`ajustar` (regenera a sugestão pendente sem avançar, RF-05), `avancar`
(de uma etapa já aprovada/confirmada para a sugestão pendente da etapa
seguinte, ou para `concluida` a partir de `roteiro_aprovado`) e `encerrar`.
`transitionSessionFlow(estadoAtual, ação)` decide de forma pura o próximo
estado ou lança `InvalidTransitionError` (mesmo padrão de classe de erro
dedicada de `src/lib/gateway-ia/errors.ts`, com `currentState`/`action`
expostos para diagnóstico) — cobre explicitamente pular etapa (ex.: `aprovar`
a partir de `entrada_selecionada`, ou `avancar` a partir de um estado
`*_pendente` sem antes aprovar) e qualquer ação a partir de um estado
terminal (`concluida`/`encerrada_parcial`).

Interpretação adotada para `encerrada_parcial` (RN-03): o ADR-006 só diz
"a partir de qualquer etapa já aprovada", frase terse que por si só é
ambígua entre (a) só a partir dos estados cujo nome termina em
confirmado/aprovada(o)/aprovados, ou (b) a partir de qualquer estado em que
pelo menos uma etapa já tenha sido aprovada, mesmo que o estado atual seja um
`*_pendente` posterior (ex.: `hospedagem_pendente`, com destino já
confirmado mas hospedagem ainda não decidida). Adotada a leitura (b), apoiada
em RF-05.4 ("encerramento em QUALQUER etapa preservando o que já foi
aprovado") — a leitura (a) obrigaria o usuário a "recuar" para um estado
`*_confirmado`/`*_aprovada(o)` antes de poder encerrar, o que contradiz
"qualquer etapa". `encerrar` portanto é válido a partir de
`destino_confirmado`, `hospedagem_pendente`, `hospedagem_aprovada`,
`passeios_pendente`, `passeios_aprovados`, `roteiro_pendente` e
`roteiro_aprovado`; é rejeitado a partir de `entrada_selecionada`/
`destino_pendente` (nada aprovado ainda — esse caso é o conceito de sessão
"abandonada", `TripSessionStatus.abandoned`, fora do escopo desta state
machine) e a partir de estados já terminais. Esta é uma interpretação de
detalhe de implementação (desvio pequeno, documentado, não escalado), não uma
mudança de regra de negócio.

Bloqueio registrado (`.md/BLOCKERS.md`, Bloqueio 001, status Aberto,
escalado para o coordenador): o schema Prisma já migrado em L1-T02
(`prisma/schema.prisma`, enum `TripSessionStatus`) só cobre 4 valores
coarse-grained (`in_progress`/`partial`/`completed`/`abandoned` — mesmos 4
valores do diagrama em `SDD.md` Seção 5), sem nenhum enum/campo que cubra
literalmente os 11 estados granulares do ADR-006 acima. Como L4-T01 é
lógica pura, sem persistência, isso não bloqueou esta tarefa — mas bloqueia
preventivamente **L4-T02** (persistência da transição em `TripSession`),
que por isso foi marcada `Bloqueada` na tabela acima em vez de `Não
iniciada`: quem for iniciar L4-T02 precisa antes de uma decisão do
Coordenador sobre como o estado granular deste módulo é armazenado/derivado
em cima do schema já migrado (proposta do executor no próprio Bloqueio 001:
derivar o estado a partir de `entryPath` + presença das linhas de aprovação
+ `TripSessionStatus`, sem migração adicional — mas a decisão final não é do
Executor). L4-T03 (regra de orçamento, RF-10) não depende dessa decisão e
segue `Não iniciada` normalmente.

Resolução do Bloqueio 001 (2026-09-09, Coordenador): decisão de negócio já
tomada pelo usuário/orquestrador foi a opção (b) — alterar o schema Prisma,
não derivar o estado a partir de dados existentes. O Coordenador formalizou a
forma exata dessa alteração como **ADR-006, Adendo 1**
(`.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`): novo campo
`flowState` (coluna `flow_state`) em `TripSession`, tipado com novo enum
Prisma `SessionFlowState` (os mesmos 11 valores de `SESSION_FLOW_STATES`),
não-nullable, `@default(entrada_selecionada)`, coexistindo com
`TripSessionStatus` (que permanece para filtros administrativos e para o
estado `abandoned`, fora do vocabulário da state machine), sincronizado com
ele só nos dois terminais (`concluida` para `completed`, `encerrada_parcial`
para `partial`). `SDD.md` Seção 5 foi atualizada para refletir o novo campo.
L4-T02 foi reaberta como `Não iniciada` acima. **Importante para quem pegar
L4-T02**: este adendo especifica a forma do campo/enum — rodar `prisma
migrate dev`, gerar o client e escrever o código que lê/grava `flowState` a
cada transição continua sendo trabalho de implementação de L4-T02, não algo
já feito aqui. Bloqueio 001 marcado `Resolvido` em `.md/BLOCKERS.md`.

Arquivos novos: `src/lib/session-flow/state-machine.ts`,
`src/lib/session-flow/errors.ts`, `src/lib/session-flow/index.ts`,
`src/lib/session-flow/__tests__/state-machine.test.ts`, `.md/BLOCKERS.md`.
Nenhum arquivo existente foi alterado. Testes: 26 casos novos cobrindo os 11
estados exatos (nenhum nome divergente do ADR-006), estado inicial
(`entrada_selecionada`), a cadeia completa `iniciar → aprovar → avancar`
repetida por todas as etapas até `concluida`, `ajustar` em cada estado
`*_pendente` (permanece no mesmo estado), rejeição de pular etapa (`aprovar`/
`avancar` fora de ordem), rejeição de qualquer ação a partir de estado
terminal, a regra de `encerrada_parcial` (aceita nos 7 estados elegíveis,
rejeitada em `entrada_selecionada`/`destino_pendente`/estados terminais), e
que o erro carrega `currentState`/`action`. `npm run lint`, `npm test` (163
testes no total, 137 + 26 novos) e `npm run build` passam sem regressão.

Fora de escopo desta tarefa: qualquer escrita em `TripSession`/entidades
filhas (persistência real é L4-T02, hoje bloqueada pelo Bloqueio 001 acima);
regra de orçamento RF-10 (L4-T03); qualquer Server Action ou rota nova (esta
tarefa não expõe nenhum endpoint, `API-CONTRACT.yaml` não foi tocado, nada a
publicar); mapeamento do estado granular para `TripSessionStatus`/schema
Prisma (decisão do Coordenador, ver bloqueio).

Nota de implementação L4-T02 (2026-09-09, Executor/BE): resolvido o Bloqueio
001 conforme ADR-006 Adendo 1 (decisão do Coordenador/usuário, opção "b").

**Migration aplicada**: `prisma/migrations/20260909203030_l4_t02_flow_state/`
(`prisma migrate dev --name l4_t02_flow_state`), gerada contra o Postgres
local de desenvolvimento (`curtamais-postgres`, porta 55432, já em execução) e
rodada também pelo `npm run db:migrate` em CI (mesmo pipeline de L1-T02). Duas
mudanças de schema, exatamente como especificado no Adendo 1: (1) novo enum
`SessionFlowState` com os 11 valores literais de `SESSION_FLOW_STATES`
(`src/lib/session-flow/state-machine.ts`); (2) novo campo `TripSession.flowState`
(coluna `flow_state`), não-nullable, `@default(entrada_selecionada)`,
coexistindo com `TripSessionStatus`/`status` já existente (inalterado). Client
Prisma regenerado (`prisma generate`, parte do mesmo comando).

**Módulo de persistência**: `src/lib/session-flow/persistence.ts`, único ponto
autorizado a escrever em `TripSession`/entidades filhas (Diretriz de
Implementação 3), reexportado via `src/lib/session-flow/index.ts` (mesma
fronteira de `@/lib/session-flow`, nunca importar `./persistence` direto).
Função pública `applySessionFlowTransition({ sessionId, action, childData? })`:
dentro de uma única `prisma.$transaction`, (1) lê `flowState`/`status` atuais
da `TripSession` (`SessionNotFoundError` se não existir), (2) chama
`transitionSessionFlow` (L4-T01, lógica pura) para decidir/validar o próximo
estado — `InvalidTransitionError` propaga aqui, antes de qualquer escrita —,
(3) para `aprovar`, valida que `childData.stage` corresponde à etapa do
`flowState` atual (`destino_pendente`→`destino`,
`hospedagem_pendente`→`hospedagem`, `passeios_pendente`→`passeios`,
`roteiro_pendente`→`roteiro`); payload ausente/de etapa errada lança
`InvalidChildDataError` (novo, mesmo padrão de `InvalidTransitionError`),
também antes de qualquer escrita, (4) só então grava
`tx.tripSession.update` (`flowState` + `status` sincronizado nos terminais:
`concluida`→`completed`, `encerrada_parcial`→`partial`, conforme Adendo 1) e,
quando `aprovar`, `tx.<entidadeFilha>.create`/`createMany` com os dados do
chamador (`DestinationApproval` para destino, `AccommodationApproval` para
hospedagem, `ActivityApproval[]` para passeios, `ItineraryItem[]` para
roteiro). Duas novas classes de erro dedicadas em
`src/lib/session-flow/errors.ts`: `SessionNotFoundError`,
`InvalidChildDataError`.

**RN-03 (encerrar preserva o já aprovado)**: garantida estruturalmente — o
branch de criação de entidade filha só executa quando `action === "aprovar"`;
`encerrar` (e `iniciar`/`ajustar`/`avancar`) só tocam
`TripSession.flowState`/`status`, nunca `DestinationApproval`/
`AccommodationApproval`/`ActivityApproval`/`ItineraryItem`. Testado
explicitamente (aprovar destino → encerrar → `DestinationApproval` continua
existindo com os mesmos dados).

**Transição inválida não persiste nada**: toda a operação roda dentro de
`prisma.$transaction`; `InvalidTransitionError`/`InvalidChildDataError` são
lançados antes de qualquer `tx.tripSession.update`/`tx.<entidade>.create`, e
mesmo que um erro fosse lançado depois de alguma escrita dentro do callback, o
Prisma faz rollback automático da transação inteira — nenhum estado
parcialmente gravado é possível. Testado explicitamente (pular etapa a partir
de `entrada_selecionada`, e aprovar com `childData` de etapa errada) —
`flowState`/`status` permanecem inalterados e nenhuma linha de entidade filha
é criada.

**Testes**: `src/lib/session-flow/__tests__/persistence.integration.test.ts`,
9 casos novos de integração real contra o Postgres de desenvolvimento (mesmo
padrão de `prisma/__tests__/schema.integration.test.ts`/
`src/lib/__tests__/user-account.integration.test.ts`, escolhido em vez de
mock porque o próprio objetivo é provar que a migration funciona de ponta a
ponta): estado inicial (`entrada_selecionada`/`in_progress`); `iniciar` avança
sem tocar `status`/entidade filha; aprovar destino/hospedagem/passeios(2
itens)/roteiro persistem a entidade filha certa e avançam `flowState`;
aprovar roteiro seguido de `avancar` marca `concluida`/`status=completed`;
RN-03 (encerrar preserva `DestinationApproval`); transição inválida (pular
etapa) não persiste nada; `aprovar` com `childData` de etapa errada não
persiste nada. `npm run lint`, `npm test` (**172 testes no total, 163 + 9
novos**) e `npm run build` passam sem regressão.

Arquivos novos: `prisma/migrations/20260909203030_l4_t02_flow_state/migration.sql`,
`src/lib/session-flow/persistence.ts`,
`src/lib/session-flow/__tests__/persistence.integration.test.ts`. Arquivos
alterados: `prisma/schema.prisma` (enum `SessionFlowState` + campo
`TripSession.flowState`), `src/lib/session-flow/errors.ts`
(`SessionNotFoundError`, `InvalidChildDataError`), `src/lib/session-flow/index.ts`
(reexporta a nova fronteira pública de persistência).

Fora de escopo desta tarefa (mantido para as tarefas futuras que já dependem
de L4-T02 na tabela acima): Server Actions de tela (L6-T03/T05/T07,
L7-T03/T05, L8-T03, L9-T03, L10-T03) — `applySessionFlowTransition` está
pronto para ser chamado por elas, mas nenhuma rota/Server Action nova foi
criada aqui, e `API-CONTRACT.yaml` não foi tocado; regra de orçamento RF-10
(L4-T03); autorização cross-cutting de dono de sessão (L11-T02) — este módulo
recebe `sessionId` já resolvido pelo chamador, sem checar dono do registro.

Nota de implementação L4-T03 (2026-09-09, Executor/BE): implementada a regra
RF-10 (RF-10.1/.2/.3, RN-04) como função pura, sem I/O, em
`src/lib/session-flow/budget-filter.ts` — mesmo diretório de `state-machine.ts`/
`persistence.ts` (não um módulo novo separado), reexportada via
`src/lib/session-flow/index.ts` (única fronteira pública, `@/lib/session-flow`).
Localização escolhida por dois motivos: (1) o próprio `index.ts` já
sinalizava, desde L4-T02, que L4-T03 seria a próxima tarefa a estender este
diretório; (2) apesar de a regra ser ortogonal à state machine em si (função
pura, sem `flowState`/persistência), ela pertence à mesma camada de
Orquestração de Sessão do SDD.md, e mantê-la junto evita um módulo extra sem
ganho de coesão. Não integra com a state machine nem com persistência —
recebe apenas `sugestões[]` + `orçamento?`, nunca `sessionId`/Prisma.

**Formato do orçamento**: teto único (`{ amount: number }`), não uma faixa
min/max — espelha o único campo de orçamento persistido em
`TripSession.budgetAmount` (`Decimal? @map("budget_amount")`,
`prisma/schema.prisma`). RF-03.1(4) coleta o valor como "texto livre em faixa
de valor" na pergunta do quiz, mas essa normalização para um teto único já é
resolvida antes de chegar aqui (fora do escopo desta tarefa, que só consome
`TripSession.budgetAmount` já resolvido); RF-10 não se aplica a roteiro
(RF-08) — confirmado no PRD-TECNICO.md e no `roteiroEstruturadoSchema`
(`src/lib/gateway-ia/schemas.ts`): a etapa de roteiro não tem faixa de preço
própria.

**Critério de "dentro do orçamento"**: `precoMin` da sugestão `<=` teto
informado (a opção é alcançável a partir do seu preço de entrada, mesmo que
`precoMax` ultrapasse o teto — faixas são sempre aproximadas, RN-05).

**Interpretação adotada para "fora da faixa não aparece como prioritária"**
(redação do critério de aceite desta linha da tabela): **reordenação, não
remoção**. `applyBudgetFilter` sempre devolve a lista completa (mesmo
tamanho de entrada), com as sugestões dentro do orçamento primeiro (ordem
estável dentro de cada grupo) e as fora do orçamento depois, nunca removidas.
Justificativa a partir do texto de RF-10 no `PRD-TECNICO.md`: (1) RF-10.1 diz
"priorizar/filtrar" — verbo duplo e ambíguo, mas o critério de aceite desta
tarefa usa literalmente "não aparecem como prioritárias", que é uma
constatação de posição, não de ausência; (2) RN-04 exige que orçamento "nunca
bloqueia o fluxo — funciona só como filtro/priorização, nunca como
impeditivo de avançar" — remover opções reduziria as alternativas
disponíveis ao usuário sem necessidade textual explícita para isso, o que se
aproxima de um bloqueio parcial não previsto; (3) RF-10.2 já cobre
explicitamente o único cenário em que uma sugestão fora da faixa precisa de
tratamento diferenciado (nenhuma dentro da faixa) — não havia necessidade
adicional de remoção quando já existe ao menos uma opção dentro dela. Quando
NENHUMA sugestão cabe no orçamento (RF-10.2), a mais barata (menor
`precoMin`) é reordenada para o topo da lista com `exceedsBudget: true`; as
demais seguem depois com a flag em `false` — nunca lança erro, nunca retorna
lista vazia (edge case de lista de entrada vazia devolve `[]`, sem erro).
Ausência de orçamento (`null`/`undefined`) é no-op puro: mesma lista, mesma
ordem, `withinBudget: true`/`exceedsBudget: false` em todas.

**Testes**: `src/lib/session-flow/__tests__/budget-filter.test.ts`, 8 casos
novos (unitários, sem banco/Gateway de IA): sem orçamento (undefined/null)
devolve lista inalterada; mistura dentro/fora reordena com as de dentro
primeiro e ordem estável em cada grupo; nenhuma opção na faixa retorna a mais
barata primeiro com `exceedsBudget: true` e nunca lista vazia/erro; lista de
entrada vazia; `precoMin` exatamente igual ao teto conta como dentro do
orçamento. `npm run lint`, `npm test` (**180 testes no total, 172 + 8
novos**) e `npm run build` passam sem regressão.

Arquivos novos: `src/lib/session-flow/budget-filter.ts`,
`src/lib/session-flow/__tests__/budget-filter.test.ts`. Arquivo alterado:
`src/lib/session-flow/index.ts` (reexporta `applyBudgetFilter` e os tipos
`PriceRangedSuggestion`/`BudgetInput`/`BudgetFilteredSuggestion`).

Fora de escopo desta tarefa (mantido para as tarefas futuras que já dependem
de L4-T03 na tabela acima): geração das sugestões em si via Gateway de IA
(L7-T01/L8-T01/L9-T01, Lotes 7/8/9, ainda não iniciados) — esta tarefa só
implementa a função de filtro/priorização que essas tarefas vão chamar sobre
a lista já gerada pelo LLM; componentes de UI `BudgetInsufficientBanner`/
`PriceRangeBadge` (Lote 5, Design System, também ainda não iniciado) — o
campo `exceedsBudget` desta tarefa é o dado que essas telas vão consumir para
decidir quando exibir o banner, mas nenhum componente foi criado aqui.

### Lote 5 — Design System Base (componentes compartilhados)

**Status do lote: Validado com ressalvas** (2026-09-09, Validador —
chapéus QA e DevSecOps aprovaram; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`).
Dois achados simples (inconsistência de cor entre `manifest.webmanifest`
e o token `--background` de L5-T01; robustez de acessibilidade — `title`
vs. texto `sr-only` — em `StepperProgress`) registrados em
`Refatoração Lote-5` (RL5-T01/RL5-T02), sem prazo crítico — não bloqueiam
o fechamento deste lote; todas as 5 tarefas permanecem `Concluída`.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L5-T01 | Tokens visuais (paleta, tipografia, Tailwind config) + `StepperProgress` (UX-SPEC §3) | FE | 1 dia | L1-T01 | — | Concluída | Paleta semântica (sucesso/atenção/erro) definida; `StepperProgress` reflete estado vindo do servidor, nunca client-only |
| L5-T02 | `PriceRangeBadge` + `BudgetInsufficientBanner` (UX-SPEC §3/§4) | FE | 0.5 dia | L5-T01 | L5-T03, L5-T05 | Concluída | Badge sempre com ícone + texto "aproximado"; banner nunca desabilita botões da tela |
| L5-T03 | `LoadingStream` + `ErrorRetryState` + `EmptyState` (UX-SPEC §3/§4); `LoadingStream` consome o stream via `fetch` + `ReadableStream.getReader()` (mecanismo decidido em SPIKE-01, ver Seção 2) | FE | 1 dia | L5-T01, SPIKE-01 (resolvido) | L5-T02, L5-T05 | Concluída | `LoadingStream` renderiza conteúdo progressivo real (não spinner genérico) conforme mecanismo escolhido no spike; `aria-live="polite"` presente |
| L5-T04 | `SuggestionCard` (base para T04/T06/T07) | FE | 1 dia | L5-T01, L5-T02 | — | Concluída | Estrutura visual idêntica entre os 3 usos, conteúdo variável, acessível por teclado |
| L5-T05 | PWA — Web App Manifest + Service Worker (ADR-001, RNF-04) | FE | 1 dia | L1-T01 | L5-T02, L5-T03 | Concluída | App instalável; assets estáticos em cache; funciona offline apenas para shell da UI, não para geração de conteúdo |

### Nota de implementação L5-T01 (2026-09-09, Executor/FE)

- **Tokens visuais** ("Concierge Noturno", UX-SPEC.md Seção 3), implementados
  em cima da convenção shadcn/ui já existente do scaffold (CSS variables HSL
  em `@layer base`), sem sistema paralelo:
  - `src/app/globals.css` — valores de `:root` (e `.dark`, mantido idêntico a
    `:root` só por compatibilidade com `darkMode: ["class"]`, já que o produto
    tem um único tema, não claro/escuro alternável) recalibrados para o tema
    escuro: `background`/`surface`/`foreground`/`foreground-muted` (tokens
    citados nominalmente pelo UX-SPEC), mais `primary`/`accent` (dourado/
    champagne, CTA principal + linha do `StepperProgress`) e a paleta
    semântica `success`/`warning`/`error` (mantendo `destructive` como alias
    de `error` para não quebrar nada que já use a convenção shadcn padrão).
  - `tailwind.config.ts` — expõe `surface`, `foreground.muted`, `success`,
    `warning`, `error` como cores Tailwind (`bg-surface`, `text-foreground-muted`
    etc.), e `fontFamily.serif`/`fontFamily.sans` para o par tipográfico
    exigido pelo UX-SPEC (serifada para títulos, sans para corpo de texto);
    **fora de escopo desta tarefa**: carregar as fontes de referência do
    UX-SPEC ("Cormorant Garamond"/"Work Sans") via `next/font` — só a pilha de
    fallback foi configurada, carregamento real de fonte fica para quando uma
    tela real (Lote 6+) precisar renderizar texto de verdade.
  - Todos os pares texto/fundo escolhidos foram checados contra WCAG AA (4.5:1)
    com um script Node ad-hoc usando a fórmula de luminância relativa do WCAG
    (não versionado, só usado para calibrar os valores hex de referência
    citados nos comentários do `globals.css`): `foreground`/`background`
    18.96:1, `foreground-muted`/`surface` 6.91:1, `accent`(texto)/`background`
    9.56:1, `accent-foreground`/`accent` 8.75:1, `success`/`surface` 10.44:1,
    `warning`/`surface` 9.25:1, `error`/`surface` 7.70:1 — todos folgados acima
    do mínimo de 4.5:1.
- **`StepperProgress`** — `src/components/design-system/stepper-progress.tsx`
  (novo diretório `src/components/design-system/`, reservado para os demais
  componentes compartilhados do Lote 5). Componente controlado: recebe
  `currentState: SessionFlowState` (o mesmo tipo de `src/lib/session-flow/
  state-machine.ts`, L4-T01) via prop, nunca gerencia navegação sozinho.
  Função pura exportada `getStepperStepStatuses` mapeia os 11 estados
  internos da state machine para as 4 etapas visuais do UX-SPEC (destino →
  hospedagem → passeios → roteiro): assim que uma etapa é aprovada/confirmada,
  ela aparece `completed` e a próxima já aparece `current` (documentado em
  comentário no próprio arquivo, decisão de detalhe não explicitada pelo
  UX-SPEC.md). Caso especial documentado: `encerrada_parcial` é um único
  estado terminal usado a partir de qualquer ponto com ao menos uma etapa
  aprovada (RN-03) — sozinho não carrega quantas etapas foram aprovadas antes
  do encerramento (essa informação vive nas entidades filhas persistidas, fora
  desta state machine pura). Resolvido com um prop opcional
  `approvedStepsHint` para quando o chamador já sabe (ex.: tela T-END lendo os
  registros reais); sem o hint, renderiza todas as etapas como `upcoming` —
  decisão pequena de implementação, não uma lacuna do UX-SPEC.md resolvida
  arbitrariamente, já que nenhuma tela real usa esse caminho ainda (Lote 5 não
  integra com backend). Responsivo conforme UX-SPEC §6: indicador condensado
  (pontos + rótulo da etapa atual) abaixo de `md`, trilha horizontal completa
  com nome de todas as etapas a partir de `md`, via classes Tailwind
  (`hidden`/`md:flex`), sem JS de media query. Acessibilidade (UX-SPEC §5):
  `aria-current="step"` na etapa ativa; nenhuma etapa comunicada só por cor —
  cada bolinha tem `title` textual (Etapa concluída/atual/futura) além de
  ícone (`Check` do `lucide-react`, já dependência do projeto) e cor; sem
  elemento focável, por decisão registrada no próprio componente (o stepper é
  informativo — nenhuma tela do UX-SPEC.md navega por clique nele, o avanço
  sempre acontece pelos botões de ação de cada etapa), o que já satisfaz
  "navegação por teclado" ao não introduzir nenhum elemento fora de ordem de
  tab.
- **Testes**: `src/components/design-system/__tests__/stepper-progress.test.tsx`
  (18 casos) — cobre o mapa puro `getStepperStepStatuses` para os 11 estados
  (incluindo os dois caminhos de `encerrada_parcial`, com e sem hint), que o
  componente é controlado (mesma prop → mesmo markup; nenhuma mudança sem
  nova prop), `aria-current` presente só na etapa ativa, todas as 4 etapas
  rotuladas na trilha completa, ausência de elementos focáveis, e presença de
  indicador textual (`title`) além de cor/ícone.
- **Fora de escopo desta tarefa** (fica para as próximas do Lote 5):
  `PriceRangeBadge`/`BudgetInsufficientBanner` (L5-T02), `LoadingStream`/
  `ErrorRetryState`/`EmptyState` (L5-T03), `SuggestionCard` (L5-T04); nenhuma
  tela real (Lote 6+) foi tocada; carregamento real das fontes via `next/font`
  (ver acima).
- `npm run lint`, `npm test` (208 testes no momento desta tarefa — 180 antes
  + 18 novos deste componente + 10 de outra tarefa em andamento em paralelo no
  mesmo lote, provavelmente L5-T05/rotas relacionadas, não gerenciado por esta
  instância) e `npm run build` passam sem regressão.

### Nota de implementação L5-T02 (2026-09-09, Executor/FE)

- **`PriceRangeBadge`**: `src/components/design-system/price-range-badge.tsx`
  (novo). Formato de faixa de preço aceito (decisão de design desta tarefa,
  documentada no cabeçalho do arquivo): props normalizadas `min`/`max`
  (mais `free?`/`unitLabel?`), NÃO os nomes de campo específicos por etapa do
  Gateway de IA (`faixaPrecoMin`/`Max` em destino, `precoPorDiariaMin`/`Max`
  em hospedagem, `precoMin`/`Max` em passeios, `src/lib/gateway-ia/
  schemas.ts`) — cada tela chamadora (Lote 7/8/9, ainda não implementadas)
  mapeia o campo do seu schema para essa forma normalizada antes de passar
  como prop, evitando acoplar um componente de design system a um contrato
  de LLM que varia por etapa. Sempre renderiza ícone (`Tag`, `lucide-react`)
  + texto junto ao valor; para faixa normal, o texto sempre termina em
  "(aproximado)" (RNF-01/RN-05, nunca omitido); `unitLabel` opcional insere
  contexto de unidade antes do rótulo (ex. "por diária", UX-SPEC T06) sem
  removê-lo. Formatação em BRL via `Intl.NumberFormat` (`pt-BR`/`BRL`, sem
  casas decimais).
  - **Caso gratuito (RF-07.2)**: tratado como "Gratuito" (sem "R$ 0,00" nem
    "aproximado", que não fariam sentido para preço zero) — confirmado no
    UX-SPEC.md Seção 2 (T07: "badge especial 'Gratuito' quando price = 0").
    O componente aceita um prop explícito `free` (o schema de passeios já
    carrega esse sinal via campo `gratuito`, mais confiável que inferir de
    `min === 0 && max === 0`) e, como salvaguarda, também trata
    `min === 0 && max === 0` como gratuito mesmo sem o prop explícito (evita
    "R$ 0,00 – R$ 0,00 (aproximado)" caso um chamador futuro não repasse
    `free`).
- **`BudgetInsufficientBanner`**: `src/components/design-system/
  budget-insufficient-banner.tsx` (novo). Prop única de controle `show`
  (booleana, equivalente ao `exceedsBudget` de `BudgetFilteredSuggestion`,
  `src/lib/session-flow/budget-filter.ts`/L4-T03) — quando `false`, o
  componente não renderiza nada; quando `true`, exibe `role="status"` com
  ícone de atenção (`AlertTriangle`) + a mensagem de RF-10.2/UX-SPEC Seção 4
  ("Não encontramos opções dentro do valor informado — mostrando a opção
  mais barata disponível, que excede o orçamento..."), com `differenceLabel`
  opcional para compor a cláusula "...em [diferença]" quando o chamador já
  tiver esse texto calculado. RN-04 garantido estruturalmente, não só por
  convenção: o componente não aceita nenhuma prop capaz de afetar um
  elemento irmão (contrato de props é só `show`/`differenceLabel`/
  `className`) e não toca em nada fora do próprio `<div>` que renderiza —
  não há `onDismiss` bloqueante nem qualquer mecanismo de "travar CTA".
  Integração real com `applyBudgetFilter`/uma `TripSession` de verdade fica
  para as telas do Lote 7/8/9 (fora de escopo desta tarefa, conforme
  enunciado) — este componente só recebe a prop já resolvida.
- **Testes**: `src/components/design-system/__tests__/price-range-badge.test.tsx`
  (9 casos — ícone+"aproximado" sempre presentes em faixa normal, formatação
  BRL min≠max e min=max, `unitLabel`, caso gratuito explícito e inferido sem
  "R$"/"aproximado", ícone presente também no caso gratuito, `free={false}`
  não força o caso gratuito) e `src/components/design-system/__tests__/
  budget-insufficient-banner.test.tsx` (7 casos — não renderiza com
  `show=false`, mensagem exibida com `show=true`, `differenceLabel` composto
  na mensagem, ícone sempre presente, `role="status"`, e o teste central do
  critério de aceite RN-04: um botão de exemplo ("Aprovar") renderizado ao
  lado do banner permanece `toBeEnabled()` tanto com `show=false` quanto com
  `show=true`, mais um teste documentando que o contrato de props do
  componente não inclui nenhuma prop de desabilitar elementos irmãos).
- **Fora de escopo desta tarefa** (fica para tarefas futuras): integração
  real com `applyBudgetFilter`/`TripSession` (Lote 7/8/9), qualquer tela real
  (`SuggestionCard`/L5-T04 e as telas T04/T06/T07 em si), `LoadingStream`/
  `ErrorRetryState`/`EmptyState` (L5-T03, em paralelo).
- `npm run lint`, `npm test` (224 testes no momento desta tarefa — 208 já
  presentes antes desta tarefa, conforme nota de L5-T01, + 16 novos aqui;
  número final do Lote 5 pode divergir do observado nesta execução isolada,
  já que L5-T03 roda em paralelo no mesmo lote) e `npm run build` passam sem
  regressão.

### Nota de implementação L5-T03 (2026-09-09, Executor/FE)

- **`LoadingStream`**: `src/components/design-system/loading-stream.tsx`
  (novo). Consome exatamente o mecanismo decidido em SPIKE-01 (TASK.md Seção
  2): `fetch(input, { ...init, signal })` seguido de
  `response.body.getReader()`, decodificando os chunks com `TextDecoder`
  (`{ stream: true }`) — nenhum uso de Server Actions/`ai/rsc`. Formato de
  resposta esperado é o mesmo já publicado por `src/app/api/gateway-ia/[etapa]/
  route.ts` (L3-T02): `ReadableStream<Uint8Array>` de texto puro (deltas de
  `content.delta`), sem framing SSE, então a decodificação aqui é direta
  (`decoder.decode(chunk)`, sem parser de evento).
  - **Interface escolhida**: props `input`/`init` espelhando a assinatura de
    `fetch` (em vez de receber uma `Response`/`Promise<Response>` já pronta),
    porque o componente precisa poder reiniciar a chamada sozinho (ex.: se o
    chamador trocar `input`/`init` — novo `sessionId`/etapa) e também precisa
    poder abortar a requisição no unmount (`AbortController`); receber uma
    `Response` já em andamento não permitiria nenhuma das duas coisas. Prop
    extra `fetchImpl` (só para teste) evita mutar `globalThis.fetch` nos
    testes automatizados.
  - **Estados internos**: `connecting` (skeleton de blocos tom `surface`
    sobre `background`, sem sombra, UX-SPEC §4) → `streaming` (texto
    acumulado renderizado progressivamente, com um cursor `▍` piscando via
    `animate-pulse`) → `done` (mesmo texto, sem cursor) → `error` (mensagem
    mínima interna, só como fallback defensivo).
  - **Acessibilidade**: `aria-live="polite"` numa única região que cobre o
    rótulo inicial (`label`, ex. "Gerando sugestões de destino") e o texto
    chegando incrementalmente (UX-SPEC §5, critério de aceite desta tarefa);
    `aria-busy` reflete se ainda há streaming em andamento. Trade-off
    documentado no próprio arquivo: leitores de tela reais podem re-anunciar
    o bloco inteiro a cada novo chunk (não só o delta) — o UX-SPEC.md exige
    literalmente `aria-live="polite"` nesta região sem detalhar granularidade
    de anúncio, e nenhuma tela real usa este componente ainda para validar
    isso com um leitor de tela de verdade; não é uma lacuna resolvida
    arbitrariamente, é o limite do que dá para verificar nesta tarefa.
  - **Escopo explícito NÃO coberto aqui** (decisão de design, documentada no
    cabeçalho do arquivo): o componente exibe o texto bruto do stream dentro
    de um bloco `surface` — ele não sabe mapear o JSON estruturado final para
    os blocos visuais de destino/hospedagem/passeios/roteiro (isso é das
    telas reais do Lote 7-10 e de `SuggestionCard`/L5-T04, nenhuma tocada
    aqui); não faz retry automático (o retry único do ADR-004 já acontece no
    servidor, L3-T04) — em erro, só chama `onStreamError` e para, cabendo à
    tela trocar para `ErrorRetryState`.
- **`ErrorRetryState`**: `src/components/design-system/error-retry-state.tsx`
  (novo). Apresentação pura: props `message`/`onRetry`/`retryLabel?`; o clique
  no botão (`Button` de `src/components/ui/button.tsx`, `variant="outline"`)
  só chama `onRetry` — nenhuma lógica de contagem de tentativa/retry
  automático aqui, consistente com a Diretriz de Implementação 7 do TASK.md
  ("no máximo uma tentativa automática... nunca implementar retry em loop"),
  que já é responsabilidade do Gateway de IA (L3-T04). `role="alert"` (em vez
  de um `aria-live="polite"` manual) para anúncio imediato do erro, ícone
  (`AlertTriangle`, `lucide-react`) + texto, nunca só cor/borda (UX-SPEC §5).
- **`EmptyState`**: `src/components/design-system/empty-state.tsx` (novo).
  Genérico: `title`/`description?`/`actions?` (lista de `{ label, onClick }`,
  a primeira com destaque visual `variant="default"`, as demais `outline`) —
  cobre o caso de uso citado no UX-SPEC.md (T04/RF-04.4: "nova rodada ou
  entrada manual") sem acoplar o componente a essas duas ações específicas.
  Ícone (`Inbox`, `lucide-react`) + texto (UX-SPEC §5).
- **Testes**: `src/components/design-system/__tests__/loading-stream.test.tsx`
  (5 casos — conteúdo progressivo real provado com um `ReadableStream`
  controlado de fora, com dois momentos de chegada (`Date.now()`) distintos
  antes/depois de um `waitFor`, mesmo padrão de prova de entrega incremental
  já usado em `simulate-stream.test.ts`/`stream.test.ts`/`route.test.ts`;
  skeleton presente antes do 1º chunk; `aria-live="polite"` presente com o
  `label`; `onStreamComplete` chamado com o texto completo ao fechar o
  stream; `onStreamError` chamado tanto em falha de rede quanto em resposta
  não-`ok`, sem nenhum novo `fetch` automático depois da 1ª chamada — prova de
  "sem retry em loop" também no client), `error-retry-state.test.tsx` (3
  casos — mensagem + ícone + `role="alert"`, `onRetry` chamado exatamente uma
  vez por clique e nunca sozinho, `retryLabel` customizável), `empty-state.test.tsx`
  (4 casos — título/descrição, título sem descrição, ações disparando o
  callback correto por posição/label, nenhum botão quando `actions` ausente).
- **Fora de escopo desta tarefa** (fica para tarefas futuras): `SuggestionCard`
  (L5-T04); qualquer tela real dos Lotes 6-10 (T04/T06/T07/T08) que vá de fato
  compor estes 3 componentes com `PriceRangeBadge`/`BudgetInsufficientBanner`
  (L5-T02) e chamar `/api/gateway-ia/[etapa]` de verdade; carregamento real
  de fontes via `next/font` (já sinalizado como fora de escopo desde L5-T01).
- `npm run lint`, `npm test` (**236 testes no total** — 224 já presentes antes
  desta tarefa, conforme nota de L5-T02, + 12 novos aqui, todos verificados
  isoladamente por esta instância após L5-T02 já ter integrado suas 16 novas
  ao total) e `npm run build` passam sem regressão (`npm run build` também
  reconfirma `/api/gateway-ia/[etapa]` como rota dinâmica, sem mudança nesta
  tarefa).

### Nota de implementação L5-T05 (2026-09-09, Executor/FE)

- **Manifest**: `public/manifest.webmanifest`, linkado via `metadata.manifest`
  no `app/layout.tsx` (Metadata API do Next 14, injeta `<link rel="manifest">`
  automaticamente), com `appleWebApp`/`icons`/`viewport.themeColor` também na
  Metadata API para cobrir instalação em iOS/Safari (que ignora o manifest
  padrão nesse ponto). Ícones em `public/icons/icon-192.svg` e
  `icon-512.svg` são **placeholders simples (SVG com fundo sólido + "C+")**,
  sem arte final definida — documentando aqui para troca futura por ícones
  reais (idealmente incluindo PNG maskable) assim que houver design.
- **Service Worker**: escrito à mão (`public/sw.js`), sem biblioteca
  (`next-pwa`/`@ducanh2912/next-pwa`). Justificativa: o requisito crítico é
  nunca cachear resposta do Gateway de IA (streaming ou não); implementar a
  lógica de fetch manualmente deixa essa exclusão auditável num único arquivo
  pequeno, sem depender do comportamento interno de uma dependência de
  terceiros sobre Route Handlers de streaming num app Next 14.2.35, e sem
  adicionar biblioteca fora da lista de bibliotecas obrigatórias (TASK.md
  Seção 1, item 12) para uma necessidade que a Service Worker API nativa já
  resolve. Registrado via componente cliente `app/register-service-worker.tsx`
  (falha de registro é silenciosa por design — PWA é aprimoramento
  progressivo, nunca requisito para o app funcionar online).
- **O que é cacheado**: shell estático da UI — precache de `/`, `/offline`
  (nova rota, shell 100% estático sem Server Action/DB/Gateway de IA),
  manifest e ícones; demais assets same-origin (`/_next/static/...`,
  imagens, fontes) entram no cache sob demanda via estratégia cache-first
  com atualização em background. Navegação usa network-first com fallback
  para cache e, na ausência dele, para `/offline`.
- **O que é explicitamente excluído do cache**: qualquer rota sob `/api/`
  (constante `NEVER_CACHE_PREFIXES` em `sw.js`) — isso cobre
  `/api/gateway-ia/[etapa]` (streaming) e `/api/gateway-ia/streaming-spike`,
  além de `/api/auth/*` e `/api/anonymous-session`. Para essas rotas o
  listener de `fetch` retorna sem chamar `event.respondWith`, ou seja, o
  browser faz a requisição direto na rede, sem leitura nem escrita de cache.
- **Arquivos novos**: `public/manifest.webmanifest`, `public/sw.js`,
  `public/icons/icon-192.svg`, `public/icons/icon-512.svg`,
  `src/app/offline/page.tsx`, `src/app/register-service-worker.tsx`,
  `src/app/__tests__/pwa.test.ts`. Arquivo modificado:
  `src/app/layout.tsx` (campos de manifest/ícone/viewport na Metadata API +
  montagem de `RegisterServiceWorker`).
- **Testes**: 10 nos novos (suite total local após esta tarefa: 190 — pode
  divergir do total final se L5-T01, em paralelo, também tiver adicionado
  testes). Cobrem: campos obrigatórios do manifest, presença dos ícones
  192/512, exclusão de `/api/` no código-fonte do Service Worker (checagem
  textual de que o guard roda antes de qualquer `caches.match`/`cache.put` e
  retorna sem `respondWith`), precache não incluindo rota de API, existência
  de `OFFLINE_URL`, e wiring do manifest/`RegisterServiceWorker` no
  `layout.tsx`.
- **Requer verificação manual em browser real** (não coberto por teste
  automatizado, como esperado para PWA/Service Worker): prompt de instalação
  ("Add to Home Screen"/ícone de instalar na barra de endereço), hit real de
  cache em DevTools > Application > Cache Storage, navegação com a aba
  offline no DevTools caindo em `/offline`, e confirmação de que uma chamada
  real a `/api/gateway-ia/[etapa]` nunca aparece no Cache Storage.
- **Fora de escopo desta tarefa** (não implementado aqui): tokens
  visuais/`StepperProgress` (L5-T01, em paralelo),
  `PriceRangeBadge`/`BudgetInsufficientBanner` (L5-T02),
  `LoadingStream`/`ErrorRetryState`/`EmptyState` (L5-T03), `SuggestionCard`
  (L5-T04), ícones finais de produção (aguardando arte/design), notificação
  push (fora do racional de ADR-001, "Consequências").
- `npm run lint`, `npm test` (190 passando isoladamente) e `npm run build`
  rodados sem regressão; `/offline` aparece corretamente como rota estática
  (`○`) no output do build.

### Nota de implementação L5-T04 (2026-09-09, Executor/FE) — última tarefa do Lote 5, lote completo

- **`SuggestionCard`**: `src/components/design-system/suggestion-card.tsx`
  (novo). Componente único reaproveitado pelas 3 telas geradas por LLM (T04
  destino, T06 hospedagem, T07 passeios, UX-SPEC.md Seção 3: "estrutura
  idêntica... só a moldura visual"). Moldura: `bg-surface` + `border-border`
  fina, `rounded-lg`, sem `box-shadow`, layout `flex-col` no mobile e
  `sm:flex-row` no desktop (conteúdo à esquerda, ações à direita) — igual nos
  3 usos, comprovado em teste (ver abaixo).
  - **Design de props/slots** (decisão desta tarefa, documentada no
    cabeçalho do arquivo): o que varia entre as 3 telas não é estrutura, é
    conteúdo e ação. Conteúdo: `title` (serifado)/`subtitle?`/`description?`
    (justificativa ou característica distintiva)/`imageUrl?`+`imageAlt?`/
    `price?` (ver abaixo)/`meta?` (texto curto — usado para "duração
    aproximada" em T07)/`leading?` (slot antes do conteúdo — usado para o
    checkbox de T07, RF-07.3). Ação: `actions?: ReactNode`, um único slot em
    vez de props booleanas por tela (`showAdjustButton`, etc.) — cada tela
    chamadora (Lote 7/8/9, ainda não implementadas) monta ali os
    `Button`/inputs que fazem sentido para sua etapa ("Aprovar este destino"
    em T04; "Aprovar" + "Ajustar" em T06; "Remover" em T07, com o checkbox
    marcado por padrão indo em `leading`). O componente não conhece
    `TripSession`/state machine (ADR-006) nem os schemas do Gateway de IA
    (`src/lib/gateway-ia/schemas.ts`) — mesmo princípio de desacoplamento já
    usado em `PriceRangeBadge` (L5-T02): cada chamador mapeia o campo do
    schema da sua etapa para essas props normalizadas antes de renderizar o
    card.
  - **Reuso de `PriceRangeBadge`**: prop `price?` é `Omit<PriceRangeBadgeProps,
    "className">`, repassada diretamente para `<PriceRangeBadge {...price} />`
    — `SuggestionCard` nunca formata preço por conta própria (Diretriz de
    Implementação 6 do TASK.md), incluindo o caso "Gratuito" de T07
    (RF-07.2, via `price={{ min: 0, max: 0, free: true }}`) e o caso "por
    diária" de T06 (via `price={{ ..., unitLabel: "por diária" }}`) — ambos
    resolvidos inteiramente dentro de `PriceRangeBadge`, sem lógica adicional
    aqui.
  - **Acessibilidade/teclado**: o card em si não tem `onClick`/`tabIndex`
    próprio — nenhum elemento novo é inserido na ordem de tab além do que o
    chamador passa em `leading`/`actions` (elementos nativos/`Button` de
    shadcn-ui), preservando a ordem natural do DOM sem "trap" de foco
    (UX-SPEC.md Seção 5). Confirmado em teste com `userEvent.tab()`.
  - **Fora de escopo desta tarefa** (como no enunciado): nenhuma tela real de
    T04/T06/T07 (Lotes 7/8/9, ainda não iniciados) foi implementada — este é
    só o componente de apresentação; nenhuma integração com Gateway de IA
    (`src/lib/gateway-ia/*`) ou Orquestrador de Sessão
    (`src/lib/session-flow/*`); `Checkbox` de shadcn/ui não foi adicionado ao
    projeto (ainda não existe em `src/components/ui/`) — o teste de T07 usa
    um `<input type="checkbox">` nativo como exemplo do que uma tela real
    passaria em `leading`, já que a escolha de adicionar o componente
    `Checkbox` do design system cabe à tarefa que implementar T07 de fato
    (L9, não tocada aqui).
- **Testes**: `src/components/design-system/__tests__/suggestion-card.test.tsx`
  (6 casos) — os 3 usos simulados (T04 com imagem/descrição/ação única; T06
  com subtitle/`unitLabel`/duas ações; T07 com `leading` checkbox/`meta`
  duração/badge "Gratuito"/ação "Remover"), um teste dedicado provando que o
  `className` do container raiz é idêntico nos 3 casos (`border-border`/
  `bg-surface`, sem `shadow`), navegação por teclado via `userEvent.tab()`
  alcançando checkbox e botão de ação em ordem, e ausência de área de ações
  quando `actions` não é passado.
- **Lote 5 completo**: com esta tarefa, todas as 5 tarefas do Lote 5 (L5-T01
  a L5-T05) estão `Concluída` — tokens visuais/`StepperProgress`,
  `PriceRangeBadge`/`BudgetInsufficientBanner`, `LoadingStream`/
  `ErrorRetryState`/`EmptyState`, `SuggestionCard` e PWA (manifest + Service
  Worker) formam a base de design system reutilizável para os Lotes 6-10;
  nenhuma tela real de produto foi implementada em nenhuma tarefa deste lote.
- `npm run lint`, `npm test` (**242 testes no total** — 236 já presentes
  antes desta tarefa, conforme nota de L5-T03, + 6 novos aqui) e
  `npm run build` passam sem regressão.

### Lote 6 — Telas de Entrada (T00, T01, T02, T03a-d)

Nota de tamanho de lote: 7 tarefas, acima do alvo de 5-6 — justificativa: o
lote cobre 3 telas distintas (T00, T01, T02) mais o wizard T03, cada uma
exigindo separação UI/Server Action por não-mistura; reduzir abaixo de 7 só
seria possível violando a regra de não-mistura ou fundindo telas sem relação
funcional, o que o guardrail do Coordenador proíbe.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L6-T01 | T00 UI — 3 cartões de caminho de entrada + navegação | FE | 0.5 dia | L5-T01 | L6-T02, L6-T04, L6-T06 | Concluída | 3 cartões com igual destaque visual, nenhum pré-selecionado; navega para T01/T02/T03a |
| L6-T02 | T01 UI — form de data livre + validação inline (RF-01.4) | FE | 1 dia | L5-T01 | L6-T01, L6-T04, L6-T06 | Concluída | Erro de data final < inicial bloqueia avanço com mensagem junto ao campo, sem navegar |
| L6-T03 | T01 Server Action — processa range + destino opcional, decide próxima etapa (RF-01.2/.3) | BE | 1 dia | L4-T01, L4-T02, L6-T02 | L6-T05, L6-T07 | Concluída | Sem destino → segue para etapa de destino (RF-04); com destino → registra como aprovado e segue para confirmação (RF-11) |
| L6-T04 | T02 UI — lista de feriados com emenda + destino opcional | FE | 1 dia | L5-T01, L2-T02 | L6-T01, L6-T02, L6-T06 | Concluída | Emenda exibida por feriado (ex.: "Qui 12/06 → estende até Dom 15/06, 4 dias") |
| L6-T05 | T02 Server Action — processa feriado escolhido como range de datas (RF-02.3) | BE | 0.5 dia | L4-T01, L4-T02, L6-T04 | L6-T03, L6-T07 | Concluída | Range resultante segue a mesma ramificação de RF-01.2/.3 |
| L6-T06 | T03a-d Quiz guiado — wizard de 4 perguntas com stepper e "Pular" (RF-03) | FE | 1.5 dia (ver Seção 6 — justificativa de tamanho) | L5-T01 | L6-T01, L6-T02, L6-T04 | Concluída | 4 telas sequenciais, indicador "1 de 4"; "Pular" disponível em (b)/(c)/(d); período obrigatório |
| L6-T07 | T03 Server Action — gera range de datas sugerido a partir do período (priorizando feriado próximo compatível, RF-03.2) | BE | 1 dia | L4-T01, L4-T02, L2-T01, L6-T06 | L6-T03, L6-T05 | Concluída | Range gerado é coerente com o período informado; se houver feriado prolongado compatível próximo, é priorizado |

Nota de implementação L6-T02 (2026-09-09, Executor/FE): `T01DateRangeForm`
(`src/components/entrada/t01-date-range-form.tsx`), montado na rota
`src/app/entrada/data-livre/page.tsx` — mesmo namespace `/entrada/...`
adotado por L6-T01 (T00) por consistência (não havia convenção de URL
prévia no SDD.md/UX-SPEC.md). Campos conforme UX-SPEC.md Seção 4 (T01):
data inicial, data final (ambos `input type="date"`, obrigatórios) e destino
opcional (`input type="text"` simples — UX-SPEC menciona "autocomplete
simples", mas nenhum artefato define fonte de dado de destino ainda; texto
puro já satisfaz o critério de aceite desta tarefa, decisão de detalhe de
implementação).

RF-01.4: validação client-side pura (sem Server Action — L6-T03, dependente
desta tarefa, ainda não iniciada) bloqueia o `submit`/`onValid` quando
`dataFinal < dataInicial`, mostrando a mensagem junto ao campo "Data final"
(`role="alert"`, ícone + texto, nunca só cor — UX-SPEC Seção 5) conectada via
`aria-describedby`, e marcando `aria-invalid`. Texto exato da mensagem não
estava definido em UX-SPEC.md/PRD-TECNICO.md — decisão de detalhe de
implementação desta tarefa: "A data final não pode ser anterior à data
inicial." (constante `DATE_ORDER_ERROR_MESSAGE`, exportada para reuso/teste).
Datas iguais são tratadas como válidas (viagem de 1 dia). O formulário nunca
navega/chama `onValid` sozinho quando bloqueado — `onValid` é um prop opcional
que só dispara com dados válidos, deixado como ponto de extensão explícito
para L6-T03 acoplar a submissão real à Server Action (nenhuma navegação
client-side otimista, Diretriz de Implementação 3).

Acessibilidade (UX-SPEC Seção 5, Diretriz de Implementação 10): label
associado a cada campo via `htmlFor`/`id`; ordem de tab lógica (data inicial →
data final → destino → "Continuar"), testada explicitamente; alvo de toque do
botão principal com `min-h-11` (>=44px, RNF-04); contraste dos tokens
`--foreground`/`--error`/`--border` sobre `--background` já validado em
L5-T01. Responsivo conforme UX-SPEC Seção 6 (Formulários T01/T03a-d): campos
empilhados full-width, largura máxima centralizada em telas médias/grandes
(`max-w-md md:mx-auto`).

Reuso do design system: `Button` (`src/components/ui/button.tsx`) e `cn`
(`src/lib/utils.ts`); nenhum componente novo adicionado a
`src/components/design-system/` nesta tarefa (o formulário é específico de
T01, não um componente cross-tela — `PriceRangeBadge`/`SuggestionCard`/etc.
não se aplicam aqui).

Testes: `src/components/entrada/__tests__/t01-date-range-form.test.tsx` (7
casos) — data final < inicial mostra erro e não chama `onValid` (critério de
aceite); mensagem associada ao campo via `aria-describedby`/`aria-invalid`;
datas válidas (inclusive iguais) chamam `onValid` sem erro; corrigir a data
após erro remove a mensagem e libera o avanço; destino opcional repassado
quando preenchido; navegação por teclado nos 4 elementos focáveis, em ordem.

Fora de escopo desta tarefa (fica para L6-T03, não iniciada): qualquer
chamada a Server Action, persistência em `TripSession`, e a decisão de
ramificação RF-01.2/.3 (sem destino → RF-04; com destino → RF-11) — o
formulário hoje só expõe os valores validados via `onValid`, sem decidir para
onde navegar. `npm run lint` e `npm test` (266 testes no total, incluindo os
7 novos desta tarefa) passam sem regressão. `npm run build` não foi possível
concluir no momento desta nota por um erro de tipo pré-existente/concorrente
em `src/app/page.tsx` (`entry-paths.ts`, tarefa paralela L6-T01, tipagem de
ícone `lucide-react` vs. `ComponentType`) — confirmado via `tsc --noEmit`
que nenhum arquivo desta tarefa (`t01-date-range-form.tsx`,
`app/entrada/data-livre/page.tsx`) está envolvido nesse erro; não corrigido
aqui por ser arquivo de outra instância em edição simultânea (fora do escopo
de L6-T02).

Nota de implementação L6-T06 (2026-09-09, Executor/FE): `QuizWizard`
(`src/components/quiz/quiz-wizard.tsx`), montado na rota
`src/app/entrada/quiz/page.tsx` — mesmo namespace `/entrada/...` de
L6-T01/L6-T02, apontado por `ENTRY_PATHS`/`src/app/page.tsx` (L6-T01).
Implementa exatamente as 4 perguntas de RF-03.1, nesta ordem (RN-06, Diretriz
de Implementação 13): (a) período disponível — seleção única, obrigatória,
sem "Pular"; (b) alcance geográfico — seleção única incluindo "sem
preferência", "Pular" disponível; (c) tipo de experiência — multi-select
incluindo as 4 opções de RF-03.1(3), "Pular" disponível; (d) orçamento —
texto livre opcional com placeholder de faixa de exemplo, "Pular"/"Concluir"
disponíveis.

Decisão de indicador de progresso ("1 de 4", não detalhada além do rótulo no
UX-SPEC.md): **não** reaproveita `StepperProgress` (L5-T01) — esse componente
é orientado por `SessionFlowState`, a state machine SERVIDORA (ADR-006), com
granularidade de 4 macro-etapas (destino/hospedagem/passeios/roteiro) que não
tem nenhum conceito das 4 perguntas internas do quiz (sub-passo puramente
client-side, anterior a qualquer chamada de servidor — a sessão ainda nem
existe nesse ponto). Foi criado um indicador próprio e local ao wizard
(`QuizProgressIndicator`, dentro do mesmo arquivo), seguindo a mesma regra de
acessibilidade do `StepperProgress` (sem elemento focável, status comunicado
por texto via `aria-live="polite"`, não só visual). Justificativa documentada
no cabeçalho do arquivo para não ficar implícita.

RF-03.3: período bloqueia avanço com mensagem (`role="alert"`, texto
"Selecione um período para continuar.") sem navegar, quando vazio; as demais
3 perguntas sempre têm "Pular" (avança sem preencher, "sem preferência" para
(b), lista vazia para (c), `null` para (d)). Navegação inclui "Voltar"
(decisão de detalhe de implementação — usabilidade padrão de wizard, não uma
pergunta nova, não expande RF-03 além das 4 perguntas de RN-06) preservando
as respostas já dadas ao retroceder.

Escopo explicitamente fora desta tarefa (fica para L6-T07, ainda não
iniciada): gerar o range de datas a partir do período informado (RF-03.2) —
`QuizWizard` só coleta as 4 respostas e expõe via `onComplete`, sem chamar
nenhuma Server Action/provider de LLM (Diretriz de Implementação 1); a página
`entrada/quiz/page.tsx` hoje só mostra uma tela de confirmação estática ao
concluir, sem navegar adiante.

Reuso do design system: `Button` (`src/components/ui/button.tsx`) e `cn`
(`src/lib/utils.ts`); nenhum componente de `src/components/design-system/`
reaproveitado além de decidir explicitamente NÃO reusar `StepperProgress`
(ver acima) — este wizard não depende de geração por LLM, então
`LoadingStream`/`ErrorRetryState`/`EmptyState`/`SuggestionCard` não se
aplicam (Diretriz de Implementação 11).

Testes: `src/components/quiz/__tests__/quiz-wizard.test.tsx` (9 casos) —
indicador "1 de 4" na primeira pergunta; "Pular" ausente em (a) e presente em
(b)/(c)/(d); avanço sem período bloqueia com mensagem e não navega; navegação
sequencial completa pelas 4 perguntas; multi-select em (c); `onComplete`
chamado com as respostas corretas ao concluir ou pular a última pergunta;
"Voltar" preserva resposta já selecionada.

`npm run lint` sem warnings/erros. `npm test` — 273 testes no total
(incluindo os 9 novos desta tarefa), sem regressão, todos passando. `npm run
build`: durante a execução desta tarefa, o build falhou por dois motivos
concorrentes causados por arquivos de outras instâncias em edição simultânea
— (1) erro de tipo pré-existente em `src/app/page.tsx`/`entry-paths.ts`
(`aria-hidden`/`ComponentType` de `lucide-react`, mesmo apontado na nota de
L6-T02) e (2) um `ENOENT` transitório lendo `src/app/feriados/page.tsx`
(arquivo de L6-T04, provavelmente em meio a um `mv`/rename concorrente no
momento exato do build). Confirmado via `tsc --noEmit` que nenhum arquivo
desta tarefa (`quiz-wizard.tsx`, `app/entrada/quiz/page.tsx`) está envolvido
em nenhum dos dois erros — o único erro de tipo encontrado nesta tarefa
(`RefObject<HTMLHeadingElement | null>` incompatível com `LegacyRef` do
elemento `h2`) foi identificado e corrigido durante a própria implementação,
antes desta nota. Não foi corrigido nada em arquivo de outra instância, por
estar fora do escopo de L6-T06.

Nenhum desvio de escopo/estimativa: a tarefa coube dentro do que foi
justificado na Seção 6 como "1.5 dia, wizard inseparável" — as 4 perguntas
realmente compartilham estrutura/navegação, sem necessidade de escalar
`BLOCKERS.md`.

Nota de implementação L6-T04 (2026-09-09, Executor/FE): tela T02 implementada
como rota `src/app/entrada/feriados/page.tsx` (Server Component fino, só
chama `getFeriadosProlongados` — L2-T02 — e repassa o resultado, sem lógica
de cálculo própria) + `src/app/entrada/feriados/feriados-screen.tsx` (Client
Component com a interatividade: seleção de feriado via radio nativo em grupo
único, e campo de destino opcional). Rota inicialmente criada em `/feriados`
e movida para `/entrada/feriados` no meio da tarefa, ao notar (leitura da
nota de L6-T02 e de `src/components/entrada/entry-paths.ts`, L6-T01) que o
namespace `/entrada/...` já tinha sido adotado pelas outras duas instâncias
em paralelo, com `ENTRY_PATHS` de T00 apontando literalmente para
`/entrada/feriados` — sem o ajuste, o link de T00 para T02 ficaria quebrado.

Novo componente de design system `src/components/design-system/holiday-list-item.tsx`
(`HolidayListItem`, previsto no UX-SPEC.md Seção 3 como específico de T02):
bloco `surface` + borda fina (destaque `accent` quando selecionado, nunca só
cor — UX-SPEC §5), exibindo `name` e `label` — este último já formatado por
`FeriadoProlongado.label` (`src/lib/actions/feriados.ts`, L2-T02), sem
nenhuma formatação de data/emenda duplicada aqui.

Campo de destino: `<label>`+`<input>` nativos direto em `feriados-screen.tsx`
(não um componente `ui/input`/`ui/label` novo) — decisão para não introduzir
uma dependência nova (`@radix-ui/react-label`, ausente do projeto) nem um
componente compartilhado com risco de colisão de arquivo com outra instância
em paralelo (L6-T02, que resolve o mesmo tipo de campo em T01 de forma
independente); `required={false}`/`aria-required="false"` explícitos deixam
claro que o campo nunca é obrigatório, coerente com UX-SPEC Seção 2 ("Campo
opcional de destino abaixo da lista").

Fora de escopo desta tarefa, de propósito (enunciado do TASK.md): nenhum
botão de "continuar"/submissão foi implementado — enviar a seleção (feriado +
destino) ao servidor é a Server Action de **L6-T05** (RF-02.3), ainda não
implementada; adicionar uma navegação real agora violaria a Diretriz de
Implementação 3 (nenhuma transição de etapa sem confirmação do servidor,
ADR-006). `StepperProgress` (L5-T01) incluído com `currentState=
"entrada_selecionada"` (mesmo estado inicial usado nas telas de entrada,
antes de qualquer `TripSession` real existir). T02 não usa
`LoadingStream`/`ErrorRetryState`/`EmptyState` (UX-SPEC.md Seção 4: cálculo
determinístico local instantâneo, ADR-007 — "não aplicável").

Acessibilidade (UX-SPEC §5): foco vai para o `<h1>` da tela ao montar
(`tabIndex={-1}` + `useEffect`); lista de feriados dentro de um
`<fieldset>`/`<legend className="sr-only">` para leitores de tela; seleção
via radio nativo (focável/acionável por teclado sem `tabIndex` manual,
`checked` reflete o estado, nunca só a borda dourada); campo de destino com
`<label htmlFor>` associado ao `<input>`.

Testes (Testing Library): `src/components/design-system/__tests__/holiday-list-item.test.tsx`
(4 casos — nome + emenda formatada exibidos, seleção por teclado/clique,
estado `checked` refletido, nunca reformata o `label` recebido);
`src/app/entrada/feriados/__tests__/feriados-screen.test.tsx` (5 casos —
lista renderiza a emenda formatada exata do critério de aceite, um item por
feriado na ordem recebida, campo de destino presente/opcional/editável sem
seleção prévia, seleção única entre feriados, foco no título ao montar);
`src/app/entrada/feriados/__tests__/page.test.tsx` (2 casos —
`getFeriadosProlongados` mockado via `vi.mock`, critério de aceite validado
na rota real: chamada única à Server Action e emenda formatada renderizada;
campo de destino presente). `npm run lint`, `npm test` (273 testes no total,
incluindo os 11 novos desta tarefa e os de outras instâncias em paralelo —
L6-T02/L6-T06) e `npm run build` passam sem regressão — `/entrada/feriados`
confirmada como rota estática (`○`) no output do build.

Nenhum desvio de escopo/estimativa nesta tarefa.

Nota de implementação L6-T01 (2026-09-09, Executor/FE): tela T00 implementada
em `src/app/page.tsx` (rota `/`, Server Component — sem interatividade além
de navegação nativa via `next/link`, sem Server Action, conforme enunciado).
Os 3 caminhos de entrada (ícone, título serifado, frase de "quando usar",
href) vivem em `src/components/entrada/entry-paths.ts`
(`ENTRY_PATHS`/`ENTRY_PATH_CLASSNAME`) em vez de dentro de `page.tsx` — um
arquivo `page.tsx` do App Router só pode expor os exports reconhecidos pelo
Next.js (`default`, `metadata`, etc.); qualquer export extra (necessário para
o teste importar `ENTRY_PATHS`) quebra a checagem de tipos gerada pelo `next
build` (`checkFields<Diff<...>>`), erro só descoberto ao rodar `npm run
build` depois do `npm test` já estar verde — documentado aqui para as
próximas tarefas de tela evitarem o mesmo tropeço.

Textos exatos dos 3 blocos e ordem (Data livre / Feriados prolongados / Quiz
guiado) conforme UX-SPEC.md Seção 2 ("T00"), incluindo as 3 frases de "quando
usar" citadas literalmente no wireframe. Os 3 blocos compartilham
`ENTRY_PATH_CLASSNAME` (`border-border`/`bg-surface`, sem sombra — mesma
moldura de `SuggestionCard`/`HolidayListItem`, L5-T04), sem nenhuma classe
condicional de destaque — testado explicitamente comparando `className` dos
3 links renderizados e checando ausência de `aria-current`/classes
"selected"/"active"/"primary" (critério de aceite: nenhum pré-selecionado).
Layout responsivo conforme UX-SPEC.md Seção 6: `grid-cols-1 md:grid-cols-3`
(empilhado no mobile, 3 colunas no desktop — T00 não segue o padrão de linha
única das 4 telas centrais "Concierge Noturno").

Rotas de destino (T01/T02/T03a): sem convenção de URL prévia no
SDD.md/UX-SPEC.md. Como as 3 tarefas paralelas deste lote (L6-T02/T04/T06)
criam essas páginas simultaneamente, os hrefs em `entry-paths.ts` foram
conferidos e reconferidos contra as rotas reais publicadas por elas ao longo
da execução (houve ao menos uma renomeação concorrente de `/feriados` para
`/entrada/feriados` a meio caminho, capturada numa nova rodada de `npm run
build` antes de fechar esta tarefa) — convergiram para o mesmo namespace
`/entrada/...` nos 3 casos (`/entrada/data-livre`, `/entrada/feriados`,
`/entrada/quiz`), sem necessidade de escalar inconsistência via
`BLOCKERS.md`. Nenhuma dessas 3 páginas foi tocada por esta tarefa — só o
link de T00 aponta para elas.

Acessibilidade (UX-SPEC.md Seção 5): cada bloco é um `<a>` nativo (via
`next/link`), focável/acionável por teclado sem `tabIndex` manual, ordem de
tab natural (Data livre → Feriados → Quiz), testada com `userEvent.tab()`;
ícone com `aria-hidden="true"` (decorativo, título já comunica o caminho em
texto); contraste usa os tokens já validados em L5-T01
(`border-border`/`bg-surface`/`text-foreground`/`text-foreground-muted`/
`text-accent`).

Testes: `src/app/__tests__/page.test.tsx` (4 casos) — os 3 caminhos
declarados na ordem/textos exatos do UX-SPEC; título + frase + `href` correto
por bloco; mesma classe de container nos 3 blocos e ausência de qualquer
marca de pré-seleção; navegação completa por Tab nos 3 links em ordem.

`npm run lint`, `npm test` (273 testes no total, sem novos casos líquidos
desta tarefa além dos 4 de `page.test.tsx` — os demais 269 já incluem os
testes publicados pelas tarefas paralelas L6-T02/T04/T06 no momento em que
este teste rodou por último) e `npm run build` passam sem regressão;
`/` aparece como rota estática (`○`) no output do build. Nenhum desvio de
escopo/estimativa nesta tarefa.

Nota de implementação L6-T03 (2026-09-09, Executor/BE): Server Action
`submeterDataLivre` em novo módulo `src/lib/actions/data-livre.ts` (consome
`DateRangeFormValues` de `T01DateRangeForm`, L6-T02, sem alterar aquele
componente). Duas responsabilidades em ordem: (1) validação/sanitização
específica desta tela — datas obrigatórias, formato `YYYY-MM-DD` e RF-01.4
(data final < inicial) revalidados no servidor (Diretriz de Implementação 3
— nenhuma transição client-side otimista, não confia só em `T01DateRangeForm`),
e sanitização do campo de texto livre `destino` (TASK.md Seção 1, item 9):
trim + truncagem em `DESTINO_MAX_LENGTH = 200` (decisão de detalhe de
implementação — nenhum limite definido em UX-SPEC.md/PRD-TECNICO.md); erro de
validação lança `InvalidDataLivreInputError` **antes** de chamar o helper
abaixo (nada é persistido em input inválido); (2) delega a criação da
`TripSession` + a ramificação RF-01.2/.3 (sem destino → só `iniciar`
entrada_selecionada→destino_pendente; com destino → também `aprovar` com
`source: "user_provided"`, destino_pendente→destino_confirmado) para
`createSessionWithDateRange` (`@/lib/session-flow`) — esta Server Action
nunca chama `prisma`/`applySessionFlowTransition` diretamente.

Correção pós-revisão inline (2026-09-09, Executor/BE, achado do coordenador):
a versão original desta tarefa implementava a criação da `TripSession` +
`applySessionFlowTransition("iniciar"/"aprovar")` inline em `data-livre.ts`,
por não haver ainda nenhum helper compartilhado no momento em que esta tarefa
começou. Como as tarefas irmãs L6-T05 (`processarFeriadoEscolhido`) e L6-T07
(`submitQuizAnswers`), rodando em paralelo, extraíram exatamente essa mesma
lógica (criação da sessão + ramificação RF-01.2/.3, idêntica a RF-02.3) para
`createSessionWithDateRange`
(`src/lib/session-flow/create-session-with-range.ts`, ver nota de
implementação L6-T05 abaixo — módulo que já cita esta tarefa como consumidor
pretendido), `data-livre.ts` foi refatorado para chamar esse helper em vez de
duplicar a lógica — evita que uma mudança futura em RF-01.2/.3 precise ser
lembrada em 3 lugares. A validação/sanitização específica de T01 (parsing de
data ISO, RF-01.4, sanitização de destino) permanece em `data-livre.ts`, por
ser específica de como esta tela coleta o input — só a criação da sessão +
transição foi movida para o helper. O contrato público
`SubmeterDataLivreResult` (`proximaEtapa`/`sessionId`/`flowState`/`destino?`)
não mudou: o resultado de `createSessionWithDateRange`
(`{ sessionId, flowState, status }`) é mapeado para esse formato já testado,
sem quebrar consumidores futuros do Lote 7. Nenhum teste precisou mudar — o
comportamento observável (retorno da Server Action + o que fica persistido no
banco) é idêntico ao de antes da refatoração.

Decisão de detalhe de implementação sobre `DestinationApproval.priceRangeMin/
Max` (`Decimal` não-nullable no schema) quando o destino vem de
`user_provided`: gravados como `0`/`0` pelo helper compartilhado, um
placeholder explícito de "preço ainda não avaliado" — este destino nunca
passou por RF-04 (sugestão da IA com faixa de preço), então não há nenhum
valor de preço real disponível neste ponto do fluxo; RF-06 (hospedagem) é
quem introduz preço real na sessão a partir daqui. Não há valor definido em
SDD.md/PRD-TECNICO.md para este caso — documentado aqui (e no cabeçalho de
`create-session-with-range.ts`) em vez de escalado, por ser um detalhe
pontual de implementação que não muda nenhuma regra de negócio
(`justification: null`, já previsto pelo schema para `source:
"user_provided"`).

Ajuste estrutural sem mudança de comportamento: `InvalidDataLivreInputError`
foi extraído para `src/lib/actions/data-livre-errors.ts` (sem `"use server"`)
em vez de ficar em `data-livre.ts` — Next.js rejeita `npm run build`
("Only async functions are allowed to be exported in a 'use server' file")
se um arquivo `"use server"` exportar uma classe, mesmo padrão de separação
já usado em `src/lib/gateway-ia/errors.ts`/`src/lib/session-flow/errors.ts`.

Retorna `{ proximaEtapa: "destino" | "confirmacao_destino", sessionId,
flowState, destino? }` — só a decisão de para onde a UI deve navegar; as
telas de RF-04/RF-11 em si ficam para o Lote 7 (ainda não iniciado), que
ainda não consome esta Server Action (página `/entrada/data-livre` de L6-T02
permanece sem `onValid` acoplado, de propósito — não há rota de destino/
confirmação real para navegar ainda).

Testes: `src/lib/actions/__tests__/data-livre.integration.test.ts` (6 casos,
integração real com Postgres, mesmo padrão de
`src/lib/session-flow/__tests__/persistence.integration.test.ts`, inalterados
pela refatoração acima): sem destino cria a sessão e avança para
`destino_pendente` sem persistir `DestinationApproval` (critério de aceite);
destino só com espaços tratado como "sem destino"; com destino aprova direto
(`source: "user_provided"`/`justification: null`/preço `0`/`0`) e avança para
`destino_confirmado`, com o texto trimado no resultado retornado (critério de
aceite); RF-01.4 revalidado no servidor rejeita sem criar sessão (contagem de
`TripSession` inalterada); datas ausentes/malformadas rejeitadas sem criar
sessão; destino acima do limite é truncado antes de persistir. Após a
refatoração para usar `createSessionWithDateRange`: `npm run lint`, `npm
test` (**300 testes no total**, sem nenhuma falha — as 2 falhas observadas
numa execução anterior desta mesma tarefa eram de arquivos de tarefas
paralelas em andamento no mesmo lote, já resolvidas por elas) e `npm run
build` passam sem regressão, incluindo `/entrada/data-livre` confirmada como
rota estática (`○`). Nenhum desvio de escopo/estimativa nesta tarefa.

Nota de implementação L6-T05 (2026-09-09, Executor/BE): Server Action
`processarFeriadoEscolhido` adicionada a `src/lib/actions/feriados.ts`
(mesmo arquivo de `getFeriadosProlongados`, L2-T02). Recebe `holidayDate`
(mesma chave usada por `FeriadosScreen`/L6-T04:
`holiday.date.toISOString()`) + `destino` opcional. Nunca confia no range
vindo do cliente: recalcula a listagem de feriados+emenda a partir da MESMA
fonte determinística de sempre (`getNationalHolidaysWithBridgeInRange`,
`src/lib/holidays.ts`) e localiza o feriado escolhido por essa chave —
`holidayDate` que não corresponda a nenhum feriado conhecido (adulterado, ou
virada de ano entre carregar a tela e submeter) lança
`InvalidHolidaySelectionError` antes de qualquer escrita. O range de datas
gravado é `bridge.rangeStart`/`bridge.rangeEnd` do feriado encontrado (RF-02.3
— feriado + emenda como range real, nunca só o dia isolado do feriado).

Extração de helper compartilhado (conforme sugerido pelo enunciado desta
tarefa): como a nota de L6-T03 acima ainda não existia quando esta tarefa
começou, a ramificação de RF-01.2/RF-01.3 (idêntica para RF-02.3) foi
extraída para uma nova função pública `createSessionWithDateRange`
(`src/lib/session-flow/create-session-with-range.ts`, reexportada por
`src/lib/session-flow/index.ts` — dentro da fronteira do módulo
`session-flow`, Diretriz de Implementação 3 do TASK.md): cria a
`TripSession` (`prisma.tripSession.create`, único ponto de escrita direta
fora de `applySessionFlowTransition`, pela mesma razão já documentada por
L6-T03 — não existe ação de state machine que modele "nascer"), chama
`iniciar` e, se houver destino (trimado), `aprovar` com
`childData.stage: "destino"`/`source: "user_provided"`/`priceRangeMin: 0`/
`priceRangeMax: 0`/`justification: null` — mesmíssima decisão de placeholder
de preço já tomada por L6-T03. `processarFeriadoEscolhido` só resolve
feriado→range e delega toda a criação/transição para esse helper.

**Divergência a reconciliar (não é bloqueio, é sinalização)**: a nota de
L6-T03 acima (`submeterDataLivre`, `src/lib/actions/data-livre.ts`) registra
a MESMA lógica de criação+ramificação implementada inline naquele arquivo,
em vez de consumir este helper — as duas implementações são
comportamentalmente equivalentes (mesmos estados finais, mesmo placeholder
de preço, mesma sanitização de destino) mas hoje vivem duplicadas em dois
lugares. Sugestão para quem revisitar o Lote 6 (validador ou uma futura
tarefa de refatoração, ex. antes de L6-T07 usar o mesmo range→sessão para o
quiz): migrar `submeterDataLivre` para chamar
`createSessionWithDateRange` também, eliminando a duplicação — decisão de
qual das duas versões "vence" fica para o Coordenador/validador, não
decidida unilateralmente aqui.

Sanitização do destino (Diretriz de Implementação 9): trim + rejeição acima
de `MAX_DESTINO_LENGTH = 200` (mesmo limite escolhido por L6-T03, para
consistência); string vazia/só espaços é tratada como "sem destino" (mesma
regra semântica de L6-T03/T01DateRangeForm).

Ajuste estrutural (mesma causa raiz já antecipada pela nota de L6-T03
acima): `InvalidHolidaySelectionError` foi extraído para
`src/lib/actions/feriados-errors.ts` (sem `"use server"`) — um arquivo
`"use server"` só pode exportar funções async; exportar a classe direto de
`feriados.ts` quebrava `npm run build`, mesmo padrão de correção já aplicado
por L6-T03 em `data-livre-errors.ts`.

Testes: `src/lib/actions/__tests__/processar-feriado-escolhido.integration.test.ts`
(7 casos, integração real com Postgres, mesmo padrão de
`persistence.integration.test.ts`/`data-livre.integration.test.ts`): sem
destino cria a sessão com `entryPath: "feriado"` e o range da emenda, fica em
`destino_pendente`, sem `DestinationApproval`; com destino aprova direto
(`user_provided`) e avança para `destino_confirmado`, com o texto trimado
persistido; destino só com espaços tratado como "sem destino"; range gravado
bate exatamente com `bridge.rangeStart`/`rangeEnd` da fonte pura (não é só o
dia isolado do feriado — critério de aceite "mesma ramificação" mais o
cálculo correto do range); `holidayDate` desconhecido e string de data
inválida rejeitados com `InvalidHolidaySelectionError`, sem criar sessão;
destino acima do limite rejeitado sem criar sessão. Mais
`src/lib/session-flow/__tests__/create-session-with-range.integration.test.ts`
(3 casos, integração real, cobrindo o helper compartilhado isoladamente):
sem destino, com destino, e as 4 variações de "ausência de destino"
(`undefined`/`null`/`""`/`"   "`) tratadas de forma idêntica.

`npm run lint`, `npm run build` (rota `/entrada/feriados` confirmada como
estática, `○`) e `npm test` passam sem regressão — 300 testes no total nesta
execução (10 novos desta tarefa; número final inclui os testes já publicados
por L6-T03/L6-T07, tarefas paralelas do mesmo lote). Observação sem correção
nesta tarefa (arquivo de propriedade de L6-T03, não tocado aqui): em pelo
menos uma execução da suíte completa,
`data-livre.integration.test.ts`/"rejeita datas ausentes/malformadas sem
criar sessão" falhou por comparar `prisma.tripSession.count()` global
antes/depois — contagem que qualquer teste de integração paralelo (inclusive
os dois novos desta tarefa) pode alterar entre as duas leituras; reexecutado
isoladamente, passa sem alteração de código. Sinalizado aqui para quem
revisitar aquele arquivo trocar por uma contagem filtrada por
`sessionId`/`entryPath`, mesmo padrão já usado pelos demais testes de
integração deste módulo (`sessionIds.push(...)` + `deleteMany({ where: { id:
{ in: sessionIds } } })`). Nenhum desvio de escopo/estimativa nesta tarefa.

Nota de implementação L6-T07 (2026-09-09, Executor/BE): Server Action
`submitQuizAnswers` em novo módulo `src/lib/actions/quiz.ts`, consumindo as
`QuizAnswers` do wizard (`src/components/quiz/quiz-wizard.tsx`, L6-T06) via
`onComplete`. Diferente de L6-T03/L6-T05 (que já recebem um range de datas
concreto escolhido pelo usuário), esta tarefa PRECISA gerar o range a partir
de um período aproximado — algoritmo pura implementado em
`resolveSuggestedDateRange` (novo módulo `src/lib/actions/quiz-date-range.ts`,
sem `"use server"` — ver "ajuste estrutural" abaixo).

**Algoritmo de geração do range (RF-03.2, decisão de implementação — o
requisito não fecha datas exatas, é "sugestão", não escolha do usuário)**:
1. Cada período de RF-03.1(1) tem uma duração-alvo em dias corridos
   inclusive, com uma faixa `[min, max]` usada para checar compatibilidade
   com um feriado prolongado e um `default` usado no range padrão:
   `fim_de_semana` → 3 dias (2–4); `3_a_5_dias` → 4 dias (3–5); `1_semana` →
   7 dias (6–8); `mais_de_1_semana` → 10 dias (9–30). Nenhum desses números
   vem do PRD-TECNICO.md/SDD.md (nenhum valor exato é dado) — são decisões
   de detalhe de implementação documentadas no cabeçalho de
   `quiz-date-range.ts`.
2. **Priorização de feriado compatível**: busca, entre os feriados
   prolongados do ano corrente + seguinte (`getNationalHolidaysWithBridgeInRange`,
   `@/lib/holidays`, L2-T01 — mesma fonte determinística de L2-T02/L6-T04,
   nenhum cálculo de calendário duplicado), o mais próximo (menor
   `rangeStart`) cuja duração (`bridge.totalDays`) caiba em `[min, max]` do
   período E cujo início esteja entre hoje (inclusive) e 45 dias à frente
   (`HOLIDAY_SEARCH_WINDOW_DAYS` — decisão de "o que conta como próximo" para
   efeito de RF-03.2, já que sem um limite qualquer feriado do ano seria
   "compatível" mas não necessariamente "próximo"). Se encontrado, o range
   sugerido é exatamente `bridge.rangeStart`/`bridge.rangeEnd` desse feriado
   (`source: "feriado_prolongado"`).
3. **Range padrão (fallback)**: se nenhum feriado compatível for encontrado
   na janela, o range sugerido é hoje + 30 dias corridos
   (`DEFAULT_LEAD_DAYS` — antecedência mínima razoável de planejamento,
   decisão de implementação) até esse início + a duração `default` do
   período (`source: "periodo_padrao"`).

**Achado documentado (não é bug)**: `calculateBridge` (`src/lib/holidays.ts`,
L2-T01) nunca produz uma emenda com mais de 4 dias corridos — logo, na
prática, só `fim_de_semana` e `3_a_5_dias` podem ter um feriado priorizado;
`1_semana`/`mais_de_1_semana` sempre caem no range padrão. Isso é o
comportamento correto (não faria sentido sugerir um feriado de 4 dias para
quem pediu "mais de 1 semana"), registrado aqui para não parecer uma falha
de implementação.

**Criação da sessão + branching RF-01.2/.3**: reaproveita
`createSessionWithDateRange` (`@/lib/session-flow`,
`create-session-with-range.ts`), o helper já extraído por L6-T03/L6-T05
especificamente para as 3 origens de entrada compartilharem a mesma lógica de
criação de `TripSession` + `applySessionFlowTransition("iniciar")`/aprovação
de destino — nenhum arquivo do módulo `session-flow` foi tocado por esta
tarefa (Diretriz de Implementação 3 preservada, sem risco de colisão com as 2
instâncias paralelas). Como o quiz (RF-03.1, L6-T06) nunca coleta destino —
confirmado em `PRD-TECNICO.md` RF-03.1/RF-03.2 antes de implementar, nenhuma
menção a destino nessas duas seções — `createSessionWithDateRange` é sempre
chamado sem `destino`, então a sessão SEMPRE segue para `destino_pendente`
(ramo "sem destino" de RF-01.2, RF-04); o ramo "com destino"/`destino_confirmado`
de RF-01.3 nunca se aplica a esta tarefa, ao contrário de L6-T03/L6-T05.

**Fora de escopo desta tarefa (decisões documentadas, não esquecimentos)**:
- `alcance`/`experiencia` (RF-03.1 itens 2/3) não são persistidos em nenhum
  campo — `prisma/schema.prisma` não tem campo para nenhum dos dois, e
  `StageContext`/`buildDestinoPrompt` (`src/lib/gateway-ia/prompts.ts`,
  L3-T02) também não usam nenhum critério de alcance/experiência ao gerar
  sugestão de destino (RF-04.1 só menciona sazonalidade/época do ano). É uma
  lacuna real entre o que RF-03.1 coleta e o que RF-04 hoje usa, mas está
  fora do critério de aceite desta tarefa (que é só o range de datas) e
  exigiria uma decisão de schema/contrato (mesmo padrão do Bloqueio
  001/Adendo 1 do ADR-006) — sinalizado aqui como achado não-bloqueante para
  o Coordenador, sem entrada em `BLOCKERS.md` porque não impede a conclusão
  desta tarefa nem de nenhuma tarefa já `Concluída`.
- `orcamento` (RF-03.1 item 4, texto livre) não é persistido em
  `TripSession.budgetAmount`/`budgetCurrency` — `createSessionWithDateRange`
  não aceita orçamento como entrada, e estendê-lo agora exigiria editar um
  arquivo compartilhado com as 2 instâncias paralelas (L6-T03/L6-T05) em
  execução simultânea. Decisão de escopo (pequeno desvio, não escalado):
  normalizar texto livre em faixa de valor para um teto único fica para quem
  de fato aplicar RF-10 sobre orçamento (L7-T01 ou uma extensão futura desse
  helper).

**Ajuste estrutural**: `resolveSuggestedDateRange` é síncrona e precisa ser
testável isoladamente sem Server Action/banco — como um arquivo `"use
server"` só pode exportar funções assíncronas (mesma restrição já descrita
nas notas de L6-T03/L6-T05 para suas classes de erro), ela foi extraída para
`src/lib/actions/quiz-date-range.ts` (sem `"use server"`); `quiz.ts` importa
de lá e só exporta a Server Action assíncrona `submitQuizAnswers`.

**Testes**: `src/lib/actions/__tests__/quiz.test.ts` (5 casos, unitários,
sem banco) — `fim_de_semana`/`3_a_5_dias` priorizam o feriado prolongado
compatível mais próximo quando existe (busca dinâmica por um feriado real de
2030 que satisfaça `[min,max]`, sem hardcode de data mágica);
`1_semana`/`mais_de_1_semana` sempre caem no range padrão de 7/10 dias
(garantido pelo achado do bridge máximo de 4 dias); coerência geral
(início nunca antes da data de referência, fim nunca antes do início) para os
4 períodos. `src/lib/actions/__tests__/quiz.integration.test.ts` (6 casos,
integração real com Postgres, mesmo padrão de
`persistence.integration.test.ts`/`data-livre.integration.test.ts`): sessão
criada com `entryPath: "quiz"`, `flowState: "destino_pendente"`, sem
`DestinationApproval`; range coerente com o período para
`fim_de_semana`/`1_semana`/`mais_de_1_semana`; respostas de
alcance/experiência/orçamento não impedem a criação da sessão; chamada sem
período (RF-03.3) rejeitada sem criar sessão.

`npm run lint`, `npm test` (300 testes no total, sem regressão) e `npm run
build` passam sem erro (rotas `/entrada/quiz`/`/entrada/data-livre`/
`/entrada/feriados` confirmadas como estáticas, `○`; o erro de build
transitório mencionado nas notas de L6-T03/L6-T05 — `feriados.ts` exportando
classe de um arquivo `"use server"` — já estava corrigido por L6-T05 quando
esta tarefa terminou). Nenhum desvio de escopo/estimativa; nenhum arquivo do
módulo `session-flow` ou de `create-session-with-range.ts` foi alterado por
esta tarefa.

### Lote 7 — Resolução de Destino (T04, T05)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L7-T01 | Regra RF-04 — geração de 2-4 sugestões de destino via Gateway de IA + filtro de orçamento (RF-04.1/RF-10) | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03 | L7-T04, L7-T05 | Cada sugestão tem nome, justificativa curta, faixa de preço; respeita orçamento quando informado |
| L7-T02 | T04 UI — cartões de destino, estados (Loading/Error/Empty), ações aprovar/rejeitar-todas/informar-manual, rodapé de decisão | FE | 1 dia | L5-T03, L5-T04, L7-T01 | L7-T03 | 4 estados presentes conforme UX-SPEC §4; rodapé oferece "continuar" e "encerrar aqui" (RF-04.5) |
| L7-T03 | T04 Server Actions — aprovar (RF-04.3), rejeitar todas/nova rodada (RF-04.4), informar manualmente, encerrar aqui (RF-04.5 → T-END parcial) | BE | 1 dia | L4-T02, L7-T01 | L7-T02 | Aprovar avança para confirmação; rejeitar todas permite nova rodada ou entrada manual; encerrar preserva destino aprovado |
| L7-T04 | T05 UI — tela de confirmação de destino (RF-11) | FE | 0.5 dia | L5-T01 | L7-T01, L7-T05 | Nome do destino em destaque; botões "Confirmar e continuar" / "Trocar destino"; sempre aparece, mesmo vindo de T04 |
| L7-T05 | T05 Server Action — confirmar/trocar destino (RF-11) | BE | 0.5 dia | L4-T01, L4-T02 | L7-T01, L7-T04 | Confirmar avança para hospedagem; trocar volta ao campo de destino da tela de origem |

### Lote 8 — Hospedagem (T06)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L8-T01 | Regra RF-06 — geração de 3 opções de hospedagem via Gateway de IA + filtro de orçamento (RF-06.1/.2) | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03 | — | Sempre 3 opções, cada uma com nome/tipo, faixa de preço por diária, característica distintiva |
| L8-T02 | T06 UI — cartões, aprovar/ajustar (com feedback textual), rodapé de decisão | FE | 1 dia | L5-T03, L5-T04, L8-T01 | L8-T03 | "Ajustar" regenera a mesma etapa sem avançar (RF-05.3); rodapé oferece continuar/encerrar (RF-05.4) |
| L8-T03 | T06 Server Actions — aprovar avança (RF-06.3), ajustar regenera, encerrar aqui | BE | 1 dia | L4-T02, L8-T01 | L8-T02 | Aprovar persiste `AccommodationApproval` e avança para passeios |

### Lote 9 — Passeios (T07)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L9-T01 | Regra RF-07 — geração de lista de passeios/atividades, garantindo ao menos 1 opção gratuita quando existir (RF-07.1/.2) + filtro de orçamento | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03 | — | Cada item com nome, faixa de preço (podendo ser R$ 0), duração aproximada; ao menos 1 item gratuito quando relevante ao destino |
| L9-T02 | T07 UI — lista com checkbox, remoção antes de aprovar, badge "Gratuito", validação "ao menos um item" | FE | 1 dia | L5-T02, L5-T03, L9-T01 | L9-T03 | Botão "Aprovar seleção" desabilita/some se todos os itens forem removidos, com mensagem explicativa |
| L9-T03 | T07 Server Actions — aprovar seleção (RF-07.3), remover item, encerrar aqui | BE | 1 dia | L4-T02, L9-T01 | L9-T02 | Aprovar persiste `ActivityApproval` só dos itens não removidos e avança para roteiro |

### Lote 10 — Roteiro Final e Encerramento (T08, T-END)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L10-T01 | Regra RF-08 — geração do roteiro estruturado por dia (manhã/tarde/noite), sequenciamento por proximidade geográfica e horário ideal, com justificativa de timing (RF-08.1/.2/.3) — **depende da resolução de SPIKE-02** | BE | 1.5 dia (ver Seção 6 — justificativa de tamanho; sem estimativa final até SPIKE-02 resolver) | L3-T02, L3-T03, L3-T04, L9-T03, SPIKE-02 | L10-T04 | Todo dia do range tem bloco manhã/tarde/noite; toda atividade tem horário sugerido; RF-08.2 evita deslocamento redundante sempre que alternativa equivalente existir |
| L10-T02 | T08 UI — blocos por dia (acordeão em mobile), horário + justificativa de timing | FE | 1 dia | L5-T03, L10-T01 | L10-T03 | Um bloco por dia da viagem, dividido em manhã/tarde/noite; justificativa exibida quando presente |
| L10-T03 | T08 Server Action — aprovar roteiro (RF-08.4): grava `ItineraryItem`, marca sessão `concluida`, aciona RF-09 | BE | 1 dia | L4-T02, L10-T01 | L10-T02 | Aprovação persiste todos os itens do roteiro e marca `TripSession.status = completed` |
| L10-T04 | T-END UI — resumo (completo ou parcial), reutilizada em todo ponto de saída (RN-03) | FE | 1 dia | L5-T01 | L10-T01, L10-T02, L10-T03 | Rótulo "Viagem decidida!" (completo) ou "Parte da sua viagem está decidida" (parcial), nunca como erro |

### Lote 11 — Cross-cutting Final (Segurança, LGPD, Acessibilidade)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L11-T01 | Exclusão de conta e dados associados (LGPD, RNF-06) — endpoint + cascade delete de `TripSession` e entidades filhas por `user_id` | BE | 1 dia | L1-T02, L1-T03 | L11-T02, L11-T03 | Excluir conta remove todas as sessões e entidades filhas associadas; nenhum dado órfão remanescente |
| L11-T02 | Autorização cross-cutting — guard central checando dono do registro em toda rota que lê/escreve `TripSession` (SDD §7) | BE | 1 dia | L1-T03, L4-T02 | L11-T01, L11-T03 | Requisição com cookie/`user_id` de outra sessão recebe 403/404, nunca expõe dado de terceiro |
| L11-T03 | Validação/sanitização de entrada de texto livre (orçamento, destino manual) contra prompt injection (SDD §7) | BE | 0.5 dia | L3-T02 | L11-T01, L11-T02 | Entrada com tentativa de instrução embutida não altera o comportamento do prompt da etapa |
| L11-T04 | Revisão final de acessibilidade cross-tela (foco em transição, `aria-live`, contraste, alvo de toque ≥44px) sobre T00-T-END | FE | 1 dia | Todas as tarefas de tela dos Lotes 6, 7, 8, 9, 10 | — | Nenhuma pendência crítica de `accessibility-review`; checklist de WCAG AA aplicado em todas as telas |

### Refatoração Lote-1 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 1 (ver `QA-REPORT.md`/
`SECURITY-REVIEW.md`, 2026-09-08) — achado de severidade média em
dependência de terceiros, não bloqueante para o fechamento do Lote 1, mas
com prazo antes do primeiro deploy em produção (chapéu DevOps).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL1-T01 | Upgrade de `next` (14.2.35 → versão corrigida, ex. 16.x) para resolver vulnerabilidades de severidade alta identificadas via `npm audit`/`SECURITY-REVIEW.md` (SSRF, request smuggling, cache poisoning, DoS), com regressão completa (lint/test/build) pós-upgrade; compatível com TASK.md item 12 ("Next.js 14+"), sem necessidade de novo ADR | BE+FE | 0.5-1 dia | L1-T01 | — | Pendente | `npm audit` sem achado de severidade alta/crítica em `next`/dependências diretas de runtime; `npm run lint`, `npm test` e `npm run build` passam sem regressão; prazo: concluída antes do primeiro deploy em produção do projeto |

### Refatoração Lote-2 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 2 (ver `QA-REPORT.md`,
2026-09-08) — achado simples de cobertura de teste, não bloqueante para o
fechamento do Lote 2 (L2-T01/L2-T02 permanecem `Concluída`).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL2-T01 | Estender o teste de guardrail de RNF-07 ("Determinismo / independência de LLM", `src/lib/__tests__/holidays.test.ts`) para também varrer `src/lib/actions/feriados.ts` (e demais arquivos futuros do módulo de feriados) contra `gateway-ia\|openai\|fetch\(\|await fetch`, hoje restrito só a `holidays.ts` | BE | 0.25 dia | L2-T01, L2-T02 | — | Pendente | Teste automatizado falha caso `src/lib/actions/feriados.ts` (ou outro arquivo do módulo de feriados) passe a referenciar LLM/rede; `npm test` continua passando sem regressão; prazo sugerido: antes do fechamento do Lote 6 (quando a UI T02 passa a consumir este módulo em tela) |

### Refatoração Lote-3 (débito registrado pelo Validador)

Criada pelo Validador na auditoria de segurança (chapéu DevSecOps) do
Lote 3 (ver `SECURITY-REVIEW.md`, 2026-09-09) — achado de severidade
média, não bloqueante para o fechamento do Lote 3 (L3-T01 a L3-T05
permanecem `Concluída`), mas com prazo antes de qualquer deploy que
exponha `/api/gateway-ia/[etapa]` a tráfego público real.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL3-T01 | Integrar `checkGatewayIaRateLimit` (`src/lib/gateway-ia`, L3-T05) à rota `src/app/api/gateway-ia/[etapa]/route.ts` — a única rota HTTP pública do Gateway de IA hoje sem guarda de rate limit, alcançável por qualquer requisição externa assim que deployada (SDD §7/GUARDRAILS.md regra 19) | BE | 0.25 dia | L3-T05, L3-T02 | — | Pendente | Requisição além do limite configurado (`AI_GATEWAY_RATE_LIMIT_PER_MINUTE`) recebe erro tratável (não exceção não capturada) antes de qualquer chamada ao provider; chave de rate limit usa, no mínimo, IP da requisição até existir identificador de sessão real (Lote 4); prazo: antes do primeiro deploy que exponha esta rota a tráfego público, ou como controle compensatório equivalente no nível de borda/CDN, o que ocorrer primeiro |

### Refatoração Lote-5 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 5 (ver `QA-REPORT.md`/
`SECURITY-REVIEW.md`, 2026-09-09) — dois achados simples, não bloqueantes
para o fechamento do Lote 5 (L5-T01 a L5-T05 permanecem `Concluída`).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL5-T01 | Alinhar `background_color`/`theme_color` de `public/manifest.webmanifest` ao token real `--background` de `src/app/globals.css` (L5-T01, ~`#0a0a0b`), hoje divergente (`#0F172A`) | FE | 0.1 dia | L5-T01, L5-T05 | RL5-T02 | Pendente | `background_color`/`theme_color` do manifest correspondem ao valor real (hex equivalente) de `--background`; `pwa.test.ts` continua passando; sem regressão em `npm test`/`npm run build` |
| RL5-T02 | `StepperProgress` (`src/components/design-system/stepper-progress.tsx`) — adicionar texto `sr-only` (ou `aria-label`) equivalente ao `title` de cada `StepDot`, garantindo que o status de cada etapa (concluída/atual/futura) seja exposto de forma confiável a leitores de tela, já que `title` sozinho tem suporte inconsistente em navegação por virtual cursor | FE | 0.25 dia | L5-T01 | RL5-T01 | Pendente | Cada `StepDot` expõe o status via elemento com texto acessível (`sr-only`/`aria-label`), não só via `title`; teste automatizado cobrindo a presença do texto acessível; `npm test` sem regressão |

## 4. Dependências e Ordem de Execução

Ordem de lote recomendada (setas = depende de):

```
Lote 1 (Infra/Persistência)
  ├─→ Lote 2 (Feriados)
  ├─→ Lote 3 (Gateway de IA)          [SPIKE-01 resolvido — L3-T02 liberado]
  ├─→ Lote 4 (Orquestração/Orçamento)
  └─→ Lote 5 (Design System)          [SPIKE-01 resolvido — L5-T03 liberado]

Lotes 2+4+5 → Lote 6 (Telas de Entrada)
Lotes 3+4+5 → Lote 7 (Destino)        [Lote 6 não bloqueia Lote 7: telas de
                                        destino não dependem de telas de
                                        entrada estarem prontas, só do estado
                                        da sessão já existir — L4]
Lotes 3+4+5 → Lote 8 (Hospedagem)
Lotes 3+4+5 → Lote 9 (Passeios)
Lote 9 + Lote 3 → Lote 10 (Roteiro/Encerramento) [L10-T01 aguarda SPIKE-02]
Lotes 6+7+8+9+10 → Lote 11 (Cross-cutting final, L11-T04 é a última tarefa)

Lote 1 → Refatoração Lote-1 (RL1-T01) — sem bloquear nenhum outro lote;
  gate real é o primeiro deploy em produção (chapéu DevOps), não a ordem
  de execução dos demais lotes.
Lote 2 → Refatoração Lote-2 (RL2-T01) — sem bloquear nenhum outro lote;
  prazo sugerido é o fechamento do Lote 6, não a ordem de execução dos
  demais lotes.
Lote 3 → Refatoração Lote-3 (RL3-T01) — sem bloquear a ordem de execução
  dos demais lotes; gate real é o primeiro deploy (chapéu DevOps) que
  exponha `/api/gateway-ia/[etapa]` a tráfego público real, o que pode
  ocorrer já a partir do Lote 7 (primeira tela a consumir a rota via
  `LoadingStream`) — reavaliar prazo se o deploy incremental por lote for
  adotado antes do Lote 11.
Lote 5 → Refatoração Lote-5 (RL5-T01/RL5-T02) — sem bloquear nenhum outro
  lote; sem prazo crítico (achados simples, não de segurança/deploy).
```

Dentro de cada lote, "Paralelizável-com" na Seção 3 já indica quais tarefas
podem rodar simultaneamente por múltiplas instâncias do Executor. Regra geral
observada em todos os lotes: toda tarefa de UI de uma tela é paralelizável com
as tarefas de UI de outras telas do mesmo lote; toda tarefa de Server
Action/regra de negócio só inicia depois que sua contraparte de que depende
(regra de geração, ou state machine) estiver pronta, mas é paralelizável com
Server Actions de outras telas do mesmo lote.

Os Lotes 7, 8 e 9 são mutuamente independentes entre si na camada de regra de
negócio (cada um só depende dos Lotes 3/4/5) — podem ser executados em
paralelo por equipes/instâncias diferentes do Executor, não apenas as tarefas
dentro de um mesmo lote. O Lote 10 é o único que depende de outro lote de
tela (Lote 9) além da camada de fundação.

## 5. Riscos de Prazo

| Risco | Impacto | Mitigação |
|---|---|---|
| SPIKE-01 (streaming) — **resolvido em 2026-09-09** (ver Seção 2): decisão Route Handler + `ReadableStream`, L3-T02/L5-T03 liberados com estimativa restaurada | Risco encerrado — não atrasa mais Lote 3/5/7/8/9/10 | Resolvido dentro do timebox de 1 dia previsto; nenhuma reabertura de ADR necessária (consistente com a Seção 6, item sobre mecanismo de streaming) |
| SPIKE-02 (proximidade geográfica) não resolvido a tempo | Atrasa só L10-T01, mas L10-T01 é pré-requisito de todo o Lote 10 | Timebox de 1 dia; resultado aceitável mesmo que "melhor esforço" do LLM, dado que RF-08.2 já prevê "sempre que uma alternativa equivalente existir" — não é um requisito absoluto |
| Fundador (único executor humano de fato) toca este projeto em paralelo a outros três do portfólio (ver `CTO-REVIEW.md` Gate 1, ressalva 2) | Risco de capacidade real, não de decomposição | Fora do escopo deste TASK.md resolver; registrado aqui só para não se perder — parecer ad hoc de `capacity-and-timeline-validation` fica a critério do Gestor |
| L6-T06 (quiz wizard) e L10-T01 (roteiro) estimados acima de 1 dia-pessoa | Risco de subestimar esforço real de tarefas maiores que o alvo | Ambas justificadas na Seção 6 como inseparáveis; se a implementação real mostrar que passam de ~1.5-2 dias, sinal de que deveriam ter sido divididas — Executor deve escalar via `BLOCKERS.md` se isso ocorrer |
| Lote 3 (Gateway de IA) é pré-requisito de Lotes 7, 8, 9 e 10 | Qualquer atraso no Lote 3 propaga para 4 lotes de tela em cascata | Lote 3 deve ser priorizado logo após Lote 1; dentro dele, L3-T03/L3-T04 e L3-T05/L3-T02 já são paralelizáveis para reduzir o caminho crítico |

## 6. Lacunas Sinalizadas

**Divisões feitas durante o autocheck de granularidade (antes/depois):**

- Decomposição inicial havia sido pensada como "uma tarefa por tela" (9 telas
  + T-END = 10 tarefas). Isso violaria a regra de não-mistura em quase todas
  (cada tela combina UI + Server Action, e várias combinam também a regra de
  negócio de geração via LLM). Redividido para: 1 tarefa de UI + 1 tarefa de
  Server Action por tela, e, quando a tela depende de geração por LLM
  (T04/T06/T07/T08), mais 1 tarefa de regra de negócio de geração separada
  (L7-T01/L8-T01/L9-T01/L10-T01). Resultado: de 10 tarefas hipotéticas para
  24 tarefas reais nos Lotes 6-10.
- T05 (Confirmação de destino) inicialmente cogitada como tarefa única
  (tela pequena, "não vale a pena dividir") — mantida a divisão UI/Server
  Action (L7-T04/L7-T05) mesmo sendo uma tela simples, para manter a regra de
  não-mistura consistente em todo o TASK.md, evitando uma exceção implícita
  que geraria confusão de convenção para o Executor.
- Componentes de design system (Lote 5) inicialmente pensados como uma única
  tarefa "criar design system" foi dividido em 5 tarefas por família de
  componente (tokens+Stepper, Price/Budget, Loading/Error/Empty, Suggestion
  Card, PWA) para permitir paralelismo real entre eles (a maioria depende só
  de L5-T01, não uns dos outros).

**Tarefas mantidas acima de ~1 dia-pessoa (justificativa de inseparabilidade):**

- **L6-T06** (Quiz guiado, 1.5 dia): as 4 perguntas do wizard (RF-03.1) são
  extremamente parecidas em estrutura (uma tela de seleção por pergunta) e
  compartilham o mesmo componente de stepper e navegação linear; dividir em 4
  tarefas separadas fragmentaria um fluxo de UI coeso sem ganho real de
  paralelismo (são inerentemente sequenciais na experiência, RF-03), e cada
  uma isolada seria pequena demais para justificar overhead de tarefa própria.
- **L10-T01** (Regra de geração do roteiro, 1.5 dia): RF-08.2 (otimização de
  sequência) depende funcionalmente de RF-08.3 (horário ideal por atividade),
  conforme a própria tabela de dependências do `PRD-TECNICO.md` (Seção 5) —
  não é uma tarefa dividida em silêncio, é uma dependência interna já
  declarada como bloqueante no documento de origem.

**Lacunas estruturais encontradas na decomposição (não decididas em silêncio):**

- O `SDD.md` não define uma fonte de dado de geolocalização/proximidade real
  para RF-08.2 (sequenciamento do roteiro) — a arquitetura assume que essa
  ordenação vem do próprio LLM (sem integração de mapas), consistente com a
  decisão de não integrar APIs externas de preço/dado real no MVP (SDD §1,
  PRD-TECNICO.md Seção 4). Não abre novo ADR agora porque é consistente com a
  decisão arquitetural já tomada (ausência de integrações externas de dado
  real é um padrão deliberado do MVP, não uma omissão); registrado como
  SPIKE-02 para validar empiricamente antes de estimar L10-T01 com confiança.
  Se o spike revelar que o resultado é inaceitável, isso se torna uma
  lacuna estrutural real a escalar ao Gestor (custo de integrar geocoding
  real não estava previsto no SDD.md).
- O mecanismo exato de streaming (Server Action vs. Route Handler) não estava
  fechado no `SDD.md` (que só define "streaming quando disponível", SDD §2) —
  tratado como detalhe de implementação de alta incerteza técnica, coberto
  por SPIKE-01, não como lacuna estrutural que exigiria novo ADR — a escolha
  entre os dois mecanismos não muda nenhuma decisão arquitetural já registrada
  (ambos são Next.js server-side, compatíveis com ADR-001/006).

## Rascunho de GUARDRAILS.md

Produzido junto com este TASK.md — ver `.md/GUARDRAILS.md`.
