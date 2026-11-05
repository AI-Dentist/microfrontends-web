import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appDir = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(appDir, 'package.json'));
const { JSDOM } = createRequire(resolve(appDir, '../mf-erp/package.json'))('jsdom');
const { parse, compileScript } = require('@vue/compiler-sfc');
const BASE = 'https://stock-fixture.invalid/api/agendamiento';
const NEXT = 'https://replacement-fixture.invalid/api/agendamiento';
const payload = { insumo_id: 'fixture-i', tipo_movimiento: 'ENTRADA_COMPRA', cantidad: 2, motivo: 'Conteo ficticio' };
const success = () => reply(201, { success: true, mensaje: 'Movimiento registrado.',
  data: { id: 'fixture-m', fecha: '2030-01-02 09:00:00', ...payload } });
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const unavailable = () => reply(503, { success: false, code: 'STOCK_WRITE_UNAVAILABLE', error: 'Resultado incierto' });
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// In-memory SFC compilation only: execute the shipped scripts/templates, not a
// model of App's guards. No Vite build, custom Node loader, disk output or server.
const modules = new Map();
// Browser ESM is self-contained; use one shared runtime URL for every SFC.
const vueModule = `data:text/javascript;base64,${Buffer.from(readFileSync(
  require.resolve('vue/dist/vue.runtime.esm-browser.js'), 'utf8')).toString('base64')}`;
function sourceModule(filename) {
  if (modules.has(filename)) return modules.get(filename);
  let source = readFileSync(filename, 'utf8');
  if (filename.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename });
    assert.deepEqual(errors, [], `parse ${filename}`);
    source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  }
  source = source.replace(/\bfrom\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
    const target = specifier === 'vue' ? vueModule
      : specifier.endsWith('.vue') ? sourceModule(resolve(dirname(filename), specifier))
        : specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : specifier;
    return `from ${quote}${target}${quote}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  modules.set(filename, url);
  return url;
}

let dom;
let remote;
const originals = new Map();
const globals = ['window', 'document', 'Document', 'Node', 'Element', 'HTMLElement', 'Event', 'MutationObserver', 'SVGElement'];
test.before(async () => {
  dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const key of globals) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  remote = await import(sourceModule(resolve(appDir, 'src/remote.js')));
});
test.after(() => {
  dom?.window.close();
  for (const key of globals) {
    if (originals.get(key)) Object.defineProperty(globalThis, key, originals.get(key));
    else delete globalThis[key];
  }
});

async function mountStock(t, responses = [], { citas = [], erp = false, admin = false, allowOtherWrites = false } = {}) {
  const calls = [];
  const queue = [...responses];
  // Synthetic role hint only; this fixture does not prove JWT authentication.
  let token = admin ? `synthetic.${Buffer.from(JSON.stringify({ realm_access: { roles: ['ADMIN'] } })).toString('base64url')}.synthetic`
    : 'synthetic-token-a';
  let readFailure = false;
  const getAccessToken = () => token;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (erp && url === 'https://erp-fixture.invalid/graphql') {
      return reply(200, { data: { listarPacientes: [], listarOdontologos: [], listarConsultorios: [] } });
    }
    const call = { url, method: options.method, headers: options.headers,
      body: options.body === undefined ? undefined : JSON.parse(options.body) };
    calls.push(call);
    assert.ok(url.startsWith(BASE + '/') || url.startsWith(NEXT + '/'), 'only fictitious MS3 is called');
    if (options.method === 'POST') {
      if (!url.endsWith('/stock/movimientos')) {
        assert.ok(allowOtherWrites && [`${BASE}/citas`, `${BASE}/horarios`].includes(url), 'only explicit fixture commands');
        return reply(201, { success: true, data: { id: 'fixture-other-action' } });
      }
      assert.ok(url.endsWith('/stock/movimientos'), 'no implicit appointment or other write');
      const next = queue.shift();
      return next ? await next(call) : success();
    }
    assert.equal(options.method, 'GET');
    if (readFailure) throw new Error('fixture readback unavailable');
    const key = url.endsWith('/stock') ? 'insumos' : url.endsWith('/citas') ? 'citas' : 'horarios';
    assert.ok(['/stock', '/citas', '/horarios'].some(path => url.endsWith(path)));
    return reply(200, { success: true, data: { [key]: key === 'insumos' ? [
      { id: 'fixture-i', codigo: 'FIX-1', nombre: 'Insumo ficticio', stock_actual: 8, stock_minimo: 1 },
      { id: 'fixture-j', codigo: 'FIX-2', nombre: 'Otro insumo ficticio', stock_actual: 7, stock_minimo: 1 },
    ] : key === 'citas' ? citas : [] } });
  });
  const container = document.createElement('div');
  document.body.append(container);
  let context = { contractVersion: 1, basePath: '/clinical', path: '/clinical/stock',
    apiBaseUrl: BASE, getAccessToken, onNavigate() {},
    ...(erp ? { serviceBaseUrls: { erp: 'https://erp-fixture.invalid/graphql' } } : {}) };
  const instance = remote.mount(container, context);
  t.after(() => { instance.unmount(); container.remove(); });
  await settle();
  assert.ok(container.querySelector('form'), 'real stock form mounted');
  return { container, calls, instance, queue,
    posts: () => calls.filter(call => call.method === 'POST'),
    setToken(value) { token = value; },
    failReadback() { readFailure = true; },
    async update(changes) { context = { ...context, ...changes }; instance.update(context); await settle(); },
  };
}

function change(view, selector, value, event = 'input') {
  const input = view.container.querySelector(selector);
  assert.ok(input, `visible control ${selector}`);
  input.value = value;
  input.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
}
async function fill(view, draft = payload) {
  change(view, 'form select', draft.insumo_id, 'change');
  const selects = view.container.querySelectorAll('form select');
  selects[1].value = draft.tipo_movimiento;
  selects[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await settle();
  if (draft.direccion) {
    const direction = view.container.querySelectorAll('form select')[2];
    assert.ok(direction, 'adjustment direction is visible');
    direction.value = draft.direccion;
    direction.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  change(view, 'form input[type=number]', String(draft.cantidad));
  change(view, 'form input:not([type=number])', draft.motivo);
  await settle();
}
function submit(view) {
  const form = view.container.querySelector('form');
  assert.ok(form, 'stock form is available for explicit action');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}
function key(call) {
  assert.equal(typeof call.headers['Idempotency-Key'], 'string', 'manual intent sends a key');
  assert.ok(call.headers['Idempotency-Key'].length > 0, 'key is nonempty');
  assert.equal(call.headers['X-Idempotency-Key'], undefined, 'no alias header');
  return call.headers['Idempotency-Key'];
}

// Correct baseline controls are independent of the missing-key assertions.
for (const [label, response, message] of [
  ['network loss', () => { throw new Error('fixture connection lost'); }, /fixture connection lost/],
  ['503 uncertainty', unavailable, /STOCK_WRITE_UNAVAILABLE.*Resultado incierto/],
  ['409 conflict', () => reply(409, { success: false, code: 'IDEMPOTENCY_CONFLICT', error: 'Payload distinto' }),
    /IDEMPOTENCY_CONFLICT.*Payload distinto/],
]) {
  test(`${label} is visible and never retries without another DOM action`, async t => {
    const view = await mountStock(t, [response]);
    await fill(view);
    assert.equal(view.posts().length, 0, 'editing/loading is not a write');
    submit(view);
    await settle();
    assert.equal(view.posts().length, 1);
    assert.match(view.container.querySelector('.error')?.textContent || '', message);
    assert.equal(view.container.querySelector('.success-msg'), null);
    await settle();
    assert.equal(view.posts().length, 1, 'no automatic retry');
    assert.deepEqual(view.posts()[0].body, payload);
    assert.equal(view.container.querySelector('input[type=number]').value, '2');
    assert.equal(view.container.querySelector('form input:not([type=number])').value, payload.motivo);
  });
}

for (const [label, response] of [
  ['network loss', () => { throw new Error('fixture connection lost'); }],
  ['503 uncertainty', unavailable],
  ['409 conflict', () => reply(409, { code: 'IDEMPOTENCY_CONFLICT', error: 'Payload distinto' })],
]) {
  test(`explicit unchanged retry after ${label} reuses the captured key and payload`, async t => {
    const view = await mountStock(t, [response, success]);
    await fill(view);
    submit(view);
    await settle();
    submit(view);
    await settle();
    assert.equal(view.posts().length, 2, 'exactly one POST per explicit retry');
    assert.deepEqual(view.posts().map(call => call.body), [payload, payload]);
    assert.equal(key(view.posts()[1]), key(view.posts()[0]));
    assert.equal(view.container.querySelector('.error'), null);
    assert.match(view.container.textContent, /Movimiento registrado/);
  });
}

test('two concurrent DOM submits produce only one in-flight POST', async t => {
  const pending = deferred();
  const view = await mountStock(t, [() => pending.promise]);
  t.after(() => pending.resolve(success()));
  await fill(view);
  submit(view);
  submit(view); // Same turn: disabled button rendering alone is not a guard.
  await settle();
  assert.equal(view.posts().length, 1, 'synchronous duplicate submit is blocked');
  assert.deepEqual(view.posts()[0].body, payload);
  assert.equal(view.container.querySelector('button[type=submit]').disabled, true);
  for (const control of view.container.querySelectorAll('form input, form select')) {
    assert.equal(control.disabled, true, 'draft controls cannot edit an in-flight intent');
  }
  assert.deepEqual(view.posts()[0].body, payload, 'captured body remains unchanged');
  pending.resolve(success());
  await settle();
  assert.equal(view.posts().length, 1);
});

for (const [label, original, edited] of [
  ['insumo', payload, { ...payload, insumo_id: 'fixture-j' }],
  ['type', payload, { ...payload, tipo_movimiento: 'SALIDA_PROCEDIMIENTO' }],
  ['quantity', payload, { ...payload, cantidad: 3 }],
  ['reason', payload, { ...payload, motivo: 'Segundo conteo ficticio' }],
  ['direction', { ...payload, tipo_movimiento: 'AJUSTE', direccion: 'INCREMENTO' },
    { ...payload, tipo_movimiento: 'AJUSTE', direccion: 'DECREMENTO' }],
]) {
  test(`editing ${label} after an uncertain write starts a new intent`, async t => {
    const view = await mountStock(t, [unavailable, success]);
    await fill(view, original);
    submit(view);
    await settle();
    await fill(view, edited);
    assert.equal(view.posts().length, 1, 'editing alone never retries');
    submit(view);
    await settle();
    assert.equal(view.posts().length, 2);
    assert.deepEqual(view.posts().map(call => call.body), [original, edited]);
    assert.notEqual(key(view.posts()[1]), key(view.posts()[0]));
  });
}

for (const readbackFails of [false, true]) {
  test(`acknowledged POST retires its intent even when readback ${readbackFails ? 'fails' : 'succeeds'}`, async t => {
    const view = await mountStock(t, [() => {
      if (readbackFails) view.failReadback();
      return success();
    }, success]);
    await fill(view);
    submit(view);
    await settle();
    assert.equal(view.posts().length, 1, 'GET failure must never replay the write');
    assert.ok(view.calls.some(call => call.method === 'GET' && view.calls.indexOf(call) >
      view.calls.indexOf(view.posts()[0])), 'acknowledged write requests readback');
    assert.match(view.container.textContent, /Movimiento registrado/);
    if (readbackFails) {
      const error = view.container.querySelector('.error')?.textContent || '';
      assert.match(error, /refresc|actualiz|refresh/i, 'failure identifies refresh, not a failed write');
      assert.match(error, /fixture readback unavailable/);
    } else assert.equal(view.container.querySelector('.error'), null);
    assert.equal(view.container.querySelector('form input:not([type=number])').value, '',
      'completed draft is retired rather than left as a retry');
    await fill(view);
    submit(view);
    await settle();
    assert.equal(view.posts().length, 2, 'new explicit intent only');
    assert.deepEqual(view.posts().map(call => call.body), [payload, payload]);
    assert.notEqual(key(view.posts()[1]), key(view.posts()[0]), 'identical new intent has a new key');
  });
}

for (const replacement of ['backend', 'getter', 'logout']) {
  test(`${replacement} cannot borrow the previous unresolved intent`, async t => {
    const view = await mountStock(t, [unavailable, success]);
    await fill(view);
    submit(view);
    await settle();
    if (replacement === 'logout') {
      view.setToken(null);
      submit(view);
      await settle();
      assert.equal(view.posts().length, 1, 'revoked token sends nothing');
      view.setToken('synthetic-token-restored');
      submit(view);
      await settle();
      assert.equal(view.posts().length, 1, 'retired capability never revives');
    }
    await view.update(replacement === 'backend' ? { apiBaseUrl: NEXT }
      : { getAccessToken: () => 'synthetic-other-actor' });
    await fill(view);
    submit(view);
    await settle();
    assert.equal(view.posts().length, 2);
    assert.deepEqual(view.posts().map(call => call.body), [payload, payload]);
    assert.equal(view.posts()[1].url, `${replacement === 'backend' ? NEXT : BASE}/stock/movimientos`);
    assert.notEqual(key(view.posts()[1]), key(view.posts()[0]));
  });
}

test('editing then undoing an uncertain draft still creates a new intent', async t => {
  const view = await mountStock(t, [unavailable, success]);
  await fill(view);
  submit(view);
  await settle();
  await fill(view, { ...payload, motivo: 'Temporary synthetic edit' });
  await fill(view);
  assert.equal(view.posts().length, 1, 'neither edit sends a request');
  submit(view);
  await settle();
  assert.equal(view.posts().length, 2);
  assert.deepEqual(view.posts().map(call => call.body), [payload, payload]);
  assert.notEqual(key(view.posts()[1]), key(view.posts()[0]));
});

test('unmount and remount cannot borrow an unresolved intent', async t => {
  const first = await mountStock(t, [unavailable]);
  await fill(first);
  submit(first);
  await settle();
  first.instance.unmount();
  const second = await mountStock(t, [success]);
  await fill(second);
  assert.equal(second.posts().length, 0);
  submit(second);
  await settle();
  assert.equal(first.posts().length, 1);
  assert.equal(second.posts().length, 1);
  assert.deepEqual(second.posts()[0].body, payload);
  assert.notEqual(key(second.posts()[0]), key(first.posts()[0]));
});

const fixtureCitas = [{ id: 'fixture-cita', estado: 'PROGRAMADA', fecha_hora: '2030-01-02 09:00:00',
  paciente_id: 'fixture-paciente', odontologo_id: 'fixture-doctor', consultorio_id: 'fixture-room' }];

async function inFlightStock(t, outcome = success) {
  const pending = deferred();
  const view = await mountStock(t, [async () => { await pending.promise; return outcome(); }],
    { citas: fixtureCitas, erp: true, admin: true, allowOtherWrites: true });
  t.after(() => pending.resolve());
  await fill(view);
  submit(view);
  await settle();
  assert.equal(view.posts().length, 1);
  return { view, release: () => pending.resolve() };
}
function appointmentButtons(view) {
  const actions = [...view.container.querySelectorAll('.acciones > button')];
  assert.equal(actions.length, 4);
  const create = view.container.querySelector('form button[type=submit]');
  assert.ok(create);
  return [...actions, create];
}

test('follow-up: revocation during stock releases appointment locks and shows capability error', async t => {
  const { view, release } = await inFlightStock(t);
  await view.update({ path: '/clinical/citas' });
  for (const button of appointmentButtons(view)) assert.equal(button.disabled, true);
  const before = view.calls.length;
  view.setToken(null);
  release();
  await settle();
  assert.match(view.container.querySelector('.error')?.textContent || '', /MS3 host capability unavailable/);
  for (const button of appointmentButtons(view)) assert.equal(button.disabled, false);
  assert.equal(view.calls.length, before, 'revoked completion never refreshes');
  assert.doesNotMatch(view.container.textContent, /Movimiento registrado/);
});
for (const page of ['citas', 'horarios']) {
  test(`follow-up: programmatic ${page} submit cannot race stock`, async t => {
    const { view, release } = await inFlightStock(t);
    await view.update({ path: `/clinical/${page}` });
    const form = view.container.querySelector('form');
    assert.ok(form);
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(view.posts().length, 1, 'only the explicit stock POST is dispatched');
    assert.equal(view.calls.filter(call => call.method !== 'GET').length, 1);
    release();
    await settle();
  });
}
test('follow-up: schedule creation is disabled during stock and enabled after completion', async t => {
  const { view, release } = await inFlightStock(t);
  await view.update({ path: '/clinical/horarios' });
  const button = view.container.querySelector('form button[type=submit]');
  assert.ok(button);
  assert.equal(button.disabled, true);
  release();
  await settle();
  assert.equal(button.disabled, false);
});
for (const [label, outcome, message] of [
  ['503', unavailable, /STOCK_WRITE_UNAVAILABLE/],
  ['network', () => { throw new Error('fixture movement offline'); }, /fixture movement offline/],
  ['409', () => reply(409, { code: 'IDEMPOTENCY_CONFLICT', error: 'Fixture conflict' }), /IDEMPOTENCY_CONFLICT/],
  ['readback', success, /Movimiento registrado; no se pudo actualizar/],
]) {
  test(`follow-up: appointment and schedule locks release after ${label}`, async t => {
    const { view, release } = await inFlightStock(t, outcome);
    if (label === 'readback') view.failReadback();
    await view.update({ path: '/clinical/citas' });
    for (const button of appointmentButtons(view)) assert.equal(button.disabled, true);
    release();
    await settle();
    for (const button of appointmentButtons(view)) assert.equal(button.disabled, false);
    assert.match(view.container.querySelector('.error')?.textContent || '', message);
    await view.update({ path: '/clinical/horarios' });
    assert.equal(view.container.querySelector('form button[type=submit]').disabled, false);
    assert.equal(view.posts().length, 1, 'no automatic retry after an outcome');
  });
}

test('minor adjustments: appointment actions stay disabled throughout a stock POST', async t => {
  const pending = deferred();
  const view = await mountStock(t, [() => pending.promise], { erp: true, citas: [{
    id: 'fixture-cita', estado: 'PROGRAMADA', fecha_hora: '2030-01-02 09:00:00',
    paciente_id: 'fixture-paciente', odontologo_id: 'fixture-doctor', consultorio_id: 'fixture-room',
  }] });
  t.after(() => pending.resolve(success()));
  await fill(view);
  submit(view);
  await settle();
  await view.update({ path: '/clinical/citas' });
  const actions = [...view.container.querySelectorAll('.acciones > button')];
  const create = view.container.querySelector('form button[type=submit]');
  assert.equal(actions.length, 4, 'all appointment actions are mounted');
  assert.ok(create, 'appointment creation is mounted');
  for (const button of [...actions, create]) {
    assert.equal(button.disabled, true, 'appointments cannot race the stock refresh');
    button.click();
  }
  await settle();
  assert.equal(view.posts().length, 1);
  assert.equal(view.calls.filter(call => call.method !== 'GET').length, 1);
  pending.resolve(success());
  await settle();
  for (const button of [...actions, create]) assert.equal(button.disabled, false);
});

test('submit with a revoked token shows the capability error and does not lock the form', async t => {
  const view = await mountStock(t, []);
  await fill(view);
  view.setToken(null);
  submit(view);
  await settle();
  assert.equal(view.posts().length, 0);
  assert.match(view.container.querySelector('.error')?.textContent || '', /MS3 host capability unavailable/);
  const button = view.container.querySelector('button[type=submit]');
  assert.equal(button.disabled, false);
  view.setToken('synthetic-token-restored');
  await settle();
  assert.equal(button.disabled, false);
  assert.equal(view.posts().length, 0, 'restoring a token never retries automatically');
});

test('live token refresh behind the same getter preserves an unresolved intent', async t => {
  const view = await mountStock(t, [unavailable, success]);
  await fill(view);
  submit(view);
  await settle();
  view.setToken('synthetic-token-refreshed');
  await view.update({ path: '/clinical/stock' });
  submit(view);
  await settle();
  assert.equal(view.posts().length, 2);
  assert.deepEqual(view.posts().map(call => call.body), [payload, payload]);
  assert.deepEqual(view.posts().map(call => call.headers.Authorization),
    ['Bearer synthetic-token-a', 'Bearer synthetic-token-refreshed']);
  assert.equal(key(view.posts()[1]), key(view.posts()[0]));
});

for (const replacement of ['unmount', 'backend', 'getter', 'logout']) {
  test(`late movement response after ${replacement} cannot update UI or trigger readback`, async t => {
    const pending = deferred();
    const view = await mountStock(t, [() => pending.promise]);
    t.after(() => pending.resolve(success()));
    await fill(view);
    submit(view);
    await settle();
    if (replacement === 'unmount') view.instance.unmount();
    else if (replacement === 'logout') {
      view.setToken(null);
      await view.update({ path: '/clinical/stock' }); // Same getter/base: logout, not service replacement.
    } else await view.update(replacement === 'backend' ? { apiBaseUrl: NEXT }
      : { getAccessToken: () => 'synthetic-other-actor' });
    const callsBeforeRelease = view.calls.length;
    const visibleBeforeRelease = view.container.textContent;
    pending.resolve(success());
    await settle();
    assert.equal(view.posts().length, 1);
    assert.equal(view.calls.length, callsBeforeRelease, 'stale success never refreshes');
    if (replacement === 'logout') {
      assert.match(view.container.querySelector('.error')?.textContent || '', /MS3 host capability unavailable/);
      assert.equal(view.container.querySelector('button[type=submit]').disabled, false);
    } else assert.equal(view.container.textContent, visibleBeforeRelease, 'stale success/error is inert');
    assert.doesNotMatch(view.container.textContent, /Movimiento registrado/);
  });
}
