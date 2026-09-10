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

## Adendo 2 — Transição regressiva "revisar" (2026-09-10)

- Contexto: L7-T05 (Server Action da tela T05, RF-11) tem como critério de
  aceite "Confirmar avança para hospedagem; trocar volta ao campo de destino
  da tela de origem". A state machine de L4-T01 (`SEQUENTIAL_TRANSITIONS`,
  `src/lib/session-flow/state-machine.ts`) só modela transições para frente
  (`iniciar`/`aprovar`/`ajustar`/`avancar`) e a transição terminal
  (`encerrar`) — nenhuma ação leva um estado `*_confirmado`/`*_aprovada(o)`/
  `*_aprovados` de volta ao `*_pendente` correspondente. A partir de
  `destino_confirmado`, a única ação válida é `avancar`. Bloqueio registrado e
  resolvido em `.md/BLOCKERS.md`, Bloqueio 002. Duas opções foram levantadas
  pelo Executor: (a) nova transição regressiva explícita; (b) navegação
  client-side pura sem tocar `flowState`, absorvida provisoriamente por L7-T04
  enquanto este bloqueio ficava em aberto.

- Análise da opção (b): insuficiente como solução definitiva. Deixar
  `flowState` parado em `destino_confirmado` enquanto o usuário reabre o campo
  de destino cria um estado inconsistente entre o que o servidor acha que é
  verdade e o que a tela mostra — qualquer lógica futura que leia `flowState`
  para decidir o que renderizar (inclusive a própria RF-04.3, nova aprovação
  de destino) quebraria com `InvalidTransitionError`, porque a state machine
  continuaria enxergando a etapa como já confirmada. Rejeitada como decisão
  final; mantida apenas como o comportamento observado (navegação sem
  persistência) que L7-T04 já tinha implementado enquanto o bloqueio estava
  aberto.

- Análise de escopo (destino vs. genérico): o `UX-SPEC.md` (Seção 4, T05) e o
  `TASK.md` (Lote 8/9/10, `L8-T02`/`T06`, `L9`/T07, `L10`/T08) mostram que
  "Ajustar" (regenerar a sugestão pendente antes de aprovar, sem avançar) já
  está coberto pela ação `ajustar` existente, que atua **dentro** do estado
  `*_pendente` — isso não é o mesmo problema. O problema real de T05 é
  reabrir uma decisão **já confirmada/aprovada** (estado `*_confirmado`/
  `*_aprovada(o)`/`*_aprovados`) de volta ao `*_pendente` correspondente. Hoje
  só a tela T05 (RF-11, exclusiva de destino, por ser uma etapa de
  confirmação extra) expõe esse botão na UI — nenhuma tarefa hoje publicada
  em `TASK.md` (Lotes 8/9/10) pede um botão equivalente para hospedagem/
  passeios/roteiro. Ainda assim, o formato de "decisão já tomada, usuário quer
  reabrir" é genérico o bastante (mesmo par de estados `*_pendente`/
  `*_aprovada(o)` se repete nas 4 etapas) para valer a pena resolver uma vez
  na state machine, em vez de arriscar o mesmo bloqueio reaparecer idêntico em
  L8/L9/L10 assim que alguma tarefa futura pedir esse botão. Por isso a
  decisão abaixo modela a transição regressiva de forma genérica na state
  machine (mecanismo disponível para as 4 etapas), sem criar nenhuma tarefa
  nova de UI para hospedagem/passeios/roteiro agora — isso permanece fora de
  escopo até que uma tarefa real peça (ver `.md/TASK.md`, Seção 6, nota
  vinculada a este adendo).

- Decisão: opção (a) — nova ação regressiva `revisar`, adicionada ao tipo
  `SessionFlowAction` (`src/lib/session-flow/state-machine.ts`) e a uma nova
  tabela de transições regressivas, simétrica a `SEQUENTIAL_TRANSITIONS`:

  ```
  destino_confirmado    --revisar--> destino_pendente
  hospedagem_aprovada   --revisar--> hospedagem_pendente
  passeios_aprovados    --revisar--> passeios_pendente
  roteiro_aprovado      --revisar--> roteiro_pendente
  ```

  - `revisar` só é válida a partir dos 4 estados acima — nunca a partir de um
    estado `*_pendente` (é isso que `ajustar` já cobre, sem mudar de etapa),
    nunca a partir de `entrada_selecionada` (nada para revisar ainda), nunca a
    partir de um estado terminal (`concluida`/`encerrada_parcial`) — mesma
    regra de guarda já usada por `TERMINAL_STATES`/`SEQUENTIAL_TRANSITIONS`
    para as outras ações.
  - Efeito sobre a etapa **anterior** (pergunta que o Bloqueio 002 deixou em
    aberto sobre RN-03/histórico): nenhum. `revisar` só desfaz a aprovação da
    própria etapa que está sendo reaberta — nunca apaga/invalida a aprovação
    de uma etapa anterior já confirmada. Ex.: `hospedagem_aprovada --revisar-->
    hospedagem_pendente` não toca `DestinationApproval`. Consequência direta:
    `revisar` a partir de `hospedagem_aprovada` (destino já confirmado) mantém
    a sessão em `STATES_WITH_AT_LEAST_ONE_APPROVAL`, porque o novo estado
    (`hospedagem_pendente`)
    já estiver na lista — e já está (linha 94 do state-machine.ts, adicionada
    em L4-T01 justamente para cobrir "destino confirmado, hospedagem ainda
    pendente") — então `encerrar` continua disponível depois de um `revisar`,
    preservando RF-05.4/RN-03 sem nenhuma mudança na lista
    `STATES_WITH_AT_LEAST_ONE_APPROVAL` nem na lógica de `encerrar`. Já
    `revisar` a partir de `destino_confirmado` leva a `destino_pendente`, que
    **não** está nessa lista (nenhuma etapa aprovada ainda) — `encerrar`
    deixa de ser válido até uma nova aprovação, o que é o comportamento
    correto: se o usuário está reabrindo a única etapa já decidida, não há
    mais "o que já foi aprovado" para preservar num encerramento.
  - Efeito sobre a persistência da própria etapa (escopo de quem implementar,
    não deste adendo): como cada entidade de aprovação (`DestinationApproval`,
    `AccommodationApproval`) é **0..1 por sessão** (SDD.md Seção 5) e
    `ActivityApproval`/`ItineraryItem` são as N linhas da aprovação de
    passeios/roteiro, não existe tabela de histórico a preservar — uma nova
    aprovação depois de `revisar` naturalmente sobrescreve/recria a linha
    (ou o conjunto de linhas, no caso de `passeios`/`roteiro`) da mesma etapa.
    A implementação de `revisar` na camada de persistência
    (`applySessionFlowTransition`, `src/lib/session-flow/`, extensão de
    L4-T02) deve **apagar** a(s) linha(s) de aprovação da etapa que está
    sendo reaberta (só dela, nunca de etapas anteriores) na mesma transação
    que grava o novo `flowState`, para não deixar um registro de aprovação
    órfão associado a um estado `*_pendente`. Isso não é uma migration nova
    (nenhum campo/enum muda), só uma extensão da lógica de escrita já
    existente — ver instrução para quem retomar em `.md/TASK.md` (nota de
    bloqueio/resolução vinculada a L7-T05).
  - Nome da ação: `revisar` (não `trocar`/`voltar`) — escolhido para nomear a
    ação pelo verbo genérico ("revisar uma decisão já tomada"), não pelo
    rótulo específico do botão de uma tela ("Trocar destino" em T05); telas
    futuras de hospedagem/passeios/roteiro podem rotular o botão como
    preferirem ("Trocar hospedagem", "Revisar seleção de passeios" etc.) sem
    precisar de uma ação nova na state machine.

- Consequência: `SEQUENTIAL_TRANSITIONS` ganha uma tabela irmã de transições
  regressivas (ou passa a incluir `revisar` na mesma tabela, decisão de
  detalhe de implementação); os 11 nomes de estado do ADR-006 e as transições
  para frente já implementadas em L4-T01/L4-T02 não mudam. `SDD.md` Seção 5
  recebe uma nota curta sobre o comportamento de `revisar` (sem mudança de
  schema). Nenhuma tarefa nova de UI é criada para hospedagem/passeios/roteiro
  neste momento — o mecanismo fica disponível na state machine para quando
  (se) uma tarefa real pedir, evitando repetir o Bloqueio 002 de forma
  idêntica em L8/L9/L10, mas sem expandir escopo além do que T05/RF-11 já
  declara como necessário agora.

- Status: Aceito.

