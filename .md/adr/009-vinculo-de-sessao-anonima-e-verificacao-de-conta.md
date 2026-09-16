# ADR-009: Vínculo da sessão anônima à conta e verificação de conta no servidor (V2.0)

- Status: Aceito
- Data: 2026-09-16
- Autor: Coordenador (chapéu Software Architect)
- Relação: **substitui em parte o ADR-008**. Os itens 4 (regra do guard) e 5
  ("sem migração de sessão anônima para conta") do ADR-008 deixam de valer e
  passam a valer os itens 2 a 5 deste ADR. Os itens 1 a 3 do ADR-008 (campo
  `anon_session_id`, exclusividade mútua, contrato de criação com precedência
  da conta) continuam valendo. Não alterei o texto do ADR-008. O índice do
  `SDD.md` §4 registra a substituição parcial.

## Contexto

O V2.0 (`PRD-TECNICO.md` RF-16, RF-17, RN-09, RN-11, RN-12) muda a regra de
acesso do MVP:

- o trecho até a confirmação do destino continua anônimo;
- hospedagem, passeios e roteiro exigem conta, **verificada no servidor**
  (RF-16.7), mesmo que alguém chame a Server Action ou a rota diretamente;
- ao criar conta ou entrar, a sessão anônima em andamento **passa para a
  conta** sem perder destino, datas e orçamento (RF-16.4/RN-11);
- sessões anônimas antigas que já passaram do destino seguem a mesma regra
  (RF-16.9);
- "meus roteiros" lista as sessões da conta, incluindo as vinculadas (RF-17).

O ADR-008 impede isso de três formas:

1. O item 5 proíbe explicitamente migrar a sessão para a conta.
2. No item 4, o guard resolve **uma** identidade, com a conta tendo
   precedência. Assim, um usuário que acabou de entrar recebe 404 na
   própria sessão anônima, porque ela tem `anon_session_id` e ele agora é
   resolvido como `user`. O fluxo do cadastro quebraria logo depois do
   login.
3. Nada no ADR-008 distingue "dono anônimo" de "dono com conta" na hora de
   autorizar uma etapa. Para o ADR-008, as duas identidades valem o mesmo.

Há ainda uma superfície fora do guard: a rota pública
`POST /api/gateway-ia/[etapa]` recebe o contexto inteiro no corpo, não lê
`TripSession` e chama o provider para qualquer etapa sem identidade. Hoje
nenhuma tela a usa (as quatro telas usam o `fetchImpl` ligado às Server
Actions, ver cabeçalho de `destino-sugestoes-screen.tsx`). Mesmo assim, ela
permite gerar hospedagem, passeios e roteiro sem conta, o que viola o RF-16.7.

## Alternativas consideradas

**A. Vínculo**

1. **Vincular todas as sessões do cookie anônimo ao entrar** (no callback
   `signIn` do NextAuth). Descartada. Num computador compartilhado, o cookie
   anônimo (validade de 1 ano) é de quem usou o navegador antes, e as viagens
   dessa pessoa iriam para a conta de outra. Além disso, o callback do
   NextAuth não sabe qual sessão o usuário tem na tela.
2. **Copiar a sessão anônima para uma sessão nova da conta** (clonar
   `TripSession` e filhas). Descartada. Duplica dados e `LlmGenerationLog`,
   deixa uma sessão órfã, e a URL em uso (`sessionId`) deixaria de valer no
   meio do fluxo.
3. **Manter os dois donos na linha** (`user_id` e `anon_session_id`
   preenchidos). Descartada. Quebra a exclusividade mútua do ADR-008, e o
   cookie anônimo continuaria abrindo uma sessão que já pertence a uma conta.
   Depois de sair da conta, qualquer pessoa no mesmo navegador leria a
   viagem.
4. **Transferir a posse da sessão indicada, de forma explícita e atômica**
   (escolhida): só a sessão que está na tela, só se o cookie anônimo da
   requisição for o dono atual e só se ela ainda não tiver conta.

**B. Onde verificar a conta**

1. Só na interface ou no middleware de rota. Descartada: o RF-16.7 exige
   verificação no servidor, e Server Actions podem ser chamadas diretamente.
2. **Novo estado na state machine** (ex.: `aguardando_cadastro`).
   Descartada: o `PRD.md` proíbe mudar a state machine, e o
   `PRD-TECNICO.md` §5 define a verificação como pré-condição da transição.
3. **Pré-condição no Orquestrador e nas leituras que chamam o provider**
   (escolhida).

## Decisão

### 1. Regra de "exige conta" (função pura, sem mudar a state machine)

Novo módulo puro `src/lib/session-flow/account-gate.ts`:

```ts
const ESTADOS_POS_DESTINO = new Set<SessionFlowState>([
  "hospedagem_pendente", "hospedagem_aprovada",
  "passeios_pendente", "passeios_aprovados",
  "roteiro_pendente", "roteiro_aprovado", "concluida",
]);

export function transicaoExigeConta(
  atual: SessionFlowState,
  acao: SessionFlowAction,
): boolean {
  if (acao === "encerrar") return false;             // RN-12
  const proximo = transitionSessionFlow(atual, acao); // lança se inválida
  return ESTADOS_POS_DESTINO.has(atual) || ESTADOS_POS_DESTINO.has(proximo);
}
```

Consequências diretas:

- `avancar` de `destino_confirmado` para `hospedagem_pendente` ("Confirmar e
  continuar" em T05) **exige conta**. O corte do RF-16.2 fica exatamente
  nessa transição. Quando o usuário é anônimo, a sessão **permanece em
  `destino_confirmado`**, com a `DestinationApproval` já gravada. Com isso, o
  destino fica "registrado como aprovado" antes do pedido de cadastro.
- `revisar` de `destino_confirmado` ("Trocar destino") não exige conta.
- `encerrar` nunca exige conta, em nenhum estado (RN-12, INT-16). Isso
  também cobre sessões antigas (RF-16.9).
- Toda ação a partir de hospedagem exige conta.

A tabela de transições (`state-machine.ts`, ADR-006 e adendos) **não muda**.

### 2. Guard de posse revisado (substitui o item 4 do ADR-008)

A identidade da requisição passa a ser um **par**, não uma escolha por
precedência:

```ts
type RequestIdentity = {
  userId: string | null;        // getServerSession(authOptions)
  anonSessionId: string | null; // cookie anon_session_id (sem criar um novo)
};
```

`resolveSessionOwner()` (item 3 do ADR-008) continua existindo **só para
criação** de sessão, com a mesma precedência. O guard usa a nova
`resolveRequestIdentity()`.

`assertSessionAccess(sessionId, record, { exigeConta })` substitui
`assertSessionOwnership`. O nome antigo continua como alias de
`exigeConta: false` durante a transição e sai no fim do lote.

| Situação do registro | Identidade da requisição | `exigeConta: false` | `exigeConta: true` |
|---|---|---|---|
| `userId = U` | `userId = U` | permite | permite |
| `userId = U` | qualquer outra (inclusive o mesmo cookie de antes do vínculo) | 404 | 404 |
| `anonSessionId = A` | cookie `A` (com ou sem conta autenticada) | permite | `ContaNecessariaError` |
| `anonSessionId = A` | cookie diferente de `A` | 404 | 404 |
| nenhum dos dois gravado | qualquer | 404 | 404 |

- A regra "toda negação de posse retorna 404, nunca 403" continua valendo.
- `ContaNecessariaError` **não é** negação de posse. Ela só é lançada para
  quem já provou ser o dono anônimo, porque o cookie confere. Portanto não
  revela nada a terceiros. A ordem é sempre posse primeiro, conta depois.
- Um usuário autenticado que ainda tem o cookie `A` continua lendo e
  encerrando a própria sessão anônima (linha 3, coluna 1). Isso resolve o
  "404 logo depois do login" descrito no contexto e o caso de várias abas.

**Onde o guard com `exigeConta` é chamado:**

- `applySessionFlowTransition` usa `exigeConta = transicaoExigeConta(atual, acao)`.
  O cálculo acontece depois da posse e antes de qualquer escrita, dentro da
  mesma transação.
- As leituras que chamam o provider usam `exigeConta: true` **antes** de
  montar o prompt: `gerarSugestoesHospedagem`, `gerarSugestoesPasseios` e
  `gerarRoteiro`. Assim a recusa acontece sem custo de IA (RF-16.7).
- A leitura do roteiro em modo leitura (`/meus-roteiros/[sessionId]`) e
  `retomarSessao` (ver `SDD.md` §8.2.7) também usam `exigeConta: true`.
- `gerarSugestoesDestino`, as ações de T04 e T05 e `obterResumoEncerramento`
  usam `exigeConta: false`.

**Contrato com o cliente.** Em produção, o Next.js apaga a classe e a
mensagem de erros lançados por Server Actions. Por isso, **nenhuma Server
Action devolve `ContaNecessariaError` como exceção ao cliente**. As ações de
tela a convertem num resultado discriminado:

```ts
{ status: "conta_necessaria"; sessionId: string }
```

A tela reage a esse resultado navegando para `/cadastro?sessionId=...`
(T-GATE, `UX-SPEC.md` §8.2). `confirmarDestino` passa a devolver
`{ proximaEtapa: "hospedagem" } | { status: "conta_necessaria" }`.

### 3. Vínculo explícito e atômico (substitui o item 5 do ADR-008)

Nova Server Action `vincularSessaoAConta({ sessionId })` em
`src/lib/actions/vinculo-conta.ts`, com a escrita delegada a
`linkAnonymousSessionToUser(tx, ...)` em `src/lib/session-flow/` (a
Diretriz 3 continua valendo: só o módulo `session-flow` escreve em
`TripSession`).

Pré-condições, todas verificadas no servidor:

1. `userId` vem de `getServerSession`. Sem conta autenticada, a ação devolve
   `{ status: "nao_autenticado" }` e não escreve nada.
2. `anonSessionId` vem do cookie da requisição, nunca do corpo.
3. `sessionId` vem do corpo, mas **só seleciona** a sessão. Ele não prova
   posse.

Escrita condicional, numa única instrução:

```ts
const { count } = await tx.tripSession.updateMany({
  where: { id: sessionId, anonSessionId, userId: null },
  data:  { userId, anonSessionId: null, linkedAt: new Date() },
});
```

- `count === 1`: vinculada.
- `count === 0`: a ação relê a linha **na mesma transação**:
  - se `userId` já é o do solicitante, devolve sucesso idempotente (duplo
    clique, duas abas ou retry de rede);
  - em qualquer outro caso (sessão de outra conta, cookie diferente,
    inexistente), lança `SessionNotFoundError` (404).
- **Exclusividade mútua preservada**: `anon_session_id` é zerado no mesmo
  `UPDATE`. A partir daí, o cookie anônimo **não abre mais** essa sessão.
- **Somente a sessão indicada** é vinculada. Outras sessões do mesmo cookie
  continuam anônimas. Cada uma é vinculada quando o dono tentar seguir com
  ela (RF-16.9), passando pela mesma tela.
- **Continuação no mesmo passo**: se a sessão vinculada estiver em
  `destino_confirmado`, a mesma transação aplica `avancar`
  (→ `hospedagem_pendente`). Essa é a intenção registrada quando o usuário
  clicou em "Confirmar e continuar". Para isso, `applySessionFlowTransition`
  ganha uma variante que recebe o `tx` de fora. Em qualquer outro estado, a
  ação só vincula. Nos dois casos, ela devolve a rota da etapa atual
  (`rotaDaEtapa(flowState)`, `SDD.md` §8.2.5).
- Sem retry automático no servidor. Em caso de falha, a tela mostra erro e
  mantém a sessão anônima intacta (RF-16.8).

**Conta que já existe.** Entrar numa conta que já tem outras sessões não
mistura nem apaga nada. A sessão vinculada é só mais uma linha com aquele
`user_id`, e "meus roteiros" passa a listá-la. Não existe merge de conteúdo
entre sessões.

**Quem chama `vincularSessaoAConta`.**

- T-GATE, logo depois de `criarConta` + `signIn("credentials")`, ou depois de
  `signIn` em "já tenho conta". Nesse caso a intenção do usuário é explícita.
- T-GATE aberta por quem **já está autenticado** (sessão anônima antiga ou
  outra aba). A tela mostra "Continuar com a conta {e-mail}" e só vincula
  depois desse clique. O vínculo nunca acontece automaticamente ao abrir a
  página, porque uma requisição GET não pode ter efeito colateral.

### 4. Cookie anônimo depois do vínculo e ao sair da conta

- O cookie `anon_session_id` **não é apagado nem trocado** no login, no
  vínculo ou ao sair da conta. Ele continua sendo a identidade de visitante
  para sessões anônimas futuras e para outras sessões anônimas ainda não
  vinculadas (outras abas). Trocá-lo deixaria essas sessões órfãs.
- Esse cookie não dá mais acesso à sessão vinculada, porque o
  `anon_session_id` dela foi zerado. Depois de sair da conta, o mesmo
  navegador recebe 404 nessa sessão.

### 5. Superfície de IA fora do guard

- A rota `POST /api/gateway-ia/[etapa]` é **removida** no V2.0. Ela não tem
  consumidor, e o `LoadingStream` das quatro telas usa `fetchImpl` ligado às
  Server Actions. Antes de remover, o Executor confirma com busca no código
  que ela não tem consumidor. Se aparecer um, a rota passa a receber só
  `sessionId`, monta o contexto a partir do banco e aplica
  `assertSessionAccess` com `exigeConta` para etapas diferentes de
  `destino`. Ela não pode continuar aceitando contexto livre no corpo.
- A rota de spike (`streaming-spike`) não chama o provider e fica fora deste
  ADR.

## Consequências

- **Schema**: nova coluna `trip_sessions.linked_at` (timestamp, nullable) e
  índice `(user_id, updated_at)` para "meus roteiros". O consentimento fica
  no ADR-012. A migration é aditiva, sem backfill.
- `assertSessionOwnership` muda de semântica: o dono anônimo continua aceito
  mesmo com conta autenticada. Os testes de `authorization.test.ts` que
  fixavam "usuário logado + sessão anônima = 404" **mudam de expectativa**,
  e essa mudança é intencional.
- `confirmarDestino` e as ações de T06, T07 e T08 ganham o resultado
  `conta_necessaria`. As telas precisam tratá-lo.
- O rate limit continua em memória por instância (dívida já aceita no MVP).
  Ele passa a cobrir também entrada e cadastro (`SDD.md` §8.7).
- **Risco aceito**: o JWT do NextAuth continua válido até expirar, mesmo
  depois de a conta ser excluída. A tela chama `signOut` logo após a
  exclusão. Um JWT copiado antes da exclusão não acessa nenhuma sessão,
  porque as sessões da conta foram apagadas junto (`account-deletion.ts`).
  Esse JWT ainda poderia criar sessões novas com um `user_id` que já não
  existe. Como proteção, `resolveRequestIdentity` confirma que o `User`
  existe (uma consulta por chave primária) e, se ele não existir, trata a
  requisição como sem conta.
