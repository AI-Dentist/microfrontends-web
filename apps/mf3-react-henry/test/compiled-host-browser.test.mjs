import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Compiled-remote check for T4.B: loads dist-remote in an isolated Chromium
// against an owned loopback fixture. Synthetic transport only; not real IdP/API proof.
// Run `npm run build:remote` first, or point MF3_REMOTE_DIST at a built remote.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

process.env.PLAYWRIGHT_BROWSERS_PATH =
  resolve(root, 'apps/mf-erp/node_modules/.cache/playwright');
const { chromium } =
  createRequire(resolve(root, 'apps/mf-erp/package.json'))('playwright');
const dist = process.env.MF3_REMOTE_DIST ||
  resolve(root, 'apps/mf3-react-henry/dist-remote');
const assets = new Map(await Promise.all(
  ['remote.js', 'remote.css'].map(async name => [
    name, await readFile(resolve(dist, name)),
  ]),
));

let browser, context, page, deadline, origin;
let checks = 0, external = 0;
const errors = [];
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
  response.setHeader('Content-Type',
    name.endsWith('.js') ? 'text/javascript' :
    name.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(name ? assets.get(name) || '' :
    '<!doctype html><meta charset="utf-8"><div id="fixture"></div>');
});
const check = (condition, label) => {
  assert.ok(condition, label);
  checks++;
};

async function verify() {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin &&
        ['/', '/remote.js', '/remote.css', '/favicon.ico'].includes(url.pathname)) {
      return route.continue();
    }
    external++;
    return route.abort();
  });
  await page.goto(origin + '/?apiPort=3002');
  await page.evaluate(async () => {
    window.token = 'opaque-synthetic-one';
    window.calls = [];
    window.storageReads = 0;
    window.navigationCount = 0;
    for (const property of ['localStorage', '__ODONTOGRAMA_TEST_API_URL__']) {
      Object.defineProperty(window, property, {
        configurable: true,
        get() {
          window.storageReads++;
          throw Error('Fixture forbids prototype/storage access');
        },
      });
    }

    // Synthetic transport boundary only: no API network requests.
    window.fetch = async (url, options) => {
      const target = new URL(url, location.href);
      window.calls.push({
        path: target.pathname,
        query: target.search,
        currentBearer:
          options.headers.Authorization === `Bearer ${window.token}`,
      });
      if (options.method === 'POST' && window.holdWrite) {
        window.holdWrite = false;
        return new Promise(resolve => {
          window.releaseWrite = () => resolve(new Response(JSON.stringify({
            id: 'LATE_OLD_RESULT',
            codigoEstudio: 'LATE_OLD_RESULT',
            historiaClinicaId: 'late-old-history',
          }), { status: 201 }));
        });
      }
      let body, status = 200;
      if (target.pathname.endsWith('/tipos-estudios')) {
        body = [{
          id: 'synthetic-type', codigo: 'SYN',
          nombre: 'SYNTHETIC_TYPE', categoria: 'IMAGENOLOGIA',
          estado: 'ACTIVO',
        }];
      } else if (target.pathname.includes('/consultas-odontologicas/')) {
        body = { consultas: [], total: 0, limite: 10, offset: 0 };
      } else if (target.pathname.includes('/odontogramas/')) {
        status = 404;
        body = {
          status: 404, title: 'Synthetic absent',
          detail: 'Synthetic transport fixture only',
        };
      } else if (target.pathname.includes('/historias-clinicas/')) {
        body = {
          id: 'synthetic-history', pacienteId: 'synthetic-patient',
          estado: 'ACTIVA', version: 1,
          observacionesGenerales: 'SYNTHETIC_HISTORY',
          antecedentes: {}, alergias: [],
          medicamentosActuales: [], historialCambios: [],
        };
      } else {
        throw Error('Unexpected synthetic endpoint');
      }
      return new Response(JSON.stringify(body), { status });
    };

    const shadow = document.querySelector('#fixture')
      .attachShadow({ mode: 'open' });
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/remote.css';
    shadow.append(css);
    window.target = document.createElement('div');
    shadow.append(window.target);
    window.remote = await import('/remote.js');
    window.getter = () => window.token;
    window.base = '/bounded/?tenant=a%2Fb&tag=one&tag=two';
    window.config = tab => ({
      contractVersion: 1, basePath: '/clinical',
      path: '/clinical/' + tab,
      apiBaseUrl: window.base,
      getAccessToken: window.getter,
      onNavigate() { window.navigationCount++; },
    });
    window.instance = window.remote.mount(
      window.target, window.config('consulta'));
  });

  const button = name => page.getByRole('button', { name, exact: true });
  const tick = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const update = tab => page.evaluate(tab =>
    window.instance.update(window.config(tab)), tab);

  await button('Buscar Expediente').waitFor();
  check(await page.evaluate(() =>
    !!document.querySelector('#fixture').shadowRoot
      .querySelector('link').sheet), 'ShadowRoot CSS loaded');

  // The shared Input drops aria-label, so the accessible name is its placeholder.
  await page.getByPlaceholder(/^Ingrese el ID canónico \(ej\. hc_/)
    .fill('synthetic-history');
  await button('Buscar Expediente').click();
  await page.getByText('SYNTHETIC_HISTORY', { exact: true }).waitFor();
  check(await page.evaluate(() =>
    window.calls.length === 1 && window.calls[0].currentBearer),
  'history consumer');

  await page.evaluate(() => {
    window.originalTree = window.target.firstElementChild;
    window.token = 'opaque-synthetic-two';
  });
  await button('Buscar Expediente').click();
  await tick();
  check(await page.evaluate(() =>
    window.calls.length === 2 && window.calls[1].currentBearer &&
    window.originalTree === window.target.firstElementChild),
  'current token refresh without remount');

  await update('consultas');
  await page.getByPlaceholder(/^Ingrese el ID canónico de la Historia Clínica/)
    .fill('synthetic-history');
  await button('Buscar Atenciones').click();
  await page.getByText('Sin consultas odontológicas', { exact: true }).waitFor();
  check(await page.evaluate(() =>
    window.calls.at(-1).path.includes('/consultas-odontologicas/') &&
    window.calls.at(-1).query.endsWith('&limite=10&offset=0')),
  'consultation consumer and query joining');

  await update('odontograma');
  await page.getByPlaceholder(/^Ingrese el ID canónico de la historia clínica/)
    .fill('synthetic-history');
  await button('Cargar Odontograma').click();
  await tick();
  check(await page.evaluate(() =>
    window.calls.at(-1).path.includes('/odontogramas/') &&
    window.storageReads === 0), 'odontogram consumer without storage fallback');
  check(await page.getByRole('button', {
    name: /Conectar a Backend Aislado/,
  }).count() === 0, 'prototype controls hidden');

  await update('estudios');
  await page.getByText('SYNTHETIC_TYPE', { exact: true }).waitFor();
  check(await page.evaluate(() =>
    window.calls.at(-1).path.endsWith('/tipos-estudios')),
  'studies consumer');

  for (const retirement of ['getter', 'backend', 'unmount']) {
    await page.evaluate(() => {
      window.holdWrite = true;
      window.releaseWrite = null;
    });
    await button('➕ Solicitar Estudio').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(/ej\. cons_/).fill('synthetic-consultation');
    await dialog.getByPlaceholder(/Evaluación de tercer molar/)
      .fill('Synthetic transport only');
    await button('Emitir Solicitud').click();
    await page.waitForFunction(() =>
      typeof window.releaseWrite === 'function');

    await page.evaluate(retirement => {
      window.retiredTree = window.target.firstElementChild;
      if (retirement === 'unmount') {
        window.instance.unmount();
        window.instance.unmount();
      } else {
        if (retirement === 'getter') window.getter = () => window.token;
        else window.base = '/replacement/?tenant=a%2Fb&tag=one&tag=two';
        window.instance.update(window.config('estudios'));
      }
    }, retirement);
    if (retirement !== 'unmount') {
      // React commits the keyed replacement asynchronously: wait for the fresh
      // tree and its own initial load before observing the retired request.
      await page.waitForFunction(() =>
        window.retiredTree !== window.target.firstElementChild);
      await page.getByText('SYNTHETIC_TYPE', { exact: true }).waitFor();
    }
    await page.evaluate(() => {
      window.beforeCalls = window.calls.length;
      window.beforeNavigation = window.navigationCount;
      window.releaseWrite();
    });
    await tick();
    const late = await page.evaluate(() => ({
      calls: window.calls.length - window.beforeCalls,
      navigations: window.navigationCount - window.beforeNavigation,
      renderedLateResult: window.target.textContent.includes('LATE_OLD_RESULT'),
    }));
    check(late.calls === 0 && late.navigations === 0 && !late.renderedLateResult,
      retirement + ': late callbacks/state/follow-up requests inert ' +
      JSON.stringify(late));
    check(await page.evaluate(retirement =>
      retirement === 'unmount'
        ? window.target.childElementCount === 0
        : window.retiredTree !== window.target.firstElementChild,
    retirement), retirement + ': empty target/fresh tree');
  }

  await page.evaluate(() => {
    window.token = null;
    window.getter = () => window.token;
    window.instance = window.remote.mount(
      window.target, window.config('estudios'));
  });
  await button('🔄 Refrescar').waitFor();
  await tick();
  await page.evaluate(() => { window.beforeCalls = window.calls.length; });
  await button('🔄 Refrescar').click();
  await page.evaluate(() => { window.token = 'opaque-synthetic-new-session'; });
  await button('🔄 Refrescar').click();
  await tick();
  check(await page.evaluate(() =>
    window.calls.length === window.beforeCalls),
  'null capability and same-getter reauthentication send zero requests');

  await page.evaluate(() => {
    window.getter = () => window.token;
    window.instance.update(window.config('estudios'));
  });
  await page.getByText('SYNTHETIC_TYPE', { exact: true }).waitFor();
  check(await page.evaluate(() =>
    window.calls.length > window.beforeCalls &&
    window.calls.at(-1).currentBearer), 'replacement capability works');
  await page.evaluate(() => {
    window.beforeCalls = window.calls.length;
    window.token = null;
  });
  await button('🔄 Refrescar').click();
  await tick();
  check(await page.evaluate(() =>
    window.calls.length === window.beforeCalls),
  'revoked active capability sends zero new requests');
  check(await page.evaluate(() => window.calls.every(call =>
    call.currentBearer &&
    /^\/(bounded|replacement)\//.test(call.path) &&
    call.query.startsWith('?tenant=a%2Fb&tag=one&tag=two'))),
  'all observed requests use pinned base/query/current synthetic bearer');
  check(errors.length === 0 && external === 0,
    'zero page errors and nonowned network attempts');
  await page.evaluate(() => window.instance.unmount());
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, timeout: 6000 });
  context = await browser.newContext({ serviceWorkers: 'block' });
  page = await context.newPage();
  page.setDefaultTimeout(4000);
  page.on('pageerror', error => errors.push(error.name));
  await Promise.race([
    verify(),
    new Promise((_, reject) => {
      deadline = setTimeout(() =>
        reject(Error('Bounded browser deadline exceeded')), 40000);
    }),
  ]);
  console.log(JSON.stringify({
    status: 'PASS', checks, localFixtureUrl: origin,
    externalAttempts: external, pageErrors: errors.length,
    authority: 'OPAQUE_SYNTHETIC_TRANSPORT_ONLY_NOT_T10',
  }));
} catch (error) {
  process.exitCode = 1;
  console.error(JSON.stringify({
    status: 'FAIL', completedChecks: checks,
    error: error.message, localFixtureUrl: origin,
    externalAttempts: external, pageErrors: errors.length,
    pageUrl: page?.url(),
    accessibleTree: await page?.locator('body').ariaSnapshot({ timeout: 1000 })
      .then(tree => tree.slice(0, 1500), () => 'unavailable'),
  }));
} finally {
  clearTimeout(deadline);
  if (context) await context.close();
  if (browser) await browser.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({
    cleanup: 'browser_context_server_closed',
    serverListening: server.listening,
  }));
}