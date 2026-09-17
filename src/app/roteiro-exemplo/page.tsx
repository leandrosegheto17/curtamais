// V2-L3-T02 — Rota T-EX (Roteiro de exemplo, RF-14, UX-SPEC.md §8.2 T-EX,
// ADR-011). Server Component estático — conteúdo "congelado, garantido em
// build" (ADR-011), sem chamada a `gateway-ia`/Prisma (ver lint de
// `V2-L4-T01`, `.md/TASK.md`, "Refatoração Lote-V2-L4"): tudo vem de
// `roteiroExemplo` (`@/content/roteiro-exemplo`, V2-L3-T01).
//
// Resumo em "3 linhas" (UX-SPEC §8.2 T-EX): destino, hospedagem de exemplo e
// passeios — como o fixture carrega os passeios como lista (`activities`,
// cada um com sua própria faixa de preço, ao contrário de destino/hospedagem
// que são um valor único), cada passeio vira sua própria linha dentro da
// seção "Passeios" em vez de uma única linha agregada — mesmo padrão de
// lista + `PriceRangeBadge` por item já usado em outras telas do produto.
import Link from "next/link";

import { roteiroExemplo } from "@/content/roteiro-exemplo";
import { resolverImagemDestino } from "@/lib/catalogo/resolver-imagem";
import { DestinationImage } from "@/components/catalogo/destination-image";
import { ExampleBadge } from "@/components/design-system/example-badge";
import { PriceRangeBadge } from "@/components/design-system/price-range-badge";
import { ItineraryDayBlock } from "@/components/design-system/itinerary-day-block";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Roteiro de exemplo — Gramado em 3 dias",
};

export default function RoteiroExemploPage() {
  const roteiro = roteiroExemplo;
  const imagem = resolverImagemDestino(roteiro.destination.value);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4">
        <ExampleBadge />

        <h1 className="font-serif text-3xl text-foreground">{roteiro.title}</h1>

        <p className="text-base text-foreground-muted">{roteiro.intro}</p>

        <div className="relative aspect-video overflow-hidden rounded-lg md:aspect-[21/9]">
          <DestinationImage
            imagem={imagem}
            alt={`Imagem ilustrativa de ${roteiro.destination.value}`}
            showIllustrativeTag
            sizes="(min-width: 768px) 768px, 100vw"
          />
        </div>
      </div>

      <section aria-label="Resumo do roteiro" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4">
          <span className="text-foreground">{roteiro.destination.value}</span>
          <PriceRangeBadge
            min={roteiro.destination.priceRangeMin}
            max={roteiro.destination.priceRangeMax}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4">
          <span className="text-foreground">{roteiro.accommodation.value}</span>
          <PriceRangeBadge
            min={roteiro.accommodation.priceRangeMin}
            max={roteiro.accommodation.priceRangeMax}
            unitLabel={roteiro.accommodation.unitLabel}
          />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-muted">
            Passeios
          </h2>
          {roteiro.activities.map((atividade) => (
            <div
              key={atividade.value}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-foreground">{atividade.value}</span>
              <PriceRangeBadge
                min={atividade.priceRangeMin}
                max={atividade.priceRangeMax}
                free={atividade.free}
              />
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Dias do roteiro" className="flex flex-col gap-4">
        {roteiro.days.map((dia, index) => (
          <ItineraryDayBlock
            key={dia.dayLabel}
            date={`roteiro-exemplo-dia-${index}`}
            dayLabel={dia.dayLabel}
            morning={dia.morning}
            afternoon={dia.afternoon}
            evening={dia.evening}
            readOnly
          />
        ))}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={`/entrada/data-livre?destino=${roteiro.slug}`}>
            Planejar minha viagem para Gramado
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/#caminhos">Ver os três jeitos de começar</Link>
        </Button>
      </div>
    </main>
  );
}
