/** Folder (next to the worker bundle) where angular.json copies the ONNX Runtime WASM files. */
const ORT_FOLDER = 'onnx/';

export interface OrtWasmPaths {
  mjs: string;
  wasm: string;
}

/**
 * Local ONNX Runtime files instead of the jsDelivr CDN, so the local AI keeps working in
 * clinics with blocked or no internet. Mirrors Transformers.js' choice of build: asyncify,
 * except Safari below 26 without WebGPU, which needs the plain build.
 */
export function resolveOrtWasmPaths(workerUrl: string, { userAgent, hasWebGpu }: { userAgent: string; hasWebGpu: boolean }): OrtWasmPaths {
  const safariVersion = /Version\/(\d+)[\d.]* .*Safari\//.exec(userAgent);
  const legacySafari = !!safariVersion && Number(safariVersion[1]) < 26 && !/Chrome|Chromium|Edg\//.test(userAgent);
  const suffix = legacySafari && !hasWebGpu ? '' : '.asyncify';
  const base = new URL(ORT_FOLDER, workerUrl);
  return {
    mjs: new URL(`ort-wasm-simd-threaded${suffix}.mjs`, base).href,
    wasm: new URL(`ort-wasm-simd-threaded${suffix}.wasm`, base).href,
  };
}
