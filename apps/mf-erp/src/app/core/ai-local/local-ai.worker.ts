/// <reference lib="webworker" />
import { env, pipeline, XLMRobertaTokenizer, AutoModelForSequenceClassification, ZeroShotClassificationPipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import {
  EXPENSE_LABELS, LOCAL_CLASSIFIER_MODEL, LOCAL_CLASSIFIER_REVISION, LOCAL_EMBEDDINGS_MODEL,
  type ClassificationScores, type LocalAiRequest, type LocalAiResponse,
} from './local-ai.protocol';
import { resolveOrtWasmPaths } from './onnx-runtime-paths';
import { EXPENSE_CATEGORIES, rankBySimilarity } from './semantic-math';

// Only artifact GETs go to the model hub; user text stays inside this dedicated worker.
// Never probe the shell/backend's /models directory. HF's Cache API handles artifact reuse.
env.allowLocalModels = false;
env.useBrowserCache = true;
const fetchModelResource = env.fetch;
const denyOfflineResource = async (): Promise<never> => { throw new Error('Offline model resource cache miss'); };
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = resolveOrtWasmPaths(import.meta.url, {
    userAgent: navigator.userAgent, hasWebGpu: 'gpu' in navigator,
  });
  // Avoid nested cross-origin worker construction in federated deployments.
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

let sessions: Promise<{ extractor: FeatureExtractionPipeline; classifier: ZeroShotClassificationPipeline }> | null = null;
// Intentionally memory-only: no legacy L12/Dexie vectors are read. Exact text is the
// key within this fixed L6 session, so edits/deletions cannot reuse a service ID's vector.
const embeddingCache = new Map<string, number[]>();
const MAX_VECTORS = 2048;
let work = Promise.resolve();
const post = (message: LocalAiResponse) => postMessage(message);

async function loadClassifierTokenizer(allowRemote: boolean) {
  // All SDK 4.3 tokenizer loaders discover files at main before honoring revision.
  // Use the public constructor with exact pinned JSON and the SDK's browser cache.
  const cache = await caches.open(env.cacheKey);
  const resources = [];
  for (const file of ['tokenizer.json', 'tokenizer_config.json']) {
    const url = `https://huggingface.co/${LOCAL_CLASSIFIER_MODEL}/resolve/${LOCAL_CLASSIFIER_REVISION}/${file}`;
    const cached = await cache.match(url);
    if (!cached && !allowRemote) throw new Error('Offline tokenizer cache miss');
    const response = cached ?? await env.fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('Tokenizer resource unavailable');
    const json = await response.clone().json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid tokenizer JSON');
    resources.push({ url, json, response: cached ? null : response });
  }
  if (resources[1].json.tokenizer_class !== 'XLMRobertaTokenizer') throw new Error('Unsupported classifier tokenizer');
  const tokenizer = new XLMRobertaTokenizer(resources[0].json, resources[1].json);
  // Invalid JSON/tokenizers never enter cache. Persistence failure is not ready.
  for (const resource of resources) if (resource.response) await cache.put(resource.url, resource.response);
  return tokenizer;
}

function load(allowRemote: boolean) {
  if (sessions) return sessions;
  // SDK 4.3 requires one source enabled BEFORE checking cache. Offline local
  // loading admits cache hits; its supported fetch hook denies cache-miss probes
  // (including /models), without changing global fetch or online SDK behavior.
  env.allowLocalModels = !allowRemote;
  env.allowRemoteModels = allowRemote;
  env.fetch = allowRemote ? fetchModelResource : denyOfflineResource;
  post({ type: 'status', status: 'loading', device: 'wasm' });
  const progress = (info: { status: string; progress?: number }) => {
    if ((info.status === 'progress' || info.status === 'progress_total') && Number.isFinite(info.progress)) {
      // Per-file progress is not proof that either model has finished initializing.
      post({ type: 'status', status: 'downloading', progress: Math.min(99, Math.max(0, Math.round(info.progress!))), device: 'wasm' });
    }
  };
  sessions = (async () => {
    // Sequential creation bounds peak initialization memory; the promise single-flights both.
    const extractor = await pipeline('feature-extraction', LOCAL_EMBEDDINGS_MODEL, {
      dtype: 'q8', device: 'wasm', progress_callback: progress,
    });
    try {
      // SDK 4.3's pipeline file-discovery preflight omits revision. Public direct
      // loaders pin every classifier artifact instead of probing unversioned main.
      const options = { dtype: 'q8' as const, device: 'wasm' as const,
        revision: LOCAL_CLASSIFIER_REVISION, progress_callback: progress };
      const tokenizer = await loadClassifierTokenizer(allowRemote);
      const model = await AutoModelForSequenceClassification.from_pretrained(LOCAL_CLASSIFIER_MODEL, options);
      try {
        const classifier = new ZeroShotClassificationPipeline({ task: 'zero-shot-classification', model, tokenizer });
        post({ type: 'status', status: 'ready', progress: 100, device: 'wasm' });
        return { extractor, classifier };
      } catch (error) {
        await model.dispose();
        throw error;
      }
    } catch (error) {
      await extractor.dispose();
      throw error;
    }
  })();
  return sessions;
}

async function embed(extractor: FeatureExtractionPipeline, texts: string[]): Promise<number[][]> {
  const vectors = new Map<string, number[]>();
  const missing = [...new Set(texts)].filter((text) => {
    const cached = embeddingCache.get(text);
    if (cached) vectors.set(text, cached);
    return !cached;
  });
  for (let i = 0; i < missing.length; i += 32) {
    const batch = missing.slice(i, i + 32);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    const rows = output.tolist() as number[][];
    if (rows.length !== batch.length || rows.some((row) => !Array.isArray(row) || !row.length || row.some((v) => !Number.isFinite(v)))) {
      throw new Error('Invalid embedding output');
    }
    rows.forEach((vector, index) => {
      vectors.set(batch[index], vector);
      embeddingCache.set(batch[index], vector);
      if (embeddingCache.size > MAX_VECTORS) embeddingCache.delete(embeddingCache.keys().next().value!);
    });
  }
  return texts.map((text) => vectors.get(text)!);
}

async function classify(classifier: ZeroShotClassificationPipeline, text: string): Promise<ClassificationScores> {
  const output = await classifier(text, Object.values(EXPENSE_LABELS), {
    hypothesis_template: 'Este gasto corresponde a {}.', multi_label: false,
  });
  if (Array.isArray(output) || output.labels.length !== 4 || output.scores.length !== 4 || new Set(output.labels).size !== 4) {
    throw new Error('Invalid zero-shot output');
  }
  const scores = {} as ClassificationScores['scores'];
  for (const category of EXPENSE_CATEGORIES) {
    const index = output.labels.indexOf(EXPENSE_LABELS[category]);
    const score = output.scores[index];
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid zero-shot score');
    scores[category] = score;
  }
  const category = EXPENSE_CATEGORIES.reduce((best, current) => scores[current] > scores[best] ? current : best);
  return { category, score: scores[category], scores };
}

addEventListener('message', async ({ data }: MessageEvent<LocalAiRequest>) => {
  if (data?.type === 'init') {
    try {
      if (data.model !== LOCAL_EMBEDDINGS_MODEL) throw new Error('Unsupported model');
      await load(data.allowRemote);
    } catch {
      sessions = null;
      embeddingCache.clear();
      post({ type: 'status', status: data.allowRemote ? 'error' : 'unavailable', error: 'No se pudieron cargar los modelos de IA local.' });
    }
    return;
  }
  // ORT pipelines and the vector cache are serialized; response IDs still correlate callers.
  const current = work.then(async () => {
    try {
      if (!data || !('requestId' in data) || !Number.isSafeInteger(data.requestId)) throw new Error('Invalid request');
      if (!sessions) throw new Error('Models unavailable');
      const { extractor, classifier } = await sessions;
      if (data.type === 'search') {
        const [query, ...vectors] = await embed(extractor, [data.query, ...data.items.map((item) => item.text)]);
        const results = rankBySimilarity(query, data.items.map((item, i) => ({ id: item.id, vector: vectors[i] })), { limit: data.limit, minScore: data.minScore });
        post({ type: 'search-result', requestId: data.requestId, results });
      } else if (data.type === 'classify') {
        post({ type: 'classify-result', requestId: data.requestId, result: await classify(classifier, data.text) });
      } else throw new Error('Unknown request');
    } catch {
      // Never echo user/expense text or runtime URLs in errors.
      post({ type: 'request-error', requestId: data?.requestId, message: 'La inferencia de IA local no está disponible.' });
    }
  });
  work = current;
  await current;
});
