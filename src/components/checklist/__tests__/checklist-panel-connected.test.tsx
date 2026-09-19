import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChecklistPanelConnected } from "@/components/checklist/checklist-panel-connected";
import { CHECKLIST_ERRO_GRAVACAO } from "@/components/checklist/checklist-copy";
import type { marcarItemChecklist } from "@/lib/actions/checklist";

// Função simples (não `vi.fn`): o spy guarda a promise rejeitada e o vitest a
// reporta como não tratada mesmo com o componente capturando o erro.
type Acao = typeof marcarItemChecklist;
type Resultado = Awaited<ReturnType<Acao>>;
const chamadas: Parameters<Acao>[] = [];
let impl: Acao = async () => ({ status: "indisponivel" });

vi.mock("@/lib/actions/checklist", () => ({
  marcarItemChecklist: (...a: Parameters<Acao>) => {
    chamadas.push(a);
    return impl(...a);
  },
}));

const responde = (r: Resultado) => {
  impl = async () => r;
};
const falha = (msg: string) => {
  impl = async () => {
    throw new Error(msg);
  };
};

const itens = [
  { itemKey: "doc-1", categoria: "documentos" as const, texto: "Documento com foto", marcado: false },
  { itemKey: "roupa-1", categoria: "roupas" as const, texto: "Casaco leve", marcado: false },
];

function renderizar() {
  return render(<ChecklistPanelConnected sessionId="s1" itens={itens} />);
}
const cb = (nome: string) => screen.getByRole("checkbox", { name: nome }) as HTMLInputElement;
const ocupado = (nome: string) => cb(nome).closest("li")!.getAttribute("aria-busy");

beforeEach(() => {
  chamadas.length = 0;
  impl = async () => ({ status: "indisponivel" });
});
afterEach(() => cleanup());

describe("ChecklistPanelConnected (V2-L9-T11)", () => {
  it("marca com marcado:true e atualiza o progresso na hora", async () => {
    responde({ status: "ok", itemKey: "doc-1", marcado: true });
    renderizar();
    fireEvent.click(cb("Documento com foto"));
    expect(screen.getByText("1 de 2 itens separados")).toBeTruthy();
    expect(chamadas[0]).toEqual(["s1", "doc-1", true]);
    await waitFor(() => expect(ocupado("Documento com foto")).toBeNull());
    expect(cb("Documento com foto").checked).toBe(true);
  });

  it("mostra aria-busy enquanto grava", async () => {
    let fim!: (r: Resultado) => void;
    impl = () => new Promise<Resultado>((r) => (fim = r));
    renderizar();
    fireEvent.click(cb("Casaco leve"));
    expect(ocupado("Casaco leve")).toBe("true");
    fim({ status: "ok", itemKey: "roupa-1", marcado: true });
    await waitFor(() => expect(ocupado("Casaco leve")).toBeNull());
  });

  it.each([
    ["rejeição", () => falha("rede")],
    ["conta_necessaria", () => responde({ status: "conta_necessaria", sessionId: "s1" })],
    ["item_invalido", () => responde({ status: "item_invalido" })],
  ])("falha (%s) reverte, alerta e o resto segue utilizável", async (_n, prepara) => {
    prepara();
    renderizar();
    fireEvent.click(cb("Documento com foto"));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe(CHECKLIST_ERRO_GRAVACAO);
    expect(cb("Documento com foto").checked).toBe(false);
    expect(screen.getByText("0 de 2 itens separados")).toBeTruthy();
    expect(cb("Casaco leve").disabled).toBe(false);
  });

  it("foco permanece no checkbox", async () => {
    falha("x");
    renderizar();
    const c = cb("Documento com foto");
    c.focus();
    fireEvent.click(c);
    await screen.findByRole("alert");
    expect(document.activeElement).toBe(cb("Documento com foto"));
  });

  it("duplo clique: vale o último desejado, sem estado inconsistente", async () => {
    responde({ status: "ok", itemKey: "doc-1", marcado: true });
    renderizar();
    fireEvent.click(cb("Documento com foto"));
    fireEvent.click(cb("Documento com foto"));
    expect(chamadas.map((c) => c[2])).toEqual([true, false]);
    await waitFor(() => expect(ocupado("Documento com foto")).toBeNull());
    expect(cb("Documento com foto").checked).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
