// L11-T03 — Validação/sanitização de entrada de texto livre do usuário
// (orçamento, destino manual) contra prompt injection (SDD.md Seção 7,
// GUARDRAILS.md regra 18, TASK.md Seção 1 item 9).
//
// Contexto (ver `.md/BLOCKERS.md`, Bloqueio 003, e `.md/TASK.md` Seção 6):
// texto livre do usuário (hoje, na prática, só o campo de destino manual —
// `informarDestinoManualmente`/`src/lib/actions/destino.ts` e o campo
// `destino` opcional de `submeterDataLivre`/`src/lib/actions/data-livre.ts`,
// ambos herdando `DestinationApproval.name`) é interpolado literalmente em
// `buildHospedagemPrompt`/`buildPasseiosPrompt`/`buildRoteiroPrompt`
// (`./prompts.ts`) via `StageContext.destination.name` — sem nenhuma
// mitigação de CONTEÚDO até esta tarefa (só `trim()` + truncagem de
// tamanho). `budgetAmount`/`budgetCurrency` (`prisma/schema.prisma`,
// `StageContext`) são campos NUMÉRICOS/enum-like, não texto livre — não são
// alvo desta sanitização; o único campo de texto livre do usuário
// efetivamente persistido hoje que alimenta prompt é o nome de destino
// manual (o "orçamento em texto livre" do quiz guiado, RF-03.1 item 4, não é
// persistido nesta versão — ver nota de implementação L6-T07 no TASK.md,
// decisão de escopo documentada, fora deste módulo).
//
// Estratégia adotada (detalhe de implementação desta tarefa — não há um
// mecanismo de sanitização de prompt injection definido em SDD.md/ADRs):
// NEUTRALIZAÇÃO, não rejeição total. Um texto livre com tentativa de
// instrução embutida é normalizado (marcadores de papel/delimitador
// removidos, frases de override conhecidas redigidas) e o restante do
// conteúdo legítimo é preservado — rejeitar a submissão inteira sempre que
// uma substring suspeita aparecer arriscaria falsos positivos bloqueando um
// nome de destino real (ex. um destino cujo nome contém coincidentemente uma
// palavra da lista), e nenhuma regra de negócio (RN-04 é especificamente
// sobre orçamento, mas o espírito de "nunca travar o fluxo por um filtro de
// conteúdo" se aplica aqui também) justificaria essa rejeição total. Defesa
// em profundidade, não a única camada: o prompt em si já isola o valor
// dentro de uma frase fixa em português (`Destino já aprovado pelo usuário:
// ${nome}.`), nunca concatena o texto do usuário como se fosse uma instrução
// de sistema.
//
// Fora de escopo desta tarefa: qualquer sanitização de campo NUMÉRICO
// (orçamento em `TripSession.budgetAmount`, já validado estruturalmente via
// Zod/Prisma `Decimal`, sem superfície de prompt injection textual);
// filtragem semântica via segunda chamada de LLM (custo/latência extra sem
// justificativa dada o tamanho pequeno do campo, decisão de implementação);
// alteração de `buildXPrompt`/`StageContext` (`./prompts.ts`) — a
// sanitização acontece ANTES do valor entrar no `StageContext`, no ponto de
// captura (Server Action), não dentro do Gateway de IA.

/**
 * Marcadores de papel/delimitador de conversa que um texto de usuário nunca
 * deveria legitimamente conter (nome de destino, orçamento em texto livre)
 * — tentativa clássica de "escapar" o campo e simular uma nova mensagem de
 * sistema/assistente, ou um delimitador de framework de prompting. Removidos
 * (substituídos por um espaço) independentemente de contexto, sem tentar
 * interpretar a frase ao redor.
 */
const DELIMITER_PATTERNS: readonly RegExp[] = [
  /```[a-z]*/gi, // cercas de código markdown (```, ```system, etc.)
  /<\|[^|]*\|>/g, // tokens de controle estilo `<|im_start|>system<|...|>`
  /\[\s*\/?\s*(system|inst|assistant|user)\s*\]/gi, // `[INST]`, `[/INST]`, `[SYSTEM]`
  /^\s*(system|assistant|user|developer)\s*:/gim, // "System:" no início de uma linha
  /#{2,}/g, // "###"/"####" usados para simular um novo cabeçalho de seção
  /-{3,}/g, // "---" usado como separador de seção
];

/**
 * Frases conhecidas de tentativa de override de instrução (PT-BR e EN, as
 * duas línguas plausíveis de aparecer — o app é PT-BR, mas o provider
 * entende EN e um atacante pode tentar em inglês mesmo assim). Cada padrão
 * casa a frase INTEIRA de intenção, não uma palavra isolada comum (evita
 * falso positivo em texto legítimo que contenha só uma das palavras, ex. um
 * destino chamado "Instrução" não deveria disparar isso sozinho).
 */
// Ordem importa: padrões que capturam uma FRASE inteira (verbo + objeto,
// ex. "revele o prompt do sistema") vêm ANTES dos padrões mais genéricos que
// capturam só um fragmento dela (ex. "prompt do sistema" sozinho) — assim a
// frase completa é neutralizada de uma vez, em vez de deixar um resíduo
// (ex. "revele o" sobrando) por já ter perdido o objeto para um padrão
// anterior mais estreito.
const INJECTION_PHRASE_PATTERNS: readonly RegExp[] = [
  /ignor[ae]\s+(a\s+)?tudo/gi,
  /ignor[ae]\s+(todas?\s+)?(as\s+|suas\s+)?instru[cç][oõ]es?(\s+(anteriores|acima|do\s+sistema))?/gi,
  /ignore\s+(all\s+|your\s+)?(previous|above|prior)\s+instructions?/gi,
  /esque[cç]a\s+(tudo|todas\s+as\s+instru[cç][oõ]es|o\s+que\s+foi\s+dito)/gi,
  /disregard\s+(the\s+)?(above|previous|prior)/gi,
  /desconsidere\s+(as\s+)?(instru[cç][oõ]es|regras)/gi,
  /voc[eê]\s+(agora\s+)?[ée]\s+(um[a]?\s+)?(novo|nova|outro|outra)\s+assistente/gi,
  /you\s+are\s+now\s+/gi,
  /aja\s+como\s+(um|uma|se)/gi,
  /act\s+as\s+(if\s+you\s+are|a[n]?)/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,
  /finja\s+(que\s+)?(ser|é)/gi,
  /novas?\s+instru[cç][oõ]es\s*:/gi,
  /new\s+instructions?\s*:/gi,
  /developer\s+mode/gi,
  /modo\s+desenvolvedor/gi,
  // Frases completas de "revelar prompt" (PT/EN), incluindo o caso em que o
  // objeto vem qualificado por "do sistema"/"system" — capturadas ANTES dos
  // padrões genéricos abaixo para não deixar resíduo.
  /revele\s+(o\s+|seu\s+)?(prompt(\s+do\s+sistema)?|(o\s+|seu\s+)?system\s+prompt|as\s+instru[cç][oõ]es(\s+do\s+sistema)?)/gi,
  /reveal\s+(your|the)\s+(system\s+)?(prompts?|instructions|system\s+message)/gi,
  /repita\s+(o\s+|seu\s+)?prompt/gi,
  /responda\s+(sempre\s+)?em\s+(ingl[eê]s|outro\s+formato)/gi,
  // Padrões genéricos residuais (fallback) — cobrem menção isolada a
  // "system prompt"/"prompt do sistema" fora do escopo das frases completas
  // acima (ex. um texto que só cita o termo sem verbo de ataque explícito).
  /system\s+prompt/gi,
  /prompt\s+(do\s+)?sistema/gi,
];

/** Substitui um trecho reconhecido como tentativa de injeção por um espaço — preserva o restante do texto legítimo ao redor, em vez de descartar a submissão inteira. */
const NEUTRALIZED_PLACEHOLDER = " ";

/**
 * Normaliza quebras de linha/tabs em espaço simples. Texto de destino/
 * orçamento é sempre uma única linha por natureza — multi-linha só serve
 * para simular a chegada de uma nova "mensagem"/turno dentro do mesmo campo
 * (uma técnica comum de prompt injection), então é sempre neutralizado, sem
 * exceção.
 */
function collapseLineBreaks(value: string): string {
  return value.replace(/[\r\n\t\v\f]+/g, " ");
}

function stripDelimiterMarkers(value: string): string {
  let result = value;
  for (const pattern of DELIMITER_PATTERNS) {
    result = result.replace(pattern, NEUTRALIZED_PLACEHOLDER);
  }
  return result;
}

function redactInjectionPhrases(value: string): string {
  let result = value;
  for (const pattern of INJECTION_PHRASE_PATTERNS) {
    result = result.replace(pattern, NEUTRALIZED_PLACEHOLDER);
  }
  return result;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s{2,}/g, " ").trim();
}

export type SanitizeFreeTextForPromptOptions = {
  /** Tamanho máximo do texto já sanitizado (truncagem aplicada por último). */
  maxLength: number;
};

/**
 * Sanitiza um campo de texto livre do usuário (hoje: destino manual) antes
 * de ele entrar em `StageContext`/ser interpolado em qualquer `buildXPrompt`
 * (`./prompts.ts`). `null`/`undefined`/string vazia após sanitização
 * retornam `""` — cabe ao chamador decidir se um resultado vazio é um erro
 * de validação (ex. `InvalidManualDestinoError`, campo obrigatório) ou um
 * caminho alternativo válido (ex. "sem destino").
 *
 * Ordem das etapas (cada uma reduz um vetor diferente de ataque):
 * 1. Trim + colapso de quebra de linha/tab (evita simular múltiplas
 *    "mensagens" dentro de um único campo de texto).
 * 2. Remoção de marcadores de papel/delimitador (`System:`, ```` ``` ````,
 *    `[INST]`, `<|...|>`, `###`, `---`).
 * 3. Redação de frases conhecidas de override de instrução (PT-BR/EN).
 * 4. Colapso de espaços redundantes deixados pelas remoções acima.
 * 5. Truncagem para `options.maxLength` (mesmo limite de tamanho já em uso
 *    pelos chamadores, ex. `DESTINO_MAX_LENGTH = 200`).
 */
export function sanitizeFreeTextForPrompt(
  rawValue: string | null | undefined,
  options: SanitizeFreeTextForPromptOptions,
): string {
  const initial = (rawValue ?? "").trim();
  if (!initial) {
    return "";
  }

  let sanitized = collapseLineBreaks(initial);
  sanitized = stripDelimiterMarkers(sanitized);
  sanitized = redactInjectionPhrases(sanitized);
  sanitized = collapseWhitespace(sanitized);

  return sanitized.slice(0, options.maxLength).trim();
}

/**
 * Detecta (sem sanitizar) se um texto livre contém algum padrão conhecido de
 * tentativa de prompt injection — usado só para observabilidade/decisão de
 * log pelo chamador (ex. um futuro `console.warn`/auditoria), nunca como
 * critério de rejeição total (ver decisão de "neutralização, não rejeição"
 * no cabeçalho deste arquivo). Roda sobre o texto ORIGINAL (pré-sanitização),
 * não sobre o resultado já neutralizado.
 */
export function containsPromptInjectionAttempt(
  rawValue: string | null | undefined,
): boolean {
  const value = (rawValue ?? "").trim();
  if (!value) {
    return false;
  }
  return (
    DELIMITER_PATTERNS.some((pattern) => new RegExp(pattern).test(value)) ||
    INJECTION_PHRASE_PATTERNS.some((pattern) => new RegExp(pattern).test(value))
  );
}
