import { vi } from 'vitest';
import { LOCAL_EMBEDDINGS_MODEL } from './local-ai.protocol';

const mocks = vi.hoisted(() => ({ pipeline: vi.fn(), fetch: vi.fn(), AutoTokenizer: { from_pretrained: vi.fn() }, AutoModelForSequenceClassification: { from_pretrained: vi.fn() }, ZeroShotClassificationPipeline: vi.fn(), XLMRobertaTokenizer: vi.fn(), cache: { match: vi.fn(), put: vi.fn() }, env: { fetch: vi.fn(), allowLocalModels: true, allowRemoteModels: true, useBrowserCache: false, cacheKey: 'transformers-cache', backends: { onnx: { wasm: {} } } } }));
vi.mock('@huggingface/transformers', () => mocks);

// Pipeline contract tests only: no model artifacts or neural inference are downloaded.
describe('dedicated local AI worker contract', () => {
  let receive: (event: MessageEvent) => Promise<void>;
  let messages: any[];
  let embed: ReturnType<typeof vi.fn>;
  let classify: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    messages = [];
    mocks.env.fetch = mocks.fetch.mockReset().mockRejectedValue(new Error('Unexpected resource request'));
    vi.stubGlobal('navigator', { userAgent: 'Worker fixture' });
    embed = vi.fn(async (texts: string[]) => ({ tolist: () => texts.map((text) => text.includes('muela') ? [1, 0] : [0, 1]) }));
    classify = vi.fn(async () => ({ labels: ['alquiler del consultorio', 'insumos odontológicos', 'servicios básicos', 'otros gastos'], scores: [0.7, 0.2, 0.08, 0.02] }));
    Object.assign(embed, { dispose: vi.fn(async () => undefined) });
    mocks.cache.match.mockReset().mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('tokenizer_config.json') ? { tokenizer_class: 'XLMRobertaTokenizer', model_max_length: 512 } : { model: { type: 'Unigram' } })));
    mocks.cache.put.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('caches', { open: vi.fn(async () => mocks.cache) });
    mocks.XLMRobertaTokenizer.mockReset().mockImplementation(function () { return { fixture: 'tokenizer' }; });
    mocks.AutoTokenizer.from_pretrained.mockReset().mockResolvedValue({ fixture: 'tokenizer' });
    mocks.AutoModelForSequenceClassification.from_pretrained.mockReset().mockResolvedValue({ dispose: vi.fn(async () => undefined) });
    mocks.ZeroShotClassificationPipeline.mockReset().mockImplementation(function () { return classify; });
    mocks.pipeline.mockReset().mockImplementation(async (task: string) => task === 'feature-extraction' ? embed : classify);
    vi.stubGlobal('addEventListener', (type: string, listener: any) => { if (type === 'message') receive = listener; });
    vi.stubGlobal('postMessage', (message: any) => messages.push(message));
    await import('./local-ai.worker');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const init = { type: 'init', model: LOCAL_EMBEDDINGS_MODEL, allowRemote: true };
  it('uses exact q8 WASM embedding and Spanish NLI sessions, cache only, and single-flight initialization', async () => {
    expect(LOCAL_EMBEDDINGS_MODEL).toBe('Xenova/all-MiniLM-L6-v2');
    await Promise.all([receive({ data: init } as MessageEvent), receive({ data: init } as MessageEvent)]);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.pipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2', expect.objectContaining({ dtype: 'q8', device: 'wasm' }));
    expect(mocks.XLMRobertaTokenizer).toHaveBeenCalledTimes(1);
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).toHaveBeenCalledTimes(1);
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).toHaveBeenCalledWith('onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX', expect.objectContaining({ dtype: 'q8', device: 'wasm', revision: 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e' }));
    expect(mocks.ZeroShotClassificationPipeline).toHaveBeenCalledTimes(1);
    expect(mocks.env.allowLocalModels).toBe(false);
    expect(mocks.env.allowRemoteModels).toBe(true);
    expect(mocks.env.fetch).toBe(mocks.fetch);
    expect(mocks.env.useBrowserCache).toBe(true);
    expect(messages.at(-1)).toMatchObject({ type: 'status', status: 'ready' });
  });
  it('never probes unpinned classifier metadata through the SDK pipeline preflight', async () => {
    const probes: string[] = [];
    // Installed SDK 4.3.1 preflight drops revision before its main config probe.
    // This fixture models that observed request, not actual downloaded inference.
    mocks.pipeline.mockImplementation(async (task: string) => {
      if (task === 'zero-shot-classification') { probes.push('main'); throw new Error('Unpinned SDK metadata probe'); }
      return embed;
    });
    mocks.AutoTokenizer.from_pretrained.mockImplementation(async () => {
      probes.push('main/tokenizer_config.json'); throw new Error('Unpinned tokenizer metadata probe');
    });
    await receive({ data: init } as MessageEvent);
    expect(messages.at(-1)).toMatchObject({ status: 'ready' });
    expect(probes).toEqual([]);
    const model = 'onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX';
    expect(mocks.AutoTokenizer.from_pretrained).not.toHaveBeenCalled();
    const root = `https://huggingface.co/${model}/resolve/ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e/`;
    expect(mocks.cache.match.mock.calls.map(([url]) => url)).toEqual([`${root}tokenizer.json`, `${root}tokenizer_config.json`]);
    expect(mocks.XLMRobertaTokenizer).toHaveBeenCalledWith({ model: { type: 'Unigram' } }, { tokenizer_class: 'XLMRobertaTokenizer', model_max_length: 512 });
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).toHaveBeenCalledWith(model,
      expect.objectContaining({ revision: 'ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e', dtype: 'q8', device: 'wasm' }));
    expect(mocks.ZeroShotClassificationPipeline).toHaveBeenCalledWith(expect.objectContaining({ task: 'zero-shot-classification' }));
  });

  it('loads online tokenizer cache misses anonymously at the pin and stores only validated responses', async () => {
    mocks.cache.match.mockResolvedValue(undefined);
    const json = (url: string) => url.endsWith('tokenizer_config.json') ? { tokenizer_class: 'XLMRobertaTokenizer', model_max_length: 512 } : { model: { type: 'Unigram' } };
    mocks.fetch.mockImplementation(async (url: string) => new Response(JSON.stringify(json(url))));
    await receive({ data: init } as MessageEvent);
    expect(messages.at(-1)).toEqual({ type: 'status', status: 'ready', progress: 100, device: 'wasm' });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.cache.put).toHaveBeenCalledTimes(2);
    for (const [url, options] of mocks.fetch.mock.calls) {
      expect(url).toMatch(/\/resolve\/ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e\/tokenizer(?:_config)?\.json$/);
      expect(options).toEqual({ credentials: 'omit' });
      const stored = mocks.cache.put.mock.calls.find(([key]) => key === url);
      expect(stored).toBeDefined();
      expect(await stored![1].json()).toEqual(json(url));
    }
  });
  it('rejects an offline tokenizer cache miss after embedding hits without any resource fallback or ready', async () => {
    modelCache(true); mocks.cache.match.mockResolvedValue(undefined);
    await receive({ data: { ...init, allowRemote: false } } as MessageEvent);
    expect(messages).toEqual([
      { type: 'status', status: 'loading', device: 'wasm' },
      { type: 'status', status: 'unavailable', error: 'No se pudieron cargar los modelos de IA local.' },
    ]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.cache.put).not.toHaveBeenCalled();
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).not.toHaveBeenCalled();
    expect((embed as any).dispose).toHaveBeenCalledTimes(1);
  });
  it.each(['invalid JSON', 'invalid tokenizer'])('rejects %s before storing downloaded artifacts or exposing ready', async (failure) => {
    mocks.cache.match.mockResolvedValue(undefined);
    mocks.fetch.mockImplementation(async (url: string) => new Response(failure === 'invalid JSON' ? 'broken JSON' :
      JSON.stringify(url.endsWith('tokenizer_config.json') ? { tokenizer_class: 'XLMRobertaTokenizer' } : { model: {} })));
    if (failure === 'invalid tokenizer') mocks.XLMRobertaTokenizer.mockImplementation(function () { throw new Error('Invalid tokenizer fixture'); });
    await receive({ data: init } as MessageEvent);
    expect(messages).toEqual([
      { type: 'status', status: 'loading', device: 'wasm' },
      { type: 'status', status: 'error', error: 'No se pudieron cargar los modelos de IA local.' },
    ]);
    expect(mocks.cache.put).not.toHaveBeenCalled();
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).not.toHaveBeenCalled();
    expect((embed as any).dispose).toHaveBeenCalledTimes(1);
  });
  it('does not claim ready when tokenizer persistence fails', async () => {
    mocks.cache.match.mockResolvedValue(undefined);
    mocks.fetch.mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith('tokenizer_config.json') ?
      { tokenizer_class: 'XLMRobertaTokenizer' } : { model: {} })));
    mocks.cache.put.mockRejectedValueOnce(new Error('Cache write denied'));
    await receive({ data: init } as MessageEvent);
    expect(messages.at(-1)).toEqual({ type: 'status', status: 'error', error: 'No se pudieron cargar los modelos de IA local.' });
    expect(messages.some((message) => message.status === 'ready')).toBe(false);
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).not.toHaveBeenCalled();
    expect((embed as any).dispose).toHaveBeenCalledTimes(1);
  });
  // Modeled SDK 4.3.1 guard/cache ordering, NOT real neural/browser cache evidence.
  function modelCache(complete: boolean) {
    mocks.pipeline.mockImplementation(async (task: string) => {
      if (!mocks.env.allowLocalModels && !mocks.env.allowRemoteModels) throw new Error('Both sources disabled before cache');
      if (!complete) {
        await mocks.env.fetch('/models/fixture/config.json');
        throw new Error('Cache miss');
      }
      return task === 'feature-extraction' ? embed : classify;
    });
  }
  it('initializes both sessions from a modeled completed cache offline', async () => {
    modelCache(true);
    await receive({ data: { ...init, allowRemote: false } } as MessageEvent);
    expect(messages).toEqual([
      { type: 'status', status: 'loading', device: 'wasm' },
      { type: 'status', status: 'ready', progress: 100, device: 'wasm' },
    ]);
    expect(mocks.pipeline).toHaveBeenCalledTimes(1);
    expect(mocks.XLMRobertaTokenizer).toHaveBeenCalledTimes(1);
    expect(mocks.AutoModelForSequenceClassification.from_pretrained).toHaveBeenCalledTimes(1);
    expect(mocks.env.allowRemoteModels).toBe(false);
    expect(mocks.env.useBrowserCache).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });
  it('reports a modeled cold cache unavailable without ready or resource fallback; online retry restores loading', async () => {
    modelCache(false);
    await receive({ data: { ...init, allowRemote: false } } as MessageEvent);
    expect(messages).toEqual([
      { type: 'status', status: 'loading', device: 'wasm' },
      { type: 'status', status: 'unavailable', error: 'No se pudieron cargar los modelos de IA local.' },
    ]);
    expect(mocks.env.allowRemoteModels).toBe(false);
    await expect(mocks.env.fetch('https://huggingface.co/fixture')).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    modelCache(true);
    await receive({ data: init } as MessageEvent);
    expect(mocks.env.allowLocalModels).toBe(false);
    expect(mocks.env.allowRemoteModels).toBe(true);
    expect(mocks.env.fetch).toBe(mocks.fetch);
    expect(messages.at(-1)).toEqual({ type: 'status', status: 'ready', progress: 100, device: 'wasm' });
  });
  it('waits for both real session promises before ready and reports actual progress', async () => {
    let release!: () => void;
    mocks.pipeline.mockImplementation(async (_task: string, _model: string, options: any) => {
      options.progress_callback({ status: 'progress', progress: 37 });
      return embed;
    });
    mocks.AutoModelForSequenceClassification.from_pretrained.mockImplementation(async (_model: string, options: any) => {
      options.progress_callback({ status: 'progress', progress: 37 });
      return new Promise((resolve) => { release = () => resolve({ dispose: vi.fn(async () => undefined) }); });
    });
    const loading = receive({ data: init } as MessageEvent);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(messages.some((m) => m.status === 'ready')).toBe(false);
    expect(messages).toContainEqual(expect.objectContaining({ status: 'downloading', progress: 37 }));
    release(); await loading;
    expect(messages.at(-1).status).toBe('ready');
  });
  it('mean-pools normalized embeddings and ranks by cosine in the worker; service edits never reuse old vectors', async () => {
    await receive({ data: init } as MessageEvent);
    const search = { type: 'search', requestId: 7, query: 'sacar muela podrida', items: [{ id: 'a', text: 'muela' }, { id: 'b', text: 'limpieza' }], limit: 1, minScore: 0.3 };
    await receive({ data: search } as MessageEvent);
    expect(embed).toHaveBeenCalledWith(['sacar muela podrida', 'muela', 'limpieza'], { pooling: 'mean', normalize: true });
    expect(messages.at(-1)).toEqual({ type: 'search-result', requestId: 7, results: [{ id: 'a', score: 1 }] });
    await receive({ data: { ...search, requestId: 8, items: [{ id: 'a', text: 'limpieza' }] } } as MessageEvent);
    expect(messages.at(-1)).toEqual({ type: 'search-result', requestId: 8, results: [] });
  });
  it('maps only genuine zero-shot output, not input keywords, to the four accounting categories', async () => {
    await receive({ data: init } as MessageEvent);
    await receive({ data: { type: 'classify', requestId: 9, text: 'luz agua guantes' } } as MessageEvent);
    expect(classify).toHaveBeenCalledWith('luz agua guantes', ['servicios básicos', 'insumos odontológicos', 'alquiler del consultorio', 'otros gastos'], { hypothesis_template: 'Este gasto corresponde a {}.', multi_label: false });
    expect(messages.at(-1)).toEqual({ type: 'classify-result', requestId: 9, result: { category: 'ALQUILER', score: 0.7, scores: { ALQUILER: 0.7, INSUMOS: 0.2, SERVICIOS_BASICOS: 0.08, OTROS: 0.02 } } });
  });
  it('fails visibly on session or model-output failure with no manufactured category', async () => {
    mocks.pipeline.mockRejectedValueOnce(new Error('session unavailable'));
    await receive({ data: init } as MessageEvent);
    expect(messages.at(-1)).toMatchObject({ status: 'error' });
    expect(messages.some((m) => m.status === 'ready')).toBe(false);
    // Retry is explicit and starts fresh, never reuses incompatible persisted vectors.
    await receive({ data: init } as MessageEvent);
    classify.mockResolvedValueOnce({ labels: ['unknown'], scores: [1] });
    await receive({ data: { type: 'classify', requestId: 10, text: 'anything' } } as MessageEvent);
    expect(messages.at(-1)).toMatchObject({ type: 'request-error', requestId: 10 });
  });
});
