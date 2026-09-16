# ADR-011: Home vitrine estática e conteúdo congelado, sem IA (RN-08)

- Status: Aceito
- Data: 2026-09-16
- Autor: Coordenador (chapéu Software Architect)
- Relação: novo. Complementa o ADR-002 (custo de IA) e o ADR-007 (feriados).

## Contexto

O V2.0 troca T00 por uma home vitrine (RF-12) com hero, os três caminhos,
"como funciona", vitrine, prévia do roteiro de exemplo (RF-14), próximos
feriados (RF-18) e FAQ. As restrições são:

- RN-08/RF-12.7/RF-14.2: zero chamada ao provider de LLM na home e no
  exemplo;
- RNF-12: LCP <= 2,5 s e CLS <= 0,1 em mobile de laboratório;
- RF-18.1: os 3 próximos feriados a partir de "hoje". O conteúdo depende da
  data, mas é determinístico;
- RF-17.1: um link "meus roteiros" na navegação quando há conta. Ler a
  sessão no servidor tornaria a página dinâmica.

## Alternativas consideradas

1. **Home dinâmica** (renderizada a cada requisição, lendo sessão e data).
   Descartada: TTFB maior, sem cache de borda, e o LCP piora exatamente onde
   o RNF-12 é mais exigente.
2. **Roteiro de exemplo gerado sob demanda e guardado em cache**.
   Descartada: continua dependendo do provider na primeira visita e depois
   de cada expiração, o que viola RN-08.
3. **Home estática com revalidação periódica (ISR), feriados calculados na
   renderização, área de conta num componente cliente pequeno e roteiro de
   exemplo como arquivo versionado** (escolhida).

## Decisão

1. **`src/app/page.tsx`** é um Server Component **estático** com
   `export const revalidate = 3600`. Ele **não lê** `cookies()`, `headers()`
   nem `getServerSession`. O cookie anônimo continua sendo emitido pelo
   `middleware.ts`, fora da página, então o cache não é afetado.
2. **Feriados** (RF-18): função pura nova
   `getProximosFeriados(hoje: DataCivil, quantidade = 3)` em
   `src/lib/holidays.ts`. Ela reaproveita
   `getNationalHolidaysWithBridgeInRange(ano, ano + 1)` e o mesmo formatador
   de `feriados.ts`, sem cálculo paralelo (RF-18.2). O filtro é
   `data do feriado >= hoje`. "Hoje" é a data civil em
   `America/Sao_Paulo`, calculada na renderização. Com o ISR de 1 h, a lista
   pode ficar desatualizada por até 1 h depois da meia-noite, o que foi
   aceito.
3. **Área de conta no cabeçalho** (`AccountNav`, componente cliente): chama
   `getSession()` de `next-auth/react` no cliente depois da hidratação, com
   largura reservada (sem CLS). O layout raiz continua estático. Esse mesmo
   componente serve todas as páginas.
4. **Roteiro de exemplo** (RF-14):
   - O conteúdo fica em `src/content/roteiro-exemplo.ts`, tipado com os
     **mesmos tipos** do roteiro real (`RoteiroDayResult`/
     `RoteiroItemResult`) e com metadados de destino (`slug: "gramado"`),
     período e hospedagem e passeios resumidos.
   - Ele é produzido **uma única vez**: o fluxo real roda em ambiente de
     desenvolvimento para Gramado (fim de semana de 3 dias, orçamento médio),
     e um script `scripts/exportar-roteiro-exemplo.ts` lê a `TripSession`
     concluída pelo `sessionId` e gera o arquivo. Depois disso, o conteúdo é
     revisado por uma pessoa (sem preço fora de faixa, sem afirmação
     factual duvidosa, voz de consultor) e congelado por commit. As datas
     aparecem como "Dia 1 (sábado)", sem data de calendário, para o
     conteúdo não envelhecer.
   - A rota `/roteiro-exemplo` é estática (sem `revalidate`), e a home
     mostra uma prévia do Dia 1 a partir do mesmo arquivo.
5. **Fronteira de import verificável** (RN-08): regra
   `no-restricted-imports` do ESLint proíbe `@/lib/gateway-ia*`,
   `@/lib/stage-rules*`, `openai` e `@/lib/prisma` nos arquivos
   `src/app/page.tsx`, `src/app/roteiro-exemplo/**`,
   `src/components/home/**` e `src/content/**`. Um teste de unidade
   renderiza a home com o módulo do Gateway substituído por um mock que
   falha ao ser chamado.

## Consequências

- A home fica cacheável na borda. O custo por visita é zero em IA e zero em
  banco.
- O link "meus roteiros" aparece alguns milissegundos depois da primeira
  pintura, o que foi aceito.
- Trocar o roteiro de exemplo exige rodar o script de novo e fazer commit.
  Não existe caminho de geração em produção.
- Se o dono quiser outro destino no exemplo, basta trocar o arquivo e o
  `slug`. A estrutura não muda.
