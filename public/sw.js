// Service Worker do shell da UI (L5-T05, ADR-001/RNF-04).
//
// Decisão de implementação (ver nota L5-T05 no TASK.md para o racional
// completo): Service Worker escrito à mão, sem biblioteca (`next-pwa`/
// `@ducanh2912/next-pwa`), porque o requisito crítico desta tarefa é NUNCA
// cachear as respostas de streaming do Gateway de IA
// (`/api/gateway-ia/[etapa]`), e escrever a lógica de fetch explicitamente
// aqui deixa essa exclusão auditável em um arquivo só, sem depender do
// comportamento interno (e da manutenção) de uma dependência de terceiros
// sobre um app Next 14.2.35 (Pages/App Router misto de plugins de PWA nem
// sempre documentam bem a interação com Route Handlers de streaming). Isso
// também evita adicionar uma biblioteca nova fora da lista de bibliotecas
// obrigatórias (TASK.md Seção 1, item 12) para uma necessidade que o próprio
// Service Worker nativo resolve.
//
// Escopo do cache: só o shell estático da UI — HTML de navegação básica,
// JS/CSS gerados pelo Next.js (`/_next/static/...`), manifest e ícones.
// Nenhuma resposta de rota que gera conteúdo dinâmico via LLM é armazenada.

const CACHE_VERSION = "curtamais-shell-v1";
const OFFLINE_URL = "/offline";

// Precache mínimo: shell inicial + fallback offline + manifest + ícones.
// Os chunks hasheados de `/_next/static/` não entram aqui (não há hook de
// build nesta implementação manual); eles são cacheados sob demanda pela
// estratégia "cache-first com atualização em background" no handler de
// fetch abaixo, na primeira vez que o navegador os pedir.
const PRECACHE_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// Prefixos de rota que NUNCA podem ser interceptados/cacheados por este
// Service Worker: qualquer chamada ao Gateway de IA (geração de conteúdo via
// LLM, streaming ou não) e, de forma geral, qualquer rota de API — só o
// shell estático é cacheado, nunca dado dinâmico de backend.
const NEVER_CACHE_PREFIXES = ["/api/"];

function isNeverCachePath(pathname) {
  return NEVER_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Só same-origin entra na lógica de cache do shell.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Guardrail principal desta tarefa: qualquer rota de API (o Gateway de IA
  // incluso, `/api/gateway-ia/[etapa]`, streaming ou não) nunca passa pelo
  // Service Worker — sem `event.respondWith`, o browser faz o fetch normal
  // direto na rede, sem leitura nem escrita de cache.
  if (isNeverCachePath(url.pathname)) {
    return;
  }

  // Só GET é elegível a cache (POST do Gateway de IA já foi excluído acima
  // por prefixo, mas esta checagem cobre qualquer outro método não-GET de
  // rotas futuras fora de `/api/`).
  if (request.method !== "GET") {
    return;
  }

  // Navegação (troca de rota/reload de página): network-first, com fallback
  // para cache e, na ausência de cache, para o shell offline dedicado.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          caches.match(request).then((cached) => cached ?? caches.match(OFFLINE_URL)),
      ),
    );
    return;
  }

  // Demais assets estáticos same-origin (JS/CSS/fontes/ícones/imagens):
  // cache-first, atualizando o cache em background a cada acerto de rede.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached ?? networkFetch;
    }),
  );
});
