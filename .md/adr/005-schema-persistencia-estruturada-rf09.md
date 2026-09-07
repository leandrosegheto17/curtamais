# ADR-005 — Schema de persistência estruturada (RF-09)

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

RF-09.1 exige persistir, para cada sessão com pelo menos uma etapa aprovada, um
registro estruturado com destino, range de datas, hospedagem, passeios (com
data/horário do roteiro) e faixa de orçamento — cada campo independentemente
opcional. RF-09.2 delega o formato técnico a este documento. A Fase 2 (fora
deste MVP) precisa herdar esse dado para popular cronograma automaticamente
(PRD.md Seção 7, pergunta 2), então o schema precisa ser extensível sem
recriação.

## Alternativas Consideradas

1. **Documento único semi-estruturado (JSON/JSONB) por sessão**, com um blob
   contendo todas as etapas aprovadas.
2. **Modelo relacional normalizado**, uma tabela por tipo de etapa aprovada,
   com FK para a sessão (`TripSession`).
3. **Modelo híbrido**: `TripSession` relacional + campo JSONB para dados
   "soltos" não estruturados (ex.: texto livre do quiz).

## Decisão

Adotar **modelo relacional normalizado** (opção 2): `TripSession` como raiz de
agregação, com quatro entidades filhas opcionais (`DestinationApproval`,
`AccommodationApproval`, `ActivityApproval`, `ItineraryItem`), detalhado em
SDD.md Seção 5.

## Racional

- RF-09.1 já descreve o dado como estruturado por natureza (campos nomeados,
  cada um opcional) — um schema relacional expressa essa opcionalidade de
  forma nativa (linha ausente = etapa não aprovada) sem exigir validação de
  schema dentro de um blob JSON.
- Suporta melhor consulta/relatório futuro (ex.: taxa de conclusão do fluxo,
  métrica primária do PRD.md Seção 3) sem parsing de JSON em massa.
- Migração versionada (Prisma) permite que a Fase 2 **adicione** tabelas
  (`Checklist`, `TripDocument`, `Expense`, `TripMember`) referenciando
  `TripSession.id`, sem precisar migrar/reescrever os dados da Fase 1 — direto
  atende a exigência de "herdar", não recriar.
- Rejeitado o modelo híbrido (opção 3) para o MVP: nenhum campo do RF-09.1
  é genuinamente não-estruturado a ponto de justificar JSONB — mesmo a
  justificativa textual do destino (RF-04.1) tem um campo fixo esperado.

## Consequências

- Toda mudança de forma de uma etapa (ex.: adicionar novo campo a
  `AccommodationApproval`) exige migração de schema formal, mais lenta que
  alterar um blob JSON — aceito, pois o ganho de integridade/consulta supera o
  custo de mudança pouco frequente esperado no MVP.
- `LlmGenerationLog` (observabilidade de custo, ver ADR-002) usa a mesma
  raiz `TripSession`, mantendo uma única fonte de verdade por sessão.
