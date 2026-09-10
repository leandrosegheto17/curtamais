import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HolidayListItem } from "@/components/design-system/holiday-list-item";

afterEach(() => cleanup());

describe("HolidayListItem", () => {
  it("renderiza nome do feriado e a emenda já formatada (label)", () => {
    render(
      <HolidayListItem
        id="feriado-1"
        groupName="feriado-escolhido"
        name="Corpus Christi"
        label="Qui 12/06 → estende até Dom 15/06, 4 dias"
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Corpus Christi")).toHaveClass("font-serif");
    expect(
      screen.getByText("Qui 12/06 → estende até Dom 15/06, 4 dias"),
    ).toBeInTheDocument();
  });

  it("é selecionável por teclado (radio nativo) e chama onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <HolidayListItem
        id="feriado-1"
        groupName="feriado-escolhido"
        name="Corpus Christi"
        label="Qui 12/06 → estende até Dom 15/06, 4 dias"
        selected={false}
        onSelect={onSelect}
      />,
    );

    const radio = screen.getByRole("radio", { name: /Corpus Christi/ });
    await user.tab();
    expect(radio).toHaveFocus();

    await user.click(radio);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("reflete `selected` no estado `checked` do radio, sem depender só de cor", () => {
    render(
      <HolidayListItem
        id="feriado-1"
        groupName="feriado-escolhido"
        name="Corpus Christi"
        label="sem emenda"
        selected
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: /Corpus Christi/ })).toBeChecked();
  });

  it("nunca formata a emenda por conta própria — só exibe o texto recebido em `label`", () => {
    render(
      <HolidayListItem
        id="feriado-1"
        groupName="feriado-escolhido"
        name="Tiradentes"
        label="Ter 21/04, sem emenda (1 dia)"
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByText("Ter 21/04, sem emenda (1 dia)"),
    ).toBeInTheDocument();
  });
});
