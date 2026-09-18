# ADR-013: Checklist de bagagem e documentos — conteúdo curado em módulo puro e marcação persistida por `itemKey`

- Status: Aceito
- Data: 2026-09-18
- Autor: Coordenador (chapéu Software Architect)
- Relação: novo; não substitui nenhum ADR. Segue o mesmo estilo de ADR-007
  (regra determinística, zero LLM) e ADR-010 (conteúdo curado versionado no
  repositório). Reusa ADR-008/ADR-009 (guard de dono) e ADR-006 (state
  machine **inalterada**).

## Contexto

Adição pontual aprovada em 2026-09-18 (`PRD.md`, "Adição pontual"; `PRD-TECNICO.md`
RF-19 a RF-21, RNF-14 a RNF-16, RN-13 a RN-16, INT-17 a INT-20). Um painel de
leitura em `/meus-roteiros/[sessionId]`, só para roteiro **concluído**, com
checklist gerado por regra a partir de destino x mês x duração x tipo, com
marcação persistida por usuário. Zero chamada de IA. Sem texto livre nem
número de documento gravado (RNF-14/RN-16). Exclusão em cascata com a
sessão/conta (RNF-06).

Fatos do código que condicionam a decisão:

- `TripSession` **não** tem FK para `User`. `account-deletion.ts` apaga as
  sessões com `tripSession.deleteMany`, e as filhas saem por
  `onDelete: Cascade` na FK `session_id`. Uma tabela filha com essa FK entra
  no cascade sem mudar `account-deletion.ts`.
- As respostas do quiz (RF-03.1 item 3, "tipo de experiência") **não são
  persistidas** em nenhuma coluna (`schema.prisma` só tem `entryPath`).
  Portanto o tipo de viagem não está disponível na leitura da sessão.
- O destino aprovado fica em `DestinationApproval.name` (texto livre, pode não
  ser do catálogo). `dateRangeStart` é nullable; `dateRangeEnd`, não.
- `normalizarNomeDestino` (`catalogo/resolver-imagem.ts`) já implementa a
  correspondência exata de RF-15.4.

## Decisões

### 1. Onde vive o conteúdo e como é tipado

Módulo **puro** `src/lib/checklist/` (sem `"use client"`/`"use server"`, sem
Prisma, sem Gateway de IA, sem `next/*`; fronteira garantida por
`no-restricted-imports`, como a home no ADR-011):

- `tipos.ts`: `CategoriaChecklist` (união fechada das 6 categorias, com a
  ordem de exibição), `PerfilClima` (união fechada), `TipoViagem`,
  `Estacao`, `FaixaDuracao`, `ItemChecklist`, `ChecklistGerado`.
- `calendario.ts`: mês -> estação (hemisfério sul), faixa de duração, meses
  cobertos pelo período, validação do formato de `itemKey`.
- `regra.ts`: `gerarChecklist(entrada)`, função pura e determinística.
- `conteudo/universal.ts`, `conteudo/perfis-*.ts`, `conteudo/destinos.ts`:
  só dados (arrays/objetos), redigidos pelo PM e aprovados pelo Gestor.

O conteúdo **não** vai para o banco nem para CMS (mesmo racional do ADR-010:
muda raramente, a trilha de auditoria é o commit, e o risco R-14 pede
revisão antes do deploy).

### 2. Modelo de conteúdo: itens condicionados por regra, não matriz 23 x 12 x 3

Multiplicar destino x mês x duração x tipo à mão daria milhares de células e
nenhuma verificabilidade. O conteúdo é organizado em **itens com condição**:

```ts
type ItemChecklist = {
  itemKey: string;          // estável, único, ver decisão 3
  categoria: CategoriaChecklist;
  texto: string;            // voz de consultor, sem termos proibidos
  quando?: {                // ausente = sempre (lista universal)
    perfis?: PerfilClima[];
    tipos?: TipoViagem[];
    estacoes?: Estacao[];
    chuvoso?: boolean;      // true = só em mês chuvoso do destino
    duracoes?: FaixaDuracao[];
  };
};
```

Cada destino do catálogo tem uma entrada em `conteudo/destinos.ts`,
tipada como `Record<SlugDestino, PerfilDoDestino>` (o `SlugDestino` é
derivado de `CATALOGO_DESTINOS`), com `perfil: PerfilClima`, `tipo:
TipoViagem` e `mesesChuvosos: number[]`. Um slug novo no catálogo sem entrada
aqui **quebra a compilação** (`satisfies`) e o teste de cobertura.

`PerfilClima` inicial (o PM pode refinar os nomes na tarefa de conteúdo, mas
o conjunto continua uma união fechada e cada valor precisa ter itens):
`praia-tropical`, `praia-subtropical`, `serra-fria`, `interior-termal`,
`natureza-aventura`, `cidade-litoral`.

### 3. Forma da `itemKey`

`<categoria>.<slug-kebab-do-item>`, minúsculas, sem acento, regex
`^[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$`, no máximo 64 caracteres. Exemplos:
`documentos.rg-ou-cnh`, `clima.agasalho-pesado`, `antes.pet`.

- É **código**, nunca o texto exibido; reescrever o texto não muda a chave.
- É **independente da duração e do mês**: "camisetas" tem uma chave só; a
  faixa de duração ajusta o texto/quantidade, não a chave. O item de
  "kit de lavagem" (faixa longa) tem chave própria.
- Única em todo o conjunto de conteúdo (teste de unicidade). Renomear ou
  reaproveitar uma chave para outro item é proibido; para trocar o sentido de
  um item cria-se chave nova (a antiga é ignorada por RF-20.4).

### 4. Regra determinística de mês, faixa climática e duração

- Meses do período: todos os meses do calendário entre `dateRangeStart` e
  `dateRangeEnd` (datas `@db.Date` lidas como `AAAA-MM-DD`, sem fuso), no
  máximo 12 distintos. Um item com condição sazonal entra se **algum** mês do
  período satisfaz a condição (regra de "união": na dúvida, inclui — nunca
  esconde agasalho de quem viaja na virada de estação).
- Estação (hemisfério sul, fixa, sem cálculo astronômico): verão dez-fev,
  outono mar-mai, inverno jun-ago, primavera set-nov.
- `chuvoso`: mês em `mesesChuvosos` do destino.
- Faixa de duração: dias inclusivos `fim - inicio + 1`; `curta` <= 3, `media`
  4 a 7, `longa` >= 8.
- **Tipo de viagem**: como o quiz não é persistido, o tipo vem do
  `tipo` do destino em `conteudo/destinos.ts` (RF-19.2 já prevê "senão, o
  perfil do destino no catálogo"). Persistir o quiz para personalizar seria
  mudança de schema fora do escopo; fica registrado como evolução.
- Sem `dateRangeStart` (RF-21.2): itens com `quando.estacoes/chuvoso/duracoes`
  são omitidos; aviso "sem as datas não consigo ajustar a lista à época".
- Destino fora do catálogo ou sem `DestinationApproval` (RF-21.1/21.3):
  só itens **sem** `quando.perfis/tipos` (lista universal) + nota "confira as
  regras de entrada do destino em fonte oficial"; nenhuma afirmação de clima.
  A lista universal não importa `CATALOGO_DESTINOS` (RF-21.4).
- Ordenação estável: categoria (ordem fixa) e depois ordem de declaração no
  conteúdo. Mesma entrada -> mesma saída (RF-19.8).

### 5. Persistência da marcação

Tabela filha `TripChecklistMark` (`trip_checklist_marks`), migration
aditiva:

```prisma
model TripChecklistMark {
  id        String   @id @default(uuid())
  sessionId String   @map("session_id")
  itemKey   String   @map("item_key")   // só código, <= 64 chars
  checked   Boolean
  updatedAt DateTime @updatedAt @map("updated_at")
  session   TripSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@unique([sessionId, itemKey])
  @@map("trip_checklist_marks")
}
// TripSession ganha apenas o campo de relação: checklistMarks TripChecklistMark[]
```

- Nenhuma coluna de texto livre, nem `userId` (o dono é o da sessão; evita
  segunda fonte de verdade de posse). A data/hora é `updatedAt`.
- **Escrita idempotente**: `marcarItemChecklist(sessionId, itemKey,
  marcado: boolean)` recebe o **estado desejado**, não "alternar", e faz
  `upsert` em `(sessionId, itemKey)`. Repetir a mesma chamada não muda nada
  (protege contra duplo clique e retry). Desmarcar grava `checked=false`
  (mantém a linha e a data; a métrica de uso conta `checked=true`).
- **Allowlist no servidor**: a ação só grava se `itemKey` pertence ao conjunto
  de chaves do checklist **gerado para aquela sessão agora**. Chave fora do
  conjunto é recusada (`item_invalido`), sem gravar. Isso limita o número de
  linhas por sessão ao tamanho da lista (~30-50) e impede que a coluna vire
  canal de texto livre (RNF-14/RN-16).
- Nunca escrever via `tripSession.update`/nested write: a escrita é
  diretamente em `tripChecklistMark`, então `TripSession.updatedAt` **não
  muda** (RF-20.8, ordem de "Meus roteiros" preservada) e a state machine não
  é tocada (ADR-006). Teste de integração cobre.
- Cascata: `onDelete: Cascade` na FK. `account-deletion.ts` **não muda**;
  teste de integração de exclusão de conta cobre a tabela nova (GUARDRAILS
  17/20/21 e regra nova 41).

### 6. Server Actions e fronteira de autorização

Um arquivo `src/lib/actions/checklist.ts` (`"use server"`):

- `obterChecklist(sessionId)` (leitura, POST implícito de Server Action, sem
  GET com efeito colateral): mesmo guard de `obterRoteiroLeitura`
  (`findUnique` + `assertSessionAccess(..., {exigeConta: true})`,
  divergência = `SessionNotFoundError`/404 lógico, `conta_necessaria`
  discriminado, ADR-009 item 2). Só devolve checklist se `flowState ===
  "concluida"`; caso contrário devolve `{status: "indisponivel"}` (sessão
  parcial ou em andamento, RN-13). Monta a lista com `gerarChecklist` e
  cruza com as marcas gravadas, **ignorando marcas de chaves que já não
  existem** (RF-20.4).
- `marcarItemChecklist(sessionId, itemKey, marcado)`: mesmo guard, exige
  `concluida` e allowlist (decisão 5). Nunca lança `ContaNecessariaError`
  para o cliente (GUARDRAILS 34).
- Nenhum import de `@/lib/gateway-ia` nem de `@/lib/stage-rules` (valores)
  nesses arquivos; teste de "Gateway não chamado", como `obterRoteiroLeitura`.

## Alternativas consideradas

1. **Gravar o checklist inteiro (snapshot com texto) por sessão.** Descartada:
   guarda texto (mais dado pessoal potencial), fica desatualizada quando o
   conteúdo muda, e obriga backfill. Calcular na leitura e gravar só a marca
   (INT-19) é menor e reprodutível.
2. **Coluna JSON `checklistState` em `TripSession`.** Descartada: escrever em
   `TripSession` mexeria em `updatedAt` (quebra RF-20.8) e na linha que a
   state machine possui; um blob permite texto livre e não tem `UNIQUE`.
3. **Marcação só no cliente (`localStorage`).** Descartada: RF-20.3 exige
   persistência entre dispositivos na mesma conta.
4. **Alternar (toggle) no servidor.** Descartada: não é idempotente; um
   retry ou duplo clique inverte o estado. Estado desejado + `upsert` é
   idempotente.
5. **Conteúdo no banco/CMS.** Descartada pelos mesmos motivos do ADR-010.
6. **Matriz completa destino x mês x duração x tipo escrita à mão.**
   Descartada: inverificável e cara de revisar (decisão 2).
7. **Chave = hash do texto.** Descartada: qualquer correção de redação
   invalidaria as marcas; e o texto seria de fato a identidade do item.

## Consequências

- (+) Zero custo de IA, lista reprodutível e testável, cobertura dos 23
  destinos verificada em compilação e em teste.
- (+) Modelo de dados mínimo, no cascade existente, sem tocar
  `account-deletion.ts`, state machine, nem `TripSession` (só o campo de
  relação, sem mudança de coluna).
- (-) Personalização por "tipo de experiência" limitada ao tipo do destino
  (o quiz não é persistido). Aceito nesta entrega; evolução: persistir o quiz
  em ADR próprio.
- (-) `mesesChuvosos` e o perfil por destino são julgamento editorial; o
  risco R-14 é mitigado pelo rótulo "clima típico" (RN-14) e pela aprovação
  do Gestor, não eliminado.
- (-) Uma escrita do usuário passa a existir em "Meus roteiros" (exceção
  INT-15/RF-19.9), restrita a esta tabela.
- Toda mudança futura de decisão gera novo ADR que supersede este.
