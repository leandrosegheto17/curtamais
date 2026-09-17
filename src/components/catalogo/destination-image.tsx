"use client";

// V2-L2-T03 — `DestinationImage` (RF-15.1/15.6/15.9, SDD.md §8.2.2, UX-SPEC.md
// §8.3, ADR-010).
//
// Componente cliente: recebe `ImagemResolvida` (o resultado de
// `resolverImagemDestino`, `src/lib/catalogo/resolver-imagem.ts`, tarefa
// V2-L2-T02, paralela a esta) e:
// - com `tipo: "curada"`, renderiza via `next/image` com `width`/`height`
//   reais do catálogo (evita CLS) e `object-position` pelo foco opcional;
// - com `tipo: "fallback"`, ou se a imagem curada falhar ao carregar
//   (`onError`, RF-15.9), renderiza `DestinationFallbackArt` no lugar, sem
//   mudar as dimensões reservadas pelo contêiner (o mesmo `div` envolve os
//   dois casos, só o conteúdo interno troca).
//
// Nota sobre o `onError` de uma imagem CURADA: `resolverImagemDestino` só
// devolve o branch `fallback` quando não há correspondência exata ou quando
// `destino.imagem === null` — ele nunca devolve um gradiente de fallback
// "de reserva" para um destino que TEM imagem curada. Para cobrir RF-15.9
// (falha de carregamento de uma foto que existe mas não pôde ser baixada em
// runtime), este arquivo chama diretamente `gerarFallback` (exportada de
// `resolver-imagem.ts`, RL-V2-L2-T01) com o nome do destino — mesmo algoritmo
// determinístico documentado no ADR-010 §3, sem duplicação local.
import { useMemo, useState } from "react";
import Image from "next/image";

import { gerarFallback, type ImagemResolvida } from "@/lib/catalogo/resolver-imagem";
import { DestinationFallbackArt } from "@/components/catalogo/destination-fallback-art";
import { cn } from "@/lib/utils";

export interface DestinationImageProps {
  /** Resultado de `resolverImagemDestino` (curada ou já fallback). */
  imagem: ImagemResolvida;
  /**
   * Texto alternativo. `""` para uso decorativo (nome já está no texto ao
   * lado, ex.: vitrine — UX-SPEC.md §8.5 "Alt"), ou
   * `"Imagem ilustrativa de {destino}"` para uso informativo (ex.: T04,
   * RF-15.6). Nunca "foto de…"/"foto do local".
   */
  alt: string;
  /** `sizes` do `next/image`, obrigatório para imagens responsivas (evita download da maior variante). */
  sizes: string;
  /** `priority` do `next/image` — só o hero (ADR-010 §4: preload + fetchpriority=high). */
  priority?: boolean;
  /**
   * Selo "imagem ilustrativa" no canto (UX-SPEC.md §8.2 T04: "selo pequeno
   * 'imagem ilustrativa' no canto da imagem"). Só aparece sobre foto curada
   * carregada com sucesso — no fallback não há selo nem crédito, "porque não
   * é foto" (UX-SPEC.md §8.2).
   */
  showIllustrativeTag?: boolean;
  className?: string;
}

/**
 * Imagem do destino (cliente): foto curada via `next/image`, com troca
 * automática para `DestinationFallbackArt` quando não há foto curada ou
 * quando a foto falha ao carregar (RF-15.9), sem layout shift — o contêiner
 * externo é sempre o mesmo elemento, só o filho troca.
 */
export function DestinationImage({
  imagem,
  alt,
  sizes,
  priority,
  showIllustrativeTag,
  className,
}: DestinationImageProps) {
  const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);

  const fallbackDeErro = useMemo(() => {
    if (imagem.tipo !== "curada" || !falhouAoCarregar) return null;
    return gerarFallback(imagem.destino.nome);
  }, [imagem, falhouAoCarregar]);

  const mostrarFallback = imagem.tipo === "fallback" || falhouAoCarregar;

  return (
    <div
      data-testid="destination-image-frame"
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      {mostrarFallback ? (
        imagem.tipo === "fallback" ? (
          <DestinationFallbackArt
            corInicio={imagem.corInicio}
            corFim={imagem.corFim}
            anguloGraus={imagem.anguloGraus}
            inicial={imagem.inicial}
            ariaLabel={alt || undefined}
          />
        ) : (
          fallbackDeErro && (
            <DestinationFallbackArt
              corInicio={fallbackDeErro.corInicio}
              corFim={fallbackDeErro.corFim}
              anguloGraus={fallbackDeErro.anguloGraus}
              inicial={fallbackDeErro.inicial}
              ariaLabel={alt || undefined}
            />
          )
        )
      ) : (
        <>
          <Image
            src={imagem.imagem.arquivo}
            alt={alt}
            width={imagem.imagem.largura}
            height={imagem.imagem.altura}
            sizes={sizes}
            priority={priority}
            onError={() => setFalhouAoCarregar(true)}
            className="h-full w-full object-cover"
            style={
              imagem.imagem.focoX !== undefined || imagem.imagem.focoY !== undefined
                ? {
                    objectPosition: `${imagem.imagem.focoX ?? 50}% ${imagem.imagem.focoY ?? 50}%`,
                  }
                : undefined
            }
          />
          {showIllustrativeTag && (
            <span className="absolute bottom-2 left-2 rounded-full bg-surface/80 px-2 py-0.5 text-[0.6875rem] text-foreground-muted">
              Imagem ilustrativa
            </span>
          )}
        </>
      )}
    </div>
  );
}
