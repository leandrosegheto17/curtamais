// L6-T03/L6-T05 — Helper compartilhado para criar uma `TripSession` inicial
// a partir de um range de datas concreto (RF-01.2/.3, RF-02.3) e aplicar a
// MESMA ramificação de RF-01.2/.3, conforme destino informado ou não:
// - Sem destino: permanece em `destino_pendente` (segue para RF-04, sugestão
//   de destino por sazonalidade).
// - Com destino: registra `DestinationApproval` (`source: "user_provided"`)
//   e avança para `destino_confirmado`, aguardando a etapa curta de
//   confirmação explícita de RF-11 (tela/Server Action fora do escopo deste
//   helper).
//
// Extraído para este módulo (dentro da fronteira de `session-flow`,
// Diretriz de Implementação 3 do TASK.md Seção 1) para que as Server
// Actions de tela com origem diferente — T01 "Data livre" (L6-T03) e T02
// "Feriados prolongados" (L6-T05), e futuramente T03 "Quiz guiado"
// (L6-T07) — apliquem exatamente a mesma lógica de criação de sessão +
// transição, em vez de duas/três implementações potencialmente divergentes
// da mesma regra de negócio (RF-01.2/.3 e RF-02.3 exigem explicitamente "a
// mesma ramificação").
//
// Este é o único ponto do módulo (além de `./persistence.ts`) que toca
// `TripSession` diretamente via Prisma Client — só para o INSERT inicial
// (não existe uma "transição" de estado anterior a `entrada_selecionada`,
// então não há o que `applySessionFlowTransition` decida aqui); toda
// transição subsequente (`iniciar`, e opcionalmente `aprovar`) é delegada a
// `applySessionFlowTransition` (`./persistence.ts`), nunca duplicando a
// validação/gravação de lá.

import type { TripEntryPath } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applySessionFlowTransition } from "./persistence";
import type { SessionFlowState } from "./state-machine";

// L11-T02a — ADR-008: dono da sessão (usuário autenticado OU sessão
// anônima), resolvido pelo CHAMADOR (Server Action de tela) e nunca
// inferido aqui — este helper só grava o que recebe. Discriminado por
// `type` para que o guard central de `L11-T02` (ainda não implementado)
// tenha, em tempo de compilação, a garantia de que os dois ramos são
// mutuamente exclusivos.
export type SessionOwner =
  | { type: "user"; userId: string }
  | { type: "anonymous"; anonSessionId: string };

export type CreateSessionWithDateRangeInput = {
  /** Caminho de entrada que originou esta sessão (RF-01/RF-02/RF-03). */
  entryPath: TripEntryPath;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  /**
   * Dono da sessão (ADR-008) — obrigatório. Grava exatamente um dos dois
   * campos (`user_id` OU `anon_session_id`) no `INSERT`, nunca os dois,
   * nunca nenhum.
   */
  owner: SessionOwner;
  /**
   * Destino já decidido pelo usuário (RF-01.3/RF-02.3), opcional. Texto
   * livre — o chamador (Server Action de tela) é responsável por
   * trim/validação de tamanho antes de repassar aqui (Diretriz de
   * Implementação 9, TASK.md Seção 1: todo campo de texto livre é
   * validado/sanitizado no servidor). `null`/`undefined`/string vazia (ou só
   * espaços) são todos tratados como "sem destino" (ramo RF-01.2/RF-02.3).
   */
  destino?: string | null;
};

export type CreateSessionWithDateRangeResult = {
  sessionId: string;
  flowState: SessionFlowState;
  status: "in_progress" | "partial" | "completed" | "abandoned";
};

/**
 * Cria uma `TripSession` a partir de um range de datas já resolvido pelo
 * chamador (range livre de RF-01, ou feriado+emenda de RF-02.3) e aplica a
 * ramificação de RF-01.2/RF-01.3: sem destino → só avança para
 * `destino_pendente` (`iniciar`); com destino → também aprova o destino
 * informado (`source: "user_provided"`), avançando para
 * `destino_confirmado`.
 */
export async function createSessionWithDateRange(
  input: CreateSessionWithDateRangeInput,
): Promise<CreateSessionWithDateRangeResult> {
  const session = await prisma.tripSession.create({
    data: {
      entryPath: input.entryPath,
      dateRangeStart: input.dateRangeStart,
      dateRangeEnd: input.dateRangeEnd,
      // ADR-008: exatamente um dos dois é gravado, nunca os dois, nunca
      // nenhum — garantido pelo tipo discriminado `SessionOwner` (o ramo
      // não usado do `owner` simplesmente não existe no objeto de entrada).
      ...(input.owner.type === "user"
        ? { userId: input.owner.userId }
        : { anonSessionId: input.owner.anonSessionId }),
    },
    select: { id: true },
  });

  const afterIniciar = await applySessionFlowTransition({
    sessionId: session.id,
    action: "iniciar",
  });

  const destino = input.destino?.trim();
  if (!destino) {
    // RF-01.2/RF-02.3, ramo sem destino: segue para RF-04, sem nenhuma
    // aprovação registrada ainda.
    return afterIniciar;
  }

  // RF-01.3/RF-02.3, ramo com destino: registra como aprovado
  // (`user_provided`) e avança para `destino_confirmado` (RF-11).
  return applySessionFlowTransition({
    sessionId: session.id,
    action: "aprovar",
    childData: {
      stage: "destino",
      name: destino,
      // Sem justificativa: não veio de sugestão da IA (SDD.md Seção 5,
      // campo nullable exatamente para este caso).
      justification: null,
      // Sem faixa de preço real: o destino veio do usuário, não de uma
      // sugestão avaliada pela IA — não há preço estimado a registrar.
      // 0/0 é a decisão adotada (dentro da margem de "detalhe de
      // implementação" do Executor) por não existir um terceiro estado
      // "sem preço" no schema (`priceRangeMin`/`Max` são `Decimal` não
      // anuláveis) — documentado nas Notas de implementação L6-T03/L6-T05
      // do TASK.md. Exibição de preço (RNF-01/PriceRangeBadge) é
      // responsabilidade de tela, fora de escopo deste helper.
      priceRangeMin: 0,
      priceRangeMax: 0,
      source: "user_provided",
    },
  });
}
