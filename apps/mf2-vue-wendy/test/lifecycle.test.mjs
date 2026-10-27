import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle, tabForContext, navigateTab } from '../src/lifecycle.js';

const context = (extra = {}) => ({ contractVersion: 1, basePath: '/clinical',
  path: '/clinical/citas', apiBaseUrl: 'https://api.example/clinical',
  getAccessToken: () => null, onNavigate() {}, ...extra });

function fixture() {
  const events = [];
  const mount = createLifecycle((initial) => ({
    mount(container) { events.push(['mount', container, initial]); },
    update(next) { events.push(['update', next]); },
    unmount() { events.push(['unmount']); },
  }));
  return { mount, events };
}

test('mount/update/unmount use only supplied root and independent instance contexts', () => {
  const { mount, events } = fixture();
  const container = {};
  const initial = context();
  const first = mount(container, initial);
  const secondInitial = context();
  const second = mount({}, secondInitial);
  const next = context({ path: '/clinical/stock', apiBaseUrl: '/api/new' });
  first.update(next);
  first.unmount();
  first.unmount();
  first.update(context({ contractVersion: 2 }));
  second.unmount();
  assert.deepEqual(events, [ ['mount', container, initial],
    ['mount', {}, secondInitial],
    ['update', next], ['unmount'], ['unmount'] ]);
});

test('reject incompatible versions, base changes and escaped paths before applying context', () => {
  const { mount, events } = fixture();
  assert.throws(() => mount({}, context({ contractVersion: 2 })), /contract version/);
  assert.deepEqual(events, []);
  const instance = mount({}, context());
  for (const change of [ { contractVersion: 2 }, { basePath: '/other', path: '/other' },
    ...['/clinical-other', '/erp', '//evil.example', '/clinical/#x',
      '/clinical/%2e%2e/erp', '/clinical/../erp', '/clinical/%2fsecret',
      'https://evil.example/clinical'].map(path => ({ path })) ]) {
    assert.throws(() => instance.update(context(change)));
  }
  assert.equal(events.length, 1);
});

test('failed mount cleans allocated root', () => {
  let cleaned = 0;
  const mount = createLifecycle(() => ({ mount() { throw new Error('failed'); },
    unmount() { cleaned++; } }));
  assert.throws(() => mount({}, context()), /failed/);
  assert.equal(cleaned, 1);
});

test('host navigation maps all tabs; standalone selection stays local', () => {
  const paths = [];
  for (const tab of ['citas', 'horarios', 'stock']) {
    const ctx = context({ path: `/clinical/${tab}?view=all`, onNavigate: path => paths.push(path) });
    assert.equal(tabForContext(ctx), tab);
    assert.equal(navigateTab(ctx, tab), undefined);
    assert.equal(navigateTab(undefined, tab), tab);
  }
  assert.deepEqual(paths, ['/clinical/citas', '/clinical/horarios', '/clinical/stock']);
  assert.equal(tabForContext(context({ path: '/clinical' })), 'citas');
  assert.equal(tabForContext(undefined), 'citas');
  assert.throws(() => navigateTab(context(), '../erp'));
});
