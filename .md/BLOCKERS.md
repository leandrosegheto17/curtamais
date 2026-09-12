# BLOCKERS.md — Log de inconsistências/bloqueios entre agentes

Formato de entrada conforme `.claude/PIPELINE-CONVENTIONS.md` Seção 4.

## Bloqueio 001 — 2026-09-09

- Reportado por: executor (chapéu BE, tarefa L4-T01)
- Escalado para: coordenador
- Artefato/trecho afetado: `prisma/schema.prisma` (enum `TripSessionStatus`,
  linhas 30-35) e `.md/SDD.md` (Seção 5, diagrama do modelo `TripSession`,
  linha 130) vs. `.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`
  (seção "Consequências", linhas 50-54)
- Descrição: ADR-006 define 11 estados granulares por etapa que a state
  machine do Orquestrador de Sessão (L4-T01) deve implementar:
  `entrada_selecionada`, `destino_pendente`, `destino_confirmado`,
  `hospedagem_pendente`, `hospedagem_aprovada`, `passeios_pendente`,
  `passeios_aprovados`, `roteiro_pendente`, `roteiro_aprovado`, `concluida`,
  `encerrada_parcial`. O schema Prisma já migrado em L1-T02 (`TripSession`)
  só tem um campo de status coarse-grained, `status TripSessionStatus`, cujo
  enum cobre apenas 4 valores (`in_progress`, `partial`, `completed`,
  `abandoned` — mesmos 4 valores documentados em `SDD.md` Seção 5, linha 130).
  Nenhum enum/campo do schema já migrado cobre literalmente os 11 estados
  granulares do ADR-006. O próprio ADR-006 deixa isso em aberto ("Estados
  possíveis da state machine (a serem detalhados na implementação)"), sem
  nunca amarrar essa lista a um campo de persistência específico.
- Impacto se não resolvido: L4-T01 (esta tarefa) consegue implementar a state
  machine como lógica pura (tipos TS isolados, sem tocar o schema), mas a
  próxima tarefa do lote, L4-T02 (persistência de transição de etapa em
  `TripSession` + entidade filha), depende diretamente de como o estado
  granular do ADR-006 é armazenado/derivado — sem uma decisão explícita do
  Coordenador, quem implementar L4-T02 teria que decidir sozinho, no meio da
  tarefa, entre (a) computar a posição granular a partir de dados já
  existentes (`entryPath` + presença de `DestinationApproval`/
  `AccommodationApproval`/`ActivityApproval`/`ItineraryItem` + `TripSessionStatus`
  para os estados terminais), sem alterar o schema; ou (b) alterar o schema
  Prisma acrescentando um novo campo/enum dedicado ao estado granular. Isso é
  uma decisão de arquitetura (mesmo nível do próprio ADR-006), não algo que
  uma tarefa de implementação individual deva decidir por conta própria.
- Sugestão (opcional, do executor): a opção (a) — derivar o estado granular a
  partir dos dados já existentes no schema, sem migração adicional — parece
  suficiente e consistente com o comentário de cabeçalho do schema ("linha
  ausente = etapa não aprovada, não um erro"): os estados `*_pendente` seriam
  transitórios (sugestão já mostrada ao usuário, aguardando aprovar/ajustar/
  encerrar, sem linha própria persistida enquanto pendente), os estados
  `*_confirmado`/`*_aprovada(o)`/`*_aprovados` mapeariam para a existência da
  linha de aprovação correspondente, e os terminais `concluida`/
  `encerrada_parcial` mapeariam para `TripSessionStatus.completed`/`partial`
  já existentes. Esta é só uma proposta do executor, não uma decisão — cabe ao
  Coordenador confirmar/ajustar (e, se aceitar, considerar registrar esse
  detalhe como adendo ao ADR-006, já que hoje ele deixa isso explicitamente
  "a ser detalhado na implementação") antes de L4-T02 iniciar.
- Status: Resolvido
- Resolução (2026-09-09, Coordenador): decisão (b) — alterar o schema Prisma —
  já tomada pelo usuário/orquestrador; formalizada pelo Coordenador como
  ADR-006, Adendo 1 (`.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`):
  novo campo `flowState`/`flow_state`, enum `SessionFlowState` com os 11
  valores de `SESSION_FLOW_STATES`, coexistindo com `TripSessionStatus`.
  `SDD.md` Seção 5 e `TASK.md` (L4-T02, status "Não iniciada") atualizados.
  A migration em si (`prisma migrate dev`, client, código de leitura/escrita)
  permanece escopo de implementação de L4-T02.

## Bloqueio 002 — 2026-09-10

- Reportado por: executor (chapéu BE, tarefa L7-T05)
- Escalado para: coordenador
- Artefato/trecho afetado: `src/lib/session-flow/state-machine.ts`
  (`SEQUENTIAL_TRANSITIONS`, linhas 108-144) vs. `.md/TASK.md` (Lote 7, linha
  1671, critério de aceite de L7-T05: "trocar volta ao campo de destino da
  tela de origem")
- Descrição: a tarefa L7-T05 (Server Action da tela T05, RF-11) exige duas
  ações: "Confirmar e continuar" e "Trocar destino". A state machine já
  implementada em L4-T01 (`transitionSessionFlow`) só tem transições
  sequenciais para frente (`iniciar`/`aprovar`/`ajustar`/`avancar`) e uma
  transição terminal (`encerrar`) — nenhuma ação regressiva. A partir do
  estado onde a tela T05 vive (`destino_confirmado`), a única ação válida na
  tabela `SEQUENTIAL_TRANSITIONS` é `avancar` (→ `hospedagem_pendente`). Não
  existe nenhuma ação que leve `destino_confirmado` de volta a
  `destino_pendente` (ou a qualquer estado anterior). O critério de aceite de
  L7-T05 assume implicitamente que essa transição regressiva existe/é
  possível de implementar sem tocar a state machine, o que não é o caso.
- Impacto se não resolvido: a parte "Confirmar" de L7-T05 foi implementada
  normalmente (`confirmarDestino`, delega para `applySessionFlowTransition`
  com `action: "avancar"`, já testada). A parte "Trocar destino" NÃO foi
  implementada — nenhuma função `trocarDestino`/Server Action equivalente foi
  criada. Sem uma decisão do Coordenador, L7-T04 (UI da mesma tela, rodando em
  paralelo) não tem uma Server Action para chamar no botão "Trocar destino" e
  precisa, na melhor das hipóteses, tratar isso como navegação client-side
  pura (voltar à tela anterior sem alterar `flowState` no servidor) — o que
  deixaria a sessão com `flowState: destino_confirmado` mesmo com o usuário
  "editando" o destino de novo, um estado inconsistente que pode causar
  comportamento errado em telas futuras que leem `flowState` para decidir o
  que mostrar.
- Sugestão (opcional, do executor): duas opções em aberto, nenhuma decidida
  aqui — (a) adicionar uma transição regressiva explícita à state machine
  (ex.: nova ação `revisar`/`trocar`, `destino_confirmado` → `destino_pendente`,
  possivelmente também limpando/marcando como obsoleta a `DestinationApproval`
  já criada, o que teria efeito colateral sobre RN-03/histórico de aprovação);
  ou (b) tratar "Trocar destino" como navegação client-side pura, sem tocar a
  state machine — a sessão permanece `destino_confirmado` e uma nova aprovação
  de destino (RF-04.3, L7-T03) simplesmente sobrescreve/cria uma nova
  `DestinationApproval` quando o usuário confirmar de novo, mas isso depende
  de como `applySessionFlowTransition`/`persistApprovedChildData` tratam uma
  segunda aprovação a partir de um estado que já não é mais `destino_pendente`
  (hoje rejeitariam, via `InvalidTransitionError`, porque o `flowState` já é
  `destino_confirmado`) — ou seja, a opção (b) sozinha também não fecha o
  ciclo sem alguma mudança. Decisão de arquitetura (mesmo nível de ADR-006),
  não algo que esta tarefa individual deva decidir por conta própria.
- Status: Resolvido
- Resolução (2026-09-10, Coordenador): decisão (a) — nova ação regressiva
  `revisar` (não `trocar`, ver justificativa no ADR), formalizada como
  ADR-006, Adendo 2
  (`.md/adr/006-orquestracao-de-fluxo-em-etapas-state-machine.md`). Modelada
  de forma genérica (uma transição `*_confirmado`/`*_aprovada(o)`/
  `*_aprovados` → `*_pendente` da mesma etapa, para as 4 etapas: destino,
  hospedagem, passeios, roteiro), não só para destino — evita repetir este
  bloqueio idêntico em L8/L9/L10 quando essas telas precisarem de uma ação
  equivalente, sem criar nenhuma tarefa nova de UI para elas agora (fora do
  que já está declarado necessário). `revisar` não afeta a aprovação de
  nenhuma etapa anterior já confirmada, só apaga a(s) linha(s) de aprovação
  da própria etapa reaberta (0..1 ou o conjunto, conforme a entidade) — não
  há histórico de aprovação a preservar (`DestinationApproval`/
  `AccommodationApproval` já são 0..1 por sessão), então a dúvida sobre
  "efeito colateral sobre RN-03/histórico" da opção (a) fica resolvida: não
  há histórico, só o registro atual, substituído normalmente na próxima
  aprovação. `SDD.md` Seção 5 atualizado com nota curta. `TASK.md`
  atualizado com instrução para quem retomar L7-T05 (implementar `revisar`
  na state machine/persistência e a Server Action `trocarDestino`) e L7-T04
  (trocar `router.back()` por chamar a nova Server Action, mantendo o mesmo
  rótulo de botão "Trocar destino"). A implementação em si (state machine,
  persistência, Server Actions, UI) permanece escopo do Executor.

## Bloqueio 003 — 2026-09-10

- Reportado por: validador (chapéu DevSecOps, auditoria do Lote 7)
- Escalado para: coordenador (redesenho de sequenciamento de dependência);
  sinalizado ao gestor em paralelo (relevância estratégica de segurança/custo)
- Artefato/trecho afetado: `.md/TASK.md` Seção 3 (L11-T03, linha 2324:
  "Depende de: L3-T02") e Seção 4 (Dependências e Ordem de Execução) vs.
  `.md/SECURITY-REVIEW.md` (Lote 3, item 1 — achado já registrado em
  2026-09-09, nunca resolvido)
- Descrição: a auditoria de segurança do Lote 3 (`SECURITY-REVIEW.md`, item 1)
  já havia identificado que `L11-T03` ("Validação/sanitização de entrada de
  texto livre... contra prompt injection", GUARDRAILS.md regra 18) precisa
  estar concluída **antes** de qualquer tarefa que alimente
  `StageContext.destination.name`/`accommodation.name`/etc. a partir de texto
  livre real do usuário em `buildHospedagemPrompt`/`buildPasseiosPrompt`/
  `buildRoteiroPrompt` (`src/lib/gateway-ia/prompts.ts`) — sob risco de
  prompt injection sem mitigação de entrada (a validação hoje é só
  estrutural/Zod, nunca de conteúdo). Na época (Lote 3), o risco era
  classificado como baixo porque nenhum caminho real ainda populava esse
  campo a partir de input do usuário. **Isso mudou neste lote**: L7-T03
  (`informarDestinoManualmente`, `src/lib/actions/destino.ts`) agora persiste
  `DestinationApproval.name` a partir de texto livre do usuário, sanitizado
  só por `trim()` + truncagem de tamanho (`DESTINO_MAX_LENGTH`), sem nenhuma
  mitigação de conteúdo contra instrução embutida — e esse valor é o que vai
  virar `context.destination.name`, interpolado literalmente em
  `buildHospedagemPrompt`/`buildPasseiosPrompt`/`buildRoteiroPrompt` assim que
  L8-T01/L9-T01/L10-T01 (ainda não iniciados) forem implementados. `L11-T03`
  continua na Seção 3 do `TASK.md` só com `Depende de: L3-T02`, sem nenhuma
  dependência reversa que force sua conclusão antes de L8-T01/L9-T01/L10-T01
  — a mesma lacuna de sequenciamento já sinalizada no Lote 3 permanece sem
  decisão formal do Coordenador.
- Impacto se não resolvido: nenhum ainda — L8/L9/L10 (os únicos consumidores
  reais de `context.destination.name` em prompt) não existem no código hoje,
  então não há exploração possível neste momento. O risco se torna real e
  imediato no momento em que L8-T01 (primeira tarefa que monta
  `StageContext.destination` a partir de uma `TripSession` real) for
  implementada sem `L11-T03` já concluída antes.
- Sugestão (do validador, não uma decisão): adicionar `L11-T03` como
  dependência explícita de `L8-T01`/`L9-T01`/`L10-T01` na Seção 3/4 do
  `TASK.md` (redesenho pequeno de sequenciamento, não de escopo), garantindo
  que a sanitização de conteúdo exista antes do primeiro consumo real —
  decisão de dependência/ordem de execução, mesmo nível de autoridade do
  Coordenador, não do Validador.
- Severidade (chapéu DevSecOps): **média** — não bloqueia o fechamento do
  Lote 7 (nenhuma exploração possível hoje, critério de aceite de L7-T01/
  L7-T03/L7-T04/L7-T05 cumprido integralmente), mas precisa de decisão antes
  do início do Lote 8. Não bloqueia deploy do que já está pronto (Lotes 1-7),
  mas bloqueia — na avaliação deste chapéu — o deploy de qualquer versão que
  inclua L8-T01/L9-T01/L10-T01 sem `L11-T03` concluída antes.
- Status: Resolvido
- Resolução (2026-09-10, Coordenador): decisão de sequenciamento (não de
  escopo) — mesma direção geral sugerida pelo Validador, com um ajuste:
  `L11-T03` **permanece** no Lote 11, com o mesmo ID, mesma seção, mesma
  estimativa (0.5 dia) e mesmo critério de aceite (renumerar/mover a tarefa
  para antes do Lote 8 cascatearia referência em vários pontos do próprio
  `TASK.md`, `SECURITY-REVIEW.md` e neste `BLOCKERS.md` que já a citam por
  esse ID, sem nenhum ganho real sobre simplesmente ajustar a dependência).
  O que muda: (1) `L8-T01`, `L9-T01` e `L10-T01` — as 3 tarefas que
  efetivamente interpolam `destination.name`/`accommodation.name` de texto
  livre em prompt pela primeira vez — ganham `L11-T03` como dependência
  explícita adicional na coluna "Depende de" da Seção 3 do `TASK.md`;
  nenhuma das 3 pode iniciar implementação antes de `L11-T03` estar
  `Concluída`. (2) A Seção 4 (Dependências e Ordem de Execução) do
  `TASK.md` passa a registrar uma exceção explícita: `L11-T03` não segue
  mais a cadência normal do Lote 11 (que só abre depois dos Lotes 6-10) —
  fica elegível para execução assim que `L3-T02` (Lote 3) concluir, em
  paralelo aos Lotes 4-7. `L11-T01`/`L11-T02`/`L11-T04` continuam presos à
  cadência normal do Lote 11, sem nenhuma mudança. Nenhum ADR novo aberto:
  é uma decisão puramente de ordem de execução de tarefas já definidas, sem
  alterar nenhuma decisão de arquitetura/modelagem já registrada em ADR ou
  no `SDD.md`. **Impacto prático para quem rodar `/executar` a partir de
  agora**: `L11-T03` deve ser priorizada e disparada assim que `L3-T02`
  estiver `Concluída` (já está, desde o Lote 3) — não precisa esperar o
  fechamento dos Lotes 6-10 para iniciar essa tarefa especificamente, e
  `L8-T01`/`L9-T01`/`L10-T01` não devem iniciar implementação enquanto
  `L11-T03` não estiver `Concluída`. `TASK.md` Seção 3 (linhas das tarefas
  L8-T01/L9-T01/L10-T01/L11-T03), Seção 4 (diagrama ASCII) e Seção 6
  (lacunas sinalizadas) atualizados com o detalhamento completo desta
  resolução.

## Bloqueio 004 — 2026-09-10

- Reportado por: executor (chapéu BE, tarefa L11-T02)
- Escalado para: coordenador
- Artefato/trecho afetado: `prisma/schema.prisma` (`model TripSession`, campo
  `userId`, linhas 151-157) e `src/lib/session-flow/create-session-with-range.ts`
  (`createSessionWithDateRange`, linhas 63-73) vs. `.md/SDD.md` (Seção 7,
  linhas 246-248: "toda leitura/escrita em `TripSession`... exige que o
  identificador de sessão (cookie) ou `user_id` autenticado corresponda ao
  dono do registro") e `.md/TASK.md` (Seção 1, item 9; L11-T02, critério de
  aceite: "Requisição com cookie/`user_id` de outra sessão recebe 403/404,
  nunca expõe dado de terceiro").
- Descrição: L11-T02 pede um guard central que resolve o dono ESPERADO da
  sessão (cookie anônimo `anon_session_id` — `src/lib/anonymous-session.ts` —
  OU `user_id` autenticado via NextAuth) e compara contra o dono REAL gravado
  em `TripSession`. Essa comparação pressupõe que `TripSession` já registra
  quem é o dono no momento da criação. Isso não é o caso hoje, para NENHUM dos
  dois mecanismos de identidade do projeto:
  1. **Sessão anônima**: `TripSession` (schema já migrado em L1-T02/L4-T02)
     não tem nenhuma coluna equivalente a `anon_session_id`/`anonSessionId` —
     só `userId` (nullable, para conta) e `flowState`/`status`. Não existe
     nenhum jeito de derivar, a partir de uma `TripSession` já persistida,
     qual cookie de visitante a criou.
  2. **Conta autenticada**: mesmo quando o usuário está logado, `userId` NUNCA
     é gravado em nenhum ponto de criação real do projeto —
     `createSessionWithDateRange` (único ponto de INSERT de `TripSession` fora
     de teste, chamado por `submeterDataLivre`/`processarFeriadoEscolhido`/
     `submeterQuiz`, Lotes 6/7) não aceita `userId` como parâmetro nem o grava
     no `data` do `prisma.tripSession.create`. O comentário já existente no
     schema (`prisma/schema.prisma`, linha 156: "L1-T03 só garante que
     `userId` autenticado fica disponível para uso futuro") confirma que isso
     é uma lacuna conhecida e deliberadamente adiada, não um bug desta tarefa.
  Sem (1) e (2), um guard "compara dono esperado vs. dono real" não tem dado
  real para comparar — qualquer implementação hoje ou (a) rejeitaria SEMPRE
  (toda `TripSession.userId` é `null`, todo `anon_session_id` não tem contra-
  parte gravada), quebrando o fluxo anônimo legítimo que é o caminho principal
  do produto (RF-01/02/03 não exigem conta), ou (b) teria que inventar uma
  heurística não especificada em nenhum artefato (ex. "primeira requisição
  après-create define o dono", sujeita a race condition e sem endosso do
  SDD.md). Isso é uma decisão de modelo de dados (mesmo nível do ADR-006
  Adendo 1, que resolveu uma lacuna estrutural análoga para `flowState`), não
  um detalhe de implementação que este Executor deva decidir sozinho —
  guardrail explícito do papel: "NUNCA reinterpreta ADR ou diretriz... lacuna
  de arquitetura... sempre volta para o coordenador."
- Impacto se não resolvido: L11-T02 não pode ser implementada com
  correção — o guard central pedido não teria contra quem comparar. Todas as
  Server Actions que hoje já documentam "autorização de dono de sessão
  (L11-T02, ainda não implementada)" como fora de escopo
  (`src/lib/actions/destino.ts`, `confirmacao-destino.ts`, `data-livre.ts`,
  `feriados.ts`, `quiz.ts`, e o núcleo `src/lib/session-flow/persistence.ts`/
  `create-session-with-range.ts`) continuam sem checagem de dono até esta
  decisão ser tomada.
- Sugestão (opcional, do executor, mesma margem de "proposta não-decisão" do
  Bloqueio 001): (a) adicionar `anonSessionId String? @map("anon_session_id")`
  a `TripSession` (nullable, mutuamente exclusivo com `userId` na prática —
  sessão anônima vs. autenticada — mas sem `CHECK` constraint formal, seguindo
  o mesmo estilo já usado no schema); (b) `createSessionWithDateRange` passa a
  aceitar um novo campo obrigatório `owner: { type: "user"; userId: string } |
  { type: "anonymous"; anonSessionId: string }`, resolvido pelo chamador
  (Server Action de tela, que já tem acesso a `getServerSession`/ao cookie via
  `next/headers`) e gravado no INSERT; (c) o guard central de L11-T02
  (`src/lib/session-flow/authorization.ts` ou nome equivalente) resolve o
  "dono esperado" da requisição corrente (mesma lógica de (b)) e compara
  contra `TripSession.userId`/`anonSessionId` já gravados, retornando 404
  (nunca 403, para não revelar existência do registro a um dono errado)
  quando não bate; chamado no início de toda função pública de
  `src/lib/session-flow/persistence.ts` (`applySessionFlowTransition`) e de
  `gerarSugestoesDestino`/toda leitura direta de `TripSession` fora desse
  módulo. Como a migration em si (schema + `prisma migrate dev` + client) e o
  fan-out de "quem resolve `owner` em cada Server Action de tela" tocam
  arquitetura/contrato de várias tarefas já `Concluída`s (Lotes 6/7),
  Este Executor não altera o schema nem a assinatura de
  `createSessionWithDateRange` sem essa decisão confirmada pelo Coordenador —
  mesmo padrão do Bloqueio 001.
- Status: Resolvido
- Resolução (2026-09-10, Coordenador): proposta do Executor aceita em
  essência (a)+(b)+(c), com refinamentos, formalizada como **ADR-008**
  (`.md/adr/008-propriedade-e-autorizacao-de-trip-session.md`) — ADR novo,
  não adendo ao ADR-006 (escopo distinto: autorização/SDD §7, não
  orquestração de etapa). O que muda exatamente:
  1. **Schema**: `TripSession` ganha `anonSessionId String? @map("anon_session_id")`,
     nullable, coexistindo com `userId` (mutuamente exclusivos na prática,
     sem `CHECK` formal — mesmo estilo já usado no schema).
  2. **`createSessionWithDateRange`**: passa a exigir um parâmetro
     `owner: { type: "user"; userId } | { type: "anonymous"; anonSessionId }`,
     resolvido pelo CHAMADOR e gravado no `INSERT`. Regra de resolução (a
     única diferença de detalhe em relação à proposta do Executor):
     **precedência de conta autenticada sobre cookie anônimo** quando ambos
     presentes na requisição — `getServerSession(authOptions)` primeiro, cookie
     via `resolveAnonymousSessionId` só se não houver sessão NextAuth válida.
  3. **Guard central**: resolve o dono esperado da requisição com a mesma
     regra de precedência, compara contra `userId`/`anonSessionId`
     persistidos, autoriza só quando os dois batem no mesmo mecanismo de
     identidade; qualquer outro caso (incluindo registro sem dono gravado)
     retorna **404 sempre — nunca 403** (decisão fixada, não mais "403/404"
     como o critério de aceite original deixava em aberto).
  4. **Sem migração retroativa de sessão anônima para conta**: decisão de
     escopo explícita (não lacuna) — ver ADR-008, item 5.
  - **`L11-T02` reaberta como `Não iniciada`, dividida em duas tarefas** (ver
    `.md/TASK.md`, Seção 3, Lote 11, e nota de resolução completa logo após
    a tabela):
    - **`L11-T02a` (nova)**: persistência do dono — migration do schema +
      `createSessionWithDateRange` + retrofit pontual de `submeterDataLivre`
      (`src/lib/actions/data-livre.ts`, L6-T03), `processarFeriadoEscolhido`
      (`src/lib/actions/feriados.ts`, L6-T05) e `submitQuizAnswers`
      (`src/lib/actions/quiz.ts`, L6-T07) para resolver e passar `owner`.
      Mantida DENTRO desta única tarefa (não virou 3 tarefas por chamador)
      por inseparabilidade documentada em `TASK.md` Seção 6: mesma mudança
      mecânica de contrato, aplicada de forma idêntica nos 3 pontos de um
      único helper compartilhado, sem regra de negócio nova. Estimativa: 1
      dia. `Depende de: L1-T03, L4-T02`.
    - **`L11-T02` (revisada)**: guard central em si + integração em
      `applySessionFlowTransition` (`src/lib/session-flow/persistence.ts`),
      `gerarSugestoesDestino` e qualquer outro ponto de leitura direta de
      `TripSession`. `Depende de: L11-T02a` (nova dependência interna do
      Lote 11 — o guard não tem contra o que comparar sem o dado persistido
      primeiro). Estimativa reduzida de 1 para 0.5 dia (a complexidade de
      persistência do dono migrou para `L11-T02a`). Critério de aceite
      ajustado para "sempre 404, nunca 403".
  - **Instrução para quem retomar**: implementar `L11-T02a` primeiro (schema
    + migration + helper + retrofit dos 3 chamadores + teste cobrindo os
    dois fluxos — anônimo e autenticado — sem regressão nas 3 Server Actions
    já `Concluída`s), só então `L11-T02` (guard + integração + teste: dono
    legítimo passa, identidade de outra sessão recebe 404 sem vazar dado).
  - `SDD.md` atualizado: Seção 4 (índice de ADRs, nova linha ADR-008), Seção 5
    (diagrama `TripSession` com `anon_session_id`, nota explicando o campo) e
    Seção 7 (autorização — dono gravado na criação, precedência, sempre 404).
    Nenhum ADR/decisão anterior (ADR-005/ADR-006) alterado.

## Bloqueio 005 — 2026-09-12

- Reportado por: validador (chapéu QA, validação funcional do Lote 10 —
  Roteiro Final e Encerramento)
- Escalado para: coordenador
- Artefato/trecho afetado: `.md/TASK.md` (Seção 3 — Lotes 8, 9, 10 e Lote 11)
  vs. `src/app` (estrutura de diretórios real)
- Descrição: **padrão recorrente, não um bug de uma tarefa isolada**. A
  partir de T06 (Hospedagem, Lote 8), nenhuma das telas subsequentes da
  jornada principal (T06/`HospedagemSugestoesScreen`, T07/
  `PasseiosSugestoesScreen`, T08/`RoteiroScreen`, T-END/`EncerramentoScreen`)
  tem um `page.tsx` real sob `src/app` que a monte com `sessionId` resolvido
  da querystring/sessão e a sirva numa rota navegável — confirmado por
  inspeção direta de `src/app` (só existem `src/app/entrada/**`,
  `src/app/destino/page.tsx` e `src/app/destino/confirmacao/page.tsx`; não
  existe `src/app/hospedagem`, `src/app/passeios`, `src/app/roteiro`, nem
  `src/app/encerramento` em nenhum lugar da árvore). Cada tarefa de tela
  (L8-T02, L9-T02, L10-T02) e a tela de encerramento (L10-T04) documentou
  esse gap individualmente na própria nota de implementação, sempre como
  "não bloqueante, fora do escopo desta tarefa" — decisão razoável tarefa a
  tarefa, mas em nenhum lote (8, 9, 10) nem no Lote 11 (Cross-cutting Final,
  já `Concluída`) existe uma tarefa que efetivamente crie essas 4 rotas +
  a Server Action de leitura que `EncerramentoScreen` (L10-T04) precisa para
  montar `EncerramentoResumo` a partir de `DestinationApproval`/
  `AccommodationApproval`/`ActivityApproval`/`ItineraryItem` já persistidos.
  Adicionalmente, `RoteiroScreen`/`PasseiosSugestoesScreen`/
  `HospedagemSugestoesScreen` recebem `sessionId` como prop simples — nenhuma
  delas documenta de onde esse `sessionId` viria numa página real (nem
  `useSearchParams` nem leitura de cookie/sessão no componente).
- Impacto se não resolvido: com todo o conteúdo dos Lotes 6-10 (`Concluída`)
  e o Lote 11 (Cross-cutting Final, `Concluída`) já implementados, um usuário
  real que chegasse até `destino_confirmado` (T05) não teria como navegar
  fisicamente até T06/T07/T08/T-END em produção — os links "Continuar para
  hospedagem/passeios/roteiro" de cada tela (`router.push`) apontam para
  rotas que hoje resultam em 404. Isso não impede a validação funcional
  tarefa a tarefa (cada regra de negócio/Server Action/componente isolado
  funciona e está coberto por teste, confirmado nesta validação), mas
  impede a jornada ponta a ponta funcionar no produto real — um risco maior
  agora porque a preparação de infraestrutura/deploy já está em andamento em
  paralelo (`vercel.json`, `.github/workflows/deploy.yml`, `.md/DEPLOY.md`
  presentes no repositório nesta mesma janela de tempo, chapéu DevOps).
- Sugestão (opcional, do validador): decompor uma tarefa nova (ou um
  pequeno lote de "Integração de Rotas", já que toca Lotes 6-10 sem
  pertencer estritamente a nenhum deles) que crie os 4 `page.tsx` faltantes
  (`src/app/hospedagem`, `src/app/passeios`, `src/app/roteiro`,
  `src/app/encerramento`), resolvendo `sessionId` da querystring (mesmo
  padrão de `src/app/destino/confirmacao/page.tsx`) e, para T-END
  especificamente, uma Server Action nova de "obter resumo da sessão" que
  monte `EncerramentoResumo` a partir dos registros já persistidos — decisão
  de decomposição/priorização cabe ao Coordenador, não ao Validador.
- Status: Resolvido

**Nota de resolução do Bloqueio 005 (2026-09-12, Coordenador)**: confirmado
por leitura direta do código — `src/app` de fato não tem `hospedagem/`,
`passeios/`, `roteiro/` nem `encerramento/`, só `entrada/**`, `destino/
page.tsx` e `destino/confirmacao/page.tsx`; os três componentes de tela
citados (`HospedagemSugestoesScreen`, `PasseiosSugestoesScreen`,
`RoteiroScreen`) de fato recebem `sessionId` só como prop, sem nenhum ponto
real de resolução a partir de querystring/sessão; `EncerramentoScreen`
de fato não tem nenhuma Server Action de leitura que monte
`EncerramentoResumo`. O padrão de `src/app/destino/confirmacao/page.tsx`
(L7-T04 — Server Component fino, resolve `sessionId`/`flowState` via
`searchParams`, `redirect("/")` quando faltar o essencial) é reaproveitável
sem alteração de abordagem para as 4 rotas faltantes.

Decisão de decomposição: criado um lote novo dedicado, **Lote 12 —
Integração de Rotas**, em vez de distribuir como tarefas de `Refatoração
Lote-N` dentro de 8/9/10 — o gap não é uma correção de comportamento já
implementado dentro do escopo de um lote específico (como as refatorações
RL6/RL8 existentes), é a ausência de uma peça inteira que nunca esteve no
escopo de nenhuma tarefa, atravessando 3 lotes de tela mais o Lote 11 (a
Server Action de leitura depende de tipos de aprovação persistidos desde o
Lote 7). Mesmo raciocínio já usado para o próprio Lote 11 (Cross-cutting
Final): trabalho que não pertence a um lote de origem específico vira lote
próprio.

Tarefas criadas (`.md/TASK.md`, Seção 3, "Lote 12 — Integração de Rotas
(T06-T-END)"): `L12-T01` (rota `/hospedagem`, FE, 0.25 dia, depende de
`L8-T02`), `L12-T02` (rota `/passeios`, FE, 0.25 dia, depende de `L9-T02`),
`L12-T03` (rota `/roteiro`, FE, 0.25 dia, depende de `L10-T02`), `L12-T04`
(Server Action de leitura `obterResumoEncerramento`, BE, 0.5 dia, depende de
`L7-T03`/`L8-T03`/`L9-T03`/`L10-T03`/`L11-T02` — aplica o guard de dono de
sessão antes de ler), `L12-T05` (rota `/encerramento`, FE, 0.5 dia, depende
de `L10-T04` e `L12-T04`). `L12-T01`/`L12-T02`/`L12-T03`/`L12-T04` são
mutuamente paralelizáveis; só `L12-T05` tem ordem obrigatória (precisa de
`L12-T04` concluída primeiro). Nenhuma tarefa mistura tela e Server Action na
mesma unidade, seguindo a mesma convenção de não-mistura do resto do
`TASK.md`. Nenhum ADR novo — não é mudança de decisão arquitetural do
`SDD.md`, é decomposição de um trabalho que já estava implícito na jornada
navegável do `UX-SPEC.md`/`PRD-TECNICO.md` e nunca tinha virado tarefa
própria. `TASK.md` atualizado: Seção 3 (nova tabela do Lote 12), Seção 4
(dependências/paralelismo do Lote 12) e Seção 6 (lacuna estrutural
registrada, com a resolução). Próximo passo: `/executar` sobre o Lote 12.

## Bloqueio 006 — 2026-09-12

- Reportado por: validador (chapéu QA, Validação Final de Confirmação
  pré-staging, Comando 3/`EXECUTION-FLOW.md`, sobre o conjunto completo
  Lotes 1-12)
- Escalado para: coordenador (decomposição de tarefas novas — mesmo
  raciocínio do Bloqueio 005/Lote 12); sinalizado ao gestor em paralelo
  (relevância estratégica: bloqueia o valor de negócio de todo o release)
- Artefato/trecho afetado: `src/app/entrada/data-livre/page.tsx` (L6-T02),
  `src/app/entrada/feriados/feriados-screen.tsx` (L6-T04),
  `src/app/entrada/quiz/page.tsx` (L6-T06) e
  `src/app/destino/confirmacao/confirmacao-destino-client.tsx` (L7-T04) vs.
  jornada principal T00→T-END (`PRD-TECNICO.md`/`UX-SPEC.md`)
- Descrição: **padrão recorrente, não um bug de uma tarefa isolada** — mesma
  natureza do Bloqueio 005, mas no lado de ENTRADA da jornada (T01-T05), não
  no de rotas de destino (T06-T-END) já resolvido pelo Lote 12. Verificação
  direta de código (não das notas de implementação) confirma que nenhuma
  tela de `src/app/entrada` importa `submeterDataLivre`/
  `processarFeriadoEscolhido`/`submitQuizAnswers` (as 3 Server Actions de
  L6-T03/L6-T05/L6-T07, todas `Concluída`) — cada tela (T01/T02/T03)
  documentou essa integração como "fora de escopo, aguardando a Server
  Action irmã" no momento em que foi implementada, mas nenhuma tarefa
  posterior (Lote 6, 7, 11 ou 12) voltou para conectar UI → Server Action →
  navegação. O mesmo padrão se repete em T05
  (`confirmacao-destino-client.tsx`, L7-T04): `confirmarDestino` (L7-T05)
  avança corretamente o `flowState` no servidor, mas o client nunca chama
  `router.push` para `/hospedagem` depois da Promise resolver — só "Trocar
  destino" navega. Por contraste, T06→T07→T08→T-END (Lotes 8/9/10) fazem
  isso corretamente (Server Action primeiro, `router.push` só depois de
  confirmado), confirmando que o problema está concentrado nas transições
  mais antigas da jornada (T01-T05), implementadas antes do precedente do
  Bloqueio 005/Lote 12 existir.
- Impacto se não resolvido: nenhum usuário real completa a jornada
  principal do produto pela UI publicada — trava já em T01/T02 (nenhum
  caminho de entrada avança), ou, se uma sessão for criada por outro meio,
  trava em T05 (confirmar destino não leva a lugar nenhum). Isso invalida a
  premissa de que os 12 lotes, publicados juntos nesta primeira promoção a
  staging, entregam um produto funcional de ponta a ponta — apesar de cada
  Server Action e cada componente estarem corretos e testados
  isoladamente, e de todas as validações por lote (`QA-REPORT.md`) terem
  aprovado corretamente o que cada critério de aceite exigia literalmente.
- Sugestão (opcional, do validador, mesmo padrão do Bloqueio 005): um novo
  lote (ou tarefas adicionadas a um lote de integração já existente) que
  conecte explicitamente: (a) `T01DateRangeForm`/`onValid` →
  `submeterDataLivre` + `router.push` para `/destino` ou
  `/destino/confirmacao` conforme o retorno; (b) `FeriadosScreen` — botão de
  continuar novo → `processarFeriadoEscolhido` + navegação equivalente; (c)
  `QuizPage`/`onComplete` → `submitQuizAnswers` + navegação equivalente; (d)
  `confirmacao-destino-client.tsx` — `router.push("/hospedagem?...")` após
  `confirmarDestino` resolver, mesmo padrão já usado em
  `hospedagem-sugestoes-screen.tsx`/`passeios-sugestoes-screen.tsx`/
  `roteiro-screen.tsx`. Decisão de decomposição/priorização (lote novo vs.
  reabrir tarefas existentes) cabe ao Coordenador, não ao Validador.
- Severidade (chapéu QA): **crítica** — compromete o critério de aceite
  central da combinação dos 12 lotes (jornada navegável T00→T-END).
  **Bloqueia este deploy** (Comando 3/`EXECUTION-FLOW.md`, promoção a
  staging do conjunto completo). Nenhuma tarefa individual revertida de
  `Concluída` para `Em andamento` — mesmo raciocínio do Bloqueio 005: o gap
  nunca pertenceu a uma tarefa específica já fechada (cada uma cumpriu
  literalmente seu próprio critério de aceite), é a ausência de tarefas de
  integração que nunca foram criadas.
- Status: Resolvido

**Nota de resolução do Bloqueio 006 (2026-09-12, Coordenador)**: confirmado
por leitura direta do código (não das notas de implementação) — os 4 pontos
citados pelo Validador batem exatamente com o código atual:
`src/app/entrada/data-livre/page.tsx` (T01) só renderiza `T01DateRangeForm`
sem `onValid` conectado a nenhuma Server Action; `src/app/entrada/feriados/
feriados-screen.tsx` (T02) não tem nenhum botão/ação de continuar, só o
`fieldset` de seleção e o campo de destino; `src/app/entrada/quiz/page.tsx`
(T03) termina em tela estática ("Respostas registradas... ainda estão em
construção") sem chamar `submitQuizAnswers`; `src/app/destino/confirmacao/
confirmacao-destino-client.tsx` (T05) passa `confirmarDestino` diretamente
como `onConfirmar` sem nenhum wrapper de navegação, enquanto `onTrocar`, no
mesmo arquivo, já chama a Server Action e navega (`router.back()`)
corretamente. Nenhum quinto ponto de wiring quebrado foi encontrado na
mesma jornada (T00, que só usa `next/link` estático para as 3 entradas, não
precisa de nenhuma Server Action; T04-T-END já corrigidos pelo Lote 12).

Decisão de decomposição: **`Refatoração Lote-6`/`Refatoração Lote-7`, não um
lote novo** — avaliado e rejeitado o mesmo caminho do Bloqueio 005/Lote 12
porque a natureza do gap é diferente: no Bloqueio 005, a peça faltante (rota +
Server Action de leitura nova) nunca pertenceu a nenhum lote de origem
específico, atravessando 3 lotes de tela mais o Lote 11. Aqui, cada gap mora
inteiramente dentro de um arquivo já pertencente a um lote de origem único e
já `Concluída` — `src/app/entrada/data-livre/page.tsx` (L6-T02),
`feriados-screen.tsx` (L6-T04) e `quiz/page.tsx` (L6-T06) pertencem ao Lote 6;
`confirmacao-destino-client.tsx` (L7-T04) pertence ao Lote 7 — e nenhuma
Server Action ou rota nova precisa ser criada (as 4 Server Actions e as 4
rotas de destino já existem e já foram validadas isoladamente). É exatamente
o padrão que `Refatoração Lote-N` já cobre no resto do `TASK.md` (terminar/
corrigir algo dentro do escopo de um lote já fechado), não o padrão do Lote
12 (ausência de uma peça inteira sem lote de origem).

Tarefas criadas (`.md/TASK.md`, Seção 3): em `Refatoração Lote-6` — `RL6-T02`
(conectar T01 a `submeterDataLivre` + navegação, FE, 0.25 dia, depende de
`L6-T02`/`L6-T03`/`L7-T02`/`L7-T04`), `RL6-T03` (adicionar botão "Continuar" a
`FeriadosScreen` conectado a `processarFeriadoEscolhido` + navegação, FE, 0.25
dia, depende de `L6-T04`/`L6-T05`/`L7-T02`/`L7-T04`), `RL6-T04` (conectar T03
a `submitQuizAnswers` + navegação, FE, 0.25 dia, depende de `L6-T06`/
`L6-T07`/`L7-T02`); em uma nova seção `Refatoração Lote-7` — `RL7-T01`
(conectar `onConfirmar` de `ConfirmacaoDestinoClient` a `router.push` para
`/hospedagem` após `confirmarDestino` resolver, FE, 0.1 dia, depende de
`L7-T04`/`L7-T05`/`L12-T01`). As 4 tarefas são mutuamente paralelizáveis
(arquivos distintos, sem sobreposição) e todas as suas dependências já estão
`Concluída`s, logo estão imediatamente elegíveis para execução. Diferente das
demais `Refatoração Lote-N` já registradas (que não têm prazo crítico), estas
4 TÊM prazo crítico: bloqueiam a promoção a staging do conjunto completo — ver
`.md/TASK.md` Seção 4 para o detalhamento. Nenhuma tarefa mistura tela e
Server Action (todas só conectam UI → Server Action já existente →
navegação), nenhuma se aproxima do canário de ~300 mil tokens. Nenhum ADR
novo — não é mudança de decisão arquitetural do `SDD.md` nem de experiência
do `UX-SPEC.md`, é decomposição de wiring que já estava implícito na jornada
navegável descrita em ambos e nunca tinha virado tarefa própria. `TASK.md`
atualizado: Seção 3 (tabelas de `Refatoração Lote-6`/nova `Refatoração
Lote-7`), Seção 4 (dependências/paralelismo/prazo crítico das 4 tarefas) e
Seção 6 (lacuna estrutural registrada, com a resolução completa). Próximo
passo: `/executar` sobre `RL6-T02`, `RL6-T03`, `RL6-T04` e `RL7-T01` antes de
qualquer nova tentativa de promoção a staging.

## Bloqueio 007 — 2026-09-12

- Reportado por: validador (chapéu DevOps, Comando 3/`EXECUTION-FLOW.md`,
  tentativa de deploy real em staging do conjunto completo Lotes 1-12, já
  com dupla aprovação QA + DevSecOps confirmada)
- Escalado para: gestor (decisão de negócio — criar conta/billing em
  serviços de terceiros não é decisão técnica; nenhum agente tem ou deve ter
  acesso para criar essas contas em nome do usuário)
- Artefato/trecho afetado: `.md/DEPLOY.md` Seção 1 (decisão já registrada
  como deliberadamente aberta: "provedor de PostgreSQL gerenciado... quem
  efetivamente criar a conta/instância do banco... fora do escopo desta
  preparação") vs. a necessidade real de publicar staging agora que os 12
  lotes têm dupla aprovação
- Descrição: nenhuma das três peças de infraestrutura real necessárias para
  um deploy de fato funcional existe hoje: (1) não há conta/projeto Vercel
  criado/linkado a este repositório (sem `.vercel/` local, sem evidência de
  projeto); (2) `VERCEL_TOKEN` não existe como GitHub Secret (nem
  repositório, nem Environment `staging`, confirmado via `gh secret list`/
  `gh api`); (3) nenhum provedor de PostgreSQL gerenciado foi criado —
  `DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY` reais de staging não
  existem em nenhum secret manager acessível, só placeholders em
  `.env.example`. Confirmado com evidência real, não hipotética: disparo
  efetivo do `deploy.yml` (`workflow_dispatch`, run
  `34722166920`) passou por checkout/install/build da pipeline e falhou
  exatamente no step que depende do token (`vercel pull --token=` vazio →
  `Error: You defined "--token", but it's missing a value`).
- Impacto se não resolvido: os 12 lotes, já duplamente aprovados (funcional +
  segurança), não podem ser publicados em staging nem produção — o produto
  continua existindo só como código versionado, sem nenhuma URL acessível
  para validação de release-readiness real ou uso pelo fundador/usuários.
- Sugestão (do validador, não uma decisão): itens de ação humana, detalhados
  passo a passo em `.md/DEPLOY.md` Seção 7 ("Pendências operacionais exatas
  para publicar staging de fato") — criar conta Vercel + gerar
  `VERCEL_TOKEN`; criar instância Postgres gerenciado (recomendação já
  registrada: Neon); gerar `NEXTAUTH_SECRET`/obter `OPENAI_API_KEY` reais;
  configurar as 3 variáveis como Environment Variables da Vercel; cadastrar
  `VERCEL_TOKEN` como GitHub Secret escopado ao Environment `staging`
  (já existe, criado implicitamente nesta tentativa, sem secrets ainda);
  adicionar step `prisma migrate deploy` ao `deploy.yml`. Depois disso,
  re-disparar o mesmo comando já documentado.
- Severidade (chapéu DevOps): **bloqueia publicação real** (staging e,
  consequentemente, produção) — não é débito de baixa/média severidade
  registrável em `Refatoração Lote-X` (não é código a corrigir, é
  infraestrutura/conta a provisionar por alguém com acesso de billing).
  Nenhuma tarefa `Concluída` revertida — o gap é puramente operacional,
  fora do código dos 12 lotes.
- Status: Aberto — aguardando ação humana (criação de contas/credenciais
  reais) fora do alcance de qualquer agente deste pipeline.

## Nota de escopo — o que a L4-T01 implementou apesar do bloqueio

Para não parar o lote inteiro sem necessidade, a L4-T01 foi implementada
como lógica pura de state machine (módulo novo, sem nenhuma dependência do
Prisma Client nem de `TripSession`), usando exatamente o vocabulário de
estados do ADR-006 como um tipo TypeScript autônomo. Essa parte não exige
nenhuma decisão sobre o Bloqueio 001, porque não toca o schema. O Bloqueio
001 trava especificamente a próxima tarefa do lote (L4-T02, persistência),
que é quem precisa da decisão do Coordenador antes de começar — ver nota de
implementação L4-T01 em `.md/TASK.md` para o detalhamento completo do que foi
entregue.
