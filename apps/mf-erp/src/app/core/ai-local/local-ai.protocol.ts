import { ExpenseCategory, RankedItem } from './semantic-math';

export const LOCAL_EMBEDDINGS_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const LOCAL_CLASSIFIER_MODEL = 'onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX';
export const LOCAL_CLASSIFIER_REVISION = 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e';
export const EXPENSE_LABELS = {
  SERVICIOS_BASICOS: 'servicios básicos',
  INSUMOS: 'insumos odontológicos',
  ALQUILER: 'alquiler del consultorio',
  OTROS: 'otros gastos',
} as const;

export type LocalAiStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface SearchableItem {
  id: string;
  text: string;
}

export type LocalAiRequest =
  | { type: 'init'; model: string; allowRemote: boolean }
  | { type: 'search'; requestId: number; query: string; items: SearchableItem[]; limit: number; minScore: number }
  | { type: 'classify'; requestId: number; text: string };

export interface ClassificationScores {
  category: ExpenseCategory;
  score: number;
  scores: Record<ExpenseCategory, number>;
}

export type LocalAiResponse =
  | { type: 'status'; status: LocalAiStatus; progress?: number; device?: string; error?: string }
  | { type: 'search-result'; requestId: number; results: RankedItem[] }
  | { type: 'classify-result'; requestId: number; result: ClassificationScores }
  | { type: 'request-error'; requestId: number; message: string };
