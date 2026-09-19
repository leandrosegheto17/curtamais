// V2-L4-T04 — `ShowcaseSection` (8 `ShowcaseCard`) + `ImageCreditsSection`
// (RF-12.1 item 4, RF-12.3, RF-15.5/15.6/15.8; UX-SPEC.md §8.2 T-HOME item 4,
// §8.3 "N ShowcaseCard"/"N ImageCreditsSection", §8.5, §8.6).
//
// Server Component puro (sem "use client"): a única peça de cliente é
// `DestinationImage` (V2-L2-T03), reaproveitada aqui em vez de duplicar a
// lógica de curada/fallback — mesmo padrão de `HeroSection` (V2-L4-T01).
//
// Fonte dos 8 destinos: `CATALOGO_DESTINOS` filtrado por `vitrine !== null` e
// ordenado por esse campo (V2-L2-T01 já documenta que esse é exatamente o
// campo que marca a ordem 1..8 da vitrine — não precisamos inventar um
// critério de "primeiros 8 do catálogo", o catálogo já modela isso
// explicitamente).
//
// Decisões de detalhe do Executor (pequenas, documentadas para o Coordenador
// revisar se a intenção era outra):
// 1. O botão "i" de crédito (UX-SPEC.md §8.3) só aparece quando a imagem do
//    card é curada (`tipo: "curada"`) — sem foto curada não há autor/fonte
//    para creditar, mesmo padrão já usado por `HeroSection` (credito só
//    aparece "quando a imagem é curada"). Hoje nenhum destino do catálogo
//    tem `imagem` preenchida (ADR-010: `null` é um estado válido), então o
//    botão simplesmente não aparece ainda em nenhum card — isso é esperado,
//    não um bug.
// 2. `ImageCreditsSection` recebe a lista de destinos a creditar via prop
//    (default: os 8 da vitrine, escopo desta tarefa) em vez de importar o
//    catálogo inteiro sozinha, porque a lista final do rodapé (hero +
//    vitrine) só existe quando `SiteFooter` (V2-L4-T07, em paralelo) compuser
//    a página — a integração final na página é um passo posterior (mesma
//    decisão já tomada por V2-L4-T01/T09, para evitar conflito de escrita
//    entre instâncias paralelas do Executor no mesmo arquivo). Quando não há
//    nenhuma imagem curada entre os destinos recebidos, a seção não renderiza
//    nada (mesmo espírito de "a seção some" já usado por
//    `UpcomingHolidaysSection`/T06b quando não há conteúdo para mostrar).
import Link from "next/link";

import {
  CATALOGO_DESTINOS,
  rotuloFonteImagem,
  type DestinoCatalogo,
} from "@/lib/catalogo/destinos";
import { resolverImagemDestino, type ImagemResolvida } from "@/lib/catalogo/resolver-imagem";
import { DestinationImage } from "@/components/catalogo/destination-image";
import { SectionBand } from "@/components/home/section-band";
import { cn } from "@/lib/utils";

/** Os 8 destinos da vitrine, na ordem do campo `vitrine` (1..8) do catálogo. */
export const DESTINOS_VITRINE: DestinoCatalogo[] = CATALOGO_DESTINOS.filter(
  (destino): destino is DestinoCatalogo & { vitrine: number } => destino.vitrine !== null,
).sort((a, b) => a.vitrine - b.vitrine);

function resolverImagemDoDestino(destino: DestinoCatalogo): ImagemResolvida {
  return resolverImagemDestino(destino.nome);
}

interface ShowcaseCardProps {
  destino: DestinoCatalogo;
}

/**
 * Card individual da vitrine (UX-SPEC.md §8.3 "N ShowcaseCard"): imagem 3:2
 * decorativa, overlay-scrim, eyebrow "UF · Região" e nome em h3, tudo dentro
 * de um único `<a>` acessível. O botão "i" de crédito fica FORA do `<a>`
 * principal (não aninha interativos) e só aparece com imagem curada.
 */
function ShowcaseCard({ destino }: ShowcaseCardProps) {
  const imagem = resolverImagemDoDestino(destino);
  const href = `/entrada/data-livre?destino=${destino.slug}`;

  return (
    <li className="w-[82%] flex-none snap-start scroll-ml-6 md:w-auto md:flex-auto">
      <div className="group relative overflow-hidden rounded-[var(--radius)] border border-border">
        <Link
          href={href}
          aria-label={`Planejar viagem para ${destino.nome}`}
          className="focus-visible:ring-ring block outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:border-accent"
        >
          <div className="relative aspect-[3/2] w-full">
            <DestinationImage
              imagem={imagem}
              alt=""
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 82vw"
              className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]"
            />
            <div className="overlay-scrim pointer-events-none absolute inset-0" aria-hidden="true" />

            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-foreground">
                {destino.uf} · {destino.rotuloRegiao}
              </p>
              <h3 className="font-serif text-2xl leading-tight text-foreground md:text-[1.75rem]">
                {destino.nome}
              </h3>
            </div>
          </div>
        </Link>

        {imagem.tipo === "curada" && (
          <a
            href="#creditos"
            aria-label={`Crédito da imagem de ${destino.nome}`}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised/80 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span aria-hidden="true">i</span>
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Vitrine de 8 destinos (UX-SPEC.md §8.2 T-HOME item 4, RF-12.1 item 4): sem
 * preço nem temporada nos cards (RF-12.3 só exige a nota quando há preço,
 * decisão já registrada em UX-SPEC.md §8.7). No mobile, rolagem horizontal
 * com `scroll-snap` (§8.6); a partir de `md`, grade (2 colunas entre `md` e
 * `lg`, 4 colunas em `lg`).
 */
export function ShowcaseSection() {
  return (
    <SectionBand title="Comece por um lugar. Eu cuido das outras etapas.">
      <ul
        aria-label="Destinos para começar"
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2",
          "md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-4",
        )}
      >
        {DESTINOS_VITRINE.map((destino) => (
          <ShowcaseCard key={destino.slug} destino={destino} />
        ))}
      </ul>
    </SectionBand>
  );
}

export interface ImageCreditsSectionProps {
  /**
   * Destinos cujas imagens (quando curadas) recebem crédito nesta lista.
   * Default: os 8 da vitrine (escopo desta tarefa). Quem compuser a página
   * final (ex.: `SiteFooter`, V2-L4-T07) pode passar uma lista maior
   * (incluindo o destino `hero`) se quiser um único rodapé de créditos.
   */
  destinos?: DestinoCatalogo[];
}

/**
 * Lista de créditos de imagem no rodapé (UX-SPEC.md §8.3 "N
 * ImageCreditsSection", RF-15.5): "Foto de {autor} no {Unsplash|Pexels}" com
 * links, `id="creditos"` (alvo do botão "i" de cada `ShowcaseCard`). Não
 * renderiza nada quando nenhum destino recebido tem imagem curada — mesmo
 * espírito de "a seção some" já usado por outras seções da home sem
 * conteúdo (ex.: `UpcomingHolidaysSection`).
 */
export function ImageCreditsSection({ destinos = DESTINOS_VITRINE }: ImageCreditsSectionProps) {
  const creditos = destinos
    .map((destino) => ({ destino, imagem: resolverImagemDoDestino(destino) }))
    .filter(
      (
        item,
      ): item is { destino: DestinoCatalogo; imagem: Extract<ImagemResolvida, { tipo: "curada" }> } =>
        item.imagem.tipo === "curada",
    );

  if (creditos.length === 0) return null;

  return (
    <section id="creditos" aria-label="Créditos das imagens">
      <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-foreground-muted">
        Créditos das fotos
      </h2>
      <ul className="mt-2 flex flex-col gap-1">
        {creditos.map(({ destino, imagem }) => (
          <li key={destino.slug} className="text-[0.8125rem] text-foreground-muted">
            Foto de{" "}
            <a
              href={imagem.imagem.autorUrl}
              className="underline underline-offset-2 hover:no-underline"
            >
              {imagem.imagem.autor}
            </a>{" "}
            no{" "}
            <a
              href={imagem.imagem.fonteUrl}
              className="underline underline-offset-2 hover:no-underline"
            >
              {rotuloFonteImagem(imagem.imagem)}
            </a>{" "}
            ({destino.nome})
          </li>
        ))}
      </ul>
      {creditos.some(({ imagem }) => imagem.imagem.fonte === "wikimedia") && (
        <p className="mt-2 text-[0.8125rem] text-foreground-muted">
          Fotos do Wikimedia Commons redimensionadas para exibição; cada uma
          segue a licença indicada.
        </p>
      )}
    </section>
  );
}
