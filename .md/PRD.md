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
- **Modelo de monetização** — não implementado nesta release (MVP/Fase 1, os 12
  lotes já `Validado`); não bloqueia o MVP funcional. A direção estratégica foi
  decidida em 2026-09-16 (ver parecer ad hoc em `CTO-REVIEW.md` e decisão do
  usuário nesta rodada) e está registrada como escopo de **V2** na subseção
  "V2 — consultor de roteiros" abaixo — fecha o risco R-04 (Seção 6) apenas quanto à
  direção escolhida; o detalhamento técnico (RF/RNF) fica para um ciclo de
  planejamento dedicado ao V2, não para este MVP.
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

### V2 — consultor de roteiros (fora do MVP e fora da Fase 2 acima; direção registrada em 2026-09-16; **V2.0 aprovado para início em 2026-09-16**, com RF/RNF no `PRD-TECNICO.md`)

Distinta da "Fase 2" acima (que é sobre organização pós-decisão — cronograma,
checklist, gastos). O V2 aqui tratado é sobre monetização/controle de custo de
IA e reposicionamento visual do produto, decidido pelo usuário (dono do
produto) nesta rodada de reabertura pontual, a partir do parecer ad hoc do
chapéu CTO em `CTO-REVIEW.md` (2026-09-16). **Nenhum item desta subseção
invalida os 12 lotes já `Validado` em `TASK.md`.** O V2.0 é um ciclo novo
construído sobre o MVP. Os três itens abaixo são o registro original da
direção. Onde divergirem do "Plano do V2" mais abaixo, **vale o plano**.

- **Trial anônimo com limite de sessões, cadastro obrigatório para continuar**
  (fecha o risco R-04, Seção 6, quanto à direção escolhida — Opção C do
  parecer ad hoc; **ponto de corte refinado em 2026-09-16**: destino grátis
  e sem cadastro, cadastro exigido a partir da hospedagem — ver plano
  consolidado abaixo; **o "limite de sessões" descrito a seguir foi
  substituído por esse corte por etapa** e não é implementado no V2.0): o uso segue 100% anônimo (sem cadastro) até um limite de
  sessões/ciclos de uso da IA ainda não quantificado; ao atingir o limite, o
  sistema passa a exigir cadastro para continuar usando. Justificativa: mantém
  fricção zero na primeira interação, preservando a métrica de sucesso do MVP
  (Seção 3 — taxa de conclusão do fluxo), e cria um ponto de conversão natural
  a partir de uso recorrente demonstrado. Quantidade exata de sessões
  gratuitas, definição precisa do que conta como "sessão" para esse limite, e
  modelo de cobrança associado (freemium/plano pago) ficam para o
  detalhamento técnico do V2 — não decididos nesta rodada.
- **Cadastro básico**: quando exigido (acima), o cadastro deve permanecer o
  mais simples possível, reaproveitando o NextAuth já implementado (e-mail/
  senha ou magic link) — sem campos adicionais além do mínimo necessário para
  autenticação. Não é um requisito novo de infraestrutura (a base já existe
  via ADR-008); é uma diretriz de produto para a experiência de cadastro no
  V2, a ser detalhada como RF/RNF quando o V2 entrar em planejamento técnico.
- **Reformulação visual — "agência de viagem virtual"** (nome original
  do pedido; posicionamento redefinido em 2026-09-16 como **"consultor de
  roteiros de viagem"**, ver plano consolidado abaixo): direção de
  produto/branding a explorar no V2, ainda sem requisito técnico detalhado.
  Intenção declarada pelo usuário: elevar a percepção visual do produto para
  se aproximar da experiência de um consultor de roteiros (não de uma
  agência de viagens), para além do padrão
  visual já implementado no MVP (RNF-03 do `PRD-TECNICO.md`). Sem escopo,
  wireframe ou critério de aceite definidos nesta rodada — fica registrado
  aqui só como direção a não perder, para detalhamento em ciclo futuro
  (chapéu PM/BA, com possível consulta a `UX-SPEC.md` já existente como ponto
  de partida).
- O detalhamento técnico do V2.0 (RF-12 a RF-18, RNF-08 a RNF-13, RN-07 a
  RN-12) está no `PRD-TECNICO.md`.

#### Plano do V2 — "consultor de roteiros de viagem" — APROVADO para início do V2.0 (2026-09-16)

> **Status: V2.0 APROVADO PARA INÍCIO em 2026-09-16** pelo dono do
> produto. O deploy fica para o fim do ciclo. O escopo do V2.0 é o listado
> em "V2.0" abaixo. **O V2.1 e o "Fora do V2" continuam fora deste
> ciclo.** Consolida o levantamento do Gestor (chapéu PM) e o de UX do
> Coordenador (chapéu UX/UI), ambos de 2026-09-16, com as decisões do dono
> registradas em "Decisões do dono do produto", no fim desta subseção.
> Requisitos em `PRD-TECNICO.md` (RF-12 em diante). SDD, ADR, UX-SPEC e
> TASK do V2.0 são a próxima etapa, do Coordenador.

**Posicionamento (decidido).** O produto é um **consultor de roteiros de
viagem**, e **não uma agência de viagens**. A promessa funcional não muda:
o produto **sugere e organiza, não reserva nem vende**. O que muda é a
moldura e a voz: um consultor que fala em primeira pessoa e se declara IA,
uma vitrine antes do fluxo, uma faixa visual do destino e o roteiro final
apresentado como um documento de consultoria. A state machine, as etapas e
os 4 estados do MVP não mudam. É proibido usar vocabulário de reserva ou
venda ("Reservar", "Comprar"), enfraquecer o rótulo de faixa aproximada
(RNF-01) ou sugerir que existe atendimento humano. A home deve dizer
explicitamente que o produto não é uma agência, com uma linha do tipo
"montamos o plano; a reserva você faz onde preferir".

**Funil alvo (corte de cadastro decidido pelo dono).** Visitante frio →
home vitrine (sem custo de IA) → início do fluxo (CTA ou card com o
destino já preenchido) → **escolha do destino, grátis e sem cadastro** →
**ativação = destino aprovado** (primeira etapa aprovada, mesma definição
da métrica primária da Seção 3) → **pedido de cadastro logo depois do
destino aprovado** → hospedagem → passeios → roteiro (as três etapas
exigem cadastro) → retorno via "meus roteiros". Isso substitui a
proposta anterior de cadastro depois do primeiro roteiro. Efeito colateral
positivo: só uma etapa de IA roda sem identidade, o que reduz a exposição
de custo anônimo (R-08).

**Efeito na métrica primária (Seção 3).** A ativação (destino aprovado)
continua mensurável sem cadastro. A taxa de conclusão do **fluxo completo**
passa a depender da conversão do cadastro e deve ser lida em duas partes:
(a) ativação anônima (início do fluxo → destino aprovado) e (b) conclusão
pós-cadastro (cadastro → roteiro concluído). Comparar a conclusão
completa do V2 com a do MVP sem essa separação é inválido, porque o
cadastro passa a ficar no meio do fluxo.

**Reconciliação dos levantamentos.**
- *Tamanho do catálogo (8–12 no PM vs. 30–50 no UX).* São dois usos
  diferentes. Na home, **8 cards** (dentro dos 6–8 do UX e do mínimo do
  PM). O catálogo também ilustra o resultado da IA em T04, por isso
  precisa ser maior que a vitrine. Recomendação do PM: **~24 destinos no
  V2.0**, com expansão para 30–50 no V2.1 condicionada à taxa de acerto do
  catálogo em T04. O fallback visual por gradiente + inicial cobre o
  restante sem risco de foto errada. **Critério decidido pelo dono:
  destinos mais visitados de 2025. Pendente: lista final**, que o
  Coordenador vai apresentar ao dono (sugestão do PM: priorizar, dentro
  desse critério, os destinos que a IA mais sugere segundo o
  `LlmGenerationLog`). **A curadoria das fotos é do próprio dono**, com
  prazo definido só quando o V2 começar.
- *Busca automática de fotos no Pexels/Unsplash (camada 2 do UX).*
  **Adiada para o V2.1**, e só entra se a taxa de acerto do catálogo ficar
  baixa: a busca automática é a principal fonte de descasamento entre
  imagem e sugestão (quebra de confiança). No V2.0, a imagem vem do
  catálogo (camada 1) ou do fallback de gradiente (camada 3).
- *Nova moldura das etapas vs. "não redesenhar o wizard" (PM).* A troca de
  copy e a imagem em T04 entram no V2.0: são baixo risco e quitam uma
  dívida já prometida no UX-SPEC §2 T04. A faixa visual em todas as etapas
  e o roteiro como documento de consultoria vão para o V2.1, depois do
  baseline, para não confundir o efeito da home com o do fluxo na
  métrica (confirmado pelo dono, item 7).
- *Voz do consultor em primeira pessoa* (o UX propôs "concierge"). Aceita,
  desde que a IA se declare como tal (mitiga R-05).
- *`/encerramento`.* A rota existe e foi validada (L12-T05). Não é vazamento
  de funil. O comentário desatualizado em
  `src/components/encerramento/encerramento-screen.tsx` é só débito de
  documentação.

**Pré-requisitos do V2.0** (em vigor a partir da aprovação de 2026-09-16).
1. `next/image` no `SuggestionCard`, com imagem maior (16:9 no mobile,
   4:3 lateral no desktop). `images.remotePatterns` só será necessário se
   a camada 2 entrar (V2.1), porque o catálogo é servido pelo próprio
   domínio.
2. Catálogo com os 23 destinos definidos em "Catálogo do V2.0", abaixo,
   e fotos curadas pelo dono, **só de fontes gratuitas (Unsplash/Pexels) neste primeiro
   momento**, com licença e autor registrados para cada imagem. Nunca
   imagem gerada por IA para lugar real, nunca legenda "foto do local".
3. Revisão do UX-SPEC §3/§6 e ADR de estratégia de imagens (Coordenador),
   na etapa de planejamento técnico do V2.0, que é a próxima.

**Catálogo do V2.0 — decidido pelo PM (2026-09-16, a pedido do dono)**

Critério: destinos nacionais mais visitados de 2025. Não há ranking
oficial de visitas; a fonte usada são os rankings da Decolar de buscas por
hospedagem (2º semestre de 2025 e verão 2025/26), mais uma pesquisa de
interesse de 2025 (Mercado & Eventos) para Noronha e Lençóis.

*Vitrine da home (8)* — os mais bem colocados nas duas listas da Decolar,
com uma troca deliberada:
Rio de Janeiro (RJ), Porto de Galinhas (PE), Gramado (RS), Maceió (AL),
Porto Seguro (BA), Florianópolis (SC), Foz do Iguaçu (PR) e Campos do
Jordão (SP).
- Campos do Jordão entra no lugar de Natal: com Natal seriam 6 praias em
  8 cards, e a home precisa ter o que mostrar para quem viaja em
  junho–agosto, época forte da seção de feriados. Natal fica no catálogo.

*Restante do catálogo (15)*:
Natal (RN), Fortaleza (CE), Maragogi (AL), Salvador (BA), João Pessoa
(PB), Imbassaí (BA), Búzios (RJ), Ilhéus (BA), Aracaju (SE), Praia do
Forte (BA), Caldas Novas (GO), Olímpia (SP), Poços de Caldas (MG),
Fernando de Noronha (PE) e Lençóis Maranhenses (MA).

*Fora*:
- **São Paulo (SP):** aparece alto nas buscas, mas em boa parte por viagem
  de trabalho, e é a principal cidade de origem do público. O produto
  planeja viagens de lazer curtas; sugerir a própria cidade de quem busca
  não ajuda. O fallback de gradiente cobre o caso se a IA sugerir.
- **Destinos da página de design** (Bonito, Jericoacoara, Ouro Preto,
  Chapada dos Veadeiros): não aparecem nos rankings de 2025. Entram só se
  o V2.1 ampliar o catálogo por taxa de acerto.

Total: 23 destinos. O "~24" era estimativa; não completo a conta com um
destino fora do critério. A validação da P-05 (cruzar com
`LlmGenerationLog`) só é possível quando houver uso real registrado com o
V2.0 rodando; se a IA sugerir com frequência algo fora da lista, a troca
é feita nesse momento.

**Pré-requisitos de "colocar no ar de verdade e divulgar" (não do V2.0).**
Decisão do dono: enquanto o produto for protótipo, nenhum dos três itens
abaixo é tratado.
1. Teto diário (global) de custo de IA, além do rate limit por sessão/IP,
   conforme o parecer ad hoc de `CTO-REVIEW.md` (2026-09-16). No
   protótipo, é aceito que o app pare se o saldo da API acabar. O desenho
   técnico (ADR do Coordenador) fica para esse momento.
2. Medição de uso (RUM, `@vercel/analytics`), pendente em `DEPLOY.md` §5.
3. Política de privacidade completa (e, se preciso, termos de uso). No
   V2.0 vale só o checkbox de consentimento no cadastro (RNF-13, decisão
   do dono de 2026-09-16).

**V2.0 — mínimo que entrega a percepção de "consultor de roteiros"**
- Dentro:
  - Home na ordem proposta pelo UX: hero com foto e dois CTAs ("Montar
    minha viagem" / "Ver roteiro de exemplo"), 3 caminhos de entrada com
    peso igual, "como funciona" em 4 passos, vitrine de 8 destinos com o
    destino já preenchido no fluxo, roteiro de exemplo **estático, gerado
    uma vez** (sem custo por visita), próximos feriados prolongados
    (determinístico, entra em T02) e FAQ com a nota de faixa aproximada.
  - Barra de CTA fixa no mobile.
  - Catálogo de 23 destinos (8 na home) e imagem em T04
    (camadas 1 e 3).
  - Revisão de copy para a voz de consultor de roteiros.
  - Tokens visuais novos do UX (#101A2B, terracota #E07A5F só como acento
    de feriado, #1F1F23), mantendo o dark-first e o dourado #D4AF6A.
  - **Decidido pelo dono:** pedido de cadastro logo depois do destino
    aprovado (hospedagem, passeios e roteiro exigem cadastro) e tela
    simples "meus roteiros".
- Fora: todo o conteúdo do V2.1 e do "Fora do V2", abaixo.

**V2.1 — incremento condicionado ao baseline de 4 semanas do V2.0**
- Faixa visual do destino em todas as etapas; roteiro final (T08/T-END)
  como documento de consultoria.
- Catálogo ampliado para 30–50 destinos; camada 2 (Pexels/Unsplash no
  servidor, com cache no banco) só se a taxa de acerto do catálogo em T04
  justificar.

**Fora do V2 (qualquer fase)**
- Páginas de detalhe por destino e conteúdo editorial longo/SEO.
- Sugestões geradas por IA na home: seria custo por visitante anônimo sem
  teto.
- Busca e filtro na vitrine.
- Depoimentos e selos sem usuários reais.
- Pagamento e planos.
- Reserva/booking (o produto não é agência de viagens).
- Autoplay, parallax e vídeo.
- Qualquer mudança na state machine.

**Métricas do V2 — INTENÇÃO, não medição no protótipo.** Sem RUM (decisão
do dono), as métricas de comportamento na home e na navegação (clique no
CTA/card, origem de entrada) **não são medidas no protótipo**. Ficam
registradas como intenção para quando o produto for colocado no ar de
verdade. Contagens que já saem do banco (destinos aprovados, cadastros,
roteiros concluídos, `LlmGenerationLog`) continuam disponíveis como
leitura manual, sem compromisso de meta. (Todas as metas numéricas só
depois de 4 semanas de baseline, contadas a partir do RUM ativo, mesmo racional da P-01. A meta de partida de >= 20% proposta
antes para o cadastro pós-primeiro roteiro foi **retirada**: com o corte
movido para logo depois do destino, o usuário vê menos valor antes do
pedido de cadastro, e o número não tem base de comparação)
- Taxa de clique da home para o fluxo, por CTA e por card.
- Taxa de ativação anônima (destino aprovado ÷ fluxos iniciados), sem
  dependência do cadastro.
- **Taxa de cadastro pós-destino aprovado** (cadastros ÷ destinos
  aprovados), sem meta até ter baseline.
- Taxa de conclusão pós-cadastro (roteiro concluído ÷ cadastros), lida
  separada da ativação.
- As taxas acima **segmentadas por origem de entrada** (card da vitrine,
  CTA genérico, data livre, feriado, quiz). Sem essa segmentação, a
  mudança no mix de tráfego distorce a métrica primária da Seção 3.
- Retorno de usuários cadastrados em 7 e 30 dias.
- Custo de IA por ativação e por cadastro (`LlmGenerationLog`).
- Taxa de acerto do catálogo em T04 (destinos sugeridos com foto curada).

**Premissas e riscos do V2:** promovidos para a Seção 6 oficial com a
aprovação do V2.0 (P-03 a P-05, R-05 a R-11).

**Decisões do dono do produto (2026-09-16)**
1. **Decidido:** tom de "consultor de roteiros de viagem", não agência.
2. **Decidido:** a escolha do destino é grátis e sem cadastro; hospedagem,
   passeios e roteiro exigem cadastro.
3. **Decidido:** critério do catálogo = destinos mais visitados de 2025;
   curadoria das fotos pelo próprio dono, com prazo definido quando o V2
   começar. **Decidido pelo PM, a pedido do dono:** 23 destinos, 8 na
   home, São Paulo fora (ver "Catálogo do V2.0").
4. **Decidido:** RUM não é tratado no protótipo. Passa a ser pré-requisito
   de colocar no ar de verdade e divulgar, junto com o teto de custo.
5. **Decidido:** o teto diário de custo de IA não é pré-requisito do V2
   (protótipo; parar por saldo esgotado é aceito), e sim de colocar no ar
   de verdade e divulgar. O valor do teto fica para esse momento.
6. **Decidido:** cadastro e "meus roteiros" entram no V2.0.
7. **Decidido:** a camada 2 de imagens (busca automática para destino
   fora do catálogo) e o roteiro como documento de consultoria ficam no
   V2.1.
8. **Decidido:** fotos só de fontes gratuitas (Unsplash/Pexels) neste
   primeiro momento, com licença e autor registrados por imagem.
9. **Decidido (substitui a decisão anterior de manter em backlog):** o
   V2.0 foi aprovado para início em 2026-09-16, com o deploy no fim do
   ciclo. Requisitos no `PRD-TECNICO.md`; SDD/ADR/UX-SPEC/TASK são do
   Coordenador, na etapa seguinte.

### Adição pontual (2026-09-18) — Checklist de bagagem e documentos por destino e época — RASCUNHO da rodada 2, aguardando aprovação final do dono

> **Status: RASCUNHO da rodada 2, aguardando aprovação final do dono.**
> Decisões do dono e do Gestor de 2026-09-18 incorporadas (fim da Seção 7).
> Origem: item #5 das 8 funcionalidades recomendadas
> pelo PM em 2026-09-18, escolhido pelo dono. Gate 1 desta demanda:
> **Aprovado com ressalvas** (`CTO-REVIEW.md`, 2026-09-18; ressalvas 1 e 3
> fechadas na rodada 2). É uma
> **atualização** do plano do V2, não reescrita: nada acima muda. Requisitos
> em `PRD-TECNICO.md` (RF-19 a RF-21, RNF-14 a RNF-16, RN-13 a RN-16).
> SDD/UX-SPEC/TASK são do Coordenador, só depois da aprovação do dono.

**Problema e valor.** Depois de aprovar o roteiro, o usuário não tem motivo
para reabrir o app, e "o que levar" é a dúvida seguinte de quase toda
viagem (clima da época, duração, documentos). Hoje ele resolve isso fora do
produto (notas, WhatsApp). Um checklist marcável dentro de "Meus roteiros"
dá um motivo concreto de retorno e prolonga o valor do roteiro concluído,
sem custo de IA e sem tocar a vitrine, a reserva ou o fluxo em etapas.

**Público.** O mesmo do V2: usuário autenticado que **concluiu** um roteiro
(sessão encerrada parcialmente não recebe checklist, decisão 1).

**Objetivo de sucesso (mensurável, leitura manual do banco no protótipo).**
Percentual de roteiros concluídos que tiveram **pelo menos 1 item do
checklist marcado em até 7 dias** após a conclusão. Baseline: não existe.
Meta: **sem meta até haver baseline** (mesmo racional de P-01/"Métricas do
V2"); hipótese de partida a validar, não compromisso: >= 30%. Métrica de
apoio: dos usuários que marcaram algum item, quantos reabrem o roteiro em
outro dia (retorno). Ambas saem de contagens já persistidas (RF-20), sem
RUM.

**Dentro do escopo (esta adição).**
- Checklist **gerado por regra determinística e conteúdo curado** (sem IA)
  a partir de: perfil de clima do destino, mês da viagem, duração em dias e
  tipo de viagem/experiência. Justificativa: custo zero de IA (sem teto de
  gasto ainda), sem alucinação, mesmo estilo de ADR-007/ADR-010.
- Seis categorias de itens (decisão 2): documentos e dinheiro; roupas e
  calçados; higiene e cuidados; eletrônicos e carregadores; itens do
  clima e do tipo de viagem (ex.: protetor solar, capa de chuva, agasalho);
  antes de sair de casa.
- Itens **marcáveis e persistidos por usuário/roteiro**, exibidos **só na
  tela de leitura do roteiro concluído** em `/meus-roteiros/[sessionId]`
  (decisão 1).
- Documentos por destino cobrem **viagem nacional** (RG ou CNH, CPF,
  cartão do plano de saúde se houver etc.). Justificativa: o catálogo é
  100% Brasil (decisão 4).
- Destino fora do catálogo ou sem dados suficientes: lista universal
  (RF-21), sem afirmar clima nem regra de entrada.
- Dois itens condicionais estáticos, iguais para todos, sem o app
  perguntar nem inferir nada (decisão 5).
- **Impressão pelo navegador** com CSS de impressão simples (decisão 6).

**Fora do escopo (esta adição), cada corte com justificativa.**
- **Item próprio digitado pelo usuário** — fora (decisão 3, final para
  esta entrega): texto livre amplia a superfície de dado pessoal (LGPD) e
  de moderação/UX; só entra numa rodada futura, se houver uso que
  justifique.
- **Chamada de IA** para gerar ou refinar a lista — fora: sem teto de custo
  (pré-requisito de "colocar no ar de verdade", decisão 5). Reabrir só com
  justificativa e limite por roteiro.
- **Checklist em qualquer etapa do fluxo** (T01 a T08) — fora: evita mexer
  na state machine e no wizard (proibido pelo PRD).
- **Regras de entrada, visto, passaporte, vacina, alfândega, previsão do
  tempo em tempo real** — fora: dependem de fonte externa e de dado que muda
  (R-01); o produto só diz "clima típico da época" e manda conferir.
- **Upload/foto/número de documento, dados de voo e hospedagem** — fora:
  são a parte "Dados de voo/hospedagem e documentos" da Fase 2, mais
  sensível; aqui "documentos" é só "lembrete do que levar".
- **Botão de exportar/PDF e compartilhar** — fora: compartilhamento é
  Fase 2; a impressão do navegador basta (decisão 6).
- **Lembretes por e-mail/push** — fora, decisão final do dono (decisão 7);
  o e-mail da conta também não é usado para marketing (RNF-13).
- **Marcar itens sem conta** — fora: o recurso vive em "Meus roteiros",
  que exige conta (RF-17.7).

**Conflitos checados e como o desenho evita.**
- *"Fora do V2 (qualquer fase)":* nenhum item da lista é tocado. Não é
  página de detalhe/SEO (é privado, autenticado); não é IA na home; não é
  busca/filtro da vitrine; não é pagamento; não é reserva (o texto do
  checklist segue RN-07: nada de "reservar/comprar"); nada de autoplay; e
  **não muda a state machine** (é painel de leitura pós-conclusão, sem novo
  estado nem transição; a marcação grava em tabela própria, não em
  `TripSession`).
- *Fase 2 (Seção 4, "Dentro do escopo — Fase 2"):* "Checklist de bagagem"
  e "documentos da viagem" estão listados lá para uma release posterior.
  Esta adição **antecipa apenas uma fatia mínima** (lembrete de itens, sem
  dados de documento). **Aprovado explicitamente pelo dono em 2026-09-18**
  (decisão 8).
- *INT-15 (meus roteiros sem editar):* a marcação é a primeira escrita do
  usuário em "Meus roteiros" além de navegar. É exceção declarada, restrita
  aos itens do checklist; RF-17.5 (roteiro em modo leitura) segue valendo
  para o conteúdo do roteiro.

**Decisões:** todas as perguntas da rodada 1 foram respondidas; ver
Seção 7, "Decisões do dono e do Gestor — 2026-09-18". Resta só a aprovação
final do dono sobre o rascunho da rodada 2.

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
| R13 (V2.0, não deste MVP nem da Fase 2) | Home vitrine, catálogo de 23 destinos com imagem em T04, destino grátis e anônimo com cadastro básico exigido a partir da hospedagem, "meus roteiros", reformulação visual e voz de "consultor de roteiros de viagem" (ex-"agência de viagem virtual") | Must-have do ciclo V2.0 (aprovado para início em 2026-09-16) | Ver Seção 4, "Plano do V2"; RF-12 a RF-18 e RNF-08 a RNF-13 no `PRD-TECNICO.md`. V2.1 segue fora deste ciclo |
| R14 (adição 2026-09-18, RASCUNHO da rodada 2) | Checklist de bagagem e documentos por destino e época, determinístico, marcável e persistido, só em "Meus roteiros" (roteiro concluído) | Should-have, escolhido pelo dono; aguarda aprovação final do rascunho | Dá motivo de retorno ao app, esforço P, custo de IA zero. Antecipa fatia mínima da Fase 2 (R12); ver Seção 4, "Adição pontual". RF-19 a RF-21 no `PRD-TECNICO.md` |

## 6. Premissas e Riscos de Produto

| ID | Tipo | Descrição | Dono | Prazo de validação |
|---|---|---|---|---|
| P-01 | Premissa | A meta de 60% de conclusão de fluxo (Seção 3) é um número de partida razoável para um MVP sem baseline histórico | Gestor (chapéu PM) | Revisar após as primeiras 4 semanas de uso real pós-lançamento do MVP |
| P-02 | Premissa | Faixas de preço geradas por conhecimento geral da IA (sem API de preço real) são suficientemente úteis para o usuário decidir, sem gerar expectativa de exatidão | Gestor (chapéu PM), a confirmar com chapéu BA | Antes de aprovar o PRD-TECNICO.md — precisa virar um requisito não-funcional explícito de como comunicar "faixa aproximada" na UI |
| R-01 | Risco | Sugestões geradas por LLM podem "alucinar" preços ou informações desatualizadas (ex.: preço de ingresso de atração, regras de entrada em outro país) | Coordenador (arquitetura de prompt/fallback) + Gestor (ressalva já registrada no Gate 1) | Antes do SDD.md ser aprovado pelo usuário — tratar como decisão de arquitetura de primeira classe |
| R-02 | Risco | O produto compete por atenção/capacidade de execução do fundador com outros três projetos em paralelo (Metas Financeiras, Leitura Bíblica, site institucional) | Gestor (chapéu CTO, ad hoc) | Quando o TASK.md existir, se o usuário solicitar parecer de capacidade |
| R-03 | Risco | Conjunto básico do quiz guiado (R3) pode não cobrir casos reais de uso suficientes, gerando abandono nesse caminho específico | Gestor (chapéu PM/BA) | Após os primeiros testes de uso reais, conforme já sinalizado no briefing como decisão adiada de propósito |
| R-04 | Risco | Modelo de monetização não definido pode afetar decisões de arquitetura (ex.: limite de chamadas de IA por usuário gratuito) | Gestor (chapéu CTO, ad hoc) | **Direção resolvida em 2026-09-16**: trial anônimo com limite de sessões + cadastro obrigatório básico para continuar (Opção C do parecer ad hoc, `CTO-REVIEW.md`), registrado como escopo V2 na Seção 4. Detalhamento técnico (quantidade de sessões, RF/RNF, modelo de cobrança) permanece em aberto para ciclo de planejamento dedicado ao V2 — não bloqueia nem altera o MVP já `Validado`. **Atualização 2026-09-16:** o corte foi refinado para "destino grátis e anônimo, cadastro a partir da hospedagem" e entrou no V2.0 (RF-16/RF-17 do `PRD-TECNICO.md`); o modelo de cobrança continua fora |
| P-03 | Premissa | A home vitrine aumenta a quantidade absoluta de ativações e não reduz a conclusão dos que iniciam o fluxo | Gestor (PM) | Comparar 4 semanas de uso real, contadas a partir do RUM ativo (pré-requisito de colocar no ar de verdade), com o baseline |
| P-04 | Premissa | Ver o destino aprovado (com foto) é valor suficiente para o usuário aceitar se cadastrar antes de hospedagem/passeios/roteiro, sem abandono massivo nesse ponto | Gestor (PM) | Taxa de cadastro pós-destino aprovado nas 4 primeiras semanas com RUM; meta só depois do baseline. No protótipo, leitura manual de contagens do banco |
| P-05 | Premissa | Um catálogo formado pelos destinos mais visitados de 2025 cobre a maior parte das sugestões da IA em T04 | Gestor (PM/BA) + dono (curadoria das fotos) | Conferir a taxa de acerto do catálogo (`LlmGenerationLog`/aprovações) depois das primeiras sessões reais do V2.0 |
| R-05 | Risco | O reposicionamento cria expectativa de reserva ou de atendimento humano | Gestor (PM) | Revisão de copy (RNF-11) antes do deploy; pergunta direta a testadores |
| R-06 | Risco | Licenciamento indevido de imagem de terceiros | Gestor (PM) + dono (curadoria) | Só Unsplash/Pexels, com licença e autor registrados por imagem (RF-15.5) antes do deploy |
| R-07 | Risco | O protótipo V2 roda sem RUM (aceito pelo dono): o efeito da home e do novo corte de cadastro não é medido, e decisões de ajuste no protótipo são qualitativas | Gestor (PM) + Coordenador/Executor | `@vercel/analytics` ativo antes de colocar no ar de verdade e divulgar; P-03/P-04 só são validadas a partir daí |
| R-08 | Risco | Tráfego anônimo eleva o custo de IA sem teto. Atenuado: só a etapa de destino roda sem cadastro (RN-09). Aceito no protótipo: se o saldo da API acabar, o app para | Gestor (CTO, ad hoc) + Coordenador | Teto diário implementado antes de colocar no ar de verdade e divulgar |
| R-09 | Risco | Diluição de foco: vitrine bonita, fluxo pouco usado | Gestor (PM) | Taxa de clique da home para o fluxo vs. baseline (com RUM) |
| R-10 | Risco | Imagem que não corresponde ao destino sugerido | Coordenador | Só catálogo + fallback de gradiente no V2.0 (RN-10); camada 2 só no V2.1, se aprovada |
| R-11 | Risco | O pedido de cadastro no meio do fluxo derruba a conclusão completa em relação ao MVP e isso é lido como regressão | Gestor (PM) | Ler a ativação anônima e a conclusão pós-cadastro separadas (Seção 4, "Efeito na métrica primária") |
| R-12 | Risco | A sessão anônima se perde no cadastro e o usuário perde o destino que acabou de aprovar, no pior momento do funil | Coordenador (decisão técnica, toca ADR-008) + Validador | Critério de aceite RF-16.4 coberto por teste antes do deploy |
| P-06 | Premissa (2026-09-18) | Um checklist marcável dentro de "Meus roteiros" leva a pelo menos parte dos usuários a voltar ao app depois de concluir o roteiro | Gestor (PM) | Contagem de roteiros com >= 1 item marcado em 7 dias, leitura manual do banco; meta só depois do baseline |
| P-07 | Premissa (2026-09-18) | Um mapa curado por perfil de clima x faixa de mês x duração x tipo de viagem cobre os 23 destinos com precisão suficiente, sem previsão do tempo em tempo real | Gestor (PM redige; chapéu CTO/Gestor aprova) | Antes do deploy: aprovação do conteúdo curado dos 23 destinos pelo Gestor, com os critérios objetivos da decisão 9 (tarefa do lote) |
| R-13 | Risco (2026-09-18) | Item persistido por usuário/roteiro é dado pessoal (LGPD); texto livre ou item que revele saúde/menores amplia o risco | Gestor (CTO) + Coordenador | Desenho grava só `itemKey` + marcado + data; sem texto livre; sem item que infira condição de saúde; exclusão em cascata (RNF-14). Validador confere antes do deploy |
| R-14 | Risco (2026-09-18) | Lista errada por época/destino (ex.: sem agasalho na serra em julho) passa imagem de erro do consultor | Gestor (PM redige, Gestor aprova) | Rótulo "clima típico da época, confira a previsão perto da viagem" (RN-14) e aprovação do conteúdo pelo Gestor, pelos critérios da decisão 9, antes do deploy |
| R-15 | Risco (2026-09-18) | Escopo que cresce para Fase 2 (item próprio, compartilhar, lembrete, dados de documento) | Gestor (PM) | Cortes explícitos na Seção 4, "Adição pontual"; qualquer item novo exige nova rodada |

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

### Decisões do dono e do Gestor — Checklist de bagagem e documentos — 2026-09-18

Todas as perguntas da rodada 1 foram respondidas. Não há pergunta em aberto
sobre esta adição. Resta a aprovação final do rascunho da rodada 2 pelo dono.

1. **Onde aparece (dono):** só em roteiros **concluídos**, em
   `/meus-roteiros/[sessionId]`. Nem sessão encerrada parcialmente nem
   antes de concluir.
2. **Categorias (Gestor, delegado):** seis, fixas: (a) documentos e
   dinheiro; (b) roupas e calçados; (c) higiene e cuidados; (d)
   eletrônicos e carregadores; (e) itens do clima e do tipo de viagem; (f)
   antes de sair de casa. Crianças e pet **não** viram categoria: entram
   como itens condicionais (decisão 5).
3. **Item próprio (Gestor, delegado):** **não** nesta entrega. Decisão
   final; reabrir só em rodada futura, com evidência de uso.
4. **Documentos e destino fora do catálogo (Gestor, delegado):** para
   destino do catálogo (100% Brasil), documentos nacionais comuns (RG ou
   CNH, CPF, cartão do plano de saúde se houver, confirmações que o
   usuário já tiver). Para destino fora do catálogo, com o exterior
   incluso, só a **lista universal** e a nota "confira as regras de entrada
   em fonte oficial". O produto **nunca** afirma passaporte, visto ou
   vacina, com ou sem catálogo.
5. **Itens condicionais (Gestor, delegado):** exatamente dois itens
   estáticos, exibidos a todos, sem pergunta nem inferência: "Documento ou
   autorização do menor, se viajar com criança ou adolescente" (em
   documentos) e "O que o seu animal de estimação precisa, se ele for
   junto" (em antes de sair). Redação neutra, sem citar vacina nem
   condição de saúde.
6. **Impressão (dono):** a impressão do navegador basta. Requisito mínimo
   de CSS de impressão (RNF-16). Sem botão de exportar/PDF.
7. **Lembrete por e-mail/push (dono):** fora, decisão final.
8. **Fatia mínima da Fase 2 (dono):** aprovada explicitamente em
   2026-09-18. Fecha a ressalva 1 do Gate 1.
9. **Conteúdo curado (dono delegou ao Gestor):** o PM redige e o Gestor
   aprova, sem revisão do dono antes do deploy. A aprovação é tarefa do
   lote e acontece quando o conteúdo existir. Critérios objetivos:
   (i) nenhuma afirmação de regra de entrada, visto, passaporte ou vacina;
   (ii) clima sempre "típico da época", nunca previsão;
   (iii) itens coerentes com o clima e a época de cada um dos 23 destinos
   (ex.: sem agasalho pesado em praia tropical no verão; com agasalho na
   serra fria em julho);
   (iv) nenhum item que infira condição de saúde ou menores, além dos dois
   condicionais estáticos da decisão 5;
   (v) sem vocabulário de reserva/venda (RN-07), voz de consultor
   (RNF-11);
   (vi) todo `itemKey` estável e único.
10. **Métrica (dono):** roteiros concluídos com pelo menos 1 item marcado
    em até 7 dias, lida do banco, sem meta até haver baseline.
