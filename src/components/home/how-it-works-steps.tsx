// V2-L4-T03 — `HowItWorksSteps` (UX-SPEC.md §8.2 T-HOME, item 3 "Como
// funciona"): lista ordenada de 4 passos, com número em fonte display,
// dentro de um `SectionBand` (V2-L4-T01) com `tone="default"` — só "Três
// jeitos de começar" (T02) e "Próximos feriados" (T06b) usam `tone="deep"`
// (comentário de `section-band.tsx`).
//
// Esta tarefa cria só o componente, standalone, sem integrá-lo a
// `src/app/page.tsx` (mesmo padrão de V2-L4-T01/T09 — a integração de todas
// as seções é um passo posterior, para evitar conflito de escrita entre
// instâncias paralelas do Executor no mesmo arquivo, ver BLOCKERS.md
// Bloqueio 011).
import { SectionBand } from "@/components/home/section-band";

interface HowItWorksStep {
  titulo: string;
  descricao: string;
}

// Textos exatos do UX-SPEC.md §8.2 item 3, na ordem
// destino → hospedagem → passeios → roteiro.
const STEPS: HowItWorksStep[] = [
  {
    titulo: "Destino",
    descricao:
      "Separo de 2 a 4 destinos e digo por que cada um combina com o seu período.",
  },
  {
    titulo: "Hospedagem",
    descricao: "Três opções, cada uma com o que ela tem de diferente.",
  },
  {
    titulo: "Passeios",
    descricao:
      "Você tira o que não quiser; sempre incluo ao menos uma opção gratuita quando existe.",
  },
  {
    titulo: "Roteiro",
    descricao:
      "Dia a dia, manhã, tarde e noite, com o porquê de cada horário.",
  },
];

/**
 * Seção "Como funciona" da home vitrine (UX-SPEC.md §8.2 item 3): título
 * "Uma etapa de cada vez. Nada avança sem o seu ok." e os 4 passos do
 * fluxo guiado por IA.
 */
export function HowItWorksSteps() {
  return (
    <SectionBand title="Uma etapa de cada vez. Nada avança sem o seu ok.">
      <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.titulo} className="flex flex-col gap-2">
            <span
              aria-hidden="true"
              className="font-serif text-[clamp(2rem,4vw,2.5rem)] leading-none text-accent"
            >
              {index + 1}
            </span>
            <span className="text-lg font-semibold text-foreground">
              {step.titulo}
            </span>
            <span className="text-base text-foreground-muted">
              {step.descricao}
            </span>
          </li>
        ))}
      </ol>
    </SectionBand>
  );
}
