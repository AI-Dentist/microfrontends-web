import { vi } from 'vitest';
import { originSafeWorker } from './local-ai-worker.factory';

describe('federated Worker constructor boundary', () => {
  const native = vi.fn();
  let target: EventTarget & { terminate: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    target = Object.assign(new EventTarget(), { terminate: vi.fn() });
    native.mockReset().mockImplementation(function () { return target; });
    vi.stubGlobal('Worker', native);
    const NativeUrl = URL;
    vi.stubGlobal('URL', class extends NativeUrl {
      static override createObjectURL = vi.fn(() => 'blob:http://localhost/worker');
      static override revokeObjectURL = vi.fn();
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('wraps a remote emitted module URL in a host-origin blob import, without changing global Worker', () => {
    const handle = originSafeWorker(new URL('https://erp.example/mfe/worker-HASH.js'), { type: 'module' });
    expect(native).toHaveBeenCalledWith('blob:http://localhost/worker', { type: 'module' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(globalThis.Worker).toBe(native);
    handle.dispose(); expect(target.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/worker');
  });
  it('preserves direct same-origin module workers with no blob or host-relative rewriting', () => {
    const url = new URL('/mfe/worker-HASH.js', location.href);
    const handle = originSafeWorker(url, { type: 'module' });
    expect(native).toHaveBeenCalledWith(url, { type: 'module' });
    expect(URL.createObjectURL).not.toHaveBeenCalled(); handle.dispose();
  });
});
