import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteSession, confinedPath, bounded, loadStyles } from '../src/remote-runtime.mjs';
const context = { contractVersion: 1, basePath: '/operations', path: '/operations?a=1' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(overrides = {}) {
  const events = [];
  const instance = { update: async c => events.push(c.path), unmount: async () => events.push('unmount') };
  const session = createRemoteSession({ container: {}, loadModule: async () => ({ contractVersion: 1, mount: async () => instance }), loadStyle: async () => () => events.push('style removed'), onState: s => events.push(s), timeoutMs: 20, ...overrides });
  return { session, events, instance };
}
test('mount/update preserves stylesheet and module; destroy is idempotent', async () => {
  let imports = 0, styles = 0;
  const { session, events, instance } = setup({ loadModule: async () => { imports++; return { contractVersion: 1, mount: () => instance }; }, loadStyle: async () => { styles++; return () => events.push('style removed'); } });
  await session.start(context);
  await session.update({ ...context, path: '/operations/orders?open=1' });
  await session.destroy(); await session.destroy();
  assert.equal(imports, 1); assert.equal(styles, 1);
  assert.deepEqual(events, ['loading', 'ready', '/operations/orders?open=1', 'unmount', 'style removed']);
});
test('late mount is disposed after destroy, without ready state', async () => {
  const mount = deferred();
  const { session, events, instance } = setup({ loadModule: async () => ({ contractVersion: 1, mount: () => mount.promise }) });
  const pending = session.start(context); await tick();
  await session.destroy(); mount.resolve(instance); await pending; await tick();
  assert.equal(events.filter(e => e === 'unmount').length, 1);
  assert.equal(events.includes('ready'), false);
});
test('timeout shows error and disposes eventual mount', async () => {
  const mount = deferred();
  const { session, events, instance } = setup({ loadModule: async () => ({ contractVersion: 1, mount: () => mount.promise }) });
  await session.start(context); assert.deepEqual(events.slice(0, 2), ['loading', 'error']);
  mount.resolve(instance); await tick(); assert.ok(events.includes('unmount'));
  await session.destroy();
});
test('import failure can retry same URL without cache busting', async () => {
  let attempts = 0;
  const { session, events, instance } = setup({ loadModule: async () => { if (++attempts === 1) throw Error('offline'); return { contractVersion: 1, mount: () => instance }; } });
  await session.start(context); await session.start(context);
  assert.equal(attempts, 2); assert.deepEqual(events.slice(0, 4), ['loading', 'error', 'loading', 'ready']); await session.destroy();
});
for (const module of [{ contractVersion: 2, mount() {} }, { contractVersion: 1 }, { contractVersion: 1, mount: () => ({ unmount() {} }) }]) {
  test('rejects incompatible lifecycle shape/version', async () => {
    const { session, events } = setup({ loadModule: async () => module });
    await session.start(context); assert.ok(events.includes('error')); assert.ok(!events.includes('ready')); await session.destroy();
  });
}
test('update rejection cleans up and remains retryable', async () => {
  const { session, events } = setup({ loadModule: async () => ({ contractVersion: 1, mount: () => ({ update: () => Promise.reject(Error()), unmount: () => events.push('disposed') }) }) });
  await session.start(context); await session.update(context); assert.ok(events.includes('error')); assert.ok(events.includes('disposed')); await session.destroy();
});
test('bounded native/style work rejects on timeout and preserves rejection', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 5), /timeout/);
  await assert.rejects(bounded(Promise.reject(Error('offline')), 5), /offline/);
});
test('stylesheet load waits for onload, removes on error/timeout and cleans once released', async () => {
  let link;
  const root = { ownerDocument: { createElement: () => (link = { removed: false, remove() { this.removed = true; } }) }, append() {} };
  let ready = false;
  const pending = loadStyles(root, 'https://ops.example/remote.css', 20).then(remove => { ready = true; return remove; });
  await tick(); assert.equal(ready, false); assert.equal(link.rel, 'stylesheet');
  assert.equal(link.href, 'https://ops.example/remote.css');
  link.onload(); const remove = await pending; assert.equal(link.removed, false); remove(); assert.equal(link.removed, true);
  const failed = loadStyles(root, 'https://ops.example/remote.css', 20);
  link.onerror(); await assert.rejects(failed, /Styles unavailable/); assert.equal(link.removed, true);
  await assert.rejects(loadStyles(root, 'https://ops.example/remote.css', 5), /timeout/); assert.equal(link.removed, true);
});
test('updates serialize and destruction does not race a pending update', async () => {
  const update = deferred(); const calls = [];
  const { session } = setup({ loadModule: async () => ({ contractVersion: 1, mount: () => ({
    update: async () => { calls.push('update'); await update.promise; calls.push('updated'); },
    unmount: () => calls.push('unmount'),
  }) }) });
  await session.start(context);
  const one = session.update(context); const two = session.update(context); await tick();
  await session.destroy(); assert.deepEqual(calls, ['update']);
  update.resolve(); await one; await two; await tick();
  assert.deepEqual(calls, ['update', 'updated', 'unmount']);
});
test('navigation accepts only confined absolute paths and keeps query', () => {
  for (const path of ['/operations', '/operations/orders?status=open']) assert.equal(confinedPath(path, '/operations', 'https://shell.example'), path);
  for (const path of ['/operations-other', '/erp', '//evil.example/operations', 'https://shell.example/operations', '/operations#x', '/operations/%2f..%2ferp', '/operations/%252e%252e/erp', '/operations/../erp', '/operations/./orders', '/operations\\orders', '/operations/%zz', '/operations;other']) assert.equal(confinedPath(path, '/operations', 'https://shell.example'), null, path);
});
