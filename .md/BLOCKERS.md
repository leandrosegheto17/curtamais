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
- Status: Resolvido
- Resolução (2026-09-12, validador — Terceira Tentativa, chapéu DevOps):
  as 3 peças de infraestrutura real apontadas como faltantes foram
  provisionadas pelo usuário (ação humana, fora do alcance de qualquer
  agente, conforme já escalado ao gestor): (1) projeto Vercel criado e
  linkado ao repositório `leandrosegheto17/curtamais`; (2) banco Postgres
  gerenciado real criado no Neon (região `sa-east-1`); (3)
  `VERCEL_TOKEN`/`DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY`
  cadastrados como GitHub Secret no Environment `staging` (confirmado só
  pelos nomes/timestamps via `gh secret list`, nunca pelos valores — este
  Validador não solicita nem manuseia os valores reais) e as 3 variáveis de
  aplicação também cadastradas como Environment Variables na Vercel.
  Adicionalmente, `.github/workflows/deploy.yml` (commit `f17b0a0`, já em
  `main`) ganhou o step "Aplicar migrations Prisma no banco do
  ambiente-alvo" (`npm run db:migrate` = `prisma migrate deploy`, usando
  `secrets.DATABASE_URL`), item que a sugestão original deste bloqueio já
  apontava como pendência adicional. Confirmado por leitura direta do
  `deploy.yml` em disco: o step de migration está posicionado depois de
  `Install dependencies` e antes de `Install Vercel CLI`/`Pull configuração
  do ambiente Vercel`/`Build (Vercel)`/`Deploy (Vercel)` — ou seja, o schema
  do banco é aplicado antes de qualquer build/deploy consumir esse schema,
  e usa a env var correta (`secrets.DATABASE_URL`, mesmo secret já
  cadastrado no Environment `staging`). Este Validador não executou
  `prisma migrate deploy` localmente contra o Neon real nem testou nenhuma
  credencial real — isso é escopo do próprio workflow de deploy (próxima
  etapa), não desta validação. Nenhuma nova peça de infraestrutura
  pendente identificada. Ver `.md/QA-REPORT.md`, seção "Terceira Tentativa",
  para o detalhamento completo desta confirmação.

## Bloqueio 008 — 2026-09-12

- Reportado por: validador (chapéu DevOps, Comando 3/`EXECUTION-FLOW.md`,
  Tentativa 2 de deploy real em staging, depois do Bloqueio 007 já
  `Resolvido`)
- Escalado para: gestor (em paralelo, não como pré-requisito — ação sobre
  credencial de conta de terceiro/Vercel, fora do alcance de qualquer
  agente; não é redesenho de infraestrutura nem decisão de arquitetura)
- Artefato/trecho afetado: `.md/DEPLOY.md` Seção 7, "Tentativa 2 — Staging"
- Descrição: disparo real do `deploy.yml` (run
  [`34724116900`](https://github.com/leandrosegheto17/curtamais/actions/runs/34724116900))
  passou por `Checkout`/`Setup Node`/`Install dependencies`/`Aplicar
  migrations Prisma no banco do ambiente-alvo` (**sucesso real, primeira
  vez que a migration roda contra o Neon**)/`Install Vercel CLI`, e falhou
  no step `Pull configuração do ambiente Vercel` com `Error: User not
  found.` depois de `Loading teams…` — log real, não hipotético (`gh run
  view 34724116900 --log`). Diferente da falha da Tentativa 1 (token
  literalmente vazio: `--token=` sem valor), desta vez o comando passa um
  valor de token, mas a Vercel não reconhece esse valor como pertencente a
  nenhum usuário/conta válida. Causa mais provável: o `VERCEL_TOKEN`
  cadastrado no GitHub Environment `staging` está expirado, foi revogado,
  foi digitado incorretamente ao cadastrar o secret, ou foi gerado numa
  conta Vercel diferente da que tem o projeto `destino-ideal-ljs` linkado.
  `gh secret list --env staging` confirma que o secret existe (nome e
  timestamp `2026-09-12T22:30:58Z`, anterior a este run) — não é ausência
  de secret, é valor inválido, algo que este Validador não tem acesso para
  diagnosticar com mais precisão sem manusear o próprio valor (o que não
  deve fazer).
- Impacto se não resolvido: os 12 lotes continuam sem nenhuma URL de
  staging real publicada — o `200 OK` observado em
  `https://destino-ideal-ljs.vercel.app` (via `curl -sI`) é de um
  deployment pré-existente (provavelmente o placeholder criado ao linkar o
  projeto, ou um deploy manual anterior do usuário), não do conteúdo dos 12
  lotes aprovados neste ciclo — o job falhou antes de chegar em `Deploy
  (Vercel)`.
- Sugestão (do validador, não uma decisão): regenerar o token em Vercel →
  Account Settings → Tokens (confirmando que a conta usada é a mesma que
  tem o projeto `destino-ideal-ljs` linkado) e recadastrar com `gh secret
  set VERCEL_TOKEN --env staging --repo leandrosegheto17/curtamais`. Depois
  disso, re-disparar `gh workflow run deploy.yml --repo
  leandrosegheto17/curtamais -f environment=staging -f ref=main`.
- Severidade (chapéu DevOps): **bloqueia publicação real de staging** — não
  é débito de baixa/média severidade registrável em `Refatoração Lote-X`
  (não é código dos 12 lotes a corrigir; a dupla aprovação QA + DevSecOps
  permanece válida). É estritamente uma credencial de infraestrutura
  inválida, mais estreito que o Bloqueio 007 (ali faltava toda a
  infraestrutura; aqui a infraestrutura existe e a migration já funciona —
  só o token precisa ser regenerado).
- Status: **Ainda aberto — run real refuta a resolução relatada pelo
  usuário** — atualizado por: validador (chapéu DevOps, disparo real de
  `deploy.yml`, Comando 3/`EXECUTION-FLOW.md`, 2026-09-15). Usuário
  reportou ter regenerado o `VERCEL_TOKEN` em Vercel → Account Settings →
  Tokens e recadastrado via `gh secret set VERCEL_TOKEN --env staging`,
  exatamente a sugestão registrada acima. Este Validador então disparou de
  fato o `deploy.yml` (run
  [`35032873650`](https://github.com/leandrosegheto17/curtamais/actions/runs/35032873650))
  e acompanhou com `gh run watch` até a conclusão real: **o job falhou de
  novo no mesmo step, `Pull configuração do ambiente Vercel`, com o mesmo
  erro exato** (`Error: User not found.` depois de `Loading teams…`) — ver
  `.md/DEPLOY.md`, "Tentativa 3". Achado adicional: `gh secret list --env
  staging --repo leandrosegheto17/curtamais` mostra `VERCEL_TOKEN`
  ainda com timestamp `2026-09-12T22:30:58Z` — **idêntico** ao registrado
  antes do relato do usuário, o que indica que o `gh secret set` reportado
  não chegou a sobrescrever o secret neste repositório/Environment (rodado
  em local/conta/Environment errado, permissão insuficiente, ou não
  executado de fato). Recomendação ao usuário: re-executar `gh secret set
  VERCEL_TOKEN --env staging --repo leandrosegheto17/curtamais` e conferir
  com `gh secret list --env staging --repo leandrosegheto17/curtamais`
  que o timestamp mudou, antes de pedir um novo disparo deste workflow.
  Não reclassificar como `Resolvido` até um run real do `deploy.yml`
  passar do step `Pull configuração do ambiente Vercel`.
- **Status atualizado: Resolvido — 2026-09-17** (validador, chapéu DevOps,
  `.md/DEPLOY.md`, "Tentativa 4"). Três runs reais e sucessivos nesta
  mesma data passaram do step `Pull configuração do ambiente Vercel` e de
  todo o job até `Deploy (Vercel)`: run
  [`35244784239`](https://github.com/leandrosegheto17/curtamais/actions/runs/35244784239)
  (`success`, commit `810be02`), run
  [`35251451753`](https://github.com/leandrosegheto17/curtamais/actions/runs/35251451753)
  (`success`, mesmo commit), e run
  [`35255545544`](https://github.com/leandrosegheto17/curtamais/actions/runs/35255545544)
  (`success`, commit `87207bc`, disparado por este Validador). Nota: entre
  a Tentativa 3 e estas execuções, o `deploy.yml` também mudou (commits
  `15e9264`/`43ce275`, fora do fluxo `/executar` — `VERCEL_ORG_ID`/
  `VERCEL_PROJECT_ID` explícitos + build remoto na Vercel), então a
  resolução não é atribuível só à regeneração do token; de todo modo, o
  sintoma exato deste bloqueio (`Error: User not found.` em `vercel
  pull`) não se repetiu em nenhuma das três execuções — encerrado.

## Bloqueio 009 — 2026-09-15

- Reportado por: validador (chapéus QA+DevSecOps, confirmação final,
  Comando 3/`EXECUTION-FLOW.md`, Passo 1 — verificação de `git log`/`git
  status` desde os vereditos já registrados em `QA-REPORT.md`/
  `SECURITY-REVIEW.md`)
- Escalado para: gestor (em paralelo, não como pré-requisito — achado de
  relevância estratégica: risco de a jornada crítica de autenticação estar
  quebrada no ambiente real de deploy, mesmo com os 12 lotes aprovados
  localmente); coordenador, só se a causa raiz do NO_SECRET exigir mudança
  de configuração/arquitetura além de um valor de env var mal cadastrado
  (a definir depois que o próximo run real do `deploy.yml` confirmar o
  sintoma)
- Artefato/trecho afetado: `src/app/api/diag/route.ts` (commits `494c08c`,
  `e53a3d2`, 2026-09-14) — código novo em `src/`, fora do escopo de
  qualquer tarefa do `TASK.md`, criado diretamente pelo usuário/Opus fora
  do fluxo `executor`/`/executar`, sem revisão inline nem passagem por
  `/validar`
- Descrição: os commits `494c08c`/`e53a3d2` (entre a "Terceira Tentativa"
  de confirmação, commit `f17b0a0`, e esta Quarta confirmação) adicionam
  uma rota de diagnóstico temporária, `GET /api/diag` (renomeada de
  `/api/_diag`, que retornava 404 por o App Router tratar prefixo `_` como
  pasta privada). A mensagem do commit `494c08c` documenta o motivo:
  **"NextAuth fails with NO_SECRET in production despite NEXTAUTH_SECRET
  being configured on Vercel for Production."** — ou seja, houve pelo
  menos uma tentativa real de deploy/acesso ao ambiente de produção/preview
  da Vercel, posterior à Tentativa 2 (`.md/DEPLOY.md`, bloqueada por
  `VERCEL_TOKEN` inválido), que chegou a rodar a aplicação e encontrou
  autenticação quebrada por variável de ambiente não injetada — e essa
  tentativa/achado **nunca foi registrada em `.md/DEPLOY.md` nem como
  entrada própria em `.md/BLOCKERS.md`**, só existe nas mensagens de commit
  e no comentário do arquivo. Por leitura direta do código
  (`src/app/api/diag/route.ts`), a rota: (a) não exige autenticação — é
  pública, qualquer requisição `GET /api/diag` dispara a checagem; (b)
  nunca retorna o valor de nenhuma variável no corpo HTTP (sempre `204`
  vazio); (c) registra em `console.log` (log de função da Vercel, painel
  autenticado) a presença (`Boolean`) e o **tamanho** de
  `NEXTAUTH_SECRET`/`NEXTAUTH_URL`/`DATABASE_URL`/`OPENAI_API_KEY`, mais o
  **nome literal** de qualquer variável de ambiente cujo nome bata com
  `/NEXTAUTH|DATABASE|OPENAI|AI_GATEWAY/i`. Nenhum valor de segredo é lido
  para log (guardrail 15 do `GUARDRAILS.md` não é violado literalmente),
  mas é uma superfície pública, não autenticada, de reconhecimento
  operacional (confirma quais segredos existem e seu tamanho) — se
  publicada em produção real, é achado de exposição de dados sensíveis
  (chapéu DevSecOps, `sensitive-data-exposure-check`) de severidade
  **baixa/média**, não alta/crítica (nenhum segredo em si é exposto, só
  metadado, e só via log — não na resposta HTTP).
- Impacto se não resolvido: (1) esta rota, sendo código já em `main`,
  seria publicada junto com os 12 lotes no próximo deploy real, deixando um
  endpoint de diagnóstico "temporário" (o próprio comentário do arquivo diz
  "Remover assim que a causa do NO_SECRET for identificada") permanente em
  produção até alguém lembrar de removê-lo; (2) mais relevante: o sintoma
  que motivou a rota (`NO_SECRET` do NextAuth em produção apesar de
  `NEXTAUTH_SECRET` configurado na Vercel) nunca foi confirmado como
  resolvido em nenhum artefato — se ainda ocorrer, a autenticação (guardrail
  16, Lote 11 cross-cutting) estaria quebrada no ambiente real mesmo com a
  dupla aprovação QA+DevSecOps válida para o código local, porque o gap é
  de configuração/injeção de variável de ambiente na plataforma de deploy,
  não de lógica de aplicação — exatamente o tipo de regressão cruzada
  específica de ambiente que uma validação por lote isolado (rodada
  localmente, sem Vercel real) não cobre.
- Sugestão (do validador, não uma decisão): (a) confirmar explicitamente,
  no próximo run real de `deploy.yml`, se o `NO_SECRET` ainda ocorre —
  usando a própria rota de diagnóstico já presente, ou inspecionando as
  Environment Variables da Vercel diretamente (conferir se `NEXTAUTH_SECRET`
  está marcado para o ambiente correto — Production vs. Preview — já que
  `vercel pull --environment=preview` no `deploy.yml`, Bloqueio 008, usa o
  ambiente Preview, que pode ter um conjunto de env vars diferente do de
  Production na Vercel); (b) remover `src/app/api/diag/route.ts` assim que
  a causa for confirmada e corrigida, antes de qualquer deploy de produção
  (não é aceitável como débito permanente, já que o próprio autor a marcou
  como temporária); (c) registrar a resolução formal aqui e em
  `SECURITY-REVIEW.md` quando isso ocorrer.
- Severidade (chapéu DevSecOps): **não bloqueia sozinha** a promoção a
  staging dos 12 lotes já aprovados (a rota em si é baixa/média severidade,
  vira débito em `Refatoração Lote-X` se mantida por mais tempo) — mas o
  sintoma subjacente (`NO_SECRET` em produção) é potencialmente **crítico**
  se ainda ativo (autenticação quebrada é achado alto/crítico, guardrail
  16), e este Validador não tem como confirmar se já foi corrigido sem um
  run real do `deploy.yml`/inspeção do ambiente Vercel. Por isso a
  recomendação é **confirmar o sintoma antes de assumir a rota como sem
  função** — não prosseguir para produção sem essa confirmação, mesmo que
  o próximo disparo de staging siga adiante.
- Status: **Causa raiz reportada como corrigida pelo usuário (2026-09-16) —
  `NEXTAUTH_SECRET` ajustado no ambiente correto (Preview/Production) nas
  Environment Variables do projeto na Vercel.** Não confirmado por este
  Validador via run real (o próximo `deploy.yml` real segue bloqueado pelo
  Bloqueio 008, `VERCEL_TOKEN`), consistente com a sugestão (a) acima — só
  poderá ser marcado `Resolvido` de fato quando um deploy real completar e
  os Runtime Logs da Vercel confirmarem ausência do erro `NO_SECRET`.
  Sugestão (b) endereçada nesta mesma data: `src/app/api/diag/route.ts`
  **removida** (`git status`: `D src/app/api/diag/route.ts`; sem outro
  arquivo de código/teste referenciando a rota; `npm run lint` limpo após
  a remoção). Pendência remanescente: confirmação real via deploy
  bem-sucedido (sugestão (a)), condicionada à resolução do Bloqueio 008.
- **Atualização — 2026-09-17** (validador, chapéu DevOps, `.md/DEPLOY.md`,
  "Tentativa 4"): Bloqueio 008 resolvido nesta mesma data (ver acima), mas
  a pendência remanescente deste Bloqueio 009 (runtime livre de
  `NO_SECRET`) continua **não confirmável**: a URL de Preview publicada
  pelo `deploy.yml` (`https://destinoideal-er0dtuckj-...vercel.app`) está
  atrás de Vercel Deployment Protection (SSO — nova lacuna registrada em
  `.md/DEPLOY.md` Seção 6/7), então este Validador não conseguiu acessar
  `/api/auth/[...nextauth]` nem qualquer rota autenticada dessa URL via
  `curl` para confirmar ausência do erro em runtime. O build (`next
  build`) completou sem erro e sem menção a `NO_SECRET`/`NEXTAUTH` no log,
  necessário mas não suficiente (o erro original ocorria em runtime, não
  em build-time). Status mantido: **não confirmado**, agora bloqueado por
  motivo diferente (proteção de acesso à URL, não mais o Bloqueio
  008/`VERCEL_TOKEN`).
- **Atualização — 2026-09-19** (orquestrador, verificação por HTTP em
  produção): `https://destino-ideal-ljs.vercel.app` (deploy `--prod`, sem
  SSO) responde `200` em `/`, `/entrar`, `/api/auth/session` e
  `/api/auth/providers`; este último devolve o provedor `credentials`. O
  erro `NO_SECRET` derrubava justamente as rotas de autenticação em
  runtime, então a rota funciona com o `NEXTAUTH_SECRET` atual.
  Runtime Logs da Vercel não foram inspecionados (sem acesso ao painel).
- Status: **Resolvido** (2026-09-19) — confirmado por HTTP em produção; a
  conferência opcional dos Runtime Logs fica com o dono do produto.

## Bloqueio 010 — 2026-09-16

- Reportado por: executor (chapéu BE, tarefa V2-L3-T01)
- Escalado para: usuário/dono do produto (não o coordenador — não é decisão
  técnica de arquitetura/contrato, é revisão de conteúdo editorial, mesma
  natureza já prevista em `.md/TASK.md` Seção 5, linha sobre V2-L3-T01, e
  Seção 6, "Decisão de fronteira: roteiro de exemplo tem uma etapa humana
  dentro da tarefa")
- Artefato/trecho afetado: `src/content/roteiro-exemplo.ts` (gerado por
  `scripts/exportar-roteiro-exemplo.ts`) vs. `.md/adr/
  011-home-vitrine-estatica-e-conteudo-congelado.md` (item 4: "o conteúdo é
  revisado por uma pessoa... e congelado por commit") e `.md/TASK.md`
  (V2-L3-T01, critério de aceite: "conteúdo revisado pelo dono antes do
  commit")
- Descrição: a peça técnica de `V2-L3-T01` está pronta e testada — script
  (`scripts/exportar-roteiro-exemplo.ts`) capaz de ler uma `TripSession`
  real concluída via Prisma e gerar `src/content/roteiro-exemplo.ts`
  tipado com `Omit<RoteiroDayResult, "date"> & { dayLabel: string }`/
  `RoteiroItemResult` (reaproveitados de `src/lib/stage-rules/roteiro.ts`,
  não duplicados), com dias rotulados "Dia N — {dia da semana}" sem data de
  calendário. Mas o conteúdo atualmente em `src/content/roteiro-exemplo.ts`
  foi gerado em **modo fixture**: `npx prisma db pull --print` contra a
  `DATABASE_URL` local deste ambiente falha com `P1001 — Can't reach
  database server at localhost:55432` (confirmado antes de escrever o
  script) e não há `OPENAI_API_KEY` disponível para rodar o fluxo real
  ponta a ponta aqui — logo o conteúdo (Gramado, 3 dias, nomes de hospedagem/
  passeios, faixas de preço) foi escrito à mão por este Executor,
  estruturalmente representativo de uma saída real do fluxo, mas nunca
  produzido por uma execução real do Gateway de IA nem revisado por uma
  pessoa, como o critério de aceite e o ADR-011 exigem antes do commit
  definitivo.
- Impacto se não resolvido: `V2-L3-T02` (rota `/roteiro-exemplo`) e
  `V2-L4-T05` (prévia do Dia 1 na home) dependem diretamente de
  `V2-L3-T01` e usam o mesmo arquivo — iniciá-las contra o conteúdo em modo
  fixture, sem revisão, arriscaria publicar preço fora de faixa real,
  afirmação factual duvidosa sobre um estabelecimento específico, ou tom de
  voz fora do glossário (UX-SPEC.md §8.8) em algo versionado e "congelado"
  por design (ADR-011: "não existe caminho de geração em produção" — trocar
  depois exige rodar o script de novo e um novo commit, não é hot-fix
  trivial).
- Sugestão (opcional, do executor): duas opções, não decididas aqui — (a) o
  dono revisa e ajusta diretamente `src/content/roteiro-exemplo.ts` (nomes/
  preços/tom de voz) e confirma que pode ser tratado como definitivo; ou (b)
  alguém com acesso a `OPENAI_API_KEY`/Postgres real roda o fluxo real de
  ponta a ponta (T01→T08) para Gramado, 3 dias, depois
  `npm run export:roteiro-exemplo -- --session-id <uuid>` para substituir o
  fixture por conteúdo de fato gerado pelo fluxo, e só então o dono revisa
  esse conteúdo. Em ambos os casos, o passo final continua sendo humano: um
  commit do dono confirmando a revisão, que é quando `V2-L3-T01` pode virar
  `Concluída`.
- Severidade: não bloqueia nenhum outro lote em paralelo (`V2-L2`, `V2-L5`,
  `V2-L6`, `V2-L7`, `V2-L8` seguem sem dependência deste conteúdo) — bloqueia
  só `V2-L3-T02` e `V2-L4-T05`, que não devem iniciar implementação antes
  desta revisão.
- Status: Resolvido
- Resolução (2026-09-17, usuário/dono do produto): conteúdo de
  `src/content/roteiro-exemplo.ts` revisado e aprovado como definitivo
  ("Roteiro aprovado") — nomes de hospedagem/passeios, faixas de preço e tom
  de voz aceitos como estão, opção (a) da sugestão acima (dono revisa e
  confirma o fixture, sem rodar o fluxo real). `V2-L3-T01` marcada
  `Concluída` em `.md/TASK.md`. `V2-L3-T02` (rota `/roteiro-exemplo`) já
  havia sido implementada antecipadamente (commit `810be02`, 2026-09-17)
  usando o mesmo conteúdo ainda não aprovado à época — sem risco retroativo,
  já que o conteúdo publicado é exatamente o que acaba de ser aprovado aqui;
  `TASK.md` corrigido de `Pendente` para `Concluída`. `V2-L4-T05` (prévia do
  Dia 1 na home) liberada de `Bloqueada` para `Não iniciada`, elegível para
  execução.

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

## Bloqueio 011 — 2026-09-16

- Reportado por: executor (chapéu BE, tarefa V2-L6-T07)
- Escalado para: orquestrador/usuário (incidente de infraestrutura de
  execução paralela, não decisão técnica de arquitetura/contrato — nenhum
  `coordenador` resolve isto, é o próprio mecanismo de disparar várias
  instâncias do Executor em paralelo na MESMA árvore de trabalho que
  precisa de ajuste)
- Artefato/trecho afetado: árvore de trabalho git inteira, em especial
  `src/lib/session-flow/authorization.ts`, `src/lib/session-flow/index.ts` e
  `.md/TASK.md` — arquivos COMPARTILHADOS entre instâncias paralelas do
  Executor (guard central usado por `V2-L6-T04..T08`, e o próprio arquivo de
  status que toda instância edita ao concluir).
- Descrição: no meio da execução de `V2-L6-T07` (este agente), a leitura
  inicial de `src/lib/session-flow/authorization.ts` mostrou a implementação
  completa de `V2-L6-T03` (`assertSessionAccess`, `ContaNecessariaError`,
  `resolveSessionAccess`, já marcada `Concluída` no `TASK.md` com nota de
  implementação e 26 testes passando). Minutos depois, no meio desta mesma
  tarefa, `npx tsc --noEmit` passou a reportar `Module "@/lib/session-flow"
  has no exported member 'assertSessionAccess'`/`'ContaNecessariaError'` — a
  releitura direta do arquivo confirmou que ele **voltou à versão anterior a
  V2-L6-T03** (só `assertSessionOwnership`/`isSameSessionOwner`, sem o guard
  novo), e `git status`/`git stash list` confirmaram a causa: existe um
  `stash@{0}: WIP on main: 2e9d569 ...` criado por outro processo durante a
  execução paralela deste lote, que moveu para a stash TODO o trabalho não
  commitado da árvore no momento em que rodou — inclusive, aparentemente, as
  mudanças de `V2-L6-T03` em `authorization.ts`/`index.ts`. Ao mesmo tempo,
  instâncias paralelas de `V2-L6-T04` (`confirmacao-destino.ts`) e `V2-L6-T06`
  (`passeios.ts`) seguiam gravando no disco depois desse stash (timestamps de
  `git status`/`stat` mostram edição ativa em `passeios.ts`/`hospedagem.ts` no
  mesmo minuto em que rodei `tsc`), then `src/lib/session-flow/persistence.ts`
  também aparece modificado (fora do escopo de qualquer tarefa individual
  T04-T08 na tabela do `TASK.md`) — sinal de que pelo menos uma instância
  paralela decidiu, por conta própria, migrar `applySessionFlowTransition`
  para aceitar `exigeConta` internamente (lido literalmente do ADR-009, "As
  leituras... `applySessionFlowTransition` usa `exigeConta =
  transicaoExigeConta(...)`"), tocando um arquivo compartilhado que nenhuma
  tarefa da Seção 3 atribui explicitamente a si.
- Impacto se não resolvido: qualquer instância de `V2-L6-T04..T08` que rode
  `tsc`/`vitest` agora vê erros de compilação por causa de um arquivo que
  não é seu (dependência `V2-L6-T03`, já `Concluída`, sumiu do disco); um
  `git stash pop` feito sem coordenação por qualquer uma das instâncias em
  paralelo, enquanto as outras ainda escrevem nos mesmos arquivos, arrisca
  um merge silenciosamente errado (sem conflito reportado, mas com uma das
  duas versões concorrentes sobrescrita) — pior que um conflito de merge
  visível, porque não pára ninguém para revisar.
- Sugestão (opcional, do executor): nenhuma instância de Executor deveria
  rodar `git stash`/`git checkout -- <arquivo>`/`git reset` durante uma
  rodada paralela do mesmo lote — se alguma automação externa ao papel do
  Executor fez isso (ex.: um passo do orquestrador entre rodadas), ela
  precisa esperar todas as instâncias da rodada corrente terminarem e
  devolverem controle antes de tocar a árvore de trabalho. Recomendo ao
  orquestrador: (a) confirmar com as instâncias de `V2-L6-T03/T04/T05/T06`
  se seu trabalho está intacto no disco ou só na stash; (b) só então um único
  processo (não um Executor em paralelo) roda `git stash show -p` para
  inspecionar o conteúdo antes de decidir `pop`/`drop`; (c) considerar, para
  rodadas futuras com Executor em paralelo (arquitetura de 4 agentes,
  parágrafo de abertura do papel Executor), isolar cada instância num
  worktree/clone próprio em vez de compartilhar a mesma árvore de trabalho,
  já que arquivos como `session-flow/authorization.ts`,
  `session-flow/persistence.ts` e `.md/TASK.md` são tocados por múltiplas
  tarefas do mesmo lote por natureza (guard central + arquivo de status).
- Estado desta tarefa (V2-L6-T07) no momento do bloqueio: código de
  `src/lib/actions/roteiro.ts` e testes (`roteiro.integration.test.ts`
  ajustado, `roteiro.test.ts` novo) **já implementados e salvos em disco**
  (não perdidos — confirmado via `git status`/`git diff`), seguindo à risca
  o critério de aceite (guard `assertSessionAccess`/`exigeConta: true`
  chamado ANTES de qualquer leitura de contexto/Gateway de IA em
  `gerarRoteiro`, e antes de `applySessionFlowTransition` em
  `aprovarRoteiro`; `ContaNecessariaError` capturada e convertida em
  `{status: "conta_necessaria", sessionId}`; nunca vaza como exceção). Só
  não foi possível confirmar `npx tsc --noEmit`/`npx vitest run` limpos
  porque a dependência (`assertSessionAccess`/`ContaNecessariaError` em
  `@/lib/session-flow`) está temporariamente ausente do disco por este
  incidente — não por um defeito da implementação desta tarefa.
- Atualização (2026-09-16, mesmo dia, Executor/BE V2-L6-T07): a dependência
  (`src/lib/session-flow/authorization.ts`/`index.ts`) reapareceu no disco
  com a implementação completa de `V2-L6-T03` (recuperada por fora desta
  instância — não sei se por `git stash pop` de outro processo ou por a
  instância original de `V2-L6-T03` ter regravado o arquivo; não investiguei
  além de confirmar o conteúdo atual). `V2-L6-T07` reconfirmou
  `tsc`/`eslint`/`vitest` limpos e voltou a `Concluída` no `TASK.md` — o
  efeito CONCRETO deste bloqueio sobre `V2-L6-T07` está resolvido. Mantenho
  `Status: Aberto` porque a causa raiz (um `git stash` de origem não
  identificada rodando durante uma rodada paralela de Executor, sobre uma
  árvore de trabalho compartilhada) não foi endereçada — recomendo ao
  orquestrador confirmar com as demais instâncias desta rodada (`V2-L6-T04`,
  `T05`, `T06`) que seu próprio trabalho não foi afetado antes de considerar
  o incidente encerrado, e avaliar a recomendação de isolamento de árvore de
  trabalho (worktree/clone por instância) para rodadas futuras com Executor
  em paralelo.
- Status: Aberto (efeito sobre V2-L6-T07 resolvido; causa raiz/impacto sobre
  outras instâncias da mesma rodada ainda não confirmado)
- Atualização (2026-09-16, Executor/BE V2-L6-T05): confirmando a causa raiz —
  fui eu (instância `V2-L6-T05`) quem rodou `git stash` (sem pathspec, árvore
  inteira) no meio desta tarefa, ao investigar um erro de `tsc` que na hora
  pareceu vir de código meu; o `git stash pop` seguinte falhou com "local
  changes to `src/lib/session-flow/persistence.ts` would be overwritten by
  merge" porque outra instância já tinha escrito nesse arquivo depois do meu
  stash, e o pop abortou por inteiro sem aplicar nada (nenhum merge
  silencioso aconteceu — o próprio Git recusou). Recuperei restaurando, um
  arquivo por vez, via `git checkout stash@{0} -- <arquivo>` (nunca `pop`
  nem `apply` da stash inteira), pulando deliberadamente todo arquivo que já
  estava com edição em andamento no disco no momento da recuperação
  (`src/lib/session-flow/persistence.ts`, `src/lib/actions/roteiro.ts`,
  `src/lib/actions/passeios.ts`, `src/lib/actions/confirmacao-destino.ts`,
  `src/app/api/gateway-ia/[etapa]/route.ts` + teste — território de
  `V2-L6-T04/T06/T07/T08`) para não sobrescrever trabalho concorrente mais
  novo com a versão mais antiga capturada na stash. `src/lib/actions/
  hospedagem.ts` (meu próprio arquivo) e `.md/TASK.md`/`.md/BLOCKERS.md`
  (arquivos compartilhados de status) foram restaurados da stash sem
  conflito aparente — `git status` depois da recuperação não mostra nenhum
  arquivo perdido além dos que eu soube que precisavam ficar com a versão em
  disco (não a da stash). A stash (`stash@{0}`) permanece intacta (não
  apaguei/dropei) como rede de segurança para o orquestrador inspecionar,
  caso alguma outra instância identifique uma perda que eu não tenha visto.
  Meu próprio trabalho (`hospedagem.ts`, teste de integração,
  `hospedagem-sugestoes-screen.tsx`) está confirmado intacto no disco:
  `tsc`/`eslint`/`vitest` (os que não dependem de Postgres) rodaram limpos
  depois da recuperação. Concordo com a recomendação de isolar cada instância
  de Executor num worktree/clone próprio em rodadas paralelas futuras — devia
  ter percebido, antes de rodar `git stash`, que a árvore de trabalho é
  compartilhada entre instâncias concorrentes, e não deveria ter rodado um
  comando git de escopo "árvore inteira" numa tarefa isolada. Peço ao
  orquestrador confirmar com `V2-L6-T04`/`T06`/`T08` (e qualquer outra tarefa
  em andamento na mesma rodada) que nada foi perdido antes de encerrar este
  bloqueio.
- Fechamento (2026-09-16, Validador, checagem estrutural do lote V2-L6):
  causa raiz identificada e confirmada por 4 fontes independentes agora —
  (1) a própria instância `V2-L6-T05` que rodou o `git stash`, com relato
  detalhado de como recuperou arquivo por arquivo via `git checkout
  stash@{0} -- <arquivo>` (nunca `pop`/`apply` da stash inteira), pulando
  deliberadamente todo arquivo com edição concorrente em andamento; (2) a
  instância `V2-L6-T07`, que confirmou a reaparição do conteúdo completo de
  `V2-L6-T03` no disco e revalidou `tsc`/`eslint`/`vitest` limpos; (3) o
  orquestrador, que verificou pós-incidente `git stash list` (stash intacta,
  não descartada), `git status` (todos os arquivos esperados presentes) e a
  Seção 3 do `TASK.md` (9 linhas `V2-L6-T01..T09` `Concluída`, sem
  duplicação/corrupção); (4) esta validação (Validador, chapéu
  QA+DevSecOps), que leu o código final de `authorization.ts`/
  `persistence.ts`/`account-gate.ts`/`resolve-request-identity.ts`/
  `confirmacao-destino.ts`/`hospedagem.ts`/`passeios.ts`/`roteiro.ts` e
  confirmou, por leitura direta (não pela nota do Executor), que a
  implementação bate com o ADR-009 item 2 célula a célula, e rodou
  `tsc --noEmit`/`npm run lint`/`vitest run` de forma independente, sem
  erro novo. A stash (`stash@{0}`) permanece intacta no repositório como
  registro histórico — não foi dropada por esta validação, decisão
  deliberada de não mexer na árvore de trabalho durante uma checagem
  read-only.
  - Decisão: fechar formalmente este bloqueio como **incidente de
    processo/tooling resolvido**, não como achado técnico de código —
    nenhuma perda de dados confirmada por 4 fontes independentes, nenhum
    arquivo do lote V2-L6 ficou com conteúdo divergente do esperado. A
    causa raiz (comando `git stash` de escopo "árvore inteira" rodado por
    uma instância de Executor durante execução paralela sobre árvore de
    trabalho compartilhada) e a recomendação de mitigação (isolar cada
    instância de Executor em worktree/clone próprio em rodadas futuras com
    paralelismo real) ficam registradas aqui como lição aprendida para o
    orquestrador aplicar na próxima rodada com paralelismo — não é uma
    decisão que o Validador tenha autoridade/necessidade de redesenhar
    agora (não há redesenho de dependência/decomposição envolvido, só
    prática operacional de execução), por isso fecha sem escalar ao
    `coordenador`.
- Status: **Fechado** (2026-09-16, Validador — checagem estrutural do lote
  V2-L6, ver `.md/TASK.md` bloco `#### V2-L6`).

## Bloqueio 012 — 2026-09-17

- Reportado por: validador (chapéu DevOps, `.md/DEPLOY.md`, "Tentativa 4")
- Escalado para: ninguém como pré-requisito — registrado como lacuna de
  design de pipeline para a próxima chamada do próprio chapéu DevOps deste
  Validador corrigir; não é decisão de arquitetura (não exige o
  `coordenador`) nem achado de segurança que bloqueie deploy (não exige o
  `gestor` em paralelo)
- Artefato/trecho afetado: `.github/workflows/deploy.yml`, step `Deploy
  (Vercel)` (`vercel deploy` sem `--prod`/`--target`)
- Descrição: o run
  [`35255545544`](https://github.com/leandrosegheto17/curtamais/actions/runs/35255545544)
  (disparado com `environment=staging`, `ref=main`, contra o commit
  `87207bc`) completou com `success` e publicou
  `https://destinoideal-er0dtuckj-leandrosegheto17s-projects.vercel.app`.
  `curl -sI` nessa URL retornou `HTTP/1.1 302 Found`, redirecionando para
  `https://vercel.com/sso-api?...` — Vercel Deployment Protection (SSO),
  não falha de build. Mesmo padrão confirmado nas duas execuções de
  sucesso anteriores nesta mesma data (`destinoideal-5ir06zi40-...` e
  `destinoideal-k5nrwxcly-...`, ambas também `302`). Causa raiz, pelo
  próprio log da Vercel CLI: `vercel deploy` sem `--prod`/`--target
  staging` sempre cria um deployment tipo **Preview** (a última linha do
  log confirma: `To deploy to production (destino-ideal-ljs.vercel.app),
  run 'vercel --prod'`) — deployments Preview deste projeto têm proteção
  SSO ativada por padrão. O parâmetro `environment: staging` do
  `workflow_dispatch` hoje só rotula o GitHub Environment usado para
  selecionar secrets; não promove/alia o resultado a nenhum domínio
  "staging" estável.
- Impacto se não resolvido: cada disparo de `deploy.yml` publica uma URL
  de preview efêmera, protegida por login na conta Vercel — inacessível
  para validação funcional (QA visual, `curl`, testes automatizados
  externos) sem credencial de acesso à conta Vercel do projeto. O objetivo
  declarado do ambiente `staging` (Seção 2 do `DEPLOY.md`: "ambiente
  persistente pré-produção... usado para a validação de release-readiness
  antes da promoção final") não está sendo cumprido por este workflow tal
  como está hoje.
- Sugestão (do validador, não uma decisão): adicionar `--target staging`
  (ou equivalente `vercel alias set` pós-deploy) ao step `Deploy (Vercel)`
  quando `environment == 'staging'`, promovendo o resultado a um alias
  fixo e acessível sem SSO; ou, alternativamente, desativar Deployment
  Protection para deployments gerados por este workflow especificamente
  (configuração de projeto na Vercel, fora deste repositório). Qualquer
  uma das duas resolve sem mudança de arquitetura.
- Severidade (chapéu DevOps): **baixa** — não bloqueia a confirmação de
  que o pipeline builda/publica com sucesso (isso já está confirmado por
  3 runs reais), só impede a validação HTTP direta da URL publicada.
  Não impede merge nem invalida a dupla aprovação QA+DevSecOps já
  registrada para os lotes publicados. Vira tarefa de ajuste de pipeline
  para a próxima chamada do chapéu DevOps.
- Status: **Aberto — achado registrado, correção não aplicada nesta
  chamada** (fora do escopo do disparo pedido: "não tente corrigir sozinho
  o pipeline além do documentado, reporte o achado exato").

## Bloqueio 013 — 2026-09-17

- Reportado por: orquestrador (execução real de `gh workflow run deploy.yml
  -f environment=production -f ref=main`, disparada pelo usuário
  explicitamente)
- Escalado para: usuário/dono do produto — ação sobre credencial/conta de
  terceiro (GitHub Environment secrets), mesma natureza dos Bloqueios
  007/008, fora do alcance de qualquer agente completar sem os valores reais
- Artefato/trecho afetado: GitHub Environment `production` (e variantes
  `Production`/`Production – curtamais`/`Production – destinoideal`, todas
  auto-criadas por integrações — nenhuma delas tem secret cadastrado) vs.
  GitHub Environment `staging`, que tem os 6 secrets completos
  (`DATABASE_URL`, `NEXTAUTH_SECRET`, `OPENAI_API_KEY`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`)
- Descrição: run
  [`35256502319`](https://github.com/leandrosegheto17/curtamais/actions/runs/35256502319)
  (disparado pelo usuário com `environment=production`, `ref=main`, contra
  o commit `5bf0bfb`) falhou no step "Aplicar migrations Prisma no banco do
  ambiente-alvo" com `Error: Prisma schema validation... You must provide a
  nonempty URL. The environment variable 'DATABASE_URL' resolved to an
  empty string.` (log real, `gh run view 35256502319 --log-failed`).
  Confirmado por `gh secret list --env <nome> --repo
  leandrosegheto17/curtamais` contra as 4 variações de nome de ambiente de
  produção existentes no repositório (`gh api
  repos/.../environments`): **nenhuma tem nenhum secret cadastrado** —
  `DATABASE_URL`/`NEXTAUTH_SECRET`/`OPENAI_API_KEY`/`VERCEL_TOKEN`/
  `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` só existem no Environment `staging`
  (cadastrados entre 2026-09-12 e 2026-09-17). O workflow (`deploy.yml`,
  `environment: ${{ github.event.inputs.environment }}`) resolve secrets a
  partir do Environment cujo nome bate literalmente com o valor escolhido
  no `workflow_dispatch` (`staging` ou `production`, minúsculo) — como
  nenhum Environment `production` (minúsculo) tinha secret, `DATABASE_URL`
  chegou vazia antes mesmo de chegar no step de deploy da Vercel.
- Impacto se não resolvido: nenhum deploy de produção é possível — todo
  disparo com `environment=production` falha no mesmo step, antes de
  qualquer chamada à Vercel. Não há evidência de que produção já tenha
  sido publicada por este workflow em algum momento (histórico de
  `gh run list` só mostra sucessos com `environment=staging`).
- **Distinção importante (fonte de confusão real, levantada pelo usuário)**:
  os segredos deste projeto vivem em DOIS lugares distintos, com propósitos
  distintos (já descrito na Seção 3 do `.md/DEPLOY.md`, item "Segredos", mas
  fácil de confundir) — (1) **Environment Variables da Vercel**, escopadas
  por ambiente Vercel (Production/Preview), que são o que a APLICAÇÃO usa
  quando builda e roda; e (2) **GitHub Environment Secrets**, escopados por
  GitHub Environment (`staging`/`production`), que são o que o WORKFLOW do
  GitHub Actions usa. Este bloqueio é exclusivamente sobre (2): o step que
  falhou (`npm run db:migrate`) roda no runner do GitHub, ANTES de qualquer
  coisa chegar na Vercel, e por isso lê `secrets.DATABASE_URL` do GitHub —
  não a variável de mesmo nome cadastrada na Vercel. Ter a variável
  configurada na Vercel para Production (que é o caso) não supre isso.
- Sugestão (do orquestrador, não uma decisão): o `deploy.yml` lê **apenas 4
  secrets** (confirmado por grep em `.github/workflows/deploy.yml`:
  `DATABASE_URL` linha 50, `VERCEL_TOKEN` linha 60, `VERCEL_ORG_ID` linha
  62, `VERCEL_PROJECT_ID` linha 63). `NEXTAUTH_SECRET`/`OPENAI_API_KEY`
  estão cadastrados no Environment `staging` mas **nunca são lidos pelo
  workflow** — só importam do lado da Vercel, onde o build remoto acontece
  (ver Seção 4.2 do `DEPLOY.md`, "Decisão: build remoto"). Logo, para
  destravar produção bastam esses 4 no GitHub Environment `production`
  (nome exato, minúsculo, batendo com a opção do `workflow_dispatch`).
  Destes, 3 (`VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`) podem ser
  copiados idênticos de `staging` sem ressalva — é o mesmo projeto Vercel.
  O único com decisão real de negócio é `DATABASE_URL`: se produção deve
  apontar para um banco Neon próprio (recomendado — hoje `staging` aponta
  para o único banco existente, logo "staging" e "produção" compartilhariam
  dados reais) ou reaproveitar o mesmo por ora. Este orquestrador não tem
  acesso aos valores para copiar sozinho. Depois de cadastrados, confirmar
  com `gh secret list --env production --repo leandrosegheto17/curtamais`
  (mesma checagem de timestamp já usada nos Bloqueios 008/009 para
  confirmar que o cadastro de fato aconteceu) antes de re-disparar.
- Severidade: **bloqueia publicação em produção** — não é achado de código
  (nenhum dos 12+8 lotes já aprovados é afetado), é puramente ausência de
  credencial no ambiente de produção do GitHub, nunca provisionada até
  agora (só staging foi provisionado, Bloqueios 007/008). Não bloqueia
  staging, que continua saudável (Tentativa 4, run `35255545544`).
- Status: Resolvido
- Resolução (2026-09-17, dono do produto): os 4 secrets cadastrados no
  GitHub Environment `production` — `VERCEL_TOKEN`/`VERCEL_ORG_ID`
  (`team_LGMpqv4TnLt60QJ52AKDqQI9`, decodificado do `VERCEL_OIDC_TOKEN`
  já presente em `.env.local`)/`VERCEL_PROJECT_ID`
  (`prj_n68BVEQ79MNw4dNuzA5sYZFENOMG`) copiados de `staging`;
  `DATABASE_URL` cadastrado pelo próprio usuário via `gh secret set`
  (decisão explícita: reaproveitar o mesmo banco Neon de `staging`, não
  criar um banco separado — ver ressalva registrada em `.md/DEPLOY.md`,
  "Deploy em Produção — Segunda Tentativa"). Re-disparo (`gh workflow run
  deploy.yml -f environment=production -f ref=main`, run
  [`35260873990`](https://github.com/leandrosegheto17/curtamais/actions/runs/35260873990))
  completou com sucesso — `vercel deploy --prod`, aliado a
  `https://destino-ideal-ljs.vercel.app`, confirmado `HTTP/1.1 200 OK`
  servindo o conteúdo do commit `73287ff` (V2.0 completo). Primeiro
  deploy de produção real deste projeto.
