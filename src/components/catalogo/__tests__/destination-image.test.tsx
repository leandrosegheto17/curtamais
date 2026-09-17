// V2-L2-T03 — Testes de `DestinationImage` (RF-15.1/15.9).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";

import { DestinationImage } from "@/components/catalogo/destination-image";
import type { ImagemResolvida } from "@/lib/catalogo/resolver-imagem";
import type { DestinoCatalogo } from "@/lib/catalogo/destinos";

// `next/image` faz otimização/carregamento real de imagem, irrelevante para
// este teste de unidade (comportamento de troca para fallback); mock simples
// preservando os atributos relevantes (src/width/height/alt/onError), padrão
// comum em testes de componente que usam `next/image`.
vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    ...imgProps
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...imgProps} />
  ),
}));

afterEach(() => cleanup());

const destinoGramado: DestinoCatalogo = {
  slug: "gramado",
  nome: "Gramado",
  uf: "RS",
  rotuloRegiao: "Serra Gaúcha",
  variantes: [],
  vitrine: 3,
  imagem: {
    arquivo: "/destinos/gramado-v1.jpg",
    largura: 1200,
    altura: 800,
    autor: "Autor Exemplo",
    autorUrl: "https://unsplash.com/@autor",
    fonte: "unsplash",
    fonteUrl: "https://unsplash.com/photos/exemplo",
    licenca: "Unsplash License",
    curadaEm: "2026-09-16",
  },
};

const imagemCurada: ImagemResolvida = {
  tipo: "curada",
  destino: destinoGramado,
  imagem: destinoGramado.imagem!,
};

const imagemFallback: ImagemResolvida = {
  tipo: "fallback",
  nomeOriginal: "Lugar Desconhecido",
  corInicio: "#1E3A8A",
  corFim: "#172554",
  anguloGraus: 135,
  inicial: "L",
};

describe("DestinationImage", () => {
  it("renderiza a imagem curada via next/image com as dimensões do catálogo", () => {
    const { container } = render(
      <DestinationImage imagem={imagemCurada} alt="" sizes="100vw" />,
    );

    // Busca pela tag <img> real (não por role: `DestinationFallbackArt`
    // também pode ter `role="img"` quando informativo, o que ambiguizaria
    // `getByRole("img")`).
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/destinos/gramado-v1.jpg");
    expect(img.getAttribute("width")).toBe("1200");
    expect(img.getAttribute("height")).toBe("800");
    expect(
      screen.queryByTestId("destination-fallback-art"),
    ).not.toBeInTheDocument();
  });

  it("renderiza DestinationFallbackArt diretamente quando `imagem.tipo` é 'fallback'", () => {
    render(<DestinationImage imagem={imagemFallback} alt="" sizes="100vw" />);

    expect(screen.getByTestId("destination-fallback-art")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("troca para o fallback no onError, sem mudar o contêiner externo (RF-15.9, sem CLS)", () => {
    const { container } = render(
      <DestinationImage
        imagem={imagemCurada}
        alt="Imagem ilustrativa de Gramado"
        sizes="100vw"
      />,
    );

    const frameAntes = screen.getByTestId("destination-image-frame");
    const classNameAntes = frameAntes.className;

    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);

    const frameDepois = screen.getByTestId("destination-image-frame");
    expect(frameDepois).toBe(frameAntes);
    expect(frameDepois.className).toBe(classNameAntes);

    expect(screen.getByTestId("destination-fallback-art")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    // Mesmo destino (Gramado) -> mesma inicial "G" do fallback determinístico.
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("mostra o selo 'Imagem ilustrativa' só com showIllustrativeTag e foto curada carregada", () => {
    render(
      <DestinationImage
        imagem={imagemCurada}
        alt="Imagem ilustrativa de Gramado"
        sizes="100vw"
        showIllustrativeTag
      />,
    );
    expect(screen.getByText("Imagem ilustrativa")).toBeInTheDocument();
  });

  it("não mostra o selo quando showIllustrativeTag está ausente", () => {
    render(<DestinationImage imagem={imagemCurada} alt="" sizes="100vw" />);
    expect(screen.queryByText("Imagem ilustrativa")).not.toBeInTheDocument();
  });
});
