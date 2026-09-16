# ADR-010: Catálogo de destinos e estratégia de imagens (camadas 1 e 3 no V2.0)

- Status: Aceito
- Data: 2026-09-16
- Autor: Coordenador (chapéu Software Architect)
- Relação: novo; não substitui nenhum ADR. A camada 2 (busca automática no
  Unsplash/Pexels com cache no banco) fica para o V2.1 e terá um ADR próprio,
  que vai estender este.

## Contexto

O V2.0 exige (`PRD-TECNICO.md` RF-12.1 item 4, RF-15, RN-10, RNF-09 e
RNF-12):

- um catálogo curado de 23 destinos (8 na vitrine), com foto, autor, fonte e
  licença registrados;
- imagem em T04 só quando a sugestão da IA corresponder **exatamente** (após
  normalização) a um destino do catálogo. Em qualquer outro caso, fallback
  de gradiente + inicial, sempre igual para o mesmo nome;
- a home sem nenhuma chamada de IA e com LCP <= 2,5 s e CLS <= 0,1;
- nenhuma busca de imagem em tempo de execução e nenhuma imagem gerada por
  IA.

Quem faz a curadoria das fotos é o dono do produto. O catálogo muda raramente
e sempre junto com arquivos de imagem.

## Alternativas consideradas

**Onde fica o catálogo**

1. **Tabela no PostgreSQL** (`Destination`, `DestinationImage`).
   Descartada para o V2.0. A home passaria a depender do banco, deixando de
   ser estática, com mais latência e um ponto de falha a mais no LCP. Seria
   preciso uma tela de administração ou seed manual para o dono editar. As
   fotos continuariam sendo arquivos, então o dado ficaria dividido entre
   banco e repositório.
2. **CMS externo**. Descartada: dependência nova e conta nova para 23 itens.
3. **Módulo TypeScript versionado no repositório, com as imagens em
   `public/`** (escolhida). A mudança de licença ou foto passa por commit e
   revisão, que é a trilha de auditoria de RN-10 e R-06. O dado fica
   disponível em build (renderização estática) e em testes, sem ida ao banco.

**Como decidir a correspondência**

1. Correspondência aproximada (distância de edição, embeddings). Descartada:
   proibida por RF-15.4 e RN-10.
2. **Pedir à IA um `slug` do catálogo junto da sugestão**. Descartada para o
   V2.0: mudaria o prompt e o schema do Gateway (ADR-003), e a IA pode
   devolver o slug errado com confiança, o que é exatamente a "foto errada".
3. **Normalização determinística + igualdade exata contra nome e variantes
   cadastradas** (escolhida, conforme RF-15.4).

**Fallback**

1. Cor HSL livre derivada do hash. Descartada: não garante o contraste AA do
   RNF-09 para todos os nomes.
2. **Hash escolhe um par de uma paleta fixa de gradientes com contraste
   pré-verificado** (escolhida).

## Decisão

### 1. Estrutura do catálogo

`src/lib/catalogo/destinos.ts` (sem `"use client"`/`"use server"`, sem
import de Prisma, Gateway de IA ou Next.js):

```ts
export type FonteImagem = "unsplash" | "pexels";

export type ImagemCurada = {
  arquivo: `/destinos/${string}`;   // em public/destinos/, nome com versão: gramado-v1.jpg
  largura: number; altura: number;  // dimensões reais do arquivo (reserva de espaço, CLS)
  autor: string; autorUrl: string;
  fonte: FonteImagem; fonteUrl: string; // página da foto na fonte
  licenca: "Unsplash License" | "Pexels License";
  curadaEm: string;                 // AAAA-MM-DD
  focoX?: number; focoY?: number;   // object-position em %, opcional
};

export type DestinoCatalogo = {
  slug: string;                     // ex.: "gramado"
  nome: string;                     // "Gramado"
  uf: string;                       // "RS"
  rotuloRegiao: string;             // "Serra Gaúcha" (overlay do card)
  variantes: string[];              // ex.: ["Gramado RS", "Gramado (Serra Gaúcha)"]
  vitrine: number | null;           // ordem 1..8 na home; null = só catálogo
  hero?: true;                      // exatamente um destino
  imagem: ImagemCurada | null;      // null = foto ainda não curada → fallback
};
```

- Os 23 destinos são exatamente os do `PRD.md` ("Catálogo do V2.0"). Os 8
  da vitrine seguem a ordem ali publicada.
- `imagem: null` é um estado válido. A entrega técnica não espera a
  curadoria (`PRD-TECNICO.md` §5), e o destino sai com fallback até a foto
  ser curada.
- **Variantes**: só grafias do **mesmo lugar**. Cidade vizinha ou atração
  dentro do destino (ex.: "Canela", "Barreirinhas") **não** entra como
  variante. Cada variante nova é decisão de curadoria, registrada no
  commit.

### 2. Normalização e correspondência

`src/lib/catalogo/resolver-imagem.ts`, funções puras:

1. `normalizarNomeDestino(s)`:
   - Unicode NFD, remoção de diacríticos e minúsculas;
   - troca de `-`, `–`, `/`, `,`, `(` e `)` por espaço, e colapso de espaços
     com `trim`;
   - remoção de **um** sufixo final igual a uma das 27 siglas de UF, desde
     que precedido de espaço (depois da etapa anterior, "Gramado, RS",
     "Gramado - RS", "Gramado (RS)" e "Gramado RS" viram todos
     "gramado").
   Nada mais é removido. "Gramado e Canela", "Serra Gaúcha" e "Porto de
   Galinhas, Ipojuca" não casam com nada, a menos que estejam cadastrados
   como variante.
2. Mapa `Map<string, DestinoCatalogo>` construído uma vez, no carregamento
   do módulo, com `nome` e `variantes` normalizados.
3. `resolverImagemDestino(nomeSugerido)` devolve
   `{ tipo: "curada", destino, imagem }` só com igualdade exata e
   `imagem !== null`. Em qualquer outro caso devolve
   `{ tipo: "fallback", ...gerarFallback(nomeSugerido) }`.
4. **Testes que falham no CI** (`src/lib/catalogo/__tests__/`):
   - nenhuma chave normalizada colide entre dois destinos (colisão = risco
     de foto errada);
   - todo `imagem` não nulo tem autor, URL, fonte, licença e data, e o
     arquivo existe em `public/`;
   - há exatamente 8 destinos com `vitrine` (1..8, sem repetição) e
     exatamente um `hero`;
   - `slug`s são únicos e seguem `^[a-z0-9-]+$`.

### 3. Fallback determinístico

- Hash **FNV-1a 32 bits** sobre o nome **normalizado** (o mesmo destino
  escrito de formas diferentes dá o mesmo gradiente).
- `indice = hash % PALETA_FALLBACK.length`, com uma paleta fixa de 8 pares
  de cores escuras. Cada par tem contraste >= 4.5:1 com `#FAFAFA` nos dois
  extremos, verificado por teste. Ângulo do gradiente: `(hash >> 8) % 4`
  entre 4 ângulos fixos.
- A inicial é o primeiro caractere alfabético do nome **original** (acento
  preservado), em maiúscula, com fonte display.
- Componente `DestinationFallbackArt` (`UX-SPEC.md` §8.3). Ele também é a
  resposta ao `onError` da imagem curada (RF-15.9).

### 4. Entrega da imagem

- Sempre via `next/image` com `width`/`height` reais do catálogo, `sizes`
  explícito por uso e `placeholder` de cor sólida (`surface`). Não é
  necessário gerar `blurDataURL` para o V2.0.
- Hero: `priority` (preload + `fetchpriority=high`). Todas as outras
  imagens: `loading="lazy"` (padrão do `next/image`).
- `next.config.mjs`:
  ```js
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,   // arquivos imutáveis: troca de foto = nome novo (-v2)
    qualities: [60, 75],         // se a versão do Next exigir allowlist
  },
  async headers() { /* Referrer-Policy, ver SDD §8.7 */ }
  ```
  **Sem `remotePatterns`**: o catálogo é servido pelo próprio domínio. A
  camada 2 (V2.1) é que vai adicioná-lo.
- **Arquivos-fonte**: JPEG ou WebP em paisagem, lado maior entre 1600 e
  2400 px e até cerca de 600 KB cada. A otimização fica com o `next/image`.
  No plano Hobby da Vercel, a cota de imagens-fonte otimizadas comporta os
  23 arquivos.
- **Crédito** (RF-15.5): legenda visível em T04. Na home, crédito visível no
  hero e uma seção "Créditos das imagens" no rodapé com todos os itens do
  catálogo exibidos. Cada card da vitrine tem um link acessível para essa
  seção (`UX-SPEC.md` §8.3).

### 5. Onde a correspondência roda

- **T04**: no servidor, dentro de `gerarSugestoesDestino`. Cada sugestão
  devolvida ganha `imagem: ImagemResolvida`, só para apresentação. Esse
  campo **é ignorado** em `aprovarDestinoSugerido`, porque não faz parte do
  payload aprovado nem da `DestinationApproval`. O schema do Gateway de IA
  e o prompt **não mudam**.
- **Home e roteiro de exemplo**: em build, a partir do catálogo, sem
  correspondência (o destino já é conhecido pelo `slug`).

## Consequências

- Trocar ou adicionar uma foto exige commit e deploy, o que é aceitável para
  23 destinos com curadoria manual.
- A taxa de acerto do catálogo em T04 (métrica do V2) **não é gravada** no
  V2.0. Ela pode ser lida à mão, cruzando `DestinationApproval.name` com o
  catálogo. Se o V2.1 precisar dela sobre as **sugestões** (e não só sobre
  as aprovações), será preciso gravar o nome sugerido. Fica registrado como
  decisão consciente de não ampliar o `LlmGenerationLog` agora.
- Nenhuma chave de API nem chamada externa em tempo de execução.
- `public/destinos/` passa a guardar binários no repositório. O volume de
  cerca de 23 × 600 KB (menos de 15 MB) é aceitável sem Git LFS.
