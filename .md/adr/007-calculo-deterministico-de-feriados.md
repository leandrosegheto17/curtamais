# ADR-007 — Cálculo determinístico de feriados nacionais

- Status: Aceito
- Data: 2026-09-07
- Autor: Coordenador (chapéu Software Architect)

## Contexto

RNF-07 exige que o cálculo de emenda de feriados (RF-02.2) seja determinístico
e não dependa de chamada a LLM. RF-02.1 exige listagem de feriados nacionais
brasileiros do ano corrente e seguinte, com emenda calculada automaticamente.
RN-02 restringe o escopo a feriados nacionais brasileiros apenas.

## Alternativas Consideradas

1. **Biblioteca de terceiros de feriados brasileiros** (calendário fixo +
   móveis, ex.: Páscoa/Carnaval calculados por algoritmo conhecido).
2. **Tabela própria versionada no banco/config**, populada e mantida
   manualmente ano a ano.
3. **API externa de terceiros de feriados** — introduz dependência de rede e
   disponibilidade para um dado que não muda com frequência, sem benefício
   real sobre as opções 1/2.

## Decisão

Adotar **biblioteca de terceiros de feriados brasileiros** (feriados fixos +
móveis calculados por algoritmo, ex.: Páscoa via algoritmo de Gauss) executada
no servidor, sem chamada de rede em tempo de requisição.

## Racional

- RNF-07 exige determinismo e independência de LLM — uma biblioteca de cálculo
  puro (sem rede) atende isso diretamente, sem risco de indisponibilidade
  externa (diferente da opção de API de terceiros).
- Feriados nacionais brasileiros têm regra de cálculo bem conhecida e estável
  (poucos móveis, resto fixo) — não há necessidade de manutenção manual anual
  como a opção de tabela própria exigiria.
- RN-02 já restringe o escopo a feriados nacionais — a biblioteca não precisa
  cobrir feriados estaduais/municipais nem internacionais, mantendo o cálculo
  simples.
- A emenda com fins de semana adjacentes (RF-02.1) é lógica de calendário pura
  (dia da semana do feriado + regra de "estender até domingo/segunda mais
  próxima útil") — implementável sobre a mesma biblioteca, sem componente
  adicional.

## Consequências

- Dependência de uma biblioteca de terceiros para a lista-base de feriados —
  mitigado por ser um domínio estável (não muda com frequência) e por não
  envolver chamada de rede em runtime (a lista é resolvida em build/execução
  local, não via API).
- Se a biblioteca escolhida ficar desatualizada para um ano específico, o
  requisito RF-02.1 ("ano corrente e ano seguinte") pode exigir atualização de
  versão da dependência como parte de manutenção de rotina — não um
  redesenho arquitetural.
