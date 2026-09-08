# CurtaMais — Planejador de Viagens com Decisão Guiada por IA

Documentação de produto/arquitetura: ver `.md/` (`PRD-TECNICO.md`, `SDD.md`,
`UX-SPEC.md`, `TASK.md`, `GUARDRAILS.md`, ADRs em `.md/adr/`).

## Stack

- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma ORM sobre PostgreSQL (schema em `prisma/schema.prisma`, L1-T02)
- NextAuth.js (chega em L1-T03)
- SDK oficial da OpenAI (chega em L3-T01)
- Vitest + Testing Library para testes automatizados

## Setup local

1. `npm install` (roda `prisma generate` automaticamente via `postinstall`)
2. Copie `.env.example` para `.env` e preencha os valores (ver comentários no
   arquivo). Nunca versionar `.env`.
3. Suba um PostgreSQL local (ex.: `docker run -d -p 5432:5432 -e
   POSTGRES_USER=curtamais -e POSTGRES_PASSWORD=curtamais -e
   POSTGRES_DB=curtamais postgres:16-alpine`) e ajuste `DATABASE_URL` em
   `.env` de acordo.
4. `npm run db:migrate:dev` — aplica as migrations do Prisma no banco local.
5. `npm run dev` — inicia o servidor de desenvolvimento em
   `http://localhost:3000`.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — inicia o build de produção
- `npm run lint` — ESLint
- `npm test` — roda a suíte de testes (Vitest) uma vez, incluindo testes de
  integração de schema Prisma contra um Postgres real
- `npm run test:watch` — Vitest em modo watch
- `npm run db:migrate:dev` — cria/aplica migration Prisma em desenvolvimento
- `npm run db:migrate` — aplica migrations existentes (`prisma migrate
  deploy`, usado em CI/produção)

## CI

`.github/workflows/ci.yml` roda lint, test e build a cada push/PR em `main`.
