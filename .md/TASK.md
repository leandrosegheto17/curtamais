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

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Status | Critério de aceite |
|---|---|---|---|---|---|---|---|
| L3-T01 | Client OpenAI GPT-4o-mini com JSON mode/structured outputs + interface interna abstrata do Gateway de IA (ADR-002) | BE | 1 dia | L1-T01, L1-T03 | L3-T05 | Concluída | Chamada de teste retorna JSON validado contra schema simples; API key só via env |
| L3-T02 | Prompt design + contexto acumulado por etapa (destino/hospedagem/passeios/roteiro) com JSON schema de saída por etapa (ADR-003); aplica o mecanismo de streaming decidido em SPIKE-01 (Route Handler + `ReadableStream`, ver Seção 2) | BE | 1 dia | L3-T01, SPIKE-01 (resolvido) | — | Não iniciada | Prompt de cada etapa documentado; schema de saída validado; mecanismo de streaming escolhido no spike aplicado |
| L3-T03 | Validação de plausibilidade de preço + grounding de data/calendário (ADR-003) | BE | 1 dia | L3-T02, L2-T01 | L3-T04 | Não iniciada | Resposta com preço fora de faixa plausível é rejeitada/reprocessada; datas geradas nunca conflitam com o range da sessão |
| L3-T04 | Retry único automático + tratamento de falha (timeout/erro/malformado) + escrita em `LlmGenerationLog` (ADR-004, RNF-05) | BE | 1 dia | L3-T02, L1-T02 | L3-T03 | Não iniciada | Falha simulada gera exatamente 1 retry automático; log gravado em sucesso e falha; erro exposto ao chamador após 2ª falha |
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

### Lote 4 — Orquestração de Sessão e Regra de Orçamento

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L4-T01 | State machine server-side — estados e transições (ADR-006): `entrada_selecionada` → `destino_pendente/confirmado` → `hospedagem_pendente/aprovada` → `passeios_pendente/aprovados` → `roteiro_pendente/aprovado` → `concluida`, com `encerrada_parcial` a partir de qualquer etapa aprovada | BE | 1 dia | L1-T02 | — | Transição inválida (pular etapa) é rejeitada; todos os estados do ADR-006 implementados |
| L4-T02 | Persistência de transição de etapa — aprovar/ajustar/encerrar grava `TripSession` + entidade filha correspondente (RF-09, RN-03) | BE | 1 dia | L4-T01, L1-T02 | L4-T03 | Aprovar uma etapa persiste a entidade filha certa; encerrar em qualquer ponto preserva o já aprovado (RN-03) |
| L4-T03 | Regra RF-10 — filtro/priorização de orçamento nas sugestões e mensagem de "opção mais barata" quando fora da faixa (RF-10.1/.2/.3) | BE | 1 dia | L4-T01 | L4-T02 | Com orçamento informado, sugestões fora da faixa não aparecem como prioritárias; sem opção na faixa, retorna a mais barata com flag de excedente; ausência de orçamento nunca bloqueia |

### Lote 5 — Design System Base (componentes compartilhados)

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L5-T01 | Tokens visuais (paleta, tipografia, Tailwind config) + `StepperProgress` (UX-SPEC §3) | FE | 1 dia | L1-T01 | — | Paleta semântica (sucesso/atenção/erro) definida; `StepperProgress` reflete estado vindo do servidor, nunca client-only |
| L5-T02 | `PriceRangeBadge` + `BudgetInsufficientBanner` (UX-SPEC §3/§4) | FE | 0.5 dia | L5-T01 | L5-T03, L5-T05 | Badge sempre com ícone + texto "aproximado"; banner nunca desabilita botões da tela |
| L5-T03 | `LoadingStream` + `ErrorRetryState` + `EmptyState` (UX-SPEC §3/§4); `LoadingStream` consome o stream via `fetch` + `ReadableStream.getReader()` (mecanismo decidido em SPIKE-01, ver Seção 2) | FE | 1 dia | L5-T01, SPIKE-01 (resolvido) | L5-T02, L5-T05 | `LoadingStream` renderiza conteúdo progressivo real (não spinner genérico) conforme mecanismo escolhido no spike; `aria-live="polite"` presente |
| L5-T04 | `SuggestionCard` (base para T04/T06/T07) | FE | 1 dia | L5-T01, L5-T02 | — | Estrutura visual idêntica entre os 3 usos, conteúdo variável, acessível por teclado |
| L5-T05 | PWA — Web App Manifest + Service Worker (ADR-001, RNF-04) | FE | 1 dia | L1-T01 | L5-T02, L5-T03 | App instalável; assets estáticos em cache; funciona offline apenas para shell da UI, não para geração de conteúdo |

### Lote 6 — Telas de Entrada (T00, T01, T02, T03a-d)

Nota de tamanho de lote: 7 tarefas, acima do alvo de 5-6 — justificativa: o
lote cobre 3 telas distintas (T00, T01, T02) mais o wizard T03, cada uma
exigindo separação UI/Server Action por não-mistura; reduzir abaixo de 7 só
seria possível violando a regra de não-mistura ou fundindo telas sem relação
funcional, o que o guardrail do Coordenador proíbe.

| ID | Título | Chapéu | Estimativa | Depende de | Paralelizável com | Critério de aceite |
|---|---|---|---|---|---|---|
| L6-T01 | T00 UI — 3 cartões de caminho de entrada + navegação | FE | 0.5 dia | L5-T01 | L6-T02, L6-T04, L6-T06 | 3 cartões com igual destaque visual, nenhum pré-selecionado; navega para T01/T02/T03a |
| L6-T02 | T01 UI — form de data livre + validação inline (RF-01.4) | FE | 1 dia | L5-T01 | L6-T01, L6-T04, L6-T06 | Erro de data final < inicial bloqueia avanço com mensagem junto ao campo, sem navegar |
| L6-T03 | T01 Server Action — processa range + destino opcional, decide próxima etapa (RF-01.2/.3) | BE | 1 dia | L4-T01, L4-T02, L6-T02 | L6-T05, L6-T07 | Sem destino → segue para etapa de destino (RF-04); com destino → registra como aprovado e segue para confirmação (RF-11) |
| L6-T04 | T02 UI — lista de feriados com emenda + destino opcional | FE | 1 dia | L5-T01, L2-T02 | L6-T01, L6-T02, L6-T06 | Emenda exibida por feriado (ex.: "Qui 12/06 → estende até Dom 15/06, 4 dias") |
| L6-T05 | T02 Server Action — processa feriado escolhido como range de datas (RF-02.3) | BE | 0.5 dia | L4-T01, L4-T02, L6-T04 | L6-T03, L6-T07 | Range resultante segue a mesma ramificação de RF-01.2/.3 |
| L6-T06 | T03a-d Quiz guiado — wizard de 4 perguntas com stepper e "Pular" (RF-03) | FE | 1.5 dia (ver Seção 6 — justificativa de tamanho) | L5-T01 | L6-T01, L6-T02, L6-T04 | 4 telas sequenciais, indicador "1 de 4"; "Pular" disponível em (b)/(c)/(d); período obrigatório |
| L6-T07 | T03 Server Action — gera range de datas sugerido a partir do período (priorizando feriado próximo compatível, RF-03.2) | BE | 1 dia | L4-T01, L4-T02, L2-T01, L6-T06 | L6-T03, L6-T05 | Range gerado é coerente com o período informado; se houver feriado prolongado compatível próximo, é priorizado |

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
