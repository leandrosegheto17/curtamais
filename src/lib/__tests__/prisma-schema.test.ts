// @vitest-environment node
//
// Valida a FORMA do schema gerado pelo Prisma Client sem exigir conexão real
// com o banco (não instancia conexão — só inspeciona os delegates/enums
// expostos pelo client gerado a partir de prisma/schema.prisma).
//
// Critério de aceite de L1-T02: "todos os campos/enums do SDD.md Seção 5
// presentes, campos opcionais realmente nullable" — este teste cobre a parte
// estrutural (entidades, delegates, enums); os testes de integração em
// prisma/__tests__/schema.integration.test.ts cobrem persistência real e a
// nulabilidade efetiva contra o banco.
import { describe, expect, it } from "vitest";
import {
  PrismaClient,
  TripEntryPath,
  TripSessionStatus,
  DestinationSource,
  ItineraryPeriod,
  LlmStage,
  LlmGenerationStatus,
} from "@prisma/client";

describe("Prisma schema — SDD.md Seção 5 (estrutural)", () => {
  const client = new PrismaClient();

  it("expõe um delegate para cada entidade definida no SDD.md Seção 5", () => {
    expect(client.tripSession).toBeDefined();
    expect(client.destinationApproval).toBeDefined();
    expect(client.accommodationApproval).toBeDefined();
    expect(client.activityApproval).toBeDefined();
    expect(client.itineraryItem).toBeDefined();
    expect(client.llmGenerationLog).toBeDefined();
  });

  it("cada delegate expõe as operações CRUD básicas esperadas", () => {
    for (const delegate of [
      client.tripSession,
      client.destinationApproval,
      client.accommodationApproval,
      client.activityApproval,
      client.itineraryItem,
      client.llmGenerationLog,
    ]) {
      expect(typeof delegate.create).toBe("function");
      expect(typeof delegate.findUnique).toBe("function");
      expect(typeof delegate.update).toBe("function");
      expect(typeof delegate.delete).toBe("function");
    }
  });

  it("TripEntryPath cobre exatamente data_livre|feriado|quiz (RF-01/02/03)", () => {
    expect(Object.values(TripEntryPath).sort()).toEqual(
      ["data_livre", "feriado", "quiz"].sort(),
    );
  });

  it("TripSessionStatus cobre exatamente in_progress|partial|completed|abandoned", () => {
    expect(Object.values(TripSessionStatus).sort()).toEqual(
      ["in_progress", "partial", "completed", "abandoned"].sort(),
    );
  });

  it("DestinationSource cobre exatamente ia_suggested|user_provided", () => {
    expect(Object.values(DestinationSource).sort()).toEqual(
      ["ia_suggested", "user_provided"].sort(),
    );
  });

  it("ItineraryPeriod cobre exatamente manha|tarde|noite", () => {
    expect(Object.values(ItineraryPeriod).sort()).toEqual(
      ["manha", "tarde", "noite"].sort(),
    );
  });

  it("LlmStage cobre exatamente destino|hospedagem|passeios|roteiro", () => {
    expect(Object.values(LlmStage).sort()).toEqual(
      ["destino", "hospedagem", "passeios", "roteiro"].sort(),
    );
  });

  it("LlmGenerationStatus cobre exatamente success|failed_after_retry", () => {
    expect(Object.values(LlmGenerationStatus).sort()).toEqual(
      ["success", "failed_after_retry"].sort(),
    );
  });
});
