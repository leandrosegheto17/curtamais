import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StepperProgress,
  getStepperStepStatuses,
} from "@/components/design-system/stepper-progress";
import type { SessionFlowState } from "@/lib/session-flow/state-machine";

afterEach(() => cleanup());

describe("getStepperStepStatuses (mapa puro estado → progresso visual)", () => {
  it.each([
    ["entrada_selecionada", { destino: "current", hospedagem: "upcoming", passeios: "upcoming", roteiro: "upcoming" }],
    ["destino_pendente", { destino: "current", hospedagem: "upcoming", passeios: "upcoming", roteiro: "upcoming" }],
    ["destino_confirmado", { destino: "completed", hospedagem: "current", passeios: "upcoming", roteiro: "upcoming" }],
    ["hospedagem_pendente", { destino: "completed", hospedagem: "current", passeios: "upcoming", roteiro: "upcoming" }],
    ["hospedagem_aprovada", { destino: "completed", hospedagem: "completed", passeios: "current", roteiro: "upcoming" }],
    ["passeios_pendente", { destino: "completed", hospedagem: "completed", passeios: "current", roteiro: "upcoming" }],
    ["passeios_aprovados", { destino: "completed", hospedagem: "completed", passeios: "completed", roteiro: "current" }],
    ["roteiro_pendente", { destino: "completed", hospedagem: "completed", passeios: "completed", roteiro: "current" }],
    ["roteiro_aprovado", { destino: "completed", hospedagem: "completed", passeios: "completed", roteiro: "completed" }],
    ["concluida", { destino: "completed", hospedagem: "completed", passeios: "completed", roteiro: "completed" }],
  ] as const)("mapeia %s corretamente", (state, expected) => {
    expect(getStepperStepStatuses(state as SessionFlowState)).toEqual(expected);
  });

  it("encerrada_parcial sem hint não marca nenhuma etapa como concluída (dado insuficiente no estado sozinho)", () => {
    expect(getStepperStepStatuses("encerrada_parcial")).toEqual({
      destino: "upcoming",
      hospedagem: "upcoming",
      passeios: "upcoming",
      roteiro: "upcoming",
    });
  });

  it("encerrada_parcial com approvedStepsHint usa o hint explícito do chamador", () => {
    expect(
      getStepperStepStatuses("encerrada_parcial", ["destino", "hospedagem"]),
    ).toEqual({
      destino: "completed",
      hospedagem: "completed",
      passeios: "upcoming",
      roteiro: "upcoming",
    });
  });
});

describe("StepperProgress (componente de apresentação)", () => {
  it("marca a etapa atual com aria-current='step' e nenhuma outra", () => {
    render(<StepperProgress currentState="hospedagem_pendente" />);

    const currentItems = screen.getAllByText("Hospedagem", { exact: true });
    // Rótulo aparece tanto na trilha condensada (mobile) quanto na completa (desktop).
    expect(currentItems.length).toBeGreaterThan(0);

    const currentElements = document.querySelectorAll('[aria-current="step"]');
    // 2 ocorrências esperadas: uma no indicador condensado (mobile), uma na trilha completa (desktop).
    expect(currentElements.length).toBe(2);
  });

  it("renderiza o rótulo de todas as 4 etapas na trilha completa (desktop)", () => {
    render(<StepperProgress currentState="passeios_pendente" />);

    for (const label of ["Destino", "Hospedagem", "Passeios", "Roteiro"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("não possui nenhum elemento focável/interativo (stepper é só informativo, não navega por clique)", () => {
    render(<StepperProgress currentState="roteiro_pendente" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("é puramente controlado: re-renderizar com o mesmo estado produz o mesmo resultado, sem mudança sem nova prop", () => {
    const { rerender, container } = render(
      <StepperProgress currentState="destino_pendente" />,
    );
    const firstMarkup = container.innerHTML;

    rerender(<StepperProgress currentState="destino_pendente" />);
    expect(container.innerHTML).toBe(firstMarkup);

    rerender(<StepperProgress currentState="destino_confirmado" />);
    expect(container.innerHTML).not.toBe(firstMarkup);
  });

  it("comunica o status também por texto/ícone, não só por cor (rótulo textual sempre presente por etapa)", () => {
    render(<StepperProgress currentState="hospedagem_aprovada" />);
    // título (via atributo `title`) descrevendo o status de cada bolinha, além da cor.
    expect(screen.getAllByTitle("Etapa concluída").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Etapa atual").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Etapa futura").length).toBeGreaterThan(0);
  });

  it("usa approvedStepsHint para renderizar encerrada_parcial com progresso conhecido", () => {
    render(
      <StepperProgress
        currentState="encerrada_parcial"
        approvedStepsHint={["destino"]}
      />,
    );
    expect(screen.getAllByTitle("Etapa concluída").length).toBeGreaterThan(0);
  });
});
