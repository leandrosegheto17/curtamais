// V2-L2-T01 — Estratégia de imagens do catálogo de destinos (RF-15, ADR-010
// §4). O catálogo é servido pelo próprio domínio (`public/destinos/`), por
// isso `images.remotePatterns` não é configurado aqui — a camada 2 (busca
// externa em Pexels/Unsplash) é V2.1 e adiciona isso quando existir.
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Arquivos imutáveis: trocar uma foto curada é sempre um nome novo
    // (ex.: gramado-v2.jpg), nunca sobrescrita do mesmo arquivo.
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
