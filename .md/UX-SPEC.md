# UX-SPEC.md — Planejador de Viagens com Decisão Guiada por IA

Autor: Coordenador (chapéu UX/UI). Baseado em `PRD.md`, `PRD-TECNICO.md` e no
`SDD.md` (2026-09-07), respeitando os limites técnicos já definidos na
arquitetura (state machine server-side, streaming de LLM, retry único, schema
de persistência). Cobre exclusivamente o escopo do MVP (Fase 1).

**Revisão 2026-09-07 (reabertura pontual)**: Seção 3 (Design System) e trechos
visuais das Seções 2 e 6 atualizados para refletir a direção visual
"Concierge Noturno" (fundo escuro, acento dourado/champagne, tipografia
serifada+sans, grid de uma coluna por linha), aprovada pelo fundador fora do
fluxo padrão de agentes. Estrutura de fluxo (Seção 1), estados de tela
(Seção 4, exceto rótulo de skeleton), acessibilidade (Seção 5, exceto reforço
de contraste) e restrições técnicas (Seção 7) não mudaram de conteúdo — só de
camada visual. Nenhuma decisão de arquitetura do `SDD.md` foi alterada
(Tailwind CSS + shadcn/ui seguem como base).

## 1. Fluxos de Tela

Mapeamento de cada requisito funcional do PRD-TECNICO.md para tela(s), seguindo
a state machine server-side de ADR-006.

| Fluxo/Requisito | Tela(s) |
|---|---|
| Entrada (RF-01/RF-02/RF-03) | `T00 Seleção de caminho de entrada` |
| RF-01 (data livre) | `T01 Data livre` |
| RF-02 (feriados prolongados) | `T02 Lista de feriados` |
| RF-03 (quiz guiado) | `T03a-d Quiz (4 perguntas em wizard)` |
| RF-04 (sugestão de destino) | `T04 Sugestões de destino` |
| RF-04.4 (rejeição total) | Estado dentro de `T04` (sem tela nova) |
| RF-04.5/RN-03 (encerramento parcial) | `T-END Encerramento/Resumo` (reusada em todo ponto de saída) |
| RF-11 (confirmação de destino informado) | `T05 Confirmação de destino` |
| RF-06 (hospedagem) | `T06 Sugestões de hospedagem` |
| RF-07 (passeios) | `T07 Sugestões de passeios` |
| RF-08 (roteiro final) | `T08 Roteiro final` |
| RF-09 (persistência) | Sem tela própria — reflexo em `T-END`/`T08` (dado já salvo, sem ação do usuário) |
| RF-10.2 (orçamento insuficiente) | Estado (banner) dentro de `T04`/`T06`/`T07` |

Navegação: `T00 → [T01|T02|T03a-d] → (T04 → T05) | T05 → T06 → T07 → T08 →
T-END(completo)`, com saída para `T-END(parcial)` disponível a partir de T04,
T06, T07 (RF-04.5/RF-05.4/RN-03). Nunca há navegação direta pulando uma etapa
sem passar pelo estado de aprovação correspondente (RN-01).

## 2. Wireframes (descrição funcional por tela)

### T00 — Seleção de caminho de entrada
Três blocos de igual destaque, um por caminho (Data livre / Feriados
prolongados / Quiz guiado), separados por borda fina (não cartão com sombra —
"Concierge Noturno", Seção 3), cada um com ícone, título curto em tipografia
serifada e uma frase de quando usar (ex.: "Já sei quando posso viajar" /
"Quero aproveitar um feriado" / "Não sei nem por onde começar") em sans-serif.
Nenhum caminho é pré-selecionado ou visualmente priorizado sobre os outros —
os três são igualmente Must-have (PRD.md Seção 5).

### T01 — Data livre (RF-01)
Formulário com dois seletores de data (início/fim) e um campo opcional de
destino (texto com autocomplete simples). Validação inline: RF-01.4 (data
final antes da inicial) bloqueia o avanço com mensagem de erro junto ao campo,
sem navegar.

### T02 — Lista de feriados (RF-02)
Lista de blocos em grid de uma coluna por linha (`HolidayListItem`, separados
por borda fina, sem sombra — Seção 3), um por feriado nacional (ano corrente +
seguinte), mostrando nome do feriado, data, e a emenda calculada (ex.: "Qui
12/06 → estende até Dom 15/06, 4 dias"). Campo opcional de destino abaixo da
lista (aplicado ao feriado escolhido, mesma UX de T01).

### T03a-d — Quiz guiado (RF-03)
Wizard de 4 telas sequenciais (uma pergunta por tela, com indicador de
progresso "1 de 4"): (a) período disponível — seleção única entre opções
predefinidas; (b) alcance geográfico — seleção única, incluindo "sem
preferência"; (c) tipo de experiência — seleção única ou combinação (multi-
select), incluindo "sem preferência"; (d) orçamento — campo de texto livre
opcional, com placeholder de exemplo de faixa. Botão "Pular" visível nas
perguntas (b), (c) e (d), conforme RF-03.3 (só o período é obrigatório).

### T04 — Sugestões de destino (RF-04)
Estado inicial: carregando (ver Seção 4). Estado de sucesso: 2 a 4 blocos de
destino em grid de uma coluna por linha (`SuggestionCard`, borda fina entre
blocos, sem sombra — Seção 3), cada um com nome em tipografia serifada, foto
ilustrativa (banco de imagens genérico), justificativa curta (2-3 linhas) em
sans-serif, e `PriceRangeBadge` (faixa de preço + rótulo "aproximado",
RNF-01). Ação por bloco: "Aprovar este destino". Ações
globais abaixo dos blocos: "Nenhum me interessa — gerar outras opções"
(RF-04.4) e "Já sei o destino, quero informar" (atalho para o campo manual).
Depois de aprovar um bloco, aparece o rodapé de decisão: "Continuar para
hospedagem" (padrão) ou "Só queria decidir o destino — encerrar aqui"
(RF-04.5), levando a `T-END(parcial)`.

### T05 — Confirmação de destino (RF-11)
Tela curta, single-purpose: nome do destino (informado pelo usuário em T01/T02
ou aprovado em T04) em destaque, com dois botões: "Confirmar e continuar" e
"Trocar destino" (volta para o campo de destino da tela de origem). Sempre
aparece, mesmo quando o destino veio de aprovação em T04 — mantém RN-01/RF-05
consistente também neste caminho (ADR-006).

### T06 — Sugestões de hospedagem (RF-06)
3 blocos em grid de uma coluna por linha (`SuggestionCard`, borda fina, sem
sombra — Seção 3) (nome/tipo, `PriceRangeBadge` por diária, característica
distintiva). Ações: "Aprovar" por bloco avança; "Ajustar" (com campo de
feedback textual curto) regenera a mesma etapa (RF-05.3), sem avançar. Rodapé
de decisão igual ao de T04: continuar para passeios, ou encerrar aqui
(preserva destino + hospedagem, RF-05.4).

### T07 — Sugestões de passeios (RF-07)
Lista de itens (nome, `PriceRangeBadge` — badge especial "Gratuito" quando
price = 0, RF-07.2 — e duração aproximada), cada um com checkbox marcado por
padrão e opção de remover antes de aprovar (RF-07.3). Botão "Aprovar seleção"
some/desabilita se todos os itens forem removidos, com mensagem explicando
que ao menos um item precisa permanecer para seguir ao roteiro (ou o próprio
botão de encerrar aqui continua disponível). Rodapé de decisão igual às
etapas anteriores.

### T08 — Roteiro final (RF-08)
Visualização por dia (um bloco por data do range da viagem), cada bloco
dividido em manhã/tarde/noite (RF-08.1), com as atividades aprovadas
posicionadas no período/horário sugerido, mostrando o horário e, quando
relevante, a justificativa curta do timing (RF-08.3, ex.: "09h — evitar
fila"). Ação única de aprovação no rodapé: "Aprovar roteiro e concluir" — não
há "ajustar" item a item dentro do roteiro no MVP; ajuste volta para T07
(remover/trocar passeios) e regenera o roteiro, mantendo RN-01 (uma etapa por
vez) sem introduzir uma quinta etapa de "edição livre de roteiro" fora de
escopo do PRD-TECNICO.md.

### T-END — Encerramento (completo ou parcial, RN-03)
Tela de resumo, reaproveitada em todo ponto de saída: lista o que foi
aprovado até aquele ponto (destino / + hospedagem / + passeios / roteiro
completo), com um rótulo de status claro ("Viagem decidida!" quando completo;
"Parte da sua viagem está decidida" quando parcial, nunca tratado como erro
ou fluxo incompleto/quebrado). CTA "Ver isso depois" (persistência já
garantida por RF-09/ADR-005, sem ação adicional do usuário).

## 3. Design System

Base: Tailwind CSS + shadcn/ui (SDD.md Seção 3), com tokens próprios do
produto sobre essa base.

**Direção visual: "Concierge Noturno"** — decidida fora do fluxo padrão de
agentes (exploração direta com o fundador via ferramenta de design do Claude
Code, 5 direções avaliadas), registrada aqui na reabertura de 2026-09-07. Tom
de concierge de viagem premium: fundo escuro quase preto, acento
dourado/champagne, seções separadas por bordas finas em vez de sombra/cartão
flutuante. É puramente uma decisão de camada visual/estética — não altera
nenhum fluxo, estado ou requisito funcional já definido nas Seções 1, 2 e 4;
onde a estética escura afeta a descrição visual de um componente (cartão →
bloco com borda, contraste de badge), a Seção 2 foi ajustada abaixo.

- **Paleta** (fundo escuro como base, não claro — inversão em relação à
  suposição neutra da versão anterior desta seção; valor exato de hex
  permanece detalhe de implementação, os *tokens semânticos* abaixo é que são
  decisão de UX-SPEC):
  - `background` — quase preto (ex.: `zinc-950`/`#0a0a0b` como referência de
    tom, não hex final).
  - `surface` — um tom levemente acima do `background`, usado para
    diferenciar áreas de conteúdo sem recorrer a sombra (blocos de T02/T04/
    T06/T07/T08 usam `surface` + borda fina, nunca `box-shadow`).
  - `accent` — dourado/champagne (a cor de marca do produto nesta direção),
    usado em: `StepperProgress` (linha fina indicando etapa atual), CTA
    principal de cada tela, e destaque de nome de destino/título.
  - `foreground` — quase branco (texto principal sobre `background`/
    `surface`), com uma variante `foreground-muted` de menor contraste para
    texto secundário (ex.: justificativa curta de `SuggestionCard`,
    frase de "quando usar" em T00).
  - **Paleta semântica, adaptada ao tema escuro** (mesma função de RF-10.2/
    ADR-004/Seção 5 da versão anterior, valores recalibrados para manter
    contraste AA sobre fundo escuro em vez de sobre fundo claro):
    - sucesso — verde claro/menta sobre `surface` escura (não o verde padrão
      de tema claro, que fica com contraste insuficiente sobre `#0a0a0b`).
    - atenção (`BudgetInsufficientBanner`, RF-10.2) — âmbar claro/dourado
      quente, distinto o bastante do `accent` dourado/champagne principal
      para não ser confundido com CTA (checado em `accessibility-review`:
      não é só a cor que diferencia — o banner mantém ícone + texto, ver
      Seção 5).
    - erro (`ErrorRetryState`, ADR-004) — vermelho/coral claro, calibrado
      para AA sobre `surface` escura.
  - Nenhuma cor é o único indicador de status (ver Seção 5, acessibilidade) —
    essa regra não muda com o tema.
- **Tipografia**: par serifada + sans-serif, consistente com o tom de
  concierge premium:
  - Títulos (nome de destino/cartão, título de etapa, `StepperProgress`
    quando expandido) — família serifada elegante, peso maior (referência de
    mockup: "Cormorant Garamond"; a família exata final é detalhe de
    implementação, mas o *par* serifada+sans é decisão de UX-SPEC, não
    trocável por uma única família sans-serif genérica).
  - Corpo de texto (parágrafos, `foreground-muted`, labels de formulário,
    texto de badge) — família sans-serif (referência de mockup: "Work
    Sans"), garantindo legibilidade em blocos de texto corridos onde uma
    serifada elegante prejudicaria a leitura.
  - Escala de tamanho consistente entre todas as telas T00-T08, sem mudança
    em relação à versão anterior desta seção — só a família muda, não a
    escala.
- **Componentes reutilizáveis (novos para este produto, sinalizados como tal)**:
  - `StepperProgress` (novo) — indicador do progresso no fluxo em etapas,
    presente em todas as telas de T01 em diante, refletindo o estado da state
    machine (ADR-006), nunca client-side apenas. Na direção "Concierge
    Noturno": trilha horizontal com linha fina na cor `accent`
    (dourado/champagne) indicando a etapa atual, sobre `background` — sem
    mudança de comportamento/lógica em relação à versão anterior desta seção,
    só de tratamento visual.
  - `SuggestionCard` (novo) — nome de componente mantido, mas o tratamento
    visual muda de "cartão com sombra" para **bloco em grid de uma coluna por
    linha (row)**, separado do próximo por uma borda fina em vez de sombra
    (`surface` + `border` fina, sem `box-shadow`) — usado em T04/T06/T07
    (destino, hospedagem, passeio), variando conteúdo mas mantendo estrutura
    idêntica (título em tipografia serifada, imagem opcional,
    `PriceRangeBadge`, ação principal). Estrutura/conteúdo/ordem de campos
    não mudam — só a moldura visual (linha em vez de cartão flutuante).
  - `PriceRangeBadge` (novo) — badge de faixa de preço com ícone + texto
    "faixa aproximada" sempre visível (nunca só cor), resolve RNF-01/RN-05 em
    nível de componente único, reduzindo risco de alguma tela esquecer o
    rótulo. Sobre fundo escuro, usa `surface` com borda sutil e texto em
    contraste AA (ver paleta semântica acima) — nunca um badge "sólido"
    saturado que compita visualmente com o `accent` dourado do CTA principal.
  - `LoadingStream` (novo) — estado de carregamento que exibe o conteúdo
    conforme chega via streaming (SDD.md Seção 2/RNF-02), não um spinner
    genérico — ver Seção 4.
  - `ErrorRetryState` (novo) — estado de erro pós-retry (ADR-004) com mensagem
    clara e CTA "Tentar novamente".
  - `EmptyState` (novo) — usado em T04 quando o usuário rejeita todas as
    sugestões (RF-04.4), antes de decidir nova rodada ou informar manualmente.
  - `BudgetInsufficientBanner` (novo) — banner de atenção usado em
    T04/T06/T07 quando RF-10.2 se aplica.
  - `HolidayListItem`, `ItineraryDayBlock` (novos) — específicos de T02 e T08.
  - Componentes de formulário/botão/checkbox/dialog vêm diretamente de
    shadcn/ui, sem alteração estrutural — reaproveitados, não novos.

## 4. Estados de Tela

Aplicado a toda tela que depende de geração por LLM (T04, T06, T07, T08) — os
4 estados obrigatórios, ou justificativa de não aplicabilidade:

| Tela | Vazio | Carregando | Erro | Sucesso |
|---|---|---|---|---|
| T04 (destino) | `EmptyState` quando usuário rejeita todas as sugestões (RF-04.4) — oferece nova rodada ou entrada manual | `LoadingStream`: skeleton de blocos (tom `surface` sobre `background`, sem sombra) preenchido progressivamente conforme a resposta chega (streaming, SDD.md Seção 2) | `ErrorRetryState` após falha do retry único (ADR-004): "Não conseguimos gerar sugestões agora — tentar novamente" | Blocos de destino (Seção 2) |
| T06 (hospedagem) | Não aplicável — sempre há 3 opções por definição de RF-06.1; se RF-10.2 zerar opções dentro do orçamento, o estado correto é o banner de orçamento insuficiente (Seção 1), não uma tela vazia | Idem T04 | Idem T04 | 3 blocos (Seção 2) |
| T07 (passeios) | Estado "todos os itens removidos" tratado como aviso inline (Seção 2), não como `EmptyState` de página inteira — o usuário ainda pode reverter a remoção | Idem T04 | Idem T04 | Lista de itens (Seção 2) |
| T08 (roteiro) | Não aplicável — roteiro só é gerado depois de passeios aprovados (RF-08 depende de RF-07 aprovado); sempre há ao menos um item | Idem T04, com granularidade por dia (dias já processados aparecem primeiro) | Idem T04 | Blocos por dia (Seção 2) |
| T01/T02/T03a-d/T05 | Não aplicável — são formulários/confirmação sem geração por LLM, sem estado "vazio" de conteúdo gerado | Não aplicável (sem chamada de LLM; T02 usa cálculo determinístico local, ADR-007, instantâneo) | Erro de validação inline (ex.: RF-01.4), não um `ErrorRetryState` de LLM | Formulário preenchido/válido, avança |

Estado de orçamento insuficiente (RF-10.2, RN-04) — não é um dos 4 estados
acima, é um estado adicional (banner `BudgetInsufficientBanner`) sobreposto ao
estado de sucesso de T04/T06/T07 quando aplicável: texto explícito ("Não
encontramos opções dentro do valor informado — mostrando a opção mais barata
disponível, que excede o orçamento em [diferença]"), nunca bloqueando os
botões de aprovar/ajustar/continuar (RN-04: orçamento nunca impede avançar).

## 5. Acessibilidade (WCAG)

Critério não negociável em toda tela T00-T08/T-END, verificado por
`accessibility-review`:

- Contraste mínimo AA (4.5:1 texto normal, 3:1 texto grande/ícones) em toda
  combinação de cor da paleta (Seção 3), incluindo os badges semânticos —
  checagem obrigatória para os tokens do tema escuro "Concierge Noturno"
  (Seção 3): `foreground`/`foreground-muted` sobre `background`/`surface`,
  `accent` dourado sobre `background` (usado em texto de CTA/link, não só em
  preenchimento decorativo), e cada cor semântica (sucesso/atenção/erro)
  recalibrada especificamente para AA sobre fundo escuro, não herdada
  diretamente de uma paleta pensada para tema claro.
- Nenhuma informação de status é comunicada só por cor: `PriceRangeBadge` usa
  ícone + texto; `BudgetInsufficientBanner` usa ícone de atenção + texto;
  estado de erro usa ícone + texto, nunca borda vermelha isolada.
- Navegação por teclado completa em todas as telas: `StepperProgress`,
  `SuggestionCard` (ação de aprovar/ajustar como botão focável), checkboxes de
  T07, formulários de T01/T03a-d — ordem de tab lógica, sem "trap" de foco
  fora de diálogos.
- Foco gerenciado explicitamente em toda transição de etapa (ADR-006): ao
  avançar de tela, o foco vai para o título da nova etapa, não permanece no
  botão da tela anterior (relevante para leitor de tela navegando um fluxo
  linear).
- `aria-live="polite"` na região de `LoadingStream`, para que o conteúdo
  chegando via streaming seja anunciado a leitores de tela sem interromper o
  usuário a cada token.
- Todo formulário (T01, T03a-d) tem label associado a cada campo e mensagem de
  erro conectada via `aria-describedby` (ex.: RF-01.4).
- Alvo de toque mínimo de 44x44px em botões de ação principal, relevante para
  o uso mobile (RNF-04).
- Sem pendência crítica identificada nesta especificação; qualquer ajuste fino
  de rótulo/ordem de foco fica para implementação, documentado no TASK.md.

## 6. Comportamento Responsivo

Mobile-first, breakpoints padrão Tailwind (`sm`/`md`/`lg`):

| Tela/Componente | Mobile (< md) | Desktop (>= md) |
|---|---|---|
| T00 (entrada) | 3 blocos empilhados verticalmente | 3 blocos em linha (grid 3 colunas) — T00 não é uma das 4 telas centrais da direção "Concierge Noturno" (Seção 3), mantém grid multi-coluna |
| `StepperProgress` | Indicador condensado (pontos + rótulo da etapa atual) | Trilha horizontal completa com linha fina `accent` (Seção 3) e nome de todas as etapas |
| T04/T06/T07 (`SuggestionCard`) | 1 coluna, scroll vertical | **Revisado nesta reabertura** — mantém 1 coluna (grid de uma linha por bloco/row) também no desktop, sem grid multi-coluna: a direção "Concierge Noturno" pede leitura sequencial tipo lista de concierge, não cartões lado a lado; largura máxima centralizada em telas largas (mesmo princípio de formulários abaixo) |
| T02 (feriados) | Lista vertical de blocos, largura total | Lista vertical, largura limitada centralizada (não vira grid — leitura sequencial faz mais sentido; mesmo padrão de linha única de T04/T06/T07) |
| T08 (roteiro) | Blocos de dia em acordeão (um dia expandido por vez, os demais colapsados) | **Revisado nesta reabertura** — coluna única larga com todos os dias expandidos, um `ItineraryDayBlock` por linha (sem lado a lado), consistente com o padrão de linha única das demais telas centrais |
| Formulários (T01/T03a-d) | Campos empilhados, largura total | Largura máxima centralizada (não esticar campos em telas largas) |
| T-END | Resumo em blocos empilhados | Resumo em blocos lado a lado por etapa aprovada — T-END não é uma das 4 telas centrais exploradas na direção "Concierge Noturno", layout mantido sem alteração |

Aplicável a todo fluxo relevante do MVP — nenhuma tela marcada como "não
aplicável" nesta seção. As duas linhas marcadas "Revisado nesta reabertura"
mudam de comportamento em relação à versão anterior desta seção (T04/T06/T07
e T08 deixam de usar grid multi-coluna/lado a lado no desktop) — efeito direto
da direção visual "Concierge Noturno" (grid de uma coluna por linha em vez de
cards com sombra), não uma mudança de fluxo/estrutura de tela.

## 7. Restrições Técnicas Aplicadas (autocheck contra o SDD.md)

Autochecagem direta contra a arquitetura definida na mesma sequência interna
(sem handoff externo), conforme `technical-constraint-check`:

- **Streaming de LLM (SDD.md Seção 2/3, RNF-02)** — `LoadingStream` (Seção 4)
  foi desenhado especificamente para consumir resposta em streaming, em vez de
  um spinner genérico, para atender a meta de p95 ≤ 8s com primeiro conteúdo
  perceptível em até 2s (SDD.md Seção 6). Trade-off aceito: cartões podem
  aparecer com preenchimento progressivo visualmente "incompleto" por um
  instante — decisão tomada em favor de percepção de fluidez sobre
  apresentação sempre-completa, dado que RNF-02 prioriza fluidez.
- **State machine server-side (ADR-006)** — toda navegação entre T00-T08
  depende de uma resposta do servidor confirmando a transição de etapa; não há
  navegação client-side otimista entre etapas. Consequência de UX: todo botão
  de avanço mostra estado de "processando" próprio (distinto do
  `LoadingStream` de geração) enquanto aguarda a confirmação de transição —
  documentado aqui para não ser perdido na implementação.
- **Retry único (ADR-004)** — `ErrorRetryState` (Seção 4) é desenhado para
  aparecer só depois do retry automático falhar; a UI não expõe o retry
  automático ao usuário (não há "tentando novamente 1 de 1" visível) — só o
  resultado final (sucesso silencioso ou erro explícito), para não adicionar
  ruído visual a uma falha que o sistema já tentou resolver sozinho.
- **RF-09/ADR-005 (persistência)** — nenhuma tela tem um botão explícito de
  "salvar": toda aprovação de etapa já persiste (ADR-006), então T-END só
  informa que o dado está salvo, sem exigir ação adicional do usuário. Trade-
  off: o usuário não tem uma ação visível de "desfazer aprovação" no MVP —
  ajuste de etapa só é possível via "Ajustar" antes de aprovar (RF-05.3); não
  há edição retroativa de etapa já aprovada. Decisão tomada porque o
  PRD-TECNICO.md (RF-05.3) só define ajuste antes da aprovação, não depois —
  não é uma lacuna, é escopo já delimitado; registrado aqui para deixar
  explícito que não foi esquecido.
- **RF-10.2/RN-04 (orçamento nunca bloqueia)** — `BudgetInsufficientBanner`
  (Seção 4) foi desenhado deliberadamente para nunca desabilitar os botões de
  ação da tela em que aparece, checagem direta contra RN-04.
- **Provider único sem fallback multi-provider (ADR-002/004)** — não há
  diferença de UX entre "falha do provider A" e "falha do provider B" a
  expor ao usuário, pois só existe um provider; `ErrorRetryState` usa
  mensagem genérica de falha de geração, sem mencionar provider — evita
  acoplar a UI a um detalhe de arquitetura que pode mudar (ADR-002 pode ser
  superseded sem impacto de tela).

Nenhum trade-off identificado nesta especificação teve custo/prazo alto o
suficiente para exigir sinalização ao Gestor — todos foram resolvidos dentro
da margem de decisão de detalhe do próprio Coordenador.
