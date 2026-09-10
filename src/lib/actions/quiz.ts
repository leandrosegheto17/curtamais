"use server";

// L6-T07 — T03 Server Action: gera o range de datas sugerido a partir do
// período informado no quiz guiado (RF-03.2) e cria a `TripSession`
// correspondente, avançando a state machine para `destino_pendente`.
//
// Reaproveita `createSessionWithDateRange` (`@/lib/session-flow`,
// `./create-session-with-range.ts`), já extraído por L6-T03/L6-T05
// especificamente para que as 3 origens de entrada (T01 "Data livre", T02
// "Feriados prolongados", T03 "Quiz guiado") criem a `TripSession` e apliquem
// a mesma ramificação de RF-01.2/.3 de forma única, em vez de reimplementar
// aqui o INSERT + `applySessionFlowTransition("iniciar")`/aprovação de
// destino (ver cabeçalho daquele arquivo). Nenhum arquivo do módulo
// `session-flow` foi tocado por esta tarefa.
//
// RF-01.2/.3 aplicado ao quiz: as 4 perguntas de RF-03.1 (período/alcance
// geográfico/tipo de experiência/orçamento — `QuizAnswers`,
// `src/components/quiz/quiz-wizard.tsx`, L6-T06) NUNCA incluem destino —
// confirmado em `PRD-TECNICO.md` RF-03.1/RF-03.2 antes de implementar esta
// tarefa. Por isso `createSessionWithDateRange` é sempre chamado sem
// `destino`, e a ramificação de RF-01.2/.3 sempre segue o ramo "sem
// destino": a sessão sempre avança para `destino_pendente` (RF-04), nunca
// para `destino_confirmado` — ao contrário de L6-T03/L6-T05, que podem
// receber um destino já decidido pelo usuário.
//
// Fora de escopo desta tarefa (decisão documentada, não um esquecimento):
// persistir `alcance`/`experiencia` do quiz em `TripSession` — o schema
// Prisma (`prisma/schema.prisma`) não tem nenhum campo para essas duas
// respostas, e `StageContext`/`buildDestinoPrompt`
// (`src/lib/gateway-ia/prompts.ts`, L3-T02) também não usam nenhum critério
// de alcance geográfico/tipo de experiência na sugestão de destino (RF-04.1
// só menciona sazonalidade/época do ano) — é uma lacuna real entre RF-03.1
// (coleta) e RF-04 (uso), mas está fora do critério de aceite desta tarefa
// (que é só o range de datas) e exigiria uma decisão de schema/contrato que
// não cabe ao Executor decidir sozinho (mesmo padrão do Bloqueio 001/Adendo
// 1 do ADR-006). Sinalizado ao Coordenador como achado não-bloqueante (ver
// nota de implementação L6-T07 no TASK.md) — não é um `BLOCKERS.md` porque
// não impede a conclusão desta tarefa.
//
// `orcamento` (texto livre, RF-03.1 item 4): por não haver `destino` a
// registrar via `createSessionWithDateRange` (que não aceita orçamento como
// entrada) e por essa função já ser compartilhada com L6-T03/L6-T05 (evitar
// editar o mesmo arquivo em paralelo com as outras 2 instâncias em execução
// agora), esta tarefa NÃO persiste `TripSession.budgetAmount`/
// `budgetCurrency` a partir do texto livre do quiz — decisão de escopo
// documentada (pequeno desvio, não escalado): normalizar texto livre em
// faixa de valor para um teto único é uma responsabilidade melhor cabida a
// quem estender `createSessionWithDateRange`/RF-10 de fato (L7-T01 ou uma
// futura extensão deste helper), não a esta Server Action isoladamente.

import { createSessionWithDateRange } from "@/lib/session-flow";
import type { CreateSessionWithDateRangeResult } from "@/lib/session-flow";
import type { QuizAnswers } from "@/components/quiz/quiz-wizard";
import { resolveSuggestedDateRange } from "./quiz-date-range";
import type { SuggestedDateRange } from "./quiz-date-range";
import { resolveSessionOwner } from "./resolve-session-owner";

// A lógica pura de geração do range (algoritmo, decisões de duração/janela
// de busca de feriado) vive em `./quiz-date-range.ts`, NÃO neste arquivo:
// arquivos `"use server"` só podem exportar funções assíncronas (Next.js
// App Router) — `resolveSuggestedDateRange` é síncrona e precisa ser testável
// em isolamento sem depender de uma Server Action, então foi extraída para
// um módulo comum separado (mesmo motivo de `InvalidDataLivreInputError` ter
// sido extraído para `./data-livre-errors.ts` em L6-T03).

export type SubmitQuizAnswersResult = CreateSessionWithDateRangeResult & {
  dateRangeSource: SuggestedDateRange["source"];
};

/**
 * Server Action de T03 (RF-03.2): recebe as respostas do quiz guiado
 * (`QuizAnswers`, L6-T06), gera o range de datas sugerido e cria a
 * `TripSession` correspondente (`entryPath: "quiz"`), sempre sem destino
 * (quiz não coleta destino — ver cabeçalho do arquivo), avançando para
 * `destino_pendente`.
 *
 * Lança se `answers.periodo` estiver ausente — RF-03.3 já torna essa
 * pergunta obrigatória no próprio wizard (L6-T06, sem "Pular" em (a)), então
 * chegar aqui sem período é um erro de chamador, não um caminho esperado da
 * UI.
 */
export async function submitQuizAnswers(
  answers: QuizAnswers,
): Promise<SubmitQuizAnswersResult> {
  if (!answers.periodo) {
    throw new Error(
      "QuizAnswers.periodo é obrigatório (RF-03.3) — a Server Action de T03 não pode ser chamada sem essa resposta.",
    );
  }

  const { start, end, source } = resolveSuggestedDateRange(answers.periodo);
  const owner = await resolveSessionOwner();

  const result = await createSessionWithDateRange({
    entryPath: "quiz",
    dateRangeStart: start,
    dateRangeEnd: end,
    // Quiz nunca coleta destino (RF-03.1) — sempre o ramo "sem destino" de
    // RF-01.2, avançando para destino_pendente/RF-04.
    owner,
  });

  return { ...result, dateRangeSource: source };
}
