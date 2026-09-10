# ADR-008 — Propriedade (dono) de `TripSession` e resolução de identidade para autorização

- Status: Aceito
- Data: 2026-09-10
- Autor: Coordenador (chapéu Software Architect)

## Contexto

`SDD.md` Seção 7 exige, desde a versão inicial: "toda leitura/escrita em
`TripSession`... exige que o identificador de sessão (cookie) ou `user_id`
autenticado corresponda ao dono do registro". `L11-T02` (`TASK.md`) traduz
isso em um guard central. Ao iniciar a implementação, o Executor encontrou
que `TripSession` não registra, hoje, o dono real do registro para NENHUM dos
dois mecanismos de identidade do projeto:

1. Sessão anônima (cookie httpOnly `anon_session_id`,
   `src/lib/anonymous-session.ts`, L1-T03): nenhuma coluna equivalente existe
   em `TripSession`.
2. Conta autenticada (`TripSession.userId`, nullable, já no schema desde
   L1-T02): nunca é de fato gravada por nenhum ponto de criação real —
   `createSessionWithDateRange` (`src/lib/session-flow/create-session-with-range.ts`,
   único `INSERT` de `TripSession` fora de teste, chamado por
   `submeterDataLivre`/L6-T03, `processarFeriadoEscolhido`/L6-T05,
   `submitQuizAnswers`/L6-T07) não aceita `userId` como parâmetro.

Sem (1) e (2), um guard "dono esperado vs. dono real" não tem dado real para
comparar. Bloqueio registrado e resolvido em `.md/BLOCKERS.md`, Bloqueio 004.
Mesma classe de lacuna estrutural do Bloqueio 001 (ADR-006 Adendo 1), mas de
domínio diferente (autorização/SDD §7, não orquestração de etapa/ADR-006) —
por isso formalizada como ADR novo, não como adendo ao ADR-006.

## Alternativas Consideradas

1. **Guard sempre nega** (rejeitar toda comparação, já que não há dado real
   hoje). Descartada: quebra o fluxo anônimo, caminho principal do produto
   (RF-01/02/03 não exigem conta).
2. **Heurística não especificada** (ex.: "primeira requisição após o create
   define o dono"). Descartada: sujeita a race condition, sem endosso em
   nenhum artefato (SDD.md/ADR), decisão de arquitetura que não pode ser
   inventada implicitamente por uma tarefa de implementação.
3. **Persistir explicitamente o dono no momento da criação** — novo campo
   `anon_session_id` em `TripSession`, `createSessionWithDateRange` passando
   a gravar o dono resolvido pelo chamador, guard comparando contra o que foi
   persistido. Proposta original do Executor (`.md/BLOCKERS.md`, Bloqueio 004,
   seção "Sugestão"), adotada aqui com os refinamentos abaixo.

## Decisão

Adotar a alternativa 3.

1. **Schema**: adicionar a `TripSession` o campo `anonSessionId String?
   @map("anon_session_id")`, nullable, coexistindo com `userId` (já
   existente, nullable). Nenhum outro campo de `TripSession` muda.

   ```prisma
   model TripSession {
     // ... campos existentes inalterados ...
     userId       String? @map("user_id")
     anonSessionId String? @map("anon_session_id")
     // ...
   }
   ```

2. **Invariante de exclusividade mútua**: toda `TripSession` grava exatamente
   um dos dois campos no momento da criação — nunca os dois, nunca nenhum.
   Não há `CHECK` constraint formal a nível de banco (mesmo estilo já adotado
   no restante do schema, ex.: cardinalidade 0..1 de `DestinationApproval`/
   `AccommodationApproval` sem constraint declarada) — a garantia é de
   responsabilidade do único ponto de criação real (`createSessionWithDateRange`),
   reforçada em tempo de compilação pelo tipo discriminado `owner` do item 3.

3. **Contrato de criação**: `createSessionWithDateRange` passa a exigir um
   parâmetro obrigatório:

   ```ts
   type SessionOwner =
     | { type: "user"; userId: string }
     | { type: "anonymous"; anonSessionId: string };
   ```

   resolvido pelo CHAMADOR (a Server Action de tela), nunca inferido dentro
   do helper — o helper só grava o que recebe. Regra de resolução aplicada de
   forma **idêntica** nas 3 Server Actions que hoje criam sessão
   (`submeterDataLivre`/L6-T03, `processarFeriadoEscolhido`/L6-T05,
   `submitQuizAnswers`/L6-T07):
   - Se `getServerSession(authOptions)` (NextAuth) retorna uma sessão válida:
     `owner = { type: "user", userId }`.
   - Caso contrário: `owner = { type: "anonymous", anonSessionId }`, resolvido
     do cookie via `resolveAnonymousSessionId` (`src/lib/anonymous-session.ts`,
     já existente, hoje sem nenhum consumidor real fora do middleware que
     grava o cookie na resposta).
   - **Precedência de conta autenticada sobre cookie anônimo é deliberada**:
     um usuário logado nunca cria uma sessão "anônima" só porque o cookie de
     visitante também está presente na requisição (cookie de 1 ano sobrevive
     ao login).

4. **Guard central (`L11-T02`)**: resolve o "dono esperado" da requisição
   corrente com a MESMA regra de precedência do item 3, busca a `TripSession`
   alvo e autoriza somente quando:
   - `session.userId` não é nulo E o dono esperado é autenticado E os dois
     `userId` batem; OU
   - `session.anonSessionId` não é nulo E o dono esperado é anônimo E os dois
     `anonSessionId` batem.
   - Qualquer outro caso (nenhum bate, incluindo o caso defensivo de um
     registro sem nenhum dos dois campos gravados) é negado.
   - **Toda negação retorna 404, nunca 403** — decisão explícita para não
     revelar a um solicitante ilegítimo se o registro existe. Isso resolve a
     ambiguidade "403/404" do critério de aceite original de `L11-T02`
     (`TASK.md`), fixado agora como "sempre 404".
   - O guard é chamado no início de toda função pública de
     `src/lib/session-flow/persistence.ts` (`applySessionFlowTransition`) e
     de qualquer outro ponto de leitura direta de `TripSession` fora desse
     módulo (ex.: `gerarSugestoesDestino`) — mesma superfície já mapeada pelo
     Executor na investigação do Bloqueio 004.

5. **Sem migração de sessão anônima para conta**: se um visitante usa o
   produto anonimamente e depois cria/loga em uma conta, as `TripSession`s já
   criadas sob o `anon_session_id` anterior NÃO são automaticamente
   associadas ao novo `user_id` — permanecem acessíveis pelo mesmo cookie
   anônimo (que sobrevive ao login), mas não "migram" de dono. Isso é uma
   decisão de escopo, não uma lacuna: nenhum requisito do PRD-TECNICO.md pede
   esse merge; o comentário histórico já existente no schema Prisma
   ("migração de dados de `TripSession` para `userId` autenticado... é L4")
   não corresponde a nenhuma tarefa real do `TASK.md` atual — funcionalidade
   nova, fora do MVP, não decidida por este ADR.

## Consequências

- `TripSession` ganha uma segunda dimensão de identidade de dono
  (`anon_session_id`), sem alterar `flowState`/`status`/nenhuma outra decisão
  já registrada em ADR-005/ADR-006.
- `createSessionWithDateRange` muda de assinatura (breaking change interno) —
  exige retrofit dos 3 chamadores já `Concluída`s (`L6-T03`/`L6-T05`/`L6-T07`).
  Tratado como tarefa nova, `L11-T02a`, sequenciada ANTES do guard central
  (`L11-T02`), porque o guard não tem contra o que comparar sem o dado
  persistido primeiro. Ver `TASK.md`, Seção 3 (Lote 11) e Seção 6 para o
  detalhamento da divisão de tarefa e a instrução para quem retomar.
- Nenhum dado legado a migrar (projeto ainda não foi ao ar, mesma situação já
  registrada no Adendo 1 do ADR-006) — qualquer `TripSession` existente em
  ambiente de desenvolvimento/teste pode ser recriada/descartada sem custo de
  migração de dados real.
- A migration em si (`prisma migrate dev`, geração do client, e o código de
  gravação/leitura de `anonSessionId`) é escopo de implementação de
  `L11-T02a`; o guard em si (comparação de identidade + integração nos pontos
  de leitura/escrita) permanece escopo de `L11-T02`.

- Status: Aceito.
