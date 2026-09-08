import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">CurtaMais</h1>
      <p className="text-muted-foreground max-w-md">
        Planejador de viagens com decisão guiada por IA. Scaffold do projeto
        (Lote 1 — Fundação de Infraestrutura).
      </p>
      <Button>Começar a planejar</Button>
    </main>
  );
}
