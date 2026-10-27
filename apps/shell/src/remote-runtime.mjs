export function confinedPath(value, basePath, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\s\\#;]/u.test(value)) return null;
  const rawPath = value.split('?')[0];
  // Reject ambiguous separators, double encoding and traversal before normalization.
  try {
    const decoded = decodeURIComponent(rawPath);
    if (/%|\\/.test(decoded) || decoded.split('/').some(s => s === '.' || s === '..') || decoded !== rawPath && /%2f/i.test(rawPath)) return null;
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || !(url.pathname === basePath || url.pathname.startsWith(basePath + '/'))) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export async function bounded(work, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Remote timeout')), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

/** Load inside a host-owned root, including load/error and a bounded wait. */
export async function loadStyles(root, href, timeoutMs = 15000) {
  const link = root.ownerDocument.createElement('link');
  link.rel = 'stylesheet'; link.href = href;
  const ready = new Promise((resolve, reject) => {
    link.onload = resolve; link.onerror = () => reject(Error('Styles unavailable'));
  });
  root.append(link);
  try { await bounded(ready, timeoutMs); }
  catch (error) { link.remove(); throw error; }
  finally { link.onload = null; link.onerror = null; }
  return () => link.remove();
}

/** One activation; canceled asynchronous mounts are still owned and disposed. */
export function createRemoteSession({ container, loadModule, loadStyle, onState, timeoutMs = 15000 }) {
  let current, closed = false, serial = Promise.resolve();
  const valid = run => !closed && current === run && !run.cancelled;
  const quiet = async fn => { try { await fn?.(); } catch { /* Cleanup cannot revive UI. */ } };
  function retire(run) {
    if (!run || run.cancelled) return;
    run.cancelled = true;
    // Do not race unmount against an in-flight mount/update.
    run.cleanup = run.work.finally(async () => {
      await quiet(() => run.instance?.unmount?.());
      await quiet(run.removeStyle);
    }).catch(() => {});
  }
  async function start(context) {
    if (closed) return;
    retire(current);
    const run = { cancelled: false, work: Promise.resolve() };
    current = run; onState('loading');
    run.work = (async () => {
      // Sequential acquisition avoids orphan styles when import rejects.
      const module = await loadModule();
      if (!valid(run)) return;
      if (module.contractVersion !== 1 || typeof module.mount !== 'function') throw Error('Incompatible remote');
      run.removeStyle = await loadStyle();
      if (!valid(run)) return;
      run.instance = await module.mount(container, context);
      if (typeof run.instance?.update !== 'function' || typeof run.instance?.unmount !== 'function') throw Error('Invalid remote instance');
    })();
    run.work.then(() => { run.settled = true; }, () => { run.settled = true; });
    try {
      await bounded(run.work, timeoutMs);
      if (valid(run)) onState('ready');
    } catch {
      if (valid(run)) { onState('error'); retire(run); }
    }
  }
  function update(context) {
    const run = current;
    serial = serial.then(async () => {
      if (!valid(run)) return;
      await run.work.catch(() => {});
      if (!valid(run) || !run.instance) return;
      run.settled = false;
      run.work = Promise.resolve().then(() => run.instance.update(context));
      run.work.then(() => { run.settled = true; }, () => { run.settled = true; });
      try { await bounded(run.work, timeoutMs); }
      catch { if (valid(run)) { onState('error'); retire(run); } }
    });
    return serial;
  }
  async function destroy() {
    closed = true; retire(current);
    if (current?.settled) await current.cleanup;
  }
  return { start, update, destroy };
}
