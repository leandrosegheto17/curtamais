// V2-L8-T01 — Testes unitários (sem banco) de `rotuloDaSessao` (RF-17.3):
// cobre os 3 casos exatos descritos em `SDD.md` §8.2.7.
import { describe, expect, it } from "vitest";
import { rotuloDaSessao } from "@/lib/actions/meus-roteiros-label";

describe("rotuloDaSessao (RF-17.3)", () => {
  it("caso 1 — concluida: 'Roteiro concluído', independente de aprovações", () => {
    expect(
      rotuloDaSessao({
        flowState: "concluida",
        hasActivityApproval: true,
        hasAccommodationApproval: true,
      }),
    ).toBe("Roteiro concluído");

    expect(
      rotuloDaSessao({
        flowState: "concluida",
        hasActivityApproval: false,
        hasAccommodationApproval: false,
      }),
    ).toBe("Roteiro concluído");
  });

  describe("caso 2 — encerrada_parcial: 'Encerrada em {etapa}', etapa = última aprovada", () => {
    it("com ActivityApproval: 'Encerrada em passeios'", () => {
      expect(
        rotuloDaSessao({
          flowState: "encerrada_parcial",
          hasActivityApproval: true,
          hasAccommodationApproval: true,
        }),
      ).toBe("Encerrada em passeios");
    });

    it("sem ActivityApproval, com AccommodationApproval: 'Encerrada em hospedagem'", () => {
      expect(
        rotuloDaSessao({
          flowState: "encerrada_parcial",
          hasActivityApproval: false,
          hasAccommodationApproval: true,
        }),
      ).toBe("Encerrada em hospedagem");
    });

    it("sem nenhuma aprovação: 'Encerrada em destino'", () => {
      expect(
        rotuloDaSessao({
          flowState: "encerrada_parcial",
          hasActivityApproval: false,
          hasAccommodationApproval: false,
        }),
      ).toBe("Encerrada em destino");
    });
  });

  describe("caso 3 — demais estados: 'Em andamento — na etapa {etapa}', pelo prefixo do flowState", () => {
    it("entrada_selecionada conta como destino", () => {
      expect(
        rotuloDaSessao({
          flowState: "entrada_selecionada",
          hasActivityApproval: false,
          hasAccommodationApproval: false,
        }),
      ).toBe("Em andamento — na etapa destino");
    });

    it.each([
      ["destino_pendente", "destino"],
      ["destino_confirmado", "destino"],
      ["hospedagem_pendente", "hospedagem"],
      ["hospedagem_aprovada", "hospedagem"],
      ["passeios_pendente", "passeios"],
      ["passeios_aprovados", "passeios"],
      ["roteiro_pendente", "roteiro"],
      ["roteiro_aprovado", "roteiro"],
    ] as const)("%s → etapa %s", (flowState, etapa) => {
      expect(
        rotuloDaSessao({
          flowState,
          hasActivityApproval: false,
          hasAccommodationApproval: false,
        }),
      ).toBe(`Em andamento — na etapa ${etapa}`);
    });

    it("estado 'em andamento' ignora aprovações ao calcular a etapa (usa só o flowState)", () => {
      expect(
        rotuloDaSessao({
          flowState: "hospedagem_pendente",
          hasActivityApproval: true,
          hasAccommodationApproval: true,
        }),
      ).toBe("Em andamento — na etapa hospedagem");
    });
  });
});
