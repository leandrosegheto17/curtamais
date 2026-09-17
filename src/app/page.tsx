// V2-L4-T01 — Home vitrine estática (RF-12, RF-18; ADR-011; UX-SPEC.md §8.2
// T-HOME).
//
// Server Component estático (ADR-011 "Decisão" item 1): `revalidate = 3600`,
// nenhuma leitura de `cookies()`/`headers()`/`getServerSession` aqui. O
// cookie anônimo continua sendo emitido pelo `middleware.ts`, fora desta
// página, então o cache não é afetado.
//
// RL-V2-L4-T01 (integração final, `.md/TASK.md` "Refatoração Lote-V2-L4"):
// compõe aqui, na ordem exata do UX-SPEC.md §8.2 T-HOME, as 9 seções que as
// tarefas V2-L4-T02 a T09 implementaram standalone (Bloqueio 011 evitou
// edição concorrente deste arquivo por instâncias paralelas do Executor).
// `ExamplePreviewSection` (V2-L4-T05) fica de fora — segue `Bloqueada` pelo
// Bloqueio 010 (revisão editorial de `src/content/roteiro-exemplo.ts`
// pendente) — e entra nesta mesma integração quando destravar.
// `ImageCreditsSection` (de `ShowcaseSection`, V2-L4-T04) é passada como o
// slot `imageCredits` de `SiteFooter` (V2-L4-T07): um único rodapé de
// créditos para as imagens curadas da vitrine.
//
// Cabeçalho (UX-SPEC.md §8.2 T-HOME: "logotipo 'Destino Ideal' (link para /) à
// esquerda e AccountNav à direita"): montado diretamente aqui, só para esta
// página — `AccountNav` (V2-L4-T09) documenta explicitamente que é esta
// tarefa que o consome pela primeira vez. Levar esse cabeçalho para
// `RootLayout` (todas as páginas do produto, não só a home) não é um
// critério de aceite desta tarefa nem de nenhuma outra do TASK.md ainda —
// fica fora de escopo aqui para não alterar o layout de telas do MVP sem uma
// tarefa/ADR que decida isso.
//
// Fica em fluxo normal (fundo `background` sólido), acima do hero — não
// sobreposto/`absolute` sobre a foto: a verificação de contraste AA de
// `overlay-scrim-hero` (RNF-09) cobre só a faixa inferior onde o texto do
// hero fica (opacidade do scrim >= 0,60); o topo da imagem, onde um
// cabeçalho sobreposto ficaria, não tem essa garantia para qualquer foto.
import Link from "next/link";

import { HeroSection } from "@/components/home/hero-section";
import { AccountNav } from "@/components/home/account-nav";
import { EntryPathsSection } from "@/components/home/entry-paths-section";
import { HowItWorksSteps } from "@/components/home/how-it-works-steps";
import { ShowcaseSection, ImageCreditsSection } from "@/components/home/showcase-section";
import { UpcomingHolidaysSection } from "@/components/home/upcoming-holidays-section";
import { FaqSection } from "@/components/home/faq-section";
import { SiteFooter } from "@/components/home/site-footer";
import { MobileStickyCta } from "@/components/home/mobile-sticky-cta";

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <header className="relative z-20 flex items-center justify-between border-b border-border bg-background px-6 py-4 md:px-8">
        <Link href="/" className="font-serif text-lg text-foreground">
          Destino Ideal
        </Link>
        <AccountNav />
      </header>
      <main>
        <HeroSection />
        <EntryPathsSection />
        <HowItWorksSteps />
        <ShowcaseSection />
        <UpcomingHolidaysSection />
        <FaqSection />
        <SiteFooter imageCredits={<ImageCreditsSection />} />
      </main>
      <MobileStickyCta />
    </>
  );
}
