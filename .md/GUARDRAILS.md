# GUARDRAILS.md — Planejador de Viagens com Decisão Guiada por IA

Rascunho inicial. Autor: Coordenador (chapéu Tech Lead), produzido junto com
`TASK.md`, extraído de `CTO-REVIEW.md` (Gate 1), `SDD.md` e dos 7 ADRs em
`.md/adr/`. Pendente de aprovação do usuário (orquestrador) junto com o
restante do pacote de planejamento. Depois de aprovado, vale para todos os
agentes (Executor e Validador incluídos).

## Regras de negócio inegociáveis (PRD-TECNICO.md)

1. **RN-01** — O fluxo de sugestão nunca apresenta duas ou mais etapas
   (destino, hospedagem, passeios, roteiro) na mesma resposta/tela.
2. **RN-02** — O calendário de feriados prolongados considera exclusivamente
   feriados nacionais brasileiros. Feriados internacionais são fora de escopo
   até nova decisão de produto.
3. **RN-03** — Uma sessão é "concluída com valor" mesmo com só uma etapa
   aprovada (ex.: só destino). Sessão parcial nunca é tratada como erro ou
   fluxo quebrado, em nenhuma camada (backend, UI, log).
4. **RN-04** — O orçamento informado nunca bloqueia o fluxo. É filtro/
   priorização apenas; nenhuma tela desabilita ação por causa de orçamento.
5. **RN-05** — Toda faixa de preço exibida é rotulada como aproximada, nunca
   como cotação confirmada/reservável.
6. **RN-06** — O quiz guiado não é expandido além das 4 perguntas de RF-03.1
   sem nova rodada de validação de uso real.

## Regras de arquitetura inegociáveis (SDD.md / ADRs)

7. Nenhuma tela ou componente de UI chama o provider de LLM diretamente —
   toda chamada passa pelo Gateway de IA (ADR-002, SDD §1).
8. Toda resposta do provider de LLM é consumida via saída estruturada
   (JSON mode/structured outputs) — proibido parsing de texto livre de
   resposta de LLM (ADR-002/003).
9. Provider único (OpenAI GPT-4o-mini) sem fallback multi-provider no MVP —
   não implementar roteamento/múltiplos providers sem um novo ADR que
   supersede ADR-002/ADR-004.
10. Retry em chamada ao provider de LLM é único e automático — nunca mais de
    uma tentativa adicional antes de expor erro ao usuário (ADR-004, RNF-05).
11. A state machine do fluxo guiado é sempre server-side (ADR-006) — nenhuma
    navegação client-side otimista entre etapas; toda transição depende de
    confirmação do servidor.
12. Toda transição de etapa aprovada persiste imediatamente (ADR-006/RF-09) —
    não existe ação de "salvar" manual nem edição retroativa de etapa já
    aprovada no MVP.
13. Toda chamada ao provider de LLM é registrada em `LlmGenerationLog`
    (tokens, custo estimado, latência, retry_count, status) — nenhuma chamada
    "silenciosa" fora do log (SDD §5/§6).
14. O cálculo de feriados (RF-02) é sempre determinístico — nunca depende de
    chamada a LLM (ADR-007, RNF-07).

## Regras de segurança e compliance (SDD.md §7)

15. Segredos (API key do provider de LLM, string de conexão do banco) só via
    variável de ambiente/secrets manager da plataforma de deploy — nunca
    versionados no repositório.
16. Toda rota que lê/escreve `TripSession` ou entidades filhas valida que o
    cookie de sessão (ou `user_id` autenticado) corresponde ao dono do
    registro — nenhuma rota expõe dado de outra sessão/usuário.
17. Nenhum dado pessoal de conta (e-mail, senha) é enviado ao prompt do LLM
    em nenhuma etapa — o contexto enviado se restringe a dados da sessão de
    viagem (datas, destino, orçamento, feedback do usuário).
18. Toda entrada de texto livre do usuário (orçamento, destino manual,
    feedback de ajuste) é validada e sanitizada no servidor antes de compor
    o prompt, como mitigação de prompt injection.
19. Rate limiting de chamadas ao Gateway de IA por sessão/IP é obrigatório,
    mesmo sem modelo de monetização definido.
20. Exclusão de conta (LGPD, RNF-06) remove `TripSession` e todas as entidades
    filhas associadas ao `user_id` — nenhum dado pessoal remanescente após
    exclusão solicitada pelo usuário.
21. Nenhum dado pessoal é usado para treinar/fine-tunar modelo — uso restrito
    a inferência via API do provider.

## Regras de UX/acessibilidade inegociáveis (UX-SPEC.md)

22. WCAG AA é critério não negociável em toda tela — contraste mínimo 4.5:1
    (texto normal) / 3:1 (texto grande/ícones), navegação por teclado
    completa, foco gerenciado explicitamente em toda transição de etapa.
23. Nenhuma informação de status é comunicada só por cor — sempre ícone +
    texto (badges de preço, banners de atenção, estados de erro).
24. Toda tela dependente de geração por LLM (T04/T06/T07/T08) implementa os 4
    estados (vazio quando aplicável, carregando, erro, sucesso) usando os
    componentes compartilhados (`LoadingStream`, `ErrorRetryState`,
    `EmptyState`), nunca uma implementação local duplicada.

## Regras de stack (SDD.md §3)

25. ORM obrigatório: Prisma sobre PostgreSQL — nenhuma migration manual fora
    do fluxo Prisma Migrate.
26. Plataforma de deploy: serverless compatível com Next.js (ex.: Vercel) —
    não migrar hospedagem sem novo ADR.
27. Todo ADR aceito é imutável — mudança de decisão arquitetural sempre gera
    um novo ADR com `Status: Superseded by ADR-NNN`, nunca edição do anterior.

## Regras novas do V2.0 (2026-09-16) — aprovadas pelo Gestor em 2026-09-16

Extraídas de `SDD.md` §8, `UX-SPEC.md` §8 e ADR-009 a ADR-012, junto com o
`TASK.md` (lotes `V2-L1` a `V2-L8`). Regras 1-27 acima continuam valendo sem
exceção; as regras abaixo são acréscimos, não substituições.

28. **Nunca commitar imagem do catálogo sem autor, fonte, licença e URL de
    origem registrados** (`catalogo/destinos.ts`, ADR-010, RF-15.5) — imagem
    sem esses quatro campos não entra em `public/destinos/`.
29. **Nunca usar correspondência aproximada/fuzzy entre a sugestão da IA e o
    catálogo de destinos** — só igualdade exata após normalização
    determinística (`normalizarNomeDestino`); na dúvida, sempre o fallback de
    gradiente (RF-15.4, RN-10, ADR-010).
30. **Nunca buscar imagem em serviço externo em tempo de execução, nem usar
    imagem gerada por IA para representar um lugar real** — o catálogo do
    V2.0 é só curadoria manual versionada em repositório (RN-10, ADR-010); a
    busca automática (Unsplash/Pexels API) fica para um ADR próprio do V2.1.
31. **Nunca criar conta sem o consentimento explícito marcado** — o checkbox
    de consentimento (`ConsentCheckbox`) é desmarcado por padrão; sem
    `consentimento === true`, nenhuma escrita em `User` acontece, e a versão
    do texto aceito (`CONSENTIMENTO_VERSAO`) é sempre gravada junto da conta
    (RNF-13, ADR-012).
32. **Nunca gerar sugestão, roteiro ou qualquer conteúdo via Gateway de IA a
    partir de uma rota/Server Action pública sem a verificação de conta
    exigida pela etapa** — toda etapa pós-destino (hospedagem, passeios,
    roteiro) verifica `exigeConta` no servidor antes de montar o prompt,
    mesmo que a interface já pareça ter bloqueado o acesso (RF-16.7,
    ADR-009); a checagem nunca é só client-side.
33. **A home vitrine e o roteiro de exemplo nunca chamam o provider de LLM
    nem o Prisma** — zero custo de IA e zero acesso a banco em ambos, em
    qualquer uma de suas seções, verificado por regra de lint
    (`no-restricted-imports`) e teste, não só por revisão manual (RN-08,
    RF-12.7, RF-14.2, ADR-011).
34. **`ContaNecessariaError` nunca é lançada como exceção para o cliente** —
    toda Server Action que pode exigir conta devolve o resultado
    discriminado `{status: "conta_necessaria", sessionId}` (ADR-009 item 2).
35. **A state machine do fluxo guiado não ganha nenhum estado novo por causa
    da verificação de conta** — a exigência de conta é sempre pré-condição de
    transição (`transicaoExigeConta`), nunca um estado/ação novo em
    `state-machine.ts` (ADR-009 item 1; o `PRD.md` já proíbe mudar a state
    machine).
36. **Vínculo de sessão anônima à conta é sempre explícito, atômico e restrito
    à sessão indicada** — nunca migra todas as sessões do cookie anônimo de
    uma vez, nunca faz merge de conteúdo entre sessões, e o cookie
    `anon_session_id` nunca é apagado/trocado no login ou no vínculo (RN-11,
    ADR-009 itens 3-4).
37. **Vocabulário de reserva/venda e de agência/atendimento humano é proibido
    em toda tela nova do V2.0** — CTA, título, card e `aria-label` seguem a
    lista de termos proibidos de `UX-SPEC.md` §8.8 (RN-07, RNF-11).
38. **Nenhum destino/data vindo de parâmetro de URL chega ao prompt do
    Gateway de IA sem validação contra uma lista fechada** — T01 só aceita
    `slug` do catálogo, T02 só aceita uma data presente na lista de feriados
    calculada; nenhum texto livre de querystring é tratado como confiável
    (RF-13, RF-18.3, SDD §8.7).
39. **`retorno`/`callbackUrl` de entrada/cadastro só aceitam a allowlist de
    caminhos relativos definida no SDD §8.2.5** — qualquer outro valor cai em
    `/`, para impedir redirecionamento aberto.
40. **Recuperação de senha e verificação de e-mail continuam fora de escopo
    até decisão explícita em contrário do dono** — nenhuma tela ou Server
    Action do V2.0 assume ou implementa esses dois mecanismos (decisão do
    dono, 2026-09-16, `SDD.md` §8.6).

---

Este rascunho segue para aprovação do usuário (orquestrador) junto com
`SDD.md`, `UX-SPEC.md` e `TASK.md`. Após aprovação, qualquer violação
encontrada pelo Validador na fase de execução é tratada como achado de
severidade alta, não como preferência de estilo.

## Log de Alterações

| Data | Proposto por | Aprovado por | Mudança | Motivo |
|---|---|---|---|---|
| 2026-09-07 | coordenador | gestor | Aprovação da versão inicial (regras 1-27), com duas ressalvas não bloqueantes: (1) adicionar regra explícita proibindo implementação de entidades/funcionalidades de Fase 2 (Checklist, TripDocument, Expense, TripMember) neste ciclo do MVP, mesmo que o schema as preveja como extensão futura (SDD.md §5); (2) adicionar regra travando ADR-001 (PWA vs. nativo) contra mudança sem novo ADR, no mesmo padrão já aplicado à regra 26 (plataforma de deploy) — nenhuma das duas contradiz o conteúdo aprovado, ambas fecham lacuna de cobertura em relação à ressalva 3 do Gate 1 (CTO-REVIEW.md) e à simetria de tratamento entre ADRs | Ver parecer ad hoc em `CTO-REVIEW.md` (2026-09-07) |
| 2026-09-16 | coordenador | gestor | Aprovação das regras 28-40 (V2.0), extraídas de `SDD.md` §8, `UX-SPEC.md` §8 e ADR-009 a ADR-012 — catálogo de imagens (crédito/licença, correspondência exata, sem busca externa/IA), consentimento no cadastro, verificação de conta no servidor antes de qualquer chamada de IA pós-destino, state machine inalterada, vínculo de sessão explícito/atômico, vocabulário proibido, allowlist de parâmetros de URL e de redirecionamento, e exclusão explícita de recuperação de senha/verificação de e-mail do escopo. `guardrails-governance` (Gestor) checou consistência com as regras 1-27: nenhuma contradição, nenhuma exceção estrutural sem justificativa — todas as 13 regras novas reforçam ou detalham princípios já aprovados (Gateway de IA único ponto de chamada a LLM, state machine server-side imutável em transições, isolamento de dados pessoais/sessão, imutabilidade de ADR por superação). Sem ressalvas | Ver `TASK.md`, Seção 3 (lotes `V2-L1` a `V2-L8`) e Seção 6 (V2.0) |
