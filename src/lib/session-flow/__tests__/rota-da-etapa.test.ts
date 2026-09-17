// @vitest-environment node
//
// V2-L6-T09 — `rotaDaEtapa` (SDD.md §8.2.5). Critério de aceite: "Cobre os 7
// casos da tabela do SDD §8.2.5, incluindo os 3 estados transitórios
// `*_aprovad*` (hospedagem_aprovada, passeios_aprovados, roteiro_aprovado)."
import { describe, expect, it } from "vitest";

import { rotaDaEtapa } from "../rota-da-etapa";
import type { SessionFlowState } from "../state-machine";

const SESSION_ID = "sess-123";
const DESTINO = "Foz do Iguaçu";

describe("rotaDaEtapa — SDD.md §8.2.5", () => {
  it("caso 1: entrada_selecionada → /destino?sessionId", () => {
    expect(rotaDaEtapa("entrada_selecionada", SESSION_ID)).toBe(
      `/destino?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 1: destino_pendente → /destino?sessionId", () => {
    expect(rotaDaEtapa("destino_pendente", SESSION_ID)).toBe(
      `/destino?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 2: destino_confirmado → /destino/confirmacao?sessionId&destino&flowState", () => {
    const rota = rotaDaEtapa("destino_confirmado", SESSION_ID, DESTINO);
    expect(rota).toBe(
      `/destino/confirmacao?sessionId=${SESSION_ID}&flowState=destino_confirmado&destino=${new URLSearchParams({ destino: DESTINO }).toString().replace("destino=", "")}`,
    );
  });

  it("caso 2: destino_confirmado sem destino informado omite o parâmetro destino", () => {
    const rota = rotaDaEtapa("destino_confirmado", SESSION_ID);
    expect(rota).toBe(
      `/destino/confirmacao?sessionId=${SESSION_ID}&flowState=destino_confirmado`,
    );
  });

  it("caso 3: hospedagem_pendente → /hospedagem?sessionId", () => {
    expect(rotaDaEtapa("hospedagem_pendente", SESSION_ID)).toBe(
      `/hospedagem?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 4: passeios_pendente → /passeios?sessionId", () => {
    expect(rotaDaEtapa("passeios_pendente", SESSION_ID)).toBe(
      `/passeios?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 5: roteiro_pendente → /roteiro?sessionId", () => {
    expect(rotaDaEtapa("roteiro_pendente", SESSION_ID)).toBe(
      `/roteiro?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 6 (transitório): hospedagem_aprovada resolve como se `avancar` já tivesse ocorrido → rota de passeios_pendente", () => {
    expect(rotaDaEtapa("hospedagem_aprovada", SESSION_ID)).toBe(
      `/passeios?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 6 (transitório): passeios_aprovados resolve → rota de roteiro_pendente", () => {
    expect(rotaDaEtapa("passeios_aprovados", SESSION_ID)).toBe(
      `/roteiro?sessionId=${SESSION_ID}`,
    );
  });

  it("caso 6 (transitório): roteiro_aprovado resolve → rota terminal de concluida", () => {
    expect(rotaDaEtapa("roteiro_aprovado", SESSION_ID)).toBe(
      `/meus-roteiros/${SESSION_ID}`,
    );
  });

  it("caso 7: concluida → /meus-roteiros/{sessionId}", () => {
    expect(rotaDaEtapa("concluida", SESSION_ID)).toBe(
      `/meus-roteiros/${SESSION_ID}`,
    );
  });

  it("caso 7: encerrada_parcial → /meus-roteiros/{sessionId}", () => {
    expect(rotaDaEtapa("encerrada_parcial", SESSION_ID)).toBe(
      `/meus-roteiros/${SESSION_ID}`,
    );
  });

  it("é pura: mesma entrada sempre produz a mesma URL", () => {
    const estados: SessionFlowState[] = [
      "entrada_selecionada",
      "destino_pendente",
      "destino_confirmado",
      "hospedagem_pendente",
      "hospedagem_aprovada",
      "passeios_pendente",
      "passeios_aprovados",
      "roteiro_pendente",
      "roteiro_aprovado",
      "concluida",
      "encerrada_parcial",
    ];

    for (const estado of estados) {
      const primeira = rotaDaEtapa(estado, SESSION_ID, DESTINO);
      const segunda = rotaDaEtapa(estado, SESSION_ID, DESTINO);
      expect(primeira).toBe(segunda);
    }
  });
});
