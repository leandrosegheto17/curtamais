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
