// L6-T02 — T01 (Data livre, RF-01). Página estática que só renderiza o
// título da etapa + o formulário (`T01DateRangeForm`); nenhuma Server Action
// é chamada aqui ainda (L6-T03, dependente desta tarefa, não iniciada) — o
// `onValid` fica sem handler por enquanto, de propósito, para não simular uma
// navegação/persistência que ainda não existe (Diretriz de Implementação 3:
// nenhuma navegação client-side otimista).
import { T01DateRangeForm } from "@/components/entrada/t01-date-range-form";

export default function DataLivrePage() {
  return (
    <main className="flex min-h-screen flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold text-foreground">
        Quando você quer viajar?
      </h1>
      <T01DateRangeForm />
    </main>
  );
}
