// V2-L4-T01 — Home vitrine estática (RF-12, RF-18; ADR-011).
//
// Substitui o teste antigo de T00 (L6-T01): o T00 do MVP (3 caminhos inline)
// sai de `src/app/page.tsx` nesta tarefa e vira a seção `EntryPathsSection`
// de `#caminhos` (V2-L4-T02, tarefa separada, ainda não implementada) — por
// isso este arquivo não testa mais os 3 caminhos diretamente aqui.
//
// Cobre o critério de aceite desta tarefa:
// - `revalidate = 3600` exportado (página estática, ADR-011 item 1);
// - hero usa a imagem do destino `hero: true` do catálogo, com overlay AA;
// - zero chamada ao Gateway de IA/stage-rules/Prisma a partir da home
//   (ADR-011 item 5): os três módulos são substituídos por mocks que falham
//   ao ser chamados, e o teste passa porque a renderização nunca os toca.
import type { ImgHTMLAttributes } from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOGO_DESTINOS } from "@/lib/catalogo/destinos";

vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    ...imgProps
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...imgProps} />
  ),
}));

vi.mock("next-auth/react", () => ({
  getSession: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
}));

// ADR-011 item 5 / RN-08: a home nunca pode chamar o Gateway de IA, o
// stage-rules nem o Prisma. Os mocks abaixo falham imediatamente ao serem
// usados (acessar qualquer propriedade já lança) — o teste "zero chamada"
// só passa porque `src/app/page.tsx` e tudo que ele importa nunca tocam
// nesses módulos.
function criarModuloQueFalhaAoSerUsado(nomeModulo: string) {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          `RN-08/ADR-011: ${nomeModulo} não pode ser importado pela home estática.`,
        );
      },
    },
  );
}

vi.mock("@/lib/gateway-ia", () => criarModuloQueFalhaAoSerUsado("@/lib/gateway-ia"));
vi.mock("@/lib/stage-rules", () => criarModuloQueFalhaAoSerUsado("@/lib/stage-rules"));
vi.mock("@/lib/prisma", () => criarModuloQueFalhaAoSerUsado("@/lib/prisma"));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      throw new Error("RN-08/ADR-011: openai não pode ser importado pela home estática.");
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Home vitrine (V2-L4-T01, RF-12, ADR-011)", () => {
  it("exporta `revalidate = 3600` (página estática, ADR-011 item 1)", async () => {
    const pageModule = await import("@/app/page");
    expect(pageModule.revalidate).toBe(3600);
  });

  it("não exporta/usa `cookies`/`getServerSession` (a página é uma função síncrona sem argumentos de request)", async () => {
    const HomePage = (await import("@/app/page")).default;
    // Um Server Component dinâmico (que lê cookies/sessão) precisaria de
    // acesso a `req`/`cookies()`; este componente não recebe nenhum
    // parâmetro e não é assíncrono.
    expect(HomePage.length).toBe(0);
    expect(HomePage.constructor.name).not.toBe("AsyncFunction");
  });

  it("renderiza sem chamar Gateway de IA, stage-rules, Prisma ou o SDK da OpenAI (RN-08/ADR-011)", async () => {
    const HomePage = (await import("@/app/page")).default;

    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });
  });

  it("o hero usa a imagem do destino marcado `hero: true` no catálogo", async () => {
    const destinoHero = CATALOGO_DESTINOS.find((destino) => destino.hero === true);
    expect(destinoHero).toBeDefined();

    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    const hero = screen.getByRole("region", { name: "Destino em destaque" });
    expect(hero).toBeInTheDocument();

    // A partir de RL-V2-L4-T01 a página tem outras imagens (vitrine, T04):
    // escopo a busca ao hero para continuar pegando só a imagem dele.
    if (destinoHero?.imagem) {
      // A imagem do hero usa `alt=""` deliberadamente (decorativa — o nome
      // do destino já está no texto do hero, RN-A11y), então não tem
      // `role="img"` na árvore de acessibilidade — busca por `<img>` via
      // seletor, não por role.
      const img = hero.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe(destinoHero.imagem.arquivo);
    } else {
      // `imagem: null` no catálogo (V2-L2-T01) é um estado válido — o hero
      // cai no fallback determinístico de gradiente, com a inicial do nome
      // do destino hero.
      expect(within(hero).getByTestId("destination-fallback-art")).toBeInTheDocument();
      expect(
        within(hero).getByText(destinoHero!.nome.charAt(0).toUpperCase()),
      ).toBeInTheDocument();
    }
  });

  it("hero traz eyebrow, título, subtítulo, os dois CTAs e a nota de confiabilidade (RF-12.2, UX-SPEC §8.2)", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    const hero = screen.getByRole("region", { name: "Destino em destaque" });

    expect(
      within(hero).getByText("Seu consultor de roteiros, com IA"),
    ).toBeInTheDocument();
    expect(
      within(hero).getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Diga quando pode viajar. Eu monto o roteiro com você.");
    expect(
      within(hero).getByText(
        "Destino, hospedagem, passeios e roteiro — uma etapa de cada vez, e nada avança sem o seu ok.",
      ),
    ).toBeInTheDocument();

    const ctaPrimario = within(hero).getByRole("link", { name: "Montar minha viagem" });
    expect(ctaPrimario).toHaveAttribute("href", "#caminhos");
    const ctaSecundario = within(hero).getByRole("link", { name: "Ver roteiro de exemplo" });
    expect(ctaSecundario).toHaveAttribute("href", "/roteiro-exemplo");

    // A partir de RL-V2-L4-T01, `SiteFooter` repete a mesma frase de
    // posicionamento (RNF-11) — escopo ao hero para continuar checando só a
    // nota de confiabilidade dele.
    expect(
      within(hero).getByText("Eu monto o plano; a reserva você faz onde preferir."),
    ).toBeInTheDocument();
  });

  it("mostra o cabeçalho com o logotipo (link para /) e o AccountNav (V2-L4-T09)", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    expect(screen.getByRole("link", { name: "Destino Ideal" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("navigation", { name: "Conta" })).toBeInTheDocument();
  });
});

describe("RL-V2-L4-T01 — integração final das 9 seções (UX-SPEC.md §8.2 T-HOME)", () => {
  it("renderiza as 9 seções na ordem exata do UX-SPEC.md §8.2, cada uma uma única vez", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    // Localiza cada seção pelo marcador mais robusto disponível (aria-label,
    // heading de texto, ou id) e confirma que aparece exatamente 1 vez e na
    // ordem certa, comparando a posição no DOM (`compareDocumentPosition`).
    const hero = screen.getByRole("region", { name: "Destino em destaque" });
    const caminhos = screen.getByRole("heading", {
      name: "Três jeitos de começar, o mesmo roteiro no fim",
    }).closest("section");
    const comoFunciona = screen
      .getByRole("heading", { name: "Uma etapa de cada vez. Nada avança sem o seu ok." })
      .closest("section");
    const vitrine = screen.getByRole("list", { name: "Destinos para começar" }).closest("section");
    const exemplo = screen
      .getByRole("heading", { name: "Um roteiro pronto, com hora e motivo." })
      .closest("section");
    const feriados = screen
      .getByRole("heading", { name: "A folga já está no calendário. Falta o destino." })
      .closest("section");
    const faq = document.getElementById("faq");
    const footer = screen.getByText("Eu monto o plano; a reserva você faz onde preferir.", {
      selector: "footer p",
    }).closest("footer");

    const secoesNaOrdem = [hero, caminhos, comoFunciona, vitrine, exemplo, feriados, faq, footer];
    secoesNaOrdem.forEach((secao) => expect(secao).toBeInTheDocument());

    for (let i = 0; i < secoesNaOrdem.length - 1; i += 1) {
      const atual = secoesNaOrdem[i] as Element;
      const proxima = secoesNaOrdem[i + 1] as Element;
      // Node.DOCUMENT_POSITION_FOLLOWING (4): `proxima` vem depois de `atual`.
      expect(atual.compareDocumentPosition(proxima) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    // Nenhuma seção duplicada: cada marcador só existe uma vez no documento.
    expect(screen.getAllByRole("region", { name: "Destino em destaque" })).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "Três jeitos de começar, o mesmo roteiro no fim" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "Uma etapa de cada vez. Nada avança sem o seu ok." }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("list", { name: "Destinos para começar" })).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "Um roteiro pronto, com hora e motivo." }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "A folga já está no calendário. Falta o destino." }),
    ).toHaveLength(1);
    expect(document.querySelectorAll("#faq")).toHaveLength(1);
    expect(document.querySelectorAll("footer")).toHaveLength(1);
  });

  it("`ImageCreditsSection` aparece dentro do `SiteFooter` (id=\"creditos\") quando há imagem curada", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    // O Rio de Janeiro (vitrine 1, hero) já tem imagem curada — a seção de
    // créditos aparece com o crédito dele, e o `SiteFooter` continua
    // presente normalmente ao redor dela (o slot é opcional, mas está
    // preenchido).
    const secaoCreditos = document.querySelector("#creditos");
    expect(secaoCreditos).toBeInTheDocument();
    expect(secaoCreditos).toHaveTextContent("Rio de Janeiro");
    expect(
      screen.getByText("Eu monto o plano; a reserva você faz onde preferir.", {
        selector: "footer p",
      }),
    ).toBeInTheDocument();
  });

  it("renderiza `MobileStickyCta` com os seletores default, que batem com o hero e `#caminhos` reais da página", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    // Seletores default de `MobileStickyCta`: `[aria-label="Destino em
    // destaque"]` (HeroSection) e `#caminhos` (EntryPathsSection) — ambos
    // devem existir no DOM real desta página, sem precisar passar props.
    expect(document.querySelector('[aria-label="Destino em destaque"]')).toBeInTheDocument();
    expect(document.querySelector("#caminhos")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-sticky-cta")).toBeInTheDocument();
  });

  it("renderiza `FaqSection` com a identificação como IA (RNF-11) e não duplica o rodapé", async () => {
    const HomePage = (await import("@/app/page")).default;
    render(<HomePage />);
    await screen.findByRole("link", { name: "Entrar" });

    expect(screen.getByText("Quem monta o roteiro?")).toBeInTheDocument();
    expect(screen.getAllByText("Destino Ideal")).toHaveLength(2); // logotipo do header + nome no rodapé
  });
});
