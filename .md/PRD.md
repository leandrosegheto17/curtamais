# PRD.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Gestor (chapéu PM). Baseado no Gate 1 aprovado com ressalvas em
`CTO-REVIEW.md` (2026-09-07).

## 1. Problema e Contexto

Planejar uma viagem hoje envolve duas dores distintas e sequenciais, que a
maioria das ferramentas de mercado trata como se fossem uma só, ou ignora uma
delas por completo:

1. **Decisão** — antes de saber para onde ir (ou mesmo já sabendo o destino, mas
   não o resto), a pessoa precisa responder: dado um período livre e a época do
   ano, para onde faz sentido ir, dentro de que alcance geográfico (Brasil,
   América do Sul, EUA, Europa), quanto isso custa aproximadamente, onde ficar, o
   que fazer, e em que ordem/horário fazer cada coisa para aproveitar melhor.
   Ferramentas de IA generativa genéricas (ex.: ChatGPT) resolvem isso hoje, mas
   exigem que quem conduz a conversa saiba fazer as perguntas certas, refinar a
   resposta e montar a lógica de roteiro sozinho — o fundador (Leandro) já faz
   isso manualmente para suas próprias viagens.
2. **Organização** — depois que a viagem está decidida, falta um lugar único para
   centralizar roteiro, reservas, checklist de bagagem, orçamento e informações
   importantes, evitando o "caos de WhatsApp" comum em viagens coordenadas em
   grupo. Ferramentas de organização de viagem existentes no mercado (ex.: TripIt,
   Wanderlog) endereçam bem esta segunda dor, mas partem do princípio de que o
   destino já está decidido — nenhuma delas ajuda a decidir.

O problema é verificável: existe hoje um processo manual, repetido pelo próprio
fundador a cada viagem própria, que consome tempo e conhecimento de "como
conversar com IA generativa" que a maior parte das pessoas não tem ou não quer
desenvolver.

Este produto nasce da escolha deliberada de resolver um problema que o próprio
fundador vive na prática (dogfooding), entre 17 ideias avaliadas em processo de
seleção — não era a prioridade mais alta do ranking geral, mas foi escolhida por
esse motivo.

## 2. Público-Alvo

Pessoas que:
- Têm um período livre disponível para viajar (definido ou não) e querem decidir
  o que fazer com ele sem precisar "aprender a usar" IA generativa por conta
  própria.
- Valorizam uma sugestão de qualidade equivalente à que alguém que já sabe
  conduzir bem uma conversa com IA conseguiria obter manualmente — sem precisar
  saber fazer isso sozinho.
- Depois de decidida a viagem (por este produto ou não), querem organizar roteiro,
  checklist, reservas e gastos num único lugar, evitando dispersão em
  WhatsApp/planilhas soltas — inclusive em contexto de viagem em grupo.

Fora do público-alvo deste MVP (explícito, não é corte silencioso): viajantes que
já sabem exatamente o que querem em nível de detalhe operacional (voo e hotel já
comprados, roteiro já fechado) e só precisam de uma ferramenta de organização pura
— esse público é atendido pela Fase 2 isoladamente, sem depender da Fase 1.

## 3. Objetivo de Sucesso

Métrica mensurável primária do MVP (Fase 1 — Decisão guiada):
**Taxa de conclusão do fluxo guiado**: percentual de sessões que, tendo iniciado
qualquer um dos três caminhos de entrada (data livre, feriados prolongados, quiz
guiado), chegam a pelo menos uma etapa aprovada pelo usuário (destino, hospedagem,
passeios ou roteiro) sem abandono.
- Baseline: não existe (produto novo, sem uso prévio instrumentado) — a ser
  estabelecido nas primeiras semanas pós-lançamento do MVP.
- Meta inicial proposta: >= 60% das sessões iniciadas chegam a pelo menos uma
  etapa aprovada, medida nas primeiras 4 semanas após o lançamento do MVP da Fase
  1. Sujeita a ajuste após a primeira leva real de uso (ver Seção 6, premissa
  P-01).

Métrica de sucesso secundária, qualitativa e verificável: o próprio fundador,
como primeiro usuário real do produto, considera a sugestão gerada equivalente em
qualidade à que ele obteria manualmente conduzindo a conversa com IA generativa
por conta própria — validado por uso direto antes de expor a outros usuários.

"Melhorar a experiência do usuário" isoladamente não é usado como critério de
sucesso em nenhuma parte deste documento — todo objetivo acima é observável e
medido a partir de comportamento de uso real.

## 4. Escopo desta Release (MVP)

Prioridade de desenvolvimento: **Fase 1 (Decisão guiada) primeiro**, por
concentrar o diferencial real do produto frente a concorrentes de organização de
viagem — vale validar a proposta antes de investir na Fase 2, tecnicamente mais
previsível.

### Dentro do escopo — Fase 1 (MVP prioritário)
- Três caminhos de entrada para o fluxo de decisão guiada:
  1. Data livre (range de datas), com ou sem destino já definido.
  2. Feriados prolongados nacionais brasileiros, com cálculo automático de emenda
     com fins de semana, apresentados como lista para escolha.
  3. Quiz guiado com conjunto básico de perguntas, para quem não tem data nem
     destino definidos.
  - Justificativa do corte: cobre os três pontos de partida reais que o fundador
    já usa manualmente hoje (data solta, feriado, ou "não sei nem por onde
    começar") — não há um quarto ponto de partida identificado no briefing que
    justifique escopo adicional agora.
- Sugestão de destino por sazonalidade, quando o destino não é informado.
- Fluxo de resposta em etapas (destino → hospedagem → passeios → roteiro), com
  aprovação/ajuste do usuário a cada etapa antes de avançar, permitindo que o
  usuário pare em qualquer etapa e use só a parte que interessa.
  - Justificativa do corte: é o diferencial de UX central do produto — evita
    forçar todo mundo pelo fluxo completo quando só uma parte é necessária.
- Faixas de preço aproximadas geradas por conhecimento geral da IA (voo, hotel,
  passeio), sem integração com API de preço real em tempo real.
  - Justificativa do corte: reduz superfície de integração externa no MVP,
    mantendo o mesmo padrão que o fundador já usa manualmente hoje; validar a
    proposta de decisão guiada antes de investir em integração de preço real.
- Sugestão de hospedagem (múltiplas opções com faixa de preço).
- Sugestão de passeios/atividades (com faixa de preço, incluindo opções
  gratuitas).
- Roteiro final organizado por dia, com otimização de sequência e indicação de
  horário ideal por atividade (ex.: evitar fila/calor/lotação).
- Orçamento informado pelo usuário como filtro de entrada das sugestões (não é
  controle financeiro contínuo — isso é Fase 2).
- Experiência web com visual cuidado — tratado como requisito de produto de
  primeira classe, não só "nice to have" de polimento posterior.

### Fora do escopo desta release (Fase 1 MVP) — cada corte com justificativa
- **Feriados internacionais no calendário guiado** — fora do MVP; calendário
  cobre só feriados nacionais brasileiros. Justificativa: reduz complexidade de
  fonte de dados e mantém o caso de uso mais comum do público-alvo inicial
  (viajante brasileiro) coberto primeiro.
- **Integração com API de preço real de voo/hotel em tempo real** — fora do MVP.
  Justificativa: aumenta custo e complexidade de integração sem validar antes se
  a proposta de decisão guiada em si se sustenta; mesmo padrão que o fundador já
  usa manualmente hoje (faixas aproximadas).
- **Expansão do quiz guiado além do conjunto básico de perguntas** — fora do MVP;
  conjunto exato de perguntas adicionais fica para depois dos primeiros testes de
  uso reais. Justificativa: evita design especulativo de perguntas sem evidência
  de uso real sobre o que falta.
- **Fase 2 completa (cronograma, checklist, reservas, compartilhamento em grupo,
  lançamento de gastos)** — fora desta release; entra como release subsequente,
  após validação da Fase 1. Justificativa: é tecnicamente mais previsível (CRUD)
  e o valor de negócio prioritário está em validar o diferencial de decisão
  guiada primeiro.
- **Controle financeiro avançado (categorização de gastos, comparação "previsto x
  realizado")** — fora de escopo mesmo quando a Fase 2 for desenvolvida;
  registrado aqui para não ser reintroduzido por engano depois. Justificativa: o
  objetivo da sessão de gastos da Fase 2 é registro simples de total gasto, não
  ferramenta de controle financeiro.
- **Modelo de monetização** — não decidido nesta release; não bloqueia o
  desenvolvimento do MVP funcional, mas fica registrado como pergunta em aberto
  (Seção 7).
- **Escolha final de stack/plataforma** — não decidida nesta release; avaliação
  de PWA/web responsivo (como já usado no projeto de Leitura Bíblica) versus
  outra abordagem cabe ao Coordenador no SDD.md, não a este PRD.

### Dentro do escopo — Fase 2 (release subsequente, não deste MVP, registrado para
não ser perdido)
- Cronograma por dia, herdando o que foi decidido na Fase 1 (quando o usuário
  passou por ela) ou preenchido do zero (quando o usuário já sabia o destino e
  pulou a decisão guiada).
- Checklist de bagagem.
- Dados de voo/hospedagem e documentos da viagem.
- Compartilhamento com acompanhantes/grupo.
- Sessão de lançamento de gastos reais (registro simples, total ao final da
  viagem — sem categorização detalhada nem comparação "previsto x realizado").

## 5. Requisitos de Alto Nível Priorizados

| # | Requisito | Prioridade | Justificativa |
|---|---|---|---|
| R1 | Entrada por data livre (com/sem destino) | Must-have | Ponto de partida mais comum hoje no uso manual do fundador; sem ele não há fluxo de decisão guiada |
| R2 | Entrada por feriados prolongados nacionais (com emenda de fim de semana) | Must-have | Segundo ponto de partida mais comum; feriado prolongado é gatilho natural de "quero viajar mas não sei quando" |
| R3 | Entrada por quiz guiado básico | Must-have | Único caminho que atende quem não tem nem data nem destino — sem ele o produto não cobre o público que "não sabe conversar com IA" |
| R4 | Sugestão de destino por sazonalidade (quando destino ausente) | Must-have | Núcleo do diferencial de produto frente a concorrentes de organização pura |
| R5 | Fluxo de sugestão em etapas, com aprovação por etapa | Must-have | Diferencial de UX central; sem isso o produto vira "tudo de uma vez", que é o que o fundador já evita fazer manualmente |
| R6 | Faixas de preço aproximadas (voo, hotel, passeio) | Must-have | Sem preço aproximado a decisão não é acionável; mesmo padrão do uso manual atual |
| R7 | Sugestão de hospedagem (múltiplas opções) | Must-have | Parte inseparável de uma decisão de viagem completa |
| R8 | Sugestão de passeios/atividades (com gratuitos e pagos) | Must-have | Idem R7 |
| R9 | Roteiro final por dia, com otimização de sequência e timing | Must-have | É a entrega final que soma tudo; sem estruturação temporal a sugestão vira lista solta, o que o briefing explicitamente rejeita |
| R10 | Orçamento do usuário como filtro de entrada | Should-have | Melhora relevância da sugestão, mas o fluxo funciona (com sugestões não filtradas) mesmo sem o usuário informar orçamento |
| R11 | Visual web cuidado/diferenciado | Must-have | Prioridade explícita do fundador; parte do valor percebido do produto, não só polimento |
| R12 (Fase 2, não deste MVP) | Cronograma, checklist, dados de viagem, compartilhamento, gastos | Backlog priorizado para release seguinte | Valor de negócio confirmado, mas depende de validar primeiro a Fase 1 |

## 6. Premissas e Riscos de Produto

| ID | Tipo | Descrição | Dono | Prazo de validação |
|---|---|---|---|---|
| P-01 | Premissa | A meta de 60% de conclusão de fluxo (Seção 3) é um número de partida razoável para um MVP sem baseline histórico | Gestor (chapéu PM) | Revisar após as primeiras 4 semanas de uso real pós-lançamento do MVP |
| P-02 | Premissa | Faixas de preço geradas por conhecimento geral da IA (sem API de preço real) são suficientemente úteis para o usuário decidir, sem gerar expectativa de exatidão | Gestor (chapéu PM), a confirmar com chapéu BA | Antes de aprovar o PRD-TECNICO.md — precisa virar um requisito não-funcional explícito de como comunicar "faixa aproximada" na UI |
| R-01 | Risco | Sugestões geradas por LLM podem "alucinar" preços ou informações desatualizadas (ex.: preço de ingresso de atração, regras de entrada em outro país) | Coordenador (arquitetura de prompt/fallback) + Gestor (ressalva já registrada no Gate 1) | Antes do SDD.md ser aprovado pelo usuário — tratar como decisão de arquitetura de primeira classe |
| R-02 | Risco | O produto compete por atenção/capacidade de execução do fundador com outros três projetos em paralelo (Metas Financeiras, Leitura Bíblica, site institucional) | Gestor (chapéu CTO, ad hoc) | Quando o TASK.md existir, se o usuário solicitar parecer de capacidade |
| R-03 | Risco | Conjunto básico do quiz guiado (R3) pode não cobrir casos reais de uso suficientes, gerando abandono nesse caminho específico | Gestor (chapéu PM/BA) | Após os primeiros testes de uso reais, conforme já sinalizado no briefing como decisão adiada de propósito |
| R-04 | Risco | Modelo de monetização não definido pode afetar decisões de arquitetura (ex.: limite de chamadas de IA por usuário gratuito) | Gestor (chapéu CTO, ad hoc) | Antes de escalar o produto além do MVP validado; não bloqueia o MVP em si |

## 7. Perguntas em Aberto (para o Business Analyst)

1. Qual é o conjunto exato de perguntas do quiz guiado (R3) para o MVP? O
   briefing definiu a intenção ("básico") mas não a lista final — o BA precisa
   detalhar isso em requisito funcional testável.
2. Como exatamente a Fase 1 "entrega" seus resultados (destino, hospedagem,
   passeios, roteiro aprovados) para popular automaticamente o cronograma da
   Fase 2, no nível de dado estruturado (não decisão de arquitetura, mas o
   requisito funcional de "o que precisa ser guardado" para isso ser possível
   depois)?
3. Quando o usuário informa destino já decidido (pulando a sugestão por
   sazonalidade), o fluxo em etapas (R5) começa direto na etapa de hospedagem, ou
   ainda passa por uma etapa de "confirmação de destino" antes? O briefing não
   detalha esse ponto de transição.
4. Como o orçamento informado pelo usuário (R10) se aplica quando ele é
   insuficiente para nenhuma opção nas faixas geradas — o sistema informa
   explicitamente essa incompatibilidade, ou apenas mostra a opção mais barata
   disponível? Requisito funcional de tratamento de caso de exceção.
5. Existe algum limite de abrangência geográfica além dos quatro citados no
   briefing (Brasil, América do Sul, EUA, Europa) que deveria ficar
   explicitamente fora do MVP, ou esses quatro já são exaustivos para o
   propósito de sugestão por sazonalidade?
