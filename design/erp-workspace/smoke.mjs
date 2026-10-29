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
  check(await page.locator('#order-results [data-receipt]').count()===1, 'Inherited cash flow now issues a receipt without changing previous outcomes');
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
  // T3 acceptance starts with independent fixtures, not the earlier mutation scenario.
  const flow = await openPage({width:1440,height:1000});
  const ft = selector => flow.locator(selector).innerText();
  const fg = async id => {
    if(await flow.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await flow.locator('#menu-toggle').click();
    await flow.locator(`#navigation [data-page="${id}"]`).click();
  };
  await fg('agenda');
  check(await flow.getByRole('button',{name:'Agendar cita',exact:true}).count()===1, 'T3 discoverable appointment creation');
  await fg('patients');
  await flow.getByRole('button',{name:'Registrar paciente',exact:true}).click();
  await flow.locator('#patient-name').fill('Dalia Flujo demo');
  await flow.locator('#patient-document').fill('FLOW-001');
  await flow.locator('#patient-form button[type=submit]').click();
  await flow.locator('[data-chart="FLOW-001"]').click();
  for(const [kind,values] of [['allergies',{substance:'Alergia Dalia',reaction:'Reacción ficticia'}],['familyHistory',{relation:'Hermana',condition:'Antecedente Dalia'}]]) {
    await flow.locator(`[data-context-add="${kind}"]`).click();
    for(const [key,value] of Object.entries(values)) await flow.locator(`#context-${key}`).fill(value);
    await flow.locator('#context-form button[type=submit]').click();
  }
  await fg('catalogs');
  const fcTab = kind => flow.locator(`[data-catalog-tab="${kind}"]`).click();
  async function fcCreate(kind,values,configure=async()=>{}) {
    await fcTab(kind); await flow.locator('#catalog-add').click();
    for(const [key,value] of Object.entries(values)) await flow.locator(`#cat-${key}`).fill(value);
    await configure(); await flow.locator('#catalog-form button[type=submit]').click();
    check(!await flow.locator('#catalog-dialog').isVisible(), `Flow catalog created: ${kind}`);
  }
  await fcCreate('specialties',{name:'Especialidad flujo'});
  await fcCreate('rooms',{name:'Sala flujo',location:'Ala demo'});
  await fcCreate('physicians',{name:'Dra. Flujo',document:'MED-FLOW'},async()=>{
    await flow.getByLabel('Especialidad flujo',{exact:true}).check();
    await flow.locator('.slot-room').selectOption({label:'Sala flujo'});
  });
  // A second doctor shares the room to exercise room conflict independently.
  await fcCreate('physicians',{name:'Dr. Alterno'},async()=>{
    await flow.getByLabel('Especialidad flujo',{exact:true}).check();
    await flow.locator('.slot-room').selectOption({label:'Sala flujo'});
  });
  for(const [mode,provider,study,price] of [['LABORATORIO','Lab flujo','Estudio lab flujo','100.10'],['IMAGEN','Imagen flujo','Estudio imagen flujo','200.20']]) {
    await fcCreate('providers',{name:provider},()=>flow.locator('#cat-mode').selectOption(mode));
    await fcCreate('studyTypes',{name:study,price},async()=>{
      await flow.locator('#cat-mode').selectOption(mode);
      await flow.locator('#cat-provider').selectOption({label:provider});
    });
  }
  await fg('agenda');
  const appointmentBefore=await ft('#agenda-results');
  await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
  await flow.locator('#appointment-patient').selectOption('FLOW-001');
  await flow.locator('#appointment-physician').selectOption({label:'Dra. Flujo'});
  await flow.locator('#appointment-room').selectOption({label:'Sala flujo'});
  await flow.locator('#appointment-reason').fill('Motivo humano ficticio');
  const submitAppointment=()=>flow.locator('#appointment-form button[type=submit]').click();
  for(const [date,time,duration,error] of [
    ['2026-05-19','09:00','30','disponibilidad'],
    ['2026-05-18','07:30','30','disponibilidad'],
    ['2026-05-18','11:45','30','disponibilidad'],
    ['2026-05-18','09:00','0','duración']
  ]) {
    await flow.locator('#appointment-date').fill(date); await flow.locator('#appointment-time').fill(time);
    await flow.locator('#appointment-duration').fill(duration); await submitAppointment();
    check((await ft('#appointment-error')).includes(error) && await ft('#agenda-results')===appointmentBefore, `Reject appointment ${date}/${time}/${duration} without list mutation`);
  }
  await flow.locator('#appointment-patient').selectOption(''); await submitAppointment();
  check((await ft('#appointment-error')).includes('válidos') && await ft('#agenda-results')===appointmentBefore, 'Unknown/empty patient rejected without mutation');
  await flow.keyboard.press('Escape');
  check(await flow.getByRole('button',{name:'Agendar cita',exact:true}).evaluate(node=>node===document.activeElement), 'Appointment Escape restores focus');
  await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
  await flow.locator('#appointment-reason').fill('Borrador descartado');
  await flow.locator('#appointment-dialog [data-close]').click();
  check(await ft('#agenda-results')===appointmentBefore, 'Appointment Cancel leaves records unchanged');
  await fg('catalogs'); await fcTab('rooms');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Sala flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-active').uncheck(); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('agenda'); await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
  check(await flow.locator('#appointment-room option').filter({hasText:'Sala flujo'}).count()===0, 'Inactive room excluded from new appointment choices');
  await flow.keyboard.press('Escape');
  await fg('catalogs'); await fcTab('rooms');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Sala flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-active').check(); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('agenda');
  await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
  await flow.locator('#appointment-patient').selectOption('FLOW-001');
  await flow.locator('#appointment-physician').selectOption({label:'Dra. Flujo'});
  await flow.locator('#appointment-room').selectOption({label:'Sala flujo'});
  await flow.locator('#appointment-date').fill('2026-05-18');
  await flow.locator('#appointment-time').fill('09:00');
  await flow.locator('#appointment-reason').fill('Motivo humano ficticio');
  await submitAppointment();
  check(!await flow.locator('#appointment-dialog').isVisible(), 'Valid appointment using all newly created resources');
  const appointmentRow=flow.locator('#agenda-results tbody tr').filter({hasText:'Dalia Flujo demo'});
  const appointmentId=await appointmentRow.locator('[data-attend]').getAttribute('data-attend');
  check((await appointmentRow.innerText()).includes('Dra. Flujo') && (await appointmentRow.innerText()).includes('Sala flujo'), 'Appointment context rendered via IDs');
  check(await appointmentRow.locator('.badge').innerText()==='Programada', 'New appointment starts Programada');
  const clinicalAppointmentBadge=()=>flow.locator(`#clinical-results .appointment:has([data-attend="${appointmentId}"]) .badge`);
  const validAgenda=await ft('#agenda-results');
  for(const doctor of ['Dra. Flujo','Dr. Alterno']) {
    await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
    await flow.locator('#appointment-patient').selectOption('FLOW-001');
    await flow.locator('#appointment-physician').selectOption({label:doctor});
    await flow.locator('#appointment-room').selectOption({label:'Sala flujo'});
    await flow.locator('#appointment-time').fill('09:15'); await flow.locator('#appointment-reason').fill('Conflicto');
    await submitAppointment();
    check((await ft('#appointment-error')).includes('ocupado') && await ft('#agenda-results')===validAgenda, `Reject ${doctor} physician/room conflict without mutation`);
    await flow.keyboard.press('Escape');
  }
  await fg('catalogs'); await fcTab('physicians');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Dra. Flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-name').fill('Dra. Flujo renombrada'); await flow.locator('#catalog-form button[type=submit]').click();
  await fcTab('rooms'); await flow.locator('#catalog-results tbody tr').filter({hasText:'Sala flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-name').fill('Sala renombrada'); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('agenda');
  check((await ft('#agenda-results')).includes('Dra. Flujo renombrada') && (await ft('#agenda-results')).includes('Sala renombrada'), 'Catalog edits update appointment labels through stable references');
  await flow.locator(`[data-attend="${appointmentId}"]`).click();
  const consultationId=await flow.locator('#consultation-record').getAttribute('data-consultation-id');
  check((await ft('#consultation-record')).includes('Dalia Flujo demo') && (await ft('#clinical-results')).includes('Alergia Dalia') && (await ft('#clinical-results')).includes('Antecedente Dalia'), 'Consultation routes to correct patient and history');
  check(await flow.locator('#consultation-diagnosis').inputValue()==='', 'No fabricated diagnosis');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Starting consultation marks linked appointment En atención');
  check(await flow.getByRole('heading',{name:'Citas y consultas',exact:true}).count()===1, 'Clinical heading includes all appointment lifecycle states');
  await flow.locator('#complete-consultation').click();
  check((await ft('#consultation-error')).includes('Completa') && (await ft('#consultation-status'))==='EN_CURSO', 'Incomplete consultation rejected');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Invalid completion leaves linked appointment En atención');
  for(const [field,value] of Object.entries({reason:'Motivo documentado',anamnesis:'Anamnesis ficticia',exploration:'Exploración ficticia',diagnosis:'Texto humano ficticio <sin IA>'})) await flow.locator(`#consultation-${field}`).fill(value);
  await flow.locator('#complete-consultation').click();
  check((await ft('#consultation-error')).includes('facturable'), 'Completion requires billables');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Missing billables do not mark appointment attended');
  await flow.locator('input[name=procedure]').first().check();
  await flow.locator('#save-consultation').click();
  await fg('agenda');
  await flow.locator('#agenda-status').selectOption('in_progress');
  check(await flow.locator('#agenda-results tbody tr').count()===1 && await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count()===1 && await appointmentRow.locator('.badge').innerText()==='En atención', 'Agenda En atención filter selects the linked started appointment');
  await flow.locator('#agenda-status').selectOption('scheduled');
  check(!await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count(), 'Started appointment no longer appears as Programada');
  await flow.locator('#agenda-status').selectOption('in_progress');
  await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check(await flow.locator('#consultation-record').getAttribute('data-consultation-id')===consultationId && await flow.locator('#consultation-diagnosis').inputValue()==='Texto humano ficticio <sin IA>', 'Continue uses one consultation and saved human text');
  await flow.locator('#request-study').click();
  const noStudies=await ft('#consultation-studies');
  await flow.locator('#study-form button[type=submit]').click();
  check((await ft('#study-error')).includes('compatible') && await ft('#consultation-studies')===noStudies, 'Unknown study/provider rejected without request mutation');
  await flow.keyboard.press('Escape');
  for(const study of ['Estudio lab flujo','Estudio imagen flujo']) {
    await flow.locator('#request-study').click();
    await flow.locator('#study-type').selectOption({label:study});
    const compatible=await flow.locator('#study-provider option').allTextContents();
    check(compatible.join('|')===(study.includes('lab')?'Lab flujo':'Imagen flujo'), 'Request provider choices match lab/image modality');
    await flow.locator('#study-form button[type=submit]').click();
    check((await ft('#consultation-studies')).includes(study) && (await ft('#consultation-studies')).includes('PENDIENTE'), `Request ${study}`);
    const studyRow=flow.locator('[data-study-row]').filter({hasText:study});
    await studyRow.getByRole('button',{name:'Registrar resultado',exact:true}).click();
    await flow.locator('#result-form button[type=submit]').click();
    check((await ft('#result-error')).includes('resultado') && (await studyRow.innerText()).includes('PENDIENTE'), 'Empty result rejected without study mutation');
    await flow.locator('#result-text').fill(`Resultado humano: ${study}`);
    await flow.locator('#result-reference').fill('REF-DEMO');
    await flow.locator('#result-form button[type=submit]').click();
    check((await studyRow.innerText()).includes('COMPLETADO') && (await studyRow.innerText()).includes(`Resultado humano: ${study}`), `Record ${study} result`);
    const completedStudies=await ft('#consultation-studies');
    await flow.locator('#request-study').click(); await flow.locator('#study-type').selectOption({label:study});
    await flow.locator('#study-form button[type=submit]').click();
    check((await ft('#study-error')).includes('ya está solicitado') && await ft('#consultation-studies')===completedStudies, 'Duplicate study rejects without changes');
    await flow.keyboard.press('Escape');
  }
  await fg('clinical');
  await flow.locator('#clinical-patient').selectOption('DEMO-001');
  check(!await flow.locator('#consultation-record').count() && !(await ft('#clinical-results')).includes('Resultado humano'), 'Consultation/results remain patient-specific');
  await fg('agenda'); await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check((await ft('#consultation-studies')).includes('REF-DEMO'), 'Study findings persist on return');
  await flow.locator('#complete-consultation').click();
  check(await ft('#consultation-status')==='CERRADA' && !await flow.locator('#consultation-form').count(), 'Completed consultation read-only');
  check(await clinicalAppointmentBadge().innerText()==='Atendida', 'Successful completion marks clinical appointment Atendida');
  await fg('agenda'); await flow.locator('#agenda-status').selectOption('attended');
  check(await flow.locator('#agenda-results tbody tr').count()===1 && await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count()===1 && await appointmentRow.locator('.badge').innerText()==='Atendida', 'Agenda Atendida filter selects the linked completed appointment');
  await flow.locator('#agenda-status').selectOption('in_progress');
  check(!await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count(), 'Completed appointment no longer appears En atención');
  await flow.locator('#agenda-status').selectOption('attended');
  await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check(await clinicalAppointmentBadge().innerText()==='Atendida', 'Reopening closed consultation cannot regress appointment state');
  const issuedOrder=await flow.locator('#consultation-order').getAttribute('data-order-id');
  await flow.locator('#consultation-order').click();
  const flowOrder=()=>flow.locator('#order-results tbody tr').filter({hasText:issuedOrder});
  check((await flowOrder().innerText()).includes('Bs 600,30'), 'Procedure 300 + lab100.10 + image200.20 exact order sum');
  await flowOrder().locator('[data-order-detail]').click();
  const immutableLines=await ft('#order-detail-lines');
  check(immutableLines.includes('Estudio lab flujo') && immutableLines.includes('Estudio imagen flujo') && immutableLines.includes('Bs 300,00'), 'Explicit order price/name snapshots');
  await flow.keyboard.press('Escape');
  await fg('overview');
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 700,00|Bs 250,00|Bs 450,00|Bs 2.000,30', 'Order increases pending, not income');
  await flow.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await fg('catalogs'); await fcTab('studyTypes');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Estudio lab flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-name').fill('Estudio lab renombrado'); await flow.locator('#cat-price').fill('999');
  await flow.locator('#catalog-form button[type=submit]').click();
  await fg('payments'); await flowOrder().locator('[data-order-detail]').click();
  check(await ft('#order-detail-lines')===immutableLines, 'Historic order unchanged after catalog edits'); await flow.keyboard.press('Escape');
  async function openQr() { await flowOrder().locator('[data-qr]').click(); }
  async function generateQr(amount) {
    await flow.locator('#qr-amount').fill(amount); await flow.locator('#qr-form button[type=submit]').click();
  }
  async function paymentSnapshot() { return {row:await flowOrder().innerText(),receipts:await flowOrder().locator('[data-receipt]').count()}; }
  await openQr();
  for(const amount of ['0','-1','600.31','1.001']) {
    await generateQr(amount);
    check((await ft('#qr-error')).includes('importe positivo') && !await flow.locator('#qr-intent-id').count(), `Reject QR ${amount} with no intent`);
  }
  await generateQr('100.10');
  check((await ft('#qr-state')).includes('PENDIENTE') && (await ft('#qr-state')).includes('QR de demostración · NO PAGABLE') && (await ft('#qr-state')).includes('Bs 100,10'), 'QR pending amount and explicit non-payable art');
  let paymentBefore=await paymentSnapshot();
  await flow.locator('#expire-qr').click();
  check((await ft('#qr-state')).includes('VENCIDO') && JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'QR expiry never settles money or receipt');
  await flow.locator('#confirm-qr').click();
  check((await ft('#qr-error')).includes('terminal') && JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'Expired intent cannot be confirmed');
  await generateQr('100.10'); await flow.locator('#cancel-qr').click();
  check((await ft('#qr-state')).includes('CANCELADO') && JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'QR cancellation never settles money or receipt');
  await flow.locator('#confirm-qr').click();
  check((await ft('#qr-error')).includes('terminal') && JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'Canceled intent cannot be confirmed');
  await generateQr('100.10');
  await flow.locator('#confirm-qr').click();
  check((await ft('#qr-state')).includes('CONFIRMADO') && (await flowOrder().innerText()).includes('Bs 500,20'), 'Partial QR confirms explicitly');
  check(await flowOrder().locator('[data-receipt]').count()===1, 'QR creates exactly one receipt');
  paymentBefore=await paymentSnapshot();
  await flow.locator('#confirm-qr').click(); await flow.locator('#confirm-qr').focus(); await flow.keyboard.press('Enter');
  check(JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'Repeated click/Enter QR confirmation is idempotent');
  await flow.keyboard.press('Escape'); await openQr(); await flow.locator('#confirm-qr').click();
  check(JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'Reopened terminal QR is idempotent');
  await flow.keyboard.press('Escape');
  await flowOrder().locator('[data-receipt]').click();
  const qrReceipt=await ft('#receipt-content');
  check(qrReceipt.includes('Sin validez fiscal · DEMO') && qrReceipt.includes('Dalia Flujo demo') && qrReceipt.includes('QR') && qrReceipt.includes('Bs 100,10') && qrReceipt.includes('Bs 500,20') && qrReceipt.includes('Clínica Dental Andina') && qrReceipt.includes('2026-05-18'), 'QR demo receipt contains patient, clinic, method, date, payment and remaining');
  await flow.keyboard.press('Escape');
  await openQr(); await generateQr('100');
  const staleId=await ft('#qr-intent-id');
  await flow.keyboard.press('Escape');
  await flowOrder().locator('[data-pay]').click(); await flow.locator('#payment-amount').fill('200.10');
  await flow.locator('#payment-form button[type=submit]').click();
  check(await flowOrder().locator('[data-receipt]').count()===2 && (await flowOrder().innerText()).includes('Bs 300,10'), 'Cash uses shared cent ledger and issues its own receipt');
  paymentBefore=await paymentSnapshot();
  await openQr(); check(await ft('#qr-intent-id')===staleId, 'Pending intent can be reopened after cash');
  await flow.locator('#confirm-qr').click();
  check((await ft('#qr-error')).includes('obsoleto') && JSON.stringify(await paymentSnapshot())===JSON.stringify(paymentBefore), 'Stale QR revision rejects without money/receipt mutation');
  await flow.keyboard.press('Escape');
  await flowOrder().locator('[data-pay]').click(); await flow.locator('#payment-amount').fill('300.10'); await flow.locator('#payment-form button[type=submit]').click();
  check((await flowOrder().innerText()).includes('Pagado') && !await flowOrder().locator('[data-pay]').count() && await flowOrder().locator('[data-receipt]').count()===3, 'Final cash fully pays with three unique receipts');
  const receiptIds=await flowOrder().locator('[data-receipt]').allTextContents();
  check(new Set(receiptIds).size===3 && receiptIds.every(id=>id.includes('DEMO-')), 'Receipt identifiers unique and explicitly demo');
  await flowOrder().locator('[data-receipt]').last().click();
  check((await ft('#receipt-content')).includes('EFECTIVO') && (await ft('#receipt-content')).includes('Bs 0,00'), 'Final cash receipt shows no remaining balance');
  await flow.keyboard.press('Escape');
  await fg('overview');
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 1.300,30|Bs 250,00|Bs 1.050,30|Bs 1.400,00', 'Only confirmed cash/QR affects income/net; original pending restored');
  await fg('agenda'); await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check(await flow.locator('#consultation-record').getAttribute('data-consultation-id')===consultationId && await ft('#consultation-status')==='CERRADA', 'Closed consultation reopens same read-only record');
  check(await clinicalAppointmentBadge().innerText()==='Atendida', 'Closed paid consultation still has an Atendida appointment');
  await flow.locator('#consultation-order').click();
  await flow.locator('#order-search').fill('');
  check(await flow.locator('#order-results tbody tr').count()===4, 'Closed consultation never issues duplicate order');
  await fg('overview');
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 1.300,30|Bs 250,00|Bs 1.050,30|Bs 1.400,00', 'Reopening closed appointment has no income, pending or order effects');
  await fg('payments');
  await flow.setViewportSize({width:390,height:844});
  await noOverflow(flow);
  for(const [selector,dialog] of [['[data-order-detail]','#order-detail-dialog'],['[data-qr]','#qr-dialog'],['[data-receipt]','#receipt-dialog']]) {
    await flowOrder().locator(selector).first().click();
    check(await flow.locator(dialog).evaluate(node=>node.scrollWidth<=node.clientWidth), `Mobile ${dialog} internal width`);
    await noOverflow(flow); await flow.keyboard.press('Escape');
  }
  await fg('agenda'); await flow.getByRole('button',{name:'Agendar cita',exact:true}).click();
  await noOverflow(flow);
  await flow.locator('#appointment-form button[type=submit]').focus(); await flow.keyboard.press('Tab');
  check(await flow.locator('#appointment-patient').evaluate(node=>node===document.activeElement), 'Mobile appointment Tab wraps');
  await flow.keyboard.press('Shift+Tab');
  check(await flow.locator('#appointment-form button[type=submit]').evaluate(node=>node===document.activeElement), 'Mobile appointment reverse Tab wraps');
  await flow.keyboard.press('Escape');
  await flow.locator(`[data-attend="${appointmentId}"]`).click(); await noOverflow(flow);
  await flow.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  // All new clinical controls also work at mobile width, including a pending-study close.
  await fg('agenda'); await flow.locator('[data-attend="AP-1"]').click();
  await noOverflow(flow);
  check(!(await ft('#clinical-results')).includes('Alergia Dalia'), 'Starting another appointment does not leak patient history');
  await flow.locator('#request-study').click(); await noOverflow(flow);
  check(await flow.locator('#study-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile study dialog internal width');
  await flow.locator('#study-type').selectOption({label:'Estudio lab renombrado'});
  await flow.locator('#study-form button[type=submit]').click();
  const pendingStudy=await ft('#consultation-studies');
  for(const dismiss of ['cancel','escape']) {
    await flow.locator('[data-result]').click(); await noOverflow(flow);
    check(await flow.locator('#result-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile result dialog internal width');
    await flow.locator('#result-text').fill('Descartar resultado');
    await flow.locator('#result-form button[type=submit]').focus(); await flow.keyboard.press('Tab');
    check(await flow.locator('#result-text').evaluate(node=>node===document.activeElement), 'Result textarea participates in focus wrap');
    if(dismiss==='cancel') await flow.locator('#result-dialog [data-close]').click(); else await flow.keyboard.press('Escape');
    check(await ft('#consultation-studies')===pendingStudy, `Result ${dismiss} preserves pending state`);
    check(await flow.locator('#clinical-results .appointment:has([data-attend="AP-1"]) .badge').innerText()==='En atención', `Result ${dismiss} does not change linked appointment lifecycle`);
  }
  for(const key of ['reason','anamnesis','exploration','diagnosis']) await flow.locator(`#consultation-${key}`).fill('Texto ficticio explícito');
  await flow.locator('#complete-consultation').click();
  check(await ft('#consultation-status')==='CERRADA' && (await ft('#consultation-studies')).includes('PENDIENTE'), 'Pending studies explicitly allowed at completion without invented results');
  await noOverflow(flow);
  await flow.reload();
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'T3 reload resets financial state');
  await fg('agenda'); check(!await flow.locator(`[data-attend="${appointmentId}"]`).count(), 'Reload removes new appointments and consultations');
  for (const context of contexts) for (const item of context.pages()) check(await item.evaluate(()=>window.demoViolations.length) === 0, 'No API or storage writes');
  check(network.length === 0, `No HTTP requests: ${network.join(', ')}`);
  check(errors.length === 0, `No page errors: ${errors.join(', ')}`);
  console.log(`PASS ${checks} checks · 1440×1000 + 390×844 · screenshots: desktop.png, mobile.png · HTTP/API/storage writes: 0 · page errors: 0`);
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
}
