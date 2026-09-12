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

(Vazio — nenhum deploy realizado até o momento desta preparação.)
