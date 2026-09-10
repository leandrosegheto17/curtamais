// Shell de fallback offline (L5-T05, ADR-001/RNF-04).
//
// Página 100% estática, sem chamada a Server Action, banco de dados ou
// Gateway de IA — é o que o Service Worker (`public/sw.js`) exibe quando uma
// navegação falha por falta de rede e não há uma versão em cache da rota
// pedida. Não tenta simular geração de conteúdo via IA offline (isso nunca
// funciona sem rede, por decisão explícita desta tarefa).
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Você está offline</h1>
      <p className="max-w-md text-muted-foreground">
        Não foi possível carregar esta página sem conexão. O CurtaMais precisa
        de internet para gerar sugestões de viagem com IA. Verifique sua
        conexão e tente novamente.
      </p>
    </main>
  );
}
