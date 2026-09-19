# DEPLOY.md — Infraestrutura, CI/CD e Deploy

Autor: Validador (chapéu DevOps). Primeira chamada deste chapéu neste projeto —
preparação de infraestrutura e pipeline de CI/CD, em paralelo à implementação
dos lotes (não depende de nenhum lote específico estar concluído). Nenhum
deploy real ocorreu ainda; este documento cobre só a etapa de provisionamento
e configuração. O relatório de execução de deploy por ambiente (Gate 4) será
acrescentado a este mesmo arquivo numa chamada seguinte, depois da dupla
aprovação (QA + DevSecOps) do primeiro lote a ser publicado.

## 1. Decisões de infraestrutura tomadas nesta preparação

Duas escolhas de infraestrutura ficaram deliberadamente em aberto no `SDD.md`
(Seção 3) como "decisão de infraestrutura, não de arquitetura". Resolvidas
aqui, sem necessidade de novo ADR (o próprio SDD.md já delega essa decisão a
este nível):

- **Plataforma de hospedagem/deploy**: Vercel. Não é uma decisão nova — o
  `SDD.md` (Seção 3, linha "Hospedagem/Deploy") e o `GUARDRAILS.md` (regra 26,
  já aprovado pelo gestor) já nomeiam Vercel como a escolha de referência
  dentro da categoria "serverless compatível com Next.js"; regra 26 trava
  qualquer migração de hospedagem atrás de um novo ADR. Esta preparação apenas
  implementa o que já estava decidido.
- **Provedor de PostgreSQL gerenciado (Neon vs. Supabase vs. outro)**:
  mantido em aberto de propósito. A camada de acesso (Prisma) só depende de
  `DATABASE_URL`, então a escolha do provedor concreto é substituível sem
  qualquer mudança de IaC/pipeline — não há necessidade de travar isso agora.
  Recomendação registrada (não bloqueante): Neon, pela integração nativa com
  Vercel (branching de banco por preview deployment, útil para os ambientes
  de preview descritos abaixo). Quem efetivamente criar a conta/instância do
  banco (execução real, fora do escopo desta preparação) pode adotar essa
  recomendação ou trocá-la sem impacto em nenhum arquivo deste repositório.

Nenhum bloqueio foi registrado em `.md/BLOCKERS.md` — as duas questões acima
tinham decisão suficiente (a primeira já fixada em artefato aprovado; a
segunda comprovadamente não precisa de decisão prévia para a IaC avançar).

## 2. Ambientes

| Ambiente | Gatilho | Propósito |
|---|---|---|
| Desenvolvimento local | `npm run dev`, `.env` local (`.env.example`) | Loop de desenvolvimento do Executor |
| CI (efêmero) | Push/PR para `main` (`.github/workflows/ci.yml`, já existente) | Lint, teste, build contra um Postgres efêmero (serviço `postgres:16-alpine` do próprio job) — não é infraestrutura persistente |
| Preview (Vercel) | Deployment automático da Vercel por PR/branch (recurso nativo da integração Git da Vercel, fora deste repositório) | Validação manual/QA visual de uma branch antes do merge; cada preview roda com seu próprio alias de URL |
| Staging | `.github/workflows/deploy.yml` (`workflow_dispatch`, `environment: staging`) | Ambiente persistente pré-produção, mesma stack de produção, usado para a validação de release-readiness antes da promoção final |
| Produção | `.github/workflows/deploy.yml` (`workflow_dispatch`, `environment: production`), só depois da dupla aprovação QA + DevSecOps do lote | Ambiente público real |

Nenhum lote está marcado como publicado neste momento — a coluna acima descreve
a infraestrutura disponível, não um histórico de deploys (ver Seção 6).

## 3. Estrutura de IaC

Este projeto é um monólito Next.js serverless (SDD.md Seção 1/3); a "infra a
provisionar" é deliberadamente enxuta — não há VPC/servidores próprios a
descrever em Terraform, consistente com a justificativa de arquitetura do
SDD.md (reduzir custo operacional para o estágio de MVP). A IaC deste projeto
é declarativa via arquivo de configuração da própria plataforma serverless,
versionado no repositório:

- `vercel.json` (novo, raiz do repositório): configuração declarativa do
  projeto Vercel — framework, comando de build/install, região da função
  (`gru1`, São Paulo, mais próxima do público-alvo do produto), e headers de
  segurança aplicados a toda resposta (`X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` restritiva) — hardening de infraestrutura pedido pelo
  próprio escopo deste chapéu (Seção "Escopo e Responsabilidades" do
  `validador.md`), complementar (não substitui) o SAST/hardening de código do
  chapéu DevSecOps.
- `prisma/schema.prisma` + `prisma/migrations/` (já existente, mantido pelo
  Executor): a IaC do schema de banco em si — `npm run db:migrate` (`prisma
  migrate deploy`) é o comando que a pipeline de deploy deve rodar contra o
  banco do ambiente alvo antes de promover uma nova versão. Ainda não
  incorporado ao `deploy.yml` (ver Seção 6, lacuna sinalizada) porque isso
  exige a string de conexão real do banco de staging/produção, que só existe
  quando a conta do provedor de Postgres for de fato criada — fora do escopo
  desta preparação.
- Segredos (API key do OpenAI, string de conexão do banco, `NEXTAUTH_SECRET`):
  não versionados (GUARDRAILS.md regra 15); vivem como Environment Variables
  da Vercel (por ambiente — preview/staging/production podem ter valores
  diferentes) e como GitHub Actions Secrets (`VERCEL_TOKEN` e demais,
  escopados por GitHub Environment `staging`/`production` — ver Seção 4).
  `.env.example` continua sendo a fonte de verdade de quais variáveis existem
  (já mantido pelo Executor, sem necessidade de mudança nesta preparação).

## 4. Pipeline de CI/CD

Duas etapas, deliberadamente separadas (CI contínuo vs. CD gated), refletindo
o modelo de governança do projeto (deploy só após dupla aprovação por lote):

### 4.1 CI — `.github/workflows/ci.yml` (já existente, mantido sem alteração)

Roda em todo push/PR para `main`: instala dependências, aplica migrations
Prisma contra um Postgres efêmero do próprio job, lint, teste (`vitest run`),
build. Gate de qualidade contínuo, independente de lote/aprovação — não
publica nada.

### 4.2 CD — `.github/workflows/deploy.yml` (novo)

Disparo **manual** (`workflow_dispatch`), nunca automático em push — decisão
deliberada: o modelo deste projeto é deploy gated por lote com dupla aprovação
(QA + DevSecOps), não deploy contínuo a cada merge. Parâmetros do disparo:
`environment` (`staging`/`production`) e `ref` (branch/SHA já aprovado).
Passos: checkout do `ref` informado, `vercel deploy` (sem `--prebuilt`) via
Vercel CLI, autenticado por `VERCEL_TOKEN` (GitHub Secret, escopado ao
Environment do GitHub correspondente) e linkado ao projeto certo via
`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (também GitHub Secrets, evita que a CLI
tente adivinhar/criar um projeto novo).

**Decisão: build remoto (na Vercel), não local (no runner)** — tentativa
inicial usava `vercel pull` + `vercel build` + `vercel deploy --prebuilt`
(compilando no runner do GitHub Actions e só publicando o artefato pronto).
Essa abordagem quebrou porque `DATABASE_URL`/`NEXTAUTH_SECRET`/
`OPENAI_API_KEY` estão cadastradas na Vercel como variável tipo **Secret**
(antigo "Sensitive") — esse tipo só é decriptografado dentro da própria
infraestrutura de build/runtime da Vercel, nunca entregue a `vercel pull`
rodando fora dela (o CLI escreve `[SENSITIVE]` como placeholder). Resultado:
`DATABASE_URL` chegava vazia ao `npm run build` local, e o Prisma Client
falhava com `TypeError: Invalid URL` ao pré-renderizar `/`. Convertê-las para
o tipo **Config** resolveria sem mudar o workflow, mas exige apagar e
recriar cada variável (um valor tipo Secret não pode virar Config depois de
salvo) — decisão do dono do produto foi evitar mexer nessas credenciais reais
agora e resolver só no pipeline: `vercel deploy` sem `--prebuilt` faz upload
do código-fonte e builda remotamente na Vercel, onde essas variáveis
funcionam normalmente. Trade-off aceito: o log de build (`next build`,
lint, prerender) deixa de aparecer no GitHub Actions e só fica visível no
dashboard da Vercel.

O ambiente `production` do GitHub Actions deve ter **"Required reviewers"**
configurado manualmente em Settings > Environments do repositório (gate humano
adicional — quem aprova ali é o Validador confirmando que já registrou a dupla
aprovação em `QA-REPORT.md`/`SECURITY-REVIEW.md` antes de rodar o workflow).
Essa configuração não é versionável em YAML — fica registrada aqui como
pré-requisito operacional a ser feito uma única vez por quem tiver acesso de
admin ao repositório, antes do primeiro deploy real de produção.

### 4.3 Rollback — `.github/workflows/rollback.yml` (novo)

Disparo manual, recebe a URL de um deployment anterior (deployments da Vercel
são imutáveis) e o promove de volta ao alias do ambiente com `vercel
rollback`. Como não recria build, é rápido — mecanismo testável antes de
qualquer deploy real de produção (guardrail: nunca fazer deploy em produção
sem rollback testado). **Teste deste mecanismo ainda pendente**: só pode ser
exercitado de fato depois do primeiro deploy real (é preciso um deployment
anterior de fato existente para promover) — registrado como pré-requisito do
primeiro deploy de produção, não desta preparação.

## 5. Observabilidade

- **Hoje (via Vercel, sem configuração adicional)**: Runtime Logs (stdout/
  stderr de toda função serverless, incluindo erros não tratados) e métricas
  de infraestrutura básicas (latência de função, taxa de erro HTTP) já vêm
  ativas por padrão em todo projeto Vercel, disponíveis assim que o primeiro
  deploy real ocorrer — nenhuma configuração extra necessária.
- **Aplicacional (já coberto por decisão de arquitetura do Coordenador, fora
  deste chapéu)**: `LlmGenerationLog` (SDD.md Seção 5) registra tokens, custo
  estimado, latência e `retry_count` de toda chamada ao Gateway de IA — a
  peça de observabilidade mais crítica do produto (custo/alucinação, Seção 6
  do SDD.md) já está coberta pela camada de aplicação, não pela infra.
- **Recomendado como próximo passo, não implementado nesta preparação**:
  instrumentação de RUM (`@vercel/analytics` + `@vercel/speed-insights`) no
  `src/app/layout.tsx`, para métricas de uso real e Web Vitals sem PII. Uma
  tentativa de adicionar essas duas dependências foi feita e revertida nesta
  mesma sessão — o ambiente de instalação (`npm ci`/`npm install`) apresentou
  falhas repetidas de `ENOTEMPTY`/módulo não encontrado ao reinstalar
  `node_modules`, causadas por atividade concorrente de outro processo/agente
  sobre o mesmo `node_modules` (múltiplos `node.exe` ativos durante a
  tentativa) somada a sincronização do OneDrive sobre a pasta do projeto.
  Para não arriscar deixar `package.json`/`package-lock.json`/`node_modules`
  em estado inconsistente para quem estiver executando outro lote em
  paralelo, a mudança de código e de dependência foi revertida por completo
  (`src/app/layout.tsx` restaurado ao estado anterior a esta sessão, exceto a
  alteração de `themeColor` já em andamento pelo Executor antes desta
  chamada, que foi preservada). **Ação de acompanhamento**: rodar `npm ci` uma
  vez que não haja processo concorrente usando `node_modules` (verificar
  ausência de outro `next dev`/`vitest`/`npm install` ativo antes de tentar),
  confirmar que `node_modules/.bin` fica populado, then adicionar
  `@vercel/analytics`/`@vercel/speed-insights` e a instrumentação em
  `layout.tsx` como uma tarefa pontual — não é um bloqueio ao provisionamento
  de IaC/CI-CD em si, só ao passo específico de RUM.
- **Alertas**: não configurados nesta preparação — dependem de um provedor de
  Postgres real escolhido (Seção 1) para alertar sobre esgotamento de conexão/
  armazenamento; ficam para quando a conta do provedor for criada.

## 6. Lacunas conhecidas / pendências desta preparação

- `deploy.yml` ainda não roda `prisma migrate deploy` contra o banco do
  ambiente alvo antes de promover a nova versão — falta a string de conexão
  real de staging/produção (depende da criação da conta do provedor de
  Postgres, fora do escopo desta preparação). Sinalizado aqui para quem
  configurar o primeiro deploy real: adicionar um step `npm run db:migrate`
  (com `DATABASE_URL` do ambiente-alvo) antes do `vercel deploy`.
  Contorno: **não é um bloqueio a esta preparação** (a definição de PWA/CI/CD
  em si não depende disso), mas impede um deploy real completo até ser
  resolvido — não confundir com o registro `.md/BLOCKERS.md`, que é reservado
  a inconsistências entre agentes/artefatos, não a passos de execução futura
  já previstos.
- Instrumentação de RUM (`@vercel/analytics`/`@vercel/speed-insights`) não
  aplicada nesta sessão — ver Seção 5.
- **Atualizado 2026-09-17 (Tentativa 4)**: o `deploy.yml` (`vercel deploy`
  sem `--prod`/`--target`) publica sempre um deployment tipo Preview,
  protegido por Vercel Deployment Protection (SSO) — o parâmetro
  `environment: staging` do `workflow_dispatch` não promove/alia a
  nenhum domínio staging estável e acessível sem login. Ver Seção 7,
  "Tentativa 4", e `.md/BLOCKERS.md` Bloqueio 012 (severidade baixa,
  aberto).

## 7. Histórico de deploys

### Tentativa 1 — Staging, 2026-09-12 (Validador, chapéu DevOps, Comando 3/EXECUTION-FLOW.md)

**Contexto**: Validação Final de Confirmação (2ª tentativa, pré-staging) já
havia liberado os 12 lotes com dupla aprovação (QA + DevSecOps) registrada em
`.md/QA-REPORT.md`/`.md/SECURITY-REVIEW.md`, e `.md/BLOCKERS.md` sem nenhuma
entrada `Aberto`. Esta tentativa cobriu os 4 pontos pedidos: verificação de
pré-requisitos, disparo real do workflow, checagem de observabilidade e de
RNFs relevantes ao ambiente.

**Resultado: deploy real NÃO publicado. Bloqueio operacional de
infraestrutura genuíno, não simulável por este agente** — ver detalhamento.

**O que foi de fato executado (não documentado, executado)**:

1. Confirmação de pré-requisitos via `gh api`/`gh secret list` contra o
   repositório real (`leandrosegheto17/curtamais`):
   - GitHub Environment `staging`: **não existia** antes desta tentativa
     (`gh api repos/.../environments` retornava `total_count: 0`). Foi
     criado implicitamente pelo próprio GitHub no momento do primeiro
     `workflow_dispatch` que o referenciou — sem nenhuma regra de proteção e
     **sem nenhum secret associado**.
   - `VERCEL_TOKEN`: **não existe** como secret, nem no repositório
     (`gh secret list` só lista `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`
     — resíduo de uma decisão de infraestrutura anterior, não relacionado à
     Vercel) nem no Environment `staging`.
   - Não existe `.vercel/` local nem qualquer evidência de um projeto Vercel
     de fato criado/linkado a este repositório.
   - `DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY` reais (staging):
     inexistentes em qualquer secret manager acessível — só o template em
     `.env.example` (valores de placeholder). Consistente com a Seção 1: o
     provedor de PostgreSQL gerenciado nunca foi de fato escolhido/criado
     (decisão deliberadamente deixada em aberto na preparação de IaC).
   - Conclusão: **nenhum dos três pré-requisitos operacionais reais existe**
     — nem conta/projeto Vercel, nem banco Postgres gerenciado, nem os
     secrets correspondentes em GitHub. Isso não é uma lacuna de
     configuração trivial corrigível por este agente: requer criar contas
     reais (Vercel, provedor de Postgres) e gerar/copiar credenciais que só
     existem depois dessa criação — ação humana fora do alcance de um agente
     que não tem (e não deve ter) acesso a criar contas de terceiros/cartão
     de cobrança em nome do usuário.
   - `git push`: os arquivos de pipeline preparados anteriormente
     (`deploy.yml`, `rollback.yml`) e este próprio `DEPLOY.md` estavam
     **untracked**, nunca commitados/publicados em `main` — o que por si só
     impedia `workflow_dispatch` (`HTTP 404: workflow deploy.yml not found
     on the default branch`). Corrigido nesta sessão: commit
     `f97615c` (`git push origin main`), escopado só a esses 3 arquivos —
     nenhuma mudança de código de lote foi tocada/commitada por este agente.
2. Disparo real do workflow (não simulado): `gh workflow run deploy.yml
   --repo leandrosegheto17/curtamais -f environment=staging -f ref=main`
   → run [`34722166920`](https://github.com/leandrosegheto17/curtamais/actions/runs/34722166920).
   Resultado real observado (não hipotético): `Checkout`/`Setup Node`/
   `Install dependencies`/`Install Vercel CLI` **passaram**; o step "Pull
   configuração do ambiente Vercel" **falhou** com o comando executado
   sendo literalmente `vercel pull --yes --environment=preview --token=`
   (token vazio) e a mensagem de erro `Error: You defined "--token", but
   it's missing a value` — prova direta, em log real de CI, de que
   `secrets.VERCEL_TOKEN` não existe. Run concluído com `Process completed
   with exit code 1`.
3. **Observabilidade (chapéu DevOps)**: `LlmGenerationLog`
   (`prisma/schema.prisma`, já `Concluída` desde L3-T04,
   `src/lib/gateway-ia/generation-log.ts`) confirmado presente e integrado
   ao Gateway de IA — pronto para captar tokens/custo/latência/retry assim
   que houver um banco real conectado. Runtime Logs/métricas nativas da
   Vercel (Seção 5) dependem inteiramente de um deploy real já ter ocorrido
   num projeto Vercel real — como nenhum projeto existe, **não há nada
   ainda para "estar pronto"** além do já documentado na Seção 5: a
   observabilidade de infraestrutura só passa a existir no instante em que
   o primeiro `vercel deploy` bem-sucedido ocorrer contra um projeto real.
   RUM (`@vercel/analytics`) continua pendente, sem mudança desde a Seção 5.
4. **RNFs relevantes a staging (`PRD-TECNICO.md`)**: RNF-02 (tempo de
   resposta por etapa), RNF-05 (tratamento de falha do LLM), RNF-06 (LGPD em
   dado persistido), RNF-04 (responsividade) já têm cobertura **de código**
   validada pelo QA por lote (`.md/QA-REPORT.md`). O que **não pôde ser
   validado nesta tentativa**, por depender de um ambiente de fato no ar, é
   o comportamento *observado em staging real*: latência real do provider
   de LLM a partir da região `gru1`, comportamento de conexão/criptografia
   real do Postgres gerenciado (RNF-06), e Web Vitals reais (RNF-03/04) —
   nenhum desses é verificável sem a infraestrutura provisionada. RNF-07
   (cálculo de feriado determinístico, sem LLM) não depende de infra e
   permanece validado desde o lote de origem.

**Pendências operacionais exatas para publicar staging de fato** (ação
humana, fora do alcance deste agente):
1. Criar conta/projeto na Vercel (ou confirmar que já existe uma e apenas
   linkar este repositório) e gerar um `VERCEL_TOKEN` (Vercel → Account
   Settings → Tokens).
2. Criar uma instância de PostgreSQL gerenciado (recomendação já registrada
   na Seção 1: Neon, pela integração nativa com branching por preview da
   Vercel) e obter a `DATABASE_URL` real de staging.
3. Gerar um `NEXTAUTH_SECRET` real (`openssl rand -base64 32`) e obter uma
   `OPENAI_API_KEY` real de produção/staging (hoje só há placeholder em
   `.env.example`).
4. Configurar essas 3 variáveis como Environment Variables do projeto
   Vercel, escopadas ao ambiente correspondente (`vercel env add
   DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY`, ou pela UI web).
5. Cadastrar `VERCEL_TOKEN` como GitHub Secret escopado ao Environment
   `staging` do repositório (`gh secret set VERCEL_TOKEN --env staging
   --repo leandrosegheto17/curtamais`, ou Settings > Environments > staging
   > Environment secrets, na UI web) — o Environment `staging` já existe
   (criado nesta tentativa), só falta o secret.
6. Adicionar ao `deploy.yml` um step `npm run db:migrate` (`prisma migrate
   deploy`) contra a `DATABASE_URL` real do ambiente-alvo antes do `vercel
   deploy` (lacuna já sinalizada na Seção 6, ainda não incorporada ao
   workflow porque dependia justamente do item 2 acima).
7. Depois dos itens 1-6 resolvidos, re-disparar: `gh workflow run deploy.yml
   --repo leandrosegheto17/curtamais -f environment=staging -f ref=main` (ou
   `Actions > Deploy > Run workflow` na UI web) e então testar o
   `rollback.yml` (Seção 4.3) antes de qualquer promoção a produção.

**Status desta tentativa**: `Bloqueado (infraestrutura operacional
ausente)`. Nenhuma tarefa `Concluída` foi revertida — o gap não é de código
(todo o código dos 12 lotes já foi aprovado pela dupla QA + DevSecOps), é
puramente de infraestrutura/conta nunca provisionada, consistente com o que
a Seção 1 já registrava como decisão deliberadamente aberta. Registrado
também em `.md/BLOCKERS.md` (Bloqueio 007), escalado ao gestor — criar
conta/billing em serviços de terceiros é decisão de negócio, não técnica.

### Tentativa 2 — Staging, 2026-09-12 (Validador, chapéu DevOps, Comando 3/EXECUTION-FLOW.md)

**Contexto**: Bloqueio 007 marcado `Resolvido` — usuário provisionou projeto
Vercel linkado ao repositório, domínio `destino-ideal-ljs.vercel.app`
configurado manualmente na Vercel, banco Postgres real no Neon (`sa-east-1`),
os 4 secrets (`VERCEL_TOKEN`, `DATABASE_URL`, `NEXTAUTH_SECRET`,
`OPENAI_API_KEY`) cadastrados no GitHub Environment `staging`, as mesmas 3
variáveis de app cadastradas na Vercel, e `deploy.yml` (commit `f17b0a0`)
ganhou o step de `prisma migrate deploy`. Esta tentativa foi a execução real
do deploy, não mais uma checagem de pré-requisitos.

**Resultado: deploy real NÃO publicado. Progresso confirmado (migration
passou), mas falha nova, específica do `VERCEL_TOKEN` — ver detalhamento.**

**O que foi de fato executado**:

1. Disparo real: `gh workflow run deploy.yml --repo leandrosegheto17/curtamais
   -f environment=staging -f ref=main` → run
   [`34724116900`](https://github.com/leandrosegheto17/curtamais/actions/runs/34724116900).
2. Acompanhamento via `gh run watch` até a conclusão real (não hipotética):
   - `Checkout ref aprovado` / `Setup Node` / `Install dependencies`:
     **passaram**.
   - `Aplicar migrations Prisma no banco do ambiente-alvo`: **passou** —
     primeira evidência real de que `prisma migrate deploy` roda com sucesso
     contra o Neon real usando `secrets.DATABASE_URL` (progresso genuíno
     desde a Tentativa 1, onde nem sequer chegava a este step).
   - `Install Vercel CLI`: **passou** (Vercel CLI 59.16.0).
   - `Pull configuração do ambiente Vercel`: **falhou**. Log real do step
     (`gh run view 34724116900 --log`):
     ```
     vercel pull --yes --environment=preview --token=***
     Vercel CLI 59.16.0 (Node.js 20.20.2)
     Loading teams…
     Error: User not found.
     ##[error]Process completed with exit code 1.
     ```
   - `Build (Vercel)`, `Deploy (Vercel)`, `Registrar deployment_url para o
     relatório`: não executados (job interrompido no step anterior).
   - Run concluído: `completed / failure`, ~53s de duração.
3. **Causa raiz identificada por leitura direta do log (não suposição)**: o
   comando passou um token não vazio (diferente da Tentativa 1, onde o erro
   era literalmente `--token=` sem valor) — desta vez a CLI chega a
   autenticar a chamada e falha em "Loading teams…" com `Error: User not
   found.`. Esse erro é específico do lado da Vercel (não do workflow): o
   valor cadastrado em `secrets.VERCEL_TOKEN` no Environment `staging` não
   corresponde a nenhuma conta/usuário válido na Vercel no momento da
   chamada — consistente com um token expirado, revogado, digitado
   incorretamente ao cadastrar o secret, ou gerado para uma conta diferente
   da que tem o projeto `destino-ideal-ljs` linkado. Não é um problema de
   nome de secret (`gh secret list --env staging` confirma que
   `VERCEL_TOKEN` existe, criado em `2026-09-12T22:30:58Z`, antes deste
   run) nem de posição no workflow (`vercel pull` é chamado corretamente
   depois de `Install Vercel CLI`). Este Validador não tem acesso ao valor
   do secret nem deve manuseá-lo — só pode reportar o sintoma observado no
   log.
4. **Checagem do domínio já configurado manualmente**: `curl -sI
   https://destino-ideal-ljs.vercel.app` retornou `HTTP/1.1 200 OK` (headers
   `Server: Vercel`, `X-Vercel-Cache: HIT`, `X-Vercel-Id: gru1::...`). **Isto
   não é evidência de que este deploy funcionou** — o job falhou antes de
   chegar em `Deploy (Vercel)`, então nenhuma versão nova foi publicada por
   este run. O `200 OK` reflete um deployment pré-existente no domínio
   (provavelmente o projeto default criado pela própria Vercel ao linkar o
   repositório, ou um deploy manual anterior do usuário), não o conteúdo dos
   12 lotes aprovados neste ciclo. Não dá para confirmar, sem acesso ao
   dashboard, se esse conteúdo já corresponde ao `main` atual ou é um
   placeholder anterior.

**Pendência operacional exata para publicar staging de fato** (ação humana,
fora do alcance deste agente): regenerar o `VERCEL_TOKEN` — em Vercel →
Account Settings → Tokens, criar um novo token válido para a conta que tem
o projeto `destino-ideal-ljs` linkado (confirmar que é a mesma conta que
possui o projeto, não uma conta/time diferente) — e recadastrá-lo com `gh
secret set VERCEL_TOKEN --env staging --repo leandrosegheto17/curtamais`
(sobrescreve o valor atual, mesmo nome/secret). Depois disso, re-disparar:
`gh workflow run deploy.yml --repo leandrosegheto17/curtamais -f
environment=staging -f ref=main`.

**Observabilidade/RNFs**: sem novidade em relação à Tentativa 1 — como o
job não chegou a `Deploy (Vercel)`, nenhuma métrica/log nativo da Vercel
passou a existir para esta versão específica; `LlmGenerationLog` continua
pronto do lado da aplicação, sem mudança.

**Status desta tentativa**: `Bloqueado (VERCEL_TOKEN inválido/expirado)`.
Progresso real desde a Tentativa 1: infraestrutura (Vercel, Neon, secrets,
step de migration) confirmadamente existe e a migration roda com sucesso —
o único ponto de falha restante é a validade do próprio token. Nenhuma
tarefa `Concluída` revertida. Registrado em `.md/BLOCKERS.md` (Bloqueio
008), escalado ao gestor em paralelo (ação sobre credencial de conta
de terceiro, fora do alcance de qualquer agente) — não é redesenho de
infraestrutura nem de arquitetura, só regeneração de credencial.

### Tentativa 3 — Staging, 2026-09-15 (Validador, chapéu DevOps, Comando 3/EXECUTION-FLOW.md)

**Contexto**: usuário reportou ter regenerado o `VERCEL_TOKEN` em Vercel →
Account Settings → Tokens e recadastrado via `gh secret set VERCEL_TOKEN
--env staging`, endereçando a causa raiz apontada na Tentativa 2 (Bloqueio
008, status `Causa raiz endereçada pelo usuário (não re-verificado)`).
Esta tentativa é o disparo real que deveria confirmar (ou não) essa
correção.

**Resultado: deploy real NÃO publicado de novo — mesmo sintoma exato da
Tentativa 2 (`Error: User not found.`), com evidência adicional de que o
secret no GitHub nunca foi de fato atualizado.**

**O que foi de fato executado**:

1. Disparo real: `gh workflow run deploy.yml --repo leandrosegheto17/curtamais
   -f environment=staging -f ref=main` → run
   [`35032873650`](https://github.com/leandrosegheto17/curtamais/actions/runs/35032873650).
2. Acompanhamento via `gh run watch --exit-status` até a conclusão real:
   - `Checkout ref aprovado` / `Setup Node` / `Install dependencies` /
     `Aplicar migrations Prisma no banco do ambiente-alvo` / `Install
     Vercel CLI`: **passaram** (mesmo padrão da Tentativa 2 — infra e
     migration seguem saudáveis).
   - `Pull configuração do ambiente Vercel`: **falhou de novo**, ~49s de
     duração total do job. Log real (`gh run view 35032873650 --log`):
     ```
     vercel pull --yes --environment=preview --token=***
     Vercel CLI 59.17.0 (Node.js 20.20.2)
     Loading teams…
     Error: User not found.
     ##[error]Process completed with exit code 1.
     ```
     Erro idêntico, literalmente, ao da Tentativa 2 — não é uma variação
     nova, é a mesma falha.
   - `Build (Vercel)`, `Deploy (Vercel)`, `Registrar deployment_url para o
     relatório`: não executados (job interrompido no mesmo step de novo).
   - Run concluído: `completed / failure`.
3. **Achado adicional, por leitura direta (não suposição)**: `gh secret
   list --env staging --repo leandrosegheto17/curtamais` mostra
   `VERCEL_TOKEN  2026-09-12T22:30:58Z` — **o mesmo timestamp exato**
   registrado na Tentativa 2 (antes da suposta regeneração/recadastro do
   usuário). Se o `gh secret set VERCEL_TOKEN --env staging` reportado
   pelo usuário tivesse sido executado com sucesso contra este
   repositório/ambiente, o timestamp teria mudado (GitHub atualiza
   `updated_at` a cada `secret set`, mesmo mantendo o mesmo nome). Isso é
   evidência direta, não inferência especulativa sobre a causa do erro em
   si: **o valor do secret `VERCEL_TOKEN` no GitHub Environment `staging`
   deste repositório não foi alterado desde 2026-09-12T22:30:58Z** —
   consistente com o erro idêntico observado. Não há como este Validador
   confirmar, sem acesso ao lado da Vercel, se o token foi de fato
   regenerado lá; só pode reportar que, do lado do GitHub, nada mudou.
4. **Checagem do domínio**: não repetida nesta tentativa — sem alteração
   de estado desde a Tentativa 2 (o job segue falhando antes de `Deploy
   (Vercel)`, então nenhuma versão nova foi publicada).

**Causa provável mais específica que a da Tentativa 2** (achado, não
decisão de correção — este Validador não deve manusear o valor do
secret): o passo `gh secret set VERCEL_TOKEN --env staging --repo
leandrosegheto17/curtamais` relatado pelo usuário não chegou a
efetivamente sobrescrever o secret neste repositório/ambiente — por
exemplo, rodado no diretório/repositório errado, contra um Environment
diferente de `staging`, com autenticação `gh` para outra conta/organização
sem permissão de escrita nesse secret (falha silenciosa comum do `gh
secret set` quando falta permissão), ou o comando nunca chegou a ser
executado de fato apesar do relato. Recomenda-se ao usuário: (a)
re-executar `gh secret set VERCEL_TOKEN --env staging --repo
leandrosegheto17/curtamais` e, em seguida, imediatamente `gh secret list
--env staging --repo leandrosegheto17/curtamais` para confirmar que o
timestamp de `VERCEL_TOKEN` mudou antes de pedir um novo disparo deste
workflow; (b) confirmar que o valor colado é o token gerado na conta
Vercel correta (a que tem o projeto `destino-ideal-ljs` linkado), sem
espaços/quebras de linha extras.

**Observabilidade/RNFs**: sem novidade em relação às Tentativas 1-2 — como
o job não chegou a `Deploy (Vercel)`, nenhuma métrica/log nativo da Vercel
passou a existir para esta versão específica; `LlmGenerationLog` continua
pronto do lado da aplicação, sem mudança. Bloqueio 009 (`NO_SECRET`/rota
`/api/diag`) segue não confirmado nem infirmado — não foi possível chegar
a testar a aplicação real nesta tentativa.

**Status desta tentativa**: `Bloqueado (VERCEL_TOKEN — secret no GitHub
não foi de fato atualizado, apesar do relato em contrário)`. Nenhum
progresso adicional em relação à Tentativa 2 (mesmo erro, mesmo
timestamp de secret). Nenhuma tarefa `Concluída` revertida. Bloqueio 008
em `.md/BLOCKERS.md` **mantido em aberto** (não reclassificado como
`Resolvido`), com a evidência do timestamp inalterado acrescentada,
escalado ao gestor em paralelo — segue sendo ação sobre credencial de
conta/infraestrutura de terceiro, fora do alcance de qualquer agente
corrigir diretamente.

### Tentativa 4 — Staging, 2026-09-17 (Validador, chapéu DevOps)

**Contexto**: entre a Tentativa 3 e esta chamada, o `deploy.yml` foi
corrigido diretamente pelo usuário/outra sessão (fora do fluxo
`/executar`), commits `15e9264` (`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`
passados explicitamente ao `vercel pull`/`vercel deploy`, para linkar o
projeto certo em vez de depender só do `VERCEL_TOKEN`) e `43ce275`
(troca de `vercel build` local + `vercel deploy --prebuilt` para `vercel
deploy` sem `--prebuilt`, buildando remotamente na própria Vercel — ver
justificativa completa já registrada na Seção 4.2, "Decisão: build
remoto"). Essa correção **já havia sido confirmada bem-sucedida duas
vezes nesta mesma data**, antes desta chamada:

- Run [`35244784239`](https://github.com/leandrosegheto17/curtamais/actions/runs/35244784239)
  — `success`, contra o commit `810be02`.
- Run [`35251451753`](https://github.com/leandrosegheto17/curtamais/actions/runs/35251451753)
  — `success`, contra o mesmo `810be02`.

Essas duas são a primeira confirmação real, em log de CI, de que o
pipeline completo (`Checkout` → `migrations` → `Install Vercel CLI` →
`Deploy (Vercel)`) roda do início ao fim sem falhar — resolvendo, de
fato, o Bloqueio 008 (`VERCEL_TOKEN`) que travou as Tentativas 2 e 3.
Nenhuma das duas, porém, cobria o commit mais recente de `main`
(`87207bc`, que inclui V2-L4-T05 e fecha o backlog V2.0) nem havia sido
registrada aqui ainda.

**Disparo desta chamada**: `gh workflow run deploy.yml --repo
leandrosegheto17/curtamais -f environment=staging -f ref=main` → run
[`35255545544`](https://github.com/leandrosegheto17/curtamais/actions/runs/35255545544),
contra o commit `87207bc` (confirmado via `git log -1 --oneline main`
antes do disparo).

**Resultado: job concluído com `success` (2m10s) — todos os steps
passaram** (`Checkout ref aprovado`, `Setup Node`, `Install
dependencies`, `Aplicar migrations Prisma no banco do ambiente-alvo`,
`Install Vercel CLI`, `Deploy (Vercel)`, `Registrar deployment_url para
o relatório`), acompanhado via `gh run watch --exit-status` do início ao
fim (não presumido). Log real de `Deploy (Vercel)` (`gh run view
35255545544 --log`) confirma build remoto completo na Vercel (`npm ci`,
`prisma generate`, `next build`, `Build Completed in /vercel/output
[1m]`) e publica a URL:

```
https://destinoideal-er0dtuckj-leandrosegheto17s-projects.vercel.app
```

**Achado novo, não bloqueante ao deploy em si, mas relevante à
Seção 4.2/6 (lacuna de design do pipeline)**: `curl -sI` nessa URL
retornou `HTTP/1.1 302 Found`, redirecionando para
`https://vercel.com/sso-api?...` — **Vercel Deployment Protection
(SSO)**, não um erro do build. Mesmo padrão confirmado nas duas URLs das
execuções de sucesso anteriores hoje (`destinoideal-5ir06zi40-...` e
`destinoideal-k5nrwxcly-...`, ambas também `302` ao SSO). Causa raiz,
por leitura direta do próprio log da Vercel CLI (não suposição): o
comando `vercel deploy` do `deploy.yml`, sem `--prod`/`--target
staging`, sempre cria um deployment do tipo **Preview** — a própria CLI
confirma isso na última linha do log: `To deploy to production
(destino-ideal-ljs.vercel.app), run 'vercel --prod'`. Deployments
Preview deste projeto têm proteção SSO ativada por padrão (nível de
projeto na Vercel, fora deste repositório), então a URL de cada disparo
do workflow é, hoje, inacessível sem login na conta Vercel — o parâmetro
`environment: staging` do `workflow_dispatch` **não** promove/alia o
resultado ao domínio "staging" real (`destino-ideal-ljs.vercel.app`);
ele só rotula o GitHub Environment usado para os secrets, não afeta o
comando `vercel deploy` executado.

Verificação em separado, para não confundir os dois: `curl -sI
https://destino-ideal-ljs.vercel.app` retornou `HTTP/1.1 200 OK`, e o
conteúdo já contém o texto exato do CTA de `ExamplePreviewSection`
("Ver o roteiro de exemplo completo", `src/components/home/example-preview-section.tsx`,
tarefa V2-L4-T05) — ou seja, esse domínio já reflete `87207bc`. Isso
**não é evidência de que esta run publicou nele**: por design (linha
acima), o `deploy.yml` nunca chega a tocar esse domínio. O conteúdo
provavelmente veio da integração Git nativa da Vercel (deploy automático
de produção a cada push em `main`, fora deste repositório/workflow,
como já registrado na Seção 3), não deste pipeline manual. Não
confirmável sem acesso ao dashboard da Vercel.

**Conclusão desta tentativa**: o pipeline de CI/CD em si está **saudável
e correto de ponta a ponta** (3 sucessos consecutivos hoje, incluindo
este, contra o commit mais recente de `main`) — o objetivo operacional
do disparo foi cumprido. O HTTP 200 pedido não foi confirmável na URL
que este workflow de fato publica, por proteção de acesso (SSO) alheia
ao build, não por falha de deploy; o HTTP 200 real observado
(`destino-ideal-ljs.vercel.app`) pertence a um caminho de publicação
diferente (Git integration nativa), fora do escopo deste `deploy.yml`.
Não é um bloqueio de severidade alta — não impede validação funcional
via login na Vercel — mas é uma lacuna de design a corrigir: adicionar
`--target staging`/promoção de alias ao `deploy.yml` (ou desativar
Deployment Protection para o ambiente staging) para que o parâmetro
`environment: staging` do workflow realmente publique num domínio
estável e acessível sem login, em vez de uma URL de preview efêmera
protegida. Registrada como nova lacuna na Seção 6; não escalada como
bloqueio crítico (não é achado de segurança nem impede o merge/validação
dos lotes) — fica como tarefa de ajuste de pipeline para a próxima vez
que o chapéu DevOps deste Validador for chamado, sem necessidade de
reabrir o `coordenador`.

**Observabilidade/RNFs**: primeira vez que um deploy real chega a
`Deploy (Vercel)` com sucesso contra o Postgres/projeto Vercel reais —
Runtime Logs e métricas nativas da Vercel (Seção 5) já existem para
esta versão a partir de agora, disponíveis no dashboard (fora do
alcance de `curl`/`gh` para confirmar aqui). `LlmGenerationLog`
continua pronto do lado da aplicação, sem mudança.

**Status desta tentativa**: `Sucesso (pipeline saudável; achado de
design registrado — proteção SSO impede validação HTTP direta da URL
de preview publicada por este workflow)`. Nenhuma tarefa `Concluída`
revertida. Bloqueio 008 em `.md/BLOCKERS.md` pode ser reclassificado
para `Resolvido` (três sucessos reais confirmam o `VERCEL_TOKEN` válido
e o pipeline funcional) — atualização feita nesta mesma chamada.

### Deploy em Produção — 2026-09-17 (disparado pelo usuário)

**Contexto**: com o staging confirmado (Tentativa 4, run `35255545544`,
sucesso), o usuário confirmou explicitamente que queria publicar em
produção e disparou o comando diretamente: `gh workflow run deploy.yml
--repo leandrosegheto17/curtamais -f environment=production -f
ref=main`, contra o commit `5bf0bfb` (`87207bc` + documentação do
deploy de staging).

**Resultado: FALHOU — `DATABASE_URL` vazia, ambiente `production` sem
nenhum secret cadastrado no GitHub.**

Run [`35256502319`](https://github.com/leandrosegheto17/curtamais/actions/runs/35256502319)
acompanhado até a conclusão real (`gh run watch`/`gh run view --log-failed`):
`Checkout`/`Setup Node`/`Install dependencies` passaram; falhou no step
seguinte, "Aplicar migrations Prisma no banco do ambiente-alvo":

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Error validating datasource `db`: You must provide a nonempty URL.
The environment variable `DATABASE_URL` resolved to an empty string.
```

**Causa raiz confirmada** (`gh secret list --env <nome>` contra as 4
variações de Environment de produção existentes no repositório —
`production`, `Production`, `Production – curtamais`, `Production –
destinoideal`, listadas via `gh api repos/.../environments`): **nenhuma
tem nenhum secret cadastrado**. Só o Environment `staging` tem os 6
secrets (`DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY`/
`VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`) — produção nunca foi
provisionada com credenciais próprias, só staging (Bloqueios 007/008).

**Por que ter as variáveis configuradas na Vercel não resolve isto**
(dúvida levantada pelo dono do produto, vale registrar): os segredos
deste projeto vivem em dois lugares distintos, com propósitos distintos
(Seção 3, item "Segredos") — **Environment Variables da Vercel**
(escopadas Production/Preview) são o que a APLICAÇÃO usa quando builda
e roda; **GitHub Environment Secrets** (escopados `staging`/`production`)
são o que o WORKFLOW usa. O step que falhou (`npm run db:migrate`) roda
no runner do GitHub Actions, antes de qualquer coisa chegar na Vercel —
lê `secrets.DATABASE_URL` do GitHub, não a variável homônima da Vercel.
As variáveis da Vercel para Production seguem válidas e necessárias (é
delas que o build remoto se alimenta, Seção 4.2); elas só não participam
deste step.

**Pendência operacional exata** (ação humana, fora do alcance de
qualquer agente — requer os valores reais): o `deploy.yml` lê **apenas 4
secrets** (grep em `.github/workflows/deploy.yml`: `DATABASE_URL` L50,
`VERCEL_TOKEN` L60, `VERCEL_ORG_ID` L62, `VERCEL_PROJECT_ID` L63).
`NEXTAUTH_SECRET`/`OPENAI_API_KEY` estão cadastrados no Environment
`staging` por precaução histórica, mas **nunca são lidos pelo workflow**
— só importam do lado da Vercel. Logo, bastam estes 4 no GitHub
Environment `production` (nome exato, minúsculo — é o que o
`workflow_dispatch` usa):

```
gh secret set VERCEL_TOKEN --env production --repo leandrosegheto17/curtamais
gh secret set VERCEL_ORG_ID --env production --repo leandrosegheto17/curtamais
gh secret set VERCEL_PROJECT_ID --env production --repo leandrosegheto17/curtamais
gh secret set DATABASE_URL --env production --repo leandrosegheto17/curtamais
```

Os 3 primeiros podem ser copiados idênticos de `staging` sem ressalva —
é o mesmo projeto Vercel. O único com decisão real de negócio é
`DATABASE_URL`: hoje existe um único banco Neon (`sa-east-1`), apontado
pelo secret de `staging` — ou seja, se produção reaproveitar o mesmo
valor, "staging" e "produção" passam a compartilhar o mesmo banco e os
mesmos dados reais de usuário, e todo deploy de staging roda migration
contra a base de produção. Recomendação (não decisão): criar um segundo
banco Neon para produção antes de publicar de fato. Depois de
cadastrados, confirmar com `gh secret list --env production --repo
leandrosegheto17/curtamais` antes de re-disparar `gh workflow run
deploy.yml -f environment=production -f ref=main`.

**Status desta tentativa**: `Bloqueado (GitHub Environment production
sem nenhum secret cadastrado)`. Nenhuma tarefa `Concluída` revertida —
não é achado de código, é infraestrutura de produção nunca provisionada.
Staging permanece publicado e saudável (Tentativa 4). Registrado em
`.md/BLOCKERS.md` (Bloqueio 013).

### Deploy em Produção — 2026-09-17, Segunda Tentativa (sucesso)

**Contexto**: o dono do produto cadastrou os 4 secrets faltantes no
GitHub Environment `production` (`VERCEL_TOKEN`/`VERCEL_ORG_ID`/
`VERCEL_PROJECT_ID` copiados de `staging`; `DATABASE_URL` — decisão
explícita: **reaproveitar o mesmo banco Neon de staging**, não criar um
banco separado para produção) e disparou de novo: `gh workflow run
deploy.yml --repo leandrosegheto17/curtamais -f environment=production
-f ref=main`, contra o commit `73287ff`.

**Resultado: SUCESSO — primeiro deploy real de produção deste
projeto.**

Run [`35260873990`](https://github.com/leandrosegheto17/curtamais/actions/runs/35260873990)
acompanhado até a conclusão real (`gh run watch --exit-status`): todos
os steps passaram, incluindo a migration Prisma (agora contra o mesmo
banco de `staging`, ver ressalva abaixo). `Deploy (Vercel)` rodou
`vercel deploy --prod` (`environment == 'production'` no `deploy.yml`
adiciona `--prod`) e a CLI confirmou:

```
Production      https://destinoideal-rjm1cycnn-leandrosegheto17s-projects.vercel.app
Aliased         https://destino-ideal-ljs.vercel.app
```

Diferente do deploy de staging (Preview, sempre protegido por SSO), um
deploy `--prod` é automaticamente aliado ao domínio de produção real do
projeto — confirmado por `curl -sI https://destino-ideal-ljs.vercel.app`:
**`HTTP/1.1 200 OK`**, e o corpo da resposta contém o texto exato do CTA
de `ExamplePreviewSection` ("Ver o roteiro de exemplo completo"),
confirmando que é o conteúdo deste commit (V2.0 completo), não um
deployment antigo.

**Ressalva registrada, não bloqueante**: `staging` e `production` agora
compartilham o mesmo banco Neon (decisão explícita do dono do produto,
não lacuna técnica) — todo deploy futuro de staging roda
`prisma migrate deploy` contra o banco que também serve produção, e
dado de teste/staging convive com dado real de usuário na mesma base.
Aceitável para este estágio do produto; recomendação (não decisão) para
quando o produto tiver usuários reais: provisionar um segundo banco
Neon dedicado a produção.

**Observabilidade**: Runtime Logs/métricas nativas da Vercel agora
existem para esta versão em produção (dashboard, fora do alcance de
`curl`/`gh`). `LlmGenerationLog` do lado da aplicação, sem mudança.

**Status desta tentativa**: `Sucesso`. Bloqueio 013 fechado
(`.md/BLOCKERS.md`). Produção publicada: MVP (Lotes 1-12) + V2.0
(Lotes V2-L1 a V2-L8) completos e ao vivo em
`https://destino-ideal-ljs.vercel.app`.

### Deploy em Produção — 2026-09-19 (V2-L9, confirmado pelo usuário)

- **Commit publicado:** `a3cddd29c942ba9a9510d09cf34ab59408aae7ed` (`main`), o mesmo já publicado em staging (run `35416037220`).
- **Run:** [`35416611642`](https://github.com/leandrosegheto17/curtamais/actions/runs/35416611642), `environment=production`, todos os passos `success` (`db:migrate`, `vercel deploy --prod`). Deployment `destinoideal-nuqtc76fc-leandrosegheto17s-projects.vercel.app`, aliado a `https://destino-ideal-ljs.vercel.app`.
- **Tentativa anterior:** run `35416484545` falhou no `Checkout ref aprovado` (SHA abreviado `a3cddd2` não é aceito pelo `actions/checkout`); nada foi migrado nem publicado. Reexecutado com o SHA completo. Para próximos disparos, usar SHA completo ou branch em `ref`.
- **Verificação HTTP:** `/` 200, `/entrar` 200, `/meus-roteiros` 307 para `/entrar?retorno=/meus-roteiros` (rota autenticada, comportamento esperado).
- **Lote publicado:** V2-L9 (checklist de bagagem e documentos), `Validado com ressalvas` (QA e DevSecOps aprovados; T17 editorial aprovada com ressalvas). Migration `20260918120000_v2_trip_checklist_marks` já estava aplicada no banco compartilhado desde o deploy de staging de 2026-09-19 (só cria tabela nova).
- **Ressalvas conhecidas em produção:** `Refatoração Lote-V2-L9` pendente (RL-T01 impressão do cabeçalho da tela salva; RL-T02 redação do critério da T13; RL-T03 rate limit de `marcarItemChecklist`). CI de `main` vermelho por 36 falhas de integração pré-existentes, independentes do L9.
- **Bloqueio 012 segue aberto:** o alias `destino-ideal-staging.vercel.app` (novo passo do `deploy.yml`) continua atrás de SSO da Vercel; requer desativar a Deployment Protection para Preview no painel (fora do repositório).
- **Rollback:** `rollback.yml`.
