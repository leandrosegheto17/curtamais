import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoadingStream } from "@/components/design-system/loading-stream";

afterEach(() => cleanup());

/**
 * Constrói um `ReadableStream<Uint8Array>` controlável de fora, para emitir
 * chunks em momentos diferentes — mesmo padrão de prova de entrega
 * incremental real usado em `src/lib/gateway-ia/streaming-spike/simulate-stream.ts`
 * e `src/app/api/gateway-ia/[etapa]/__tests__/route.test.ts` (timestamps de
 * chegada diferentes, não só o resultado final).
 */
function createControllableStream() {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const encoder = new TextEncoder();
  return {
    stream,
    push(chunk: string) {
      controllerRef.enqueue(encoder.encode(chunk));
    },
    close() {
      controllerRef.close();
    },
  };
}

function fakeFetchOk(stream: ReadableStream<Uint8Array>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
  } as unknown as Response);
}

describe("LoadingStream", () => {
  it("renderiza conteúdo progressivo real conforme os chunks chegam (timestamps diferentes, prova de entrega incremental)", async () => {
    const { stream, push, close } = createControllableStream();
    const fetchImpl = fakeFetchOk(stream);

    render(
      <LoadingStream
        input="/api/gateway-ia/destino"
        label="Gerando sugestões de destino"
        fetchImpl={fetchImpl}
      />,
    );

    // Skeleton (não spinner genérico) visível antes do primeiro chunk.
    expect(screen.getByTestId("loading-stream-skeleton")).toBeInTheDocument();

    const arrivals: number[] = [];

    push("Foz do Iguaçu");
    await waitFor(() => screen.getByText("Foz do Iguaçu"));
    arrivals.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 15));

    push(" é um destino com cataratas.");
    await waitFor(() =>
      screen.getByText((content) => content.includes("cataratas")),
    );
    arrivals.push(Date.now());

    close();
    // Aguarda o `done: true` do reader ser processado (transição para
    // status "done") antes de finalizar o teste, evitando um update de
    // estado fora de um `act()`/`waitFor` pendente.
    await waitFor(() =>
      expect(screen.queryByText("▍", { exact: false })).not.toBeInTheDocument(),
    );

    // Prova de entrega incremental real: dois momentos de chegada distintos,
    // não um único payload já completo renderizado de uma vez.
    expect(arrivals[1]).toBeGreaterThan(arrivals[0]);
    expect(
      screen.getByText((content) =>
        content.includes("Foz do Iguaçu é um destino com cataratas."),
      ),
    ).toBeInTheDocument();
  });

  it('tem aria-live="polite" na região de conteúdo', () => {
    const { stream } = createControllableStream();
    const fetchImpl = fakeFetchOk(stream);

    render(
      <LoadingStream
        input="/api/gateway-ia/destino"
        label="Gerando sugestões de destino"
        fetchImpl={fetchImpl}
      />,
    );

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent("Gerando sugestões de destino");
  });

  it("chama onStreamComplete com o texto completo ao fechar o stream", async () => {
    const { stream, push, close } = createControllableStream();
    const fetchImpl = fakeFetchOk(stream);
    const onStreamComplete = vi.fn();

    render(
      <LoadingStream
        input="/api/gateway-ia/destino"
        label="Gerando sugestões de destino"
        fetchImpl={fetchImpl}
        onStreamComplete={onStreamComplete}
      />,
    );

    push("Rio de Janeiro");
    close();

    await waitFor(() => expect(onStreamComplete).toHaveBeenCalledWith("Rio de Janeiro"));
  });

  it("chama onStreamError e não tenta retry sozinho quando o fetch falha", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network timeout"));
    const onStreamError = vi.fn();

    render(
      <LoadingStream
        input="/api/gateway-ia/destino"
        label="Gerando sugestões de destino"
        fetchImpl={fetchImpl}
        onStreamError={onStreamError}
      />,
    );

    await waitFor(() => expect(onStreamError).toHaveBeenCalledTimes(1));
    // Nenhum novo fetch automático além da 1ª chamada (sem retry em loop).
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("chama onStreamError quando a resposta não é ok", async () => {
    const onStreamError = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      body: null,
    } as unknown as Response);

    render(
      <LoadingStream
        input="/api/gateway-ia/destino"
        label="Gerando sugestões de destino"
        fetchImpl={fetchImpl}
        onStreamError={onStreamError}
      />,
    );

    await waitFor(() => expect(onStreamError).toHaveBeenCalledTimes(1));
  });
});
