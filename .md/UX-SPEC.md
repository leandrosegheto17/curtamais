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

**Incremento V2.0 (2026-09-16):** a Seção 8 acrescenta o V2.0 ("consultor de
roteiros": RF-12 a RF-18, RNF-08 a RNF-13). No V2.0, a home vitrine
**substitui T00 como página `/`**, e T00 vira uma seção da home. As Seções
1 a 7 continuam valendo para as demais telas, exceto onde a Seção 8 diz
explicitamente que muda (copy, imagem em T04, pré-preenchimento em T01/T02,
pedido de cadastro depois de T05).

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

---

## 8. Incremento V2.0 — "consultor de roteiros de viagem" (2026-09-16)

Autor: Coordenador (chapéu UX/UI). Entrada: `PRD.md` §4 (Plano do V2),
`PRD-TECNICO.md` (RF-12 a RF-18, RNF-08 a RNF-13) e `SDD.md` §8 com os
ADR-009 a ADR-012, produzidos na mesma sequência. A referência visual
validada pelo dono (home desktop, home mobile e card de T04 antes/depois) é
a direção. As paisagens desenhadas nela são provisórias: no V2.0 entram as
fotos curadas do catálogo ou o fallback.

### 8.1 Fluxos de Tela (V2.0)

| Fluxo/Requisito | Tela(s) | Rota |
|---|---|---|
| RF-12 home vitrine (substitui T00) | `T-HOME` (T00 vira a seção "caminhos") | `/` (âncora `#caminhos`) |
| RF-14 roteiro de exemplo | `T-EX` | `/roteiro-exemplo` |
| RF-13 card → fluxo | `T01` com destino pré-preenchido | `/entrada/data-livre?destino={slug}` |
| RF-18 feriados na home → T02 | `T02` com feriado pré-selecionado | `/entrada/feriados?feriado=AAAA-MM-DD` |
| RF-15 imagem do destino | `T04` (card com imagem) | `/destino` |
| RF-16 pedido de cadastro | `T-GATE` (criar conta / entrar / continuar com a conta atual) | `/cadastro?sessionId=` |
| RF-17.7 entrar sem sessão em andamento | `T-LOGIN` (mesmo formulário do T-GATE, sem sessão) | `/entrar?retorno=` |
| RF-17 meus roteiros | `T-MEUS` (lista) e `T-MEUS-DET` (T-END + T08 em leitura) | `/meus-roteiros`, `/meus-roteiros/[sessionId]` |
| RF-16.5 desistir do cadastro | `T-END` parcial (já existente, copy ajustada) | `/encerramento` |

Navegação do V2.0:

```
T-HOME ─┬─ "Montar minha viagem" ─→ #caminhos ─→ T01 | T02 | T03a-d
        ├─ card da vitrine ───────→ T01(destino pré-preenchido)
        ├─ feriado ───────────────→ T02(feriado pré-selecionado)
        └─ "Ver roteiro de exemplo" → T-EX ─→ T01(destino=gramado) | #caminhos

T01/T02/T03 → (T04 → T05) | T05
T05 "Seguir para a hospedagem" ─┬─ com conta ─→ T06 → T07 → T08 → T-END
                                └─ sem conta ─→ T-GATE ─┬─ cria conta / entra ─→ T06
                                                        ├─ "Agora não" ─→ T-END(parcial, destino)
                                                        └─ "Voltar" ─→ T05
AccountNav: "Meus roteiros" → T-MEUS → "Continuar" (etapa atual) | "Ver" → T-MEUS-DET
```

Continua valendo: nenhuma navegação pula etapa (RN-01) e nenhuma
navegação é otimista. O T-GATE só aparece depois de o servidor responder
`conta_necessaria` (`SDD.md` §8.2.5). T06, T07 e T08 também redirecionam
para T-GATE se receberem essa resposta (acesso direto ou sessão anônima
antiga, RF-16.9).

### 8.2 Wireframes (V2.0)

#### T-HOME — Home vitrine (RF-12)

A ordem é fixa (RF-12.1). Cabeçalho em todas as páginas: logotipo
"CurtaMais" (link para `/`) à esquerda e `AccountNav` à direita.

1. **Hero** (`HeroSection`): foto do destino marcado como `hero` no
   catálogo, em tela cheia na largura, com overlay (§8.3).
   - Sobre o overlay, alinhado à esquerda embaixo:
     - eyebrow "Seu consultor de roteiros, com IA";
     - título display "Diga quando pode viajar. *Eu monto o roteiro com
       você.*" (a segunda frase em itálico e na cor `accent`);
     - subtítulo "Destino, hospedagem, passeios e roteiro — uma etapa de
       cada vez, e nada avança sem o seu ok.";
     - dois CTAs: **"Montar minha viagem"** (primário, dourado) e **"Ver
       roteiro de exemplo"** (secundário, contorno);
     - abaixo dos CTAs, em texto visível (RF-12.2): "Eu monto o plano; a
       reserva você faz onde preferir."
   - Crédito da foto no canto inferior direito, em texto pequeno (RF-15.5).
2. **Três jeitos de começar** (`EntryPathsSection`, `id="caminhos"`, foco
   programático no título ao chegar pelo CTA): título "Três jeitos de
   começar, o mesmo roteiro no fim".
   - Os três blocos de T00 (§2) com peso igual e nenhum pré-selecionado,
     com os textos "Já sei minhas datas", "Quero aproveitar um feriado" e
     "Ainda não sei por onde começar".
   - Fica numa faixa `deep`.
3. **Como funciona** (`HowItWorksSteps`): título "Uma etapa de cada vez.
   Nada avança sem o seu ok." Lista ordenada de 4 passos, com número em
   fonte display:
   1. Destino — "Separo de 2 a 4 destinos e digo por que cada um combina
      com o seu período."
   2. Hospedagem — "Três opções, cada uma com o que ela tem de diferente."
   3. Passeios — "Você tira o que não quiser; sempre incluo ao menos uma
      opção gratuita quando existe."
   4. Roteiro — "Dia a dia, manhã, tarde e noite, com o porquê de cada
      horário."
4. **Vitrine** (`ShowcaseSection`): título "Comece por um lugar. Eu cuido
   das outras etapas."
   - 8 `ShowcaseCard` na ordem do catálogo: Rio de Janeiro, Porto de
     Galinhas, Gramado, Maceió, Porto Seguro, Florianópolis, Foz do
     Iguaçu e Campos do Jordão.
   - Cada card tem imagem 3:2 e, no overlay, a sigla da UF com o rótulo da
     região (ex.: "RS · Serra Gaúcha") e o nome do destino em fonte
     display.
   - O card inteiro é um link com o texto acessível "Planejar viagem para
     Gramado". Ele leva a `/entrada/data-livre?destino=gramado`.
   - **Sem preço e sem temporada nos cards**: o V2.0 não tem fonte curada
     para esses dados. Ver §8.7.
5. **O que você recebe** (`ExamplePreviewSection`): título "Um roteiro
   pronto, com hora e motivo."
   - Texto curto e a prévia do **Dia 1 do roteiro de exemplo** (Gramado),
     num `ItineraryDayBlock` só de leitura, com o selo `ExampleBadge`
     ("Exemplo").
   - Nota fixa: "Os preços que eu sugiro são faixas aproximadas, não
     cotações." (RF-12.3)
   - CTA "Ver o roteiro de exemplo completo" leva a T-EX.
6. **Próximos feriados** (`UpcomingHolidaysSection`): título "A folga já
   está no calendário. Falta o destino."
   - 3 `HolidayCallout`, cada um com a pílula "N dias" (acento
     `holiday`), o nome do feriado, a linha "Seg 12/10 · de sáb 10/10 a
     seg 12/10" e o link "Planejar este feriado", que leva a
     `/entrada/feriados?feriado=2026-10-12`.
   - O CTA **não** usa a cor de CTA dourada: é um link de texto em
     `foreground` com seta (RF-18.4).
7. **Perguntas frequentes** (`FaqSection`, `<details>` nativo, todos
   fechados por padrão), com estas perguntas e respostas mínimas:
   - "Quem monta o roteiro?" → "Eu, um assistente de inteligência
     artificial. Não há uma pessoa do outro lado, e eu posso errar:
     confira os detalhes antes de reservar." (RNF-11)
   - "Vocês fazem reservas?" → "Não. Eu sugiro e organizo; a reserva você
     faz onde preferir."
   - "Os preços são reais?" → "São faixas aproximadas para você
     comparar, não cotações."
   - "Preciso criar conta?" → "Para escolher o destino, não. Para seguir
     com hospedagem, passeios e roteiro, sim: é assim que eu guardo a sua
     viagem para você continuar depois."
   - "O que vocês fazem com o meu e-mail?" → "Uso só para salvar e
     recuperar seus roteiros. Não envio marketing. Você pode excluir sua
     conta quando quiser em 'Meus roteiros'."
8. **Rodapé** (`SiteFooter`): nome do produto, a linha "Eu monto o plano;
   a reserva você faz onde preferir." e a seção `ImageCreditsSection`
   (`id="creditos"`), que lista "Foto de {autor} no {Unsplash|Pexels}" com
   links, para cada imagem do catálogo exibida na home.
9. **Barra fixa no mobile** (`MobileStickyCta`, RF-12.6): só abaixo de `md`
   e só quando o hero sai da tela. É uma faixa inferior `surface-raised`
   com borda superior fina e o botão "Montar minha viagem", que leva a
   `#caminhos`.
   - Some quando a seção `#caminhos` está visível, para não duplicar a
     ação ao lado dos três caminhos.
   - Respeita `env(safe-area-inset-bottom)`.
   - A página ganha `padding-bottom` igual à altura da barra, para ela
     nunca cobrir conteúdo.

#### T-EX — Roteiro de exemplo (RF-14)

- **Destino escolhido: Gramado (RS), fim de semana de 3 dias.** Motivos:
  - já aparece na referência validada pelo dono ("Gramado · Dia 1");
  - não é praia, o que equilibra uma vitrine com 5 praias em 8 cards;
  - rende justificativas de horário claras (fila da Rua Coberta, frio no
    fim da tarde, horário de fondue), que são o diferencial de RF-08.3;
  - é a viagem curta de lazer que o produto promete;
  - tem apelo o ano todo.
- Topo:
  - `ExampleBadge` grande: "Roteiro de exemplo";
  - título "Gramado em 3 dias";
  - linha "Um roteiro que eu montei para mostrar como fica o resultado.
    O seu vai ser feito para as suas datas e o seu orçamento.";
  - imagem do catálogo em 16:9 (mobile) ou 21:9 (desktop).
- Resumo em 3 linhas (destino, hospedagem de exemplo, passeios), cada
  preço com `PriceRangeBadge` (RNF-01).
- Os dias vêm em `ItineraryDayBlock` só de leitura, com o rótulo "Dia 1 —
  sábado", sem data de calendário.
- Rodapé com dois CTAs:
  - **"Planejar minha viagem para Gramado"** (primário), que leva a
    `/entrada/data-livre?destino=gramado`;
  - "Ver os três jeitos de começar" (secundário), que leva a `/#caminhos`.

#### T01 — Data livre (alteração V2.0, RF-13)

- Com `?destino={slug}` válido:
  - o campo de destino vem preenchido com "{Nome}, {UF}" e continua
    editável;
  - uma linha de contexto aparece acima do formulário: "Ótima escolha.
    Agora me diga quando você pode ir.";
  - o título continua "Quando você quer viajar?";
  - o foco inicial vai para o título (como no MVP), e o primeiro campo na
    ordem de tabulação é a **data inicial**;
  - as datas vêm vazias e são obrigatórias (RF-13.3);
  - se o usuário apagar o destino, a linha de contexto some.
- Com `slug` inválido ou ausente, a tela fica igual à do MVP.

#### T02 — Feriados (alteração V2.0, RF-18.3)

- Com `?feriado=` válido:
  - o `HolidayListItem` correspondente já vem no estado selecionado, e a
    página rola até ele (sem animação quando
    `prefers-reduced-motion: reduce`);
  - uma região `aria-live="polite"` anuncia "Feriado selecionado: {nome},
    {período}.";
  - o campo de destino opcional fica logo abaixo, como no MVP, e o avanço
    exige o clique em "Seguir com este feriado".
- O usuário pode trocar o feriado normalmente.

#### T04 — Sugestões de destino (alteração V2.0, RF-15 e RNF-11)

`SuggestionCard` com mídia:

- **Mobile**: imagem 16:9 no topo do card.
- **Desktop (>= md)**: imagem 4:3 à esquerda, ocupando cerca de 40% da
  largura do card, com o texto à direita.
- Em ambos:
  - selo pequeno "imagem ilustrativa" no canto da imagem;
  - legenda de crédito "Foto: {autor} / {fonte}" abaixo da imagem, em
    texto pequeno `foreground-muted`;
  - no fallback, não há crédito nem selo, porque não é foto.
- Conteúdo do card:
  - linha em voz de consultor acima do nome: "Combina com o seu período
    porque…" ou equivalente, **sem gerar texto novo**: é um rótulo fixo
    antes da justificativa que a IA já devolve;
  - nome, justificativa e `PriceRangeBadge`.
- Ações:
  - por card: **"Quero este destino"**;
  - globais: **"Me mostre outras opções"** e **"Já sei aonde quero ir"**;
  - rodapé depois de aprovar: **"Seguir para a hospedagem"** e **"Por
    enquanto, só o destino"**.
- Estrutura, estados e regras de §2 e §4 inalterados.

#### T05 — Confirmação de destino (alteração V2.0)

- Título "Então vamos para {destino}?".
- Botões: **"Seguir para a hospedagem"** (antes "Confirmar e continuar") e
  **"Quero trocar o destino"**.
- Uma linha pequena abaixo do botão primário, só para quem não tem conta
  (a tela recebe esse dado do servidor na renderização): "No próximo passo
  eu peço um e-mail para guardar a sua viagem." Isso evita surpresa com o
  pedido de cadastro.
- Estado de processamento do botão como no MVP. Com `conta_necessaria`, a
  tela navega para T-GATE.

#### T-GATE — Pedido de cadastro / entrada (RF-16, RNF-13) — **tela nova**

Tela única e centralizada, com largura de formulário (§6) e sem
`StepperProgress` (não é uma etapa).

1. **Contexto do que já foi decidido**: faixa compacta com a imagem do
   destino (catálogo ou fallback, 16:9 pequena) e "Destino escolhido:
   {destino} · {período}". Essa faixa confirma que nada foi perdido
   (RN-11).
2. **Título**: "Vamos guardar a sua viagem?".
3. **Por quê** (RF-16.3), em uma frase: "Com uma conta, eu salvo o que
   você já decidiu e seguimos juntos para hospedagem, passeios e
   roteiro."
4. **Alternância** entre "Criar conta" (padrão) e "Já tenho conta", como
   dois botões de alternância com `aria-pressed`. Não usa abas. Trocar de
   modo preserva o e-mail digitado.
5. **Formulário "Criar conta"** (`AuthForm`, modo cadastro):
   - campos: E-mail (`type=email`, `autocomplete=email`) e Senha
     (`type=password`, `autocomplete=new-password`, com o botão "Mostrar
     senha");
   - dica "Mínimo de 8 caracteres." ligada por `aria-describedby`;
   - **nenhum outro campo** (RNF-13);
   - **`ConsentCheckbox`**, desmarcado por padrão, com o texto exato de
     `CONSENTIMENTO_TEXTO`: "Concordo com o armazenamento dos meus dados
     (e-mail e roteiros) para salvar e recuperar meus roteiros.";
   - texto de apoio logo abaixo, sempre visível: "Uso seu e-mail só para
     isso. Não envio marketing. Você pode excluir sua conta quando quiser,
     em 'Meus roteiros'.";
   - botão primário **"Criar conta e seguir para a hospedagem"**.
6. **Formulário "Já tenho conta"**:
   - E-mail e Senha (`autocomplete=current-password`);
   - botão primário **"Entrar e seguir para a hospedagem"**;
   - **sem** link "Esqueci minha senha", porque não existe no V2.0 (ver
     §8.7);
   - linha pequena: "Não lembra a senha? Por enquanto não consigo
     recuperá-la; você pode criar outra conta com outro e-mail."
     **Pendente de decisão do dono** (§8.7).
7. **Usuário já autenticado** (sessão antiga ou outra aba): os formulários
   são substituídos por "Você está na conta {e-mail}." com o botão
   **"Continuar com esta conta"** e o link "Não é você? Sair". O vínculo só
   acontece no clique.
8. **Saídas**, abaixo do formulário e separadas por uma borda fina:
   - **"Agora não — ficar só com o destino"** (botão secundário, RF-16.5):
     leva a T-END parcial;
   - **"Voltar"** (link): leva a T05.
9. **Erros** (RF-16.8), sempre inline, junto do campo, com ícone e texto
   (§8.4). Todos mantêm o formulário preenchido (menos a senha, em caso de
   erro de credencial) e a sessão intacta.
   - Consentimento desmarcado: "Para criar a conta, preciso que você
     concorde com o armazenamento dos dados." (junto do checkbox).
   - E-mail inválido: "Esse e-mail não parece válido."
   - Senha curta: "A senha precisa ter pelo menos 8 caracteres."
   - E-mail já cadastrado: "Esse e-mail já tem conta. Quer entrar com
     ele?", com o botão "Entrar com este e-mail", que troca para o modo
     entrar com o e-mail preenchido.
   - Credencial incorreta: "E-mail ou senha incorretos." (mensagem única,
     sem dizer qual dos dois).
   - Muitas tentativas: "Muitas tentativas seguidas. Espere alguns minutos
     e tente de novo."
   - Erro de servidor ou rede: "Não consegui concluir agora. Seu destino
     continua guardado aqui; tente de novo.", com o botão "Tentar de
     novo".
   - Conta criada, mas a entrada falhou: troca para o modo entrar com o
     e-mail preenchido e a mensagem "Sua conta foi criada. Entre para
     continuar."

#### T-LOGIN — Entrar (RF-17.7) — **tela nova, mesmo `AuthForm`**

- Mesmo layout do T-GATE, sem o item 1 (não há destino) e sem as saídas.
  - Título: "Entre para ver seus roteiros".
  - Modo padrão: "Já tenho conta". A alternância "Criar conta" continua
    disponível, com o mesmo consentimento.
- Depois de entrar, a tela vai para `retorno` (lista permitida) ou
  `/meus-roteiros`.

#### T-MEUS — Meus roteiros (RF-17) — **tela nova**

- Título "Meus roteiros" e subtítulo "Tudo o que você já decidiu comigo,
  do mais recente para o mais antigo."
- Lista (`<ul>`) de `TripListItem`, uma linha por sessão, separadas por
  borda fina e sem sombra:
  - miniatura quadrada do destino (catálogo ou fallback; decorativa,
    `alt=""`);
  - nome do destino em fonte display, ou "Destino ainda não escolhido";
  - período "10/10 a 12/10/2026", se houver;
  - "Atualizado em 16/09/2026";
  - `StatusPill` com o rótulo do RF-17.3: "Em andamento — na etapa
    hospedagem", "Roteiro concluído" ou "Encerrada em passeios". O texto
    vem sempre acompanhado de ícone: relógio para em andamento, visto para
    concluído, bandeira para encerrado. A cor nunca é o único sinal.
- Ação por linha, com um único botão por item (o item não é inteiro
  clicável, para evitar ambiguidade):
  - Em andamento: **"Continuar de onde parei"**, que chama
    `retomarSessao` com estado de processamento no botão;
  - Concluída ou encerrada: **"Ver"**, que leva a T-MEUS-DET.
- Vazio (RF-17.6): ver §8.4.
- Rodapé da página, separado por borda:
  - "Sua conta: {e-mail}";
  - "Sair";
  - **"Excluir minha conta"**, botão destrutivo de contorno, que abre um
    diálogo (shadcn `AlertDialog`) com: "Excluir a conta apaga seu e-mail
    e todos os roteiros salvos. Isso não pode ser desfeito." e os botões
    "Cancelar" (foco inicial) e "Excluir conta". Depois de excluir, a tela
    faz `signOut` e vai para `/` com o aviso "Sua conta foi excluída."

#### T-MEUS-DET — Roteiro salvo (RF-17.5) — **tela nova, reaproveita T-END e T08**

- Link "← Meus roteiros".
- Bloco de resumo igual ao de T-END (§2), com rótulo de status.
- Se `concluida`: título "Seu roteiro" e os dias em `ItineraryDayBlock` só
  de leitura, com as datas reais. Não há ação de aprovar nem de ajustar.
- Se encerrada sem roteiro: só o resumo e a linha "Esta viagem foi
  encerrada em {etapa}."

#### T-END — Encerramento (alteração de copy V2.0)

- Com conta:
  - "Viagem decidida!" (completo) ou "Parte da sua viagem está decidida"
    (parcial), como no MVP;
  - a linha "Está salvo em 'Meus roteiros'." e o CTA "Ver meus roteiros".
- Sem conta (parcial, depois de "Agora não"):
  - "Seu destino está escolhido: {destino}.";
  - linha honesta: "Sem uma conta, não consigo guardar esta viagem para
    depois. Se quiser, anote ou tire um print.";
  - CTA "Planejar outra viagem", que leva a `/`.
  - Não prometer "salvo" (RNF-11, confiabilidade percebida).

### 8.3 Design System (V2.0)

**Tokens novos** (acrescentados a `globals.css` e ao Tailwind; os tokens do
§3 continuam):

| Token | Valor | Uso | Contraste verificado |
|---|---|---|---|
| `deep` | `#101A2B` | fundo das faixas de seção (caminhos, feriados) | `foreground` 16,7:1 · `foreground-muted` 6,8:1 · `accent` 8,4:1 · `holiday` 5,9:1 |
| `surface-raised` | `#1F1F23` | card elevado (ShowcaseCard sem imagem carregada, barra fixa, T-GATE, `HolidayCallout`) | `foreground` 15,7:1 · `foreground-muted` 6,4:1 · `holiday` 5,6:1 |
| `holiday` | `#E07A5F` | **só** acento de feriado: pílula "N dias", fio superior do `HolidayCallout`, ícone de calendário. Nunca em CTA, link principal ou estado de erro | sobre `background` 6,7:1 |
| `holiday-foreground` | `#1A0B06` | texto sobre a pílula `holiday` preenchida | 6,5:1 |
| `accent-strong` | `#E8C88A` | hover e pressionado do CTA dourado | texto `accent-foreground` >= 10:1 |
| `overlay-scrim` | `linear-gradient(to top, rgb(10 10 11 / .88) 0%, rgb(10 10 11 / .70) 40%, rgb(10 10 11 / 0) 80%)` | sobre toda foto que recebe texto (hero, ShowcaseCard) | ver regra abaixo |

- **Regra do overlay** (RNF-09): texto sobre imagem só pode ocupar a faixa
  em que a opacidade do scrim é >= 0,60.
  - Com `#FAFAFA` sobre uma foto branca pura, o pior caso, a opacidade
    0,60 dá 5,0:1. Portanto o AA vale **independentemente da foto**.
  - No hero, soma-se uma camada uniforme `rgb(10 10 11 / .35)` para
    garantir a legibilidade do eyebrow.
  - Texto sobre imagem é sempre `foreground`, nunca `accent` (a exceção é
    o trecho em itálico do título display do hero, que é texto grande e
    tem 3:1 garantido com o scrim a 0,70).
- **Fallback** (`DestinationFallbackArt`): paleta fixa de 8 gradientes
  escuros (ADR-010), cada extremo com contraste >= 4,5:1 com `#FAFAFA`,
  verificado por teste. Valores de referência (de → para):
  1. `#1B2A41→#0F1A2B`
  2. `#2A1E36→#161022`
  3. `#1F3330→#0F1D1B`
  4. `#3A2A1E→#1E150E`
  5. `#2B2F1A→#16180C`
  6. `#1E2A3A→#2A1E2E`
  7. `#332022→#1A1012`
  8. `#23303A→#121A20`

**Tipografia** (RNF-08): o par do §3 continua, **com a escala display
maior**, via `next/font`.

| Papel | Família / peso | Tamanho (mobile → desktop) |
|---|---|---|
| Display hero (h1) | Cormorant Garamond 500 | `clamp(2.5rem, 7vw, 4.5rem)`, altura de linha 1,05 |
| Título de seção (h2) | Cormorant Garamond 500 | `clamp(1.875rem, 4vw, 3rem)` |
| Título de card da vitrine / destino (h3) | Cormorant Garamond 600 | 1.5rem → 1.75rem |
| Título de etapa (T01–T08, T-GATE, T-MEUS) | Cormorant Garamond 500 | 1.875rem → 2.25rem (antes, `text-xl` sans) |
| Eyebrow | Work Sans 500, caixa alta, espaçamento .12em | 0.75rem |
| Corpo | Work Sans 400 | 1rem, altura de linha 1,6 |
| Texto pequeno (crédito, dicas) | Work Sans 400 | 0.8125rem (nunca abaixo disso) |

**Componentes** (novo = **N**, alterado = **A**, reaproveitado sem mudança
= R):

- **N `ShowcaseCard`**:
  - props: `destino: DestinoCatalogo`, `href`;
  - `<a>` com imagem 3:2 (`DestinationImage`, `alt=""`, decorativa: o
    nome está no texto), `overlay-scrim`, eyebrow "UF · Região" e nome em
    h3;
  - borda fina `border`, **sem sombra**, raio `--radius`;
  - foco: anel `ring` de 2px com deslocamento de 2px (visível sobre a
    foto);
  - hover: borda `accent` e zoom da imagem de 1.03, só com
    `prefers-reduced-motion: no-preference`;
  - um botão ou link secundário "i" (`aria-label="Crédito da imagem de
    {nome}"`) leva a `#creditos`. Ele fica fora do `<a>` principal, para
    não aninhar interativos.
- **N `DestinationImage`** (cliente):
  - recebe `ImagemResolvida`, `sizes` e `priority?`;
  - com imagem curada, usa `next/image` com `width`/`height` do catálogo
    e `object-position` pelo foco;
  - no fallback ou em `onError`, troca para `DestinationFallbackArt` com a
    mesma proporção (sem layout shift);
  - props `alt` e `showIllustrativeTag`.
- **N `DestinationFallbackArt`**: `div` com o gradiente da paleta e a
  inicial em Cormorant (cerca de 40% da altura), cor `foreground` a 85%.
  Usa `role="img"` com `aria-label="Imagem ilustrativa de {nome}"` quando
  informativa (T04), ou `aria-hidden="true"` quando decorativa (vitrine,
  lista).
- **N `ImageCredit`**: "Foto: {autor} / {Unsplash|Pexels}" com dois links
  externos (`rel="noopener noreferrer"`, `target` padrão, sem abrir nova
  aba).
- **N `ImageCreditsSection`**: lista de créditos no rodapé, `id="creditos"`.
- **N `HeroSection`**, **N `HowItWorksSteps`**, **N `FaqSection`**
  (`<details>`/`<summary>` estilizados), **N `SiteFooter`**.
- **N `SectionBand`**: faixa de largura total com fundo `deep` e conteúdo
  com largura máxima.
- **N `HolidayCallout`**: `surface-raised`, fio superior de 2px `holiday`,
  pílula "N dias", nome em h3, período, link "Planejar este feriado".
  Área clicável >= 44 px.
- **N `MobileStickyCta`**: ver T-HOME item 9.
- **N `ExampleBadge`**: pílula de contorno `accent` com ícone de "olho" e
  texto "Exemplo" ou "Roteiro de exemplo".
- **N `AuthForm`**: modos cadastro e entrar, validação inline e
  `aria-describedby`.
- **N `ConsentCheckbox`**: checkbox shadcn com rótulo longo clicável e
  mensagem de erro ligada.
- **N `AccountNav`** (cliente): "Entrar" (link) sem conta; "Meus roteiros"
  e "Sair" com conta. Largura mínima reservada. No mobile, dois links de
  texto compactos, sem menu hambúrguer, porque são só dois itens.
- **N `TripListItem`**, **N `StatusPill`**.
- **A `SuggestionCard`**: prop opcional `media` (imagem 16:9 no topo no
  mobile, 4:3 lateral no desktop) e prop opcional `eyebrow` (a linha de
  voz de consultor). Sem `media`, o layout fica idêntico ao do MVP, que é
  o caso de T06 e T07.
- **A `ItineraryDayBlock`**: prop `readOnly` (sem ações) e prop
  `dayLabel` (substitui a data formatada; usada em T-EX).
- **A `HolidayListItem`**: estado `selecionado` controlável por prop
  inicial (T02 pré-selecionado).
- **A `StepperProgress`**: sem mudança de lógica; os rótulos seguem o
  glossário (§8.8).
- R: `PriceRangeBadge`, `LoadingStream`, `ErrorRetryState`, `EmptyState`,
  `BudgetInsufficientBanner`, e os componentes shadcn (`AlertDialog`,
  `Checkbox`, `Button`, `Input`, `Label`).

### 8.4 Estados de Tela (V2.0)

| Tela | Vazio | Carregando | Erro | Sucesso |
|---|---|---|---|---|
| T-HOME | Não se aplica: o conteúdo é estático e sempre existe. Único caso: **menos de 3 feriados futuros** na lista (só possível perto do fim do ano seguinte). A seção mostra os que existirem e, se não houver nenhum, a seção **some** | Não se aplica à página (estática). Imagens: fundo `surface` com proporção reservada até carregar. `AccountNav`: espaço reservado sem texto até `getSession` resolver | Imagem falhou: `DestinationFallbackArt` (RF-15.9). `getSession` falhou: mostra "Entrar" (padrão seguro) | Seções completas |
| T-EX | Não se aplica (conteúdo congelado, garantido em build) | Não se aplica (estático) | Imagem falhou: fallback | Roteiro completo |
| T01 com `?destino` | Não se aplica. `slug` inválido vira a tela do MVP, sem mensagem de erro, porque o usuário não fez nada errado | Botão com estado de processamento (MVP) | Validação inline (MVP) e erro genérico acessível (MVP) | Navega para T05 ou T04 |
| T02 com `?feriado` | Não se aplica. Data inválida vira a lista sem seleção | Não se aplica | MVP | Navega |
| T04 (imagem) | MVP | Skeleton do card **com o bloco de mídia na proporção final** (16:9 ou 4:3) | MVP; imagem falhou: fallback | Card com imagem ou fallback |
| T-GATE | Não se aplica (formulário). Sessão inexistente ou de outra pessoa: redireciona para `/`, como o MVP faz em 404. Sessão já terminal: redireciona para T-END | Botão primário com estado de processamento, com o texto mudando para "Criando sua conta…" / "Entrando…" e depois "Guardando sua viagem…". Os campos ficam desabilitados, e as saídas continuam habilitadas até o envio começar | Mensagens da §8.2 (T-GATE item 9), inline e com ícone | Navega para a rota devolvida pelo vínculo (T06) |
| T-LOGIN | Não se aplica | Idem T-GATE | Idem (credencial e limite de tentativas) | Navega para `retorno` ou T-MEUS |
| T-MEUS | **`EmptyState`** (RF-17.6): ícone de mapa, "Você ainda não tem roteiros salvos.", "Quando você escolher um destino e seguir para a hospedagem, a viagem aparece aqui." e o CTA **"Planejar uma viagem"**, que leva a `/#caminhos` | `loading.tsx` da rota com o skeleton de 3 linhas (`surface` sobre `background`, sem sombra). "Continuar" com estado de processamento no botão | Falha de leitura: `ErrorRetryState` "Não consegui carregar seus roteiros agora." com "Tentar de novo". Falha em "Continuar": mensagem inline na própria linha ("Não consegui abrir esta viagem agora."), sem navegar. Exclusão falhou: mensagem no diálogo, que continua aberto | Lista |
| T-MEUS-DET | Não se aplica. Sem roteiro, só o resumo (§8.2) | Skeleton de resumo e dias | Sessão não encontrada ou de outra conta: volta a T-MEUS com o aviso "Não encontrei essa viagem." Falha de leitura: `ErrorRetryState` | Resumo e roteiro |
| T-END sem conta | MVP | MVP | MVP | Copy da §8.2 |

### 8.5 Acessibilidade (V2.0)

Os critérios do §5 continuam em todas as telas novas. Acréscimos (RNF-09 e
RNF-10):

- **Contraste sobre imagem**: garantido pela regra do overlay (§8.3), não
  pela foto. Também vale para o fallback, porque todos os gradientes da
  paleta foram verificados. O Validador confere com as fotos reais mais
  claras do catálogo.
- **Alvos de toque de 44×44 px ou mais**: CTAs, `ShowcaseCard` (o card
  inteiro), botão "i" de crédito (a área de toque é de 44 px mesmo que o
  ícone seja de 20 px), link de `HolidayCallout`, `summary` do FAQ, botões
  de `TripListItem`, checkbox de consentimento (área clicável estendida
  ao rótulo), alternância do T-GATE e links do `AccountNav`.
- **`alt`**:
  - decorativas com `alt=""`: hero, vitrine, miniatura de T-MEUS e faixa
    de contexto do T-GATE (o nome do destino está sempre no texto);
  - informativas: T04 e T-EX, com "Imagem ilustrativa de {destino}"
    (RF-15.6);
  - nunca "foto de…" nem "foto do local".
- **Movimento** (RNF-10):
  - sem autoplay, parallax, vídeo ou slideshow;
  - a vitrine no mobile rola na horizontal **só pelo usuário**
    (`scroll-snap`, sem avanço automático, sem setas que se movem
    sozinhas);
  - `scroll-behavior: smooth`, zoom de hover e transição da barra fixa só
    dentro de `@media (prefers-reduced-motion: no-preference)`;
  - com `reduce`, a barra aparece e some sem deslocamento (só troca de
    opacidade, em até 150 ms, ou instantânea).
- **Vitrine horizontal no mobile**:
  - `<ul>` com `aria-label="Destinos para começar"`;
  - cada card é um link focável, e ao receber foco o item rola para a área
    visível (`scroll-margin`);
  - o próximo card aparece parcialmente (cerca de 15%) como pista visual de
    rolagem;
  - não há conteúdo acessível só por gesto.
- **Foco**:
  - "Montar minha viagem" leva o foco ao h2 de `#caminhos` (`tabIndex=-1`);
  - T-GATE: ao abrir, foco no título; ao trocar de modo, foco no primeiro
    campo; num erro de envio, foco no primeiro campo com erro;
  - T-MEUS: depois de "Excluir conta" cancelado, o foco volta ao botão.
- **Barra fixa**: não cobre o foco. A página reserva o espaço, e o elemento
  focado rola acima dela (`scroll-padding-bottom`).
- **Formulários**:
  - `autocomplete` correto;
  - `aria-invalid` e mensagem ligada por `aria-describedby`;
  - o checkbox tem rótulo clicável e o erro ligado a ele;
  - a exigência da senha é anunciada antes do erro (dica sempre visível).
- **Status**: `StatusPill` e pílula de feriado usam ícone e texto. A
  terracota nunca é o único sinal.
- **Idioma e leitura**: `lang="pt-BR"`; números de data no formato
  "10/10"; o FAQ usa `<details>` nativo (anunciado como
  expandido/recolhido).
- **Honestidade** (RNF-11): a identificação como IA aparece em texto
  visível na home (eyebrow do hero e FAQ), não só em `aria-label`.
- Pendência crítica: nenhuma.

### 8.6 Comportamento Responsivo (V2.0)

Breakpoint de "mobile" do RF-12.6: **abaixo de `md` (768 px)**.

| Tela/Componente | Mobile (< md) | Desktop (>= md) |
|---|---|---|
| Hero | `min-height: 78svh`; imagem `object-cover`; texto embaixo; CTAs empilhados em largura total; `sizes="100vw"` | Altura `min(80vh, 760px)`; texto em até 7 colunas à esquerda; CTAs lado a lado; `sizes="100vw"` |
| Três caminhos | Empilhados (T00 do MVP) | 3 colunas (T00 do MVP) |
| Como funciona | Lista vertical numerada | 4 colunas |
| Vitrine | Rolagem horizontal com `scroll-snap`, cards com 82% da largura, 3:2; `sizes="82vw"` | Grade de 4 colunas × 2 linhas (`lg`), ou 2 colunas entre `md` e `lg`; `sizes="(min-width:1024px) 25vw, 50vw"` |
| Prévia do exemplo | Coluna única | Texto e prévia do Dia 1 lado a lado (5/7) |
| Próximos feriados | Empilhados | 3 colunas |
| FAQ | Largura total | Largura máxima de 720 px, centralizado |
| Barra fixa | Visível depois do hero, exceto quando `#caminhos` está na tela | Não existe |
| `AccountNav` | Links de texto compactos | Links de texto |
| T04 `SuggestionCard` | Imagem 16:9 no topo; `sizes="100vw"` | Imagem 4:3 à esquerda (cerca de 40%); `sizes="(min-width:768px) 320px"` |
| T-EX | Imagem 16:9; dias em acordeão (padrão de T08 no mobile, §6) com o Dia 1 aberto | Imagem 21:9; dias em coluna única, todos abertos |
| T-GATE / T-LOGIN | Largura total com margem de 16 px; faixa de contexto no topo | Coluna centralizada de até 480 px |
| T-MEUS | Linha: miniatura de 56 px, texto, botão abaixo do texto | Linha: miniatura de 72 px, texto, botão à direita |
| T-MEUS-DET | Resumo empilhado e dias em acordeão | Resumo e dias em coluna única, como T08 no desktop |

Todo fluxo novo tem comportamento definido; nenhum foi marcado como "não
aplicável".

### 8.7 Restrições Técnicas Aplicadas (autocheck contra `SDD.md` §8)

- **Home sem sessão no servidor (ADR-011)**: a área de conta aparece depois
  da hidratação. Trade-off aceito: o link "Meus roteiros" surge alguns
  milissegundos depois, em espaço reservado (sem CLS). A alternativa (home
  dinâmica) pioraria o LCP do RNF-12.
- **Pedido de cadastro depois do servidor (ADR-009)**: T05 não decide
  sozinha se mostra T-GATE; ela reage à resposta `conta_necessaria`. Para
  não surpreender, a própria T05 avisa, sem bloquear, que o próximo passo
  pede e-mail (o dado vem da renderização).
- **Vínculo só no clique**: quem abre T-GATE já autenticado vê "Continuar
  com esta conta", em vez de avançar sozinho. Custa um clique, mas evita
  vincular sem intenção num navegador compartilhado.
- **Sem recuperação de senha nem verificação de e-mail** (sem provedor de
  e-mail, `SDD.md` §8.6): a tela não mostra "Esqueci minha senha". A
  mensagem provisória em T-GATE/T-LOGIN fica **pendente de decisão do
  dono**: aceitar a limitação no protótipo, ou trazer um provedor de e-mail
  para o V2.0 (muda custo e prazo). Sinalizado ao Gestor na resposta desta
  rodada.
- **Exclusão de conta na interface**: o RNF-13 manda a tela dizer que a
  conta pode ser excluída, e só a API existia. Por isso incluí o botão em
  T-MEUS. É uma decisão de detalhe, com custo baixo (reaproveita
  `DELETE /api/account`), mas o dono pode preferir outro lugar.
- **Vitrine sem preço e sem temporada**: a referência visual trazia
  "mai–out" e "R$ 300–700, aprox." nos cards. O V2.0 não tem fonte curada
  para esses números, e um preço estático sem fonte repete o risco R-01
  fora do rótulo da IA. Decidi tirar os dois (detalhe de UX dentro do
  RF-12; o RF-12.3 só exige a nota **quando** houver preço). Se o dono
  quiser, eles podem voltar no V2.1 com fonte definida.
- **Primeira pessoa do singular**: a referência usava "Nós montamos o
  resto". Adotei "Eu monto…" em todo o produto, porque o RNF-11 dá o
  exemplo no singular e porque "nós" sugere uma equipe humana, o que o
  RNF-11 e o RN-07 proíbem. A frase do RF-12.2 ficou "Eu monto o plano; a
  reserva você faz onde preferir", equivalente ao texto do requisito.
- **Terracota perto da cor de erro**: `holiday` (`#E07A5F`) e `error`
  (`#F0918A`) são próximas. Mitigação: `holiday` nunca aparece em texto de
  status, sempre vem com ícone de calendário e a palavra "dias", e o erro
  sempre tem ícone de alerta e `role="alert"`. As duas nunca aparecem na
  mesma tela, exceto T02 com erro de envio, onde o erro fica em bloco
  próprio no topo.
- **Imagem em T04 via servidor (ADR-010)**: a imagem vem junto das
  sugestões, na mesma resposta. Não existe estado "imagem carregando
  depois do texto" além do carregamento lazy do arquivo, que tem espaço
  reservado.
- **Roteiro de exemplo congelado (ADR-011)**: T-EX usa rótulos "Dia 1 —
  sábado" em vez de datas, para não envelhecer.
- **State machine inalterada**: nenhuma tela nova cria etapa. T-GATE,
  T-LOGIN e T-MEUS ficam fora do `StepperProgress`.

Único trade-off com impacto possível em custo e prazo: recuperação de
senha e verificação de e-mail. Ele está sinalizado e não bloqueia o V2.0.

### 8.8 Glossário de copy — voz de consultor (RNF-11)

**Regras de voz**

1. Primeira pessoa do **singular** para o assistente: "Separei", "Montei",
   "Posso tentar de novo?". Nunca "nós", "nossa equipe" ou "nossos
   especialistas".
2. Tratar o usuário por "você". Frases curtas, sem ponto de exclamação em
   excesso (no máximo um por tela).
3. O assistente se declara IA na home (hero e FAQ) e no FAQ de ajuda.
   Nunca sugere que existe uma pessoa respondendo.
4. Toda faixa de preço continua "aproximada" (RNF-01). Nunca "preço",
   "valor final" ou "cotação" sem esse rótulo.
5. As ações continuam claras sobre o que fazem. A voz muda a redação, não
   o comportamento.

**Termos proibidos** (em CTA, título, card, mensagem e `aria-label`;
verificação do Validador por busca no código-fonte e nos textos de
conteúdo):

| Categoria | Termos proibidos |
|---|---|
| Reserva/venda (RN-07) | "Reservar", "Reserve", "Faça sua reserva", "Comprar", "Compre", "Garantir vaga", "Garanta", "Finalizar compra", "Checkout", "Pagar", "Pagamento", "Carrinho", "Oferta", "Promoção", "Pacote" (como produto), "Melhor preço", "Preço final", "Disponibilidade" (como estoque), "Emitir" |
| Agência/humano (RN-07, RNF-11) | "Agência", "Agente de viagens", "Nossa equipe", "Nossos especialistas", "Fale com um atendente", "Atendimento", "Consultor humano", "Chat com especialista", "Um especialista vai te responder" |
| Linguagem de sistema (RNF-11) | "Aprovar este destino", "Aprovar", "Submeter", "Enviar dados", "Processando requisição", "Sessão", "Etapa concluída com sucesso", "Erro 404/500", "Operação inválida" |

**Exceções permitidas** (só nestas formas exatas):

- "a reserva você faz onde preferir" (linha do RF-12.2);
- "Vocês fazem reservas?" e "Não." (FAQ);
- "não é uma agência" (se usado no FAQ);
- "sessão" só em código, nunca em texto de interface.

**Substituições** (MVP → V2.0):

| Onde | MVP | V2.0 |
|---|---|---|
| T04 ação por card | "Aprovar este destino" | "Quero este destino" |
| T04 nova rodada | "Nenhum me interessa — gerar outras opções" | "Me mostre outras opções" |
| T04 manual | "Já sei o destino, quero informar" | "Já sei aonde quero ir" |
| T04 carregando | "Carregando…" / skeleton | "Estou separando destinos para o seu período…" |
| T04 sucesso (título) | "Sugestões de destino" | "Separei {n} destinos para o seu período" |
| Rodapé (todas as etapas) | "Continuar para hospedagem / passeios / roteiro" | "Seguir para a hospedagem / os passeios / o roteiro" |
| Rodapé (todas as etapas) | "Só queria decidir o destino — encerrar aqui" / "encerrar aqui" | "Por enquanto, só o destino" / "Parar por aqui" |
| T05 | "Confirmar e continuar" / "Trocar destino" | "Seguir para a hospedagem" / "Quero trocar o destino" |
| T06 título / ação | "Sugestões de hospedagem" / "Aprovar" / "Ajustar" | "Separei 3 lugares para ficar" / "Quero este" / "Pedir outras opções" (o campo de feedback tem o rótulo "O que você quer diferente?") |
| T07 título / ação | "Sugestões de passeios" / "Aprovar seleção" | "Separei estes passeios" / "Seguir com estes passeios" |
| T08 título / ação | "Roteiro final" / "Aprovar roteiro e concluir" | "Montei seu roteiro dia a dia" / "Fechar meu roteiro" |
| Erro de geração (`ErrorRetryState`) | "Não conseguimos gerar sugestões agora — tentar novamente" | "Não consegui montar as sugestões agora." + "Tentar de novo" |
| Orçamento insuficiente | "Não encontramos opções dentro do valor informado…" | "Não achei opções dentro do valor que você me passou. A mais em conta que encontrei passa do orçamento em {diferença}." |
| T-END | "Ver isso depois" | Com conta: "Ver meus roteiros". Sem conta: "Planejar outra viagem" |
| `PriceRangeBadge` | "faixa aproximada" | inalterado ("aprox." no formato curto) |
| Stepper | Destino · Hospedagem · Passeios · Roteiro | inalterado |

**Textos fixos novos** (fonte única, para evitar variação): todos os
textos citados nas §8.2 e §8.4. O texto do consentimento é exatamente
`CONSENTIMENTO_TEXTO` (ADR-012). Mudar esse texto exige mudar
`CONSENTIMENTO_VERSAO`.
