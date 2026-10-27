/** Native Worker requires a same-origin entry even when Federation imports remote JS.
 * A tiny host-origin blob imports the emitted remote module; its import.meta.url still
 * points at the remote chunk, preserving remote-relative ONNX asset resolution.
 */
export function originSafeWorker(url: URL, options: WorkerOptions): { worker: Worker; dispose: () => void } {
  let blobUrl: string | undefined;
  const revoke = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = undefined; } };
  try {
    if (url.origin !== location.origin) {
      blobUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(url.href)};`], { type: 'text/javascript' }));
    }
    const worker = new globalThis.Worker(blobUrl ?? url, options);
    worker.addEventListener('message', revoke, { once: true });
    worker.addEventListener('error', revoke, { once: true });
    return { worker, dispose: () => { worker.terminate(); revoke(); } };
  } catch (error) {
    revoke();
    throw error;
  }
}
