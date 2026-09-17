// V2-L8-T01 — `rotuloDaSessao` (RF-17.3), extraída para um módulo à parte
// SEM `"use server"` porque é uma função pura (sem I/O): um arquivo com
// `"use server"` só pode exportar funções assíncronas (regra do Next.js),
// e esta função precisa continuar síncrona para ser testável sem mock de
// nenhum tipo (`@/lib/actions/__tests__/meus-roteiros-label.test.ts`).
//
// `listarMeusRoteiros` (`./meus-roteiros.ts`, com `"use server"`) importa e
// usa esta função internamente — não a reexporta (reexport de função
// síncrona por um arquivo `"use server"` também violaria a regra).
//
// Cobre os 3 casos de RF-17.3 (SDD.md §8.2.7):
// 1. `concluida` → "Roteiro concluído";
// 2. `encerrada_parcial` → "Encerrada em {etapa}", etapa = última aprovada
//    (passeios, senão hospedagem, senão destino);
// 3. demais estados → "Em andamento — na etapa {etapa}", pelo prefixo do
//    `flowState` (`entrada_selecionada` conta como destino).

import type { SessionFlowState } from "@prisma/client";

/** Etapa exibível no rótulo (RF-17.3) — vocabulário fechado de 4 valores. */
export type EtapaRotulo = "destino" | "hospedagem" | "passeios" | "roteiro";

/**
 * Estados "em andamento" (nem `concluida` nem `encerrada_parcial`) mapeados
 * para a etapa correspondente, pelo prefixo do `flowState`
 * (`entrada_selecionada` conta como destino — SDD.md §8.2.7).
 */
const ETAPA_POR_FLOW_STATE: Record<
  Exclude<SessionFlowState, "concluida" | "encerrada_parcial">,
  EtapaRotulo
> = {
  entrada_selecionada: "destino",
  destino_pendente: "destino",
  destino_confirmado: "destino",
  hospedagem_pendente: "hospedagem",
  hospedagem_aprovada: "hospedagem",
  passeios_pendente: "passeios",
  passeios_aprovados: "passeios",
  roteiro_pendente: "roteiro",
  roteiro_aprovado: "roteiro",
};

/** Dados mínimos necessários para calcular o rótulo de uma sessão (RF-17.3). */
export interface RotuloDaSessaoInput {
  flowState: SessionFlowState;
  /** Existe pelo menos um `ActivityApproval` para a sessão. */
  hasActivityApproval: boolean;
  /** Existe `AccommodationApproval` para a sessão. */
  hasAccommodationApproval: boolean;
}

/**
 * Rótulo de status de uma sessão em "Meus roteiros" (RF-17.3), função pura —
 * nenhum acesso a banco/sessão aqui, só o dado já carregado por
 * `listarMeusRoteiros`.
 */
export function rotuloDaSessao(input: RotuloDaSessaoInput): string {
  const { flowState, hasActivityApproval, hasAccommodationApproval } = input;

  if (flowState === "concluida") {
    return "Roteiro concluído";
  }

  if (flowState === "encerrada_parcial") {
    const etapa: EtapaRotulo = hasActivityApproval
      ? "passeios"
      : hasAccommodationApproval
        ? "hospedagem"
        : "destino";
    return `Encerrada em ${etapa}`;
  }

  const etapa = ETAPA_POR_FLOW_STATE[flowState];
  return `Em andamento — na etapa ${etapa}`;
}
