# ADR-012: Registro de consentimento no cadastro (RNF-13)

- Status: Aceito
- Data: 2026-09-16
- Autor: Coordenador (chapéu Software Architect)
- Relação: novo. Estende o modelo `User` do NextAuth (L1-T03) e o RNF-06.

## Contexto

O RNF-13 (decisão do dono, 2026-09-16) pede:

- um checkbox de consentimento desmarcado por padrão;
- nenhuma conta criada sem ele;
- a data e a hora do consentimento gravadas junto da conta;
- cadastro e vínculo da sessão só depois do consentimento.

A política de privacidade completa fica para depois do V2.0, e o texto do
consentimento pode mudar quando ela existir.

Hoje o cadastro existe como `POST /api/auth/signup` (JSON), sem tela e sem
consentimento. `User` não tem nenhuma data (nem `createdAt`).

## Alternativas consideradas

1. **Tabela `ConsentRecord`** (histórico de consentimentos por usuário e
   versão). Descartada para o V2.0. Existe um único consentimento, dado uma
   vez no cadastro, e não há fluxo de revogação separado da exclusão de
   conta. Seria uma tabela a mais sem uso real agora. Se a política de
   privacidade trouxer novo consentimento ou revogação, um ADR futuro cria
   essa tabela e migra as duas colunas abaixo.
2. **Só um booleano**. Descartada: o RNF-13 exige data e hora, e sem versão
   não dá para saber **qual texto** a pessoa aceitou.
3. **Duas colunas em `User`: data/hora e versão do texto** (escolhida).

## Decisão

1. **Schema**:
   ```prisma
   model User {
     // ... inalterado ...
     privacyConsentAt      DateTime? @map("privacy_consent_at")
     privacyConsentVersion String?   @map("privacy_consent_version")
   }
   ```
   As colunas são nullable no banco porque contas de teste já existentes não
   têm consentimento (o produto nunca foi ao ar). O preenchimento é
   **obrigatório na aplicação** para toda conta nova.
2. **Texto versionado em código**: `src/lib/consentimento.ts` exporta
   `CONSENTIMENTO_VERSAO = "2026-09-16-v1"` e `CONSENTIMENTO_TEXTO`. A tela
   exibe exatamente esse texto, e o servidor grava exatamente essa versão.
   Mudar o texto exige mudar a versão (verificado por teste com snapshot do
   texto por versão).
3. **Criação de conta** passa a ser a Server Action `criarConta({ email,
   senha, consentimento })` (`src/lib/actions/conta.ts`), e
   `createUserAccount` passa a exigir `consentimento: true`:
   - sem `consentimento === true`, a ação devolve
     `{ status: "erro", campo: "consentimento" }` sem consultar o banco;
   - `privacyConsentAt` recebe o **relógio do servidor** e
     `privacyConsentVersion = CONSENTIMENTO_VERSAO`. Nada vem do cliente
     além do booleano;
   - a colisão de e-mail no `create` (erro Prisma `P2002`, corrida entre
     dois cadastros) é tratada como "e-mail já cadastrado", da mesma forma
     que a consulta prévia.
4. **A rota `POST /api/auth/signup` é removida**. Ela criaria conta sem
   consentimento, e as Server Actions já têm verificação de origem (CSRF)
   nativa do Next.js. Os testes de integração de `createUserAccount`
   continuam.
5. **Ordem** (RNF-13): consentimento → criação da conta → `signIn` →
   vínculo (ADR-009). Nenhuma escrita em `TripSession` acontece antes da
   conta existir.
6. **Exclusão de conta** (`account-deletion.ts`) não muda: apagar o `User`
   apaga as duas colunas.

## Consequências

- Migration aditiva, sem backfill.
- `privacyConsentAt` também serve de data de cadastro na leitura manual da
  métrica "cadastros pós-destino" (`PRD.md`, Métricas do V2), já que `User`
  não tem `createdAt`.
- Quando a política de privacidade existir (pré-requisito de "colocar no ar
  de verdade"), será preciso decidir se as contas com a versão
  `2026-09-16-v1` precisam aceitar de novo. Isso fica fora deste ADR.
