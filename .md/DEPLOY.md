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
Passos: checkout do `ref` informado, `vercel pull`/`vercel build`/`vercel
deploy --prebuilt` via Vercel CLI, autenticado por `VERCEL_TOKEN` (GitHub
Secret, escopado ao Environment do GitHub correspondente).

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
- Nenhum deploy real ocorreu; nenhuma linha na tabela de histórico de deploy
  (a ser criada na Seção 7 quando o primeiro deploy acontecer) existe ainda.

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
