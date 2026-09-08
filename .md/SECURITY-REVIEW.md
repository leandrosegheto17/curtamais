# SECURITY-REVIEW.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Validador (chapéu DevSecOps). Auditoria roda depois da aprovação
funcional do chapéu QA para o mesmo lote (ver `QA-REPORT.md` — Lote 1
aprovado). Requisitos-fonte: `SDD.md` Seção 7, `GUARDRAILS.md` regras
15-21, ADRs relevantes.

## Lote 1 — Fundação de Infraestrutura e Persistência

Status geral: **Aprovado com débito registrado** (severidade média,
dependência de terceiros — não bloqueia o fechamento deste lote; bloqueia
o próximo deploy em produção até resolução ou aceite formal de risco).

### Escopo desta auditoria

`prisma/schema.prisma`, `src/lib/auth.ts`, `src/lib/anonymous-session.ts`,
`src/lib/password.ts`, `src/lib/user-account.ts`, `src/middleware.ts`,
`src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/auth/signup/route.ts`,
`src/app/api/anonymous-session/route.ts`, `.env.example`, `.gitignore`,
`.github/workflows/ci.yml`, `package.json`/`package-lock.json` (via `npm
audit`).

### 1. Segredos hardcoded

- Busca por padrões de chave de API/connection string com credencial
  embutida no diretório `src/` — **nenhuma ocorrência**.
- `.env` (valores reais) confirmado não rastreado pelo git e coberto por
  `.gitignore`. `.env.example` só contém placeholders (`sk-...`,
  `troque-por-um-valor-aleatorio-gerado-localmente`, etc.).
- CI (`.github/workflows/ci.yml`) usa valores dummy explícitos
  (`ci-dummy-secret`, `sk-ci-dummy`) para variáveis de ambiente, nenhum
  segredo real em texto plano no workflow.
- **Conforme** GUARDRAILS.md regra 15.

### 2. Configuração de cookies

- Cookie de sessão NextAuth (`src/lib/auth.ts`): `httpOnly: true`,
  `sameSite: "lax"`, `secure` condicionado a `NODE_ENV === "production"`,
  nome com prefixo `__Secure-` em produção. Estratégia `jwt` é a exigida
  pelo próprio Credentials Provider (documentado no código,
  correto tecnicamente).
- Cookie de sessão anônima (`src/lib/anonymous-session.ts`): mesmos
  atributos (`httpOnly`, `secure` condicionado a produção, `sameSite:
  "lax"`), `maxAge` de 1 ano razoável para identidade de visitante sem
  conta.
- Nenhum cookie de sessão com `secure: false` hardcoded fora do gate de
  ambiente de desenvolvimento — condição correta (`NODE_ENV`), não valor
  fixo.
- **Conforme** SDD.md §7 ("Autenticação" — cookie httpOnly + secure) e
  GUARDRAILS.md regra 16 (autorização por dono do registro é item 4 mais
  abaixo, ainda não aplicável neste lote — `TripSession` só ganha guard de
  autorização no Lote 11/L11-T02).

### 3. Exposição de dados sensíveis

- `passwordHash` nunca é retornado em nenhuma resposta de API: `POST
  /api/auth/signup` retorna só `{ id, email }`;
  `createUserAccount`/`authorize()` retornam objetos explicitamente
  compostos (`{ id, email, name }`), nunca o registro Prisma inteiro —
  confirmado por leitura de `src/lib/user-account.ts` e `src/lib/auth.ts`,
  e por teste de integração que só usa `stored.passwordHash` para
  asserção interna (nunca serializado).
- Senha em texto plano nunca persistida (confirmado por teste de
  integração: `stored.passwordHash !== "senha-segura-123"`) e hash via
  bcrypt (12 rounds) — adequado.
- `SESSÃO`/token JWT do NextAuth carrega só `userId`, `email`, `name` —
  nenhum dado de sessão de viagem incluído neste lote (ainda não existe
  geração via LLM); logo, item "nenhum dado pessoal de conta enviado ao
  prompt do LLM" (SDD §7) não é aplicável ainda a este lote — sem achado.
- **Conforme** GUARDRAILS.md regra 17 (não aplicável ainda, sem violação).

### 4. Validação/sanitização de input

- E-mail: regex de formato + normalização (`trim().toLowerCase()`) antes
  de tocar o banco, em `createUserAccount` (aplicado tanto no cadastro
  quanto na consulta do `authorize()` do NextAuth).
- Senha: comprimento mínimo de 8 caracteres, validado antes de qualquer
  chamada ao Prisma (`InvalidAccountInputError` lançado cedo).
- Corpo de requisição inválido (JSON malformado) tratado explicitamente em
  `POST /api/auth/signup` com 400, sem vazar stack trace.
- Cookie de sessão anônima: valor recebido é validado contra regex de UUID
  antes de reutilizado — valor corrompido/malicioso nunca é
  aceito/propagado, sempre substituído por um novo UUID gerado
  server-side (`crypto.randomUUID()`), mitigando injeção via cookie
  adulterado.
- Prisma (parametrização nativa) usado em toda consulta — sem
  concatenação de string para SQL, sem superfície de SQL injection.
- **Conforme.**

### 5. Dependências de terceiros (`npm audit`)

`npm audit` (13 vulnerabilidades: 1 crítica, 9 altas, 3 moderadas)
reclassificado por risco real de exploração no estado atual do projeto,
não só pelo rótulo bruto do npm:

| Pacote | Severidade (npm) | Direto? | Runtime de produção? | Reclassificação de risco real |
|---|---|---|---|---|
| `next` 14.2.35 | Alta (9 CVEs: SSRF, request smuggling, cache poisoning, DoS, XSS) | Sim | Sim | **Média** — 14.2.35 já é o patch mais recente da série 14.x (confirmado via `npm view next@14 version`); a correção completa exige major (16.x). Superfície explorável hoje é mínima: o app ainda não usa `next/image` com `remotePatterns`, não usa i18n de Pages Router, não usa custom server, nem expõe Server Actions de negócio (só 3 rotas: `/`, `/api/anonymous-session`, `/api/auth/*`). Risco sobe de médio para alto no momento em que o app for exposto publicamente em produção com mais rotas — deve ser resolvido antes disso. |
| `vitest` 2.1.9 (+ `vite`, `esbuild`, `vite-node`) | Crítica/Alta/Moderada | Sim (dev) | **Não** — ferramenta de teste, não entra no bundle de produção nem roda em servidor exposto | **Baixa** — sem caminho de exploração em produção; risco limitado ao ambiente de desenvolvimento/CI local dos mantenedores. |
| `eslint-config-next`, `glob` (via lint) | Alta | Indireto/dev | Não | **Baixa** — mesma lógica do item acima (tooling de dev, CLI local). |
| `postcss` (via `next`) | Alta | Indireto | Sim (build-time) | **Baixa-média** — path traversal/XSS em processamento de CSS; mitigado por não haver CSS gerado a partir de entrada não confiável do usuário no MVP. |

Decisão de severidade consolidada: **Média**, tratada como débito de
segurança com prazo — não bloqueia o fechamento do Lote 1 (nenhuma dessas
CVEs é explorável na superfície atual, que é só infraestrutura/auth, sem
funcionalidade de produto exposta), mas **bloqueia o próximo deploy em
produção** até que: (a) o upgrade de `next` para uma versão corrigida seja
aplicado e testado (upgrade de major é compatível com o guardrail vigente
— TASK.md item 12 exige "Next.js 14+", não trava em 14.x exato, logo não
exige novo ADR), ou (b) o Gestor aceite formalmente o risco residual por
prazo definido caso o upgrade seja adiado por motivo de escopo/tempo.
Tarefa de correção criada em `Refatoração Lote-1` (ver `TASK.md`).

### 6. Conformidade regulatória (LGPD, SDD §7)

- Coleta mínima de dado pessoal: só e-mail (+ nome opcional) no cadastro,
  nenhum dado além do estritamente necessário — conforme.
- Mecanismo de exclusão de conta/dados (RNF-06) é escopo explícito de
  L11-T01 (lote futuro) — não é uma lacuna deste lote, já rastreado no
  `TASK.md`.
- Cascade delete já modelado no schema (`onDelete: Cascade` em
  `Account`/`Session` referenciando `User`) — infraestrutura pronta para
  quando L11-T01 implementar o endpoint de exclusão.
- Nenhum dado pessoal usado para treinar modelo — não aplicável ainda
  (sem chamada a LLM neste lote).

### 7. Rate limiting

- Não aplicável a este lote (rate limiting do Gateway de IA é escopo de
  L3-T05, já rastreado no `TASK.md`) — sem achado.

### Requisitos de segurança operacional para o chapéu DevOps (a partir daqui)

- Gestão de secrets em produção: `DATABASE_URL`, `NEXTAUTH_SECRET`,
  `OPENAI_API_KEY` devem ser configurados via secrets manager da
  plataforma de deploy (ex.: Vercel Environment Variables), nunca em
  arquivo versionado — já é o padrão seguido em `.env.example`/CI, manter
  no provisionamento real.
- `NEXTAUTH_SECRET` de produção deve ser gerado por instância de ambiente
  (não reaproveitar o valor dummy de CI nem gerar um único valor
  compartilhado entre staging/produção).
- Pipeline de CI/CD deve rodar `npm audit` (ou equivalente) como gate
  informativo a cada build, para não perder de vista a resolução do
  débito de dependências registrado acima.
- Antes do primeiro deploy em produção: revalidar este item 5 (dependências)
  — se `next` ainda não tiver sido atualizado, tratar como bloqueio real
  de deploy, não mais como débito.

### Achados que exigem escalonamento

Nenhum achado de severidade alta/crítica com exploração real neste lote —
nenhum escalonamento a `executor` necessário.

Sinalização ao **Gestor** (paralela, não pré-requisito do fechamento deste
lote): o débito de dependências (`next` 14.2.35, upgrade major necessário
para correção completa) tem relevância estratégica porque um upgrade de
major version de framework pode exigir retestes de regressão amplos mais à
frente no projeto (Lotes 6-11, quando a superfície de UI/Server Actions
crescer) — recomenda-se decidir o timing do upgrade (agora, enquanto a
superfície é pequena, vs. mais perto do deploy) como decisão de
priorização, não como decisão técnica isolada do Validador.

## Veredito

**Build do Lote 1 aprovado em segurança, com débito registrado** (ver
tarefa em `Refatoração Lote-1`, `TASK.md` Seção 3). Nenhum achado de
severidade alta/crítica com exploração real em aberto; nenhum compliance
obrigatório pendente. Débito de dependências tem prazo: antes do primeiro
deploy em produção.

## Lote 2 — Módulo de Feriados (determinístico, ADR-007)

Auditoria roda depois da aprovação funcional do chapéu QA para este lote
(ver `QA-REPORT.md` — Lote 2 aprovado, com ressalva simples registrada em
`Refatoração Lote-2`).

Status geral: **Aprovado, sem débito.** Lote puramente de lógica de
calendário, sem I/O, rede, banco de dados ou segredo — auditoria de
segurança rápida por não introduzir nenhuma superfície nova.

### Escopo desta auditoria

`src/lib/holidays.ts`, `src/lib/actions/feriados.ts`, e seus respectivos
arquivos de teste.

### 1. Superfície de entrada/input de usuário

- `holidays.ts`: todas as funções exportadas recebem apenas `number`
  (ano) ou `Date` — nenhum campo de texto livre, nenhuma entrada vinda
  diretamente do usuário final sem passar por validação de tipo do
  TypeScript/runtime do próprio Next.js.
- `feriados.ts`: `getFeriadosProlongados` **não recebe nenhum parâmetro**
  — não há superfície de input de usuário nesta Server Action. Nenhum
  campo de texto livre a validar/sanitizar (guardrail 9/regra de
  `GUARDRAILS.md` sobre sanitização de texto livre não se aplica: não há
  texto livre aqui).
- **Conforme.**

### 2. Chamada externa / rede / LLM

- Confirmado (também pelo chapéu QA, ver `QA-REPORT.md`) via busca manual
  por `gateway-ia|openai|fetch\(|await fetch` em ambos os arquivos:
  nenhuma ocorrência. Nenhuma chamada a provider de LLM, API externa, ou
  rede de qualquer tipo.
- **Conforme** TASK.md item 1 (fronteira do Gateway de IA) e RNF-07.

### 3. Segredos

- Nenhuma variável de ambiente, chave de API, connection string ou
  qualquer segredo referenciado em `holidays.ts`/`feriados.ts` — módulo
  não tem motivo para acessar segredo algum (lógica pura de calendário).
- **Conforme** GUARDRAILS.md regra 15.

### 4. Exposição de dados sensíveis

- Nenhum dado pessoal do usuário é processado, retornado ou logado por
  este módulo — a Server Action só produz datas de feriados nacionais
  (dado público, não sensível) e uma string formatada para exibição.
- **Não aplicável / sem achado.**

### 5. Dependências de terceiros

- Nenhuma dependência nova introduzida por este lote (usa só `Date`
  nativo do runtime JS/TS) — nenhuma superfície nova de `npm audit` além
  do débito já registrado em `Refatoração Lote-1`, que segue seu próprio
  prazo (antes do primeiro deploy em produção), sem relação com este
  lote.
- **Conforme.**

### 6. Conformidade regulatória (LGPD)

- Não aplicável — nenhum dado pessoal envolvido.

### Requisitos de segurança operacional para o chapéu DevOps

Nenhum requisito novo específico deste lote (nenhuma superfície de rede,
segredo, ou dado sensível introduzida).

### Achados que exigem escalonamento

Nenhum. Nenhum achado de qualquer severidade neste lote — sem
escalonamento a `executor`, sem sinalização de relevância estratégica ao
Gestor.

## Veredito

**Build do Lote 2 aprovado em segurança, sem débito.** Nenhuma superfície
nova de segurança introduzida (sem input de usuário não validado, sem
chamada externa/LLM, sem segredo, sem dado sensível). Lote liberado para
deploy do ponto de vista de segurança, condicionado à dupla aprovação com
o veredito de QA (`QA-REPORT.md`) para o mesmo lote.
