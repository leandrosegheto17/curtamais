// V2-L4-T01 — `HeroSection` (RF-12.1 item 1, RF-12.2, RF-15.5, RNF-09;
// UX-SPEC.md §8.2 T-HOME item 1, §8.3, §8.6; ADR-011).
//
// Server Component puro (sem "use client"): a única peça de cliente aqui é
// `DestinationImage` (V2-L2-T03), que já tem sua própria diretiva. Nenhuma
// chamada ao Gateway de IA/stage-rules/Prisma — o destino do hero vem só do
// catálogo estático (`CATALOGO_DESTINOS`, V2-L2-T01), reaproveitando
// `DestinationImage` para a imagem em vez de duplicar a lógica de
// curada/fallback (instrução da tarefa).
//
// A invariante "exatamente 1 destino com `hero: true`" já é garantida por
// teste em `src/lib/catalogo/__tests__/destinos.test.ts` (V2-L2-T01) — por
// isso o `find` abaixo não precisa de um estado de erro de UI para "nenhum
// hero encontrado": um `throw` na renderização (tempo de build, página
// estática) é o comportamento certo caso a invariante seja violada no
// futuro, para o build falhar alto e cedo em vez de mostrar hero vazio.
import Link from "next/link";

import { CATALOGO_DESTINOS, rotuloFonteImagem } from "@/lib/catalogo/destinos";
import { gerarFallback, type ImagemResolvida } from "@/lib/catalogo/resolver-imagem";
import { DestinationImage } from "@/components/catalogo/destination-image";
import { Button } from "@/components/ui/button";

function resolverImagemDoHero(): ImagemResolvida {
  const destinoHero = CATALOGO_DESTINOS.find((destino) => destino.hero === true);
  if (!destinoHero) {
    throw new Error(
      "HeroSection: nenhum destino do catálogo tem `hero: true` (invariante de src/lib/catalogo/destinos.ts).",
    );
  }
  if (destinoHero.imagem !== null) {
    return { tipo: "curada", destino: destinoHero, imagem: destinoHero.imagem };
  }
  return gerarFallback(destinoHero.nome);
}

/**
 * Hero em tela cheia da home (UX-SPEC.md §8.2 T-HOME item 1): imagem do
 * destino `hero` do catálogo, overlay AA (RNF-09) e, alinhado à esquerda
 * embaixo, eyebrow + título display + subtítulo + dois CTAs + nota de
 * confiabilidade (RF-12.2). Crédito da foto no canto inferior direito, só
 * quando a imagem é curada (RF-15.5) — o fallback de gradiente não tem
 * autor/fonte para creditar.
 */
export function HeroSection() {
  const imagemHero = resolverImagemDoHero();

  return (
    <section
      aria-label="Destino em destaque"
      className="relative flex min-h-[78svh] w-full flex-col justify-end overflow-hidden md:h-[min(80vh,760px)] md:min-h-0"
    >
      <div className="absolute inset-0" aria-hidden="true">
        <DestinationImage imagem={imagemHero} alt="" sizes="100vw" priority />
      </div>

      {/* UX-SPEC.md §8.3 "Regra do overlay": scrim + camada uniforme extra
          para a legibilidade do eyebrow, ambas com AA garantido independente
          da foto. */}
      <div className="overlay-scrim-hero pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-6 pb-12 pt-16 md:max-w-[58%] md:px-8 md:pb-16">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground">
          Seu consultor de roteiros, com IA
        </p>
        <h1 className="font-serif text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.05] text-foreground">
          Diga quando pode viajar.{" "}
          <em className="text-accent not-italic">Eu monto o roteiro com você.</em>
        </h1>
        <p className="max-w-xl text-base text-foreground">
          Destino, hospedagem, passeios e roteiro — uma etapa de cada vez, e
          nada avança sem o seu ok.
        </p>

        <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="h-11 min-h-11 w-full sm:w-auto">
            <Link href="#caminhos">Montar minha viagem</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-11 min-h-11 w-full border-foreground/70 bg-transparent text-foreground hover:bg-foreground/10 hover:text-foreground sm:w-auto"
          >
            <Link href="/roteiro-exemplo">Ver roteiro de exemplo</Link>
          </Button>
        </div>

        <p className="pt-1 text-sm text-foreground">
          Eu monto o plano; a reserva você faz onde preferir.
        </p>
      </div>

      {imagemHero.tipo === "curada" && (
        <p className="relative z-10 self-end px-4 pb-2 text-right text-[0.8125rem] text-foreground md:px-8">
          Foto:{" "}
          <a
            href={imagemHero.imagem.autorUrl}
            className="underline underline-offset-2 hover:no-underline"
          >
            {imagemHero.imagem.autor}
          </a>{" "}
          /{" "}
          <a
            href={imagemHero.imagem.fonteUrl}
            className="underline underline-offset-2 hover:no-underline"
          >
            {rotuloFonteImagem(imagemHero.imagem)}
          </a>
        </p>
      )}
    </section>
  );
}
