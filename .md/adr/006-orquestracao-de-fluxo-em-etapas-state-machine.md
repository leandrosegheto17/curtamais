# ADR-006 — Orquestração do fluxo em etapas (state machine)

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

RN-01 exige que o sistema nunca apresente duas ou mais etapas na mesma
resposta/tela. RF-05 exige avanço automático em aprovação, regeneração em
ajuste (sem avançar), e encerramento em qualquer etapa preservando o que já foi
aprovado (RF-04.5, RF-05.4, RN-03). RF-11 introduz uma etapa adicional de
confirmação quando o destino já vem informado. Esse conjunto de regras é, na
prática, uma máquina de estados explícita.

## Alternativas Consideradas

1. **State machine implícita no cliente** (React state local controlando qual
   tela mostrar), com persistência apenas do resultado final por etapa.
2. **State machine explícita no servidor**, com o estado atual da sessão
   (`TripSession.status` + etapas aprovadas) sendo a fonte de verdade, e o
   cliente sempre renderizando a partir do que o servidor retorna.

## Decisão

Adotar **state machine explícita no servidor** (Orquestrador de Sessão, SDD.md
Seção 2), persistida a cada transição de etapa.

## Racional

- Fonte única de verdade no servidor evita duas classes de bug diretamente
  relevantes para RN-01/RF-05: (a) o cliente renderizar uma etapa fora de
  ordem por dessincronia de estado local; (b) perda de progresso ao fechar
  aba/recarregar página, o que quebraria RF-05.4 (encerrar preservando o já
  aprovado) sempre que o encerramento não fosse por ação explícita do usuário.
- Cada transição de estado (aprovar, ajustar, encerrar) é persistida
  imediatamente em `TripSession` (SDD.md Seção 5), o que também é o mecanismo
  que resolve RF-09 (persistência estruturada) — a mesma escrita que avança a
  etapa já grava o dado estruturado exigido por RF-09.1.
- Simplifica RF-11 (etapa de confirmação extra quando destino já informado):
  é apenas mais um estado possível na mesma máquina, não uma exceção de fluxo
  tratada em separado.

## Consequências

- Toda transição de etapa exige uma ida ao servidor (nenhuma navegação
  puramente client-side entre etapas) — aceitável dado que cada etapa já
  depende de uma chamada ao Gateway de IA (ADR-002/003), que é sempre
  server-side.
- Estados possíveis da state machine (a serem detalhados na implementação):
  `entrada_selecionada` → `destino_pendente`/`destino_confirmado` →
  `hospedagem_pendente`/`aprovada` → `passeios_pendente`/`aprovados` →
  `roteiro_pendente`/`aprovado` → `concluida`, com `encerrada_parcial` como
  estado terminal alternativo a partir de qualquer etapa aprovada (RN-03).

## Adendo 1 — Persistência do estado granular (2026-09-09)

- Contexto: L4-T01 implementou os 11 estados acima como tipo TS puro
  (`SessionFlowState`, `src/lib/session-flow/state-machine.ts`), sem tocar o
  schema. Ao iniciar L4-T02 (persistência de transição), o Executor encontrou
  que o schema Prisma já migrado (`TripSession.status TripSessionStatus`,
  L1-T02) só cobre 4 valores coarse-grained (`in_progress`/`partial`/
  `completed`/`abandoned`), sem nenhum campo/enum que cubra literalmente os 11
  estados granulares — gap que este ADR deixava em aberto ("a serem
  detalhados na implementação"). Bloqueio registrado e resolvido em
  `.md/BLOCKERS.md`, Bloqueio 001. Duas alternativas foram levantadas: (a)
  derivar o estado granular a partir de dados já existentes (`entryPath` +
  presença das entidades de aprovação + `TripSessionStatus`), sem migração; ou
  (b) acrescentar ao schema um campo/enum novo dedicado ao estado granular.
  Decisão de negócio tomada pelo usuário/orquestrador do projeto: opção (b).
  Este adendo formaliza a forma exata dessa alteração de schema.

- Decisão: adicionar ao modelo `TripSession` um novo campo `flowState`
  (coluna `flow_state`), tipado com um novo enum Prisma `SessionFlowState`,
  cujos 11 valores reaproveitam literalmente o vocabulário já usado em
  `SESSION_FLOW_STATES` (`src/lib/session-flow/state-machine.ts`) — nenhum
  segundo vocabulário é criado:

  ```prisma
  enum SessionFlowState {
    entrada_selecionada
    destino_pendente
    destino_confirmado
    hospedagem_pendente
    hospedagem_aprovada
    passeios_pendente
    passeios_aprovados
    roteiro_pendente
    roteiro_aprovado
    concluida
    encerrada_parcial
  }

  model TripSession {
    // ... campos existentes inalterados ...
    status    TripSessionStatus @default(in_progress)
    flowState SessionFlowState  @default(entrada_selecionada) @map("flow_state")
    // ...
  }
  ```

  - `flowState` é **não-nullable**, com `@default(entrada_selecionada)` — toda
    `TripSession` nasce nesse estado (`INITIAL_SESSION_FLOW_STATE` em
    `state-machine.ts`), então não há caso legítimo de estado granular
    ausente. Não há dado legado a migrar (projeto ainda não foi ao ar).
  - `TripSessionStatus` (`status`) **permanece no schema, sem depreciação** —
    os dois campos coexistem com responsabilidades diferentes:
    - `flowState` é a fonte de verdade que a state machine (`L4-T02`) lê e
      escreve a cada `transitionSessionFlow`; é o que RN-01/RF-05 realmente
      precisam para saber exatamente em qual das 11 etapas a sessão está.
    - `status` continua a granularidade grosseira usada para filtros
      administrativos/consultas amplas (ex.: "quantas sessões estão em
      andamento" sem importar em qual etapa) e para o estado `abandoned`, que
      é **intencionalmente fora do vocabulário da state machine** (ver
      `state-machine.ts`, nota sobre `entrada_selecionada`/`destino_pendente`
      sem nenhuma aprovação — esse caso é "abandonada", não modelado como
      estado de `SessionFlowState`).
    - Sincronização: sempre que uma transição gravar `flowState = concluida`,
      a mesma escrita grava `status = completed`; sempre que gravar
      `flowState = encerrada_parcial`, a mesma escrita grava
      `status = partial`. Fora dos dois estados terminais, `status` permanece
      `in_progress` (valor de default, sem escrita adicional). `status =
      abandoned` não é escrito pela state machine — fica reservado a um
      mecanismo de expiração/abandono fora do escopo de L4-T02 (não existe
      ainda; nenhuma tarefa do TASK.md o implementa neste lote).
  - A migration em si (`prisma migrate dev`, geração do client, e o código de
    L4-T02 que lê/escreve `flowState` a cada transição) é escopo de
    implementação de **L4-T02**, não deste adendo.

- Consequência: nenhuma mudança nos 11 nomes de estado nem nas regras de
  transição já implementadas em L4-T01 — este adendo resolve só a lacuna de
  persistência, mantendo a state machine (lógica pura) como está.

- Status: Aceito.

