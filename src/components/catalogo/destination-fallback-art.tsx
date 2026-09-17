// V2-L2-T03 — `DestinationFallbackArt` (RF-15.2/15.3, UX-SPEC.md §8.3, ADR-010 §3).
//
// Componente de apresentação "burro": recebe o gradiente e a inicial já
// resolvidos por `resolverImagemDestino` (`src/lib/catalogo/resolver-imagem.ts`,
// tarefa V2-L2-T02, paralela a esta) e só desenha o retângulo de gradiente +
// inicial, sem CLS: ocupa 100% de largura/altura do contêiner do chamador (o
// mesmo contêiner usado para a imagem curada em `DestinationImage`), nunca
// define sua própria altura fixa.
//
// Os nomes de prop (`corInicio`/`corFim`/`anguloGraus`/`inicial`) espelham de
// propósito o formato do branch `{ tipo: "fallback", ... }` de
// `ImagemResolvida` (`resolver-imagem.ts`), para o chamador poder fazer
// spread direto do resultado de `resolverImagemDestino` sem remapear campos.
import { cn } from "@/lib/utils";

export interface DestinationFallbackArtProps {
  /** Cor inicial do gradiente (ADR-010 §3: par da `PALETA_FALLBACK` de `resolver-imagem.ts`). */
  corInicio: string;
  /** Cor final do gradiente. */
  corFim: string;
  /** Ângulo do gradiente em graus (um dos 4 ângulos fixos de `ANGULOS_FALLBACK`). */
  anguloGraus: number;
  /** Inicial do nome original do destino (acento preservado), em maiúscula. */
  inicial: string;
  /**
   * Quando informativa (ex.: T04, T-EX — RF-15.6), o rótulo de acessibilidade
   * completo, ex. "Imagem ilustrativa de Gramado". Quando ausente/omitido, o
   * elemento é tratado como decorativo (`aria-hidden`), porque o nome do
   * destino já está no texto ao lado (ex.: vitrine, UX-SPEC.md §8.3).
   */
  ariaLabel?: string;
  className?: string;
}

/**
 * `div` com gradiente da paleta de fallback + inicial em Cormorant (UX-SPEC.md
 * §8.3): "inicial em Cormorant (cerca de 40% da altura), cor `foreground` a
 * 85%". Preenche 100% do contêiner do chamador (sem altura própria) para não
 * causar CLS ao trocar com a imagem curada em `DestinationImage` (RF-15.9).
 */
export function DestinationFallbackArt({
  corInicio,
  corFim,
  anguloGraus,
  inicial,
  ariaLabel,
  className,
}: DestinationFallbackArtProps) {
  const decorative = !ariaLabel;

  return (
    <div
      data-testid="destination-fallback-art"
      className={cn("flex h-full w-full items-center justify-center overflow-hidden", className)}
      style={{
        background: `linear-gradient(${anguloGraus}deg, ${corInicio}, ${corFim})`,
      }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
    >
      <span
        className="font-serif leading-none text-foreground/85"
        style={{ fontSize: "40%" }}
        aria-hidden="true"
      >
        {inicial}
      </span>
    </div>
  );
}
