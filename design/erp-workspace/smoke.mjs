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
  // T2: clinical records are patient-specific, editable, and only committed on submit.
  await go('patients');
  await page.locator('[data-chart="DEMO-001"]').click();
  check((await text('#clinical-results')).includes('Sin registrar'), 'Undocumented clinical context is explicit');
  const clinicalList = kind => page.locator(`#context-${kind}`);
  async function contextForm(kind, values, edit = false) {
    await page.locator(edit ? `#context-${kind} [data-context-edit]` : `[data-context-add="${kind}"]`).first().click();
    for (const [field,value] of Object.entries(values)) await page.locator(`#context-${field}`).fill(value);
  }
  const undocumented=await text('#clinical-results');
  await contextForm('allergies',{});
  await page.locator('#context-form button[type=submit]').click();
  check(await text('#context-error')==='Completa los campos del antecedente ficticio.' && await text('#clinical-results')===undocumented, 'Required clinical fields reject without mutation');
  await page.keyboard.press('Escape');
  await contextForm('allergies',{substance:'Penicilina <demo>',reaction:'Erupción'});
  await page.locator('#context-severity').selectOption('Leve');
  await page.locator('#context-form button[type=submit]').click();
  check((await clinicalList('allergies').innerText()).includes('Penicilina <demo>') && (await clinicalList('allergies').innerText()).includes('Erupción · Leve'), 'Allergy created with literal substance, reaction and severity');
  await contextForm('allergies',{reaction:'Reacción editada'},true);
  await page.locator('#context-form button[type=submit]').click();
  check((await clinicalList('allergies').innerText()).includes('Reacción editada'), 'Allergy edit');
  await contextForm('familyHistory',{relation:'Madre',condition:'Condición ficticia'});
  await page.locator('#context-form button[type=submit]').click();
  await contextForm('familyHistory',{condition:'Condición editada'},true);
  await page.locator('#context-form button[type=submit]').click();
  check((await clinicalList('familyHistory').innerText()).includes('Madre · Condición editada'), 'Family history creation and edit');
  await contextForm('personalHistory',{notes:'Nota personal ficticia'});
  await page.locator('#context-form button[type=submit]').click();
  check((await clinicalList('personalHistory').innerText()).includes('Nota personal ficticia'), 'Personal history note');
  await contextForm('personalHistory',{notes:'Nota personal editada'},true);
  await page.locator('#context-form button[type=submit]').click();
  check((await clinicalList('personalHistory').innerText()).includes('Nota personal editada'), 'Personal history edit');
  const clinicalBefore = await text('#clinical-results');
  for (const dismiss of ['cancel','escape']) {
    const trigger=page.locator('[data-context-add="allergies"]');
    await contextForm('allergies',{substance:'Descartar',reaction:'Borrador'});
    await page.locator('#context-form button[type=submit]').focus();
    await page.keyboard.press('Tab');
    check(await page.locator('#context-substance').evaluate(node=>node===document.activeElement), 'Clinical Tab wraps');
    await page.keyboard.press('Shift+Tab');
    check(await page.locator('#context-form button[type=submit]').evaluate(node=>node===document.activeElement), 'Clinical Shift+Tab wraps');
    if(dismiss==='cancel') await page.locator('#context-dialog [data-close]').click(); else await page.keyboard.press('Escape');
    check(await text('#clinical-results')===clinicalBefore && await trigger.evaluate(node=>node===document.activeElement), `Clinical ${dismiss} preserves data and focus`);
  }
  await page.locator('#clinical-patient').selectOption('DEMO-002');
  check(!(await text('#clinical-results')).includes('Penicilina') && !(await text('#clinical-results')).includes('Condición editada') && !(await text('#clinical-results')).includes('Nota personal editada'), 'Cross-patient isolation');
  await go('overview'); await go('clinical');
  await page.locator('#clinical-patient').selectOption('DEMO-001');
  check((await text('#clinical-results')).includes('Reacción editada') && (await text('#clinical-results')).includes('Condición editada'), 'Clinical persistence across views');
  await page.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await page.locator('#clinical-patient').selectOption('DEMO-002');
  await contextForm('familyHistory',{relation:'Padre',condition:'Solo Bruno'});
  await page.locator('#context-form button[type=submit]').click();
  await page.locator('#clinical-patient').selectOption('DEMO-001');
  for(const kind of ['allergies','familyHistory','personalHistory']) {
    await page.locator(`#context-${kind} [data-context-remove]`).click();
    check((await clinicalList(kind).innerText()).includes('Sin registrar'), `Remove ${kind}`);
  }
  await page.locator('#clinical-patient').selectOption('DEMO-002');
  check((await clinicalList('familyHistory').innerText()).includes('Padre · Solo Bruno'), 'Deleting Alba history preserves Bruno history');

  await go('catalogs');
  const catalogRows = () => page.locator('#catalog-results tbody tr');
  async function catalogTab(kind) { await page.locator(`[data-catalog-tab="${kind}"]`).click(); }
  async function catalogForm(values, edit=false) {
    await page.locator(edit ? '#catalog-results [data-catalog-edit]' : '#catalog-add').last().click();
    for(const [field,value] of Object.entries(values)) await page.locator(`#cat-${field}`).fill(value);
  }
  async function saveCatalog() { await page.locator('#catalog-form button[type=submit]').click(); }
  async function rejectCatalog(message, before) {
    await saveCatalog();
    check((await text('#catalog-error')).includes(message) && await page.locator('#catalog-dialog').isVisible(), `Catalog rejection: ${message}`);
    check(await text('#catalog-results')===before, 'Rejected catalog leaves all displayed rows unchanged');
  }
  await catalogTab('specialties');
  let specialtyBefore=await text('#catalog-results');
  await catalogForm({name:''}); await rejectCatalog('nombre',specialtyBefore); await page.keyboard.press('Escape');
  await catalogForm({name:'Ortodoncia demo'}); await saveCatalog();
  check((await text('#catalog-results')).includes('Ortodoncia demo'), 'Create specialty');
  let before=await text('#catalog-results');
  await catalogForm({name:' ortodoncia DEMO '}); await rejectCatalog('ya existe',before);
  await page.keyboard.press('Escape');
  await catalogForm({name:'Ortodoncia editada'},true); await saveCatalog();
  check((await text('#catalog-results')).includes('Ortodoncia editada'), 'Edit specialty');
  await catalogTab('rooms');
  await catalogForm({name:'Consultorio 3',location:'Planta demo'}); await saveCatalog();
  check((await text('#catalog-results')).includes('Consultorio 3') && (await text('#catalog-results')).includes('Planta demo'), 'Create consultorio');
  before=await text('#catalog-results');
  await catalogForm({name:'Consultorio 3'}); await rejectCatalog('ya existe',before); await page.keyboard.press('Escape');
  await catalogForm({name:''}); await rejectCatalog('nombre',before); await page.keyboard.press('Escape');
  await catalogForm({location:'Ubicación editada'},true);
  await page.locator('#cat-active').uncheck(); await saveCatalog();
  check((await text('#catalog-results')).includes('Ubicación editada · Inactivo'), 'Edit consultorio location and active flag');
  await catalogForm({},true); await page.locator('#cat-active').check(); await saveCatalog();
  await catalogTab('physicians');
  before=await text('#catalog-results');
  await catalogForm({name:''}); await rejectCatalog('nombre',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Dra. Este demo',document:'MED-003'});
  await rejectCatalog('especialidad',before);
  await page.getByLabel('Ortodoncia editada',{exact:true}).check();
  await page.locator('.slot-room').selectOption({label:'Consultorio 3'});
  await page.locator('.slot-end').fill('08:00');
  await rejectCatalog('posterior',before);
  await page.locator('.slot-end').fill('12:00');
  await page.locator('#add-slot').click();
  await page.locator('.slot-start').last().fill('10:00');
  await rejectCatalog('superpuestos',before);
  await page.locator('.slot-start').last().fill('12:00');
  await page.locator('.slot-end').last().fill('13:00');
  await saveCatalog();
  check(!await page.locator('#catalog-dialog').isVisible(), 'Adjacent same-day windows accepted (end equals next start)');
  await catalogForm({},true);
  await page.locator('.slot-day').last().selectOption('2');
  await saveCatalog();
  check((await text('#catalog-results')).includes('Dra. Este demo') && (await text('#catalog-results')).includes('Ortodoncia editada') && (await text('#catalog-results')).includes('Martes'), 'Physician specialties and multiple availability slots created');
  await catalogForm({},true);
  const physicianDraft=await page.locator('#catalog-fields').innerText();
  await page.locator('#cat-name').fill('No guardar edición'); await page.keyboard.press('Escape');
  await catalogForm({},true);
  check(await page.locator('#catalog-fields').innerText()===physicianDraft && await page.locator('#cat-name').inputValue()==='Dra. Este demo', 'Escape discards physician edit');
  await page.keyboard.press('Escape');
  const physicianCount=await catalogRows().count();
  await catalogForm({name:'Dra. Este editada'},true); await saveCatalog();
  check(await catalogRows().count()===physicianCount && (await text('#catalog-results')).includes('Dra. Este editada'), 'Edit physician without adding record');
  before=await text('#catalog-results');
  await catalogForm({name:'Dra. Este editada'}); await rejectCatalog('ya existe',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Otra demo',document:'MED-003'}); await rejectCatalog('documento',before); await page.keyboard.press('Escape');
  await go('agenda');
  check(await page.locator('#agenda-professional option').filter({hasText:'Dra. Este editada'}).count()===1, 'New physician visible in agenda');
  check(await page.locator('#agenda-room option').filter({hasText:'Consultorio 3'}).count()===1, 'New consultorio visible in agenda');
  await page.locator('#agenda-room').selectOption({label:'Consultorio 1'});
  check(await rows('#agenda-results').count()===2, 'Existing room fixtures retained and filter coherent');
  await go('catalogs'); await catalogTab('providers');
  for(const [mode,name] of [['LABORATORIO','Laboratorio demo'],['IMAGEN','Imagen demo']]) {
    await catalogForm({name,contact:'Contacto ficticio'});
    await page.locator('#cat-mode').selectOption(mode); await saveCatalog();
    check((await text('#catalog-results')).includes(name) && (await text('#catalog-results')).includes(mode), `Create provider ${mode}`);
  }
  await catalogForm({contact:'Contacto editado'},true); await saveCatalog();
  check((await text('#catalog-results')).includes('Contacto editado'), 'Edit provider');
  before=await text('#catalog-results');
  await catalogForm({name:'Imagen demo'}); await rejectCatalog('ya existe',before); await page.keyboard.press('Escape');
  await catalogTab('studyTypes');
  for(const [mode,name,provider] of [['LABORATORIO','Hemograma demo','Laboratorio demo'],['IMAGEN','Radiografía demo','Imagen demo']]) {
    await catalogForm({name,price:'125.50'});
    await page.locator('#cat-mode').selectOption(mode);
    await page.locator('#cat-provider').selectOption({label:provider}); await saveCatalog();
    check((await text('#catalog-results')).includes(name) && (await text('#catalog-results')).includes('Bs 125,50') && (await text('#catalog-results')).includes(provider), `Study type ${mode} has price and default provider`);
  }
  await catalogForm({price:'150.25'},true); await saveCatalog();
  check((await text('#catalog-results')).includes('Bs 150,25'), 'Edit study type price');
  before=await text('#catalog-results');
  await catalogForm({name:'Radiografía demo'}); await rejectCatalog('ya existe',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Precio inválido',price:'1.001'}); await rejectCatalog('centavos',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Descartar catálogo'}); await page.locator('#catalog-dialog [data-close]').click();
  check(await text('#catalog-results')===before, 'Catalog Cancel preserves list');
  await catalogTab('providers');
  before=await text('#catalog-results');
  await catalogForm({},true); await page.locator('#cat-mode').selectOption('LABORATORIO');
  await rejectCatalog('vinculada',before); await page.keyboard.press('Escape');
  await go('overview'); await go('catalogs');
  check((await text('#catalog-results')).includes('Contacto editado'), 'Catalog edits persist across views');
  await catalogTab('physicians');
  await page.setViewportSize({width:390,height:844});
  await noOverflow(page);
  check(await page.locator('.table-wrap').evaluate(node=>node.scrollWidth>node.clientWidth), 'Populated catalog overflow stays inside table region');
  await page.setViewportSize({width:1440,height:1000});
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
  check(await page.locator('[data-nav-id="catalogs"] input').isChecked(), 'Catalog view included in configurable navigation');
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
  await mobile.locator('#menu-toggle').click();
  check(await mobile.locator('#menu-toggle').getAttribute('aria-expanded') === 'true', 'Mobile drawer opens');
  await mobile.keyboard.press('Shift+Tab');
  check(await mobile.evaluate(()=>!!document.activeElement.closest('#sidebar')), 'Drawer keyboard focus trapped');
  await mobile.keyboard.press('Escape');
  check(await mobile.locator('#menu-toggle').evaluate(node=>node===document.activeElement), 'Drawer Escape restores focus');
  for (const id of ['payments','patients','agenda','clinical','catalogs','inventory','settings','overview']) {
    await mobile.locator('#menu-toggle').click();
    await mobile.locator(`#navigation [data-page="${id}"]`).click();
    check(await mobile.locator('#menu-toggle').getAttribute('aria-expanded') === 'false', `Mobile ${id} closes drawer`);
    await noOverflow(mobile);
  }
  await mobile.locator('#menu-toggle').click();
  await mobile.locator('#navigation [data-page="catalogs"]').click();
  await mobile.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  await mobile.locator('#catalog-add').click();
  check(await mobile.locator('#catalog-dialog').isVisible(), 'Mobile physician form opens');
  check(await mobile.locator('#catalog-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile physician form has no internal horizontal overflow');
  await mobile.keyboard.press('Escape');
  await noOverflow(mobile);
  await page.reload();
  check((await snapshotKPIs()).join('|') === 'Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'Reload resets all payments');
  await go('catalogs');
  check(!(await text('#catalog-results')).includes('Dra. Este editada'), 'Reload resets created catalogs');
  await go('clinical'); await page.locator('#clinical-patient').selectOption('DEMO-002');
  check((await clinicalList('familyHistory').innerText()).includes('Sin registrar'), 'Reload resets clinical context');
  for (const context of contexts) for (const item of context.pages()) check(await item.evaluate(()=>window.demoViolations.length) === 0, 'No API or storage writes');
  check(network.length === 0, `No HTTP requests: ${network.join(', ')}`);
  check(errors.length === 0, `No page errors: ${errors.join(', ')}`);
  console.log(`PASS ${checks} checks · 1440×1000 + 390×844 · screenshots: desktop.png, mobile.png · HTTP/API/storage writes: 0 · page errors: 0`);
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
}
