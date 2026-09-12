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
| SPIKE-02 | Estratégia de proximidade geográfica no roteiro (RF-08.2) sem API de mapas/geocoding real — o SDD.md não define fonte de dado de geolocalização; a ordenação por proximidade dependerá do conhecimento geral do LLM sobre o destino, não de coordenadas reais | Incerteza sobre qualidade de resultado sem validação empírica com o provider escolhido (ADR-002); risco de sequenciamento incoerente sem checagem prévia | L10-T01 (regra de geração do roteiro) | Antes do início do Lote 10 | **Resolvido** (2026-09-12, Executor/BE) |

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

### Resolução do SPIKE-02 (2026-09-12, Executor/BE)

**Decisão: nenhuma integração de mapas/geocoding real é adicionada** — RF-08.2
(evitar deslocamento redundante "sempre que uma alternativa equivalente
existir") e RF-08.3 (horário ideal por atividade) são resolvidos pedindo ao
próprio LLM, via `buildRoteiroPrompt` (L3-T02, `src/lib/gateway-ia/
prompts.ts`), para sequenciar por proximidade lógica/geográfica a partir dos
NOMES/tipos de destino, hospedagem e passeios já aprovados (contexto
estruturado, ADR-003), com uma justificativa textual de timing por item
quando fizer sentido — exatamente o que `buildRoteiroPrompt` já fazia desde
L3-T02 ("Priorize agrupar atividades geograficamente próximas no mesmo
bloco/dia sempre que uma alternativa equivalente existir"), sem necessidade
de nenhuma mudança no prompt/schema por causa deste spike.

Justificativa: (1) consistente com a decisão arquitetural já registrada de
não integrar dado externo real de preço/geolocalização no MVP (SDD.md §1/
PRD-TECNICO.md Seção 4) — abrir uma exceção só para RF-08.2 introduziria uma
dependência nova (API de mapas/geocoding, custo de integração e de operação
não previsto no SDD.md) para resolver um requisito que o próprio PRD-TECNICO
já qualifica como "sempre que uma alternativa equivalente existir", não
absoluto; (2) o "conhecimento geral" de um LLM como o do ADR-002 sobre bairros/
pontos turísticos de destinos populares (o caso majoritário de uso do
CurtaMais, viagens de lazer nacionais/internacionais comuns) é suficiente
para uma heurística de "agrupar o que é perto" plausível, mesmo sem
coordenadas reais — o risco de erro pontual (ex. sequenciar dois pontos
turísticos que na realidade ficam longe um do outro) é aceitável porque RF-08
já é, por natureza, uma SUGESTÃO de roteiro a ser ajustada pelo usuário na
prática, não um itinerário logisticamente garantido; (3) o custo de integrar
geocoding real (ex. Google Maps Distance Matrix/Places) incluiria chave de
API paga, tratamento de rate limit/erro adicional, e um redesenho de
`buildRoteiroPrompt`/`roteiroEstruturadoSchema` para carregar coordenadas —
esforço não estimado em nenhum documento anterior a este spike, e desalinhado
com o timebox de 1 dia definido para o spike; (4) o schema de saída
(`roteiroEstruturadoSchema`, `src/lib/gateway-ia/schemas.ts`) e o builder de
prompt (`buildRoteiroPrompt`) já implementados desde L3-T02 já refletiam
exatamente esta decisão (nenhum campo de coordenada/distância no schema,
instrução textual de "proximidade" no prompt) — o spike confirma que a
arquitetura já construída é a decisão correta, não descobre uma lacuna nova a
corrigir.

Trade-off aceito explicitamente: RF-08.2 é "melhor esforço" do modelo, sem
nenhuma validação determinística de que duas atividades sequenciadas no
mesmo bloco/dia estão de fato geograficamente próximas — não há dado de
geolocalização disponível em `generateRoteiro` (`src/lib/stage-rules/
roteiro.ts`, L10-T01) para checar isso automaticamente. Aceitável porque:
(a) RF-08.2 no PRD-TECNICO.md já é qualificado como "sempre que uma
alternativa equivalente existir", não um requisito absoluto/testável
deterministicamente; (b) a mitigação de qualidade de resposta do LLM já
existente (ADR-003: contexto estruturado, não texto livre; temperatura
conservadora 0.4, `src/lib/gateway-ia/index.ts`) se aplica igualmente aqui;
(c) se a qualidade do sequenciamento se mostrar inaceitável em uso real
(sinal a ser observado após deploy, não antecipável só com este spike), isso
se torna uma lacuna estrutural real a escalar ao Coordenador/Gestor para
avaliar o custo de uma integração de geocoding real — não decidido "em
silêncio" agora, registrado aqui como condição explícita de reabertura.

Nada foi implementado neste spike além da confirmação da decisão já refletida
em `buildRoteiroPrompt`/`roteiroEstruturadoSchema` (L3-T02) — a REGRA de
negócio que consome esses dois (`generateRoteiro`) é a própria L10-T01, ver
nota de implementação após a tabela do Lote 10 (Seção 3).

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

**Status do lote: Validado** (2026-09-10, Validador — chapéus QA e
DevSecOps aprovaram retroativamente; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`).
Nota de processo: este lote ficou sem validação registrada desde sua
conclusão (2026-09-09) — os Lotes 6/7/8/9/10, que dependem dele, começaram
antes desse gate ser fechado. Achado durante a checagem estrutural do Lote
7 e corrigido na mesma sessão, sem problema de código encontrado
retroativamente. Nenhum achado bloqueante; nenhuma tarefa de
`Refatoração Lote-4` criada.

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

**Status do lote: Validado** (2026-09-12, Validador — chapéu QA aprovou as
7 tarefas; ver `QA-REPORT.md`). Nenhum achado crítico ou simples; `RL2-T01`
(débito do Lote 2 com prazo "fechamento do Lote 6") confirmado `Concluída`.
Divergência entre as notas de implementação de L6-T03 e L6-T05 (criação de
sessão inline vs. helper compartilhado) confirmada já resolvida no código
atual (`submeterDataLivre` usa `createSessionWithDateRange`) — nenhuma ação
adicional necessária. `npm run build` não pôde ser reexecutado nesta sessão
por instabilidade de `node_modules` causada por outra instância concorrente
no mesmo repositório (mitigado por `tsc --noEmit` direcionado, sem erros nos
arquivos deste lote); recomenda-se reexecutar antes do deploy. Lote liberado
para a auditoria de segurança completa do chapéu DevSecOps.

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

**Status do lote: Validado com ressalvas** (2026-09-10, Validador — chapéus
QA e DevSecOps aprovaram as 5 tarefas; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`).
Achado de segurança de severidade média (sequenciamento de `L11-T03`,
sanitização de texto livre contra prompt injection, relativo a
`L8-T01`/`L9-T01`/`L10-T01` — já sinalizado sem resolução desde a auditoria
do Lote 3) registrado como Bloqueio 003 em `.md/BLOCKERS.md` — não bloqueou
o fechamento deste lote (nenhuma exploração possível na época, L8/L9/L10
não existiam), e foi resolvido pelo Coordenador em 2026-09-10: `L11-T03`
agora é dependência explícita de `L8-T01`/`L9-T01`/`L10-T01` (Seção 3), com
elegibilidade antecipada para logo após `L3-T02` (Seção 4) — ver nota de
resolução completa após a tabela do Lote 11. Checagem estrutural confirmou, adicionalmente, que o Lote 4 (do qual
este lote depende) nunca havia sido validado — corrigido retroativamente na
mesma sessão (ver `Status do lote` do Lote 4 acima), e que a extensão da
state machine (ADR-006 Adendo 2, `src/lib/session-flow/`) foi puramente
aditiva, sem regressão em L4-T01/L4-T02.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L7-T01 | Regra RF-04 — geração de 2-4 sugestões de destino via Gateway de IA + filtro de orçamento (RF-04.1/RF-10) | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03 | L7-T04, L7-T05 | Concluída | Cada sugestão tem nome, justificativa curta, faixa de preço; respeita orçamento quando informado |
| L7-T02 | T04 UI — cartões de destino, estados (Loading/Error/Empty), ações aprovar/rejeitar-todas/informar-manual, rodapé de decisão | FE | 1 dia | L5-T03, L5-T04, L7-T01 | L7-T03 | Concluída | 4 estados presentes conforme UX-SPEC §4; rodapé oferece "continuar" e "encerrar aqui" (RF-04.5) |
| L7-T03 | T04 Server Actions — aprovar (RF-04.3), rejeitar todas/nova rodada (RF-04.4), informar manualmente, encerrar aqui (RF-04.5 → T-END parcial) | BE | 1 dia | L4-T02, L7-T01 | L7-T02 | Concluída | Aprovar avança para confirmação; rejeitar todas permite nova rodada ou entrada manual; encerrar preserva destino aprovado |
| L7-T04 | T05 UI — tela de confirmação de destino (RF-11) | FE | 0.5 dia | L5-T01 | L7-T01, L7-T05 | Concluída | Nome do destino em destaque; botões "Confirmar e continuar" / "Trocar destino"; sempre aparece, mesmo vindo de T04 |
| L7-T05 | T05 Server Action — confirmar/trocar destino (RF-11) | BE | 0.5 dia | L4-T01, L4-T02 | L7-T01, L7-T04 | Concluída | Confirmar avança para hospedagem; trocar volta ao campo de destino da tela de origem |

Nota de implementação L7-T01 (2026-09-10, Executor/BE): implementada a regra
RF-04.1/RF-10 como função pura assíncrona `generateDestinationSuggestions` em
`src/lib/stage-rules/destino.ts`, reexportada via `src/lib/stage-rules/index.ts`
(novo módulo, mesma convenção de fronteira única de `@/lib/gateway-ia`/
`@/lib/session-flow` — nunca importar `./destino` diretamente). É o ponto de
junção entre as duas camadas já prontas: chama
`generateStructuredCompletionWithRetry` (L3-T04 — retry único + escrita em
`LlmGenerationLog`, nunca `generateStructuredCompletion` direto, conforme nota
de L3-T04) para a etapa "destino", reaproveitando o registro central de
prompt/schema já existente (`buildDestinoPrompt`/`destinoSugestoesSchema`,
`src/lib/gateway-ia/prompts.ts`/`schemas.ts`, L3-T02) sem reconstruir nenhum
dos dois; em seguida aplica `applyBudgetFilter` (RF-10, L4-T03,
`src/lib/session-flow/budget-filter.ts`) sobre a lista de 2-4 destinos
retornada, convertendo `budgetAmount` (quando informado) para o
`BudgetInput` que a função espera. Nunca bloqueia por orçamento (RN-04): sem
`budgetAmount`, todas as sugestões voltam com `withinBudget: true`/
`exceedsBudget: false`, na ordem original.

**Decisão de escopo pequena (não escalada)**: criado o diretório novo
`src/lib/stage-rules/` para abrigar as regras de negócio por etapa (destino
aqui; hospedagem/passeios/roteiro ficam para L8-T01/L9-T01/L10-T01,
seguindo o mesmo padrão de um arquivo por etapa reexportado no `index.ts`).
Nem `gateway-ia` (agnóstico ao domínio de viagens, por design — ver
cabeçalho de `src/lib/gateway-ia/index.ts`) nem `session-flow` (camada de
persistência/state machine, não de geração) eram o lugar certo para esta
combinação específica "chamar o LLM da etapa + aplicar RF-10"; um módulo
próprio evita inflar qualquer um dos dois com responsabilidade que não é
deles. Interface pública: `generateDestinationSuggestions(input)` recebe
`sessionId` + o subconjunto de `StageContext` relevante à etapa destino
(datas + orçamento opcional) e devolve
`DestinationSuggestionResult[]` (`name`, `justification`, `priceRangeMin`,
`priceRangeMax`, `withinBudget`, `exceedsBudget`) — shape achatado, não o
`BudgetFilteredSuggestion<T>` genérico de `applyBudgetFilter`, para o
chamador (Server Action de L7-T03) não precisar conhecer o formato interno
de `session-flow`.

**Fora de escopo desta tarefa (mantido para as tarefas futuras que já
dependem de L7-T01 na tabela acima)**: Server Action de tela e persistência
de `DestinationApproval` (L7-T03, via `applySessionFlowTransition` já pronto
desde L4-T02); UI de cartões/estados (L7-T02); resolução/checagem de dono da
sessão (L11-T02) — esta função recebe `sessionId` já resolvido pelo
chamador, sem tocar `TripSession`/Prisma diretamente (só o faz
indiretamente, via `generateStructuredCompletionWithRetry`, para
`LlmGenerationLog`).

Nota de implementação L7-T03 (2026-09-10, Executor/BE): 5 funções em novo
Server Action `"use server"` `src/lib/actions/destino.ts` cobrindo RF-04.3/
.4/.5 e o atalho manual de T04 (UX-SPEC.md). Nenhuma chama `prisma`
diretamente para escrita — toda persistência passa por
`applySessionFlowTransition` (`@/lib/session-flow`, L4-T02); a única leitura
direta ao Prisma é `prisma.tripSession.findUnique` em `gerarSugestoesDestino`,
para montar o contexto (`dateRangeStart`/`dateRangeEnd`/`budgetAmount`/
`budgetCurrency`) exigido por `generateDestinationSuggestions` (L7-T01).

**Investigação da possível inconsistência RF-04.5 × state machine (apontada
na atribuição desta tarefa) — CONCLUÍDA, NÃO é uma inconsistência real**:
`UX-SPEC.md` (`### T04`, linhas 86-88) é explícito — "Depois de aprovar um
bloco, aparece o rodapé de decisão: 'Continuar para hospedagem' ou 'Só queria
decidir o destino — encerrar aqui' (RF-04.5)" — ou seja, a opção "encerrar
aqui" só é oferecida DEPOIS de um destino já ter sido aprovado em T04, quando
a sessão já está em `destino_confirmado`, não antes (não existe rodapé de
decisão em `destino_pendente`, antes da aprovação). `destino_confirmado` JÁ
está entre os estados elegíveis para a ação `encerrar`
(`STATES_WITH_AT_LEAST_ONE_APPROVAL`, `src/lib/session-flow/state-machine.ts`,
L4-T01) — a hipótese de bloqueio não se confirmou. `encerrarResolucaoDestino`
(função 5 abaixo) só chama `applySessionFlowTransition({action: "encerrar"})`
a partir de uma sessão que já passou por `aprovarDestinoSugerido`/
`informarDestinoManualmente`; nenhuma tentativa de encerrar a partir de
`destino_pendente` é feita por este módulo. Um teste de integração dedicado
(`encerrarResolucaoDestino` chamado sobre uma sessão ainda em
`destino_pendente`) prova, programaticamente, que a state machine continua
rejeitando esse caso com `InvalidTransitionError` (comportamento correto e
esperado — reforça que a UI de L7-T02 não deve oferecer o botão antes da
aprovação, consistente com o próprio `UX-SPEC.md`).

**As 5 funções exportadas**:
1. `gerarSugestoesDestino(sessionId)` — RF-04.1, usada tanto para o
   carregamento inicial de T04 quanto para "nova rodada" após "Nenhum me
   interessa" (RF-04.4): a mesma função, chamada de novo pela UI, sem
   nenhuma transição de estado (permanece em `destino_pendente`). Lê a
   `TripSession` (`SessionNotFoundError` se não existir), valida
   `flowState === "destino_pendente"` (`DestinoEtapaInvalidaError` caso
   contrário — evita gastar uma chamada ao Gateway de IA para uma sessão que
   não está aguardando destino) e `dateRangeStart`/`dateRangeEnd` presentes
   (`DestinoContextoIncompletoError`, guarda defensiva — nunca deveria
   disparar, dado que toda sessão em `destino_pendente` passou por
   `createSessionWithDateRange`), então delega a `generateDestinationSuggestions`
   (`@/lib/stage-rules`, L7-T01).
2. `aprovarDestinoSugerido({ sessionId, suggestion })` — RF-04.3. Revalida o
   payload da sugestão antes de persistir (`assertValidSuggestionPayload`:
   nome/justificativa não vazios, faixa de preço numérica/não-negativa/não-
   invertida/dentro de um teto de sanidade) — nunca confia cegamente no que
   volta do cliente, mesmo sendo dado originalmente gerado pelo próprio
   servidor (Diretriz de Implementação 9, TASK.md Seção 1). Payload inválido
   lança `InvalidDestinoSuggestionError` antes de qualquer chamada a
   `applySessionFlowTransition` (nada é persistido). Válido, chama
   `applySessionFlowTransition("aprovar", { stage: "destino", source:
   "ia_suggested", ... })`.
3. `informarDestinoManualmente({ sessionId, destino })` — atalho "Já sei o
   destino, quero informar" (`UX-SPEC.md`, disponível a qualquer momento em
   T04, não só depois de rejeitar todas). Diferente de `submeterDataLivre`
   (L6-T03), aqui destino é OBRIGATÓRIO — vazio após trim lança
   `InvalidManualDestinoError` (não é tratado como "sem destino", já que essa
   é literalmente a única finalidade desta função); trim + truncagem em
   `DESTINO_MAX_LENGTH = 200` (mesmo limite de L6-T03/L6-T05). Aprova com o
   mesmo placeholder de preço já adotado por `createSessionWithDateRange`
   (`source: "user_provided"`, `justification: null`, `priceRangeMin`/`Max:
   0`).
4. RF-04.4 "rejeitar todas" não tem função dedicada — decisão de design: a UI
   chama `gerarSugestoesDestino` de novo para "nova rodada", ou
   `informarDestinoManualmente` para o caminho de entrada manual;
   `destino_pendente` já é o estado de repouso desta tela, não há transição
   de estado a registrar só por "rejeitar".
5. `encerrarResolucaoDestino(sessionId)` — RF-04.5 → T-END parcial. Só
   `applySessionFlowTransition({ action: "encerrar" })`; preserva o
   `DestinationApproval` já aprovado (RN-03, garantido estruturalmente por
   `applySessionFlowTransition`/L4-T02, testado aqui de novo para o caminho
   específico desta tarefa).

Erros dedicados em `src/lib/actions/destino-errors.ts` (sem `"use server"`,
mesmo motivo/padrão de `data-livre-errors.ts`/`feriados-errors.ts` — Next.js
proíbe classe exportada de arquivo `"use server"`):
`DestinoEtapaInvalidaError`, `DestinoContextoIncompletoError`,
`InvalidDestinoSuggestionError`, `InvalidManualDestinoError`.

**Testes (L7-T03)**: `src/lib/actions/__tests__/destino.integration.test.ts`
(14 casos), mesmo padrão híbrido já usado por
`stage-rules/__tests__/destino.test.ts` (mock de
`generateStructuredCompletionWithRetry` via `@/lib/gateway-ia`, nenhuma
chamada de rede real) combinado com integração real de persistência contra o
Postgres de desenvolvimento (mesmo padrão de
`data-livre.integration.test.ts`/`persistence.integration.test.ts`), cobrindo
o critério de aceite: gerar sugestões sem persistir nada + nova rodada sem
mudar de estado (RF-04.4); `SessionNotFoundError`/`DestinoEtapaInvalidaError`;
aprovar sugestão persiste com `source: "ia_suggested"` e avança para
`destino_confirmado` (RF-04.3); payload adulterado (faixa invertida, nome
vazio) rejeitado sem persistir; aprovar uma sessão já `destino_confirmado`
propaga `InvalidTransitionError` (via `applySessionFlowTransition`, sem
duplicar essa validação); destino manual persiste com `source:
"user_provided"`/`justification: null`/preço `0`/`0`, rejeita vazio, trunca
acima do limite; encerrar a partir de `destino_confirmado` preserva
`DestinationApproval` (RN-03) e sincroniza `status: "partial"`; encerrar a
partir de `destino_pendente` continua rejeitado (prova da investigação
acima).

**Execução nesta sessão de trabalho**: `npm run lint` e `npm run build`
passam sem regressão (build confirma `/destino`/`/destino/confirmacao` já
presentes como rotas dinâmicas — artefatos das tarefas paralelas L7-T02/
L7-T04 deste mesmo lote, não tocadas por esta tarefa). `npm test` **não pôde
validar os 14 casos de integração desta tarefa nem reconfirmar os demais
testes de integração já existentes do projeto** (`persistence.integration.test.ts`,
`data-livre.integration.test.ts` etc.) — o Postgres de desenvolvimento
(`localhost:55432`) não estava acessível nesta sessão de execução (`docker`
indisponível no ambiente desta instância do Executor;
`PrismaClientInitializationError: Can't reach database server`), uma
limitação de ambiente desta sessão, não uma falha de código: todos os testes
puramente unitários/mockados do restante da suíte passaram normalmente (286
casos antes desta tarefa), e todos os casos que falharam (os 14 novos desta
tarefa incluídos) falharam exclusivamente com esse mesmo erro de
conectividade, nenhum erro de compilação/tipo/asserção — reforçado por `npm
run build` ter compilado e type-checado `destino.ts`/`destino-errors.ts`/o
teste novo com sucesso (o build do Next.js faz checagem de tipo completa,
incluindo os tipos gerados pelo Prisma Client a partir do `schema.prisma`
real). **Ação pendente antes de fechar esta tarefa como `Concluída`**: rodar
`npm test` novamente num ambiente com Postgres acessível em
`localhost:55432` para confirmar os 14 casos novos e a ausência de regressão
nos demais testes de integração do lote.

Arquivos novos: `src/lib/actions/destino.ts`, `src/lib/actions/destino-errors.ts`,
`src/lib/actions/__tests__/destino.integration.test.ts`. Nenhum arquivo
existente foi alterado (nenhuma colisão esperada com L7-T02/L7-T04/L7-T05,
tarefas paralelas do mesmo lote). Fora de escopo desta tarefa: UI de T04
(L7-T02); tela/Server Action de T05 — confirmação explícita de destino
(RF-11, L7-T04/L7-T05) — `aprovarDestinoSugerido`/`informarDestinoManualmente`
só retornam `proximaEtapa: "confirmacao_destino"`, a navegação/persistência
de T05 em si é de outra tarefa; autorização de dono de sessão (L11-T02).
Nenhum desvio de escopo/estimativa nesta tarefa.

**Testes**: `src/lib/stage-rules/__tests__/destino.test.ts`, 6 casos
(unitários, `@vitest-environment node`, mesmo padrão de
`src/lib/gateway-ia/__tests__/index.test.ts`) — `generateStructuredCompletionWithRetry`
mockada via `vi.mock("@/lib/gateway-ia", ...)` com `importOriginal` (os
demais exports do módulo, como `buildDestinoPrompt`/`destinoSugestoesSchema`,
permanecem reais), nenhuma chamada de rede real: critério de aceite (cada
sugestão tem nome/justificativa/faixa de preço); chamada correta ao Gateway
de IA (`sessionId`, `stage: "destino"`, `schemaName`, mensagens
system+user); sem orçamento nunca bloqueia (RF-10.3/RN-04); com orçamento,
reordena as dentro da faixa primeiro (RF-10.1); nenhuma opção na faixa
devolve a mais barata primeiro com `exceedsBudget: true`, sem erro nem lista
vazia (RF-10.2); erro do Gateway de IA (falha após retry) propaga sem ser
mascarado.

`npm run lint` (sem warnings/erros), `npx vitest run src/lib/stage-rules`
(6/6 passam) e a suíte completa (`npm test`, 306 testes: 272 passam, 34
falham — todas as falhas são testes de integração pré-existentes de
`persistence.integration.test.ts`/outros que exigem Postgres real em
`localhost:55432`, não disponível neste ambiente; confirmado que a mesma
contagem de falhas ocorre independentemente desta tarefa, sem relação com o
código novo) e `npm run build` (rotas inalteradas, build limpo) passam sem
regressão. Nenhum desvio de escopo/estimativa; nenhum arquivo de
`gateway-ia`/`session-flow` foi alterado por esta tarefa (só consumidos via
suas fronteiras públicas já existentes).

Nota de implementação/bloqueio L7-T05 (2026-09-10, Executor/BE): implementada
SÓ a parte "Confirmar e continuar" do critério de aceite. Server Action
`confirmarDestino` em novo módulo `src/lib/actions/confirmacao-destino.ts`
(`"use server"`, mesmo padrão de `submeterDataLivre`, L6-T03): revalida
`sessionId` no servidor e delega para `applySessionFlowTransition({ sessionId,
action: "avancar" })` (`@/lib/session-flow`, L4-T02) — nunca chama `prisma`
diretamente (Diretriz de Implementação 3). A partir do estado onde a tela T05
vive (`destino_confirmado`), `avancar` é a única ação válida na state machine
de L4-T01 e leva a `hospedagem_pendente`, batendo exatamente com "Confirmar
avança para hospedagem" do critério de aceite. Erro de validação de input
próprio (`InvalidConfirmacaoDestinoInputError`,
`src/lib/actions/confirmacao-destino-errors.ts`, mesmo motivo de separação de
arquivo de `data-livre-errors.ts`: classe de erro não pode ser exportada de um
arquivo `"use server"`).

**"Trocar destino" NÃO foi implementada nesta tarefa — bloqueio real,
registrado em `.md/BLOCKERS.md` (Bloqueio 002, status Aberto, escalado para o
coordenador)**: investigada a state machine de L4-T01
(`src/lib/session-flow/state-machine.ts`, `SEQUENTIAL_TRANSITIONS`) e
confirmado que ela não tem nenhuma transição regressiva — a partir de
`destino_confirmado`, a única ação modelada é `avancar`; não existe ação
`voltar`/`trocar`/equivalente que leve de volta a `destino_pendente` (ou a
qualquer estado anterior), nem na tabela de transições sequenciais nem no
tratamento especial de `encerrar`. Isso é uma lacuna real entre o critério de
aceite desta tarefa ("trocar volta ao campo de destino da tela de origem") e a
state machine já implementada e validada em L4-T01/L4-T02 — não uma ambiguidade
de leitura. Conforme os Guardrails deste papel (nunca inventar uma transição
nova na state machine por conta própria, nunca decidir sozinho um desvio
grande de escopo), nenhuma função `trocarDestino`/Server Action equivalente foi
criada; nenhum arquivo de `session-flow` foi alterado. O cabeçalho de
`confirmacao-destino.ts` documenta explicitamente essa decisão para quem
consumir o módulo (L7-T04, UI da mesma tela, rodando em paralelo agora) — ver
Bloqueio 002 para as duas opções de resolução levantadas (nova transição
regressiva vs. navegação client-side pura sem tocar `flowState`, nenhuma delas
decidida aqui) e o detalhamento do porquê nenhuma delas se resolve sozinha sem
uma decisão de arquitetura do Coordenador.

**Testes**: `src/lib/actions/__tests__/confirmacao-destino.integration.test.ts`
(mesmo padrão de integração real com Postgres de
`data-livre.integration.test.ts`/`persistence.integration.test.ts`), 3 casos —
confirmar avança `destino_confirmado`→`hospedagem_pendente` preservando a
`DestinationApproval` já aprovada (critério de aceite); confirmar a partir de
um estado que não é `destino_confirmado` rejeita com `InvalidTransitionError`
sem persistir nada (não pula etapa); `sessionId` ausente/vazio rejeita com
`InvalidConfirmacaoDestinoInputError` sem consultar o banco. Nenhum teste foi
escrito para "trocar destino", de propósito — não há comportamento
implementado para testar.

`npm run lint` (sem warnings/erros) e `npm run build` (build limpo, nenhuma
rota nova — Server Action, não Route Handler) passam sem regressão. `npm test`
(309 testes no total, 3 novos desta tarefa): 273 passam, 36 falham — 34 falhas
pré-existentes (mesmo ambiente sem Postgres local em `localhost:55432`, já
documentado desde L4-T02/L7-T01) + 2 das 3 novas (as que exigem banco real; o
3º caso, validação de `sessionId` vazio, não depende de banco e passa).
Confirmado que a contagem de falhas pré-existentes não mudou. Nenhum desvio de
escopo/estimativa além do bloqueio já descrito acima.

Nota de implementação L7-T02 (2026-09-10, Executor/FE): UI da tela T04
(Sugestões de destino, UX-SPEC.md Seção 2/4, RF-04.3/.4/.5) em
`src/components/destino/destino-sugestoes-screen.tsx`
(`DestinoSugestoesScreen`), montada na rota `src/app/destino/page.tsx`
(convenção de rota `/destino`, reservada por L7-T04 no próprio cabeçalho de
`src/app/destino/confirmacao/page.tsx`: "Uma futura rota /destino (T04,
sugestões — L7-T02) deve manter o mesmo prefixo `/destino/...`" — seguida à
risca). No momento em que esta tarefa chegou a este ponto, as Server Actions
reais de L7-T03 (`src/lib/actions/destino.ts`: `gerarSugestoesDestino`,
`aprovarDestinoSugerido`, `informarDestinoManualmente`,
`encerrarResolucaoDestino`) já estavam implementadas (tarefa paralela
concluída antes desta), então a integração é real, não uma suposição de
interface — nenhuma lógica de negócio/persistência foi reimplementada aqui
(Diretriz de Implementação 3), só consumida pelas assinaturas já publicadas.

**4 estados (critério de aceite, UX-SPEC §4)**: `LoadingStream`/
`ErrorRetryState`/`EmptyState` (L5-T03) e `SuggestionCard`/
`BudgetInsufficientBanner` (L5-T04/L5-T02) reutilizados sem duplicar lógica
de estado (Diretriz de Implementação 11). **Decisão de integração
documentada no cabeçalho do componente** (dentro da margem de detalhe de
implementação do Executor, não escalada): `LoadingStream` foi desenhado para
consumir o Route Handler de streaming bruto (`/api/gateway-ia/[etapa]`,
SPIKE-01) — mecanismo que só entrega texto incremental para PERCEPÇÃO de
progresso, sem retry/validação/filtro de orçamento (comentário já existente
em `src/lib/gateway-ia/index.ts` desde L3-T02: "a etapa real usa
generateStructuredCompletion para a decisão de negócio"). A decisão real de
T04 usa `gerarSugestoesDestino` (não-streaming, com retry único + RF-10 já
aplicados). Compor os dois mecanismos diretamente exigiria ou (a) duas
chamadas ao provider por carregamento de tela (uma de streaming bruto só
para efeito visual + uma real para a decisão, sem ADR que autorize esse
custo dobrado), ou (b) reimplementar a lógica de estado de `LoadingStream`
localmente (proibido pela Diretriz 11). Resolvido reutilizando o ponto de
extensão já existente `fetchImpl` de `LoadingStream` (criado em L5-T03 para
testes) para ligar o componente à Server Action real: `fetchImpl` chama
`gerarSugestoesDestino`, aguarda o resultado já validado/filtrado por
orçamento, e entrega como um único chunk de um `ReadableStream` sintético —
o usuário vê o mesmo skeleton/`aria-live="polite"` de sempre enquanto a
Server Action está em voo, sem nenhuma chamada adicional ao Gateway de IA e
sem nenhum código de streaming novo. Mesmo mecanismo reaproveitado para "nova
rodada" (RF-04.4) via remount (`key={loadKey}`, incrementado a cada retry/
nova rodada).

**Fluxo de estados implementado**: `loading` (carregando) → `success`
(cartões, via `SuggestionCard`, com preço sempre via `PriceRangeBadge`
embutido, Diretriz 6) → aprovar um cartão (`aprovarDestinoSugerido`) exibe o
rodapé de decisão (RF-04.5: "Continuar para hospedagem" navega para
`/destino/confirmacao?sessionId&destino&flowState=destino_confirmado`, a
rota de T05 já publicada por L7-T04 — a aprovação em si já avança
`destino_pendente`→`destino_confirmado`, T05 é quem confirma explicitamente
depois, RF-11; "Só queria decidir o destino — encerrar aqui" chama
`encerrarResolucaoDestino` e navega para `/encerramento?sessionId&flowState=
encerrada_parcial`, rota assumida para T-END/L10-T04, ainda não implementada
— 404 esperado até aquele lote, mesmo padrão de gap documentado já aceito em
outras notas deste TASK.md, ex. rodapé de `DestinoConfirmacaoScreen`/L7-T04
sem `onConfirmar`/`onTrocar` wired). "Nenhum me interessa — gerar outras
opções" (RF-04.4) leva a `empty` (`EmptyState`, ações "Gerar novas
sugestões"/nova rodada e "Informar destino manualmente"); "Já sei o destino,
quero informar" (atalho, disponível também direto do estado de sucesso)
abre um formulário inline que chama `informarDestinoManualmente`. Falha de
`gerarSugestoesDestino` (após o retry único do servidor) vai para `error`
(`ErrorRetryState`, mensagem exata do UX-SPEC.md Seção 4: "Não conseguimos
gerar sugestões agora — tentar novamente"), com `onRetry` reiniciando via
`loadKey`. `BudgetInsufficientBanner` exibido quando alguma sugestão tem
`exceedsBudget: true` (RF-10.2), nunca desabilitando os botões de aprovar
(RN-04, testado explicitamente). `StepperProgress` reflete
`destino_confirmado` só depois de uma aprovação, `destino_pendente` antes.

**Acessibilidade (UX-SPEC §5)**: título da etapa com foco ao montar (mesmo
padrão de `FeriadosScreen`/`DestinoConfirmacaoScreen`); erros de ação
(aprovar/manual/encerrar) via `role="alert"` + ícone + texto, nunca só cor;
alvo de toque `min-h-11` nos botões principais; formulário manual com
`aria-describedby` ligando o erro ao campo (mesmo padrão de
`T01DateRangeForm`/L6-T02).

**Fora de escopo desta tarefa**: lógica das Server Actions em si (L7-T03, já
pronta, só consumida); tela T05 (L7-T04, já pronta, só linkada via
querystring); T-END (L10-T04, ainda não existe — link `/encerramento`
assumido, documentado acima); autorização de dono de sessão (L11-T02).

**Testes**: `src/components/destino/__tests__/destino-sugestoes-screen.test.tsx`
(11 casos, Server Actions reais substituídas por dublês via um prop de
injeção `actionsOverride` do próprio componente — nenhum mock de módulo
inteiro, nenhuma chamada de rede/banco real) — cobre os 4 estados (critério
de aceite: skeleton de `LoadingStream` antes da resolução; cartões com preço
formatado no estado de sucesso; `ErrorRetryState` após falha com retry
funcional; `EmptyState` com as duas ações de RF-04.4), `BudgetInsufficientBanner`
não bloqueando o botão de aprovar (RN-04), aprovar exibindo o rodapé de
decisão (RF-04.5) com as duas ações, navegação exata de "Continuar para
hospedagem" (querystring completa) e de "encerrar aqui" (chamando
`encerrarResolucaoDestino` antes de navegar), e o atalho de destino manual
tanto a partir do sucesso quanto do vazio.

`npm run lint` (sem warnings/erros), `npx vitest run src/components/destino`
(20/20 passam — 9 já existentes de `DestinoConfirmacaoScreen`/L7-T04 + 11
novos desta tarefa) e `npm run build` (rota `/destino` aparece como dinâmica,
`ƒ`, junto de `/destino/confirmacao`) passam sem regressão. `npm test`
(349 testes: 300 passam, 49 falham — todas as falhas são testes de
integração pré-existentes que exigem Postgres real em `localhost:55432`,
não disponível neste ambiente, mesmo padrão já confirmado não-relacionado a
este código na nota de L7-T01; nenhuma falha em teste unitário/de componente).
Nenhum desvio de escopo/estimativa; nenhum arquivo de
`gateway-ia`/`session-flow`/`stage-rules`/`src/lib/actions/destino.ts`/
`src/components/destino/destino-confirmacao-screen.tsx`/
`src/app/destino/confirmacao/page.tsx` foi alterado por esta tarefa (só
consumidos via suas fronteiras públicas já existentes) — evitando colisão
com as demais instâncias em paralelo no mesmo lote.

Nota de implementação L7-T04 (2026-09-10, Executor/FE): tela T05 (UX-SPEC.md
Seção 2/4, RF-11) implementada como `DestinoConfirmacaoScreen`
(`src/components/destino/destino-confirmacao-screen.tsx`, "use client",
componente de apresentação puro): título "Confirme seu destino" com foco
gerenciado ao montar (`tabIndex={-1}` + `useEffect`, UX-SPEC §5), nome do
destino em destaque (`font-serif text-3xl text-accent`), `StepperProgress`
(L5-T01, `currentState` default `destino_confirmado` — destino aparece
`completed`, hospedagem `current`) e os dois botões exigidos pelo critério de
aceite ("Confirmar e continuar"/"Trocar destino", `min-h-11`, RNF-04), cada um
com estado de "processando" próprio enquanto aguarda confirmação do servidor
(UX-SPEC §7: "todo botão de avanço mostra estado de processando... distinto do
`LoadingStream`") e erro acessível (`role="alert"`, ícone + texto, nunca só
cor) se a ação falhar — sem travar a tela (botões continuam habilitados para
nova tentativa).

**Rota**: `/destino/confirmacao` (`src/app/destino/confirmacao/page.tsx`,
Server Component fino) — decisão de convenção desta tarefa (nenhum namespace
prévio para telas de destino em `SDD.md`/`UX-SPEC.md`), espelhando o
identificador `proximaEtapa: "confirmacao_destino"` já usado por
`submeterDataLivre`/`processarFeriadoEscolhido`/`aprovarDestinoSugerido`/
`informarDestinoManualmente` (L6-T03/L6-T05/L7-T03). `sessionId`/`destino`
chegam via querystring (RF-11: "recebido via prop/query"); sem um dos dois a
página redireciona para `/` (`next/navigation` `redirect`) em vez de renderizar
uma tela quebrada — T05 nunca aparece sem um destino resolvido pelo servidor.
`flowState` é opcional e só ajusta o `StepperProgress`; valor ausente/inválido
usa o default seguro `destino_confirmado`. Nenhuma tela de origem (T01/T02/T03/
T04) foi alterada para navegar até aqui de fato — integração cross-lote deixada
para uma tarefa futura, mesmo padrão já registrado nas notas de L6-T02/L6-T03 e
reafirmado por L7-T03 ("a navegação/tela em si é de outra tarefa").

**"Sempre aparece, mesmo vindo de T04" (RF-11)**: garantido estruturalmente —
`DestinoConfirmacaoScreen`/a rota não sabem nem precisam saber se `destino`
veio de um destino informado manualmente (T01/T02/T03, `source:
"user_provided"`) ou de uma sugestão aprovada em T04 (`source:
"ia_suggested"`, L7-T03) — ambos os caminhos produzem `proximaEtapa:
"confirmacao_destino"` com o mesmo shape (`sessionId`/`flowState`/`destino`),
então a mesma rota/componente atende os dois sem ramificação.

**Server Action real (L7-T05) e o impacto do Bloqueio 002**: como
`src/lib/actions/confirmacao-destino.ts` (L7-T05, tarefa irmã paralela) ficou
pronta ainda durante a execução desta tarefa, a UI foi acoplada à Server
Action real em vez de ficar com um prop não-wireado — novo wrapper "use
client" `src/app/destino/confirmacao/confirmacao-destino-client.tsx`
(necessário porque `page.tsx` precisa continuar Server Component para poder
chamar `redirect()`) passa `onConfirmar={confirmarDestino}` diretamente. Para
"Trocar destino", `confirmarDestino` (L7-T05) documenta explicitamente no
próprio cabeçalho — e `.md/BLOCKERS.md` Bloqueio 002 (status Aberto, já
escalado ao coordenador pela própria L7-T05) confirma — que a state machine
(ADR-006/L4-T01) não tem nenhuma transição regressiva a partir de
`destino_confirmado`: não existe (e esta tarefa não tem autoridade para
inventar) uma Server Action de "trocar" que reverta o `flowState` no servidor.
Seguindo a orientação já deixada por L7-T05, "Trocar destino" foi implementado
como navegação client-side pura (`router.back()`, `next/navigation`), sem
chamar nenhuma Server Action — reproduz a mesma limitação já sinalizada no
Bloqueio 002 (a sessão permanece `flowState: destino_confirmado` no servidor
até uma nova aprovação de destino sobrescrever/gerar um novo registro).
**Sinalizando aqui, sem reabrir um novo bloqueio**: L7-T04 também fica
afetado pelo Bloqueio 002 já aberto — a resolução definitiva de "Trocar
destino" (nova transição regressiva na state machine vs. aceitar a limitação
atual permanentemente) é uma decisão do Coordenador, não desta tarefa.

**Testes** (Testing Library, `@testing-library/user-event`): 9 casos em
`src/components/destino/__tests__/destino-confirmacao-screen.test.tsx`
(destino em destaque + os dois botões — critério de aceite; comportamento
idêntico independentemente da origem do destino; foco no título ao montar;
clique em cada botão chama a prop `onConfirmar`/`onTrocar` com `{ sessionId
}`; erro acessível em falha, sem travar os botões; funciona sem quebrar quando
as props não são passadas; navegação por teclado nos dois botões em ordem;
`StepperProgress` presente); 3 casos em
`src/app/destino/confirmacao/__tests__/confirmacao-destino-client.test.tsx`
(`confirmarDestino` real chamada com `{ sessionId }`; "Trocar destino" chama
só `router.back()`, nunca uma Server Action — prova direta da decisão do
Bloqueio 002; falha em `confirmarDestino` mostra erro sem navegar); 4 casos em
`src/app/destino/confirmacao/__tests__/page.test.tsx` (renderiza com
`sessionId`/`destino` da querystring já acoplada à Server Action real;
redireciona para `/` quando falta `sessionId`; redireciona para `/` quando
falta `destino`; `flowState` inválido não quebra a tela).

Arquivos novos: `src/components/destino/destino-confirmacao-screen.tsx`,
`src/components/destino/__tests__/destino-confirmacao-screen.test.tsx`,
`src/app/destino/confirmacao/page.tsx`,
`src/app/destino/confirmacao/confirmacao-destino-client.tsx`,
`src/app/destino/confirmacao/__tests__/page.test.tsx`,
`src/app/destino/confirmacao/__tests__/confirmacao-destino-client.test.tsx`.
Nenhum arquivo de `session-flow`/`gateway-ia`/de outras tarefas do lote foi
alterado.

`npm run lint` (sem warnings/erros), `npx vitest run src/components/destino
src/app/destino` (27/27 passam, incluindo os testes já publicados por L7-T02
em paralelo, `DestinoSugestoesScreen`) e `npm run build` passam sem regressão
— `/destino/confirmacao` confirmada como rota dinâmica (`ƒ`), consistente com
depender de `searchParams`. `npm test` (suíte completa, 349 testes: 300
passam, 49 falham — todas as falhas são os mesmos testes de integração
pré-existentes que exigem Postgres real em `localhost:55432`, indisponível
neste ambiente, já documentado desde L4-T02/L7-T01/L7-T03; nenhuma falha nova
introduzida por esta tarefa). Nenhum desvio de escopo/estimativa nesta tarefa
além do impacto (não decidido aqui) do Bloqueio 002 já sinalizado acima.

**Nota de bloqueio/resolução — retomada de L7-T05 e L7-T04 (2026-09-10,
Coordenador, Bloqueio 002 resolvido como ADR-006 Adendo 2)**: instrução para
quem retomar, seguindo o mesmo padrão da instrução deixada pelo Adendo 1 para
L4-T02.

- **L7-T05 (BE, retomar)**: 1) em
  `src/lib/session-flow/state-machine.ts`, adicionar `"revisar"` a
  `SessionFlowAction` e uma tabela de transições regressivas (ou entradas
  adicionais na própria `SEQUENTIAL_TRANSITIONS`, decisão de detalhe):
  `destino_confirmado --revisar--> destino_pendente` (as outras 3 —
  `hospedagem_aprovada`/`passeios_aprovados`/`roteiro_aprovado` — podem ser
  adicionadas na mesma tarefa, já que é a mesma tabela e o mesmo padrão, mas
  só `destino_confirmado` tem uma Server Action/UI consumidora hoje; as
  demais ficam disponíveis para L8/L9/L10 sem tarefa própria). 2) Em
  `applySessionFlowTransition`/`src/lib/session-flow/` (extensão de L4-T02),
  tratar `revisar` como uma transição que, na mesma transação, apaga a linha
  de `DestinationApproval` da sessão (0..1, então é um `delete` simples,
  nunca de outra etapa) antes de gravar o novo `flowState`. 3) Nova Server
  Action `trocarDestino` em `src/lib/actions/confirmacao-destino.ts` (mesmo
  padrão de `confirmarDestino`: revalida `sessionId`, delega para
  `applySessionFlowTransition({ sessionId, action: "revisar" })`, mesma
  classe de erro de validação de input já existente). 4) Atualizar o
  cabeçalho do módulo (que hoje documenta a limitação do Bloqueio 002) para
  remover a nota de bloqueio e descrever a nova função. 5) Testes: caso de
  `revisar` avançando `destino_confirmado`→`destino_pendente` e removendo a
  `DestinationApproval`; caso de `revisar` a partir de um estado que não é
  `destino_confirmado` rejeitando com `InvalidTransitionError` sem persistir
  nada (mesmo padrão dos 3 casos já existentes de `confirmarDestino`).
- **L7-T04 (FE, reabrir)**: em
  `src/app/destino/confirmacao/confirmacao-destino-client.tsx`, trocar a
  implementação de "Trocar destino" de `router.back()` (`next/navigation`)
  para chamar a nova Server Action `trocarDestino` (mesmo padrão já usado
  para `onConfirmar`/`confirmarDestino`), e só então navegar de volta à tela
  de origem após a confirmação do servidor — o botão e o rótulo "Trocar
  destino" na UI (`DestinoConfirmacaoScreen`) não mudam, só a função por trás
  do handler `onTrocar`. Atualizar/remover a nota de cabeçalho e os 2
  comentários que documentavam a limitação do Bloqueio 002 (código e nota de
  implementação já registrada acima permanecem como histórico do que foi
  feito na primeira passada; não precisam ser apagados, só não descrever mais
  a limitação como atual). Atualizar o teste
  `confirmacao-destino-client.test.tsx` (caso "Trocar destino chama só
  `router.back()`") para refletir a nova chamada a `trocarDestino`.
- **L8/L9/L10 (Tech Lead, decisão já tomada, nenhuma ação necessária agora)**:
  as transições `hospedagem_aprovada`/`passeios_aprovados`/`roteiro_aprovado`
  `--revisar-->` `*_pendente` já ficam disponíveis na state machine assim que
  L7-T05 implementar o item 1 acima. Se uma tarefa futura desses lotes
  precisar de um botão equivalente a "Trocar destino" (ex.: "Trocar
  hospedagem"), a Server Action correspondente só precisa chamar
  `applySessionFlowTransition({ action: "revisar" })` e apagar a(s) linha(s)
  de aprovação da própria etapa (mesmo padrão do item 2 acima, adaptado à
  cardinalidade da entidade: `AccommodationApproval` é 0..1 como
  `DestinationApproval`; `ActivityApproval`/`ItineraryItem` são 0..n — apagar
  todas as linhas da sessão para aquela etapa). Nenhuma tarefa nova é criada
  neste TASK.md para isso agora.

**Nota de implementação — L7-T05 concluída (2026-09-10, Executor/BE, retomada
do Bloqueio 002/ADR-006 Adendo 2)**: implementados os 5 passos da instrução de
retomada acima.

1) `src/lib/session-flow/state-machine.ts`: `"revisar"` adicionada a
   `SessionFlowAction`; nova tabela `REVISAR_TRANSITIONS` (separada de
   `SEQUENTIAL_TRANSITIONS`, mesmo padrão de tratamento à parte já usado para
   `encerrar`/`STATES_WITH_AT_LEAST_ONE_APPROVAL`) com as 4 transições
   regressivas: `destino_confirmado→destino_pendente`,
   `hospedagem_aprovada→hospedagem_pendente`,
   `passeios_aprovados→passeios_pendente`,
   `roteiro_aprovado→roteiro_pendente`. Decisão: incluídas as 4 desde já (não
   só a de destino), conforme sugerido pelo Coordenador — mesmo custo, mesma
   tabela/padrão, disponível para L8/L9/L10 sem tarefa própria.
2) `src/lib/session-flow/persistence.ts`: nova constante
   `REVISAR_STAGE_BY_APPROVED_STATE` (inverso de
   `APPROVAL_STAGE_BY_PENDING_STATE`) e função `deleteRevisarChildData`,
   chamada dentro da mesma transação do `$transaction` quando `input.action
   === "revisar"`, ANTES de `tx.tripSession.update`. Usa `deleteMany({ where:
   { sessionId } })` (nunca `delete`) uniformemente para as 4 etapas —
   cobre tanto as 0..1 (`DestinationApproval`/`AccommodationApproval`) quanto
   as 0..n (`ActivityApproval`/`ItineraryItem`) sem lançar se não houver
   linha, sempre filtrado por `sessionId` (nunca toca outra sessão/etapa).
3) `src/lib/actions/confirmacao-destino.ts`: nova Server Action
   `trocarDestino({ sessionId })` — mesmo padrão de `confirmarDestino`
   (revalida `sessionId` via `InvalidConfirmacaoDestinoInputError`, delega
   para `applySessionFlowTransition({ sessionId, action: "revisar" })`),
   retorna `{ proximaEtapa: "destino", sessionId, flowState:
   "destino_pendente" }`.
4) Cabeçalho de `confirmacao-destino.ts` reescrito: removida a nota de
   limitação do Bloqueio 002, descreve as duas Server Actions e a ação
   `revisar`.
5) Testes novos: `src/lib/session-flow/__tests__/state-machine.test.ts` (13
   casos unitários puros, sem Postgres — 4 transições válidas de `revisar` +
   7 estados rejeitados, todos passando: `npx vitest run
   src/lib/session-flow/__tests__/state-machine.test.ts` → 37/37, incluindo os
   já existentes); `src/lib/session-flow/__tests__/persistence.integration.test.ts`
   (2 casos novos: `revisar` regredindo e apagando `DestinationApproval`;
   `revisar` rejeitado com `InvalidTransitionError` sem persistir nada, a
   partir de `destino_pendente`); `src/lib/actions/__tests__/confirmacao-destino.integration.test.ts`
   (novo `describe` com 3 casos para `trocarDestino`, mesmo padrão dos 3 já
   existentes para `confirmarDestino`).

Arquivos alterados: `src/lib/session-flow/state-machine.ts`,
`src/lib/session-flow/persistence.ts`, `src/lib/actions/confirmacao-destino.ts`,
`src/lib/session-flow/__tests__/state-machine.test.ts`,
`src/lib/session-flow/__tests__/persistence.integration.test.ts`,
`src/lib/actions/__tests__/confirmacao-destino.integration.test.ts`. Nenhum
arquivo de UI (`L7-T04`) tocado nesta tarefa — reabertura de L7-T04 é
instância separada, conforme a nota de retomada.

`npm run lint` (sem warnings/erros), `npx vitest run
src/lib/session-flow/__tests__/state-machine.test.ts` (37/37 passam) e `npm
run build` passam sem regressão de tipo/compilação. `npm test` (suíte
completa, 365 testes: 312 passam, 53 falham — todas as falhas continuam
sendo os mesmos arquivos de teste de integração pré-existentes que exigem
Postgres real em `localhost:55432`, indisponível neste ambiente, mesma
limitação documentada desde L4-T02; os 7 casos novos desta tarefa que tocam
Postgres real — 2 em `persistence.integration.test.ts`, 3 em
`confirmacao-destino.integration.test.ts` para `trocarDestino`, mais os 2 já
existentes de `confirmarDestino` recontados — falham pelo mesmo motivo de
ambiente, não por regressão de lógica; nenhuma falha nova de outra natureza
introduzida). Nenhum desvio de escopo/estimativa. `.md/BLOCKERS.md`, Bloqueio
002, permanece `Resolvido` (já marcado pelo Coordenador, não alterado aqui).

**Nota de retomada — L7-T04 (2026-09-10, Executor/FE, retomada do Bloqueio
002/ADR-006 Adendo 2)**: implementado o item da instrução de retomada acima.
Em `src/app/destino/confirmacao/confirmacao-destino-client.tsx`, o handler
`onTrocar` passado para `DestinoConfirmacaoScreen` deixou de ser
`router.back()` isolado e passou a chamar a Server Action real `trocarDestino`
(L7-T05, já concluída) com `{ sessionId }`, aguardar a Promise resolver e só
então navegar de volta com `router.back()` — mesmo padrão de
`onConfirmar`/`confirmarDestino` já usado neste arquivo. Em caso de falha, o
próprio `runAction` de `DestinoConfirmacaoScreen` captura o erro e mostra a
mensagem acessível (`role="alert"`), sem navegar — comportamento herdado
automaticamente, nenhuma mudança necessária em `DestinoConfirmacaoScreen`
(componente de apresentação, fora de escopo, não tocado). Cabeçalho do
wrapper client e o cabeçalho de teste reescritos para não descrever mais a
limitação do Bloqueio 002 como atual; a nota de implementação original de
L7-T04 (acima) permanece como histórico da primeira passada, não foi alterada.

Teste `confirmacao-destino-client.test.tsx` atualizado: o caso "Trocar destino
chama só `router.back()`" foi substituído por um caso que mocka `trocarDestino`
e confere `toHaveBeenCalledWith({ sessionId })` seguido de `router.back()`
sendo chamado; adicionado um caso novo espelhando o já existente de
`confirmarDestino` — falha em `trocarDestino` mostra erro acessível sem
navegar (`backMock` não chamado). Suíte do arquivo: 4/4 passam.

Arquivos alterados: `src/app/destino/confirmacao/confirmacao-destino-client.tsx`,
`src/app/destino/confirmacao/__tests__/confirmacao-destino-client.test.tsx`.
Nenhum arquivo de `src/lib/session-flow/`, `src/lib/actions/confirmacao-destino.ts`
ou `DestinoConfirmacaoScreen` tocado (fora de escopo desta retomada).

`npm run lint` sem warnings/erros. `npx vitest run src/app/destino
src/components/destino src/lib/actions/confirmacao-destino` → 4 arquivos de
teste, 28/28 passam (inclui os 4 casos deste arquivo). `npm run build` conclui
sem erro de tipo/compilação, rota `/destino/confirmacao` gerada normalmente.
Nenhum desvio de escopo/estimativa. Coluna de Status da tarefa não alterada
por esta nota (mantida conforme já registrado na tabela do Lote 7).

### Lote 8 — Hospedagem (T06)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L8-T01 | Regra RF-06 — geração de 3 opções de hospedagem via Gateway de IA + filtro de orçamento (RF-06.1/.2) | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03, **L11-T03** | — | Concluída | Sempre 3 opções, cada uma com nome/tipo, faixa de preço por diária, característica distintiva |
| L8-T02 | T06 UI — cartões, aprovar/ajustar (com feedback textual), rodapé de decisão | FE | 1 dia | L5-T03, L5-T04, L8-T01 | L8-T03 | Concluída | "Ajustar" regenera a mesma etapa sem avançar (RF-05.3); rodapé oferece continuar/encerrar (RF-05.4) |
| L8-T03 | T06 Server Actions — aprovar avança (RF-06.3), ajustar regenera, encerrar aqui | BE | 1 dia | L4-T02, L8-T01 | L8-T02 | Concluída | Aprovar persiste `AccommodationApproval` e avança para passeios |

Nota de implementação L8-T01 (2026-09-10, Executor/BE): implementada a regra
RF-06.1/.2 como função pura assíncrona `generateAccommodationSuggestions` em
`src/lib/stage-rules/hospedagem.ts` (novo arquivo), reexportada por
`src/lib/stage-rules/index.ts`, seguindo exatamente o mesmo padrão já
estabelecido por `generateDestinationSuggestions` (L7-T01,
`src/lib/stage-rules/destino.ts`): (1) chama
`generateStructuredCompletionWithRetry` (`@/lib/gateway-ia`, L3-T04) para a
etapa `"hospedagem"` usando o registro central de prompt/schema já existente
(`buildHospedagemPrompt`/`hospedagemOpcoesSchema`, L3-T02, que já garante
exatamente 3 opções via `.length(3)` no schema Zod — RF-06.1); (2) adapta o
shape específico do schema da etapa (`precoPorDiariaMin`/`precoPorDiariaMax`)
para o shape genérico `PriceRangedSuggestion` (`precoMin`/`precoMax`)
exigido por `applyBudgetFilter` (RF-10/RF-06.2, L4-T03,
`src/lib/session-flow/budget-filter.ts`), reutilizado sem alteração —
`applyBudgetFilter` só reordena/sinaliza excedente, nunca remove item, então
as 3 opções do schema permanecem sempre 3 na saída final (verificado em
teste). `input.destination` é obrigatório no tipo de entrada
(`GenerateAccommodationSuggestionsInput.destination`, não opcional) — reforça
em compile-time a regra RN-01 já aplicada em runtime por
`buildHospedagemPrompt` (lança `Error` se `context.destination` estiver
ausente).

Decisão de detalhe (pequena, resolvida sem escalar): sanitização de texto
livre contra prompt injection (L11-T03,
`sanitizeFreeTextForPrompt`/`@/lib/gateway-ia/prompt-injection-guard`) **não**
foi reaplicada dentro de `generateAccommodationSuggestions` sobre
`destination.name`. Motivo: esse valor chega como um destino JÁ APROVADO
(`DestinationApproval`), e a sanitização de L11-T03 já acontece no ponto de
captura original do texto livre do usuário — nas Server Actions
`src/lib/actions/destino.ts` (`informarDestinoManualmente`),
`data-livre.ts` e `feriados.ts` (campo `destino` de entrada manual) — antes
da persistência; o mesmo raciocínio documentado no cabeçalho de
`prompt-injection-guard.ts` ("a sanitização acontece ANTES do valor entrar
em `StageContext`, no ponto de captura, não dentro do Gateway de IA")
já cobre esta etapa também. Reaplicar a sanitização aqui seria redundante
(o valor sanitizado já está em repouso, sem nova entrada de usuário) e
poderia, no limite, truncar/alterar um nome de destino que um usuário via IA
(não texto livre) nunca fez passar por esse campo — decisão de escopo
pequena, não uma reinterpretação de UX-SPEC/ADR.

Testes (TDD, `src/lib/stage-rules/__tests__/hospedagem.test.ts`, 7 casos, sem
I/O real — `generateStructuredCompletionWithRetry` mockada, mesmo padrão de
`destino.test.ts`): sempre 3 opções com nome/tipo/faixa de preço por
diária/característica distintiva (critério de aceite); chamada ao Gateway de
IA com `sessionId`/`stage: "hospedagem"`/`schemaName` corretos e destino
interpolado no prompt; sem orçamento nunca bloqueia (RF-10.3/RN-04); com
orçamento reordena mantendo as 3 opções (RF-10.1); nenhuma opção cabe no
orçamento → mais barata primeiro com `exceedsBudget: true`, ainda 3 opções
(RF-06.2/RF-10.2); erro claro quando chamada sem `destination` (RN-01,
delegado a `buildHospedagemPrompt`); erro do Gateway de IA propagado sem
mascarar.

Fora de escopo desta tarefa (fica para L8-T02/L8-T03, já registrado nas
diretrizes originais destas tarefas): Server Action de tela, persistência de
`AccommodationApproval` via `applySessionFlowTransition`, UI de
cartões/aprovar/ajustar/rodapé de decisão, e a integração real ponta a ponta
com banco (Postgres não disponível neste ambiente de execução — mesma
limitação já documentada nas notas de L4-T02/L7-T01/L7-T03: testes
`*.integration.test.ts` existentes continuam falhando só por falta de
`localhost:55432`, nenhuma regressão nova introduzida por esta tarefa,
confirmado rodando a suíte completa antes e depois desta mudança).

`npm run build` (lint + type-check + build) passou sem erro; suíte de testes
unitários/de componente 100% verde (só os testes `*.integration.test.ts`
dependentes de Postgres real continuam falhando, comportamento pré-existente
e documentado, não uma regressão desta tarefa). Nenhum desvio de
escopo/estimativa; nenhuma lacuna de arquitetura/UX-SPEC encontrada — nada
registrado em `BLOCKERS.md` por esta tarefa.

Nota de implementação L8-T02 (2026-09-10, Executor/FE): `HospedagemSugestoesScreen`
(`src/components/hospedagem/hospedagem-sugestoes-screen.tsx`), mesmo padrão de
`DestinoSugestoesScreen` (T04, L7-T02): estados obrigatórios aplicáveis a T06
(UX-SPEC.md §4 — Carregando/Erro/Sucesso; "Vazio" explicitamente "Não
aplicável" para T06, sempre há 3 opções por definição de RF-06.1) via
`LoadingStream`/`ErrorRetryState` (L5-T03, reaproveitados, nenhuma lógica de
estado duplicada — Diretriz de Implementação 11), `BudgetInsufficientBanner`
(RF-10.2/RN-04) e `SuggestionCard` (L5-T04) para os 3 cartões (nome/tipo,
`PriceRangeBadge` com `unitLabel="por diária"`, característica distintiva).

Paralelismo com L8-T03 (mesmo lote, mesmo padrão já usado em L6-T02/T03 e
L7-T02/T03): no momento em que esta tarefa começou, `@/lib/actions/hospedagem`
ainda não existia — a tela foi desenhada contra uma interface documentada no
cabeçalho do arquivo. O módulo real (`src/lib/actions/hospedagem.ts`) passou a
existir ainda durante esta mesma tarefa (a instância paralela de L8-T03
terminou primeiro), então a tela final já importa e consome
`gerarSugestoesHospedagem`/`aprovarHospedagem`/`encerrarResolucaoHospedagem`
reais (com `actionsOverride` só para teste, mesmo padrão de
`DestinoSugestoesScreen`), em vez de manter uma prop de ações especulativa —
reduz risco de divergência. Dois ajustes ao contrato inicialmente documentado,
resolvidos a favor do contrato real da Server Action (fonte da verdade da
regra de negócio, TASK.md Seção 1 item 3): (1) `aprovarHospedagem` já encadeia
`aprovar`+`avancar` (RF-06.3 — aprovar sempre avança para passeios, sem tela
de confirmação intermediária como T05 de destino) — "Continuar para passeios"
no rodapé é só navegação client-side para a etapa já confirmada pelo
servidor, nenhuma chamada adicional; (2) não existe uma função dedicada de
"ajustar com feedback" — RF-05.3 é satisfeita chamando `gerarSugestoesHospedagem`
de novo (self-loop da ação `ajustar` em `hospedagem_pendente`,
`state-machine.ts`), critério de aceite ("Ajustar regenera a mesma etapa sem
avançar") continua satisfeito. A tela mantém o campo de feedback textual
exigido por UX-SPEC.md T06 (label "O que você gostaria de ajustar nesta
opção?"), mas o texto ainda não chega ao prompt do Gateway de IA — GAP
CONHECIDO já documentado por L8-T03 no cabeçalho de
`@/lib/actions/hospedagem.ts` (mesma lacuna pré-existente em `gerarSugestoesDestino`/
RF-04.4), não introduzido nem resolvido por esta tarefa; sinalizado (não
decidido sozinho) para o Coordenador avaliar abertura de tarefa dedicada que
estenda `StageContext`/`buildHospedagemPrompt` para incorporar texto livre —
não bloqueia esta tarefa porque o critério de aceite de L8-T02 é sobre
comportamento de UI (regenerar sem avançar), não sobre o prompt em si.

Rodapé de decisão (RF-05.4, critério de aceite): depois de aprovar um cartão
(desabilita Aprovar/Ajustar dos demais, mesmo padrão de T04), aparece
"Continuar para passeios" (navega para `/passeios`, rota de T07/Lote 9 ainda
não criada — mesmo padrão de T04 apontando para `/destino/confirmacao` antes
de T05 existir, fora de escopo desta tarefa) e "Só queria decidir até aqui —
encerrar aqui" (chama `encerrarResolucaoHospedagem`, navega para
`/encerramento`, também ainda não criada).

Acessibilidade (UX-SPEC §5, Diretriz de Implementação 10): foco vai para o
título ao montar (`useEffect` + `headingRef.current?.focus()`, mesmo padrão
de `DestinoConfirmacaoScreen`/L7-T04 e `FeriadosScreen`/L6-T04 — ausente em
`DestinoSugestoesScreen`/L7-T02, não corrigido aqui por ser arquivo de outra
tarefa já concluída); label associado ao campo de feedback via `htmlFor`/`id`
e erro conectado via `aria-describedby`; nenhuma informação só por cor (erro
usa ícone + texto/`role="alert"`, igual ao restante do design system); alvo
de toque `min-h-11` nos botões principais (RNF-04); ordem de tab natural
(nenhum `tabIndex` manual fora do título).

Testes: `src/components/hospedagem/__tests__/hospedagem-sugestoes-screen.test.tsx`
(11 casos) — skeleton de carregamento; 3 cartões com preço por diária;
`BudgetInsufficientBanner` sem desabilitar botões (RN-04); aprovar chama
`aprovarHospedagem` e mostra rodapé; botões dos demais cartões desabilitados
após aprovar; "Continuar para passeios" navega com `flowState` já avançado
pelo servidor; "encerrar aqui" chama `encerrarResolucaoHospedagem` e navega
para `/encerramento`; "Ajustar" abre o campo, regenera via
`gerarSugestoesHospedagem` e substitui a lista sem navegar (RF-05.3,
critério de aceite); "Cancelar" fecha sem regenerar; foco no título ao
montar; `ErrorRetryState` após falha com "Tentar novamente" funcional.

`npm run lint`/`npx eslint src/components/hospedagem` e os 11 testes novos
(mais a suíte completa de testes unitários/de componente, sem regressão —
só os testes `*.integration.test.ts` dependentes de Postgres real continuam
falhando, comportamento pré-existente e documentado desde L4-T02, não uma
regressão desta tarefa) passam sem erro. `npx tsc --noEmit` não reporta
nenhum erro nos arquivos desta tarefa (`hospedagem-sugestoes-screen.tsx`,
`hospedagem-sugestoes-screen.test.tsx`) — os 3 erros pré-existentes do
projeto (`destino/confirmacao/__tests__/page.test.tsx`,
`budget-insufficient-banner.test.tsx`, `auth-callbacks.test.ts`) não têm
relação com esta tarefa. `npm run build` não foi possível concluir (mesmo
padrão documentado em L6-T02): a etapa de type-check do Next.js reporta
"Compiled successfully", mas a fase seguinte ("Collecting page data") falha
com `ENOENT .next/server/pages-manifest.json` — erro de infraestrutura de
build compartilhada (`.next/`) por escrita concorrente da instância paralela
de L8-T03, reproduzido em 2 tentativas seguidas, sem relação com os arquivos
desta tarefa (confirmado via `tsc --noEmit` acima); não corrigido aqui por
ser diretório de build compartilhado entre instâncias em edição simultânea.

Fora de escopo desta tarefa (não criado aqui, deliberadamente): rota real
`src/app/hospedagem/page.tsx` — como o componente foi escrito para consumir
diretamente as Server Actions reais (ver acima), a página é um wrapper trivial
(resolver `sessionId` da querystring/sessão e renderizar
`<HospedagemSugestoesScreen sessionId={...} />`, mesmo padrão de
`src/app/destino/page.tsx`); deixada de fora por não fazer parte do critério
de aceite desta tarefa (UI de cartões/aprovar/ajustar/rodapé) e para não
arriscar conflito de arquivo com a instância paralela de L8-T03, que também
pode precisar tocar roteamento. Nenhum desvio de escopo/estimativa; nenhuma
lacuna de arquitetura/UX-SPEC encontrada que impedisse a implementação — o
único gap encontrado (feedback textual não incorporado ao prompt) já estava
sinalizado por L8-T03 antes desta tarefa terminar, não registrado de novo em
`BLOCKERS.md` para evitar duplicidade (mesmo achado, mesma causa raiz).

Nota de implementação L8-T03 (2026-09-10, Executor/BE): implementadas as 3
Server Actions de tela de T06 em `src/lib/actions/hospedagem.ts` (novo
arquivo, `"use server"`) + `src/lib/actions/hospedagem-errors.ts` (novo
arquivo de erros dedicados, sem `"use server"`, mesmo motivo já documentado
em `destino-errors.ts`), seguindo exatamente o mesmo padrão já estabelecido
por `src/lib/actions/destino.ts` (L7-T03). Assinaturas exatas (estáveis —
confirmado pela nota de L8-T02 acima: a instância paralela consumiu estes
três nomes de `@/lib/actions/hospedagem` sem qualquer ajuste):
- `gerarSugestoesHospedagem(sessionId: string): Promise<AccommodationSuggestionResult[]>`
  — RF-06.1/.2, delega a `generateAccommodationSuggestions` (L8-T01) com o
  destino já aprovado (`DestinationApproval`) e range/orçamento da sessão;
  exige `flowState === "hospedagem_pendente"`
  (`HospedagemEtapaInvalidaError` senão); reusada também para "Ajustar"
  (RF-05.3) — mesmo padrão de `gerarSugestoesDestino`/RF-04.4 (L7-T03): a
  ação `ajustar` da state machine é um self-loop em `hospedagem_pendente`,
  então nenhuma chamada a `applySessionFlowTransition` é necessária para "não
  avançar".
- `aprovarHospedagem({ sessionId: string; suggestion: AccommodationSuggestionResult }): Promise<{ proximaEtapa: "passeios"; sessionId: string; flowState: "passeios_pendente"; hospedagem: string }>`
  — RF-06.3, critério de aceite desta tarefa. Revalida o payload recebido do
  cliente (`assertValidAccommodationPayload`, mesmo raciocínio de
  `destino.ts`) e encadeia DUAS chamadas sequenciais a
  `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02): `"aprovar"`
  (persiste `AccommodationApproval`, `hospedagem_pendente` →
  `hospedagem_aprovada`) seguida de `"avancar"` (`hospedagem_aprovada` →
  `passeios_pendente`) — mesmo padrão de duas chamadas sequenciais já usado
  em `persistence.integration.test.ts` (L4-T02). Desvio estrutural
  INTENCIONAL em relação a `destino.ts`: destino tem uma tela de confirmação
  própria entre aprovar e avançar (T05/`confirmarDestino`, L7-T05);
  hospedagem não tem etapa equivalente (UX-SPEC.md T06: "'Aprovar' por bloco
  avança" — direto), por isso `aprovarHospedagem` já entrega
  `flowState: "passeios_pendente"` numa única chamada, sem uma Server Action
  de tela separada para o "avancar".
- `encerrarResolucaoHospedagem(sessionId: string): Promise<{ proximaEtapa: "encerramento"; sessionId: string; flowState: "encerrada_parcial" }>`
  — RF-05.4/RN-03, delega a `applySessionFlowTransition("encerrar")`.
  Disponível a partir de `hospedagem_pendente` (destino já aprovado) ou de
  qualquer estado posterior — preserva `DestinationApproval`/
  `AccommodationApproval` já gravados.

Gap conhecido (mesmo já descrito/confirmado pela nota de L8-T02 acima — não
duplicado em `BLOCKERS.md`): RF-05.3 (PRD-TECNICO.md) descreve "ajustar" como
"incorporando o feedback do usuário", e UX-SPEC.md T06 menciona um "campo de
feedback textual curto" na ação Ajustar. Nem `StageContext`/
`buildHospedagemPrompt` (`@/lib/gateway-ia`, L3-T02) nem
`generateAccommodationSuggestions` (`@/lib/stage-rules`, L8-T01) têm hoje um
campo para incorporar esse texto ao prompt — mesma lacuna já presente (e não
sinalizada) no "nova rodada" de T04 (RF-04.4, `gerarSugestoesDestino`,
L7-T03). `gerarSugestoesHospedagem` segue o MESMO padrão já estabelecido
(regenera sem incorporar feedback) por consistência com o precedente já em
produção — não uma reinterpretação nova de UX-SPEC feita por esta tarefa.
Recomendação: o Coordenador decidir se abre uma tarefa dedicada (provavelmente
abrangendo também T04/T07/T08, já que a mesma lacuna existe nas outras
etapas) em vez de resolver isso ad-hoc numa tarefa isolada.

Testes (TDD, `src/lib/actions/__tests__/hospedagem.integration.test.ts`, 11
casos, mesmo padrão de `confirmacao-destino.integration.test.ts`/
`destino.integration.test.ts` — Postgres real esperado em `localhost:55432`,
Gateway de IA mockado via `generateStructuredCompletionWithRetry`): gera 3
opções usando o destino já aprovado; rejeita gerar fora de
`hospedagem_pendente` sem chamar o Gateway de IA; aprovar persiste
`AccommodationApproval` e avança para `passeios_pendente` preservando
`DestinationApproval` (critério de aceite); rejeita aprovar fora de
`hospedagem_pendente` (`InvalidTransitionError`, nada persistido); rejeita
payload adulterado (faixa de preço invertida) sem persistir nada; encerrar a
partir de `hospedagem_pendente` e a partir de `passeios_pendente` (depois de
`aprovarHospedagem`) preservam o já aprovado (RN-03); rejeita encerrar sem
nenhuma etapa aprovada. Mesma limitação já documentada em L4-T02/L7-T01/
L7-T03/L8-T01 e outras: Postgres não acessível neste ambiente de execução
(`localhost:55432` recusa conexão) — os 11 casos falham com
`PrismaClientInitializationError` (não erro de lógica/asserção), mesmo
comportamento pré-existente da suíte inteira (69 testes de integração
falhando por este motivo antes e depois desta mudança, confirmado rodando
`npx vitest run` completo); a cobertura da lógica em si está garantida pelos
testes (TDD) e pela leitura de código, não pela execução real contra banco
neste ambiente.

`npx eslint` limpo nos arquivos desta tarefa (2 erros pré-existentes e não
relacionados em `prisma/__tests__/schema.integration.test.ts`/
`tailwind.config.ts`, fora do escopo desta tarefa); `npx tsc --noEmit` sem
erro nos arquivos desta tarefa (erros pré-existentes em outros arquivos, não
tocados por esta tarefa). `npm run build` compilou/type-checou/gerou as 14
páginas com sucesso (a primeira tentativa falhou com `ENOENT
.next/build-manifest.json`, sintoma de escrita concorrente em `.next/` pela
instância paralela de L8-T02, mesmo tipo de erro relatado na nota dela acima;
a segunda execução, sem concorrência no momento, passou limpa). Integração de
ponta a ponta com L8-T02 confirmada por leitura cruzada das duas notas desta
seção: nenhum ajuste de assinatura foi necessário dos dois lados. Nenhum
desvio de escopo/estimativa; nenhum bloqueio registrado em `BLOCKERS.md` por
esta tarefa — o gap de feedback textual acima é sinalizado como recomendação
de tarefa futura, não como impedimento desta.

### Lote 9 — Passeios (T07)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L9-T01 | Regra RF-07 — geração de lista de passeios/atividades, garantindo ao menos 1 opção gratuita quando existir (RF-07.1/.2) + filtro de orçamento | BE | 1 dia | L3-T02, L3-T03, L3-T04, L4-T03, **L11-T03**, **RL8-T02** | — | Concluída | Cada item com nome, faixa de preço (podendo ser R$ 0), duração aproximada; ao menos 1 item gratuito quando relevante ao destino — **Nota de implementação (2026-09-10)**: ver nota detalhada logo após esta tabela. |
| L9-T02 | T07 UI — lista com checkbox, remoção antes de aprovar, badge "Gratuito", validação "ao menos um item" | FE | 1 dia | L5-T02, L5-T03, L9-T01 | L9-T03 | Concluída | Botão "Aprovar seleção" desabilita/some se todos os itens forem removidos, com mensagem explicativa — **Nota de implementação L9-T02 (2026-09-10)**: ver nota detalhada logo após esta tabela. |
| L9-T03 | T07 Server Actions — aprovar seleção (RF-07.3), remover item, encerrar aqui | BE | 1 dia | L4-T02, L9-T01 | L9-T02 | Concluída | Aprovar persiste `ActivityApproval` só dos itens não removidos e avança para roteiro — **Nota de implementação L9-T03 (2026-09-10)**: ver nota detalhada logo após esta tabela. |

**Nota de implementação L9-T01 (2026-09-10):** `generatePasseiosSuggestions`
criada em `src/lib/stage-rules/passeios.ts` (reexportada via
`src/lib/stage-rules/index.ts`), mesmo padrão de `./hospedagem.ts` (L8-T01)/
`./destino.ts` (L7-T01) — chama `generateStructuredCompletionWithRetry`
(L3-T04) para a etapa `"passeios"` com `buildPasseiosPrompt`/
`passeiosOpcoesSchema` (`@/lib/gateway-ia`, L3-T02), depois aplica
`applyBudgetFilter` (RF-10, L4-T03) sobre o resultado. Diferenças confirmadas
em relação a hospedagem, conforme escopo: (1) `passeiosOpcoesSchema.passeios`
é lista de tamanho **variável** (`.min(1)`, sem teto superior,
`src/lib/gateway-ia/schemas.ts`) — esta função não impõe nenhuma quantidade
fixa, o critério de aceite foi lido como "ao menos 1 item", não um número
específico; (2) RF-07.2 ("ao menos 1 item gratuito quando existir/relevante
ao destino") é tratada exclusivamente pelo PROMPT (`buildPasseiosPrompt` já
instrui o LLM a incluir uma opção gratuita "quando existir algo relevante e
gratuito... nunca invente gratuidade só para cumprir isso, é preferível não
incluir se não existir opção real plausível") — confirmado por leitura de
`src/lib/gateway-ia/prompts.ts`; esta regra de negócio NUNCA força/inventa um
item gratuito artificial quando o LLM não retorna nenhum (coberto por teste
dedicado); (3) `applyBudgetFilter` já trata corretamente itens com
`precoMin = 0` sem nenhuma alteração no módulo — um item gratuito satisfaz
`precoMin <= budget.amount` para qualquer orçamento não-negativo, então é
sempre `withinBudget: true`/`exceedsBudget: false`, mesmo quando nenhum item
pago cabe no orçamento (RF-10.2 só sinaliza excedente quando NENHUM item,
gratuito ou pago, cabe — cenário impossível de fato sempre que existe ao
menos 1 item gratuito na lista); `budget-filter.ts` não foi modificado,
apenas confirmado via teste, conforme instrução da tarefa. Contexto de
hospedagem aprovada (`accommodation?.name`/`.type`) é repassado como opcional
(mesmo campo `StageContext.accommodation` já existente, L3-T02) — não
obrigatório para a etapa, `buildPasseiosPrompt` já lida com a ausência.
Sanitização (L11-T03/RL8-T02): `input.destination.name` e
`input.accommodation.name`/`.type` chegam já sanitizados dos pontos de
captura (`sanitizeFreeTextForPrompt` em `src/lib/actions/destino.ts`/
`data-livre.ts`/`feriados.ts` para destino, e em
`assertValidAccommodationPayload`/`src/lib/actions/hospedagem.ts`, RL8-T02,
para hospedagem) — esta função não sanitiza de novo, mesmo raciocínio já
adotado em `hospedagem.ts`/`destino.ts`. Teste novo (TDD, 12 casos):
`src/lib/stage-rules/__tests__/passeios.test.ts` — cobre lista com ao menos 1
item/shape completo, preservação do item gratuito retornado pelo LLM,
ausência de invenção de gratuidade quando o LLM não traz nenhuma, chamada ao
Gateway de IA com `sessionId`/`stage`/`schemaName` corretos e destino no
prompt, repasse de hospedagem aprovada ao prompt, comportamento sem
orçamento (RF-10.3/RN-04), item gratuito sempre dentro do orçamento mesmo com
teto muito baixo, reordenação com orçamento informado (RF-10.1), item
gratuito nunca sinalizado como excedente mesmo quando nenhum item pago cabe,
sinalização de excedente correta quando não há nenhum item gratuito na lista
(RF-10.2), erro claro sem destino aprovado (RN-01), e propagação de erro do
Gateway de IA sem mascarar. `npm run lint` limpo; `npx tsc --noEmit` sem
novos erros (os 2 erros pré-existentes em `auth-callbacks.test.ts`/
`budget-insufficient-banner.test.tsx` e `destino/confirmacao/page.test.tsx`
não são desta tarefa, não tocados); `npm run build` (`next build`) compila,
type-checa e gera as 14 páginas com sucesso; `npx vitest run` — 374 de 446
testes passam (os 72 restantes são só os testes de integração Prisma que
exigem Postgres em `localhost:55432`, indisponível neste ambiente, mesma
limitação já documentada nas notas de RL8-T01/RL8-T02, nenhuma regressão
introduzida por esta tarefa). Nenhum desvio de escopo/estimativa; nenhum
bloqueio registrado em `BLOCKERS.md`.

**Nota de implementação L9-T02 (2026-09-10, Executor/FE):**
`PasseiosSugestoesScreen` criada em
`src/components/passeios/passeios-sugestoes-screen.tsx` (mesmo padrão de
`HospedagemSugestoesScreen`, L8-T02: `LoadingStream`/`ErrorRetryState`
via `fetchImpl` bridge, `SuggestionCard`, `BudgetInsufficientBanner`,
`StepperProgress`, foco gerenciado no `<h1>` ao montar). Interação
deliberadamente diferente de T06 (não copiado o padrão "aprovar
individualmente por cartão"): lista com seleção múltipla via checkbox
(marcado por padrão) + botão único "Remover" por item + um único "Aprovar
seleção" no rodapé. Semântica adotada para o critério de aceite (UX-SPEC.md
T07 não detalha a distinção checkbox vs. remoção, então documentada aqui como
decisão de detalhe de implementação, dentro da margem do Executor — não
escalada): checkbox desmarcado exclui o item da seleção sem tirá-lo da lista
(reversível); "Remover" tira o item da lista visível por completo
(irreversível nesta tela). `selecionados = itens visíveis (não removidos) E
marcados` é o conjunto enviado a `aprovarSelecaoPasseios`. Critério de
aceite central: "Aprovar seleção" fica `disabled` (nunca some do DOM — mais
previsível para teclado/leitor de tela) com mensagem inline
("Ao menos um passeio precisa permanecer selecionado para seguir ao
roteiro — ou encerre por aqui.") associada via `aria-describedby` quando
`selecionados` é vazio — tanto por remoção total quanto por desmarcar todos
os checkboxes (os dois mecanismos convergem para o mesmo estado, cobertos
por dois testes distintos); "encerrar aqui" continua disponível nesse caso
(fora do bloco condicional de aprovação), conforme UX-SPEC T07. Estado
"todos removidos" tratado como aviso inline, nunca `EmptyState` de página
inteira (UX-SPEC §4, confirmado explicitamente na especificação — `EmptyState`
não é usado nesta tela). `PriceRangeBadge` já tinha suporte a `free`
(badge "Gratuito" com texto, L5-T02) — nenhuma alteração necessária nesse
componente; `isFree` de `PasseiosSuggestionResult` (L9-T01) mapeado
diretamente para a prop `free`. Acessibilidade: cada checkbox tem rótulo
acessível próprio via `<label>` com texto `sr-only` ("Incluir "Nome" na
aprovação") — nenhuma informação só por cor; `aria-live`/foco herdados dos
componentes compartilhados.

Contrato da Server Action de L9-T03 (tarefa paralela, ainda não existente no
momento desta tarefa) documentado em bloco de cabeçalho dedicado no próprio
arquivo (`passeios-sugestoes-screen.tsx`): três funções esperadas em
`@/lib/actions/passeios` —
`gerarSugestoesPasseios(sessionId): Promise<PasseiosSuggestionResult[]>`,
`aprovarSelecaoPasseios({ sessionId, selecionados }): Promise<AprovarSelecaoPasseiosResult>`
(`{ proximaEtapa: "roteiro"; sessionId; flowState: "roteiro_pendente"; passeios: string[] }`,
mesmo padrão de `aprovarHospedagem` encadeando aprovar+avançar numa única
chamada, já que passeios também não tem tela de confirmação intermediária) e
`encerrarResolucaoPasseios(sessionId): Promise<EncerrarResolucaoPasseiosResult>`
(mesmo formato de `EncerrarResolucaoHospedagemResult`). Diferente de
`HospedagemSugestoesScreen`/`DestinoSugestoesScreen` (que já importam as
Server Actions reais diretamente, com `actionsOverride` opcional só para
teste), esta tela recebe `actions: PasseiosScreenActions` como prop
**obrigatória** — decisão deliberada para não importar um módulo
(`@/lib/actions/passeios`) que não existia no momento em que este arquivo foi
escrito/compilado/testado (evita quebrar build/type-check por uma
dependência que a outra instância paralela ainda estava produzindo). Quando
L9-T03 existir, o composable/rota que monta esta tela (fora do escopo desta
tarefa — nenhuma rota `/passeios` foi criada, mesmo padrão de T06 apontar
para `/passeios` antes de T07 existir) deve trocar para o padrão
`actionsOverride` opcional + import direto, mesmo precedente de T06 — deixado
explícito no comentário de cabeçalho do arquivo para reduzir risco de
divergência. Sem "Ajustar"/feedback textual nesta etapa: UX-SPEC.md T07 não
menciona regeneração com feedback (diferente de T06/RL8-T01), então nenhum
campo equivalente foi adicionado.

Teste novo (TDD, 13 casos):
`src/components/passeios/__tests__/passeios-sugestoes-screen.test.tsx` —
cobre estado Carregando (skeleton), estado Sucesso (lista com checkbox
marcado por padrão, badge "Gratuito", `PriceRangeBadge`), `BudgetInsufficientBanner`
sem desabilitar o botão principal (RN-04), desmarcar checkbox excluindo da
seleção enviada, remover item tirando-o da lista, os dois testes do critério
de aceite central (remoção total e desmarcar todos, ambos desabilitando
"Aprovar seleção" com a mensagem explicativa e mantendo "encerrar aqui"
disponível), aprovar seleção mostrando o rodapé continuar/encerrar, navegação
de "Continuar para roteiro" preservando `sessionId`/`flowState` já avançado
pelo servidor, "encerrar aqui" antes de aprovar (RN-03), foco no título ao
montar (UX-SPEC §5), estado Erro com retry, e erro ao aprovar mantendo a
lista visível com mensagem inline. `npm run lint` limpo nos arquivos desta
tarefa; `npx tsc --noEmit` sem novos erros nos arquivos desta tarefa (os
mesmos erros pré-existentes de `auth-callbacks.test.ts`/
`budget-insufficient-banner.test.tsx`/`destino/confirmacao/page.test.tsx` já
documentados em L9-T01, não tocados); `npm run build` (`next build`) compila,
type-checa e gera as 14 páginas com sucesso (nenhuma rota nova adicionada
por esta tarefa); `npx vitest run` — os 13 testes novos desta tarefa passam
integralmente; as 82 falhas observadas na suíte completa são todas dos
testes de integração Prisma pré-existentes que exigem Postgres em
`localhost:55432` (indisponível neste ambiente, mesma limitação já
documentada em L9-T01/RL8-T01/RL8-T02), nenhuma regressão introduzida por
esta tarefa. Nenhum desvio de escopo/estimativa; nenhum bloqueio registrado
em `BLOCKERS.md`. Execução em paralelo com a instância de L9-T03 sem
conflito de arquivo — escopos não se sobrepõem (`src/components/passeios/`
vs. `src/lib/actions/passeios.ts`).

**Nota de implementação L9-T03 (2026-09-10):** três Server Actions criadas
em `src/lib/actions/passeios.ts` (novo arquivo, erros dedicados em
`src/lib/actions/passeios-errors.ts`, sem `"use server"`, mesmo motivo de
`hospedagem-errors.ts`/`destino-errors.ts`), mesmo padrão exato de
`hospedagem.ts` (L8-T03)/`destino.ts` (L7-T03): resolve `TripSession` +
`DestinationApproval`/`AccommodationApproval` já aprovados, chama
`generatePasseiosSuggestions` (`@/lib/stage-rules`, L9-T01), persiste/avança
via `applySessionFlowTransition` (`@/lib/session-flow`, L4-T02). Assinatura
exata (alinhada de propósito ao contrato já assumido por
`PasseiosScreenActions`/`passeios-sugestoes-screen.tsx`, L9-T02, tarefa
paralela — confirmado lendo o bloco "CONTRATO ESPERADO DA SERVER ACTION DE
L9-T03" no cabeçalho daquele arquivo antes de nomear as funções aqui, para
reduzir risco de divergência):
- `gerarSugestoesPasseios(sessionId: string): Promise<PasseiosSuggestionResult[]>`
  — RF-07.1/.2, gera a lista variável de passeios; nenhuma transição de
  estado, sessão permanece em `passeios_pendente` (reaproveitada também para
  qualquer nova geração, já que T07 não tem campo de feedback textual, UX-SPEC
  confirmado nesta tarefa).
- `aprovarSelecaoPasseios(input: { sessionId: string; selecionados: PasseiosSuggestionResult[] }): Promise<AprovarPasseiosResult>`
  (`AprovarPasseiosResult` também exportado com o alias
  `AprovarSelecaoPasseiosResult`, mesmo shape `{ proximaEtapa: "roteiro";
  sessionId: string; flowState: "roteiro_pendente"; passeios: string[] }`) —
  RF-07.3, recebe só os itens JÁ FILTRADOS pelo client (não removidos/ainda
  marcados — decisão de contrato: mesmo padrão de `aprovarHospedagem`/
  `aprovarDestinoSugerido`, que recebem o que já foi decidido pela UI, não a
  lista completa + flag por item), revalida cada item individualmente
  (nome/duração vazios, faixa de preço não numérica/negativa/invertida/acima
  de `MAX_SANE_PRICE_BRL`) e sanitiza `name`/`durationApprox` contra prompt
  injection via `sanitizeFreeTextForPrompt` (L11-T03/RL8-T02, aplicado nesta
  tarefa desde o início, não como débito — mesmo raciocínio de
  `assertValidAccommodationPayload`/RL8-T02) ANTES de persistir. Lança
  `EmptyPasseiosSelectionError` (novo) se `selecionados` vier vazio — guarda
  server-side para o caso (defensivo) de a UI falhar em impedir aprovação sem
  nenhum item. Encadeia `aprovar` (grava um `ActivityApproval` por item via
  `tx.activityApproval.createMany`, já suportado por `persistence.ts` desde
  L4-T02 sem nenhuma mudança necessária ali — confirmado lendo o código antes
  de assumir) + `avancar` (`passeios_pendente` → `passeios_aprovados` →
  `roteiro_pendente`) na mesma Server Action — confirmado em UX-SPEC.md T07
  ("Rodapé de decisão igual às etapas anteriores", sem tela de confirmação
  intermediária própria de passeios) antes de copiar esse padrão de
  hospedagem, em vez de assumir cegamente.
- `encerrarResolucaoPasseios(sessionId: string): Promise<EncerrarResolucaoPasseiosResult>`
  (`{ proximaEtapa: "encerramento"; sessionId: string; flowState:
  "encerrada_parcial" }`) — disponível a partir de `passeios_pendente` ou
  `passeios_aprovados` (RN-03, `STATES_WITH_AT_LEAST_ONE_APPROVAL`, L4-T01),
  preserva destino/hospedagem/passeios já aprovados.

Teste novo (TDD): `src/lib/actions/__tests__/passeios.integration.test.ts`,
mesmo padrão de `hospedagem.integration.test.ts` (L8-T03) — Postgres real,
Gateway de IA mockado. Cobre: geração usando destino+hospedagem aprovados
(RF-07.1), rejeição de geração fora de `passeios_pendente`; aprovação
persistindo só os itens selecionados como `ActivityApproval` e avançando
para `roteiro_pendente` (critério de aceite central), rejeição de lista
vazia (`EmptyPasseiosSelectionError`), rejeição de aprovar fora de
`passeios_pendente` (`InvalidTransitionError`, sem pular etapa), rejeição de
payload adulterado (faixa de preço invertida) sem persistir nada,
sanitização de tentativa de prompt injection em `name`/`durationApprox`
antes de persistir; encerrar preservando o já aprovado em ambos os pontos de
saída (`passeios_pendente` e depois de aprovar), rejeição de encerrar sem
nenhuma etapa aprovada. `npm run lint` limpo nos arquivos desta tarefa;
`npx tsc --noEmit` sem novos erros nos arquivos desta tarefa (mesmos erros
pré-existentes de `auth-callbacks.test.ts`/`budget-insufficient-banner.test.tsx`/
`destino/confirmacao/page.test.tsx` já documentados em tarefas anteriores,
não tocados); `npm run build` (`next build`) compila, type-checa e gera as
14 páginas com sucesso (nenhuma rota nova adicionada por esta tarefa — mesmo
padrão de L9-T02, rota `/passeios` continua fora do escopo). Testes de
integração desta tarefa falham por `PrismaClientInitializationError`
(`localhost:55432` indisponível neste ambiente) — mesma limitação já aceita
e documentada em L8-T03/L4-T02/L9-T01/RL8-T01/RL8-T02; lógica de negócio
equivalente sem banco já coberta por `src/lib/stage-rules/__tests__/
passeios.test.ts` (L9-T01) e `src/lib/session-flow/__tests__/
state-machine.test.ts` (L4-T01). Nenhum desvio de escopo/estimativa; nenhum
bloqueio registrado em `BLOCKERS.md`. Execução em paralelo com a instância de
L9-T02 sem conflito de arquivo — escopos não se sobrepõem
(`src/components/passeios/` vs. `src/lib/actions/passeios.ts`); quando o
composable/rota que monta `PasseiosSugestoesScreen` for criado (fora do
escopo de L9-T02/L9-T03), deve importar `gerarSugestoesPasseios`/
`aprovarSelecaoPasseios`/`encerrarResolucaoPasseios` diretamente de
`@/lib/actions/passeios`, trocando o padrão de `actions` prop obrigatória
por `actionsOverride` opcional — mesmo precedente de T06, já deixado
explícito no cabeçalho de `passeios-sugestoes-screen.tsx`.

### Lote 10 — Roteiro Final e Encerramento (T08, T-END)

**Status do lote: Validado** (2026-09-12, Validador — chapéus QA e
DevSecOps aprovaram as 4 tarefas; ver `QA-REPORT.md`/`SECURITY-REVIEW.md`).
Achado estrutural (rotas `/hospedagem`, `/passeios`, `/roteiro`,
`/encerramento` inexistentes, atravessando os Lotes 8-11) encontrado na
checagem de fechamento — escalado ao Coordenador como Bloqueio 005,
resolvido com a criação do Lote 12 (Integração de Rotas); não gerou
`Refatoração Lote-10` (não é um achado simples de uma tarefa, é lacuna de
decomposição já tratada em lote próprio) e não bloqueia o fechamento deste
lote.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L10-T01 | Regra RF-08 — geração do roteiro estruturado por dia (manhã/tarde/noite), sequenciamento por proximidade geográfica e horário ideal, com justificativa de timing (RF-08.1/.2/.3) — **depende da resolução de SPIKE-02** | BE | 1 dia (SPIKE-02 resolvido sem geocoding real, ver Seção 2 — esforço equivalente ao das demais regras de etapa, L7-T01/L8-T01/L9-T01, não os 1.5 dia de incerteza original da Seção 6) | L3-T02, L3-T03, L3-T04, L9-T03, SPIKE-02, **L11-T03**, **RL8-T02** | L10-T04 | Concluída | Todo dia do range tem bloco manhã/tarde/noite; toda atividade tem horário sugerido; RF-08.2 evita deslocamento redundante sempre que alternativa equivalente existir — **Nota de implementação (2026-09-12)**: ver nota detalhada logo após esta tabela. |
| L10-T02 | T08 UI — blocos por dia (acordeão em mobile), horário + justificativa de timing | FE | 1 dia | L5-T03, L10-T01 | L10-T03 | Concluída | Um bloco por dia da viagem, dividido em manhã/tarde/noite; justificativa exibida quando presente — **Nota de implementação (2026-09-12)**: ver nota detalhada logo após esta tabela. |
| L10-T03 | T08 Server Action — aprovar roteiro (RF-08.4): grava `ItineraryItem`, marca sessão `concluida`, aciona RF-09 | BE | 1 dia | L4-T02, L10-T01 | L10-T02 | Concluída | Aprovação persiste todos os itens do roteiro e marca `TripSession.status = completed` — **Nota de implementação (2026-09-12)**: ver nota detalhada logo após esta tabela. |
| L10-T04 | T-END UI — resumo (completo ou parcial), reutilizada em todo ponto de saída (RN-03) | FE | 1 dia | L5-T01 | L10-T01, L10-T02, L10-T03 | Concluída | Rótulo "Viagem decidida!" (completo) ou "Parte da sua viagem está decidida" (parcial), nunca como erro — **Nota de implementação (2026-09-12)**: ver nota detalhada logo após esta tabela. |

**Nota de implementação L10-T01 (2026-09-12, Executor/BE):** antes de
implementar, resolvido o SPIKE-02 (timebox de 1 dia, ver "Resolução do
SPIKE-02" na Seção 2) — decisão: sem geocoding/mapas real, RF-08.2/RF-08.3
são responsabilidade do próprio LLM via instrução textual do prompt, melhor
esforço, sem nova integração externa. `buildRoteiroPrompt`/
`roteiroEstruturadoSchema` já existiam desde L3-T02 (Gateway de IA,
`src/lib/gateway-ia/prompts.ts`/`schemas.ts`) com exatamente essa instrução
("priorize agrupar atividades geograficamente próximas... sempre que uma
alternativa equivalente existir") e o schema Zod (`dias[].manha/tarde/noite`,
cada bloco com `atividade`/`horarioSugerido`/`justificativaTiming`
nullable) — nada precisou mudar ali; o trabalho desta tarefa foi a REGRA de
negócio nova em `src/lib/stage-rules/roteiro.ts` (`generateRoteiro`),
reexportada em `src/lib/stage-rules/index.ts`, mesmo padrão exato de
`./hospedagem.ts` (L8-T01)/`./passeios.ts` (L9-T01): chama
`generateStructuredCompletionWithRetry` (L3-T04) para a etapa `roteiro`,
passando `sessionDateRange` (novo em relação às demais etapas — roteiro é a
única cuja saída tem datas literais, então a única que aciona o grounding de
calendário de `validateDateGrounding`, L3-T03, já pronto desde então). Sem
`applyBudgetFilter` (RF-10) — o roteiro não introduz preço próprio, só
sequencia o que já foi aprovado.

Peça específica desta tarefa, além de só encaminhar ao Gateway de IA:
`normalizeRoteiroDays` garante o critério de aceite "todo dia do range da
viagem tem bloco manhã/tarde/noite" mesmo quando o LLM devolve menos dias do
que o range inteiro — enumera todas as datas ISO de `dateRangeStart` a
`dateRangeEnd` (inclusive) e preenche qualquer dia ausente da resposta do
LLM com os 3 blocos vazios (nunca remove um dia devolvido, nunca inventa
atividade); dias duplicados pelo LLM para a mesma data são mesclados
(blocos concatenados). "Toda atividade tem horário sugerido" já é garantido
pelo schema (`horarioSugerido: z.string().min(1)`, L3-T02) — `generateRoteiro`
só repassa o valor. RF-08.2 (evitar deslocamento redundante "sempre que uma
alternativa equivalente existir") permanece melhor esforço do modelo, por
decisão do SPIKE-02 — não há checagem de proximidade real neste módulo
(não há dado de geolocalização para checar contra). `RoteiroItemResult`
inclui `sequenceOrder` (0-based, ordem cronológica dia > manhã/tarde/noite >
ordem devolvida pelo LLM dentro do bloco), calculado aqui para poupar a
futura Server Action (L10-T03) de recalcular a mesma ordem ao persistir
`ItineraryItem.sequenceOrder` (`prisma/schema.prisma`) — este módulo não
persiste nada (RN-01, só a regra de geração).

Sanitização de texto livre (L11-T03/RL8-T02): `input.destination.name`/
`input.accommodation.name`/`.type`/`input.approvedActivities[].name` já
chegam sanitizados contra prompt injection antes de serem persistidos como
`DestinationApproval`/`AccommodationApproval`/`ActivityApproval` — mesmo
raciocínio de `./hospedagem.ts`/`./passeios.ts`, esta função não sanitiza de
novo.

Testes novos em `src/lib/stage-rules/__tests__/roteiro.test.ts` (12 casos,
`generateStructuredCompletionWithRetry` mockada, mesmo padrão de
`passeios.test.ts`): todos os dias do range presentes mesmo com dia ausente
na resposta do LLM; os 3 blocos sempre presentes (arrays, mesmo vazios);
toda atividade com horário sugerido não vazio; justificativa de timing
preservada quando presente e `null` quando ausente; `sequenceOrder`
crescente e único na ordem cronológica correta; mesclagem de dias duplicados
devolvidos pelo LLM; chamada ao Gateway de IA com `sessionId`/`stage`/
`schemaName`/`sessionDateRange` corretos e destino/hospedagem interpolados
no prompt; passeios aprovados repassados ao prompt quando informados;
funciona sem nenhum passeio aprovado (RN-04); erro claro quando chamada sem
destino/hospedagem já aprovados (RN-01/RF-11/RF-06); propagação do erro do
Gateway de IA sem mascarar (inclui rejeição por grounding de data, L3-T03).

Limitação de ambiente encontrada e corrigida nesta tarefa (não é uma
lacuna do código, é do `node_modules` compartilhado): `npm test` estava
quebrado para TODA a suíte (não só esta tarefa) por
`@testing-library/dom` ausente de `node_modules` mesmo sendo peer dependency
obrigatória de `@testing-library/jest-dom` (`vitest.setup.ts` importa
`@testing-library/jest-dom/vitest` globalmente para todo teste, inclusive os
com `@vitest-environment node`) — não estava listada como pacote instalado
em `package-lock.json`, só referenciada como peer dependency de outros
pacotes. Adicionada como `devDependency` explícita
(`@testing-library/dom@^10.4.1`, `npm install --save-dev --legacy-peer-deps`,
mesma flag já em uso pelos demais `npm install` deste ambiente por causa de
um conflito de peer dependency pré-existente e não relacionado
— `@vercel/analytics` vs. `@sveltejs/vite-plugin-svelte`/`vite`, de uma
tarefa de deploy em andamento em paralelo neste mesmo lote, arquivos
`vercel.json`/`.github/workflows/deploy.yml` não tocados por esta tarefa).
Também foi necessário um `npm ci` limpo (`rm -rf node_modules` +
reinstalação) durante esta tarefa porque múltiplos processos concorrentes
neste ambiente (outras instâncias paralelas de Executor rodando `npm
install`/`npm ci`/`next build` no mesmo `node_modules` compartilhado, sem
nenhum lock entre elas) corromperam pacotes (`next`, `vitest`) a meio de
instalação antes desta tarefa conseguir validar — sinalizado aqui como
achado de coordenação de ambiente para o Coordenador/Gestor avaliarem
(idealmente serializar instalação de dependências entre instâncias paralelas
do mesmo lote, ou isolar `node_modules` por execução), não uma ação de
código desta tarefa. `package.json`/`package-lock.json` só ganharam a linha
de `@testing-library/dom`; nenhuma outra dependência foi tocada por esta
tarefa (as demais alterações vistas em `package.json` durante a investigação
— ex. `@vercel/analytics`/`@vercel/speed-insights`, upgrade do Next.js para
15.5.25 refletido em `tsconfig.json` — pertencem a outra tarefa em execução
paralela neste mesmo lote, não a esta).

Verificação: `npx vitest run src/lib/stage-rules/__tests__/roteiro.test.ts`
— 12/12 testes passam; `npx vitest run` completo — 428 passam, 85 falham,
todas as 85 são `PrismaClientInitializationError` (`localhost:55432`
indisponível neste ambiente, integração real com Postgres), mesma limitação
já aceita e documentada desde L7-T03/L8-T03/L9-T03/RL8-T01/RL8-T02, nenhuma
regressão introduzida por esta tarefa; `npx eslint` limpo nos 3 arquivos
desta tarefa (`roteiro.ts`, `roteiro.test.ts`, `stage-rules/index.ts`);
`npx tsc --noEmit` sem nenhum erro novo nos arquivos desta tarefa (os erros
pré-existentes em `anonymous-session/route.ts`/`gateway-ia/[etapa]/route.ts`/
`resolve-session-owner.ts`/`auth-callbacks.test.ts`/outros — já documentados
em tarefas anteriores — não tocados por esta tarefa); `npm run build`
(`next build`) compila e type-checa com sucesso e gera as 14 páginas em
todas as 3 tentativas realizadas (nenhuma rota nova adicionada por esta
tarefa), mas a etapa final de escrita de artefato (`collecting build
traces`/`export`) falhou de forma intermitente e não determinística nas 3
tentativas com `ENOENT`/`rename` em arquivos diferentes a cada vez dentro de
`.next/` — consistente com interferência de sincronização do OneDrive/outros
processos concorrentes neste ambiente compartilhado sobre a pasta `.next/`,
não com um erro de compilação/tipo desta tarefa (compilação e type-check
reportam sucesso nas 3 tentativas, antes da falha ocorrer). Nenhum desvio de
escopo/estimativa; nenhum bloqueio registrado em `BLOCKERS.md`.

**Nota de implementação L10-T02 (2026-09-12, Executor/FE):** `RoteiroScreen`
criada em `src/components/roteiro/roteiro-screen.tsx` ("use client") e o
novo componente de design system `ItineraryDayBlock`
(`src/components/design-system/itinerary-day-block.tsx`), previsto desde a
UX-SPEC.md Seção 3 ("`HolidayListItem`, `ItineraryDayBlock` (novos) —
específicos de T02 e T08"). Mesmo padrão estrutural de
`PasseiosSugestoesScreen` (L9-T02)/`HospedagemSugestoesScreen` (L8-T02):
`LoadingStream`/`ErrorRetryState` via `fetchImpl` bridge, `StepperProgress`
(`roteiro_pendente`/`roteiro_aprovado`, já existentes desde L4-T01/L5-T01,
nenhum estado novo necessário), foco gerenciado no `<h1>` ao montar.

Critério de aceite central ("um bloco por dia da viagem, dividido em
manhã/tarde/noite; justificativa exibida quando presente") resolvido
inteiramente dentro de `ItineraryDayBlock`, consumindo `RoteiroDayResult[]`
(`@/lib/stage-rules`, L10-T01) sem transformação: os 3 períodos
(manhã/tarde/noite) são sempre renderizados, mesmo vazios (mostrando "Nada
planejado." em vez de omitir a seção — nenhum bloco de período desaparece
mesmo sem atividade, reforçando visualmente que os 3 períodos sempre existem
por dia, RF-08.1); cada item mostra `suggestedTime` sempre (garantido não
vazio pelo schema desde L3-T02/L10-T01) e `timingJustification` só quando
não `null` — nenhuma string vazia/"—" no lugar de ausência.

Acordeão em mobile (UX-SPEC.md Seção 6, "Blocos de dia em acordeão (um dia
expandido por vez, os demais colapsados)" em mobile; "todos os dias
expandidos... sem lado a lado" em desktop): resolvido só com CSS responsivo
dentro de `ItineraryDayBlock` (`hidden` no conteúdo por padrão + `md:flex`
força visível em telas >= md, independentemente do estado — mesmo padrão
Tailwind de show/hide responsivo, sem duplicar DOM/lógica por breakpoint),
nunca desmontando o conteúdo do dia colapsado (só oculto via CSS) — decisão
de detalhe de implementação documentada no cabeçalho do arquivo, dentro da
margem do Executor (a UX-SPEC.md não especifica o mecanismo, só o
comportamento visual). `ItineraryDayBlock` é controlado pelo chamador
(`expanded`/`onToggle`, mesmo princípio de desacoplamento de
`HolidayListItem`/`SuggestionCard`) — `RoteiroScreen` guarda um único
`expandedDate` (nunca um `Set`, reflete literalmente "um dia expandido por
vez") e expande o primeiro dia do range por padrão ao carregar (decisão de
detalhe de implementação: mostra conteúdo imediatamente, sem exigir um
clique extra para ver o primeiro dia). `aria-expanded` no cabeçalho de cada
dia reflete esse estado lógico mesmo quando o conteúdo já está visível no
desktop por CSS (mesmo padrão de trade-off documentado já aceito em
`LoadingStream`, L5-T03, para `aria-live`).

Ação única de aprovação no rodapé ("Aprovar roteiro e concluir", UX-SPEC.md
T08: "não há 'ajustar' item a item dentro do roteiro no MVP") — diferente de
T06/T07, sem "encerrar aqui" nesta tela (T08 é a última etapa da jornada;
UX-SPEC.md T08 não menciona essa opção). Ao aprovar com sucesso, a tela
mostra um rodapé de conclusão com "Ver resumo da viagem", navegando para
`/encerramento?sessionId&flowState=concluida` (mesmo padrão de navegação
client-side pós-confirmação do servidor já usado por
`PasseiosSugestoesScreen`/`HospedagemSugestoesScreen` — o servidor já
confirmou o avanço via `aprovarRoteiro`, este `push` é só navegação).

Integração com a Server Action de L10-T03 (`@/lib/actions/roteiro`, tarefa
paralela a esta, mesmo lote): `@/lib/actions/roteiro.ts` passou a existir
ainda durante esta mesma tarefa (a outra instância paralela terminou
primeiro), então `RoteiroScreen` já importa e consome as funções reais
(`gerarRoteiro`/`aprovarRoteiro`) em vez de manter uma prop de ações
obrigatória especulativa — mesmo padrão de `HospedagemSugestoesScreen`
(`actionsOverride` opcional só para testes, dublês injetados sem mockar o
módulo inteiro). Um ponto do contrato real ficou diferente do que esta tela
assumia inicialmente (documentado no cabeçalho de `roteiro-screen.tsx`, "a
tela foi ajustada para o formato real, nunca o inverso" — TASK.md Seção 1
item 3): `aprovarRoteiro` exige `{ sessionId, dias: RoteiroDayResult[] }`,
não só `sessionId` — T08 não persiste nenhum estado intermediário entre
"gerar" e "aprovar", então o roteiro já carregado no client é reenviado para
revalidação/persistência (`flattenAndValidateDias`, dentro de `roteiro.ts`,
nunca confia cegamente no payload do cliente, Diretriz de Implementação 9);
`AprovarRoteiroResult` real também inclui `totalItens`, só informativo, não
usado por esta tela.

Testes novos: `src/components/design-system/__tests__/itinerary-day-block.test.tsx`
(6 casos — 3 blocos de período sempre presentes mesmo com um vazio; horário
sugerido sempre exibido; justificativa exibida só quando presente, nunca a
string "null"; rótulo de cabeçalho formatado, dia da semana abreviado +
`DD/MM`; `aria-expanded` reflete o estado controlado; clique no cabeçalho
chama `onToggle`) e `src/components/roteiro/__tests__/roteiro-screen.test.tsx`
(9 casos, Server Actions reais substituídas por dublês via `actionsOverride`
— skeleton de `LoadingStream`; um bloco por dia com os 3 períodos;
justificativa condicional; acordeão com um dia expandido por vez, incluindo
alternar e colapsar; aprovação reenviando o roteiro carregado a
`aprovarRoteiro` e mostrando o rodapé de conclusão; navegação para
`/encerramento?flowState=concluida`; foco no `<h1>` ao montar;
`ErrorRetryState` com retry após falha de `gerarRoteiro`; erro inline ao
falhar `aprovarRoteiro`, mantendo os blocos visíveis).

Verificação: `npx vitest run
src/components/design-system/__tests__/itinerary-day-block.test.tsx
src/components/roteiro/__tests__/roteiro-screen.test.tsx` — 15/15 testes
passam; `npx eslint` limpo nos 4 arquivos desta tarefa (mesmo ajuste de
`useCallback` dependendo de `actionsOverride`, não do objeto `actions`
recalculado a cada render, já usado por `HospedagemSugestoesScreen`, para
evitar o warning `react-hooks/exhaustive-deps`); `npx tsc --noEmit` sem
nenhum erro novo nos arquivos desta tarefa (os erros pré-existentes em
`destino/confirmacao/__tests__/page.test.tsx`/
`budget-insufficient-banner.test.tsx`/`auth-callbacks.test.ts` — de outras
tarefas paralelas, não tocados por esta tarefa). `npm run build`/`npm test`
completos não executados nesta tarefa (instrução explícita de evitar rodar
a suíte inteira/build com outras sessões trabalhando em paralelo no mesmo
`node_modules`/`.next`, mesma limitação de ambiente já documentada na nota
de L10-T01). Nenhum arquivo fora do escopo desta tarefa tocado
(`package.json`/`next.config`/`tsconfig.json`/`vercel.json`/
`.github/workflows/` não modificados). Nenhum desvio de escopo/estimativa;
nenhum bloqueio registrado em `BLOCKERS.md`.

**Nota de implementação L10-T03 (2026-09-12, Executor/BE):** Server Action
de T08 (RF-08.4/RF-09) em `src/lib/actions/roteiro.ts`, mesmo padrão exato
de `passeios.ts` (L9-T03)/`hospedagem.ts` (L8-T03): duas funções, sem
`encerrarResolucao` dedicada (UX-SPEC.md T08 não tem "encerrar aqui" — a
última chance de encerrar sem roteiro é o rodapé de T07). `gerarRoteiro`
resolve sessão + checa `roteiro_pendente` + ownership (`assertSessionOwnership`,
L11-T02, leitura direta de `TripSession` fora do módulo `session-flow`) e
delega a `generateRoteiro` (L10-T01), passando destino/hospedagem/passeios já
aprovados. `aprovarRoteiro` achata `RoteiroDayResult[]` (agrupado por dia >
`morning`/`afternoon`/`evening`) em `ApproveItineraryItemInput[]` (uma linha
por item), revalidando cada item (`activity`/`suggestedTime` não vazios após
`sanitizeFreeTextForPrompt`, `timingJustification` sanitizado quando
presente, `sequenceOrder` inteiro não-negativo, `date` no formato ISO
estrito) antes de encadear as duas transições da state machine já usadas por
`aprovarHospedagem`/`aprovarSelecaoPasseios` (`aprovar` grava
`ItineraryItem` via `createMany`, `roteiro_pendente` → `roteiro_aprovado`;
`avancar` leva a `concluida`, ESTADO TERMINAL — diferente das etapas
anteriores). `applySessionFlowTransition` (L4-T02, já existente) já
sincroniza `TripSession.status = "completed"` automaticamente ao gravar
`flowState = "concluida"` (Adendo 1 do ADR-006) — nenhuma escrita adicional
foi necessária nesta tarefa para o critério de aceite central.

Achado registrado, NÃO tratado como bloqueio (documentado em detalhe no
cabeçalho de `roteiro.ts`, bloco "GAP DE SCHEMA CONHECIDO", para
visibilidade do Coordenador): `ItineraryItem` (`prisma/schema.prisma`/
SDD.md Seção 5) não tem nenhuma coluna de texto livre para o nome da
atividade em si — só `suggestedTime`/`timingJustification`/`sequenceOrder`/
`period`/`dayDate` e o `activityId` opcional. O design original do SDD
presumia que todo `ItineraryItem` obteria seu nome de exibição via join com
`ActivityApproval.name`, mas `buildRoteiroPrompt` (já existente desde
L3-T02) explicitamente instrui o LLM a montar um roteiro coerente com o
destino mesmo sem nenhum passeio aprovado (RN-04) — ou seja, é NORMAL o
roteiro conter itens sem `ActivityApproval` correspondente, e
`RoteiroItemResult.activity` (L10-T01) nunca carrega um id de origem para
vincular via `activityId` de qualquer forma (casar por nome seria uma
heurística frágil, o LLM pode parafrasear). Resultado: todo `ItineraryItem`
persistido aqui grava `activityId: null`, e o texto de `activity` é
validado (rejeita vazio) mas nunca persistido em lugar nenhum — uma vez
gravado, não há como reconstruir "o que" o item é a partir só do banco.
NÃO bloqueou esta tarefa porque (a) o critério de aceite é persistir
conforme o schema já aprovado desde L1-T02/L4-T02 (mudar
`prisma/schema.prisma` exigiria uma migration + decisão do Coordenador,
fora da autoridade desta tarefa) e (b) nenhuma tarefa deste lote lê
`ItineraryItem` de volta do banco para montar UI — `EncerramentoScreen`/T-END
(L10-T04) é puramente apresentacional e recebe os dados já resolvidos em
memória por quem a monta (mesmo gap já aceito por aquela tarefa), e
`RoteiroScreen` (L10-T02) mantém o roteiro completo em estado local (`days`)
entre gerar/aprovar, nunca precisando reler do banco no caminho feliz do
MVP. Impacto real fica restrito a um cenário futuro fora de escopo (Fase 2:
reabrir uma viagem já concluída e listar o roteiro salvo) — sinalizado para
o Coordenador avaliar se `ItineraryItem` precisa de uma coluna própria de
nome/atividade numa migration futura.

Contrato confirmado compatível com `RoteiroScreen` (L10-T02, tarefa
paralela que terminou depois e já consome as funções reais, ver cabeçalho
de `roteiro-screen.tsx`): `gerarRoteiro(sessionId): Promise<RoteiroDayResult[]>`
e `aprovarRoteiro({ sessionId, dias }): Promise<AprovarRoteiroResult>`
(`{ proximaEtapa: "encerramento"; sessionId; flowState: "concluida";
totalItens }`) — nenhum ajuste retroativo necessário nesta tarefa.

Testes novos (TDD): `src/lib/actions/__tests__/roteiro.integration.test.ts`
(mesmo padrão de `passeios.integration.test.ts`/`hospedagem.integration.test.ts`
— Postgres real, Gateway de IA mockado): roteiro gerado usando destino/
hospedagem/passeios já aprovados; rejeição de geração fora de
`roteiro_pendente` sem chamar o Gateway de IA; aprovação persiste todos os
itens (3 itens em 2 dias, `period`/`suggestedTime`/`timingJustification`/
`sequenceOrder`/`dayDate` corretos) e conclui a sessão
(`flowState: "concluida"`, `status: "completed"`, critério de aceite
explícito); rejeição de aprovação fora de `roteiro_pendente`
(`InvalidTransitionError`) sem persistir nada; rejeição de item adulterado
(atividade vazia) e de data de dia em formato inválido, ambos sem persistir
nada; sanitização de tentativa de prompt injection em
`timingJustification` antes de persistir (mesmo padrão de RL8-T02) — não
testado via `activity` porque esse campo nunca é persistido (ver gap acima).

Verificação: `npx eslint src/lib/actions/roteiro.ts src/lib/actions/roteiro-errors.ts
src/lib/actions/__tests__/roteiro.integration.test.ts --max-warnings=0` —
limpo; `npx tsc --noEmit` sem nenhum erro novo nos arquivos desta tarefa (os
erros pré-existentes em `destino/confirmacao/__tests__/page.test.tsx`/
`budget-insufficient-banner.test.tsx`/`auth-callbacks.test.ts`/
`roteiro-screen.test.tsx` — este último de uma instância paralela de
L10-T02 — não tocados por esta tarefa); `npx vitest run
src/lib/actions/__tests__/roteiro.integration.test.ts` — 9 testes, todos
falham com `PrismaClientInitializationError` (`localhost:55432`
indisponível neste ambiente) — mesma limitação de ambiente já aceita e
documentada desde L7-T03/L8-T03/L9-T03/RL8-T01/RL8-T02/L10-T01 (Postgres
real não acessível neste ambiente de execução, sem Docker disponível para
subir um local), não uma falha de lógica: os 7 caminhos que dependem só de
`prisma.tripSession.create`/leitura falham todos pelo mesmo motivo de
conexão, nenhum por asserção; `npx vitest run
src/lib/stage-rules/__tests__/roteiro.test.ts src/lib/session-flow` — 71
testes sem banco passam (mesmas 18 falhas de `PrismaClientInitializationError`
em `persistence.integration.test.ts`, pré-existentes, nenhuma nova); `npm
run build`/`npm test` completos não executados nesta tarefa (instrução
explícita de evitar rodar a suíte inteira/build com outras sessões
trabalhando em paralelo no mesmo `node_modules`/`.next`, mesma limitação de
ambiente já documentada nas notas de L10-T01/L10-T02). Nenhum arquivo fora
do escopo desta tarefa tocado (`package.json`/`next.config`/`tsconfig.json`/
`vercel.json`/`.github/workflows/`/`src/components/roteiro/` não
modificados). Nenhum desvio de escopo/estimativa; nenhum bloqueio
registrado em `BLOCKERS.md` (o gap de schema acima é um achado sinalizado,
não um bloqueio desta tarefa, ver raciocínio completo acima).

**Nota de implementação L10-T04 (2026-09-12, Executor/FE):** Tela T-END
(Encerramento/Resumo, UX-SPEC.md Seção 2, RN-03) implementada como
`EncerramentoScreen`
(`src/components/encerramento/encerramento-screen.tsx`, "use client",
componente de apresentação puro). Esta tarefa depende só de `L5-T01` e é
deliberadamente desacoplada de `L10-T01`/`L10-T02`/`L10-T03` (não esperou por
elas, executada em paralelo): como não existe nenhuma tarefa dedicada em
Lote 10 a ler os registros persistidos
(`DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/
`ItineraryItem`, `prisma/schema.prisma`) e montar o resumo, o componente foi
desenhado como tela pura — recebe `flowState` ("concluida" | "encerrada_parcial",
mesmo vocabulário de `SessionFlowState`) e `resumo`
(`{ destino?, hospedagem?, passeios?, roteiroAprovado? }`, cada campo ausente
= etapa não aprovada) já resolvidos por quem monta a tela, mesmo princípio de
`DestinoConfirmacaoScreen` (L7-T04). **Gap conhecido, documentado no
cabeçalho do arquivo, não bloqueante**: nenhuma Server Action de "obter
resumo da sessão" nem rota `/encerramento/page.tsx` foram criadas nesta
tarefa (mesmo padrão de gap já aceito nas notas de L7-T02/L9-T02 — rota
apontando para uma tela cuja Server Action companion ainda não existe); os
links "encerrar aqui" de `DestinoSugestoesScreen`/`HospedagemSugestoesScreen`/
`PasseiosSugestoesScreen` continuam resultando em 404 em `/encerramento` até
uma tarefa futura (fora deste lote) criar essa Server Action + página —
sinalizado aqui para o Coordenador poder agendá-la se achar necessário, não é
uma lacuna do UX-SPEC.md (que não define o mecanismo de obtenção de dados, só
o conteúdo/rótulo da tela).

Critério de aceite central: rótulo "Viagem decidida!" quando `flowState ===
"concluida"` (RF-09, roteiro aprovado) ou "Parte da sua viagem está decidida"
quando `flowState === "encerrada_parcial"` (RN-03) — os dois tratados com o
mesmo ícone de confirmação (`CheckCircle2`, token `text-success`), nunca
`role="alert"` nem os tokens semânticos de erro (`text-error`/`border-error`),
mesmo no caso parcial (UX-SPEC.md: "nunca tratado como erro ou fluxo
incompleto/quebrado"), testado explicitamente. Resumo lista só os blocos das
etapas efetivamente aprovadas (Destino/Hospedagem/Passeios/Roteiro,
`ResumoBloco` com `role="region"` via `aria-label`), cumulativo conforme
UX-SPEC §2; `PriceRangeBadge` (L5-T02) reaproveitado para o badge "Gratuito"
de passeios. `StepperProgress` (L5-T01) recebe `currentState={flowState}` +
`approvedStepsHint` calculado do `resumo` — usa exatamente o mecanismo de
desambiguação de `encerrada_parcial` já previsto no comentário de cabeçalho
de `getStepperStepStatuses` (L5-T01) para este caso de uso. CTA "Ver isso
depois" (UX-SPEC §7/RF-09/ADR-005: "sem ação adicional do usuário") com
`onVerDepois` opcional — sem tela de "minhas viagens" no MVP (Fase 2, fora de
escopo), o botão reforça a mensagem de "já está salvo" mesmo sem callback.
Foco gerenciado no `<h1>` ao montar (UX-SPEC §5, mesmo padrão de todas as
demais telas). Responsivo conforme UX-SPEC §6 (T-END: blocos empilhados no
mobile, lado a lado no desktop via `md:flex-row md:flex-wrap`).

Testes (TDD): `src/components/encerramento/__tests__/encerramento-screen.test.tsx`
(9 casos) — os dois rótulos de status (completo/parcial); garantia explícita
de que o estado parcial nunca usa `role="alert"`/tokens de erro/linguagem de
"erro-falha-quebrado" (critério de aceite central desta tarefa); mesmo
tratamento visual (ícone `text-success`) nos dois casos; blocos exibidos só
para etapas aprovadas (resumo parcial só com destino) e todos os 4 blocos
quando tudo aprovado (incluindo badge "Gratuito"); foco no título ao montar;
`onVerDepois` disparado ao clicar, e nenhuma quebra quando a prop está
ausente.

Ambiente de execução desta tarefa coincidiu com uma migração de Next.js
14→15.5.25/adição de `@vercel/analytics`/`@vercel/speed-insights` conduzida
por outra instância em paralelo (Lote de deploy, fora do escopo desta
tarefa) mexendo em `package.json`/`package-lock.json`/`node_modules`
concorrentemente — mesmo padrão de instabilidade compartilhada já
documentado na nota de L10-T01 acima (`.next/` com `ENOENT` intermitente) e
em notas de lotes anteriores (ex. Lote 6). Nenhum arquivo dessa migração foi
alterado por esta tarefa. Verificação: `npx vitest run
src/components/encerramento` — 9/9 passam; `npx eslint
src/components/encerramento --max-warnings=0` limpo; `npx tsc --noEmit` sem
nenhum erro nos arquivos desta tarefa (os erros existentes em outros
arquivos, ex. `gateway-ia/[etapa]/__tests__/route.test.ts`,
`destino/confirmacao/__tests__/page.test.tsx`, são da migração para Next 15
— `params` passou a ser `Promise` — em execução paralela, não tocados por
esta tarefa); `npx vitest run` completo — 427 passam, 86 falham (85 já
documentadas como `PrismaClientInitializationError`/Postgres indisponível,
mesma limitação aceita desde L7-T03, + 1 timeout pré-existente em
`confirmacao-destino-client.test.tsx` associado à mesma migração paralela de
Next 15), nenhuma falha em `src/components/encerramento`; `npm run build`
(`next build`) compila, type-checa e gera as 14 páginas com sucesso (nenhuma
rota nova adicionada por esta tarefa, conforme gap documentado acima).
Nenhum desvio de escopo/estimativa; nenhum bloqueio registrado em
`BLOCKERS.md`.

### Lote 11 — Cross-cutting Final (Segurança, LGPD, Acessibilidade)

**Status do lote: Validado** (2026-09-12, Validador — chapéus QA e
DevSecOps aprovaram as 5 tarefas sem ressalvas; ver `QA-REPORT.md`/
`SECURITY-REVIEW.md`). Nenhum achado crítico nem simples; nenhuma tarefa em
`Refatoração Lote-11` criada.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L11-T01 | Exclusão de conta e dados associados (LGPD, RNF-06) — endpoint + cascade delete de `TripSession` e entidades filhas por `user_id` | BE | 1 dia | L1-T02, L1-T03 | L11-T02a, L11-T02, L11-T03 | Concluída | Excluir conta remove todas as sessões e entidades filhas associadas; nenhum dado órfão remanescente |
| L11-T02a **(nova, ver Bloqueio 004/ADR-008)** | Persistência do dono da sessão — schema (`anon_session_id`), `createSessionWithDateRange` passa a exigir `owner` (usuário autenticado ou sessão anônima) e grava no `INSERT`, com retrofit pontual de `submeterDataLivre`/L6-T03, `processarFeriadoEscolhido`/L6-T05 e `submitQuizAnswers`/L6-T07 para resolver e passar `owner` (SDD §5/§7, ADR-008) | BE | 1 dia | L1-T03, L4-T02 | L11-T01, L11-T03 | Concluída | Toda `TripSession` criada grava exatamente um dono (`user_id` OU `anon_session_id`, nunca os dois, nunca nenhum); as 3 Server Actions de criação continuam funcionando sem regressão (fluxo anônimo e autenticado), cobertas por teste automatizado |
| L11-T02 | Autorização cross-cutting — guard central que resolve o dono esperado da requisição (mesma regra de precedência de `L11-T02a`) e compara contra o dono persistido em `TripSession` (SDD §7, ADR-008); integrado a `applySessionFlowTransition`/`gerarSugestoesDestino`/toda leitura direta de `TripSession` | BE | 0.5 dia | L11-T02a | L11-T01, L11-T03 | Concluída | Requisição com cookie/`user_id` de outra sessão recebe sempre **404** (nunca 403), nunca expõe dado de terceiro; dono legítimo (mesmo cookie/`user_id` gravado na criação) continua autorizado sem regressão |
| L11-T03 **(elegível a partir do Lote 3 — ver nota abaixo)** | Validação/sanitização de entrada de texto livre (orçamento, destino manual) contra prompt injection (SDD §7) | BE | 0.5 dia | L3-T02 | L11-T01, L11-T02a, L11-T02 | Concluída | Entrada com tentativa de instrução embutida não altera o comportamento do prompt da etapa |
| L11-T04 | Revisão final de acessibilidade cross-tela (foco em transição, `aria-live`, contraste, alvo de toque ≥44px) sobre T00-T-END | FE | 1 dia | Todas as tarefas de tela dos Lotes 6, 7, 8, 9, 10 | — | Concluída | Nenhuma pendência crítica de `accessibility-review`; checklist de WCAG AA aplicado em todas as telas |

**Nota de resolução do Bloqueio 004 (2026-09-10, Coordenador)**: `L11-T02`
estava `Bloqueada` — reaberta como duas tarefas, formalizadas em ADR-008
(`.md/adr/008-propriedade-e-autorizacao-de-trip-session.md`):

- **`L11-T02a` (nova)**: persiste o dono da sessão. Schema Prisma ganha
  `anonSessionId String? @map("anon_session_id")` em `TripSession`
  (coexistindo com `userId`, mutuamente exclusivos na prática, sem `CHECK`
  formal). `createSessionWithDateRange`
  (`src/lib/session-flow/create-session-with-range.ts`) passa a exigir um
  parâmetro `owner: { type: "user"; userId } | { type: "anonymous";
  anonSessionId }`, gravado no `INSERT`. Como essa mudança de contrato afeta
  as 3 Server Actions já `Concluída`s que chamam o helper
  (`submeterDataLivre`/`src/lib/actions/data-livre.ts`/L6-T03,
  `processarFeriadoEscolhido`/`src/lib/actions/feriados.ts`/L6-T05,
  `submitQuizAnswers`/`src/lib/actions/quiz.ts`/L6-T07), o retrofit delas
  (resolver `owner` via `getServerSession(authOptions)` — autenticado — ou
  `resolveAnonymousSessionId` do cookie — anônimo, com precedência de conta
  sobre cookie — e passar para o helper) **faz parte do escopo de
  `L11-T02a`**, não uma tarefa separada: é a mesma mudança mecânica aplicada
  de forma idêntica nos 3 chamadores de um único helper compartilhado, sem
  introduzir regra de negócio nova em nenhum deles (inseparabilidade
  documentada aqui, não decidida em silêncio). Nenhuma outra Server Action
  cria `TripSession` hoje.
- **`L11-T02` (revisada)**: guard central em si, agora dependente de
  `L11-T02a` — sem o dono persistido, não há contra o que comparar. Critério
  de aceite ajustado: resposta de negação é **sempre 404** (nunca 403,
  decisão explícita do ADR-008 para não revelar existência do registro a
  dono errado) — remove a ambiguidade "403/404" do critério de aceite
  original. Guard resolve o dono esperado da requisição com a mesma regra de
  precedência de `L11-T02a` e integra em `applySessionFlowTransition`
  (`src/lib/session-flow/persistence.ts`), `gerarSugestoesDestino`, e
  qualquer outro ponto de leitura direta de `TripSession` fora desse módulo
  — mesma superfície já mapeada pelo Executor na nota de bloqueio abaixo.
  Estimativa reduzida de 1 para 0.5 dia (a complexidade de persistência do
  dono migrou para `L11-T02a`).

**Instrução para quem retomar**: executar `L11-T02a` primeiro (schema +
migration + helper + retrofit dos 3 chamadores + teste cobrindo os dois
fluxos, anônimo e autenticado, sem regressão), só então `L11-T02` (guard +
integração + teste de autorização: dono legítimo passa, identidade de outra
sessão recebe 404 sem vazar dado). Nenhuma mudança em `flowState`/`status`
nem em nenhuma decisão já registrada em ADR-005/ADR-006.

Nota de implementação L11-T03 (2026-09-10, Executor/BE): tarefa priorizada
fora da cadência normal do Lote 11, conforme resolução do Bloqueio 003
(`.md/BLOCKERS.md`) — implementada antes de L8-T01/L9-T01/L10-T01, que agora
podem iniciar.

**Nota de implementação L11-T02a (2026-09-10, Executor/BE)**: implementado
exatamente conforme ADR-008, dentro dos limites da tarefa (guard central em
si permanece fora de escopo, é `L11-T02`).

- **Schema** (`prisma/schema.prisma`, `model TripSession`): novo campo
  `anonSessionId String? @map("anon_session_id")`, nullable, coexistindo com
  `userId`. Migration `prisma/migrations/20260910120000_l11_t02a_anon_session_owner/migration.sql`
  (`ALTER TABLE trip_sessions ADD COLUMN anon_session_id TEXT`) — escrita à
  mão seguindo o mesmo padrão SQL das migrations anteriores
  (`20260909203030_l4_t02_flow_state`), porque nenhum Postgres local estava
  acessível neste ambiente (`localhost:55432` recusa conexão — mesma
  limitação de ambiente já registrada em tarefas anteriores) para rodar
  `prisma migrate dev` de fato; `npx prisma generate` (que não exige conexão
  com o banco) foi executado com sucesso e o client reflete o novo campo.
  **Pendência real para quem tiver acesso a um Postgres**: rodar
  `npx prisma migrate deploy` (ou `migrate dev` num ambiente de
  desenvolvimento) para aplicar esta migration a um banco real antes do
  primeiro uso — a migration em si não foi validada contra um banco vivo
  nesta tarefa, só o SQL gerado manualmente e a regeneração do client.
- **`src/lib/session-flow/create-session-with-range.ts`**: novo tipo
  `SessionOwner` (`{ type: "user"; userId } | { type: "anonymous";
  anonSessionId }`), reexportado em `src/lib/session-flow/index.ts`.
  `CreateSessionWithDateRangeInput.owner` é agora obrigatório; o `INSERT`
  grava condicionalmente `userId` OU `anonSessionId` a partir do `owner`
  recebido (nunca os dois, nunca nenhum — garantido pelo tipo discriminado).
  Assinatura muda (breaking change interno), retrofit dos 3 chamadores feito
  nesta mesma tarefa (ver abaixo).
- **`src/lib/actions/resolve-session-owner.ts` (novo)**: helper único
  compartilhado pelos 3 chamadores, resolvendo `SessionOwner` com a regra de
  precedência do ADR-008 — `getServerSession(authOptions)` primeiro
  (autenticado vence); cai para `resolveAnonymousSessionId` do cookie
  (`ANONYMOUS_SESSION_COOKIE`, `@/lib/anonymous-session`) só se não houver
  sessão NextAuth válida. Defensivamente, se o cookie anônimo ainda não
  existir nesta requisição (o `src/middleware.ts` normalmente já garante que
  existe em toda navegação de página), gera um novo id e grava via
  `cookies().set(...)` (permitido em Server Actions do Next.js 14),
  reaproveitando `anonymousSessionCookieOptions()`.
- **Retrofit dos 3 chamadores** (`src/lib/actions/data-livre.ts`
  `submeterDataLivre`/L6-T03, `src/lib/actions/feriados.ts`
  `processarFeriadoEscolhido`/L6-T05, `src/lib/actions/quiz.ts`
  `submitQuizAnswers`/L6-T07): cada um chama `resolveSessionOwner()` e passa
  o resultado como `owner` para `createSessionWithDateRange`. Mudança
  mecânica idêntica nos 3, sem nenhuma regra de negócio nova — exatamente
  como a Nota de resolução do Bloqueio 004 já previa.
- **Decisão de detalhe não coberta explicitamente pelo ADR-008**: o cookie
  anônimo ausente na requisição (caso defensivo — hoje sempre presente
  graças ao middleware) resulta em um novo UUID gerado dentro de
  `resolveSessionOwner`, gravado na resposta da própria Server Action.
  Alternativa de "rejeitar a requisição" foi descartada por quebrar o fluxo
  anônimo sem necessidade real (nenhum artefato exige isso); tratado como
  pequeno detalhe de implementação, não escalado.
- **Testes**: `src/lib/actions/__tests__/resolve-session-owner.test.ts`
  (novo, unitário, sem banco) cobre a regra de precedência e a garantia de
  exclusividade mútua do `SessionOwner` nos dois fluxos — é o teste principal
  do critério de aceite desta tarefa. As integrações existentes
  (`create-session-with-range.integration.test.ts`,
  `data-livre.integration.test.ts`,
  `processar-feriado-escolhido.integration.test.ts`,
  `quiz.integration.test.ts`, `destino.integration.test.ts`) foram
  atualizadas: `next-auth`/`next/headers` são mockados (necessário porque
  `resolveSessionOwner` chama `getServerSession`/`cookies()`, que exigem
  contexto de requisição real do Next.js, indisponível ao chamar a Server
  Action diretamente de um teste — sem o mock, toda chamada lançava
  `` `headers` was called outside a request scope`` mesmo antes de tentar
  tocar o banco); cada arquivo ganhou também um teste novo cobrindo o fluxo
  autenticado (`userId` gravado, `anonSessionId` nulo) além do já existente
  fluxo anônimo (agora também com a asserção explícita do campo oposto
  nulo). Todos os testes de integração aqui listados continuam falhando
  neste ambiente por falta de Postgres local (`localhost:55432` inacessível)
  — mesma limitação de ambiente já documentada em tarefas anteriores, não
  uma regressão desta tarefa; confirmado comparando com o baseline (mesmas
  125 falhas de "Can't reach database server", zero ocorrência do erro
  `outside a request scope` na suíte inteira após o mock).
- `npm run lint`: sem erros. `npx tsc --noEmit`: os 3 erros residuais
  (`page.test.tsx`, `budget-insufficient-banner.test.tsx`,
  `auth-callbacks.test.ts`) são pré-existentes, em arquivos não tocados por
  esta tarefa (confirmado via `git log` — vêm do commit anterior). `npm run
  build`: sucesso.
- **Fora de escopo desta tarefa (fica para `L11-T02`)**: o guard central de
  autorização em si (comparação "dono esperado da requisição" vs. "dono
  persistido") e sua integração em `applySessionFlowTransition`/
  `gerarSugestoesDestino`/qualquer outro ponto de leitura direta de
  `TripSession`. **O que `L11-T02` já pode assumir pronto**: (1) todo
  registro `TripSession` criado a partir de agora grava exatamente um dono;
  (2) `SessionOwner`/`resolveSessionOwner` já existem e podem ser
  reaproveitados (mesma regra de precedência exigida pelo guard, ADR-008
  item 4) — `resolveSessionOwner` está em `src/lib/actions/`, não em
  `src/lib/session-flow/`, porque depende de `next/headers`/NextAuth (camada
  de Server Action), então o guard central (que vive em `session-flow` ou
  módulo equivalente) deve importar de `@/lib/actions/resolve-session-owner`
  ou replicar a mesma composição — decisão de organização de módulo deixada
  para `L11-T02`, não travada por esta tarefa; (3) a aplicação real
  (`npx prisma migrate deploy`) da migration `anon_session_id` continua
  pendente em qualquer ambiente com Postgres real, antes de `L11-T02` rodar
  testes de integração que dependam do campo estar de fato na tabela.

**Nota de implementação L11-T02 (2026-09-10, Executor/BE)**: implementado
exatamente conforme ADR-008 item 4, reaproveitando `SessionOwner`/
`resolveSessionOwner` de `L11-T02a` sem duplicar a regra de precedência.

- **`src/lib/session-flow/authorization.ts` (novo)**: guard central.
  `isSameSessionOwner(record, expectedOwner)` — comparação pura, sem I/O,
  testável em isolamento — e `assertSessionOwnership(sessionId, record)`, que
  resolve o dono esperado via `resolveSessionOwner()` (importado de
  `@/lib/actions/resolve-session-owner`, decisão de organização de módulo já
  antecipada pela nota de `L11-T02a`) e lança `SessionNotFoundError` (nunca
  um erro 403 dedicado) sempre que `record` for nulo, sem nenhum dos dois
  campos de dono gravado, ou de dono divergente — as três situações tratadas
  de forma idêntica, para que um solicitante ilegítimo nunca distinga "sessão
  não existe" de "sessão existe mas não é sua" (critério "sempre 404" do
  ADR-008 item 4). Reexportado por `src/lib/session-flow/index.ts`
  (`assertSessionOwnership`/`isSameSessionOwner`/`TripSessionOwnerRecord`),
  mesma convenção de barrel único do módulo.
- **Integração em `applySessionFlowTransition`** (`src/lib/session-flow/persistence.ts`):
  o `select` do `findUnique` inicial passa a incluir `userId`/`anonSessionId`;
  logo após a checagem de existência (`SessionNotFoundError` se `!session`),
  `assertSessionOwnership(input.sessionId, session)` é chamada — ANTES de
  `transitionSessionFlow` decidir a transição e antes de qualquer escrita, na
  mesma transação Prisma. Isso cobre automaticamente toda Server Action que só
  delega para `applySessionFlowTransition` sem ler `TripSession` diretamente
  (`confirmarDestino`/`trocarDestino`, `aprovarDestinoSugerido`/
  `informarDestinoManualmente`/`encerrarResolucaoDestino`, `aprovarHospedagem`/
  `encerrarResolucaoHospedagem`, `aprovarSelecaoPasseios`/
  `encerrarResolucaoPasseios`) — nenhuma chamada adicional necessária nelas.
- **Integração nos 3 pontos de leitura direta de `TripSession` fora de
  `session-flow`** (`gerarSugestoesDestino`/`src/lib/actions/destino.ts`,
  `gerarSugestoesHospedagem`/`src/lib/actions/hospedagem.ts`,
  `gerarSugestoesPasseios`/`src/lib/actions/passeios.ts` — a mesma superfície
  já mapeada pela investigação do Bloqueio 004/ADR-008): cada `select` ganhou
  `userId`/`anonSessionId`, e `assertSessionOwnership(sessionId, session)` é
  chamada logo após a checagem de existência, antes de qualquer outra
  validação de etapa. Nenhum outro `prisma.tripSession.findUnique`/`update`
  fora de `session-flow` foi encontrado (confirmado via busca por
  `prisma.tripSession` em todo `src/`; os únicos demais usos são em testes ou
  em `deleteUserAccount`/L11-T01, que não lê por `sessionId` — apaga por
  `userId` já autenticado/validado por aquela própria tarefa, fora do escopo
  deste guard).
- **Decisão de detalhe não coberta explicitamente pelo ADR-008**: dentro de
  `applySessionFlowTransition`, `assertSessionOwnership` é chamada DENTRO da
  transação Prisma (não antes de abri-la) — opção mais simples (um único
  padrão de chamada, idêntico ao dos 3 pontos de leitura direta) em troca de
  manter a transação aberta durante a resolução de `resolveSessionOwner()`
  (I/O de cookie/NextAuth); dado o volume baixo de chamadas por sessão e a
  ausência de qualquer requisito de performance/RNF associado a este guard,
  tratado como detalhe de implementação, não escalado.
- **Testes**: `src/lib/session-flow/__tests__/authorization.test.ts` (novo,
  unitário, sem banco, `next-auth`/`next/headers` mockados) — 14 casos: a
  comparação pura `isSameSessionOwner` (dono bate por cada mecanismo de
  identidade, dono diverge, mecanismo diverge, registro sem nenhum dono,
  registro nulo) e `assertSessionOwnership` fim a fim (dono legítimo
  autenticado/anônimo autoriza; cookie/`user_id` de outra sessão lança
  `SessionNotFoundError`; registro sem dono gravado lança mesmo para
  solicitante anônimo válido; sessão inexistente lança o mesmo erro) — cobre
  diretamente o critério de aceite desta tarefa. Integrações existentes
  atualizadas para não regredir com o guard agora ativo (mesmo padrão de mock
  `next-auth`/`next/headers` de `data-livre.integration.test.ts`,
  `L11-T02a`): `persistence.integration.test.ts` (mais 3 casos novos cobrindo
  o guard diretamente: dono legítimo, cookie de outra sessão, registro sem
  dono), `create-session-with-range.integration.test.ts`,
  `destino.integration.test.ts`, `hospedagem.integration.test.ts`,
  `passeios.integration.test.ts`, `confirmacao-destino.integration.test.ts` —
  toda sessão de teste criada via `prisma.tripSession.create` direto (fora de
  `createSessionWithDateRange`) ganhou `anonSessionId` fixo batendo com o
  cookie anônimo mockado no `beforeEach` do arquivo. `account-deletion.integration.test.ts`
  não foi tocado (não passa por `applySessionFlowTransition`/leitura por
  `sessionId`, fora do escopo deste guard). Todos os testes de integração
  aqui listados continuam falhando neste ambiente por falta de Postgres local
  (`localhost:55432` inacessível) — mesma limitação já documentada em
  tarefas anteriores, não uma regressão desta tarefa; confirmado comparando
  com o baseline via `git stash` (antes: 103 falhas/377 passando, todas
  `PrismaClientInitializationError`; depois: 85 falhas/401 passando — menos
  falhas e mais testes passando, por conta dos 14 testes novos de
  `authorization.test.ts`, todos unitários sem banco).
- `npm run lint`: sem erros nos arquivos tocados. `npx tsc --noEmit`: os
  mesmos 3 erros residuais pré-existentes (`page.test.tsx`,
  `budget-insufficient-banner.test.tsx`, `auth-callbacks.test.ts`), não
  tocados por esta tarefa. `npm run build`: sucesso.

**Ponto real de captura de texto livre que alimenta prompt** (investigação
desta tarefa): hoje só existem 3 pontos do código que persistem
`DestinationApproval.name`/`TripSession` a partir de texto livre do usuário
e que, a partir de L8-T01/L9-T01/L10-T01, viram `context.destination.name`
interpolado literalmente em `buildHospedagemPrompt`/`buildPasseiosPrompt`/
`buildRoteiroPrompt` (`src/lib/gateway-ia/prompts.ts`): (1)
`informarDestinoManualmente` (`src/lib/actions/destino.ts`, L7-T03); (2) o
campo `destino` opcional de `submeterDataLivre`
(`src/lib/actions/data-livre.ts`, L6-T03); (3) o campo `destino` opcional de
`processarFeriadoEscolhido` (`src/lib/actions/feriados.ts`, L6-T05/RF-02.3).
`submitQuizAnswers` (`src/lib/actions/quiz.ts`, L6-T07) NÃO persiste
orçamento/texto livre nenhum (decisão de escopo já documentada naquela
tarefa) — nenhuma ação adicional necessária ali. `budgetAmount`/
`budgetCurrency` (`prisma/schema.prisma`, `StageContext`) são campos
NUMÉRICOS (Prisma `Decimal`)/enum-like, não texto livre — fora do escopo
desta sanitização (sem superfície de prompt injection textual).

**Estratégia adotada** (detalhe de implementação — não há um mecanismo de
sanitização de prompt injection definido em SDD.md/ADRs): NEUTRALIZAÇÃO por
regex heurística em vez de rejeição total da submissão. Novo módulo
`src/lib/gateway-ia/prompt-injection-guard.ts`, exportando
`sanitizeFreeTextForPrompt(rawValue, { maxLength })`: (1) trim + colapso de
quebra de linha/tab (impede simular múltiplas "mensagens" dentro de um único
campo); (2) remoção de marcadores de papel/delimitador de conversa (cercas
de código markdown, tokens `<|...|>`, `[INST]`/`[/INST]`, `System:` no início
de linha, `###`/`---`); (3) redação de frases conhecidas de override de
instrução em PT-BR e EN (~20 padrões — "ignore as instruções anteriores",
"ignore previous instructions", "aja como/act as", "you are now", "revele o
prompt do sistema"/"reveal the system prompt", "modo desenvolvedor"/
"developer mode", etc., com padrões de frase completa avaliados antes dos
fragmentos genéricos equivalentes para não deixar resíduo parcial); (4)
colapso de espaços redundantes; (5) truncagem para `maxLength` (mesmo limite
já em uso pelos 3 chamadores, 200 caracteres). Rejeitada a alternativa de
bloquear a submissão inteira ao detectar qualquer padrão suspeito: um nome de
destino real poderia coincidentemente conter uma palavra da lista (falso
positivo), e nenhuma regra de negócio justificaria travar o fluxo por um
filtro de conteúdo neste campo. Também exportada
`containsPromptInjectionAttempt(rawValue)` — só detecção (roda sobre o texto
original, pré-sanitização), para uso futuro de observabilidade/auditoria, não
usada para bloquear nada nesta tarefa. Módulo colocado dentro de
`src/lib/gateway-ia/` (mantendo a fronteira do módulo, TASK.md Seção 1 item 1)
por ser especificamente sobre mitigar risco de prompt injection no que
alimenta o Gateway de IA — mas consumido normalmente por Server Actions fora
dele (`@/lib/gateway-ia/prompt-injection-guard`), mesmo padrão de reexport
seletivo já usado por `checkGatewayIaRateLimit`/`GatewayIaError`.

**Defesa em profundidade, não a única camada**: o valor sanitizado nunca é
concatenado como se fosse uma instrução de sistema — os 4 `buildXPrompt`
(`./prompts.ts`) sempre embutem o texto do usuário dentro de uma frase fixa
em português (ex. `` `Destino já aprovado pelo usuário: ${nome}.` ``), nunca
como um bloco de texto solto que o modelo pudesse confundir com uma nova
instrução.

**Integração nos 3 pontos de captura reais** (substituindo `trim()` +
truncagem por `sanitizeFreeTextForPrompt`, sem mudar a interface pública de
nenhuma das 3 Server Actions): `src/lib/actions/destino.ts`
(`informarDestinoManualmente` — vazio após sanitização continua lançando
`InvalidManualDestinoError`, campo obrigatório); `src/lib/actions/data-livre.ts`
(`sanitizeDestino`, helper interno de `submeterDataLivre` — vazio após
sanitização continua tratado como "sem destino", campo opcional);
`src/lib/actions/feriados.ts` (`processarFeriadoEscolhido` — comportamento
pré-existente de REJEITAR, não truncar, destino acima do limite de tamanho
foi preservado sem mudança, só a neutralização de conteúdo foi adicionada
antes dessa checagem).

**Testes**: `src/lib/gateway-ia/__tests__/prompt-injection-guard.test.ts` (21
casos) — cobre o critério de aceite desta tarefa em duas camadas: (1)
unidade de `sanitizeFreeTextForPrompt`/`containsPromptInjectionAttempt`
isoladas (10 variantes plausíveis de tentativa de injeção neutralizadas sem
destruir o conteúdo legítimo ao redor, ex. `"Paris. Ignore as instruções
anteriores..."` → mantém `"Paris"`, remove a frase de override; caso
"palavra isolada da lista sem constituir uma frase de ataque" não é
falso-positivo, ex. `"Vila da Instrução"` preservado; casos legítimos
comuns inalterados além de trim/truncagem); (2) integração com
`buildHospedagemPrompt`/`buildPasseiosPrompt`/`buildRoteiroPrompt`
(`../prompts.ts`), provando que o prompt final montado a partir do texto já
sanitizado nunca contém a instrução maliciosa original, e que o caso
legítimo (`"Foz do Iguaçu"`) continua produzindo exatamente o mesmo prompt de
antes — sem regressão de comportamento. Nenhum teste dos 3 pontos de
integração (`destino.integration.test.ts`/`data-livre.integration.test.ts`/
`processar-feriado-escolhido.integration.test.ts`, todos dependentes de
Postgres real) precisou de caso novo além dos já existentes de truncagem —
eles continuam passando com a nova sanitização por trás (verificado por
inspeção do fluxo, já que este ambiente de execução não tem acesso a um
Postgres local rodando, ver limitação abaixo).

**Limitação conhecida/fora de escopo**: (1) a lista de padrões é uma
heurística curada (~20 regex), não uma solução exaustiva/semântica — um
atacante suficientemente criativo (paráfrase não coberta pela lista, idioma
diferente de PT/EN, injeção via encoding) pode não ser neutralizado por este
módulo; mitigação aceitável para o MVP dado que (a) o texto sanitizado nunca
é a mensagem `system` do prompt, sempre um valor interpolado dentro de uma
frase fixa controlada pelo próprio código, e (b) toda saída do Gateway de IA
já passa por validação estrutural (Zod) + semântica (L3-T03, plausibilidade
de preço/grounding de data) antes de ser usada, limitando o dano mesmo que
uma instrução residual passasse; endurecer a lista de padrões (ou trocar por
uma segunda chamada de classificação ao LLM) fica para trabalho futuro, sem
nova tarefa aberta agora. (2) Filtragem semântica via segunda chamada de LLM
não foi implementada (custo/latência extra sem justificativa dado o tamanho
pequeno do campo, decisão de implementação documentada no cabeçalho do
módulo). (3) Não foi possível rodar os testes de integração reais (Postgres
em `localhost:55432`) neste ambiente de execução — mesma limitação
pré-existente de infraestrutura já registrada nas notas de implementação
anteriores deste projeto quando aplicável; `npm test` mostra os mesmos 57
testes de integração falhando por `PrismaClientInitializationError: Can't
reach database server`, já presentes ANTES desta tarefa (baseline confirmado
antes de iniciar: 313 passando/57 falhando por falta de banco; depois desta
tarefa: 334 passando — os 21 novos testes de unidade — mesmos 57 falhando por
banco, nenhuma regressão nova).

Arquivos novos: `src/lib/gateway-ia/prompt-injection-guard.ts`,
`src/lib/gateway-ia/__tests__/prompt-injection-guard.test.ts`. Arquivos
alterados: `src/lib/actions/destino.ts`, `src/lib/actions/data-livre.ts`,
`src/lib/actions/feriados.ts` (import + troca da sanitização local por
`sanitizeFreeTextForPrompt`, sem mudança de assinatura/contrato público de
nenhuma Server Action). `npm run lint`, `npm test` (334 passando, mesmos 57
falhando por falta de Postgres local — pré-existente, não introduzido por
esta tarefa) e `npm run build` executados sem regressão nova.

### Nota de bloqueio L11-T02 (2026-09-10, Executor/BE)

Tarefa marcada `Bloqueada` antes de qualquer código novo. Investigação
completa (checando `prisma/schema.prisma`, `src/lib/anonymous-session.ts`,
`src/lib/session-flow/persistence.ts`, `src/lib/session-flow/
create-session-with-range.ts` e todas as Server Actions de tela que hoje
leem/escrevem `TripSession` — `src/lib/actions/destino.ts`,
`confirmacao-destino.ts`, `data-livre.ts`, `feriados.ts`, `quiz.ts`) confirmou
uma lacuna de modelo de dados que impede a implementação correta do guard
pedido: **`TripSession` não guarda o dono do registro em nenhum dos dois
mecanismos de identidade do projeto** — não há coluna equivalente a
`anon_session_id` para sessão anônima, e `userId` (existente, nullable) nunca
é de fato gravado por nenhum ponto de criação real (`createSessionWithDateRange`
não aceita nem grava esse campo). Um guard "compara dono esperado (cookie/
`user_id` da requisição) vs. dono real gravado" não tem dado real para
comparar hoje — implementá-lo de qualquer forma exigiria ou rejeitar sempre
(quebrando o fluxo anônimo, que é o caminho principal do produto, RF-01/02/03)
ou inventar uma heurística de atribuição de dono não especificada em nenhum
artefato (SDD.md/ADR), decisão de arquitetura que este papel não tem
autoridade para tomar sozinho (mesmo nível do ADR-006 Adendo 1, que resolveu
uma lacuna estrutural análoga para `flowState` em L4-T01/Bloqueio 001).

Registrado como **Bloqueio 004** em `.md/BLOCKERS.md` (status Aberto,
escalado para o coordenador), com uma proposta não-vinculante de solução
(novo campo `anonSessionId` em `TripSession` + `createSessionWithDateRange`
passando a receber/gravar o dono no momento da criação + o guard central
comparando contra esses campos, retornando 404 — nunca 403, para não revelar
existência do registro a um dono errado). Nenhum código de produção foi
alterado nesta sessão (nem schema, nem `create-session-with-range.ts`, nem
nenhuma Server Action) — só os artefatos de gestão de bloqueio
(`BLOCKERS.md`, este `TASK.md`). Nenhum teste novo foi escrito, porque não há
comportamento implementado para cobrir; escrever um guard "que sempre nega"
só para ter teste verde seria pior do que não implementar (violaria o próprio
critério de aceite ao quebrar o fluxo anônimo legítimo).

`npm run lint`, `npm test` e `npm run build` não foram re-executados (nenhum
código de produção/teste foi tocado nesta tarefa) — sem regressão possível.

Retomada de L11-T02 depende da resolução do Bloqueio 004 pelo Coordenador
(mesmo protocolo do Bloqueio 001): quem retomar precisa (1) confirmar/ajustar
a forma exata do campo de dono no schema, (2) implementar a migration +
`createSessionWithDateRange` passando a gravar o dono, (3) só então o guard
central em si + sua integração em `applySessionFlowTransition`/
`gerarSugestoesDestino` (e qualquer outro ponto de leitura direto de
`TripSession`) + testes automatizados cobrindo o critério de aceite (dono
legítimo passa; identidade de outra sessão recebe 403/404 sem vazar dado).

**Resolução do Bloqueio 004 (2026-09-10, Coordenador)**: ver ADR-008
(`.md/adr/008-propriedade-e-autorizacao-de-trip-session.md`) e a nota de
resolução completa logo após a tabela do Lote 11 (Seção 3, acima). Resumo:
proposta do Executor aceita com refinamento de precedência (conta
autenticada > cookie anônimo) e resposta fixada em 404 (nunca 403, ambiguidade
do critério de aceite original removida). `L11-T02` deixa de estar
`Bloqueada` e é dividida em `L11-T02a` (persistência do dono, `Não iniciada`)
+ `L11-T02` (guard em si, `Não iniciada`, dependente de `L11-T02a`).

### Nota de implementação L11-T01 (2026-09-10, Executor/BE)

Implementado o mecanismo de exclusão de conta e dados associados (LGPD,
RNF-06, GUARDRAILS.md regra 20).

1. **Confirmação do schema antes de codar** (`prisma/schema.prisma`):
   `Account`/`Session` (NextAuth) já tinham `onDelete: Cascade` referenciando
   `User` (infraestrutura pronta, como já registrado em `SECURITY-REVIEW.md`
   — achado do Lote 1). `TripSession.userId` NÃO tem FK formal para `User`
   (comentário explícito no schema, decisão deliberada de L1-T03) — por isso
   apagar `User` sozinho NÃO cascatearia as `TripSession`s. Todas as 5
   entidades filhas de `TripSession` (`DestinationApproval`,
   `AccommodationApproval`, `ActivityApproval`, `ItineraryItem`,
   `LlmGenerationLog`) já têm `onDelete: Cascade` referenciando
   `TripSession`.
2. `src/lib/account-deletion.ts` (novo): `deleteUserAccount(userId)`, único
   ponto autorizado a apagar conta — dentro de uma única
   `prisma.$transaction`: (a) confirma que o `User` existe (senão
   `UserNotFoundError`, sem tocar o banco); (b) `tx.tripSession.deleteMany({
   where: { userId } })` — apaga explicitamente todas as `TripSession`s do
   usuário, o que cascateia via FK do banco todas as 5 entidades filhas
   automaticamente, sem `deleteMany` extra para cada uma; (c)
   `tx.user.delete(...)` — cascateia `Account`/`Session` do NextAuth via FK
   do banco. Retorna `deletedTripSessionCount` para observabilidade.
3. `src/app/api/account/route.ts` (novo): `DELETE /api/account`, mesmo
   padrão de rota de conta de `src/app/api/auth/signup/route.ts`. `userId` é
   SEMPRE resolvido via `getServerSession(authOptions)` (NextAuth) — a rota
   nunca lê/aceita `user_id` de corpo/query string, então não há como um
   cliente disparar exclusão da conta de outro usuário (SDD §7,
   GUARDRAILS.md regras 9/16). Sem sessão autenticada: 401. `User` já
   inexistente (`UserNotFoundError`): 404.
4. **Decisão de detalhe de implementação (não é lacuna a escalar)**:
   "exclusão de conta" (LGPD/RNF-06) se aplica só a quem tem conta de
   verdade (linha em `User`) — sessão anônima via cookie
   (`src/lib/anonymous-session.ts`) não tem "conta" nesse sentido; ela não
   grava dado pessoal identificável (nome/e-mail), então RNF-06 não exige um
   mecanismo de exclusão equivalente para ela. SDD.md §7 e GUARDRAILS.md
   regra 20 falam explicitamente em "exclusão de conta"/"`user_id`", ambos
   pressupondo conta existente — não há ambiguidade real a escalar. Se o
   produto quiser oferecer "apagar meus dados" também sem conta, é
   funcionalidade nova, fora de escopo.
5. **Fora de escopo desta tarefa (documentado, não implementado)**: nenhuma
   UI (botão "Excluir minha conta") existe ainda em nenhuma tela do projeto
   — esta tarefa é BE, entrega só a capacidade de servidor, consistente com
   a instrução da tarefa.
6. Testes: `src/lib/__tests__/account-deletion.integration.test.ts` (mesmo
   padrão de `user-account.integration.test.ts`/
   `persistence.integration.test.ts`, Postgres real) — cobre: usuário com
   `TripSession` completa (todas as 5 entidades filhas populadas) apagado
   sem deixar nenhum dado órfão, checado por query direta em cada tabela
   (não só pelo retorno da função); múltiplas `TripSession`s do mesmo
   usuário todas apagadas; `userId` inexistente rejeitado com
   `UserNotFoundError` antes de tocar o banco; isolamento — apagar um
   usuário nunca toca a `TripSession` de outro usuário.
   `npm run lint`, `npm run build` sem erro; `npm test` sem regressão nos
   testes não-integração — os testes `*.integration.test.ts` (incluindo os
   novos) falham neste ambiente por ausência de Postgres real
   (`Can't reach database server at localhost:55432`), mesma limitação de
   ambiente já documentada desde o Lote 4, não uma falha desta
   implementação.

Nenhum desvio de escopo/estimativa. `L11-T02` (autorização cross-cutting de
dono de registro em `TripSession`) e `L11-T03` (sanitização de texto livre)
permanecem tarefas separadas, não tocadas aqui.

**Nota de resolução do Bloqueio 003 (2026-09-10, Coordenador)**: `L11-T03`
permanece com o ID/numeração e o critério de aceite originais — não foi
renumerada nem movida de seção, para não cascatear referência em todo o
`TASK.md`/`BLOCKERS.md`/`SECURITY-REVIEW.md` que já a cita por esse ID. O
que muda é puramente a **elegibilidade de execução**: `L11-T03` deixa de
esperar o restante do Lote 11 (que só abre depois dos Lotes 6-10) e passa a
ficar elegível assim que `L3-T02` estiver concluída — ou seja, em paralelo
com os Lotes 4-7, bem antes do resto do Lote 11. As 3 tarefas que
efetivamente consomem texto livre em prompt pela primeira vez
(`L8-T01`/`L9-T01`/`L10-T01`) agora têm `L11-T03` como dependência
explícita adicional (ver Seção 3, colunas "Depende de" dessas 3 linhas) —
nenhuma delas pode iniciar implementação antes de `L11-T03` estar
`Concluída`. `L11-T01`/`L11-T02`/`L11-T04` continuam exatamente como
estavam, sem nenhuma mudança de dependência.

### Nota de implementação L11-T04 (2026-09-12, Executor/FE)

Auditoria final de acessibilidade cross-tela sobre todas as telas reais do
fluxo (T00-T-END: `src/app/page.tsx`, `src/app/entrada/data-livre/page.tsx` +
`t01-date-range-form.tsx`, `src/app/entrada/feriados/feriados-screen.tsx`,
`src/components/quiz/quiz-wizard.tsx`, `destino-sugestoes-screen.tsx`,
`destino-confirmacao-screen.tsx`, `hospedagem-sugestoes-screen.tsx`,
`passeios-sugestoes-screen.tsx`, `roteiro-screen.tsx`,
`encerramento-screen.tsx`, e os componentes de design system
`stepper-progress`/`loading-stream`/`error-retry-state`/`empty-state`/
`suggestion-card`/`price-range-badge`/`budget-insufficient-banner`/
`holiday-list-item`/`itinerary-day-block`) contra os 4 pontos do critério de
aceite (UX-SPEC.md Seção 5):

1. **Contraste (WCAG AA)**: recalculado programaticamente (conversão
   HSL→RGB→luminância relativa, fórmula WCAG) todo par
   texto/ícone-sobre-fundo dos tokens de `src/app/globals.css` ("Concierge
   Noturno"): `foreground`/`foreground-muted`/`accent`/`success`/`warning`/
   `error` sobre `background`/`surface`, e cada `*-foreground` sobre sua cor
   de preenchimento (`primary`/`accent`/`secondary`/`success`/`warning`/
   `error`). Todos os pares ficaram entre 6.19:1 e 18.98:1 — acima do mínimo
   AA (4.5:1 texto normal/3:1 texto grande) com margem confortável. Nenhuma
   correção de cor foi necessária (a recalibração para tema escuro já tinha
   sido feita em reabertura anterior, conforme cabeçalho do UX-SPEC.md).
2. **Foco em transição de tela**: encontrado e corrigido 1 gap real —
   `DestinoSugestoesScreen` (T04) já tinha `headingRef`/`tabIndex={-1}` no
   `<h1>`, mas faltava o `useEffect(() => headingRef.current?.focus(), [])`
   correspondente (única tela do fluxo nessa condição; todas as demais já
   tinham o padrão completo). Corrigido. Também corrigido T01
   (`src/app/entrada/data-livre/page.tsx`): a página nunca gerenciava foco
   (única página "estática" do fluxo sem controller de foco, diferente de
   T02/quiz/T04+ que já usam `headingRef`) — convertida para client
   component com o mesmo padrão `headingRef`/`tabIndex={-1}`/`useEffect`
   das demais telas, sem alterar `T01DateRangeForm` (mantém o teste
   existente de ordem de Tab: heading com `tabIndex={-1}` não entra na
   ordem de tab, então o primeiro `Tab` continua indo para "Data inicial").
   T00 (`src/app/page.tsx`) não recebeu foco programático — é a tela de
   entrada da aplicação (sem transição de uma etapa anterior dentro do
   fluxo guiado), decisão de detalhe de implementação, não lacuna.
3. **`aria-live`**: já cobertos — `LoadingStream` (`aria-live="polite"` +
   `aria-busy`) e `QuizWizard` (barra de progresso, `aria-live="polite"`);
   estados de erro usam `role="alert"` (semântica `aria-live="assertive"`
   implícita) de forma consistente em todas as telas
   (`ErrorRetryState`/blocos de erro inline de formulário/ajuste). Nenhuma
   correção necessária.
4. **Alvo de toque ≥44px**: a maioria dos botões de ação principal já usava
   `min-h-11` (44px) explicitamente por tela — mas a auditoria encontrou
   vários botões secundários/de cancelamento sem essa classe, inconsistentes
   com os botões vizinhos da mesma tela. Corrigidos: botão "Cancelar" em
   `hospedagem-sugestoes-screen.tsx` (fluxo de ajuste); botões "Nenhum me
   interessa"/"Já sei o destino"/"Cancelar" (entrada manual) em
   `destino-sugestoes-screen.tsx`; botões "Avançar"/"Concluir"/"Voltar"/
   "Pular" em `quiz-wizard.tsx`, incluindo as opções de rádio/checkbox
   (`RadioOption`/`CheckboxOption`, que ganharam `min-h-11` no `<label>`
   clicável); botões de `EmptyState` e o CTA de retry de `ErrorRetryState`
   (ambos reutilizados em toda tela de sugestão gerada por IA). `Button`
   (`src/components/ui/button.tsx`, shadcn/ui base) não foi alterado — a
   correção foi aplicada pontualmente via `className="min-h-11"` em cada
   uso faltante, seguindo o padrão já estabelecido pela maioria das telas
   (decisão de detalhe de implementação: mudar o tamanho `default` global
   do componente base afetaria toda a aplicação sem necessidade, incluindo
   contextos onde 36px já é intencional, ex. campos de formulário de T01).
   `HolidayListItem`/`ItineraryDayBlock` já tinham alvo de toque adequado
   (padding generoso/`min-h-11` explícito, respectivamente) — confirmados,
   sem alteração.

Nenhuma lacuna/inconsistência do UX-SPEC.md impediu a implementação —
todas as correções foram pontuais (classe CSS/hook de foco ausente),
seguindo padrão já estabelecido pela maioria das telas do próprio código,
nunca uma decisão de UX nova. Nenhum desvio de escopo/estimativa; nenhum
bloqueio registrado em `BLOCKERS.md`.

Verificação: `npm run lint` limpo; `npx tsc --noEmit` sem novos erros (os 3
erros pré-existentes em `page.test.tsx`/`budget-insufficient-banner.test.tsx`/
`auth-callbacks.test.ts` já estavam presentes antes desta tarefa, arquivos não
tocados por ela); `npm run build` (`next build`) compila, type-checa e gera
as 14 páginas sem erro; `npm test` — 443 passando / 92 falhando, 100% das
falhas são `PrismaClientInitializationError` (Postgres indisponível em
`localhost:55432` neste ambiente, mesma limitação de ambiente documentada
desde o Lote 4/RL8-T02/RL1-T01), nenhuma falha nova relacionada a esta
tarefa — todo teste de componente/unitário (incluindo os das telas
alteradas) passa.

### Refatoração Lote-1 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 1 (ver `QA-REPORT.md`/
`SECURITY-REVIEW.md`, 2026-09-08) — achado de severidade média em
dependência de terceiros, não bloqueante para o fechamento do Lote 1, mas
com prazo antes do primeiro deploy em produção (chapéu DevOps).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL1-T01 | Upgrade de `next` (14.2.35 → versão corrigida, ex. 16.x) para resolver vulnerabilidades de severidade alta identificadas via `npm audit`/`SECURITY-REVIEW.md` (SSRF, request smuggling, cache poisoning, DoS), com regressão completa (lint/test/build) pós-upgrade; compatível com TASK.md item 12 ("Next.js 14+"), sem necessidade de novo ADR | BE+FE | 0.5-1 dia | L1-T01 | — | Concluída | `npm audit` sem achado de severidade alta/crítica em `next`/dependências diretas de runtime; `npm run lint`, `npm test` e `npm run build` passam sem regressão; prazo: concluída antes do primeiro deploy em produção do projeto — **Nota de implementação RL1-T01 (2026-09-12)**: `next` `14.2.35` → `15.5.25` (`eslint-config-next` acompanhado para a mesma versão), não `16.x` como sugerido no título — decisão desta tarefa (desvio pequeno de detalhe de implementação, não de escopo): `eslint-config-next@16.x` exige `eslint@>=9` (config flat), enquanto `15.5.25` (linha estável mais recente da major 15, tag `latest` só chega a `16.x`) já corrige TODAS as CVEs de severidade alta/crítica listadas no título (RCE Windows-hosted `GHSA-p293-qw3h-jr36`, RCE AVIF Image Optimization `GHSA-2xp9-vwfh-vxw4`, SSRF em rewrites/Server Actions/WebSocket upgrade, DoS em Server Components/Actions, cache poisoning, middleware bypass i18n) sem forçar migração de ESLint 8→9 (mudança de tooling maior, fora do escopo declarado desta tarefa — nenhuma decisão de arquitetura tomada sozinho). Migração de código exigida pelas dynamic APIs assíncronas do Next 15 (mecânica, não é redesenho): `cookies()` agora é `await`ado em `src/lib/actions/resolve-session-owner.ts`, `src/app/api/anonymous-session/route.ts` e `src/app/api/gateway-ia/[etapa]/route.ts`; `params`/`searchParams` de Route Handler e Server Components viraram `Promise` (`src/app/api/gateway-ia/[etapa]/route.ts`, `src/app/destino/page.tsx`, `src/app/destino/confirmacao/page.tsx`, com teste correspondente atualizado em `confirmacao/__tests__/page.test.tsx`). Verificação: `npm audit` — `next` passou de `critical` (2 CVEs críticas + 8 altas) para `moderate` (achado remanescente é só o `postcss@8.4.31` vendorizado dentro de `node_modules/next/node_modules/postcss`, non-runtime/build-only do próprio pacote `next`, sem fix disponível sem pular para `16.x`; nosso `postcss` de projeto já está em `8.5.28`, não vulnerável); nenhum achado alto/crítico em dependência direta de runtime (`dependencies` do `package.json`) — os altos/críticos remanescentes do audit geral (`prisma`, `vitest`, `vite`, `deepmerge-ts`) são devDependencies pré-existentes, fora do escopo desta tarefa (só `next`). `npm run lint`: limpo. `npm run build`: compila, type-checks e gera as 14 rotas sem erro. `npm test`: 428 passando / 85 falhando, todas as 85 falhas são `PrismaClientInitializationError` (Postgres indisponível em `localhost:55432` neste ambiente, pré-existente, documentado em tarefas anteriores — RL2-T01/RL5-T01/RL5-T02/RL8-T02), zero falha nova relacionada ao upgrade; suíte isolada dos arquivos tocados (`gateway-ia/[etapa]/route.test.ts` + `confirmacao/page.test.tsx`, 13 testes) roda 100% verde. Nota de ambiente (não é achado desta tarefa, mas relevante para quem reexecutar `npm install`/`npm run build` no mesmo checkout): o diretório do projeto está sob uma pasta sincronizada pelo OneDrive, que intermitentemente trava/apaga arquivos durante escrita em massa em `node_modules`/`.next` (erros `ENOENT`/`ENOTEMPTY`/`EPERM` do `npm`/`next build`, resolvidos nesta sessão só com `rm -rf` + retry); combinado com múltiplas instâncias paralelas do Executor rodando `npm install` no mesmo `node_modules` compartilhado (ver nota de RL2-T01), a instalação exigiu 4 tentativas até estabilizar. `--legacy-peer-deps` foi necessário por um conflito de peer dependency pré-existente e não relacionado (`@vercel/analytics`↔`vite@8` via `@sveltejs/kit` opcional, adicionado por outra tarefa em paralelo), não por causa do upgrade do `next` em si. |

### Refatoração Lote-2 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 2 (ver `QA-REPORT.md`,
2026-09-08) — achado simples de cobertura de teste, não bloqueante para o
fechamento do Lote 2 (L2-T01/L2-T02 permanecem `Concluída`).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL2-T01 | Estender o teste de guardrail de RNF-07 ("Determinismo / independência de LLM", `src/lib/__tests__/holidays.test.ts`) para também varrer `src/lib/actions/feriados.ts` (e demais arquivos futuros do módulo de feriados) contra `gateway-ia\|openai\|fetch\(\|await fetch`, hoje restrito só a `holidays.ts` | BE | 0.25 dia | L2-T01, L2-T02 | — | Concluída | Novo `it` em `src/lib/__tests__/holidays.test.ts` varre via `readdirSync` todo arquivo `feriados*.ts` de `src/lib/actions/` (hoje `feriados.ts` e `feriados-errors.ts`, e qualquer futuro arquivo do módulo, sem precisar de nova tarefa) com o mesmo regex `gateway-ia\|openai\|fetch\(\|await fetch`. Duas correções de detalhe de implementação sobre o regex literal do lote anterior (ambas comentadas inline no teste, resolvidas sem subir ao Coordenador — desvio pequeno): (1) comentários são removidos antes do match, pois `feriados-errors.ts` cita `src/lib/gateway-ia/errors.ts` só como referência de padrão análogo, não uso real; (2) o import real de `@/lib/gateway-ia/prompt-injection-guard` (sanitização pura de string, sem fetch/rede — ver `src/lib/gateway-ia/prompt-injection-guard.ts`) é allowlistado nominalmente, sem enfraquecer a cobertura para qualquer outro uso de `gateway-ia`/`openai`/`fetch`. Validado: (a) injeção manual de `await fetch(...)` em `feriados.ts` faz o novo teste falhar corretamente, revertida em seguida (`git diff` vazio); (b) suíte do arquivo `holidays.test.ts` passando 24/24 (`npm test -- holidays`), rodado com sucesso mais de uma vez antes de o `node_modules` compartilhado entrar em instabilidade por `npm install` concorrente de outra instância paralela do Executor; suíte completa do projeto rodada uma vez com sucesso nesta sessão (52 arquivos falhando só por `PrismaClientInitializationError`/Postgres inacessível em `localhost:55432`, pré-existente e não relacionado a este teste) |

### Refatoração Lote-3 (débito registrado pelo Validador)

Criada pelo Validador na auditoria de segurança (chapéu DevSecOps) do
Lote 3 (ver `SECURITY-REVIEW.md`, 2026-09-09) — achado de severidade
média, não bloqueante para o fechamento do Lote 3 (L3-T01 a L3-T05
permanecem `Concluída`), mas com prazo antes de qualquer deploy que
exponha `/api/gateway-ia/[etapa]` a tráfego público real.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL3-T01 | Integrar `checkGatewayIaRateLimit` (`src/lib/gateway-ia`, L3-T05) à rota `src/app/api/gateway-ia/[etapa]/route.ts` — a única rota HTTP pública do Gateway de IA hoje sem guarda de rate limit, alcançável por qualquer requisição externa assim que deployada (SDD §7/GUARDRAILS.md regra 19) | BE | 0.25 dia | L3-T05, L3-T02 | — | Concluída | Requisição além do limite configurado (`AI_GATEWAY_RATE_LIMIT_PER_MINUTE`) recebe erro tratável (não exceção não capturada) antes de qualquer chamada ao provider; chave de rate limit usa, no mínimo, IP da requisição até existir identificador de sessão real (Lote 4); prazo: antes do primeiro deploy que exponha esta rota a tráfego público, ou como controle compensatório equivalente no nível de borda/CDN, o que ocorrer primeiro — **Nota de implementação RL3-T01 (2026-09-12)**: `POST` em `route.ts` agora chama `checkGatewayIaRateLimit` logo após validar o contrato de entrada e antes de montar mensagens/chamar `streamStructuredCompletion`, retornando 429 com corpo `{ error }` ao exceder o limite. Chave de rate limit: identificador de sessão anônima (`ANONYMOUS_SESSION_COOKIE`, cookie httpOnly já existente) quando presente; senão, IP via `x-forwarded-for`/`x-real-ip` (satisfaz o mínimo do critério de aceite). Testes novos em `route.test.ts` cobrem: 429 sem chamar o provider ao exceder; isolamento do limite por sessão/cookie; fallback e isolamento por IP; e que a guarda de rate limit precede a validação de pré-condição de etapa. |

### Refatoração Lote-5 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 5 (ver `QA-REPORT.md`/
`SECURITY-REVIEW.md`, 2026-09-09) — dois achados simples, não bloqueantes
para o fechamento do Lote 5 (L5-T01 a L5-T05 permanecem `Concluída`).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL5-T01 | Alinhar `background_color`/`theme_color` de `public/manifest.webmanifest` ao token real `--background` de `src/app/globals.css` (L5-T01, ~`#0a0a0b`), hoje divergente (`#0F172A`) | FE | 0.1 dia | L5-T01, L5-T05 | RL5-T02 | Concluída | `--background: 240 5% 4%` (HSL) confirmado em `src/app/globals.css` L21/L66 converte para `#0A0A0B`; `background_color`/`theme_color` de `public/manifest.webmanifest` atualizados de `#0F172A` para `#0A0A0B`; alinhado também o `themeColor` (meta tag) em `src/app/layout.tsx`, mesma divergência, mesmo fix, arquivo diretamente relacionado ao critério (detalhe pequeno de implementação, sem mudança de escopo); `pwa.test.ts` (10/10) passa sem regressão — `npm test` completo tem falhas pré-existentes não relacionadas (todas `PrismaClientInitializationError`/Postgres indisponível em `localhost:55432` neste ambiente); `npm run build` falha por ambiente (módulos `@vercel/analytics`/`@vercel/speed-insights` ausentes em `node_modules`, não instalados neste ambiente), também pré-existente e não relacionado a esta mudança |
| RL5-T02 | `StepperProgress` (`src/components/design-system/stepper-progress.tsx`) — adicionar texto `sr-only` (ou `aria-label`) equivalente ao `title` de cada `StepDot`, garantindo que o status de cada etapa (concluída/atual/futura) seja exposto de forma confiável a leitores de tela, já que `title` sozinho tem suporte inconsistente em navegação por virtual cursor | FE | 0.25 dia | L5-T01 | RL5-T01 | Concluída | Cada `StepDot` (`completed`/`current`/`upcoming`) agora renderiza um `<span className="sr-only">` com o mesmo texto do `title` ("Etapa concluída"/"Etapa atual"/"Etapa futura"), mantendo o `title` para tooltip visual; teste novo em `stepper-progress.test.tsx` verifica os 3 textos via `.sr-only` no DOM; suíte do componente (19/19) passa sem regressão — `npm test` completo tem 93 falhas pré-existentes não relacionadas (todas `PrismaClientInitializationError`/Postgres indisponível em `localhost:55432` neste ambiente) |

### Refatoração Lote-6 (débito registrado pelo Validador)

Criada pelo Validador (chapéu DevSecOps) na auditoria de segurança do
Lote 6 (ver `SECURITY-REVIEW.md`, Lote 6, item 5) — achado de baixo
impacto, não bloqueante para o fechamento do Lote 6 (L6-T01 a L6-T07
permanecem `Concluída`). Sem prazo crítico (não é achado de
segurança/deploy).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL6-T01 | Padronizar o contrato de erro para destino em texto livre acima do tamanho máximo entre os 3 pontos de captura do Lote 6 — `processarFeriadoEscolhido` (`src/lib/actions/feriados.ts`) hoje lança um `Error` genérico quando `destino` excede `MAX_DESTINO_LENGTH`, enquanto `submeterDataLivre` (`src/lib/actions/data-livre.ts`) trunca silenciosamente via `sanitizeFreeTextForPrompt`; decidir (com o Coordenador/Gestor, se a escolha afetar contrato de UI já em produção) qual dos dois comportamentos é o padrão do produto e alinhar o outro a ele, usando uma classe de erro dedicada (mesmo padrão de `InvalidDataLivreInputError`/`InvalidHolidaySelectionError`) em vez de `Error` genérico se a rejeição for mantida | BE | 0.25 dia | L6-T03, L6-T05 | — | Concluída | Os 3 pontos de captura de destino do Lote 6 (`submeterDataLivre`, `processarFeriadoEscolhido`, e o quiz se algum dia vier a persistir destino) tratam destino acima do limite de tamanho da mesma forma (truncar OU rejeitar, não uma mistura dos dois); se a rejeição for o comportamento escolhido, usa uma classe de erro própria, não `Error` genérico; teste automatizado cobrindo o comportamento escolhido nos 2 pontos; sem regressão em `npm test`/`npm run build` — **Nota de implementação RL6-T01 (2026-09-12)**: comportamento padronizado escolhido foi REJEITAR (não truncar) — já era o comportamento pré-existente e documentado de `processarFeriadoEscolhido`, então `submeterDataLivre` foi alinhado a ele (decisão de detalhe de implementação, não escalada: truncar silenciosamente esconde do usuário que parte do texto digitado nunca foi salva, risco de confusão maior que um erro de validação explícito; não há UI em produção hoje que dependa do truncamento silencioso — `T01DateRangeForm` só envia o texto bruto do campo). Criada `InvalidDestinoLengthError` (`src/lib/actions/destino-length-error.ts`), COMPARTILHADA entre `feriados.ts` e `data-livre.ts` (em vez de uma cópia em cada `*-errors.ts` existente), reforçando no próprio tipo que os dois pontos tratam a mesma condição da mesma forma; `processarFeriadoEscolhido` trocou `throw new Error(...)` por essa classe, `submeterDataLivre`/`sanitizeDestino` passou a checar `trimmed.length > DESTINO_MAX_LENGTH` e lançar antes de chamar `sanitizeFreeTextForPrompt` (que só truncava via `.slice`), na mesma ordem (checagem sobre o texto pré-sanitização) já usada por `processarFeriadoEscolhido`. Terceiro ponto (quiz, `submitQuizAnswers`/`./quiz.ts`) confirmado como não aplicável: RF-03.1/RF-03.2 nunca coletam/persistem destino (documentado no próprio cabeçalho de `quiz.ts`, L6-T07) — nada a alinhar hoje; comentário adicionado no novo arquivo de erro apontando que, se o quiz um dia passar a coletar destino, deve reusar a mesma classe. Testes: `data-livre.integration.test.ts` — substituído o teste de truncamento por um novo cobrindo rejeição (`rejects.toBeInstanceOf(InvalidDestinoLengthError)`, sem criar sessão); `processar-feriado-escolhido.integration.test.ts` — teste existente de rejeição fortalecido de `rejects.toThrow(/tamanho máximo/)` para `rejects.toBeInstanceOf(InvalidDestinoLengthError)` (valida a classe, não só a mensagem). Verificação: `npm run lint` limpo; `npm run build` compila/type-checks/gera as 18 rotas sem erro (após limpar `.next` — 1ª tentativa falhou com `ENOENT` em `pages-manifest.json`, cache stale do OneDrive, não relacionado a este código, mesma classe de instabilidade de ambiente já documentada em RL1-T01); `npm test` completo: 471 passando / 95 falhando, todas as 95 falhas são `PrismaClientInitializationError` (Postgres indisponível em `localhost:55432` neste ambiente, pré-existente — RL1-T01/RL2-T01/RL5-T01/RL5-T02/RL8-T02), incluindo os testes de integração pré-existentes de `data-livre.integration.test.ts`/`processar-feriado-escolhido.integration.test.ts` que dependem de criar sessão real; os 2 testes novos/alterados desta tarefa não dependem de banco (a validação de tamanho ocorre antes de qualquer chamada a `resolveSessionOwner`/`createSessionWithDateRange`) e passam isoladamente (`npm test -- data-livre.integration processar-feriado-escolhido`, 4/15 passando localmente sem DB, sem nenhuma falha de asserção nos 2 novos casos — as 11 falhas restantes do arquivo são as mesmas `PrismaClientInitializationError` pré-existentes). |
| RL6-T02 | **(Bloqueio 006)** Conectar T01 (`src/app/entrada/data-livre/page.tsx`) ao formulário `T01DateRangeForm` (`onValid`) → Server Action `submeterDataLivre` (L6-T03) → navegação pós-confirmação do servidor, mesmo padrão de estado de pendência/erro acessível de `DestinoConfirmacaoScreen` (L7-T04) e de `router.push` com querystring de `HospedagemSugestoesScreen.handleContinuar`/`handleEncerrarAqui` (L8-T02) | FE | 0.25 dia | L6-T02, L6-T03, L7-T02, L7-T04 | RL6-T03, RL6-T04, RL7-T01 | Concluída | `DataLivrePage` passa a chamar `submeterDataLivre` no `onValid` de `T01DateRangeForm`, com estado de pendência (botão com `aria-busy`, mesmo padrão de `DestinoConfirmacaoScreen`) e mensagem de erro acessível (`role="alert"`, ícone+texto) em caso de falha do servidor, sem navegar antes da confirmação (Diretriz de Implementação 3 — nenhuma navegação client-side otimista). Em sucesso, navega via `router.push` para `/destino?sessionId=...` quando `proximaEtapa === "destino"`, ou para `/destino/confirmacao?sessionId=...&destino=...&flowState=destino_confirmado` quando `proximaEtapa === "confirmacao_destino"`. Teste automatizado cobrindo os dois ramos de navegação e o caminho de erro (Server Action rejeitada); sem regressão em `npm test`/`npm run build` |
| RL6-T03 | **(Bloqueio 006)** Adicionar botão "Continuar" a `FeriadosScreen` (`src/app/entrada/feriados/feriados-screen.tsx`), conectado à Server Action `processarFeriadoEscolhido` (L6-T05) e à navegação pós-confirmação do servidor, mesmo padrão de RL6-T02 | FE | 0.25 dia | L6-T04, L6-T05, L7-T02, L7-T04 | RL6-T02, RL6-T04, RL7-T01 | Concluída | `FeriadosScreen` ganha um botão "Continuar" (mesmo padrão visual/`min-h-11` dos demais botões primários do design system), habilitado só quando um feriado está selecionado (`selectedKey !== null`); ao clicar, chama `processarFeriadoEscolhido({ holidayDate: selectedKey, destino })` com estado de pendência e erro acessível (mesmo padrão de RL6-T02). Em sucesso, navega para `/destino?sessionId=...` quando `flowState === "destino_pendente"`, ou para `/destino/confirmacao?sessionId=...&destino=...&flowState=destino_confirmado` quando `flowState === "destino_confirmado"` (o `destino` exibido na tela de confirmação é o mesmo texto já digitado localmente pelo usuário, trimado — `ProcessarFeriadoEscolhidoResult` não devolve o texto sanitizado hoje, e mudar esse contrato não é objetivo desta tarefa). Teste automatizado cobrindo os dois ramos de navegação, o botão desabilitado sem seleção, e o caminho de erro; sem regressão em `npm test`/`npm run build` — **Nota de implementação**: `FeriadosScreen` passou a ser o dono direto da chamada à Server Action (mesmo padrão de injeção `actionOverride` já usado por `HospedagemSugestoesScreen`, L8-T02) e do `useRouter` do App Router, em vez de delegar a um wrapper client separado (padrão de `ConfirmacaoDestinoClient`/L7-T04) — não havia necessidade de separar Server/Client Component aqui porque `FeriadosScreen` já era inteiramente `"use client"` desde L6-T04. Destino vazio (após trim) é enviado como `undefined` (não string vazia), coerente com o tratamento de "sem destino" já feito por `processarFeriadoEscolhido`/`createSessionWithDateRange`. Testes novos em `src/app/entrada/feriados/__tests__/feriados-screen.test.tsx` (botão desabilitado sem seleção; navegação para `/destino` em `destino_pendente`; navegação para `/destino/confirmacao` com destino trimado em `destino_confirmado`; erro acessível com `role="alert"` sem navegar quando a Server Action rejeita) e ajuste de `src/app/entrada/feriados/__tests__/page.test.tsx` (mock de `next/navigation`/`processarFeriadoEscolhido`, já que `FeriadosScreen` agora usa `useRouter`). `npm run lint` limpo, `npx eslint src/app/entrada/feriados` sem achados, `npm run build` verde (rota `/entrada/feriados` gerada normalmente). `npx vitest run` tem 97 falhas pré-existentes, todas em testes de integração que exigem Postgres real em `localhost:55432` (indisponível neste ambiente) — nenhuma delas em arquivo tocado por esta tarefa; os 2 arquivos de teste desta tarefa (`feriados-screen.test.tsx`: 9 testes, `page.test.tsx`: 2 testes) passam 100% |
| RL6-T04 | **(Bloqueio 006)** Conectar T03 (`src/app/entrada/quiz/page.tsx`, `onComplete` de `QuizWizard`) à Server Action `submitQuizAnswers` (L6-T07) e à navegação pós-confirmação do servidor, mesmo padrão de RL6-T02 | FE | 0.25 dia | L6-T06, L6-T07, L7-T02 | RL6-T02, RL6-T03, RL7-T01 | Concluída | `QuizPage` chama `submitQuizAnswers(answers)` a partir do `onComplete` de `QuizWizard`, com estado de pendência e erro acessível (mesmo padrão de RL6-T02), substituindo a tela estática atual ("Respostas registradas... ainda estão em construção"). Em sucesso, navega via `router.push` para `/destino?sessionId=...` (o quiz nunca produz `flowState !== "destino_pendente"`, conforme documentado no cabeçalho de `submitQuizAnswers` — não há ramo `confirmacao_destino` a tratar aqui). Teste automatizado cobrindo a chamada da Server Action, a navegação e o caminho de erro; sem regressão em `npm test`/`npm run build` — **Nota de implementação RL6-T04 (2026-09-12)**: `src/app/entrada/quiz/page.tsx` reescrito — assim que `QuizWizard.onComplete` dispara, as respostas ficam guardadas em estado local (`submittedAnswers`) e `QuizWizard` some da tela, dando lugar a um estado de pendência/erro (mesmo raciocínio de `useState`/`isPending` manual usado por RL6-T02 em `data-livre/page.tsx`, não `useTransition` — com React 18, `startTransition(async () => ...)` só rastreia a parte síncrona do callback, então `isPending` cairia para `false` antes da Promise de `submitQuizAnswers` resolver; confirmado experimentalmente nesta sessão, corrigido antes de prosseguir). Estado de pendência: `<main aria-busy>` + texto "Enviando suas respostas..."; erro: `role="alert"` com ícone `AlertTriangle` + texto "Não conseguimos concluir agora. Tente novamente." (mesma mensagem genérica de RL6-T02/`DestinoConfirmacaoScreen`) e um botão "Tentar novamente" que reenvia as MESMAS respostas já coletadas (`submit(submittedAnswers)`), sem obrigar o usuário a refazer as 4 perguntas do wizard — decisão de UX pequena não escalada (o wizard perderia o estado ao ser desmontado/remontado; guardar e reenviar as respostas já validadas é estritamente melhor e não contradiz nenhum artefato). Em sucesso, `router.push(\`/destino?sessionId=${result.sessionId}\`)`; nenhum ramo `confirmacao_destino` implementado (quiz nunca coleta destino, RF-03.1, confirmado no cabeçalho de `submitQuizAnswers`). Testes novos em `src/app/entrada/quiz/__tests__/page.test.tsx` (`QuizWizard` substituído por um dublê mínimo que expõe um botão para disparar `onComplete` diretamente — o wizard em si já é coberto por `quiz-wizard.test.tsx`, L6-T06): chamada de `submitQuizAnswers` com as respostas + navegação de sucesso; estado de pendência (`aria-busy`/texto); erro acessível sem navegar; "Tentar novamente" reenvia as mesmas respostas e navega em sucesso — 4/4 passando, mais os 9/9 pré-existentes de `quiz-wizard.test.tsx` sem regressão. `npm run lint` limpo nos arquivos desta tarefa; `npx tsc --noEmit` sem erro novo (os poucos erros pré-existentes no repositório, ex. `TS2556` em outros `page.test.tsx`, não relacionados). `npm test` completo: 471 passando / 95 falhando, todas as 95 falhas são `PrismaClientInitializationError` (Postgres indisponível em `localhost:55432` neste ambiente, mesma limitação pré-existente documentada em RL1-T01/RL2-T01/RL5-T01/RL5-T02/RL8-T02), nenhuma falha nova relacionada a esta tarefa. `npm run build` (`next build`) compila e gera as 18 rotas sem erro, incluindo `/entrada/quiz` (3.42 kB). Não tocado: `src/app/entrada/data-livre/page.tsx` (RL6-T02) nem `src/app/entrada/feriados/feriados-screen.tsx` (RL6-T03), ambos em edição paralela por outras instâncias do Executor no momento desta tarefa — só lidos como referência de padrão. |

**Nota de implementação RL6-T02 (2026-09-12, Executor/FE):**
`src/app/entrada/data-livre/page.tsx` agora chama `submeterDataLivre`
(`@/lib/actions/data-livre`, L6-T03) a partir de `onValid` de
`T01DateRangeForm`, com estado de pendência (`isPending`) e erro (`error`,
`role="alert"` + ícone `AlertTriangle`, mesmo padrão de
`DestinoConfirmacaoScreen`/L7-T04). Nenhuma navegação ocorre antes da Promise
resolver (Diretriz de Implementação 3); em sucesso, `router.push` vai para
`/destino?sessionId=...` (`proximaEtapa === "destino"`) ou para
`/destino/confirmacao?sessionId=...&destino=...&flowState=destino_confirmado`
(`proximaEtapa === "confirmacao_destino"`), mesmo padrão de querystring de
`HospedagemSugestoesScreen.handleContinuar`/`handleEncerrarAqui` (L8-T02).
Pequeno detalhe de implementação decidido nesta tarefa (não estava no
critério de aceite): `T01DateRangeForm` (`src/components/entrada/
t01-date-range-form.tsx`, L6-T02) ganhou uma prop opcional `isPending` (default
`false`) para o botão "Continuar" refletir `aria-busy`/`disabled`/texto
("Enviando...") — o formulário continua sem chamar nenhuma Server Action
diretamente, só expõe o estado visual que o chamador já controla; decisão
necessária porque o botão de submit pertence ao formulário, não à página, e o
critério de aceite explicitamente pede "botão com aria-busy". Teste novo em
`src/app/entrada/data-livre/__tests__/page.test.tsx` (5 casos: os 2 ramos de
navegação, estado de pendência, caminho de erro sem navegação, foco no
título) e um caso adicional em `src/components/entrada/__tests__/
t01-date-range-form.test.tsx` cobrindo a nova prop `isPending`. `npm run
lint`: sem warnings/erros. `npm test`: os 13 testes novos/alterados passam de
forma consistente tanto isolados quanto em execução completa; a suíte
completa (`npm test`) mostrou falhas intermitentes em arquivos não tocados
por esta tarefa (`quiz`, `feriados`, integrações Prisma) — investigado e
atribuído a (a) testes de integração que dependem de Postgres real em
`localhost:55432`, indisponível neste ambiente, e (b) flakiness sob carga de
múltiplas instâncias paralelas do Executor rodando `npm test`/`npm run
build` simultaneamente neste mesmo ambiente (contagem de falhas variou entre
execuções consecutivas do mesmo comando, sem nenhuma mudança de código entre
elas) — não regressão introduzida por esta tarefa. `npm run build`: sucesso
(`✓ Compiled successfully`, `✓ Generating static pages (18/18)`,
`/entrada/data-livre` pré-renderizada estaticamente).

### Refatoração Lote-7 (débito registrado pelo Coordenador)

Criada pelo Coordenador em resposta ao **Bloqueio 006** (`.md/BLOCKERS.md`,
2026-09-12, escalado pelo Validador na Validação Final de Confirmação
pré-staging) — não bloqueante para o fechamento já registrado do Lote 7
(`L7-T01` a `L7-T05` permanecem `Concluída`), mas bloqueia a promoção a
staging do conjunto completo (ver nota de resolução do Bloqueio 006 após a
tabela do Lote 12 e Seção 6).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL7-T01 | **(Bloqueio 006)** Conectar `onConfirmar` de `ConfirmacaoDestinoClient` (`src/app/destino/confirmacao/confirmacao-destino-client.tsx`) ao `router.push` para `/hospedagem` após `confirmarDestino` (L7-T05) resolver, mesmo padrão de `router.push` com querystring já usado em `HospedagemSugestoesScreen.handleContinuar` (L8-T02) e já aplicado ao `onTrocar` deste mesmo arquivo | FE | 0.1 dia | L7-T04, L7-T05, L12-T01 | RL6-T02, RL6-T03, RL6-T04 | Concluída | `onConfirmar` de `ConfirmacaoDestinoClient` deixa de ser `confirmarDestino` diretamente e passa a ser um wrapper (mesmo padrão já usado por `onTrocar` poucas linhas abaixo no mesmo arquivo) que chama `confirmarDestino({ sessionId })` e, só depois da Promise resolver, navega via `router.push` para `/hospedagem?sessionId=...&flowState=hospedagem_pendente` (rota real desde L12-T01) — nunca `router.back()`/navegação otimista antes da confirmação do servidor (Diretriz de Implementação 3). Teste automatizado cobrindo a navegação pós-confirmação e a ausência de navegação em caso de falha (mesmo padrão do teste já existente para `onTrocar`); sem regressão em `npm test`/`npm run build` — **Nota de implementação RL7-T01 (2026-09-12)**: mudança mínima e cirúrgica em `confirmacao-destino-client.tsx` — `onConfirmar` passou de `confirmarDestino` (referência direta) para um wrapper `async (input) => { const result = await confirmarDestino(input); router.push(...); return result; }`, construindo a querystring com `URLSearchParams({ sessionId: input.sessionId, flowState: "hospedagem_pendente" })`, exatamente o padrão de `HospedagemSugestoesScreen.handleContinuar` (L8-T02) e de `onTrocar` já existente no mesmo arquivo. Em falha, `confirmarDestino` rejeita antes do `router.push`, e `DestinoConfirmacaoScreen`/`runAction` já cobre a mensagem acessível sem navegar — nenhuma mudança necessária ali. 2 testes novos em `src/app/destino/confirmacao/__tests__/confirmacao-destino-client.test.tsx` (navegação para `/hospedagem?sessionId=session-1&flowState=hospedagem_pendente` só após a Promise resolver, sem chamar `trocarDestino`; ausência de navegação quando `confirmarDestino` rejeita) mais o mock de `useRouter` estendido com `push: pushMock` (antes só `back`); os 4 testes pré-existentes do arquivo continuam passando — 6/6 verdes. `npm run lint` (`next lint`) limpo. `npm run build` compila as 18 rotas sem erro, incluindo `/destino/confirmacao` (2.92 kB). `npm test` completo: 473 passando / 95 falhando, todas as 95 falhas são `PrismaClientInitializationError` pré-existentes (Postgres indisponível em `localhost:55432` neste ambiente, mesma limitação já documentada em RL6-T03/RL6-T04 e outras notas anteriores), nenhuma falha nova nem relacionada a esta tarefa. |

### Refatoração Lote-8 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 8 (ver `QA-REPORT.md`,
2026-09-10) — achado simples de cobertura funcional, não bloqueante para o
fechamento do Lote 8 (L8-T01 a L8-T03 permanecem `Concluída`). `RL8-T02`
acrescentada pelo Validador (chapéu DevSecOps) na auditoria de segurança do
mesmo lote (2026-09-10, ver `SECURITY-REVIEW.md` — Lote 8, item 2b).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL8-T01 | Incorporar o feedback textual do campo "Ajustar" de T06 (RF-05.3, UX-SPEC.md T06) ao prompt de regeneração de hospedagem — estender `StageContext`/`buildHospedagemPrompt` (`@/lib/gateway-ia`, L3-T02) com um campo opcional de feedback e `generateAccommodationSuggestions` (`@/lib/stage-rules`, L8-T01) para repassá-lo; `gerarSugestoesHospedagem`/`HospedagemSugestoesScreen` passam a enviar o texto capturado em vez de só logá-lo em dev (mesmo gap, se confirmado, também presente em T04/"nova rodada" e a repetir em T07/L9-T02 — avaliar extensão conjunta) | BE+FE | 0.5 dia | L3-T02, L8-T01, L8-T02, L8-T03 | — | Concluída | Ao chamar "Ajustar" com texto no campo de feedback, o prompt enviado ao Gateway de IA (`messages`) contém literalmente o texto informado pelo usuário **, sempre passado por `sanitizeFreeTextForPrompt` (`@/lib/gateway-ia/prompt-injection-guard`, L11-T03) antes de compor a mensagem — mesmo padrão já usado em `informarDestinoManualmente` (`src/lib/actions/destino.ts`); nenhuma implementação que interpole o texto bruto sem essa sanitização é aceita (achado de segurança do Validador, `SECURITY-REVIEW.md` Lote 8 item 2a)**; teste automatizado cobrindo a inclusão do feedback sanitizado na mensagem, incluindo um caso com tentativa de instrução embutida que não deve alterar o comportamento do prompt; sem regressão em `npm test`/`npm run build`; sem prazo crítico (achado simples, não de segurança/deploy — mas a sanitização em si não é opcional). **Nota de implementação (2026-09-10):** `StageContext.adjustmentFeedback?: string \| null` adicionado (`src/lib/gateway-ia/prompts.ts`), consumido só por `buildHospedagemPrompt` (as demais etapas não são afetadas — campo opcional, sem quebra de chamadas existentes); `generateAccommodationSuggestions` (`src/lib/stage-rules/hospedagem.ts`) repassa `input.adjustmentFeedback` ao contexto; `gerarSugestoesHospedagem` (`src/lib/actions/hospedagem.ts`) ganhou o parâmetro opcional `feedback`, sanitizado via `sanitizeFreeTextForPrompt` (`FEEDBACK_MAX_LENGTH = 300`, mesmo raciocínio de `DESTINO_MAX_LENGTH`) ANTES de repassar — a sanitização acontece no mesmo módulo/ponto que já sanitiza para `informarDestinoManualmente`; `HospedagemSugestoesScreen.handleAdjustSubmit` (`src/components/hospedagem/hospedagem-sugestoes-screen.tsx`) passa `feedbackValue` como segundo argumento, removendo o `console.info` de placeholder. Testes novos: `src/lib/gateway-ia/__tests__/prompt-injection-guard.test.ts` (feedback sanitizado interpolado + tentativa de instrução embutida neutralizada + sem regressão quando ausente), `src/lib/stage-rules/__tests__/hospedagem.test.ts`, `src/lib/actions/__tests__/hospedagem.integration.test.ts` (fim a fim, incluindo tentativa de injeção) e `src/components/hospedagem/__tests__/hospedagem-sugestoes-screen.test.tsx` (UI repassa o texto digitado). Coexistiu em paralelo com RL8-T02 no mesmo arquivo `src/lib/actions/hospedagem.ts` sem conflito — RL8-T02 já tinha adicionado `sanitizeFreeTextForPrompt`/constantes `ACCOMMODATION_*_MAX_LENGTH`/sanitização de `assertValidAccommodationPayload` quando esta tarefa tocou o arquivo; só `gerarSugestoesHospedagem` e o cabeçalho de comentários foram alterados por esta tarefa. `npm run lint` limpo nos arquivos alterados; `npx tsc --noEmit` sem novos erros (erros pré-existentes não relacionados em outros arquivos); `npm run build` (`next build`) passa; testes unitários relevantes (122 testes em `gateway-ia`/`stage-rules`/`hospedagem` component) passam. Testes de integração Prisma (`hospedagem.integration.test.ts`) não puderam ser executados neste ambiente por falta de um Postgres local acessível (`localhost:55432`) — limitação de ambiente, não regressão introduzida por esta tarefa (mesmo teste falha por qualquer alteração nesse arquivo sem banco disponível); recomenda-se rodar em CI/ambiente com banco antes do próximo deploy. Gap remanescente documentado (fora de escopo desta tarefa): T04/"nova rodada" (RF-04.4) continua sem campo de feedback textual — nunca teve um na UX-SPEC, não é o mesmo gap. |
| RL8-T02 | Aplicar `sanitizeFreeTextForPrompt` (`@/lib/gateway-ia/prompt-injection-guard`, L11-T03) a `name`/`type`/`distinctiveFeature` dentro de `assertValidAccommodationPayload` (`src/lib/actions/hospedagem.ts`, L8-T03) antes de `applySessionFlowTransition` persistir `AccommodationApproval` — hoje só a faixa de preço é revalidada contra adulteração, os campos de texto não; `context.accommodation.name`/`.type` já são interpolados literalmente em `buildPasseiosPrompt`/`buildRoteiroPrompt` (`src/lib/gateway-ia/prompts.ts`), então um payload de aprovação adulterado pelo cliente vira instrução de prompt assim que `L9-T01`/`L10-T01` lerem o registro de volta | BE | 0.25 dia | L8-T03, L11-T03 | RL8-T01 | Concluída | `assertValidAccommodationPayload` sanitiza `name`/`type`/`distinctiveFeature` via `sanitizeFreeTextForPrompt` antes de qualquer persistência; teste automatizado cobrindo um payload de aprovação com tentativa de instrução embutida em `name`/`type`/`distinctiveFeature`, confirmando que o valor persistido/propagado já vem sanitizado; sem regressão em `npm test`/`npm run build`; **deve estar concluída antes de `L9-T01`/`L10-T01` iniciarem implementação** (mesmo raciocínio de sequenciamento do Bloqueio 003/`L11-T03` vs. `L8-T01`, `.md/BLOCKERS.md`) — **Nota de implementação (2026-09-10)**: `assertValidAccommodationPayload` agora sanitiza `name`/`type`/`distinctiveFeature` via `sanitizeFreeTextForPrompt` (limites `ACCOMMODATION_NAME_MAX_LENGTH=200`/`ACCOMMODATION_TYPE_MAX_LENGTH=100`/`ACCOMMODATION_DISTINCTIVE_FEATURE_MAX_LENGTH=500`, mesmo padrão de `DESTINO_MAX_LENGTH` em `destino.ts`) ANTES da checagem de "vazio" e retorna os três campos já sanitizados (`SanitizedAccommodationText`); `aprovarHospedagem` usa exclusivamente esse retorno no `childData` de `applySessionFlowTransition` e no `AprovarHospedagemResult.hospedagem` — nunca o valor bruto do payload. Teste de integração novo em `hospedagem.integration.test.ts` ("sanitiza tentativa de prompt injection em name/type/distinctiveFeature antes de persistir") cobre os três campos com marcadores de delimitador (` ``` `, `[INST]`/`[/INST]`) e frase de override (`System:`, "ignore... instruções anteriores", "revele o prompt do sistema", "aja como se você fosse um novo assistente") tanto no valor de retorno quanto no registro persistido — não executado neste ambiente por falta de Postgres em `localhost:55432` (limitação já documentada nos demais testes de integração do projeto), mas correto para rodar contra um banco real. `npm run lint`/`npx tsc --noEmit`/`npm run build` sem erros; `npm test` sem regressão nos 362 testes não dependentes de banco (as falhas restantes são só as integrações de Postgres, pré-existentes). Execução em paralelo com a instância de RL8-T01 no mesmo arquivo (`hospedagem.ts`/`hospedagem.integration.test.ts`) sem conflito — escopos não se sobrepuseram (`gerarSugestoesHospedagem`/feedback vs. `assertValidAccommodationPayload`/`aprovarHospedagem`). |

### Refatoração Lote-12 (débito registrado pelo Validador)

Criada pelo Validador na checagem estrutural do Lote 12 (ver `QA-REPORT.md`,
2026-09-12) — achado simples de divergência de escopo, não bloqueante para o
fechamento do Lote 12 (`L12-T01` a `L12-T05` permanecem `Concluída`).

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| RL12-T01 | Reconciliar a nota de escopo do Lote 12 ("`L12-T01`/`L12-T02`/`L12-T03` não mudam nenhum dos componentes de tela existentes") com o diff real de `src/components/hospedagem/hospedagem-sugestoes-screen.tsx`, que ganhou `className="min-h-11"` no botão `variant="ghost"` do diálogo de ajuste (os outros 5 botões do arquivo já tinham essa classe de touch-target desde `dd4b8e9`, anterior a este lote) — decidir se a linha é mantida (documentando a exceção pontual de acessibilidade na nota de `L12-T01`) ou revertida para alinhar `TASK.md` ao comportamento real | FE | 0.1 dia | L12-T01 | — | Pendente | A nota de escopo do Lote 12 (`TASK.md`) e o `git diff` de `hospedagem-sugestoes-screen.tsx` ficam consistentes entre si — ou a nota é atualizada para citar a exceção pontual (mesmo padrão de touch-target de `RL5-T02`), ou a linha é revertida; sem regressão em `hospedagem-sugestoes-screen.test.tsx`; sem prazo crítico (achado simples, não de segurança/deploy) |

### Lote 12 — Integração de Rotas (T06-T-END)

Criado pelo Coordenador em resposta ao **Bloqueio 005** (`.md/BLOCKERS.md`,
2026-09-12, escalado pelo Validador na validação funcional do Lote 10).
Confirmado por leitura direta do código antes de decompor: `src/app`
realmente não tem `hospedagem/`, `passeios/`, `roteiro/` nem `encerramento/`
— só `entrada/**`, `destino/page.tsx` e `destino/confirmacao/page.tsx`
existem hoje. `src/app/destino/confirmacao/page.tsx` (L7-T04) é reaproveitável
como padrão: Server Component fino, resolve `sessionId`/`flowState` (e demais
parâmetros necessários) via `searchParams`, com `redirect("/")` quando faltar
o essencial, delegando toda a interatividade ao componente/client wrapper já
existente. As 4 rotas novas seguem exatamente esse padrão.

**Decisão de decomposição (por que um lote novo, não Refatoração distribuída
por Lote 8/9/10)**: os `Refatoração Lote-N` existentes (RL6, RL8) corrigem um
comportamento já implementado dentro do escopo daquele lote (ex.: sanitização
faltante, prompt sem feedback). Este gap é diferente — é a ausência de uma
peça inteira (rota navegável) que nunca esteve no escopo de nenhuma tarefa
individual (cada uma documentou o gap como "fora de escopo", nunca como
"a implementar depois nesta refatoração"), e atravessa 3 lotes de tela mais o
Lote 11 (Server Action de leitura precisa dos 4 tipos de aprovação já
persistidos, alguns do Lote 7). Mesmo raciocínio já usado para o Lote 11
(Cross-cutting Final): quando o trabalho não pertence a nenhum lote de origem
específico, vira lote próprio em vez de forçar uma tarefa de refatoração
dentro de um lote ao qual não pertence de fato.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L12-T01 | Rota `/hospedagem` — `page.tsx` que resolve `sessionId`/`flowState` da querystring (mesmo padrão de `src/app/destino/confirmacao/page.tsx`, L7-T04) e monta `HospedagemSugestoesScreen` (L8-T02) | FE | 0.25 dia | L8-T02 | L12-T02, L12-T03, L12-T04 | Concluída | Implementado em `src/app/hospedagem/page.tsx` seguindo exatamente o padrão de `src/app/destino/page.tsx` (L7-T02, não o de `confirmacao/page.tsx` — `HospedagemSugestoesScreen` só recebe `sessionId`, sem `flowState`/`destino`): Server Component fino que resolve `sessionId` de `searchParams` assíncrono, `redirect("/")` se ausente, senão renderiza `HospedagemSugestoesScreen`. Teste em `src/app/hospedagem/__tests__/page.test.tsx` cobre os dois casos do critério de aceite, com `HospedagemSugestoesScreen` substituída por dublê para isolar o roteamento (a tela em si já é coberta por seus próprios testes, L8-T02). `npm run lint` sem erros/warnings. |
| L12-T02 | Rota `/passeios` — `page.tsx` que resolve `sessionId`/`flowState` da querystring e monta `PasseiosSugestoesScreen` (L9-T02) | FE | 0.25 dia | L9-T02 | L12-T01, L12-T03, L12-T04 | Concluída | Implementado em `src/app/passeios/page.tsx`, mesmo padrão exato de `src/app/hospedagem/page.tsx` (L12-T01)/`src/app/destino/page.tsx` (L7-T02): Server Component fino que resolve `sessionId` de `searchParams` assíncrono, `redirect("/")` se ausente, senão renderiza `PasseiosSugestoesScreen`. Diferença desta rota em relação a L12-T01/L12-T03: `PasseiosSugestoesScreen` mantém a prop `actions` OBRIGATÓRIA (não `actionsOverride` opcional) — ver "CONTRATO ESPERADO DA SERVER ACTION DE L9-T03" no cabeçalho daquele componente; como `@/lib/actions/passeios.ts` (L9-T03) já existe com as 3 funções exatamente no formato esperado (`gerarSugestoesPasseios`/`aprovarSelecaoPasseios`/`encerrarResolucaoPasseios`, tipo `AprovarSelecaoPasseiosResult` já reexportado como alias de `AprovarPasseiosResult`), a rota as passa diretamente na prop `actions` sem precisar tocar em `PasseiosSugestoesScreen` (fora do escopo desta tarefa, conforme nota após esta tabela). Teste em `src/app/passeios/__tests__/page.test.tsx` cobre os dois casos do critério de aceite, com `PasseiosSugestoesScreen` e `@/lib/actions/passeios` substituídos por dublês para isolar o roteamento (a tela em si já é coberta por seus próprios testes, L9-T02). `npx eslint`/`npx vitest run` limpos nos arquivos desta tarefa; `npx tsc --noEmit` sem erro novo (o único erro no teste novo, `TS2556` no `redirectMock(...args)`, é o mesmo padrão pré-existente já presente em `destino/confirmacao`/`hospedagem`/`roteiro` `page.test.tsx`, não uma regressão desta tarefa). |
| L12-T03 | Rota `/roteiro` — `page.tsx` que resolve `sessionId`/`flowState` da querystring e monta `RoteiroScreen` (L10-T02) | FE | 0.25 dia | L10-T02 | L12-T01, L12-T02, L12-T04 | Concluída | Server Component fino (mesmo padrão de `src/app/destino/page.tsx`, L7-T02): `redirect("/")` sem `sessionId`, senão renderiza `RoteiroScreen` com `sessionId` — `RoteiroScreen` não recebe `flowState`. Teste cobre os dois casos (`src/app/roteiro/__tests__/page.test.tsx`) |
| L12-T04 | Server Action de leitura `obterResumoEncerramento(sessionId)` — monta `EncerramentoResumo` (`@/components/encerramento`, L10-T04) a partir de `DestinationApproval`/`AccommodationApproval`/`ActivityApproval`/`ItineraryItem` já persistidos (campo ausente = etapa não aprovada, nunca erro, mesmo princípio já usado no schema); aplica o guard de dono de sessão (`L11-T02`) antes de ler | BE | 0.5 dia | L7-T03, L8-T03, L9-T03, L10-T03, L11-T02 | L12-T01, L12-T02, L12-T03 | Concluída | Implementado em `src/lib/actions/encerramento.ts`, mesmo padrão exato de `gerarRoteiro` (`./roteiro.ts`, L10-T03): busca `TripSession` (`flowState`/`userId`/`anonSessionId`) por `id`, `SessionNotFoundError` se ausente, `assertSessionOwnership` explícito em seguida (404, nunca 403); depois busca em paralelo `DestinationApproval.findUnique`/`AccommodationApproval.findUnique`/`ActivityApproval.findMany` (por `sessionId`) e monta `EncerramentoResumo` — `destino`/`hospedagem` `null` quando a linha não existe, `passeios` `null` quando não há nenhum `ActivityApproval` (array preenchido `{ name, free }` ordenado por `orderIndex` caso contrário), `roteiroAprovado: session.flowState === "concluida"` (não lê `ItineraryItem` diretamente — o resumo desta tela é booleano/RN-03, não item a item). Reexporta `EncerramentoResumo`/`EncerramentoPasseioResumo` de `./encerramento-screen` para uso futuro de `L12-T05`. Teste de integração em `src/lib/actions/__tests__/encerramento.integration.test.ts` cobre resumo parcial, resumo completo (com passeio pago e gratuito) e os dois casos de 404 (`SessionNotFoundError`: identidade não dona da sessão e sessão inexistente) — mesma limitação de ambiente já documentada em L7-T03/L8-T03/L9-T03/L10-T03 (requer Postgres real em `localhost:55432`; falha aqui por `PrismaClientInitializationError`, não por defeito de lógica). `npm run lint` e `npx eslint` nos arquivos desta tarefa sem erros/warnings; `npx tsc --noEmit` sem erro novo (únicos erros do projeto são pré-existentes, não relacionados a este arquivo). |
| L12-T05 | Rota `/encerramento` — `page.tsx` que resolve `sessionId`/`flowState` da querystring, chama `obterResumoEncerramento` (L12-T04) e monta `EncerramentoScreen` (L10-T04) | FE | 0.5 dia | L10-T04, L12-T04 | L12-T01, L12-T02, L12-T03 | Concluída | Implementado em `src/app/encerramento/page.tsx`: Server Component fino que resolve `sessionId`/`flowState` de `searchParams` assíncrono, `redirect("/")` quando `sessionId` ausente ou `flowState` fora de `"concluida"`/`"encerrada_parcial"` (tipo `EncerramentoFlowState`); senão chama `await obterResumoEncerramento(sessionId)` (L12-T04) diretamente do Server Component (Server Action async, sem client wrapper) e renderiza `EncerramentoScreen` (L10-T04) com `flowState`/`resumo` resolvidos — diferente de L12-T01/T02/T03, a busca de dados acontece na própria rota, já que `EncerramentoScreen` é apresentação pura. `SessionNotFoundError` (`@/lib/session-flow`, lançado via `assertSessionOwnership`) também vira `redirect("/")`, mesmo raciocínio de "sem sessão válida não há o que mostrar". Teste em `src/app/encerramento/__tests__/page.test.tsx` (6 casos: `flowState=concluida`, `flowState=encerrada_parcial`, `sessionId` ausente, `flowState` ausente, `flowState` inválido, `SessionNotFoundError`) com `obterResumoEncerramento` e `EncerramentoScreen` substituídos por dublês para isolar o roteamento. `npm run lint` sem erros/warnings; `npx tsc --noEmit` sem erro novo (único erro no teste novo é `TS2556` em `redirectMock(...args)`, mesmo padrão pré-existente já presente em `destino/confirmacao`/`hospedagem`/`passeios`/`roteiro` `page.test.tsx`, confirmado via `git stash` que o erro já existia antes desta tarefa). |

**Nota**: `L12-T01`/`L12-T02`/`L12-T03` não mudam nenhum dos componentes de
tela existentes (`HospedagemSugestoesScreen`/`PasseiosSugestoesScreen`/
`RoteiroScreen`) — são só o `page.tsx` que hoje não existe. `L12-T04` é uma
Server Action nova, de leitura pura (sem regra de negócio/mudança de schema),
mantida separada de `L12-T05` pela mesma convenção de não-mistura já usada em
todo o resto do `TASK.md` (uma tarefa não cobre tela + Server Action ao mesmo
tempo). Nenhuma das 5 tarefas se aproxima do canário de ~300 mil tokens —
cada uma toca no máximo 2-3 arquivos novos, reaproveitando componentes/schema
já existentes e prontos.

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
Lotes 3+4+5 → Lote 8 (Hospedagem)             [L8-T01 também aguarda L11-T03]
Lotes 3+4+5 → Lote 9 (Passeios)               [L9-T01 também aguarda L11-T03]
Lote 9 + Lote 3 → Lote 10 (Roteiro/Encerramento) [L10-T01 aguarda SPIKE-02
                                                   e também L11-T03]
Lotes 6+7+8+9+10 → Lote 11 (Cross-cutting final, L11-T04 é a última tarefa)
  — EXCEÇÃO: L11-T03 não segue essa cadência. Fica elegível assim que
  Lote 3/L3-T02 concluir (ver Bloqueio 003, resolvido), em paralelo aos
  Lotes 4-7, e deve concluir antes do início de L8-T01/L9-T01/L10-T01.
  L11-T01/L11-T02a/L11-T02/L11-T04 continuam presos à cadência normal do
  Lote 11. Dentro do Lote 11, `L11-T02` ganhou uma dependência interna nova:
  `L11-T02a` → `L11-T02` (guard central depende da persistência do dono
  existir primeiro — ver Bloqueio 004/ADR-008, resolvido).

Lotes 8+9+10+11 → Lote 12 (Integração de Rotas) [L12-T01 aguarda só L8-T02;
  L12-T02 aguarda só L9-T02; L12-T03 aguarda só L10-T02; L12-T04 aguarda
  L7-T03+L8-T03+L9-T03+L10-T03+L11-T02; L12-T05 aguarda L10-T04+L12-T04 —
  ver Bloqueio 005, resolvido. L12-T01/T02/T03/T04 são mutuamente
  paralelizáveis entre si; só L12-T05 tem ordem obrigatória (depende de
  L12-T04 terminar primeiro)].

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
Lote 6 → Refatoração Lote-6 (RL6-T01) — sem bloquear nenhum outro lote;
  sem prazo crítico (achado de baixo impacto, não de segurança/deploy).
Lote 6 + Lote 7 + Lote 12 → Refatoração Lote-6 (RL6-T02/T03/T04) e
  Refatoração Lote-7 (RL7-T01) — **Bloqueio 006, resolvido**: diferente de
  RL6-T01, estas 4 tarefas TÊM prazo crítico — bloqueiam a promoção a
  staging do conjunto completo (jornada T00→T-END não navegável sem elas),
  mesmo status de gate que L11-T03/RL8-T02 já tinham para seus respectivos
  riscos. RL6-T02 depende de L6-T02+L6-T03+L7-T02+L7-T04; RL6-T03 depende de
  L6-T04+L6-T05+L7-T02+L7-T04; RL6-T04 depende de L6-T06+L6-T07+L7-T02;
  RL7-T01 depende de L7-T04+L7-T05+L12-T01 — todas as 4 dependências já
  `Concluída`s, então as 4 tarefas estão imediatamente elegíveis para
  execução em paralelo entre si (arquivos distintos, sem sobreposição).
Lote 8 → Refatoração Lote-8 (RL8-T01, RL8-T02) — sem bloquear nenhum outro
  lote; RL8-T01 sem prazo crítico (achado simples, não de segurança/deploy,
  mas com requisito de sanitização não opcional embutido no critério de
  aceite); RL8-T02 (achado de segurança do Validador/chapéu DevSecOps,
  `SECURITY-REVIEW.md` Lote 8 item 2b) tem dependência reversa de
  `L9-T01`/`L10-T01` — precisa concluir antes dessas duas tarefas iniciarem
  implementação, mesmo padrão do Bloqueio 003 já resolvido para `L11-T03`
  vs. `L8-T01`.
Lote 12 → Refatoração Lote-12 (RL12-T01) — sem bloquear nenhum outro lote;
  sem prazo crítico (achado simples de divergência de escopo/documentação,
  não de segurança/deploy).

RESOLVIDO (Bloqueio 003, `.md/BLOCKERS.md`, 2026-09-10, Coordenador):
  L11-T03 (sanitização de texto livre contra prompt injection) ganhou
  dependência reversa explícita de L8-T01/L9-T01/L10-T01 (Seção 3) — essas
  3 tarefas não podem iniciar implementação antes de L11-T03 estar
  `Concluída`. L11-T03 em si não mudou de dependência (continua só
  `L3-T02`) nem de ID/seção — o que mudou é que ela passa a ficar elegível
  para execução assim que L3-T02 concluir, em paralelo aos Lotes 4-7,
  em vez de esperar a cadência normal do Lote 11 (que só abre depois dos
  Lotes 6-10). Ver nota de resolução completa logo após a tabela do Lote 11
  (Seção 3).
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

**Lacuna estrutural encontrada durante a validação funcional (Bloqueio 005,
resolvida em 2026-09-12, Coordenador):** cada tarefa de tela dos Lotes 8, 9
e 10 (`L8-T02`, `L9-T02`, `L10-T02`, `L10-T04`) documentou individualmente,
como decisão de fronteira, que a rota real (`page.tsx`) que monta a tela a
partir de `sessionId` da querystring ficava fora do escopo daquela tarefa —
decisão razoável tarefa a tarefa, mas sem nenhuma tarefa subsequente que
efetivamente fechasse o gap, deixando a jornada T00→T-END sem navegação real
em produção a partir de T06. Resolução: criado o Lote 12 — Integração de
Rotas (`L12-T01` a `L12-T05`, Seção 3), com as 4 `page.tsx` faltantes mais a
Server Action de leitura `obterResumoEncerramento` que `EncerramentoScreen`
(T-END) precisa. Não gerou novo ADR — não é uma mudança de decisão
arquitetural do `SDD.md`, é a decomposição de um trabalho que já estava
implícito no `UX-SPEC.md`/`PRD-TECNICO.md` (a jornada precisa ser navegável)
e nunca tinha virado tarefa própria. Ver `.md/BLOCKERS.md`, Bloqueio 005, para
o registro completo do achado e da resolução.

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
- L7-T05 encontrou que a state machine de L4-T01 (ADR-006) não modelava
  nenhuma transição regressiva (`*_confirmado`/`*_aprovada(o)`/`*_aprovados`
  → `*_pendente` da mesma etapa) — lacuna real entre o critério de aceite de
  T05 ("trocar volta ao campo de destino") e a state machine já implementada.
  Escalado como Bloqueio 002 (`.md/BLOCKERS.md`), resolvido pelo Coordenador
  como ADR-006 Adendo 2: nova ação `revisar`, modelada de forma genérica para
  as 4 etapas (destino/hospedagem/passeios/roteiro), não só destino — ver
  instrução de retomada logo após a nota de implementação L7-T04, abaixo.
  Nenhuma tarefa nova de UI criada para L8/L9/L10 agora; o mecanismo fica
  disponível na state machine para quando uma tarefa real desses lotes pedir
  um botão equivalente a "Trocar destino" (ex.: "Trocar hospedagem"), evitando
  reabrir um bloqueio idêntico, mas sem expandir escopo além do que está
  declarado necessário hoje.
- A auditoria do Lote 3 (`SECURITY-REVIEW.md`) já havia sinalizado que
  `L11-T03` (sanitização de texto livre contra prompt injection) precisava
  concluir antes de qualquer tarefa que alimentasse
  `context.destination.name`/`accommodation.name` a partir de input real do
  usuário em `buildHospedagemPrompt`/`buildPasseiosPrompt`/
  `buildRoteiroPrompt` — mas `L11-T03` continuava só com `Depende de:
  L3-T02`, sem dependência reversa formal. Com L7-T03 (Lote 7) passando a
  persistir esse texto livre de verdade, o risco deixou de ser hipotético.
  Escalado como Bloqueio 003 (`.md/BLOCKERS.md`), resolvido pelo
  Coordenador: `L11-T03` ganhou dependência reversa explícita em
  `L8-T01`/`L9-T01`/`L10-T01` (Seção 3), sem mudar de ID/seção — só sua
  elegibilidade de execução foi antecipada para logo após `L3-T02` (Seção
  4), em vez de esperar a cadência normal do Lote 11. Decisão puramente de
  sequenciamento, sem impacto em nenhuma decisão arquitetural já registrada
  em ADR — não abriu novo ADR.
- `L11-T02` (guard central de autorização de dono de `TripSession`, SDD §7)
  encontrou que `TripSession` não registra o dono real do registro para
  nenhum dos dois mecanismos de identidade do projeto (cookie de sessão
  anônima, sem coluna equivalente; `userId` existente no schema mas nunca
  gravado por nenhum ponto de criação real, `createSessionWithDateRange`) —
  sem esse dado persistido, o guard pedido não tem contra o que comparar.
  Lacuna de modelo de dados, mesmo nível do Bloqueio 001 (ADR-006 Adendo 1),
  mas de domínio diferente (autorização/SDD §7, não orquestração de etapa).
  Escalado como Bloqueio 004 (`.md/BLOCKERS.md`), resolvido pelo Coordenador
  como ADR-008 (novo ADR, não adendo ao ADR-006 — escopo distinto): novo
  campo `anon_session_id` em `TripSession`, dono resolvido pelo chamador
  (conta autenticada tem precedência sobre cookie anônimo quando ambos
  presentes) e gravado no momento da criação; guard sempre retorna 404 (nunca
  403) em divergência. `L11-T02` foi dividida em `L11-T02a` (persistência do
  dono — schema + `createSessionWithDateRange` + retrofit pontual de
  `L6-T03`/`L6-T05`/`L6-T07`, já `Concluída`s, para passar o novo `owner`) e
  `L11-T02` revisada (guard em si, dependente de `L11-T02a`) — ver nota de
  resolução completa na Seção 3, logo após a tabela do Lote 11. O retrofit
  dos 3 chamadores foi mantido DENTRO de `L11-T02a` (não virou tarefa própria
  por chamador) por inseparabilidade documentada: é a mesma mudança mecânica
  de contrato aplicada de forma idêntica nos 3 pontos de um único helper
  compartilhado, sem introduzir regra de negócio nova em nenhum deles.

**Lacuna estrutural encontrada na Validação Final de Confirmação pré-staging
(Bloqueio 006, resolvida em 2026-09-12, Coordenador):** mesma natureza do
Bloqueio 005 (padrão recorrente, não bug de tarefa isolada), agora no lado de
ENTRADA da jornada (T01-T05): `src/app/entrada/data-livre/page.tsx` (L6-T02),
`src/app/entrada/feriados/feriados-screen.tsx` (L6-T04) e
`src/app/entrada/quiz/page.tsx` (L6-T06) nunca chamam as Server Actions irmãs
já `Concluída`s (`submeterDataLivre`/`processarFeriadoEscolhido`/
`submitQuizAnswers`, L6-T03/T05/T07) — cada uma documentou a integração como
"fora de escopo, aguardando a Server Action irmã" no momento em que foi
implementada, e nenhuma tarefa posterior voltou para fechar o gap.
`src/app/destino/confirmacao/confirmacao-destino-client.tsx` (L7-T04) tem o
mesmo problema em T05: `confirmarDestino` (L7-T05) avança o `flowState` no
servidor, mas o `onConfirmar` nunca navega para `/hospedagem` depois —
diferente de `onTrocar`, no mesmo arquivo, que já navega corretamente.
Confirmado por leitura direta dos 4 arquivos antes de decompor (não das notas
de implementação).

**Decisão de decomposição — por que `Refatoração Lote-6`/`Refatoração
Lote-7`, não um lote novo (diferente do Lote 12/Bloqueio 005):** avaliei os
dois caminhos e, ao contrário do Bloqueio 005 (onde a peça faltante — rota +
Server Action de leitura — nunca pertenceu a nenhum lote específico,
atravessando 3 lotes de tela mais o Lote 11), aqui cada gap mora inteiramente
dentro de um arquivo já pertencente a um lote de origem único e já
`Concluída`: L6-T02/L6-T04/L6-T06 pertencem ao Lote 6, L7-T04 pertence ao
Lote 7. Não é necessária nenhuma Server Action nova (as 4 já existem e já
passaram por validação própria) nem nenhuma rota nova (as 4 rotas de destino
já existem desde os Lotes 7/12) — é só terminar a conexão dentro de um
componente que já existe, no lote a que ele já pertence. Isso é exatamente o
padrão que `Refatoração Lote-N` já cobre no resto do `TASK.md` (corrigir algo
dentro do escopo de um lote já fechado), não o padrão do Lote 12 (ausência de
uma peça inteira sem lote de origem). Criadas: `RL6-T02`, `RL6-T03`, `RL6-T04`
(Seção 3, Refatoração Lote-6) e `RL7-T01` (Seção 3, nova seção Refatoração
Lote-7 — a primeira deste lote). Nenhuma das 4 tarefas mistura tela e Server
Action (todas consomem Server Actions já existentes, só conectam UI →
Server Action → navegação, mesma convenção de não-mistura do resto do
`TASK.md`) nem se aproxima do canário de ~300 mil tokens (cada uma toca 1
arquivo existente + eventualmente seu teste). Diferença em relação às demais
`Refatoração Lote-N` já registradas: estas 4 têm prazo crítico — bloqueiam a
promoção a staging do conjunto completo (Seção 4). `SDD.md`/`UX-SPEC.md`
inalterados (nenhuma decisão arquitetural/de experiência muda; é decomposição
de trabalho de wiring que já estava implícito na jornada navegável descrita
em ambos). Nenhum ADR novo. Ver `.md/BLOCKERS.md`, Bloqueio 006, para o
registro completo do achado e desta resolução.

## Rascunho de GUARDRAILS.md

Produzido junto com este TASK.md — ver `.md/GUARDRAILS.md`.
