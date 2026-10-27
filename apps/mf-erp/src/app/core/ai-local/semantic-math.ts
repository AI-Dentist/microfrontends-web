export const EXPENSE_CATEGORIES = ['SERVICIOS_BASICOS', 'INSUMOS', 'ALQUILER', 'OTROS'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Natural-language descriptions embedded once and compared against each expense description. */
export const CATEGORY_PROTOTYPES: Record<ExpenseCategory, string> = {
  SERVICIOS_BASICOS: 'pago de servicios basicos: electricidad, luz, agua, gas, internet, telefono, factura de CRE, Saguapac, Tigo, Entel',
  INSUMOS: 'compra de insumos y materiales odontologicos: anestesia, lidocaina, agujas, guantes, resina, algodon, barbijos, instrumental',
  ALQUILER: 'pago de alquiler, renta o anticretico del consultorio, local u oficina',
  OTROS: 'otros gastos varios: refrigerio, transporte, limpieza, papeleria, mantenimiento',
};

// Keywords of five or more characters also match as word prefixes (insumo -> insumos);
// shorter ones (cre, luz, gas) must match a whole word to avoid hits like "credito" or "gasas".
const CATEGORY_KEYWORDS: Record<Exclude<ExpenseCategory, 'OTROS'>, string[]> = {
  INSUMOS: ['insumo', 'lidocaina', 'anestesi', 'aguja', 'guante', 'resina', 'algodon', 'barbijo', 'gasa', 'gasas', 'jeringa', 'composite', 'amalgama', 'material', 'instrumental', 'fresa'],
  ALQUILER: ['alquiler', 'renta', 'anticretico', 'arriendo'],
  SERVICIOS_BASICOS: ['electricidad', 'luz', 'agua', 'gas', 'internet', 'telefono', 'cre', 'saguapac', 'tigo', 'entel', 'viva', 'cotas', 'servicio basico', 'servicios basicos'],
};

function containsKeyword(paddedText: string, keyword: string): boolean {
  return paddedText.includes(keyword.length >= 5 ? ` ${keyword}` : ` ${keyword} `);
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RankedItem {
  id: string;
  score: number;
}

export function rankBySimilarity(
  query: ArrayLike<number>,
  items: readonly { id: string; vector: ArrayLike<number> }[],
  { limit = items.length, minScore = -Infinity }: { limit?: number; minScore?: number } = {},
): RankedItem[] {
  return items
    .map((item) => ({ id: item.id, score: cosineSimilarity(query, item.vector) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'las', 'los', 'con', 'y', 'en', 'para', 'por', 'un', 'una', 'al']);

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Lexical search used while the embeddings model is not available (first offline session). */
export function rankByKeywordOverlap(
  query: string,
  items: readonly { id: string; text: string }[],
  limit = items.length,
): RankedItem[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }
  return items
    .map((item) => {
      const itemTokens = tokenize(item.text);
      const matches = queryTokens.filter((q) => itemTokens.some((t) => t.startsWith(q))).length;
      return { id: item.id, score: matches / queryTokens.length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Deterministic fallback used while the local model is not available yet. */
export function classifyByKeywords(description: string): ExpenseCategory {
  const words = ` ${normalizeText(description)} `;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ExpenseCategory, string[]][]) {
    if (keywords.some((keyword) => containsKeyword(words, keyword))) {
      return category;
    }
  }
  return 'OTROS';
}
