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
