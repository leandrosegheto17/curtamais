// @vitest-environment node
//
// L5-T05 — PWA (Web App Manifest + Service Worker), ADR-001/RNF-04.
//
// Cobertura possível sem browser real: (1) o manifest tem os campos
// obrigatórios/recomendados para instalabilidade; (2) o código-fonte do
// Service Worker exclui explicitamente as rotas de API (Gateway de IA
// incluso) do cache, e não faz `event.respondWith`/`cache.put` para elas.
// Comportamento real de instalação, cache hit/miss e navegação offline num
// browser (Chrome/Edge "Add to Home Screen", DevTools > Application >
// Service Workers) exige verificação manual — ver nota de implementação
// L5-T05 no TASK.md.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = path.resolve(
  __dirname,
  "../../../public/manifest.webmanifest",
);
const swPath = path.resolve(__dirname, "../../../public/sw.js");
const layoutPath = path.resolve(__dirname, "../layout.tsx");

describe("layout.tsx (link do manifest no <head>)", () => {
  it("declara o manifest via Metadata API", () => {
    const layoutSource = readFileSync(layoutPath, "utf-8");
    expect(layoutSource).toMatch(/manifest:\s*"\/manifest\.webmanifest"/);
  });

  it("registra o Service Worker no shell do app", () => {
    const layoutSource = readFileSync(layoutPath, "utf-8");
    expect(layoutSource).toMatch(/RegisterServiceWorker/);
  });
});

describe("manifest.webmanifest (RNF-04, ADR-001)", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  it("tem os campos obrigatórios de instalabilidade", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(typeof manifest.background_color).toBe("string");
    expect(typeof manifest.theme_color).toBe("string");
  });

  it("declara pelo menos um ícone de 192x192 e um de 512x512", () => {
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("cada ícone declarado tem src e type", () => {
    for (const icon of manifest.icons) {
      expect(icon.src).toBeTruthy();
      expect(icon.type).toBeTruthy();
    }
  });
});

describe("public/sw.js (shell offline, RNF-04)", () => {
  const swSource = readFileSync(swPath, "utf-8");

  it("nunca intercepta nem cacheia rotas de API (Gateway de IA incluso)", () => {
    // A rota do Gateway de IA vive sob /api/gateway-ia/[etapa] — o guardrail
    // desta tarefa é que NENHUMA rota de API seja cacheada, não só essa.
    expect(swSource).toMatch(/NEVER_CACHE_PREFIXES\s*=\s*\[[^\]]*"\/api\/"/);
  });

  it("checa o prefixo de exclusão antes de decidir responder via cache", () => {
    // Garante que a checagem de exclusão acontece no handler de fetch, antes
    // de qualquer `caches.match`/`cache.put` para a requisição.
    const fetchHandlerMatch = swSource.match(
      /addEventListener\("fetch"[\s\S]*$/,
    );
    expect(fetchHandlerMatch).not.toBeNull();
    const fetchHandlerSource = fetchHandlerMatch![0];

    const guardIndex = fetchHandlerSource.indexOf("isNeverCachePath");
    const firstCacheCallIndex = fetchHandlerSource.indexOf("caches.match");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(firstCacheCallIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstCacheCallIndex);
  });

  it("na exclusão de rota de API, retorna sem chamar respondWith (passthrough de rede)", () => {
    const guardBlockMatch = swSource.match(
      /if \(isNeverCachePath\(url\.pathname\)\) \{\s*return;\s*\}/,
    );
    expect(guardBlockMatch).not.toBeNull();
  });

  it("precacheia só shell estático (manifest, ícones, shell/offline), não rota de API", () => {
    const precacheMatch = swSource.match(
      /PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(precacheMatch).not.toBeNull();
    const precacheList = precacheMatch![1];
    expect(precacheList).not.toMatch(/\/api\//);
    expect(precacheList).toMatch(/manifest\.webmanifest/);
  });

  it("define uma URL de fallback offline dedicada", () => {
    expect(swSource).toMatch(/OFFLINE_URL\s*=\s*"\/offline"/);
  });
});
