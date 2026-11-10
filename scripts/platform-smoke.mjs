// Production artifacts only; no dev server, backend, real identity, or browser download.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startPlatform, root, release, serve } from './platform-artifacts.mjs';
import { schema, validateRequest } from '../apps/mf-erp/scripts/ms1-contract-operations.mjs';
import { createSyntheticIdp } from './fixtures/auth-idp.mjs';
import { citasFixture, clustersFixture, PATIENT_IDS } from './fixtures/agendamiento.mjs';

const require = createRequire(new URL('../apps/mf-erp/package.json', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'apps/mf-erp/node_modules/.cache/playwright');
const { chromium } = require('playwright');
const { executeSync } = require('graphql');

const visible = locator => locator.waitFor({ state: 'visible' });
let platform, browser, idp;
const standaloneServers = [];
const errors = [], calls = [], requests = [], violations = [];
const readRoots = {
  obtenerFlujoCaja: { totalIngresosBs: 0, totalEgresosBs: 0, saldoNetoBs: 0, movimientos: [] },
  listarPacientes: [
    { id: PATIENT_IDS.REAL, ciNit: '1001', nombres: 'Carlos', apellidos: 'Real', telefonoWhatsapp: '70000001', email: null, direccion: null, activo: true },
    { id: PATIENT_IDS.ZERO, ciNit: '1002', nombres: 'Zoe', apellidos: 'Zero', telefonoWhatsapp: '70000002', email: null, direccion: null, activo: true },
    { id: PATIENT_IDS.FALLBACK, ciNit: '1003', nombres: 'Fabio', apellidos: 'Fallback', telefonoWhatsapp: '70000003', email: null, direccion: null, activo: true },
  ],
  ...Object.fromEntries(['listarOdontologos', 'listarEspecialidades', 'listarConsultorios', 'listarServiciosOdontologicos', 'listarUsuarios', 'listarRoles', 'listarAuditLogs', 'listarOrdenesCobro'].map(key => [key, []])),
  obtenerConfiguracionEmpresa: { id: '11111111-1111-4111-8111-111111111111', nombreComercial: 'Smoke fixture', nit: 'fixture', razonSocial: 'Smoke fixture', direccion: 'Fixture only', telefonoContacto: 'fixture', emailContacto: null, monedaSimbolo: 'Bs' },
};

async function fixtureContext({ unavailable = false, standaloneOrigin } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const idpOrigin = new URL(idp.issuer).origin;
  const origins = new Set([
    platform.shell.origin,
    ...Object.values(platform.remotes).map(remote => remote.origin),
    ...(standaloneOrigin ? [standaloneOrigin] : []),
    idpOrigin,
  ]);

  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());

    if (url.origin === idpOrigin) {
      const handled = await idp.handleRoute(route, request, url);
      if (handled) return;
    }

    if (url.origin === platform.shell.origin && url.pathname === '/platform-config.json') {
      return route.fulfill({
        json: {
          ...platform.manifest,
          oidc: {
            issuer: idp.issuer,
            clientId: idp.clientId,
            redirectUri: `${platform.shell.origin}/auth/callback`,
            postLogoutRedirectUri: `${platform.shell.origin}/`,
            scopes: ['openid', 'profile'],
            apiAudiences: idp.apiAudiences,
          },
        },
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': platform.shell.origin,
        },
      });
    }

    const isApi = url.pathname.startsWith('/api/');
    requests.push({ url: url.href, type: request.resourceType() });
    if (isApi) {
      if (!standaloneOrigin && url.origin !== platform.shell.origin) violations.push(`Wrong API origin: ${url.origin}${url.pathname}`);
      const headers = { 'access-control-allow-origin': standaloneOrigin ?? platform.shell.origin, 'access-control-allow-headers': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push({ path: url.pathname, authorization: request.headers().authorization, standalone: !!standaloneOrigin });
      try {
        let json;
        if (url.pathname === '/api/erp/graphql') {
          assert.equal(request.method(), 'POST');
          const body = request.postDataJSON();
          const { document, operation } = validateRequest(body.query, body.variables, body.operationName);
          assert.equal(operation.operation, 'query', 'No GraphQL mutations allowed');
          json = executeSync({ schema, document, rootValue: readRoots, variableValues: body.variables, operationName: body.operationName });
          assert.ok(!json.errors?.length, JSON.stringify(json.errors));
        } else {
          assert.equal(request.method(), 'GET', 'No REST writes allowed');
          const fixtures = {
            '/api/agendamiento/citas': citasFixture,
            '/api/agendamiento/ml/clusters': clustersFixture,
            '/api/agendamiento/horarios': { horarios: [] },
            '/api/agendamiento/stock': { insumos: [] },
            '/api/expediente/health': { status: 'ok', service: 'Smoke fixture MS2', database: 'connected', timestamp: '2026-01-01T00:00:00Z' },
            '/api/expediente/historias-clinicas': [],
          };
          assert.ok(Object.hasOwn(fixtures, url.pathname), `Unrecognized fixture endpoint: ${url.pathname}`);
          json = fixtures[url.pathname];
        }
        return route.fulfill({ json, headers });
      } catch (error) {
        errors.push(String(error));
        return route.fulfill({ status: 500, json: { errors: [{ message: 'Smoke fixture rejected request' }] }, headers });
      }
    }
    // Never forward model/CDN/API traffic. Only owned artifact origins reach HTTP.
    if (['huggingface.co', 'cdn.jsdelivr.net'].includes(url.hostname)) return route.abort(); // ERP model initialization is deliberately offline.
    if (!origins.has(url.origin)) { violations.push(`Unexpected network origin: ${url.origin}${url.pathname}`); return route.abort(); }
    if (unavailable && url.origin === platform.remotes.operations.origin && url.pathname === `${release}remote.js`) return route.fulfill({ status: 503, body: 'Remote deliberately unavailable', headers: { 'access-control-allow-origin': platform.shell.origin } });
    return route.continue();
  });
  return context;
}

const heading = (page, name) => visible(page.getByRole('heading', { name, exact: true }));
const appNav = (page, name) => page.getByRole('navigation', { name: 'Applications', exact: true }).getByRole('link', { name, exact: true }).click();
async function assertMount(page, name) {
  await heading(page, name);
  assert.equal(await page.getByRole('heading', { name, exact: true }).count(), 1, 'No duplicate remote roots');
  assert.equal(await page.locator('platform-shell').count(), 1);
}

async function signIn(page) {
  await heading(page, 'Sign in');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await heading(page, 'Dental platform');
  await visible(page.getByRole('button', { name: 'Sign out', exact: true }));
}

async function loginShell(page) {
  await page.goto(`${platform.shell.origin}/login`);
  await signIn(page);
}

try {
  assert.ok(existsSync(chromium.executablePath()), 'Local ERP Chromium missing; browser installation not authorized');
  platform = await startPlatform();
  idp = await createSyntheticIdp({
    redirectUri: `${platform.shell.origin}/auth/callback`,
    onViolation: violation => violations.push(violation),
  });
  browser = await chromium.launch({ headless: true });
  const context = await fixtureContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const origin = platform.shell.origin;
  await page.goto(origin);
  await heading(page, 'Dental platform');
  await loginShell(page);

  const shellFont = () => page.locator('.brand').evaluate(element => getComputedStyle(element).fontFamily);
  const vue = 'Microfrontend MF2 — Agenda, Horarios y Stock', react = 'OdontoClinic — Expediente Clínico';
  for (let cycle = 0; cycle < 2; cycle++) {
    // ERP global CSS intentionally remains loaded. Compare each shadow remote to
    // the shell immediately before mounting it, not to pre-ERP global styles.
    const font = await shellFont();
    await appNav(page, 'Operations'); await assertMount(page, vue);
    await heading(page, 'Agendar Nueva Cita Médica');

    // Real browser spending assertions in composed Shell (pierces Shadow DOM)
    await visible(page.getByText('Gasto real verificado: 240 Bs', { exact: true }));
    await visible(page.getByText('Gasto real verificado: 0 Bs', { exact: true }));
    await visible(page.getByText('Gasto estimado (referencia): 180 Bs').first());
    const fallbackRow = page.locator('tbody tr', { hasText: 'c-fallback' });
    assert.equal(await fallbackRow.locator('[data-spending-real]').count(), 0, 'Fallback patient must have no verified real spending');

    assert.equal(await shellFont(), font, 'Vue styles must not leak');
    await page.getByRole('button', { name: /Horarios Médicos/ }).click();
    await page.waitForURL('**/operations/horarios'); await heading(page, 'Disponibilidad de Odontólogos');
    await page.goBack(); await heading(page, 'Agendar Nueva Cita Médica');
    await page.goForward(); await heading(page, 'Disponibilidad de Odontólogos');

    // Document reload wipes in-memory session; Shell guard redirects to /login.
    await page.reload();
    await heading(page, 'Sign in');
    assert.equal(await page.getByRole('heading', { name: vue }).count(), 0, 'Guarded remote must not render on unauthenticated reload');
    await signIn(page);
    await appNav(page, 'Operations');
    await assertMount(page, vue);
    await page.getByRole('button', { name: /Horarios Médicos/ }).click();
    await page.waitForURL('**/operations/horarios');
    await heading(page, 'Disponibilidad de Odontólogos');

    const beforeReact = await shellFont();
    await appNav(page, 'Clinical'); await assertMount(page, react);
    assert.equal(await shellFont(), beforeReact, 'React styles must not leak');
    await page.getByRole('button', { name: /Nueva Historia Clínica/ }).click();
    await page.waitForURL('**/clinical/crear'); await heading(page, 'Apertura de Nuevo Expediente Clínico Odontológico');
    await page.goBack(); await heading(page, 'Búsqueda de Expediente Clínico');
    await page.goForward(); await heading(page, 'Apertura de Nuevo Expediente Clínico Odontológico');

    // Document reload wipes in-memory session; Shell guard redirects to /login.
    await page.reload();
    await heading(page, 'Sign in');
    assert.equal(await page.getByRole('heading', { name: react }).count(), 0, 'Guarded remote must not render on unauthenticated reload');
    await signIn(page);
    await appNav(page, 'Clinical');
    await assertMount(page, react);
    await page.getByRole('button', { name: /Nueva Historia Clínica/ }).click();
    await page.waitForURL('**/clinical/crear');
    await heading(page, 'Apertura de Nuevo Expediente Clínico Odontológico');

    await page.getByRole('button', { name: /Conectividad/, exact: false }).click();
    await visible(page.getByText('Smoke fixture MS2', { exact: true }));
    await appNav(page, 'ERP'); await heading(page, 'Flujo de caja');
    assert.equal(await page.locator('erp-layout').count(), 1);

    for (const [path, navName, title] of [
      ['billing', 'Cobros', 'Órdenes de cobro'],
      ['catalogs/patients', 'Catálogos', 'Pacientes'],
    ]) {
      // Document goto to guarded path redirects unauthenticated user to /login
      await page.goto(`${origin}/erp/${path}`);
      await heading(page, 'Sign in');
      assert.equal(await page.locator('erp-layout').count(), 0, 'Guarded remote must not render on unauthenticated goto');
      await signIn(page);
      await appNav(page, 'ERP');
      await heading(page, 'Flujo de caja');
      await page.locator('erp-layout').getByRole('link', { name: navName, exact: true }).click();
      await heading(page, title);

      // Document reload wipes in-memory session; redirects to /login
      await page.reload();
      await heading(page, 'Sign in');
      assert.equal(await page.locator('erp-layout').count(), 0, 'Guarded remote must not render on unauthenticated reload');
      await signIn(page);
      await appNav(page, 'ERP');
      await heading(page, 'Flujo de caja');
      await page.locator('erp-layout').getByRole('link', { name: navName, exact: true }).click();
      await heading(page, title);
    }
    await appNav(page, 'Home'); await heading(page, 'Dental platform');
    assert.equal(await page.locator('erp-layout').count(), 0);
    assert.equal(await page.getByRole('heading', { name: vue }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: react }).count(), 0);
  }
  await context.close();
  for (const remote of platform.manifest.remotes) {
    assert.ok(requests.some(request => request.url === remote.entry), `Missing real entry request: ${remote.id}`);
    assert.ok(requests.some(request => request.url === remote.styles), `Missing real style request: ${remote.id}`);
  }
  for (const path of ['/api/agendamiento/citas', '/api/agendamiento/ml/clusters', '/api/agendamiento/horarios', '/api/agendamiento/stock', '/api/expediente/health', '/api/erp/graphql']) {
    assert.ok(calls.some(call => call.path === path), `Missing gateway fixture call: ${path}`);
  }
  for (const path of ['/api/agendamiento/citas', '/api/expediente/health']) {
    const matching = calls.filter(call => call.path === path && !call.standalone);
    assert.ok(matching.length > 0, `Missing hosted gateway fixture call: ${path}`);
    assert.ok(
      matching.every(call => call.authorization?.startsWith('Bearer ') && idp.hasIssuedToken(call.authorization.slice(7))),
      `Host token capability not forwarded with valid IdP token: ${path}`
    );
  }
  console.log('PASS multi-origin release assets, configured gateway, token callback, style isolation, routing/history, reloads require re-sign-in (in-memory session), repeated mounts, spending labels');

  const failed = await fixtureContext({ unavailable: true });
  const failurePage = await failed.newPage(); failurePage.setDefaultTimeout(20000);
  await loginShell(failurePage);
  await appNav(failurePage, 'Operations');
  await visible(failurePage.getByRole('alert').filter({ hasText: 'This application could not be loaded' }));
  await appNav(failurePage, 'Home'); await heading(failurePage, 'Dental platform');
  await appNav(failurePage, 'Clinical'); await assertMount(failurePage, react);
  await appNav(failurePage, 'ERP'); await heading(failurePage, 'Flujo de caja');
  await failed.close();
  console.log('PASS unavailable remote fails visibly in fresh context; shell and other remotes still work');

  for (const [dir, title] of [['apps/mf2-vue-wendy/dist', vue], ['apps/mf3-react-henry/dist', react]]) {
    assert.ok(existsSync(resolve(root, dir, 'index.html')), `Standalone build missing: ${dir}`);
    const server = await serve(dir, { spa: true }); standaloneServers.push(server);
    const standalone = await fixtureContext({ standaloneOrigin: server.origin });
    const standalonePage = await standalone.newPage();
    await standalonePage.goto(server.origin); await heading(standalonePage, title);
    await standalone.close();
  }
  assert.deepEqual(errors, [], 'Browser or fixture errors');
  assert.deepEqual(violations, [], 'Unexpected network requests');
  console.log('PASS Vue/React standalone headings; no backend forwarding or writes');
} catch (error) {
  console.error('FAIL platform smoke:', error);
  if (errors.length) console.error('Browser/fixture errors:', errors);
  if (violations.length) console.error('Network violations:', violations);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); }
  finally { await Promise.all([platform?.close(), ...standaloneServers.map(server => server.close())]); }
}
