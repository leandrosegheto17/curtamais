// Conteúdo curado (ADR-013): perfil editorial dos 23 destinos do catálogo.
// Clima "típico" (RN-14): meses chuvosos são tendência histórica, não previsão.
// A T14 prova por teste que a tupla abaixo é igual ao conjunto de slugs do catálogo.

import type { PerfilClima, TipoViagem } from "../tipos";

export const SLUGS_DESTINOS_CHECKLIST = [
  "rio-de-janeiro",
  "porto-de-galinhas",
  "gramado",
  "maceio",
  "porto-seguro",
  "florianopolis",
  "foz-do-iguacu",
  "campos-do-jordao",
  "natal",
  "fortaleza",
  "maragogi",
  "salvador",
  "joao-pessoa",
  "imbassai",
  "buzios",
  "ilheus",
  "aracaju",
  "praia-do-forte",
  "caldas-novas",
  "olimpia",
  "pocos-de-caldas",
  "fernando-de-noronha",
  "lencois-maranhenses",
] as const;

export type SlugDestinoChecklist = (typeof SLUGS_DESTINOS_CHECKLIST)[number];

export const MAPA_DESTINOS_CHECKLIST: Record<
  SlugDestinoChecklist,
  { perfil: PerfilClima; tipo: TipoViagem; mesesChuvosos: number[] }
> = {
  "rio-de-janeiro": { perfil: "cidade-litoral", tipo: "cidade", mesesChuvosos: [12, 1, 2, 3] },
  "porto-de-galinhas": { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6, 7] },
  gramado: { perfil: "serra-fria", tipo: "serra", mesesChuvosos: [6, 7, 8, 9, 10] },
  maceio: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6, 7, 8] },
  "porto-seguro": { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [3, 4, 11, 12] },
  florianopolis: { perfil: "praia-subtropical", tipo: "praia", mesesChuvosos: [1, 2, 3] },
  "foz-do-iguacu": { perfil: "natureza-aventura", tipo: "natureza", mesesChuvosos: [10, 11, 12, 1, 2] },
  "campos-do-jordao": { perfil: "serra-fria", tipo: "serra", mesesChuvosos: [12, 1, 2, 3] },
  natal: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [3, 4, 5, 6, 7] },
  fortaleza: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [2, 3, 4, 5] },
  maragogi: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6, 7, 8] },
  salvador: { perfil: "cidade-litoral", tipo: "cidade", mesesChuvosos: [4, 5, 6] },
  "joao-pessoa": { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6, 7, 8] },
  imbassai: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6] },
  buzios: { perfil: "praia-subtropical", tipo: "praia", mesesChuvosos: [12, 1, 2, 3] },
  ilheus: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [3, 4, 5, 6] },
  aracaju: { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6, 7, 8] },
  "praia-do-forte": { perfil: "praia-tropical", tipo: "praia", mesesChuvosos: [4, 5, 6] },
  "caldas-novas": { perfil: "interior-termal", tipo: "termal", mesesChuvosos: [11, 12, 1, 2, 3] },
  olimpia: { perfil: "interior-termal", tipo: "termal", mesesChuvosos: [11, 12, 1, 2, 3] },
  "pocos-de-caldas": { perfil: "serra-fria", tipo: "serra", mesesChuvosos: [12, 1, 2, 3] },
  "fernando-de-noronha": { perfil: "natureza-aventura", tipo: "natureza", mesesChuvosos: [3, 4, 5, 6, 7] },
  "lencois-maranhenses": { perfil: "natureza-aventura", tipo: "natureza", mesesChuvosos: [1, 2, 3, 4, 5, 6] },
};
