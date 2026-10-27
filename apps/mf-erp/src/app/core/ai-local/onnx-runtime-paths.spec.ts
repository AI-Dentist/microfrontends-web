import { resolveOrtWasmPaths } from './onnx-runtime-paths';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const SAFARI_18 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';
const SAFARI_26 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

describe('resolveOrtWasmPaths', () => {
  const base = 'http://localhost:4201/worker-ABC.js';

  it('serves the asyncify build from the local onnx folder next to the worker', () => {
    expect(resolveOrtWasmPaths(base, { userAgent: CHROME, hasWebGpu: true })).toEqual({
      mjs: 'http://localhost:4201/onnx/ort-wasm-simd-threaded.asyncify.mjs',
      wasm: 'http://localhost:4201/onnx/ort-wasm-simd-threaded.asyncify.wasm',
    });
  });

  it('uses the plain build on Safari below 26 without WebGPU', () => {
    expect(resolveOrtWasmPaths(base, { userAgent: SAFARI_18, hasWebGpu: false })).toEqual({
      mjs: 'http://localhost:4201/onnx/ort-wasm-simd-threaded.mjs',
      wasm: 'http://localhost:4201/onnx/ort-wasm-simd-threaded.wasm',
    });
  });

  it('keeps asyncify on Safari 26 and on old Safari with WebGPU', () => {
    expect(resolveOrtWasmPaths(base, { userAgent: SAFARI_26, hasWebGpu: false }).wasm).toContain('.asyncify.wasm');
    expect(resolveOrtWasmPaths(base, { userAgent: SAFARI_18, hasWebGpu: true }).wasm).toContain('.asyncify.wasm');
  });

  it('resolves against the remote origin when the shell hosts the worker', () => {
    expect(resolveOrtWasmPaths('https://erp.clinica.bo/mfe1/worker-ABC.js', { userAgent: CHROME, hasWebGpu: false }).mjs).toBe(
      'https://erp.clinica.bo/mfe1/onnx/ort-wasm-simd-threaded.asyncify.mjs',
    );
  });
});
