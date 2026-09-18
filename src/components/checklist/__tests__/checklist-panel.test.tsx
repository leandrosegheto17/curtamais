import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChecklistPanel } from "@/components/checklist/checklist-panel";
import * as copy from "@/components/checklist/checklist-copy";
import { ROTULO_CATEGORIA, type ItemChecklist } from "@/lib/checklist/tipos";

afterEach(() => cleanup());

const itens: ItemChecklist[] = [
  { itemKey: "antes-1", categoria: "antes", texto: "Separar as chaves" },
  { itemKey: "doc-1", categoria: "documentos", texto: "Documento com foto" },
  { itemKey: "roupa-1", categoria: "roupas", texto: "Casaco leve" },
  { itemKey: "hig-1", categoria: "higiene", texto: "Protetor solar" },
  { itemKey: "ele-1", categoria: "eletronicos", texto: "Carregador do celular" },
  { itemKey: "cli-1", categoria: "clima", texto: "Capa de chuva" },
];

const base = { itens, marcados: new Set<string>(), onToggle: () => {} };

describe("ChecklistPanel (V2-L9-T10, UX-SPEC.md §9)", () => {
  it("renderiza 6 grupos na ordem fixa com h3", () => {
    render(<ChecklistPanel {...base} />);
    const hs = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(hs).toEqual([
      ROTULO_CATEGORIA.documentos,
      ROTULO_CATEGORIA.roupas,
      ROTULO_CATEGORIA.higiene,
      ROTULO_CATEGORIA.eletronicos,
      ROTULO_CATEGORIA.clima,
      ROTULO_CATEGORIA.antes,
    ]);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(copy.CHECKLIST_TITULO);
  });

  it("grupo vazio some", () => {
    render(<ChecklistPanel {...base} itens={itens.filter((i) => i.categoria !== "clima")} />);
    expect(screen.queryByText(ROTULO_CATEGORIA.clima)).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  });

  it("todo item é checkbox nativo com label associado e operável", () => {
    const onToggle = vi.fn();
    render(<ChecklistPanel {...base} onToggle={onToggle} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    for (const b of boxes) {
      expect(b.tagName).toBe("INPUT");
      expect((b as HTMLInputElement).labels?.length).toBe(1);
    }
    fireEvent.click(screen.getByLabelText("Casaco leve"));
    expect(onToggle).toHaveBeenCalledWith("roupa-1", true);
  });

  it("progresso textual em aria-live e marcado com check", () => {
    const { container } = render(
      <ChecklistPanel {...base} marcados={new Set(["doc-1", "hig-1"])} />,
    );
    const p = screen.getByText("2 de 6 itens separados");
    expect(p.closest("[aria-live='polite']")).not.toBeNull();
    expect(container.querySelectorAll(".checklist-check")).toHaveLength(2);
    expect((screen.getByLabelText("Documento com foto") as HTMLInputElement).checked).toBe(true);
  });

  it("aviso de clima sempre; avisos condicionais só nos casos de RF-21", () => {
    const { rerender } = render(<ChecklistPanel {...base} />);
    expect(screen.getByText(copy.CHECKLIST_AVISO_CLIMA)).toBeTruthy();
    expect(screen.queryByText(copy.CHECKLIST_AVISO_SEM_DATAS)).toBeNull();
    expect(screen.queryByText(copy.CHECKLIST_AVISO_FORA_CATALOGO)).toBeNull();
    rerender(<ChecklistPanel {...base} semDatas foraDoCatalogo />);
    expect(screen.getByText(copy.CHECKLIST_AVISO_SEM_DATAS)).toBeTruthy();
    expect(screen.getByText(copy.CHECKLIST_AVISO_FORA_CATALOGO)).toBeTruthy();
  });

  it("contexto com e sem datas", () => {
    const { rerender } = render(
      <ChecklistPanel
        {...base}
        contexto={{ destino: "Gramado", meses: "julho", duracaoDias: 5, faixa: "Viagem de 4 a 7 dias" }}
      />,
    );
    expect(screen.getByText(/Gramado · julho · 5 dias/)).toBeTruthy();
    rerender(<ChecklistPanel {...base} contexto={{ destino: "Gramado" }} />);
    expect(screen.getByText("Gramado")).toBeTruthy();
  });

  it("erro de gravação: role=alert junto ao item; pending: aria-busy", () => {
    render(<ChecklistPanel {...base} comErro={new Set(["doc-1"])} pendentes={new Set(["hig-1"])} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(copy.CHECKLIST_ERRO_GRAVACAO);
    expect(within(alert.closest("li")!).getByLabelText("Documento com foto")).toBeTruthy();
    expect(screen.getByLabelText("Protetor solar").closest("li")!.getAttribute("aria-busy")).toBe("true");
  });

  it("sem campo de item próprio nem botões; sem termos proibidos nos textos fixos", () => {
    const { container } = render(<ChecklistPanel {...base} semDatas foraDoCatalogo />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    const fixos = [
      copy.CHECKLIST_TITULO, copy.CHECKLIST_AVISO_CLIMA, copy.CHECKLIST_AVISO_SEM_DATAS,
      copy.CHECKLIST_AVISO_FORA_CATALOGO, copy.CHECKLIST_ERRO_LEITURA, copy.CHECKLIST_ERRO_GRAVACAO,
      ...Object.values(ROTULO_CATEGORIA),
    ].join(" ");
    expect(fixos).not.toMatch(/reserv|compr|visto|passaporte|vacina|sess[aã]o|ag[eê]ncia|pdf|imprim|compartilh|exportar/i);
    expect(container.querySelector("progress")!.getAttribute("aria-hidden")).toBe("true");
  });
});
