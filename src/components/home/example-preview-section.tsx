// V2-L4-T05 — `ExamplePreviewSection` (UX-SPEC.md §8.2 T-HOME, item 5 "O que
// você recebe"): prévia do Dia 1 do roteiro de exemplo (Gramado), dentro de
// um `SectionBand` (`tone="default"`, mesmo padrão de `HowItWorksSteps`/
// `ShowcaseSection`).
//
// Reaproveita `roteiroExemplo` (`@/content/roteiro-exemplo`, V2-L3-T01 — o
// mesmo arquivo usado por T-EX/`V2-L3-T02`) e `ItineraryDayBlock` em modo
// leitura (mesmo componente/mesma prop `readOnly` que T-EX já usa) — nenhuma
// duplicação de lógica de apresentação do dia. Server Component estático,
// sem chamada a `gateway-ia`/`stage-rules`/Prisma (ADR-011 item 5, mesmo
// princípio já aplicado em `RoteiroExemploPage`/T-EX).
import Link from "next/link";

import { roteiroExemplo } from "@/content/roteiro-exemplo";
import { SectionBand } from "@/components/home/section-band";
import { ExampleBadge } from "@/components/design-system/example-badge";
import { ItineraryDayBlock } from "@/components/design-system/itinerary-day-block";
import { Button } from "@/components/ui/button";

/**
 * Seção "O que você recebe" da home vitrine (UX-SPEC.md §8.2 item 5):
 * título "Um roteiro pronto, com hora e motivo.", prévia do Dia 1 do roteiro
 * de exemplo (`ExampleBadge` + `ItineraryDayBlock` só de leitura), a nota
 * fixa de faixa aproximada (RF-12.3) e o CTA para T-EX.
 */
export function ExamplePreviewSection() {
  const dia1 = roteiroExemplo.days[0];

  return (
    <SectionBand title="Um roteiro pronto, com hora e motivo.">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex flex-col gap-4 lg:w-5/12">
          <ExampleBadge />
          <p className="text-base text-foreground-muted">
            Cada dia vem com manhã, tarde e noite, e o porquê de cada
            horário — como neste dia de exemplo, em Gramado.
          </p>
          <p className="text-sm text-foreground-muted">
            Os preços que eu sugiro são faixas aproximadas, não cotações.
          </p>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/roteiro-exemplo">Ver o roteiro de exemplo completo</Link>
          </Button>
        </div>

        <div className="lg:w-7/12">
          <ItineraryDayBlock
            date="exemplo-home-dia-1"
            dayLabel={dia1.dayLabel}
            morning={dia1.morning}
            afternoon={dia1.afternoon}
            evening={dia1.evening}
            readOnly
          />
        </div>
      </div>
    </SectionBand>
  );
}
