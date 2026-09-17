import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileStickyCta } from "@/components/home/mobile-sticky-cta";

// jsdom não implementa `IntersectionObserver` nativamente — mock local que
// guarda as instâncias criadas para os testes poderem disparar
// manualmente as entradas de interseção (hero e `#caminhos`).
type ObserverCallback = (entries: Pick<IntersectionObserverEntry, "isIntersecting">[]) => void;

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  callback: ObserverCallback;
  element: Element | null = null;

  constructor(callback: ObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instances.push(this);
  }

  observe(element: Element) {
    this.element = element;
  }

  unobserve() {}

  disconnect() {}

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

function matchMediaMock(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  IntersectionObserverMock.instances = [];
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  window.matchMedia = matchMediaMock(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MobileStickyCta (V2-L4-T08, UX-SPEC.md §8.2 item 9 / §8.6 'Barra fixa')", () => {
  it("fica escondida enquanto o hero está visível", () => {
    render(
      <>
        <section aria-label="Destino em destaque" />
        <div id="caminhos" />
        <MobileStickyCta />
      </>,
    );

    const barra = screen.getByTestId("mobile-sticky-cta");
    expect(barra).toHaveAttribute("aria-hidden", "true");
    expect(barra).toHaveClass("md:hidden");
  });

  it("aparece quando o hero sai da tela e #caminhos não está visível", () => {
    render(
      <>
        <section aria-label="Destino em destaque" />
        <div id="caminhos" />
        <MobileStickyCta />
      </>,
    );

    const [heroObserver] = IntersectionObserverMock.instances;

    act(() => {
      heroObserver.trigger(false);
    });

    expect(screen.getByTestId("mobile-sticky-cta")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });

  it("some de novo quando #caminhos fica visível, mesmo com o hero fora da tela", () => {
    render(
      <>
        <section aria-label="Destino em destaque" />
        <div id="caminhos" />
        <MobileStickyCta />
      </>,
    );

    const [heroObserver, caminhosObserver] = IntersectionObserverMock.instances;

    act(() => {
      heroObserver.trigger(false);
    });
    expect(screen.getByTestId("mobile-sticky-cta")).toHaveAttribute(
      "aria-hidden",
      "false",
    );

    act(() => {
      caminhosObserver.trigger(true);
    });
    expect(screen.getByTestId("mobile-sticky-cta")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("quando hero/#caminhos ainda não existem no DOM (standalone, sem integração), trata o hero como fora da tela e mostra a barra", () => {
    render(<MobileStickyCta />);

    expect(screen.getByTestId("mobile-sticky-cta")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });

  it("aceita heroSelector/caminhosSelector configuráveis para a integração final conectar ao markup real", () => {
    render(
      <>
        <div data-testid="hero-real" />
        <div data-testid="caminhos-real" />
        <MobileStickyCta
          heroSelector="[data-testid='hero-real']"
          caminhosSelector="[data-testid='caminhos-real']"
        />
      </>,
    );

    expect(IntersectionObserverMock.instances).toHaveLength(2);
    expect(IntersectionObserverMock.instances[0].element).toHaveAttribute(
      "data-testid",
      "hero-real",
    );
    expect(IntersectionObserverMock.instances[1].element).toHaveAttribute(
      "data-testid",
      "caminhos-real",
    );
  });

  it("renderiza o link 'Montar minha viagem' para #caminhos por padrão", () => {
    render(<MobileStickyCta />);

    const link = screen.getByRole("link", { name: "Montar minha viagem" });
    expect(link).toHaveAttribute("href", "#caminhos");
  });

  it("respeita prefers-reduced-motion desativando a transição (RNF-10)", () => {
    window.matchMedia = matchMediaMock(true);

    render(
      <>
        <section aria-label="Destino em destaque" />
        <MobileStickyCta />
      </>,
    );

    const barra = screen.getByTestId("mobile-sticky-cta");
    expect(barra.className).not.toContain("transition-transform");
  });

  it("sem prefers-reduced-motion, aplica a transição normalmente", () => {
    render(
      <>
        <section aria-label="Destino em destaque" />
        <MobileStickyCta />
      </>,
    );

    const barra = screen.getByTestId("mobile-sticky-cta");
    expect(barra.className).toContain("transition-transform");
  });
});
