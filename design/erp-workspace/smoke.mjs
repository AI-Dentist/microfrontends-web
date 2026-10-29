// Offline public-interface smoke. No server, installation, app data, or persistence.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('apps/mf-erp/node_modules/.cache/playwright/', root));
const require = createRequire(new URL('apps/mf-erp/package.json', root));
const { chromium } = require('playwright');
const htmlURL = new URL('01-unified-workspace.html', import.meta.url);
const source = await readFile(htmlURL, 'utf8');
const system = await readFile(new URL('design/system.md', root), 'utf8');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
const colors = [...new Set(source.match(/#[0-9a-f]{6}\b/gi))].sort();
for (const color of colors) check(system.includes(color), `Sourced palette: ${color}`);
const families = [...new Set([...source.matchAll(/font(?:-family)?\s*:[^;{}\n]*?(system-ui[^;{}\n]*)/g)].map(match => match[1].trim()))];
check(families.length === 1 && families[0] === "system-ui,'Segoe UI',Roboto,sans-serif", 'Only the sourced system font stack');
check(!/(?:https?:\/\/|\bsrc\s*=|@import|url\s*\()/i.test(source), 'No external resource references');
check(source.includes('rgba(15,23,42,.6)') && source.includes('rgb(0 0 0 / .05)'), 'Overlay and shadow match source');
console.log(`Palette self-check: ${colors.join(', ')}; font: ${families.join('; ')}; sourced overlay/shadow alpha only.`);

let browser;
const contexts = [];
const errors = [];
const network = [];
try {
  // Use the existing full Chromium binary, never trigger a download.
  browser = await chromium.launch({ headless:true, executablePath:chromium.executablePath() });
  async function openPage(viewport) {
    const context = await browser.newContext({ viewport, reducedMotion:'reduce' });
    contexts.push(context);
    await context.route(/^https?:/i, async route => { network.push(route.request().url()); await route.abort(); });
    await context.addInitScript(() => {
      window.demoViolations = [];
      const record = label => { window.demoViolations.push(label); throw new Error(`Forbidden demo operation: ${label}`); };
      for (const method of ['setItem','removeItem','clear']) Storage.prototype[method] = () => record(`storage.${method}`);
      Object.defineProperty(document, 'cookie', { get:() => '', set:() => record('cookie') });
      window.fetch = () => record('fetch');
      XMLHttpRequest.prototype.open = () => record('XHR');
      navigator.sendBeacon = () => record('beacon');
      if (window.indexedDB) indexedDB.open = () => record('indexedDB');
      if (window.caches) caches.open = () => record('cache');
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => record('serviceWorker');
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(htmlURL.href);
    return page;
  }
  const page = await openPage({width:1440,height:1000});
  const text = selector => page.locator(selector).innerText();
  const go = async id => {
    await page.locator(`#navigation [data-page="${id}"]`).click();
    check(await page.locator(`#navigation [data-page="${id}"]`).getAttribute('aria-current') === 'page', `Active navigation ${id}`);
  };
  const rows = selector => page.locator(`${selector} tbody tr`);
  const noOverflow = async target => check(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page horizontal overflow');
  const snapshotKPIs = () => page.locator('[data-kpi]').allTextContents();

  check(await text('#page-title') === 'Flujo de caja', 'Initial dashboard');
  check(await page.locator('[data-kpi]').count() === 4, 'Four KPIs');
  check((await snapshotKPIs()).join('|') === 'Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'Initial coherent totals');
  check(await page.locator('header').count() === 1 && await page.locator('aside').count() === 1 && await page.locator('main').count() === 1, 'One shell');
  check((await text('.fixture')).includes('Prototipo · datos ficticios · sin backend'), 'Visible demo disclaimer');
  await noOverflow(page);
  await page.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await page.locator('#menu-toggle').click();
  check(await page.locator('#menu-toggle').getAttribute('aria-expanded') === 'false', 'Desktop sidebar collapse');
  await page.locator('#menu-toggle').click();
  check(await page.locator('#menu-toggle').getAttribute('aria-expanded') === 'true', 'Desktop sidebar restore');

  await go('payments');
  check(await rows('#order-results').count() === 3, 'All orders');
  await page.locator('#order-status').selectOption('partial');
  check(await rows('#order-results').count() === 1 && (await text('#order-results')).includes('ORD-102'), 'Partial status filter');
  await page.locator('#order-search').fill('not-a-fixture');
  check((await text('#order-results')).includes('No hay órdenes'), 'Payment empty state');
  await page.locator('#order-search').fill('Bruno');
  check(await rows('#order-results').count() === 1, 'Patient search combined with status');
  const paymentTrigger = page.locator('[data-pay="ORD-102"]');
  await paymentTrigger.click();
  check(await page.locator('#payment-dialog').isVisible() && (await text('#payment-summary')).includes('Bs 800,00'), 'Payment selection and balance');
  // Native modal traps keyboard focus and Escape restores its initiating control.
  await page.keyboard.press('Shift+Tab');
  check(await page.evaluate(() => !!document.activeElement.closest('#payment-dialog')), 'Dialog focus trap');
  await page.keyboard.press('Escape');
  check(!await page.locator('#payment-dialog').isVisible(), 'Escape closes payment');
  check(await paymentTrigger.evaluate(node => node === document.activeElement), 'Payment trigger focus restored');
  check((await text('#order-results')).includes('Bs 800,00'), 'Escape preserves balance');
  await paymentTrigger.click();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  check(!await page.locator('#payment-dialog').isVisible() && (await text('#order-results')).includes('Bs 800,00'), 'Cancel preserves balance');
  await paymentTrigger.click();
  for (const invalid of ['0','-1','800.01','1.001']) {
    await page.locator('#payment-amount').fill(invalid);
    await page.locator('#payment-form button[type=submit]').click();
    check(await page.locator('#payment-dialog').isVisible() && (await text('#payment-error')).includes('importe positivo'), `Reject payment ${invalid}`);
    check((await text('#order-results')).includes('Bs 800,00'), 'Rejected payment leaves row unchanged');
  }
  await page.locator('#payment-amount').fill('200');
  await page.locator('#payment-form button[type=submit]').click();
  check(!await page.locator('#payment-dialog').isVisible(), 'Payment confirmed');
  check((await text('#order-results')).includes('Bs 600,00'), 'Payment reduces balance');
  check(await text('#announcement') === 'Cobro simulado; no se envió al backend', 'Exact simulated-payment status');
  await go('overview');
  check((await snapshotKPIs()).join('|') === 'Bs 900,00|Bs 250,00|Bs 650,00|Bs 1.200,00', 'Payment updates income, net and pending, no rejected-payment effects');
  await go('payments');
  await page.locator('[data-pay="ORD-102"]').click();
  await page.locator('#payment-amount').fill('600');
  await page.locator('#payment-form button[type=submit]').click();
  await page.locator('#order-status').selectOption('paid');
  check(await rows('#order-results').count() === 2 && !await page.locator('[data-pay="ORD-102"]').count(), 'Exact remaining balance marks paid');

  await go('patients');
  await page.getByRole('button',{name:'Registrar paciente',exact:true}).click();
  await page.locator('#patient-form button[type=submit]').click();
  check((await text('#patient-error')).includes('nombre ficticio'), 'Required patient fields validated');
  await page.locator('#patient-name').fill('Nombre de prueba');
  await page.locator('#patient-document').fill('DEMO-001');
  await page.locator('#patient-form button[type=submit]').click();
  check((await text('#patient-error')).includes('ya existe'), 'Duplicate document rejected');
  check((await text('#patient-results')).includes('3 registros ficticios'), 'Rejected patients leave directory unchanged');
  const safeName = '<img onerror=throw(1)> Ejemplo';
  await page.locator('#patient-name').fill(safeName);
  await page.locator('#patient-document').fill('DEMO-004');
  await page.locator('#patient-form button[type=submit]').click();
  check(!await page.locator('#patient-dialog').isVisible(), 'Patient created');
  await page.locator('#patient-search').fill('DEMO-004');
  check(await rows('#patient-results').count() === 1 && (await text('#patient-results')).includes(safeName), 'Safe literal user text and patient search');
  check(await page.locator('#patient-results img').count() === 0, 'No HTML execution');
  await page.locator('#patient-search').fill('missing');
  check((await text('#patient-results')).includes('No se encontraron'), 'Patient empty state');
  await page.getByRole('button',{name:'Registrar paciente',exact:true}).click();
  await page.keyboard.press('Escape');
  check(await page.getByRole('button',{name:'Registrar paciente',exact:true}).evaluate(node=>node===document.activeElement), 'Patient Escape focus restoration');

  await go('agenda');
  check(await rows('#agenda-results').count() === 3, 'Daily agenda');
  await page.locator('#agenda-period').selectOption('week');
  check(await rows('#agenda-results').count() === 4, 'Weekly agenda');
  await page.locator('#agenda-professional').selectOption('Dr. Sur · demo');
  await page.locator('#agenda-status').selectOption('scheduled');
  check(await rows('#agenda-results').count() === 2, 'Professional and status filters');
  await page.locator('#agenda-status').selectOption('confirmed');
  check((await text('#agenda-results')).includes('No hay citas'), 'Agenda empty state');
  await go('clinical');
  check((await text('#clinical-results')).includes('Control preventivo'), 'Clinical summary');
  await page.locator('#clinical-patient').selectOption('DEMO-004');
  check((await text('#clinical-results')).includes('no tiene consultas'), 'Clinical newly-created patient empty state');
  await go('inventory');
  await page.locator('#inventory-status').selectOption('low');
  check(await rows('#inventory-results').count() === 2, 'Low-stock filter');
  await page.locator('#inventory-search').fill('Guantes');
  check(await rows('#inventory-results').count() === 1 && (await text('#inventory-results')).includes('1 insumos con stock bajo'), 'Search and stock-warning count agree');
  await page.locator('#inventory-search').fill('missing');
  check((await text('#inventory-results')).includes('0 insumos con stock bajo') && (await text('#inventory-results')).includes('No hay insumos'), 'Inventory empty state and warning count');

  await go('settings');
  await page.locator('#setting-clinic').fill('Clínica Demo Sierra');
  await page.getByRole('tab',{name:'Apariencia',exact:true}).click();
  await page.locator('#setting-brand').selectOption('#0f766e');
  await page.locator('#setting-density').selectOption('compact');
  await page.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  check(await text('#clinic-name') === 'Clínica Demo Sierra', 'Saved clinic updates header');
  check(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--action').trim()) === '#0f766e', 'Saved theme');
  check(await page.locator('body').getAttribute('data-density') === 'compact', 'Saved density');
  check(await text('#announcement') === 'Cambios de demo guardados. Solo en memoria; se pierde al recargar', 'Exact memory-only save status');
  await page.getByRole('tab',{name:'Navegación',exact:true}).click();
  await page.locator('[data-nav-id="inventory"] input').uncheck();
  await page.locator('[data-nav-id="payments"] [data-move="up"]').click();
  check(await page.locator('[data-nav-id="settings"] input').isDisabled(), 'Configuration access protected');
  await page.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  check(await page.locator('#navigation button').first().getAttribute('data-page') === 'payments', 'Accessible reorder saved');
  check(await page.locator('#navigation [data-page="inventory"]').count() === 0, 'Hide saved');
  await page.getByRole('tab',{name:'Roles',exact:true}).click();
  check((await page.locator('.role h3').allTextContents()).join('|') === 'Administrador|Recepcionista|Médico', 'Staff roles only, no patient role');
  await page.locator('#new-role').fill('Paciente');
  await page.locator('#add-role').click();
  check((await text('#role-error')).includes('no un rol'), 'Patient role rejected');
  await page.locator('#new-role').fill('Coordinación');
  await page.locator('#add-role').click();
  await page.locator('[data-role="Coordinación"] input[value="Agenda"]').check();
  await page.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  await go('overview');
  await go('settings');
  await page.getByRole('tab',{name:'Roles',exact:true}).click();
  check(await page.locator('[data-role="Coordinación"] input[value="Agenda"]').isChecked(), 'Local role permission saved across views');
  await page.getByRole('tab',{name:'Navegación',exact:true}).click();
  await page.locator('[data-nav-id="inventory"] input').check();
  await page.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  check(await page.locator('#navigation [data-page="inventory"]').count() === 1, 'Show saved');
  await page.getByRole('tab',{name:'Clínica',exact:true}).click();
  await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab',{name:'Apariencia',exact:true}).getAttribute('aria-selected') === 'true', 'Keyboard tab navigation');
  await noOverflow(page);

  const mobile = await openPage({width:390,height:844});
  await noOverflow(mobile);
  check(await mobile.locator('#menu-toggle').getAttribute('aria-expanded') === 'false', 'Mobile drawer initially closed');
  check(await mobile.locator('#clinic-name').innerText() === 'Clínica Dental Andina', 'Fresh context resets settings');
  await mobile.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  await mobile.locator('#menu-toggle').click();
  check(await mobile.locator('#menu-toggle').getAttribute('aria-expanded') === 'true', 'Mobile drawer opens');
  await mobile.keyboard.press('Shift+Tab');
  check(await mobile.evaluate(()=>!!document.activeElement.closest('#sidebar')), 'Drawer keyboard focus trapped');
  await mobile.keyboard.press('Escape');
  check(await mobile.locator('#menu-toggle').evaluate(node=>node===document.activeElement), 'Drawer Escape restores focus');
  for (const id of ['payments','patients','agenda','clinical','inventory','settings','overview']) {
    await mobile.locator('#menu-toggle').click();
    await mobile.locator(`#navigation [data-page="${id}"]`).click();
    check(await mobile.locator('#menu-toggle').getAttribute('aria-expanded') === 'false', `Mobile ${id} closes drawer`);
    await noOverflow(mobile);
  }
  await page.reload();
  check((await snapshotKPIs()).join('|') === 'Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'Reload resets all payments');
  for (const context of contexts) for (const item of context.pages()) check(await item.evaluate(()=>window.demoViolations.length) === 0, 'No API or storage writes');
  check(network.length === 0, `No HTTP requests: ${network.join(', ')}`);
  check(errors.length === 0, `No page errors: ${errors.join(', ')}`);
  console.log(`PASS ${checks} checks · 1440×1000 + 390×844 · screenshots: desktop.png, mobile.png · HTTP/API/storage writes: 0 · page errors: 0`);
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
}
