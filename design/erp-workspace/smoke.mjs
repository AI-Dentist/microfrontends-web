// Public-interface smoke through the owned loopback preview; no backend or persistence.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { startPreview } from './preview.mjs';

const root = new URL('../../', import.meta.url);
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('apps/mf-erp/node_modules/.cache/playwright/', root));
const require = createRequire(new URL('apps/mf-erp/package.json', root));
const { chromium } = require('playwright');
const artifactURL = new URL('01-unified-workspace.html', import.meta.url);
const source = await readFile(artifactURL, 'utf8');
const system = await readFile(new URL('design/system.md', root), 'utf8');
let checks = 0;
function check(condition, message) { if(!condition) console.log(`FAIL after ${checks} passing checks: ${message}`); assert.ok(condition, message); checks++; }
const colors = [...new Set(source.match(/#[0-9a-f]{6}\b/gi))].sort();
for (const color of colors) check(system.includes(color), `Sourced palette: ${color}`);
const families = [...new Set([...source.matchAll(/font(?:-family)?\s*:[^;{}\n]*?(system-ui[^;{}\n]*)/g)].map(match => match[1].trim()))];
check(families.length === 1 && families[0] === "system-ui,'Segoe UI',Roboto,sans-serif", 'Only the sourced system font stack');
check(!/(?:https?:\/\/|\bsrc\s*=|@import|url\s*\()/i.test(source), 'No external resource references');
check(source.includes('rgba(15,23,42,.6)') && source.includes('rgb(0 0 0 / .05)'), 'Overlay and shadow match source');
console.log(`Palette self-check: ${colors.join(', ')}; font: ${families.join('; ')}; sourced overlay/shadow alpha only.`);

let browser;
let preview;
const contexts = [];
const errors = [];
const network = [];
const documents = [];
const operations = [];
try {
  preview = await startPreview();
  const htmlURL = new URL(preview.url);
  check(htmlURL.hostname === '127.0.0.1' && Number(htmlURL.port) > 0, 'Preview uses ephemeral IPv4 loopback URL');
  async function boundary(path, method = 'GET') {
    return new Promise((accept, reject) => {
      const req = request({hostname:htmlURL.hostname, port:htmlURL.port, path, method}, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => accept({status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks).toString('utf8')}));
      });
      req.on('error', reject);
      req.end();
    });
  }
  for (const path of ['/', '/01-unified-workspace.html']) {
    const get = await boundary(path);
    check(get.status === 200 && get.body === source, `GET ${path} serves exactly the known artifact`);
    check(get.headers['cache-control'] === 'no-store' && get.headers['content-type'] === 'text/html; charset=utf-8' && get.headers['x-content-type-options'] === 'nosniff' && get.headers['referrer-policy'] === 'no-referrer', 'Preview no-cache and content/privacy headers');
    const csp = get.headers['content-security-policy'];
    check(csp.includes("connect-src 'none'") && csp.includes("default-src 'none'") && csp.includes("script-src 'unsafe-inline'") && csp.includes("style-src 'unsafe-inline'") && csp.includes("base-uri 'none'") && csp.includes("form-action 'none'") && csp.includes("frame-ancestors 'none'") && !/sandbox/i.test(csp), 'Standalone CSP blocks network and framing without sandboxing native forms');
    const head = await boundary(path, 'HEAD');
    check(head.status === 200 && head.body === '' && head.headers['content-length'] === get.headers['content-length'], `HEAD ${path} returns document headers without body`);
  }
  for (const path of ['/missing', '/design/', '/preview.mjs', '/arbitrary.txt', '/../arbitrary.txt', '/%2e%2e/arbitrary.txt', '/01-unified-workspace.html/extra', '/?file=arbitrary.txt']) {
    const result = await boundary(path);
    check(result.status === 404 && result.body === '', `No directory/arbitrary path exposure: ${path}`);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const result = await boundary('/', method);
    check(result.status === 405 && result.headers.allow === 'GET, HEAD' && result.body === '', `${method} rejected without mutation`);
  }
  // Use the existing full Chromium binary, never trigger a download.
  browser = await chromium.launch({ headless:true, executablePath:chromium.executablePath() });
  async function enterDemo(target) {
    await target.getByRole('button',{name:'Entrar a la demo',exact:true}).click();
  }
  async function openPage(viewport,{signedIn=true}={}) {
    const context = await browser.newContext({ viewport, reducedMotion:'reduce' });
    contexts.push(context);
    await context.exposeBinding('recordDemoOperation', (_source, label) => operations.push(label));
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      const ownDocument = url.origin === htmlURL.origin && ['/', '/01-unified-workspace.html'].includes(url.pathname) && !url.search && ['GET','HEAD'].includes(req.method()) && req.isNavigationRequest() && req.resourceType() === 'document';
      if (ownDocument) { documents.push(`${req.method()} ${url.pathname}`); await route.continue(); }
      else { network.push(`${req.method()} ${req.url()}`); await route.abort(); }
    });
    await context.addInitScript(() => {
      window.demoViolations = [];
      const record = label => { window.demoViolations.push(label); window.recordDemoOperation(label); throw new Error(`Forbidden demo operation: ${label}`); };
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
    if(signedIn) await enterDemo(page);
    return page;
  }
  async function noProviderUI(target) {
    check(!/proveedor|provider/i.test(await target.locator('body').innerText()), 'No visible provider concepts in current page/dialog');
    await iconButtons(target);
  }
  // S21 focused regression: native visible click, never dispatch a synthetic submit.
  const delivery = await openPage({width:1440,height:1000},{signedIn:false});
  check(await delivery.locator('#login-screen').isVisible() && !await delivery.locator('#workspace').isVisible(), 'S21 HTTP entry begins at visible login');
  await enterDemo(delivery);
  check(await delivery.locator('#workspace').isVisible() && await delivery.locator('#workspace').getAttribute('inert') === null && await delivery.locator('#page-title').innerText() === 'Resumen', 'S21 actual HTTP demo-entry click opens interactive Resumen');
  console.log('S21 focused HTTP login and server-boundary regression: PASS');
  // T7 aggregate RED: only public, already-rendered UI; report every gap together
  // before longer connected business journeys exercise individual rules.
  const t7Early=await openPage({width:1440,height:1000});
  const t7Gaps=[];
  const t7EarlyGo=route=>t7Early.locator(`#navigation [data-page="${route}"]`).click();
  if(await t7Early.locator('#navigation [data-page="triage"]').count()) t7Gaps.push('Triage still in menu');
  if(!await t7Early.getByRole('button',{name:'Medicamentos',exact:true}).count()) t7Gaps.push('missing Medicamentos menu');
  for(const route of ['laboratory','imaging']) {
    await t7EarlyGo(route);
    const headings=await t7Early.locator('#catalog-results th').allTextContents();
    if(!headings.includes('Descripción')) t7Gaps.push(`${route}: missing Descripción column`);
    if(/precio|\bBs\b|arancel/i.test(await t7Early.locator('#view').innerText())) t7Gaps.push(`${route}: priced study UI`);
    await t7Early.locator('#catalog-add').click();
    if(await t7Early.locator('#cat-price').count()) t7Gaps.push(`${route}: study price field`);
    await t7Early.keyboard.press('Escape');
  }
  await t7EarlyGo('patients');
  const patientHeadings=await t7Early.locator('#patient-results th').allTextContents();
  if(patientHeadings.slice(0,3).join('|')!=='Nombre|Documento de identidad|Notas') t7Gaps.push('ambiguous patient columns');
  await t7Early.locator('[data-catalog-edit="DEMO-001"]').click();
  if(!await t7Early.locator('#cat-document:not([readonly]):not([disabled])').count()) t7Gaps.push('patient document not independently editable');
  await t7Early.keyboard.press('Escape');
  await t7EarlyGo('payments');
  const initiallyPaid=t7Early.locator('#order-results tr').filter({hasText:'ORD-103'});
  if(await initiallyPaid.locator('[data-pay],[data-qr]').count() || (await initiallyPaid.innerText()).includes('Sin saldo pendiente')) t7Gaps.push('paid order retains payment/QR/filler');
  check(t7Gaps.length===0,`T7 S31–S36/S38–S39 missing: ${t7Gaps.join('; ')}`);
  console.log(`T7 aggregate public HTTP contract: PASS (${checks} checks so far)`);
  // T8 aggregate RED: native Agenda → consultation before long legacy journeys.
  // Inspect actual controls, never closure state or invented diagnostic content.
  const t8Early=await openPage({width:1440,height:1000});
  await t8Early.locator('#navigation [data-page="agenda"]').click();
  await t8Early.locator('[data-attend="AP-1"]').click();
  const t8Gaps=[];
  for(const [id,label] of [['save-consultation','Guardar progreso'],['complete-consultation','Completar consulta demo']]) {
    const button=t8Early.locator(`#${id}`);
    if(await button.innerText()!==label || await button.locator('svg').count()) t8Gaps.push(`visible text ${label}`);
  }
  for(const [selector,label] of [['select#diagnosis-disease','Enfermedad'],['select#prescription-medication','Medicamento'],['#consultation-recommendations','Recomendaciones'],['#diagnosis-notes','Notas del diagnóstico'],['#prescription-instructions','Indicaciones manuales']]) {
    if(!await t8Early.locator(selector).count()) t8Gaps.push(label);
  }
  if(!await t8Early.getByRole('textbox',{name:'Notas clínicas',exact:true}).count()) t8Gaps.push('separate Notas clínicas');
  check(t8Gaps.length===0,`T8 S37 missing: ${t8Gaps.join('; ')}`);
  console.log(`T8 aggregate public HTTP contract: PASS (${checks} checks so far)`);

  // Public helper contract shared by new/legacy clinical journeys. Select values
  // are catalog IDs exposed by DOM options; these helpers never save implicitly.
  async function addDiagnosis(target,diseaseId='FIX-DIS',notes='') {
    await target.locator('#diagnosis-disease').selectOption(diseaseId);
    await target.locator('#diagnosis-notes').fill(notes);
    await target.locator('#add-diagnosis').click();
  }
  async function addPrescription(target,medicationId='FIX-MED',instructions='Indicación humana ficticia') {
    await target.locator('#prescription-medication').selectOption(medicationId);
    await target.locator('#prescription-instructions').fill(instructions);
    await target.locator('#add-prescription').click();
  }
  const startup=await openPage({width:1440,height:1000},{signedIn:false});
  const startupGaps=[];
  if(!await startup.locator('#login-screen').isVisible()) startupGaps.push('initial simulated login');
  if(!await startup.locator('#workspace[inert][hidden]').count()) startupGaps.push('hidden inert workspace');
  if(!await startup.locator('#logout').count()) startupGaps.push('logout control');
  // Source is not the acceptance surface: discover Pagos through its actual menu.
  if(await startup.getByRole('button',{name:'Entrar a la demo',exact:true}).count()) await enterDemo(startup);
  if(!await startup.getByRole('button',{name:'Pagos',exact:true}).count()) startupGaps.push('Pagos outgoing menu');
  check(startupGaps.length===0,`S17/S19/S20 missing: ${startupGaps.join('; ')}`);
  // S27 tests-first: actual matrix and selector, never closure state or fabricated routes.
  await startup.locator('#navigation [data-page="settings"]').click();
  await startup.getByRole('tab',{name:'Navegación',exact:true}).click();
  const hasProfile=await startup.getByRole('combobox',{name:'Simular rol',exact:true}).count()===1;
  const fullMatrix=await startup.locator('#navigation-permissions input[name="menu-access"]').count()===17;
  let restricted=false;
  await startup.keyboard.press('Escape');
  if(hasProfile && fullMatrix) {
    await startup.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-2');
    restricted=await startup.locator('#navigation [data-page="settings"]').count()===0 && await startup.locator('#navigation button').count()===5;
  }
  check(hasProfile && fullMatrix && restricted, 'S27 requires Simular rol, 17-menu Acceder matrix and effective restricted navigation');
  console.log(`S27 focused public HTTP contract: PASS (${checks} checks so far)`);
  // S29/S30 tests first: inspect existing rendered UI before using future selectors.
  const navigationContract=await openPage({width:1440,height:1000});
  const np=()=>navigationContract.getByRole('combobox',{name:'Simular rol',exact:true});
  const ng=async route=>{
    if(await navigationContract.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await navigationContract.locator('#menu-toggle').click();
    await navigationContract.locator(`#navigation [data-page="${route}"]`).click();
  };
  // Measure actual button border boxes, not CSS gap or intervening whitespace.
  async function actionGeometry(target,selector) {
    return target.locator(selector).evaluateAll(nodes=>nodes.map(node=>{
      const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
    }));
  }
  function separated(boxes) {
    return boxes.length>=2 && boxes.every(r=>r.width>=44 && r.height>=44) && boxes.slice(1).every((r,i)=>{
      const prior=boxes[i];
      return r.y>=prior.bottom ? r.y-prior.bottom>=8 : Math.abs(r.y-prior.y)<2 && r.x-prior.right>=8;
    });
  }
  await ng('patients');
  const firstPatientActions=await actionGeometry(navigationContract,'#patient-results tr:has([data-chart="DEMO-001"]) button');
  await ng('settings'); await navigationContract.getByRole('tab',{name:'Navegación',exact:true}).click();
  const earlyNavigationGaps=[];
  if(await navigationContract.locator('#panel-navigation select').count()!==1) earlyNavigationGaps.push('independent Navegación target-role selector');
  if(!separated(firstPatientActions)) earlyNavigationGaps.push('patient eye/edit/delete/chart rendered gaps >=8px with 44px targets');
  check(earlyNavigationGaps.length===0,`S29/S30 missing: ${earlyNavigationGaps.join('; ')}`);

  // Proposed public contract: #navigation-role labeled Rol a configurar;
  // #navigation-permissions contains name=menu-access/overview-access controls;
  // #nav-settings retains separate global visibility/order preferences.
  // One existing #settings-form submit commits the selected role and settings.
  const targetRole=()=>navigationContract.getByRole('combobox',{name:'Rol a configurar',exact:true});
  const nm=id=>navigationContract.locator(`#navigation-permissions [name="menu-access"][value="${id}"]`);
  const nc=key=>navigationContract.locator(`#navigation-permissions [name="overview-access"][value="${key}"]`);
  const ns=()=>navigationContract.locator('#settings-form button[type=submit]').click();
  const nt=()=>navigationContract.getByRole('tab',{name:'Navegación',exact:true}).click();
  const nr=()=>navigationContract.getByRole('tab',{name:'Roles',exact:true}).click();
  const chooseTarget=async id=>{await np().selectOption('ROLE-1');await ng('settings');await nt();await targetRole().selectOption(id);};
  const savedRole=async id=>{
    await nr(); await navigationContract.locator(`[data-master-view="${id}"]`).click();
    const result=await navigationContract.locator('#master-detail-content').innerText();
    await navigationContract.keyboard.press('Escape'); return result;
  };
  const publicMatrix=()=>navigationContract.locator('#navigation-permissions input').evaluateAll(nodes=>nodes.map(node=>[node.name,node.value,node.checked]));
  const nblocks=()=>navigationContract.locator('#view [data-overview-block]').evaluateAll(nodes=>nodes.map(node=>node.dataset.overviewBlock));
  const nbaseline='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00';
  check(await targetRole().getAttribute('id')==='navigation-role' && await np().getAttribute('id')!=='navigation-role','S29 target and active-profile selectors have distinct identities and labels');
  check(await navigationContract.locator('#navigation-permissions [name="menu-access"]').count()===17 && await navigationContract.locator('#navigation-permissions [name="overview-access"]').count()===3,'S29 single complete editable menu/content permission surface');
  check(await navigationContract.locator('#navigation-permissions #nav-settings,#nav-settings [name="menu-access"],#nav-settings [name="overview-access"]').count()===0 && await navigationContract.locator('#nav-settings [data-nav-id]').count()===17,'S29 global show/order controls remain separate from role grants');
  for(const id of ['ROLE-1','ROLE-2','ROLE-3']) {
    await targetRole().selectOption(id);
    check(await np().inputValue()==='ROLE-1' && await navigationContract.locator('#navigation button').count()===17,'S29 selecting permission target never switches active profile or its navigation');
    check(await navigationContract.locator('#navigation-permissions [name="menu-access"]:checked').count()===({'ROLE-1':17,'ROLE-2':5,'ROLE-3':4}[id]),`S29 target ${id} loads its own saved grants`);
  }
  const doctorSaved=JSON.stringify(await publicMatrix());
  await nm('inventory').check(); await nc('finance').check();
  await targetRole().selectOption('ROLE-2');
  check(!await nm('inventory').isChecked() && !await nc('finance').isChecked(),'S29 switching target cannot transfer another role unsaved grant draft');
  await ns(); await targetRole().selectOption('ROLE-3');
  check(JSON.stringify(await publicMatrix())===doctorSaved,'S29 saving second target leaves first target stored grants unchanged');
  // Save to ROLE-3 while ROLE-1 stays active, then inspect both actual profiles.
  await nm('inventory').check(); await nc('finance').check(); await ns();
  check(await np().inputValue()==='ROLE-1' && await navigationContract.locator('#navigation button').count()===17,'S29 save applies to selected role ID without changing active profile');
  await np().selectOption('ROLE-3'); await ng('overview');
  check(await navigationContract.locator('#navigation [data-page="inventory"]').count()===1 && await navigationContract.locator('[data-kpi]').count()===4,'S29 selected target receives saved menu and finance grants');
  await np().selectOption('ROLE-2'); await ng('overview');
  check(await navigationContract.locator('#navigation [data-page="inventory"],[data-kpi]').count()===0,'S29 permission save never widens an unselected role');
  await chooseTarget('ROLE-3'); await nc('finance').uncheck(); await nm('inventory').uncheck(); await ns();
  await np().selectOption('ROLE-3'); await ng('overview'); await noOverviewFinance(navigationContract,'Doctor after Navigation save');
  await navigationContract.getByRole('button',{name:'Personalizar Resumen',exact:true}).click();
  check(await navigationContract.locator('#overview-dialog [data-overview-preference="finance"]').count()===0 && await navigationContract.locator('#overview-dialog [name="menu-access"],#overview-dialog [name="overview-access"]').count()===0,'S29 Personalizar cannot grant financial content or menu access');
  await navigationContract.locator('[data-overview-preference="clinical"] [data-overview-move="up"]').click();
  await navigationContract.locator('[data-overview-preference="agenda"] [name="overview-visible"]').uncheck();
  await navigationContract.locator('#overview-form button[type=submit]').click();
  check(JSON.stringify(await nblocks())==='["clinical"]','S29 allowed-only personal hide/order remains available after grant relocation');
  await chooseTarget('ROLE-3'); const renameGrants=JSON.stringify(await publicMatrix());
  await nr(); await navigationContract.locator('[data-catalog-edit="ROLE-3"]').click();
  check(await navigationContract.locator('#catalog-dialog [name="menu-access"],#catalog-dialog [name="overview-access"]').count()===0,'S29 Role Edit is identity-only, without duplicate editable permissions');
  await navigationContract.locator('#cat-name').fill('Equipo clínico Navegación'); await navigationContract.locator('#catalog-form button[type=submit]').click();
  check(await np().locator('option[value="ROLE-3"]').innerText()==='Equipo clínico Navegación','S29 name-only edit preserves stable role ID');
  await nt(); await targetRole().selectOption('ROLE-3');
  check(JSON.stringify(await publicMatrix())===renameGrants,'S29 name-only role save does not clear or reset saved grants');
  await np().selectOption('ROLE-3'); await ng('overview');
  check(JSON.stringify(await nblocks())==='["clinical"]','S29 rename preserves existing per-role personal visibility/order');
  await noOverviewFinance(navigationContract,'name-only renamed Doctor');
  // Missing submitted checkboxes fail closed through the public form, not closure injection.
  await chooseTarget('ROLE-3');
  await nm('clinical').evaluate(node=>node.remove()); await nc('clinical').evaluate(node=>node.remove()); await ns();
  await np().selectOption('ROLE-3'); await ng('overview');
  check(await navigationContract.locator('#navigation [data-page="clinical"],#view [data-overview-block="clinical"]').count()===0,'S29 omitted menu/content controls are false, not inherited or implicitly granted');
  await chooseTarget('ROLE-3'); await nm('clinical').check(); await nc('clinical').check(); await ns();
  // Global preferences may narrow access, never create a grant.
  await chooseTarget('ROLE-3'); await nm('inventory').check();
  await navigationContract.locator('[data-nav-id="inventory"] input').uncheck(); await ns();
  await np().selectOption('ROLE-3');
  check(await navigationContract.locator('#navigation [data-page="inventory"]').count()===0,'S29 role grant does not override globally hidden menu');
  await chooseTarget('ROLE-3'); await nm('inventory').uncheck();
  await navigationContract.locator('[data-nav-id="inventory"] input').check(); await ns();
  await np().selectOption('ROLE-3');
  check(await navigationContract.locator('#navigation [data-page="inventory"]').count()===0,'S29 global show cannot widen false role grant');
  // Atomic validation: observe every affected state family through public UI.
  await chooseTarget('ROLE-1'); await nr();
  const createNavCounter=async name=>{
    await nr(); await navigationContract.locator('#new-role').fill(name); await navigationContract.locator('#add-role').click();
    return Number((await navigationContract.locator(`[data-role="${name}"] [data-catalog-edit]`).getAttribute('data-catalog-edit')).split('-').at(-1));
  };
  const navCounterA=await createNavCounter('Navegación contador A');
  const rolesBeforeNavigationReject=await navigationContract.locator('#role-list').innerText();
  const savedBeforeNavigationReject=[];
  for(const id of ['ROLE-1','ROLE-2','ROLE-3']) savedBeforeNavigationReject.push(await savedRole(id));
  await ng('overview');
  await navigationContract.getByRole('button',{name:'Personalizar Resumen',exact:true}).click();
  await navigationContract.locator('[data-overview-preference="finance"] [name="overview-visible"]').uncheck();
  await navigationContract.locator('#overview-form button[type=submit]').click();
  await chooseTarget('ROLE-1');
  const appearanceBeforeReject=await navigationContract.evaluate(()=>[getComputedStyle(document.documentElement).getPropertyValue('--action').trim(),document.body.dataset.density]);
  const globalBeforeReject=await navigationContract.locator('#nav-settings input').evaluateAll(nodes=>nodes.map(node=>node.checked));
  const orderBeforeReject=await navigationContract.locator('#nav-settings [data-nav-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.navId));
  await navigationContract.getByRole('tab',{name:'Clínica',exact:true}).click();
  await navigationContract.locator('#setting-clinic').fill('Clínica rechazada');
  await navigationContract.locator('#setting-contact').fill('contacto-rechazado.example');
  await navigationContract.getByRole('tab',{name:'Apariencia',exact:true}).click();
  await navigationContract.locator('#setting-brand').selectOption('#0f766e'); await navigationContract.locator('#setting-density').selectOption('compact');
  await nt(); await nm('settings').uncheck(); await nc('agenda').uncheck();
  await navigationContract.locator('[data-nav-id="inventory"] input').uncheck();
  await navigationContract.locator('[data-nav-id="payments"] [data-move="up"]').click(); await ns();
  check(await navigationContract.locator('#settings-error').innerText()==='El último Administrador debe conservar Acceder a Configuración.' && !await nm('settings').isChecked(),'S29 unified save explicitly rejects last Admin, retaining invalid draft for correction');
  check(await navigationContract.locator('#clinic-name').innerText()==='Clínica Dental Andina' && await np().inputValue()==='ROLE-1','S29 rejected save leaves live clinic and active profile unchanged');
  check(JSON.stringify(await navigationContract.evaluate(()=>[getComputedStyle(document.documentElement).getPropertyValue('--action').trim(),document.body.dataset.density]))===JSON.stringify(appearanceBeforeReject),'S29 rejected save applies no appearance changes');
  // Re-enter discards failed drafts and reads stored settings, rather than trusting draft inputs.
  await ng('overview'); check(JSON.stringify(await nblocks())==='["agenda","clinical"]','S29 rejection preserves personal hidden finance preference');
  await ng('settings');
  check(await navigationContract.locator('#setting-clinic').inputValue()==='Clínica Dental Andina' && await navigationContract.locator('#setting-contact').inputValue()==='recepcion@andina.example (ficticio)','S29 rejected save preserves stored clinic/contact');
  await nr(); check(await navigationContract.locator('#role-list').innerText()===rolesBeforeNavigationReject,'S29 rejected save preserves role records and identities');
  for(const [i,id] of ['ROLE-1','ROLE-2','ROLE-3'].entries()) check(await savedRole(id)===savedBeforeNavigationReject[i],`S29 rejected save preserves complete ${id} grants`);
  await nt();
  check(JSON.stringify(await navigationContract.locator('#nav-settings input').evaluateAll(nodes=>nodes.map(node=>node.checked)))===JSON.stringify(globalBeforeReject) && JSON.stringify(await navigationContract.locator('#nav-settings [data-nav-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.navId)))===JSON.stringify(orderBeforeReject),'S29 rejected save preserves global visibility and ordering');
  check(await createNavCounter('Navegación contador B')===navCounterA+1,'S29 invalid unified save allocates no public IDs');
  await ng('overview'); await navigationContract.getByRole('button',{name:'Personalizar Resumen',exact:true}).click();
  await navigationContract.locator('#overview-reset').click(); await navigationContract.locator('#overview-form button[type=submit]').click();
  check((await navigationContract.locator('[data-kpi]').allTextContents()).join('|')===nbaseline,'S29 invalid unified save changes no money');
  // S30 multiple real adjacent pairs/screens, desktop and mobile, no page overflow.
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await navigationContract.setViewportSize(viewport);
    await navigationContract.waitForFunction(()=>document.querySelector('#menu-toggle').getAttribute('aria-expanded')===(innerWidth<=760?'false':'true'));
    for(const route of ['patients','laboratory','imaging','inventory','settings']) {
      await ng(route);
      if(route==='settings') await nr();
      const group=route==='settings'?'#role-list .role:first-child button':route==='patients'?'#patient-results tbody tr:first-child button':route==='inventory'?'#inventory-results tbody tr:first-child button':'#catalog-results tbody tr:first-child button';
      const region=navigationContract.locator(route==='settings'?'#role-list':'.table-wrap').first();
      if(route!=='settings') await region.evaluate(node=>node.scrollLeft=node.scrollWidth);
      check(separated(await actionGeometry(navigationContract,group)),`S30 ${viewport.width}px ${route}: every adjacent icon action has >=8px rendered separation and >=44px targets`);
      check(await navigationContract.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`S30 ${viewport.width}px ${route}: no page overflow`);
      if(route==='patients') {
        await navigationContract.locator('[data-master-view="DEMO-001"]').click();
        check(await navigationContract.locator('#master-detail-dialog [data-close]').innerText()==='Cerrar detalle','S30 existing text modal controls retained');
        await navigationContract.keyboard.press('Escape');
      }
    }
    const headerBoxes=await actionGeometry(navigationContract,'header button');
    check(separated(headerBoxes),`S30 ${viewport.width}px header: rendered controls separated with 44px targets`);
    check(await navigationContract.locator('header').count()===1 && await navigationContract.locator('aside').count()===1,'S29/S30 preserve single shared shell');
    // Scroll dismisses tooltips; settle it before a fresh pointer entry, including
    // after Escape or when the mouse was already over this header position.
    await navigationContract.locator('#logout').scrollIntoViewIfNeeded();
    await navigationContract.mouse.move(0,0);
    await navigationContract.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await navigationContract.locator('#logout').hover();
    check(await navigationContract.getByRole('tooltip').innerText()==='Cerrar sesión','S30 existing icon tooltip preserved');
  }
  await navigationContract.locator('#logout').click(); await navigationContract.locator('#login-screen').waitFor(); await enterDemo(navigationContract);
  check(await np().inputValue()==='ROLE-1' && (await navigationContract.locator('[data-kpi]').allTextContents()).join('|')===nbaseline,'S29 logout resets active profile, content preferences and money');
  await chooseTarget('ROLE-3');
  check(!await nc('finance').isChecked() && await nc('agenda').isChecked() && await nc('clinical').isChecked() && !await nm('inventory').isChecked(),'S29 logout resets saved Navigation role grants');
  await np().selectOption('ROLE-3'); await ng('overview'); await noOverviewFinance(navigationContract,'logout-reset Doctor');
  check(JSON.stringify(await nblocks())==='["agenda","clinical"]','S29 logout resets renamed role personal hide/order');
  console.log(`S29/S30 public HTTP Navigation and icon-spacing contract: PASS (${checks} checks so far)`);

  // S28 tests first. This initial assertion deliberately uses ONLY existing UI/DOM.
  // Parent owns browser RED/GREEN; do not bypass this boundary with state injection.
  await startup.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-3');
  await startup.locator('#navigation [data-page="overview"]').click();
  async function noOverviewFinance(target,label) {
    const markup=await target.locator('#view').innerHTML();
    const actions=await target.locator('#page-actions').innerHTML();
    check(await target.locator('#view [data-kpi],#view .chart,#view .amount,#view [data-page="payments"],#view [data-page="expenses"]').count()===0 && !/Ingresos|Egresos|Flujo neto|Por cobrar|Cobros pendientes|Ver cobros|Ver todos los cobros|\bBs\b/i.test(markup+actions), `S28 ${label}: financial KPI/chart/labels/shortcuts/attributes are absent from rendered Resumen, not CSS-hidden`);
  }
  await noOverviewFinance(startup,'Médico');

  // Proposed public contract: data-overview-block=finance|agenda|clinical;
  // role controls name=overview-access, value=the same stable key;
  // details data-overview-access=key, data-granted=true|false;
  // modal #overview-dialog/#overview-form; rows data-overview-preference=key,
  // checkbox name=overview-visible, text move buttons data-overview-move=up|down;
  // #overview-reset restores permitted default visibility/order, never grants.
  const overview=await openPage({width:1440,height:1000});
  const op=()=>overview.getByRole('combobox',{name:'Simular rol',exact:true});
  const og=async route=>{
    if(await overview.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await overview.locator('#menu-toggle').click();
    await overview.locator(`#navigation [data-page="${route}"]`).click();
  };
  const blocks=()=>overview.locator('#view [data-overview-block]').evaluateAll(nodes=>nodes.map(node=>node.dataset.overviewBlock));
  const expectBlocks=async(keys,label)=>check(JSON.stringify(await blocks())===JSON.stringify(keys),`S28 ${label}`);
  const roleEditor=async id=>{
    await op().selectOption('ROLE-1'); await og('settings');
    await overview.getByRole('tab',{name:'Navegación',exact:true}).click();
    await overview.locator('#navigation-role').selectOption(id);
  };
  const capability=key=>overview.locator(`#navigation-permissions [name="overview-access"][value="${key}"]`);
  const overviewGrant=()=>overview.locator('#navigation-permissions [name="menu-access"][value="overview"]');
  const commitRole=async()=>{
    await overview.locator('#settings-form button[type=submit]').click();
    if(!await overview.locator('#settings-error').innerText()) await overview.getByRole('tab',{name:'Roles',exact:true}).click();
  };
  const personalize=()=>overview.getByRole('button',{name:'Personalizar Resumen',exact:true}).click();
  const preference=key=>overview.locator(`#overview-dialog [data-overview-preference="${key}"]`);
  const commitPreferences=()=>overview.locator('#overview-form button[type=submit]').click();
  const baselineOverview='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00';
  await expectBlocks(['finance','agenda','clinical'],'Administrator stable default block order');
  check((await overview.locator('[data-kpi]').allTextContents()).join('|')===baselineOverview,'S28 granted Administrator preserves all four exact financial values');
  check((await overview.locator('.chart').getAttribute('aria-label')).includes('18 mayo, ingresos 700 Bs, egresos 250 Bs'),'S28 granted Administrator preserves chart ledger');
  for(const [id,grants] of [['ROLE-1',['finance','agenda','clinical']],['ROLE-2',['agenda']],['ROLE-3',['agenda','clinical']]]) {
    await roleEditor(id);
    check(await overview.locator('#navigation-permissions [name="menu-access"]').count()===17 && await overview.locator('#navigation-permissions [name="overview-access"]').count()===3,'S28 separate complete menu matrix and three content controls');
    check((await overview.locator('#navigation-permissions fieldset').last().innerText()).includes('Contenido de Resumen'),'S28 content grants have a distinct named section after menu access');
    for(const key of ['finance','agenda','clinical']) check(await capability(key).isChecked()===grants.includes(key),`S28 explicit configurable seed capability ${id}/${key}`);
    await overview.getByRole('tab',{name:'Roles',exact:true}).click();
    await overview.locator(`[data-master-view="${id}"]`).click();
    check(await overview.locator('#master-detail-content input').count()===0 && await overview.locator('#master-detail-content [data-overview-access]').count()===3,'S28 readonly details display all saved capabilities');
    for(const key of ['finance','agenda','clinical']) check(await overview.locator(`#master-detail-content [data-overview-access="${key}"]`).getAttribute('data-granted')===String(grants.includes(key)),`S28 detail reports saved grant ${id}/${key}`);
    await overview.keyboard.press('Escape');
  }
  await op().selectOption('ROLE-3'); await og('overview');
  await expectBlocks(['agenda','clinical'],'Médico gets operational panels only'); await noOverviewFinance(overview,'Médico operational panels');
  check(await overview.locator('[data-overview-block="agenda"] .appointment').count()===3 && (await overview.locator('[data-overview-block="agenda"]').innerText()).includes('Alba Ejemplo'),'S28 agenda uses existing reference-day appointments');
  for(const [status,count] of [['scheduled','3'],['in_progress','0'],['completed','0']]) check(await overview.locator(`[data-overview-status="${status}"]`).innerText()===count,`S28 reference-day operational count ${status}, confirmed appointments included as scheduled`);
  check(!/diagnóstico|mis pacientes|mi[s]? consulta[s]?|propios|\bBs\b/i.test(await overview.locator('[data-overview-block="clinical"]').innerText()),'S28 operational indicators infer neither diagnosis nor own-doctor scope');
  await personalize();
  check(JSON.stringify(await overview.locator('[data-overview-preference]').evaluateAll(nodes=>nodes.map(node=>node.dataset.overviewPreference)))===JSON.stringify(['agenda','clinical']),'S28 personalization exposes only authorized panels, cannot grant finance');
  await preference('clinical').locator('[data-overview-move="up"]').click();
  await preference('agenda').locator('[name="overview-visible"]').uncheck(); await commitPreferences();
  await expectBlocks(['clinical'],'Saved personal hide/order narrows grants');
  for(const dismissal of ['cancel','escape']) {
    await personalize(); await preference('agenda').locator('[name="overview-visible"]').check();
    await preference('agenda').locator('[data-overview-move="up"]').click();
    if(dismissal==='cancel') await overview.locator('#overview-dialog [data-close]').click(); else await overview.keyboard.press('Escape');
    await expectBlocks(['clinical'],`Personalization ${dismissal} leaves saved visibility unchanged`);
    check(await overview.getByRole('button',{name:'Personalizar Resumen',exact:true}).evaluate(node=>node===document.activeElement),`S28 ${dismissal} restores personalization trigger focus`);
    await personalize();
    check(JSON.stringify(await overview.locator('[data-overview-preference]').evaluateAll(nodes=>nodes.map(node=>[node.dataset.overviewPreference, node.querySelector('input').checked])))===JSON.stringify([['clinical',true],['agenda',false]]),`S28 ${dismissal} leaves saved order and visibility unchanged`);
    await overview.keyboard.press('Escape');
  }
  await roleEditor('ROLE-3'); await overview.getByRole('tab',{name:'Roles',exact:true}).click();
  await overview.locator('[data-catalog-edit="ROLE-3"]').click();
  await overview.locator('#cat-name').fill('Equipo renombrado'); await overview.locator('#catalog-form button[type=submit]').click();
  check(await op().locator('option[value="ROLE-3"]').innerText()==='Equipo renombrado','S28 rename retains stable role ID');
  await op().selectOption('ROLE-3'); await og('overview'); await expectBlocks(['clinical'],'Rename preserves role-ID-bound personal preferences'); await noOverviewFinance(overview,'renamed Médico');
  await op().selectOption('ROLE-2'); await expectBlocks(['agenda'],'Receptionist preferences isolated from Médico');
  await op().selectOption('ROLE-1'); await expectBlocks(['finance','agenda','clinical'],'Administrator preferences isolated from Médico');
  await roleEditor('ROLE-3'); await capability('finance').check(); await commitRole();
  await op().selectOption('ROLE-3'); await og('overview'); await personalize();
  check(await preference('finance').count()===1,'S28 explicit finance grant becomes available to personalization');
  await preference('finance').locator('[name="overview-visible"]').check(); await commitPreferences();
  check(await overview.locator('[data-kpi]').count()===4,'S28 explicit finance grant plus visibility renders finance after rename');
  await roleEditor('ROLE-3'); await capability('finance').uncheck(); await capability('clinical').uncheck(); await commitRole();
  await op().selectOption('ROLE-3'); await og('overview'); await noOverviewFinance(overview,'revoked finance despite selected preference');
  check(await overview.locator('[data-overview-block="clinical"]').count()===0,'S28 revoked clinical grant defeats previously visible preference');
  await personalize(); check(await preference('finance').count()===0 && await preference('clinical').count()===0,'S28 revoked panels cannot be resurrected by personalization');
  await overview.locator('#overview-reset').click(); await commitPreferences();
  await expectBlocks(['agenda'],'Reset restores only granted blocks');
  await roleEditor('ROLE-3'); await capability('clinical').check(); await commitRole();
  await op().selectOption('ROLE-3'); await og('overview'); await personalize();
  await overview.locator('#overview-reset').click(); await commitPreferences(); await expectBlocks(['agenda','clinical'],'Regrant then reset restores permitted stable default order only');
  await personalize();
  for(const control of await overview.locator('#overview-dialog [name="overview-visible"]').all()) await control.uncheck();
  await commitPreferences(); await expectBlocks([],'All authorized panels may be personally hidden');
  check((await overview.locator('#view').innerText()).trim().length>0,'S28 all-hidden view explains empty state');
  await personalize(); await overview.locator('#overview-reset').click(); await commitPreferences(); await expectBlocks(['agenda','clinical'],'All-hidden recovery remains accessible');
  await roleEditor('ROLE-3'); await overviewGrant().uncheck(); await commitRole();
  await op().selectOption('ROLE-3');
  check(await overview.locator('#navigation [data-page="overview"],#view [data-overview-block]').count()===0 && await overview.locator('#page-title').innerText()!=='Resumen','S28 subsection flags cannot bypass revoked Resumen menu access');
  await roleEditor('ROLE-3'); await overviewGrant().check(); await commitRole();
  await overview.locator('#new-role').fill('Resumen sin contenido'); await overview.locator('#add-role').click();
  const emptyRole=await overview.locator('[data-role="Resumen sin contenido"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  await roleEditor(emptyRole); check(await overview.locator('#navigation-permissions [name="overview-access"]:checked').count()===0,'S28 new roles default to no content capabilities');
  await overviewGrant().check(); await commitRole(); await op().selectOption(emptyRole); await og('overview');
  await expectBlocks([],'Acceder Resumen alone grants no blocks'); await noOverviewFinance(overview,'new custom role with menu only');
  check((await overview.locator('#view').innerText()).trim().length>0,'S28 zero grants gives friendly recovery explanation, not privileged fallback');
  await op().selectOption('ROLE-1'); await og('overview');
  await personalize(); await preference('finance').locator('[name="overview-visible"]').uncheck(); await commitPreferences();
  await roleEditor('ROLE-1'); await overview.getByRole('tab',{name:'Roles',exact:true}).click();
  await overview.locator('#new-role').fill('Contenido contador A'); await overview.locator('#add-role').click();
  const contentCounterA=await overview.locator('[data-role="Contenido contador A"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  for(const dismissal of ['target-switch','navigate-away']) {
    await roleEditor('ROLE-1'); await capability('agenda').uncheck();
    if(dismissal==='target-switch') await overview.locator('#navigation-role').selectOption('ROLE-2'); else await og('overview');
    await roleEditor('ROLE-1'); check(await capability('agenda').isChecked(),`S28 permission draft ${dismissal} preserves saved content grant`);
  }
  await roleEditor('ROLE-1'); const rolesBeforeInvalid=await overview.locator('#role-list').innerText();
  await capability('agenda').uncheck(); await overview.locator('#navigation-permissions [name="menu-access"][value="settings"]').uncheck(); await commitRole();
  check(await overview.locator('#settings-error').innerText()==='El último Administrador debe conservar Acceder a Configuración.' && await overview.locator('#role-list').innerText()===rolesBeforeInvalid,'S28 protected Administrator rejection is atomic for content and menu grants');
  await roleEditor('ROLE-1');
  check(await capability('agenda').isChecked(),'S28 rejected Administrator save preserved saved capability');
  await overview.getByRole('tab',{name:'Roles',exact:true}).click();
  await overview.locator('#new-role').fill('Contenido contador B'); await overview.locator('#add-role').click();
  const contentCounterB=await overview.locator('[data-role="Contenido contador B"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  check(Number(contentCounterB.split('-').at(-1))===Number(contentCounterA.split('-').at(-1))+1,'S28 canceled and rejected content saves allocate no public IDs');
  await og('overview'); await expectBlocks(['agenda','clinical'],'Rejected role save preserves personal visibility');
  await personalize(); await overview.locator('#overview-reset').click(); await commitPreferences();
  check((await overview.locator('[data-kpi]').allTextContents()).join('|')===baselineOverview,'S28 all capability and preference edits preserve financial baseline');
  await overview.setViewportSize({width:390,height:844}); await personalize();
  check(await overview.locator('#overview-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth) && await overview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'S28 mobile personalization has no internal/page horizontal overflow');
  check(await overview.locator('#overview-dialog [data-overview-move]').evaluateAll(nodes=>nodes.every(node=>node.textContent.trim() && !node.querySelector('svg') && node.scrollWidth<=node.clientWidth)),'S28 modal move controls have visible unclipped text');
  await overview.locator('#overview-form button[type=submit]').focus(); await overview.keyboard.press('Tab');
  check(await overview.evaluate(()=>!!document.activeElement.closest('#overview-dialog')),'S28 personalization Tab stays in modal'); await overview.keyboard.press('Shift+Tab');
  check(await overview.locator('#overview-form button[type=submit]').evaluate(node=>node===document.activeElement),'S28 personalization reverse wrap returns to save'); await overview.keyboard.press('Escape');
  await overview.reload(); await enterDemo(overview); await expectBlocks(['finance','agenda','clinical'],'Reload resets profile and preferences');
  await op().selectOption('ROLE-3'); await og('overview'); await personalize(); await preference('agenda').locator('[name="overview-visible"]').uncheck(); await commitPreferences();
  await overview.locator('#logout').click(); await overview.locator('#login-screen').waitFor(); await enterDemo(overview);
  check(await op().inputValue()==='ROLE-1','S28 logout resets selected simulated role'); await expectBlocks(['finance','agenda','clinical'],'Logout resets content preferences');
  await op().selectOption('ROLE-3'); await expectBlocks(['agenda','clinical'],'Logout resets renamed role, grants and personal visibility'); await noOverviewFinance(overview,'reset Médico');
  console.log(`S28 public HTTP capability/personalization contract: PASS (${checks} checks so far)`);
  const page = await openPage({width:1440,height:1000});
  const text = selector => page.locator(selector).innerText();
  const go = async id => {
    await page.locator(`#navigation [data-page="${id}"]`).click();
    check(await page.locator(`#navigation [data-page="${id}"]`).getAttribute('aria-current') === 'page', `Active navigation ${id}`);
    await noProviderUI(page);
  };
  const rows = selector => page.locator(`${selector} tbody tr`);
  const noOverflow = async target => check(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page horizontal overflow');
  const snapshotKPIs = () => page.locator('[data-kpi]').allTextContents();

  // S22–S26: public HTTP presentation/fixture contract, before any mutations.
  const gaps=[];
  async function adding(target,control,label,visible='Agregar +') {
    check(await control.innerText()===visible, `Visible Agregar +: ${label}`);
    check(await control.getAttribute('aria-label')===label, `Contextual add name: ${label}`);
    check(await control.evaluate(node=>{
      const header=node.closest('.card-heading,.page-heading');
      if(!header) return false;
      const r=node.getBoundingClientRect(), h=header.getBoundingClientRect();
      return Math.abs(r.right-h.right)<2 && r.top>=h.top && r.bottom<=h.bottom+1;
    }), `Agregar at upper right of its header: ${label}`);
  }
  for(const route of ['patients','agenda','inventory','expenses','laboratory','imaging','diseases','allergyCatalog','medications','physicians','specialties','rooms','catalogs']) {
    await page.locator(`#navigation [data-page="${route}"]`).click();
    const add=page.locator('#page-actions button,#catalog-add');
    if(await add.innerText()!=='Agregar +') gaps.push(`${route}: visible Agregar +`);
    if(await page.locator('#view tbody td').filter({hasText:/^Sin registrar$/}).count()) gaps.push(`${route}: populated default list`);
  }
  await page.locator('#navigation [data-page="patients"]').click();
  const detailGeometry=await page.locator('[data-master-view="DEMO-001"] svg').innerHTML();
  const chartGeometry=await page.locator('[data-chart="DEMO-001"] svg').innerHTML();
  if(detailGeometry===chartGeometry) gaps.push('distinct patient detail/chart SVG');
  await page.locator('#navigation [data-page="settings"]').click();
  if((await page.locator('[role=tab]').allTextContents()).join('|')!=='Clínica|Apariencia|Navegación|Roles') gaps.push('configuration text tabs');
  if(await page.locator('#settings-form button[type=submit]').innerText()!=='Guardar cambios de demo') gaps.push('configuration text save');
  await page.locator('#navigation [data-page="patients"]').click();
  await page.locator('#page-actions button').click();
  if(await page.locator('#patient-dialog [data-close]').innerText()!=='Cancelar' || !await page.locator('#patient-form button[type=submit]').innerText()) gaps.push('readable modal actions');
  await page.keyboard.press('Escape');
  check(gaps.length===0, `S22–S26 missing: ${gaps.join('; ')}`);
  for(const [route,label] of [['patients','Agregar Paciente'],['agenda','Agregar cita'],['inventory','Agregar insumo'],['expenses','Agregar egreso'],['laboratory','Agregar Laboratorio'],['imaging','Agregar Imagen'],['diseases','Agregar Enfermedades'],['allergyCatalog','Agregar Alergias'],['medications','Agregar Medicamentos'],['physicians','Agregar Médicos'],['specialties','Agregar Especialidades'],['rooms','Agregar Consultorios'],['catalogs','Agregar Procedimientos']]) {
    await go(route); await adding(page,page.locator('#page-actions button,#catalog-add'),label);
    check(await page.locator('#view tbody tr').count()>0 && !await page.locator('#view .empty').count(), `Populated default module: ${route}`);
  }
  await go('clinical'); await page.locator('#clinical-patient').selectOption('DEMO-003');
  for(const kind of ['allergies','familyHistory','personalHistory']) {
    await adding(page,page.locator(`[data-context-add="${kind}"]`),`Agregar ${kind==='allergies'?'Alergias':kind==='familyHistory'?'Antecedentes familiares':'Antecedentes personales'}`);
    check((await page.locator(`#context-${kind} .summary`).count())===1, `Fictional representative context: ${kind}`);
  }
  await page.locator('#clinical-patient').selectOption('DEMO-001');
  check(await page.locator('#context-allergies').innerText()==='Sin registrar', 'Seed context never applies to another patient');
  await go('settings'); await page.getByRole('tab',{name:'Roles',exact:true}).click();
  await adding(page,page.locator('#add-role'),'Agregar rol local');
  check(await page.locator('.role').count()===3, 'Existing fictional role identities preserved with Acceder');
  await go('physicians'); await page.locator('#catalog-add').click();
  await adding(page,page.locator('#add-slot'),'Agregar horario','Agregar horario +');
  await page.keyboard.press('Escape');
  await go('overview');

  // S14–S16/S18 presentation checks precede business mutations.
  const presentationFailures=[];
  if(await text('#page-title')!=='Resumen' || await text('#breadcrumb')!=='Clínica / Resumen' || await page.locator('#navigation button').first().innerText()!=='Resumen') presentationFailures.push('Resumen entry/title/breadcrumb');
  // Distinct geometry is not enough: each reviewed motif must match its menu.
  const navMotifs={expenses:'M4 4h12v16',overview:'M3 13h7',payments:'M3 5h18',patients:'M16 21v-2',agenda:'M4 5h16',clinical:'M9 3h6',physicians:'M5 3v5',specialties:'M12 3l3 5',rooms:'M4 21h16',laboratory:'M9 3h6M10',imaging:'M3 4h18',diseases:'M12 7a5',allergyCatalog:'M12 3C9',medications:'M8 3a5',catalogs:'M4 3h16',inventory:'M3 7l9',settings:'M12 8a4'};
  for(const [route,motif] of Object.entries(navMotifs)) {
    if(!(await page.locator(`#navigation [data-page="${route}"] svg path`).getAttribute('d')).startsWith(motif)) presentationFailures.push(`Semantic motif ${route}`);
  }
  const navGeometry=await page.locator('#navigation button svg').evaluateAll(nodes=>nodes.map(svg=>svg.innerHTML));
  if(navGeometry.length!==17 || new Set(navGeometry).size!==17) presentationFailures.push('17 distinct semantic navigation geometries');
  async function iconButtons(target) {
    const invalid=await target.locator('button:visible').evaluateAll(nodes=>nodes.filter(button=>{
      const textException=button.closest('dialog,.settings-save') || button.hasAttribute('data-tab') || button.matches('#catalog-add,#add-role,#add-slot,#request-study,#add-diagnosis,#add-prescription,#save-consultation,#complete-consultation,[data-context-add]') || (button.closest('#page-actions') && button.textContent==='Agregar +');
      if(textException) return !button.textContent.trim() || button.querySelector('svg') || button.classList.contains('icon-action') || !button.getAttribute('aria-label');
      return !button.querySelector('svg path') || (!button.closest('#navigation') && (button.textContent.trim() || !button.getAttribute('aria-label')));
    }).map(button=>button.id || button.outerHTML));
    check(invalid.length===0, `Contextual text exceptions; other named SVG-only actions: ${invalid.join(', ')}`);
    const unreadable=await target.locator('dialog[open] button,[data-tab],.settings-save button').evaluateAll(nodes=>nodes.filter(button=>button.textContent.trim().replace(/ \+$/,'')!==button.getAttribute('aria-label')).map(button=>button.outerHTML));
    check(unreadable.length===0, `Modal/configuration visible text matches accessible labels: ${unreadable.join(', ')}`);
  }
  async function tooltip(target,control,label) {
    // Settle table/window scrolling before fresh pointer entry: scroll dismisses tips.
    await control.scrollIntoViewIfNeeded();
    await target.mouse.move(0,0);
    await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await control.hover();
    check(await target.getByRole('tooltip').innerText()===label, 'Hover tooltip explains action');
    check(await target.getByRole('tooltip').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}), 'Tooltip stays inside viewport without table clipping');
    await target.mouse.move(0,0);
    // Focusing an already-focused control emits no focusin. Leave it by keyboard,
    // then settle any resulting scroll before testing a genuine focus entry.
    if(await control.evaluate(node=>node===document.activeElement)) await target.keyboard.press('Tab');
    await control.scrollIntoViewIfNeeded();
    await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await control.focus();
    check(await target.getByRole('tooltip').innerText()===label, 'Keyboard focus tooltip explains action');
    await target.keyboard.press('Escape');
    check(!await target.getByRole('tooltip').isVisible(), 'Escape dismisses tooltip');
  }
  for(const [route,entity] of [['laboratory','Laboratorio'],['imaging','Imagen']]) {
    await go(route);
    if(await page.locator('#catalog-add').getAttribute('aria-label')!==`Agregar ${entity}` || /tipo[s]? de estudio/i.test(await text('#view'))) presentationFailures.push(`${entity} entity-specific create and heading`);
  }
  const initialAction=page.locator('#catalog-add');
  if(!await initialAction.getAttribute('aria-label') || await initialAction.innerText()!=='Agregar +') presentationFailures.push('icon-only named actions');
  check(presentationFailures.length===0, `T2 presentation: ${presentationFailures.join('; ')}`);
  await iconButtons(page);
  await tooltip(page,initialAction,'Agregar Imagen');
  await initialAction.click();
  check(await text('#catalog-title')==='Crear · Imagen', 'Imagen create dialog names entity');
  await iconButtons(page);
  await tooltip(page,page.locator('#catalog-form [data-close]'),'Cancelar');
  check(await initialAction.evaluate(node=>node===document.activeElement), 'Dialog tooltip Escape closes dialog and restores focus');
  await go('overview');

  // S12 RED boundary: direct modality catalogs have no intermediate resource tabs.
  for(const route of ['laboratory','imaging']) {
    await go(route);
    check(await page.locator('#catalog-add').count()===1 && await page.locator('#view [role="tab"]').count()===0 && !/proveedor|provider/i.test(await text('#view')), `S12 ${route} is direct study CRUD without providers`);
    await page.locator('#catalog-add').click();
    check(await page.locator('#catalog-fields input').count()===2 && await page.locator('#cat-description').count()===1 && await page.locator('#catalog-fields select,#cat-price').count()===0, 'Study form has only name/description with implicit menu modality');
    await page.keyboard.press('Escape');
  }
  check(!/provider|proveedor/i.test(source), 'Provider layer entirely absent from artboard source, including state, defaults and request coupling');
  // T7 focused behavior contracts. Parent runs RED/GREEN; never inspect closure
  // state or synthesize prescriptions/diagnoses (their authoring belongs to T8).
  const t7=await openPage({width:1440,height:1000});
  const t7Go=route=>t7.locator(`#navigation [data-page="${route}"]`).click();
  const t7Text=selector=>t7.locator(selector).innerText();
  const t7Save=()=>t7.locator('#catalog-form button[type=submit]').click();
  const t7Baseline='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00';
  const t7Money=async()=>{await t7Go('overview');return (await t7.locator('[data-kpi]').allTextContents()).join('|');};
  async function t7Headers(route,expected) {
    await t7Go(route);
    const actual=await t7.locator('#view thead th').allTextContents();
    check(actual.length===expected.length+1 && actual.slice(0,-1).join('|')===expected.join('|') && /^Acci[oó]n(?:es)?$/.test(actual.at(-1)),`T7 ${route}: one column per real field, plus actions`);
    check(!actual.includes('Configuración'),`T7 ${route}: no generic configuration column`);
  }
  for(const [route,headers] of [
    ['specialties',['Nombre']],['rooms',['Nombre','Ubicación','Estado']],
    ['physicians',['Nombre','Documento','Especialidades','Horarios']],
    ['catalogs',['Nombre','Precio']],['diseases',['Nombre','Descripción']],
    ['allergyCatalog',['Nombre','Descripción']],['medications',['Nombre','Descripción']],
    ['laboratory',['Nombre','Descripción']],['imaging',['Nombre','Descripción']]
  ]) await t7Headers(route,headers);
  await t7Go('rooms');
  const seededRoom=t7.locator('#catalog-results tr').filter({hasText:'Consultorio 1'});
  check((await seededRoom.locator('td').allTextContents()).slice(0,3).join('|')==='Consultorio 1|Sin ubicación|Activo','T7 room location/status occupy their own cells');
  await t7Go('specialties'); await t7.locator('[data-master-view]').first().click();
  check(!(await t7Text('#master-detail-content')).includes('Especialidad de demo'),'T7 specialty detail has no fabricated configuration');
  await t7.keyboard.press('Escape');
  await t7Go('catalogs');
  check(/servicios/i.test(await t7Text('#view')+' '+await t7Text('#page-subtitle')) && /Atención clínica/i.test(await t7Text('#view')+' '+await t7Text('#page-subtitle')) && /Cobros/.test(await t7Text('#view')+' '+await t7Text('#page-subtitle')),'S36 Aranceles explains explicit priced services: Atención clínica → orden → Cobros');

  // Removal/addition must reach role grants, not just the sidebar.
  check(await t7.locator('#navigation button').count()===17 && await t7.locator('#navigation [data-page="triage"]').count()===0,'S38 replace Triage, preserving the other sixteen menus');
  const medicineSVG=await t7.locator('#navigation [data-page="medications"] svg').innerHTML();
  const allMenuSVG=await t7.locator('#navigation button svg').evaluateAll(nodes=>nodes.map(node=>node.innerHTML));
  check(new Set(allMenuSVG).size===17 && allMenuSVG.filter(svg=>svg===medicineSVG).length===1,'S39 Medicamentos owns a unique SVG, not the inventory icon');
  await t7Go('settings'); await t7.getByRole('tab',{name:'Navegación',exact:true}).click();
  check(await t7.locator('[data-nav-id="triage"],[name="menu-access"][value="triage"]').count()===0 && await t7.locator('[data-nav-id="medications"],[name="menu-access"][value="medications"]').count()===2,'S38/S39 global Navigation and Acceder replace the obsolete key');
  for(const [role,granted] of [['ROLE-1',true],['ROLE-2',false],['ROLE-3',false]]) {
    await t7.locator('#navigation-role').selectOption(role);
    check(await t7.locator('[name="menu-access"]').count()===17 && await t7.locator('[name="menu-access"][value="medications"]').isChecked()===granted,`S39 ${role}: explicit medicine grant, prior role defaults preserved`);
  }
  await t7.locator('[name="menu-access"][value="medications"]').check();
  await t7.locator('#settings-form button[type=submit]').click();
  await t7.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-3');
  check(await t7.locator('#navigation [data-page="medications"]').count()===1 && await t7.locator('#navigation [data-page="settings"],[data-kpi]').count()===0,'S39 Navigation medicine grant applies only to target role, not Configuration/finance');
  await t7.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-1');
  await t7Go('settings'); await t7.getByRole('tab',{name:'Roles',exact:true}).click();
  await t7.locator('[data-master-view="ROLE-1"]').click();
  check(await t7.locator('#master-detail-content [data-menu-access="triage"]').count()===0 && await t7.locator('#master-detail-content [data-menu-access="medications"]').count()===1,'S38 role details contain no obsolete Triage grant');
  await t7.keyboard.press('Escape');

  // Shared descriptive CRUD: full literal-text/read/edit/confirmed-delete coverage,
  // submit-time bounds, atomic errors, and public consecutive-ID proof.
  await t7Go('inventory'); const stockBeforeT7=await t7Text('#inventory-results');
  for(const route of ['medications','laboratory','imaging']) {
    await t7Go(route);
    check(await t7.locator('#catalog-results [data-catalog-edit]').count()>0 && /fictici|muestra|demo/i.test(await t7Text('#catalog-results')),`T7 ${route}: fictional initial example`);
    const initial=await t7Text('#catalog-results');
    const name=`${route} <img onerror=throw(1)>`;
    const description='Descripción <script>throw(1)</script>';
    const create=async(n,d)=>{
      await t7.locator('#catalog-add').click();
      check(await t7.locator('#catalog-fields input,#catalog-fields textarea').count()===2 && await t7.locator('#catalog-fields select,#cat-price').count()===0,`T7 ${route}: name/description only, implicit modality`);
      await t7.locator('#cat-name').fill(n); await t7.locator('#cat-description').fill(d); await t7Save();
    };
    await create(name,description);
    const row=t7.locator('#catalog-results tbody tr').filter({hasText:name});
    const id=await row.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
    check((await row.locator('td').allTextContents()).slice(0,2).join('|')===`${name}|${description}` && await row.locator('img,script').count()===0,`T7 ${route}: literal text in separate cells`);
    await row.locator('[data-master-view]').click();
    check((await t7Text('#master-detail-content')).includes(name) && (await t7Text('#master-detail-content')).includes(description) && !/precio|\bBs\b|arancel/i.test(await t7Text('#master-detail-content')) && await t7.locator('#master-detail-content img,#master-detail-content script').count()===0,`T7 ${route}: real descriptive detail, no price/mapping`);
    await t7.keyboard.press('Escape');
    check(await row.locator('[data-master-view]').evaluate(node=>node===document.activeElement),`T7 ${route}: detail restores focus`);
    const saved=await t7Text('#catalog-results');
    for(const [n,d] of [['','Descripción'],[` ${name.toUpperCase()} `,'Duplicado'],['x'.repeat(121),'Descripción'],['Nombre válido','y'.repeat(121)]]) {
      await t7.locator('#catalog-add').click();
      await t7.locator('#cat-name,#cat-description').evaluateAll(nodes=>nodes.forEach(node=>node.removeAttribute('maxlength')));
      await t7.locator('#cat-name').fill(n); await t7.locator('#cat-description').fill(d); await t7Save();
      check(await t7.locator('#catalog-dialog').isVisible() && (await t7Text('#catalog-error')).length>0 && await t7Text('#catalog-results')===saved,`T7 ${route}: invalid/duplicate/bounded create is atomic`);
      await t7.keyboard.press('Escape');
    }
    for(const dismiss of ['cancel','escape']) {
      await row.locator('[data-catalog-edit]').click(); await t7.locator('#cat-description').fill('Descartar');
      if(dismiss==='cancel') await t7.locator('#catalog-dialog [data-close]').click(); else await t7.keyboard.press('Escape');
      check(await t7Text('#catalog-results')===saved,`T7 ${route}: edit ${dismiss} discards draft`);
    }
    await row.locator('[data-catalog-edit]').click();
    check(await t7.locator('#cat-name').getAttribute('maxlength')==='120' && await t7.locator('#cat-description').getAttribute('maxlength')==='120',`T7 ${route}: visible 120-character bounds`);
    await t7.locator('#cat-description').evaluate(node=>node.removeAttribute('maxlength')); await t7.locator('#cat-description').fill('x'.repeat(121)); await t7Save();
    check(await t7.locator('#catalog-dialog').isVisible() && await t7Text('#catalog-results')===saved,`T7 ${route}: invalid edit preserves entire saved list`);
    await t7.locator('#cat-description').fill('y'.repeat(120)); await t7Save();
    check(await row.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===id && (await row.innerText()).includes('y'.repeat(120)),`T7 ${route}: accepted boundary edit preserves ID`);
    await create('x'.repeat(120),'');
    const boundaryRow=t7.locator('#catalog-results tbody tr').filter({hasText:'x'.repeat(120)});
    const next=await boundaryRow.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
    check(Number(next.split('-').at(-1))===Number(id.split('-').at(-1))+1,`T7 ${route}: rejected/canceled saves consume no IDs; name boundary and optional description accepted`);
    await boundaryRow.locator('[data-master-delete]').click(); await t7.locator('#master-delete-confirm').click();
    for(const dismiss of ['cancel','escape']) {
      const before=await t7Text('#catalog-results'); await row.locator('[data-master-delete]').click();
      if(dismiss==='cancel') await t7.locator('#master-delete-dialog [data-close]').click(); else await t7.keyboard.press('Escape');
      check(await t7Text('#catalog-results')===before && await row.locator('[data-master-delete]').evaluate(node=>node===document.activeElement),`T7 ${route}: delete ${dismiss} preserves data/focus`);
    }
    await row.locator('[data-master-delete]').click(); await t7.locator('#master-delete-confirm').click();
    check(await t7Text('#catalog-results')===initial,`T7 ${route}: confirmed free deletion restores initial list`);
  }
  await t7Go('inventory'); check(await t7Text('#inventory-results')===stockBeforeT7,'S39 medicine CRUD never reuses or mutates inventory');
  check(await t7Money()===t7Baseline,'T7 descriptive CRUD/failed saves/grants preserve financial baseline');

  // Existing patient: editable document cannot change immutable link identity or
  // relink seeded appointments/order/history. Public DOM is the ID authority.
  await t7Go('patients');
  const albaRow=t7.locator('#patient-results tbody tr').filter({hasText:'Alba Ejemplo'});
  const albaId=await albaRow.locator('[data-chart]').getAttribute('data-chart');
  await albaRow.locator('[data-chart]').click(); await t7.locator('[data-habits-edit]').click();
  await t7.locator('#habits-text').fill('Historia ligada al ID interno'); await t7.locator('#habits-form button[type=submit]').click();
  await t7Go('agenda'); const albaAgenda=await t7Text('#agenda-results');
  await t7Go('payments'); const albaOrders=await t7Text('#order-results');
  await t7Go('patients'); const patientBeforeT7=await t7Text('#patient-results');
  await t7.locator(`[data-catalog-edit="${albaId}"]`).click();
  check(await t7.locator('#cat-document').inputValue()==='900001' && await t7.locator('#cat-document').isEditable() && (await t7Text('#catalog-fields')).includes('ID interno'), 'S32 document edit is separate from visibly immutable internal ID');
  await t7.locator('#cat-name').fill('Cambio rechazado'); await t7.locator('#cat-document').fill(' 900002 '); await t7Save();
  check(await t7.locator('#catalog-dialog').isVisible() && /ya existe/.test(await t7Text('#catalog-error')) && await t7Text('#patient-results')===patientBeforeT7,'S32 duplicate document edit rejects atomically, including name');
  await t7.locator('#cat-name').fill('Alba Ejemplo'); await t7.locator('#cat-document').fill('ALBA-EDITADO'); await t7.locator('#cat-note').fill('Notas editables'); await t7Save();
  const editedAlba=t7.locator('#patient-results tbody tr').filter({hasText:'ALBA-EDITADO'});
  check(await editedAlba.locator('[data-chart]').getAttribute('data-chart')===albaId && (await editedAlba.locator('td').allTextContents()).slice(0,3).join('|')==='Alba Ejemplo|ALBA-EDITADO|Notas editables','S32 identity document/Notas save without changing internal link ID');
  await t7.locator('#patient-search').fill('ALBA-EDITADO'); check(await t7.locator('#patient-results [data-chart]').count()===1,'S32 search uses current document');
  await editedAlba.locator('[data-chart]').click();
  check(await t7.locator('#clinical-patient').inputValue()===albaId && await t7Text('[data-habits-summary]')==='Historia ligada al ID interno','S32 document edit preserves patient context/clinical selection');
  await t7Go('agenda'); check(await t7Text('#agenda-results')===albaAgenda,'S32 document edit preserves linked appointments');
  await t7Go('payments'); check(await t7Text('#order-results')===albaOrders,'S32 document edit preserves linked orders');
  await t7Go('patients');
  const createT7Patient=async(name,document,note='')=>{
    await t7.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
    await t7.locator('#patient-name,#patient-document,#patient-note').evaluateAll(nodes=>nodes.forEach(node=>node.removeAttribute('maxlength')));
    await t7.locator('#patient-name').fill(name); await t7.locator('#patient-document').fill(document); await t7.locator('#patient-note').fill(note); await t7.locator('#patient-form button[type=submit]').click();
  };
  await createT7Patient('Contador paciente A','T7-PAC-A');
  const newPatientId=await t7.locator('#patient-results tr').filter({hasText:'T7-PAC-A'}).locator('[data-chart]').getAttribute('data-chart');
  check(newPatientId!=='T7-PAC-A','S32 new ID is allocated internally, never the submitted document');
  const directoryT7=await t7Text('#patient-results');
  for(const [name,document,note] of [['X','T7-INVALID'],['N'.repeat(81),'T7-LONG-NAME'],['Nombre válido','?'],['Nombre válido','AB'],['Nombre válido','D'.repeat(31)],['Nombre válido',' t7-pac-a '],['Nombre válido','T7-NOTES','n'.repeat(121)]]) {
    await createT7Patient(name,document,note);
    check(await t7.locator('#patient-dialog').isVisible() && (await t7Text('#patient-error')).length>0 && await t7Text('#patient-results')===directoryT7,'S32 invalid create preserves all displayed patient records/count');
    await t7.keyboard.press('Escape');
  }
  await createT7Patient('Contador paciente B','T7-PAC-B');
  const nextPatientId=await t7.locator('#patient-results tr').filter({hasText:'T7-PAC-B'}).locator('[data-chart]').getAttribute('data-chart');
  check(Number(nextPatientId.split('-').at(-1))===Number(newPatientId.split('-').at(-1))+1,'S32 invalid patient fields/duplicate documents consume no IDs');
  for(const document of ['ABC','D'.repeat(30)]) {
    await createT7Patient('Nombre compartido',` ${document} `,'n'.repeat(120));
    const boundaryPatient=t7.locator('#patient-results tr').filter({hasText:document});
    check(!await t7.locator('#patient-dialog').isVisible() && (await boundaryPatient.locator('td').allTextContents()).slice(0,3).join('|')===`Nombre compartido|${document}|${'n'.repeat(120)}`,'S32 document 3/30 and notes 120 boundaries trim and persist; patient names may repeat');
  }
  check(await t7Money()===t7Baseline,'S32 patient edits/validation change no financial totals');
  // Full QR settlement is distinct from the legacy mixed QR/cash journey.
  await t7Go('payments');
  const fullQrRow=t7.locator('#order-results tr').filter({hasText:'ORD-101'});
  await fullQrRow.locator('[data-qr]').click(); await t7.locator('#qr-amount').fill('600');
  await t7.locator('#qr-form button[type=submit]').click(); await t7.locator('#confirm-qr').click();
  check((await t7Text('#qr-state')).includes('CONFIRMADO') && (await fullQrRow.innerText()).includes('Pagado'),'S31 full QR confirmation settles exactly the remaining balance');
  const qrPaidSnapshot=await fullQrRow.innerText();
  await t7.locator('#confirm-qr').click(); await t7.locator('#confirm-qr').focus(); await t7.keyboard.press('Enter');
  check(await fullQrRow.innerText()===qrPaidSnapshot && await fullQrRow.locator('[data-receipt]').count()===1,'S31 full QR repeated click/Enter never duplicates payment/receipt');
  await t7.keyboard.press('Escape');
  check(await fullQrRow.locator('[data-pay],[data-qr]').count()===0 && !(await fullQrRow.innerText()).includes('Sin saldo pendiente') && await fullQrRow.locator('[data-order-detail]').count()===1,'S31 full QR-paid list retains detail but no payment launcher/filler');
  await fullQrRow.locator('[data-receipt]').click();
  check((await t7Text('#receipt-content')).includes('QR') && (await t7Text('#receipt-content')).includes('Bs 600,00') && (await t7Text('#receipt-content')).includes('Bs 0,00'),'S31 full QR receipt still opens with exact amount and zero remaining');
  await t7.keyboard.press('Escape'); await fullQrRow.locator('[data-order-detail]').click();
  check((await t7Text('#order-detail-lines')).includes('ORD-101'),'S31 full QR-paid detail remains accessible'); await t7.keyboard.press('Escape');
  check(await t7Money()==='Bs 1.300,00|Bs 250,00|Bs 1.050,00|Bs 800,00','S31 repeated full QR confirmation changes financial totals only once');
  // T8 will expose disease/medicine selection. Until then optional-array deletion
  // guards are an implementation source-review obligation, not fake UI injection.
  console.log(`T7 focused descriptive CRUD/patient/Navigation contract: PASS (${checks} checks so far)`);

  // T8 public selectors: inline #diagnosis-disease/#diagnosis-notes/#add-diagnosis,
  // #prescription-medication/#prescription-instructions/#add-prescription;
  // lists #consultation-diagnoses/#consultation-prescriptions have rows keyed by
  // data-diagnosis-row=diseaseId / data-prescription-row=medicationId, with
  // [data-entry-name] and [data-entry-text] snapshots. Row edit/remove controls:
  // data-diagnosis-edit/remove, data-prescription-edit/remove. Edit uses shared
  // #clinical-entry-dialog/#clinical-entry-form, #clinical-entry-select/text,
  // #clinical-entry-error and native Cancel/Escape. Notes retain the legacy
  // #consultation-diagnosis ID; #consultation-recommendations is independent.
  const clinical=await openPage({width:1440,height:1000});
  const cg=async route=>{
    if(await clinical.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await clinical.locator('#menu-toggle').click();
    await clinical.locator(`#navigation [data-page="${route}"]`).click();
  };
  const ct=selector=>clinical.locator(selector).innerText();
  const resumeClinical=async()=>{await cg('agenda');await clinical.locator('[data-attend="AP-1"]').click();};
  const diagnosisRow=id=>clinical.locator(`[data-diagnosis-row="${id}"]`);
  const prescriptionRow=id=>clinical.locator(`[data-prescription-row="${id}"]`);
  const clinicalFields=['reason','anamnesis','exploration','diagnosis','recommendations'];
  const fieldValues=()=>clinical.locator(clinicalFields.map(key=>`#consultation-${key}`).join(',')).evaluateAll(nodes=>nodes.map(node=>[node.id,node.value]));
  const entryValues=()=>clinical.locator('[data-diagnosis-row],[data-prescription-row]').evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('data-diagnosis-row'),node.getAttribute('data-prescription-row'),node.querySelector('[data-entry-name]').textContent,node.querySelector('[data-entry-text]').textContent]));
  const clinicalSnapshot=async()=>JSON.stringify({fields:await fieldValues(),entries:await entryValues(),id:await clinical.locator('#consultation-record').getAttribute('data-consultation-id'),status:await ct('#consultation-status')});
  const saveClinical=()=>clinical.locator('#save-consultation').click();
  const editEntry=async(kind,id)=>{
    await clinical.locator(`[data-${kind}-row="${id}"] [data-${kind}-edit]`).click();
  };
  const commitEntry=()=>clinical.locator('#clinical-entry-form button[type=submit]').click();
  const noClinicalMoney=async()=>{
    await cg('overview'); const money=(await clinical.locator('[data-kpi]').allTextContents()).join('|');
    await cg('payments'); const orders=await ct('#order-results');
    return JSON.stringify({money,orders});
  };
  // Create catalog terms only via their existing public CRUD. IDs are discovered.
  const terms={};
  for(const [route,name] of [['diseases','Enfermedad T8 <demo>'],['medications','Medicamento T8 <demo>']]) {
    await cg(route); await clinical.locator('#catalog-add').click();
    await clinical.locator('#cat-name').fill(name); await clinical.locator('#cat-description').fill('Referencia ficticia, sin recomendaciones automáticas');
    await clinical.locator('#catalog-form button[type=submit]').click();
    terms[route]=await clinical.locator('#catalog-results tr').filter({hasText:name}).locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
  }
  await resumeClinical();
  const clinicalId=await clinical.locator('#consultation-record').getAttribute('data-consultation-id');
  check((await fieldValues()).length===5 && (await fieldValues()).every(([,value])=>value===''),'S37 new consultation has five blank human text fields; no clinical defaults');
  check(await clinical.locator('#diagnosis-disease').inputValue()==='' && await clinical.locator('#prescription-medication').inputValue()==='' && await clinical.locator('#diagnosis-notes').inputValue()==='' && await clinical.locator('#prescription-instructions').inputValue()==='' && (await entryValues()).length===0,'S37 disease/medicine placeholders and blank notes/instructions; no inferred entries');
  check(await clinical.locator('#diagnosis-disease option[value=""]').count()===1 && await clinical.locator('#prescription-medication option[value=""]').count()===1,'S37 both reference selects have an explicit blank placeholder');
  await adding(clinical,clinical.locator('#add-diagnosis'),'Agregar diagnóstico');
  await adding(clinical,clinical.locator('#add-prescription'),'Agregar medicamento recetado');
  await iconButtons(clinical);
  const initialClinical=await clinicalSnapshot();
  const clinicalMoney=await noClinicalMoney(); await resumeClinical();
  const draftText={reason:'Motivo T8',anamnesis:'Anamnesis T8',exploration:'Exploración T8',diagnosis:'Nota clínica <img onerror=throw(1)>',recommendations:'Recomendación escrita <b>literal</b>'};
  async function fillClinical(values=draftText) {
    for(const [key,value] of Object.entries(values)) await clinical.locator(`#consultation-${key}`).fill(value);
  }
  await fillClinical();
  const draftFields=JSON.stringify(await fieldValues());
  await addDiagnosis(clinical,'FIX-DIS','Nota diagnóstica humana');
  await addPrescription(clinical,'FIX-MED','Indicación humana, sin dosis generada');
  check(JSON.stringify(await fieldValues())===draftFields && (await entryValues()).length===2,'S37 adding entries preserves every other form field');
  await resumeClinical();
  check(await clinicalSnapshot()===initialClinical,'S37 adding rows/text never autosaves: navigating away discards the entire unsaved draft');
  // Public consecutive-ID proof surrounds all rejected/draft/save operations.
  const clinicalCounter=async name=>{
    await cg('specialties'); await clinical.locator('#catalog-add').click(); await clinical.locator('#cat-name').fill(name); await clinical.locator('#catalog-form button[type=submit]').click();
    return Number((await clinical.locator('#catalog-results tr').filter({hasText:name}).locator('[data-catalog-edit]').getAttribute('data-catalog-edit')).split('-').at(-1));
  };
  const clinicalCounterA=await clinicalCounter('Contador clínico A'); await resumeClinical();
  await fillClinical(); await clinical.locator('input[name=procedure]').first().check();
  await clinical.locator('#complete-consultation').click();
  check(await ct('#consultation-status')==='EN_CURSO' && (await ct('#consultation-error')).length>0 && !await clinical.locator('#consultation-order').count(),'S37 free-text diagnosis alone cannot complete even with documentation and a positive service');
  await resumeClinical(); check(await clinicalSnapshot()===initialClinical,'S37 rejected completion saves no partial documentation or entries');
  await fillClinical();
  for(const kind of ['diagnosis','prescription']) {
    const selector=kind==='diagnosis'?'#diagnosis-disease':'#prescription-medication';
    const input=kind==='diagnosis'?'#diagnosis-notes':'#prescription-instructions';
    const error=kind==='diagnosis'?'#diagnoses-error':'#prescriptions-error';
    for(const value of ['',`UNKNOWN-${kind}`]) {
      if(value) await clinical.locator(selector).evaluate((node,value)=>node.add(new Option('Referencia inexistente',value)),value);
      await clinical.locator(selector).selectOption(value); await clinical.locator(input).fill('Texto explícito');
      const before=JSON.stringify(await entryValues()); await clinical.locator(`#add-${kind}`).click();
      check((await ct(error)).length>0 && JSON.stringify(await entryValues())===before && JSON.stringify(await fieldValues())===draftFields,`S37 ${kind} missing/unknown selection rejects without draft/field mutation`);
    }
    await clinical.locator(selector).selectOption(kind==='diagnosis'?'FIX-DIS':'FIX-MED');
    await clinical.locator(input).evaluate(node=>node.removeAttribute('maxlength')); await clinical.locator(input).fill('x'.repeat(2001));
    await clinical.locator(`#add-${kind}`).click();
    check((await ct(error)).length>0 && (await entryValues()).length===0,`S37 ${kind} rejects 2001-character text without adding a row`);
  }
  await addPrescription(clinical,'FIX-MED','   ');
  check((await ct('#prescriptions-error')).length>0 && await prescriptionRow('FIX-MED').count()===0,'S37 manual medication instructions are required, not automatically supplied');
  await resumeClinical(); check(await clinicalSnapshot()===initialClinical,'S37 rejected selections/text/instructions and rejected completion never mutate the stored record'); await fillClinical();
  await addDiagnosis(clinical,'FIX-DIS','');
  await addDiagnosis(clinical,terms.diseases,'d'.repeat(2000));
  await addPrescription(clinical,'FIX-MED','i'.repeat(2000));
  await addPrescription(clinical,terms.medications,'Indicación <script>throw(1)</script>');
  check((await entryValues()).length===4 && await diagnosisRow('FIX-DIS').locator('[data-entry-text]').innerText()==='' && (await diagnosisRow(terms.diseases).locator('[data-entry-text]').innerText()).length===2000 && (await prescriptionRow('FIX-MED').locator('[data-entry-text]').innerText()).length===2000,'S37 multiple diagnoses/prescriptions accept optional diagnosis notes and exact 2000-character boundaries');
  check(JSON.stringify(await fieldValues())===draftFields && await clinical.locator('#consultation-diagnoses img,#consultation-diagnoses script,#consultation-prescriptions img,#consultation-prescriptions script').count()===0,'S37 entry operations preserve text fields and render supplied text literally');
  const fourEntries=JSON.stringify(await entryValues());
  await addDiagnosis(clinical,'FIX-DIS','Duplicado'); await addPrescription(clinical,'FIX-MED','Duplicado');
  check(JSON.stringify(await entryValues())===fourEntries && (await ct('#diagnoses-error')).length>0 && (await ct('#prescriptions-error')).length>0,'S37 duplicate disease/medication IDs reject without replacing original notes/instructions');
  for(const [kind,id,duplicate] of [['diagnosis',terms.diseases,'FIX-DIS'],['prescription',terms.medications,'FIX-MED']]) {
    const beforeKindEdit=JSON.stringify(await entryValues());
    for(const dismiss of ['cancel','escape']) {
      const before=await clinicalSnapshot(); await editEntry(kind,id);
      await clinical.locator('#clinical-entry-text').fill('Edición descartada');
      if(dismiss==='cancel') await clinical.locator('#clinical-entry-dialog [data-close]').click(); else await clinical.keyboard.press('Escape');
      check(await clinicalSnapshot()===before && await clinical.locator(`[data-${kind}-row="${id}"] [data-${kind}-edit]`).evaluate(node=>node===document.activeElement),`S37 ${kind} edit ${dismiss} preserves complete draft and focus`);
    }
    await editEntry(kind,id); await clinical.locator('#clinical-entry-select').selectOption(duplicate); await commitEntry();
    check(await clinical.locator('#clinical-entry-dialog').isVisible() && (await ct('#clinical-entry-error')).length>0 && JSON.stringify(await entryValues())===beforeKindEdit,`S37 ${kind} edit cannot duplicate another reference ID`);
    await clinical.keyboard.press('Escape');
    await editEntry(kind,id); await clinical.locator('#clinical-entry-text').evaluate(node=>node.removeAttribute('maxlength')); await clinical.locator('#clinical-entry-text').fill('x'.repeat(2001)); await commitEntry();
    check(await clinical.locator('#clinical-entry-dialog').isVisible() && JSON.stringify(await entryValues())===beforeKindEdit,`S37 ${kind} overlong edit leaves original entries intact`); await clinical.keyboard.press('Escape');
    if(kind==='prescription') {
      await editEntry(kind,id); await clinical.locator('#clinical-entry-text').fill('   '); await commitEntry();
      check(await clinical.locator('#clinical-entry-dialog').isVisible() && (await ct('#clinical-entry-error')).length>0 && JSON.stringify(await entryValues())===beforeKindEdit,'S37 editing medication instructions to blank rejects without changing the entry'); await clinical.keyboard.press('Escape');
    }
    await editEntry(kind,id); await clinical.locator('#clinical-entry-text').fill(`Texto editado ${kind} <b>literal</b>`); await commitEntry();
    check(JSON.stringify(await fieldValues())===draftFields && (await clinical.locator(`[data-${kind}-row="${id}"] [data-entry-text]`).innerText()).includes(`Texto editado ${kind}`),`S37 ${kind} accepted edit preserves all other clinical fields`);
  }
  await diagnosisRow(terms.diseases).locator('[data-diagnosis-remove]').click();
  await prescriptionRow(terms.medications).locator('[data-prescription-remove]').click();
  check(await diagnosisRow(terms.diseases).count()===0 && await prescriptionRow(terms.medications).count()===0 && JSON.stringify(await fieldValues())===draftFields,'S37 removing draft entries preserves unrelated documentation');
  await addDiagnosis(clinical,terms.diseases,'Nota de diagnóstico <b>literal</b>');
  await addPrescription(clinical,terms.medications,'Indicación <script>throw(1)</script>');
  await saveClinical();
  check(await ct('#consultation-status')==='EN_CURSO' && !await clinical.locator('#consultation-order').count(),'S37 Guardar progreso persists without closing or issuing an order');
  const savedClinical=await clinicalSnapshot();
  await resumeClinical(); check(await clinicalSnapshot()===savedClinical,'S37 saved multiple entries and all text fields load for the same consultation ID');
  const savedEntryValues=JSON.stringify(await entryValues());
  await diagnosisRow(terms.diseases).locator('[data-diagnosis-remove]').click();
  await prescriptionRow(terms.medications).locator('[data-prescription-remove]').click();
  await saveClinical(); await resumeClinical();
  check((await entryValues()).length===2 && await diagnosisRow(terms.diseases).count()===0 && await prescriptionRow(terms.medications).count()===0 && JSON.stringify(await fieldValues())===draftFields,'S37 explicit progress save persists entry removals without losing other clinical fields');
  await addDiagnosis(clinical,terms.diseases,'Nota de diagnóstico <b>literal</b>');
  await addPrescription(clinical,terms.medications,'Indicación <script>throw(1)</script>');
  await saveClinical(); await resumeClinical(); check(await clinicalSnapshot()===savedClinical,'S37 explicitly re-added entries persist with the same disease/medicine references and text');
  await addDiagnosis(clinical,'FIX-DIS','Intento de reemplazo'); await addPrescription(clinical,'FIX-MED','Intento de reemplazo');
  check(await clinicalSnapshot()===savedClinical,'S37 duplicate add on a saved record cannot replace its original entry text');
  await resumeClinical(); check(await clinicalSnapshot()===savedClinical,'S37 duplicate add rejection leaves persisted fields and references unchanged');
  // Entry edits/removals remain drafts even when the record was previously saved.
  await diagnosisRow(terms.diseases).locator('[data-diagnosis-remove]').click();
  await prescriptionRow(terms.medications).locator('[data-prescription-remove]').click();
  await resumeClinical(); check(await clinicalSnapshot()===savedClinical,'S37 unsaved entry removal cannot mutate an already-saved consultation');
  for(const field of clinicalFields) {
    await diagnosisRow(terms.diseases).locator('[data-diagnosis-remove]').click();
    await clinical.locator(`#consultation-${field}`).evaluate(node=>node.removeAttribute('maxlength'));
    await clinical.locator(`#consultation-${field}`).fill('x'.repeat(2001)); await saveClinical();
    check((await ct('#consultation-error')).length>0 && await ct('#consultation-status')==='EN_CURSO' && !await clinical.locator('#consultation-order').count(),`S37 ${field} submit-time 2001 rejection keeps record open`);
    await resumeClinical(); check(await clinicalSnapshot()===savedClinical,`S37 ${field} rejected save persists neither fields nor draft row removal`);
  }
  // Visible unadded fields must not silently disappear or be added twice by Save.
  for(const [select,text,id] of [['diagnosis-disease','diagnosis-notes','FIX-DIS'],['prescription-medication','prescription-instructions','FIX-MED']]) {
    for(const pending of ['selection','text']) for(const action of ['#save-consultation','#complete-consultation']) {
      if(pending==='selection') await clinical.locator(`#${select}`).selectOption(id);
      else await clinical.locator(`#${text}`).fill('Texto pendiente sin Agregar');
      await clinical.locator(action).click();
      check((await ct('#consultation-error')).includes('Agregar') && await ct('#consultation-status')==='EN_CURSO' && !await clinical.locator('#consultation-order').count(),'S37 Save/Complete explicitly rejects visible unadded selections/text without issuing or closing');
      await resumeClinical(); check(await clinicalSnapshot()===savedClinical,'S37 pending-entry rejection leaves the entire persisted record unchanged');
    }
  }
  check(await noClinicalMoney()===clinicalMoney,'S37 draft/invalid/save operations leave all orders and financial totals unchanged');
  check(await clinicalCounter('Contador clínico B')===clinicalCounterA+1,'S37 draft/invalid/explicit progress operations allocate no shared IDs'); await resumeClinical();
  for(const field of clinicalFields) {
    check(await clinical.locator(`#consultation-${field}`).getAttribute('maxlength')==='2000',`S37 ${field} advertises its 2000-character limit`);
    await clinical.locator(`#consultation-${field}`).fill('z'.repeat(2000));
  }
  await saveClinical(); await resumeClinical();
  check((await fieldValues()).every(([,value])=>value.length===2000),'S37 all human fields accept exact 2000-character boundary');
  await fillClinical(); await saveClinical();
  await clinical.locator('#clinical-patient').selectOption('DEMO-002');
  check(!await clinical.locator('#consultation-record').count() && !(await ct('#clinical-results')).includes('Indicación <script>'),'S37 patient switch exposes no other patient consultation or prescription'); await resumeClinical();
  check(JSON.stringify(await entryValues())===savedEntryValues,'S37 patient switch preserves stable consultation reference entries');
  await cg('patients'); await clinical.locator('[data-catalog-edit="DEMO-001"]').click();
  await clinical.locator('#cat-document').fill('T8-ALBA'); await clinical.locator('#catalog-form button[type=submit]').click(); await resumeClinical();
  check(await clinical.locator('#consultation-record').getAttribute('data-consultation-id')===clinicalId && JSON.stringify(await entryValues())===savedEntryValues,'S32/S37 patient document edit cannot relink consultation/disease/medicine entries');
  async function protectedClinicalReference(route,id,closed=false) {
    await cg(route); const before=await ct('#catalog-results');
    await clinical.locator(`[data-master-delete="${id}"]`).click(); await clinical.locator('#master-delete-confirm').click();
    check((await ct('#master-delete-error')).includes('No eliminado') && await ct('#catalog-results')===before,`S37 ${closed?'closed':'saved open'} ${route} reference blocks deletion atomically`); await clinical.keyboard.press('Escape');
    await resumeClinical(); check(JSON.stringify(await entryValues())===savedEntryValues,`S37 rejected ${route} deletion preserves clinical reference snapshots`);
  }
  await protectedClinicalReference('diseases',terms.diseases); await protectedClinicalReference('medications',terms.medications);
  for(const [route,id] of [['diseases',terms.diseases],['medications',terms.medications]]) {
    await cg(route); await clinical.locator(`[data-catalog-edit="${id}"]`).click(); await clinical.locator('#cat-name').fill(`Referencia renombrada ${route}`); await clinical.locator('#catalog-form button[type=submit]').click();
  }
  await resumeClinical(); check(JSON.stringify(await entryValues())===savedEntryValues,'S37 saved open terms are name snapshots, not rewritten by catalog rename');
  await clinical.locator('#request-study').click(); await clinical.locator('#study-type').selectOption('FIX-LAB'); await clinical.locator('#study-form button[type=submit]').click();
  await clinical.locator('#complete-consultation').click();
  check(await ct('#consultation-status')==='EN_CURSO' && !await clinical.locator('#consultation-order').count(),'S34/S36/S39 diagnoses, prescriptions and free study never substitute for a selected priced service');
  await clinical.locator('input[name=procedure]').first().check();
  await clinical.locator('#complete-consultation').click();
  check(await ct('#consultation-status')==='CERRADA' && await clinical.locator('#consultation-form,#save-consultation,#complete-consultation,[data-diagnosis-edit],[data-diagnosis-remove],[data-prescription-edit],[data-prescription-remove]').count()===0,'S37 completed clinical documentation and all structured entries are read-only');
  check(JSON.stringify(await entryValues())===savedEntryValues && (await ct('#consultation-record')).includes(draftText.diagnosis) && (await ct('#consultation-record')).includes(draftText.recommendations) && await clinical.locator('#consultation-record img,#consultation-record script,#consultation-record b').count()===0,'S37 closed text/terms/instructions preserve literal snapshots without HTML execution');
  const closedClinical=await ct('#consultation-record');
  await protectedClinicalReference('diseases',terms.diseases,true); await protectedClinicalReference('medications',terms.medications,true);
  for(const [route,id] of [['diseases',terms.diseases],['medications',terms.medications]]) {
    await cg(route); await clinical.locator(`[data-catalog-edit="${id}"]`).click(); await clinical.locator('#cat-name').fill(`Catálogo posterior al cierre ${route}`); await clinical.locator('#catalog-form button[type=submit]').click();
  }
  await resumeClinical(); check(await ct('#consultation-record')===closedClinical,'S37 reopening/deletion rejection cannot rewrite closed clinical content');
  await clinical.locator('#consultation-order').click(); const clinicalOrderId=await clinical.locator('#order-results [data-order-detail]').getAttribute('data-order-detail');
  await clinical.locator('#order-results [data-order-detail]').click();
  check(await clinical.locator('#order-detail-lines tbody tr').count()===1 && (await ct('#order-detail-lines')).includes('PROCEDIMIENTO') && !/Medicamento|Enfermedad|Indicación|LABORATORIO/.test(await ct('#order-detail-lines')) && (await ct('#order-detail-lines')).includes('Bs 300,00'),'S34/S36/S39 only the selected service reaches the issued order'); await clinical.keyboard.press('Escape');
  await clinical.locator(`[data-pay="${clinicalOrderId}"]`).click(); await clinical.locator('#payment-form button[type=submit]').click();
  await clinical.locator('#order-results [data-receipt]').click();
  check(await clinical.locator('#receipt-content tbody tr').count()===1 && !/Medicamento|Enfermedad|Indicación|LABORATORIO/.test(await ct('#receipt-content')),'S39 prescriptions/studies do not become receipt lines'); await clinical.keyboard.press('Escape');
  await cg('overview'); check((await clinical.locator('[data-kpi]').allTextContents()).join('|')==='Bs 1.000,00|Bs 250,00|Bs 750,00|Bs 1.400,00','S37 structured clinical records leave money to the selected-service settlement path only');
  // Rx is optional; separate notes/recommendations may also stay blank.
  await cg('agenda'); await clinical.locator('[data-attend="AP-2"]').click();
  check((await entryValues()).length===0 && (await fieldValues()).every(([,value])=>value===''),'S37 another patient starts blank despite saved histories/catalogs/other prescriptions');
  await fillClinical({reason:'Motivo explícito',anamnesis:'Anamnesis explícita',exploration:'Exploración explícita'}); await addDiagnosis(clinical);
  await clinical.setViewportSize({width:390,height:844});
  await noOverflow(clinical); await iconButtons(clinical);
  await editEntry('diagnosis','FIX-DIS');
  check(await clinical.locator('#clinical-entry-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),'S37 mobile clinical entry editor fits');
  await clinical.locator('#clinical-entry-form button[type=submit]').focus(); await clinical.keyboard.press('Tab');
  check(await clinical.locator('#clinical-entry-select').evaluate(node=>node===document.activeElement),'S37 entry editor Tab wraps to reference select'); await clinical.keyboard.press('Shift+Tab');
  check(await clinical.locator('#clinical-entry-form button[type=submit]').evaluate(node=>node===document.activeElement),'S37 entry editor reverse wrap restores save'); await clinical.keyboard.press('Escape');
  await clinical.locator('input[name=procedure]').first().check(); await clinical.locator('#complete-consultation').click();
  check(await ct('#consultation-status')==='CERRADA' && await clinical.locator('[data-prescription-row]').count()===0,'S37 one human-selected diagnosis and positive service can complete without Rx or free-text diagnosis');
  await noOverflow(clinical);
  await cg('agenda'); await clinical.locator('[data-attend="AP-3"]').click();
  check((await ct('[data-context-history]')).includes('Sustancia ficticia') && (await entryValues()).length===0 && (await fieldValues()).every(([,value])=>value==='') && await clinical.locator('#diagnosis-disease').inputValue()==='' && await clinical.locator('#prescription-medication').inputValue()==='','S37 populated patient history and physician specialty never infer diagnoses, medicines, notes or recommendations');
  console.log(`T8 public HTTP structured clinical draft/snapshot/billing contract: PASS (${checks} checks so far)`);

  // S38 supersedes the old catalog, including state, routes and known role keys.
  check(!/triage/i.test(source),'S38 no obsolete Triage UI, state, route or role key remains');
  await go('medications');
  check(await page.locator('#catalog-add').count()===1,'S39 direct medicine CRUD independent of inventory');
  await go('overview');
  const resourceMenus = {physicians:'Médicos',specialties:'Especialidades',rooms:'Consultorios',laboratory:'Laboratorio',imaging:'Imagenología',diseases:'Enfermedades',allergyCatalog:'Alergias',medications:'Medicamentos'};
  await page.locator('#navigation [data-page="clinical"]').click();
  console.log(`S8-S11 discovery: direct menus=${(await page.locator('#navigation button').allTextContents()).filter(label=>Object.values(resourceMenus).includes(label)).length}/8; habits=${await page.getByRole('button',{name:'Editar hábitos',exact:true}).count()}; references=${await page.locator('#navigation [data-page="diseases"],#navigation [data-page="allergyCatalog"]').count()}/2; medicines=${await page.locator('#navigation [data-page="medications"]').count()}/1`);
  await page.locator('#navigation [data-page="overview"]').click();
  check((await page.locator('#navigation button').allTextContents()).filter(label=>Object.values(resourceMenus).includes(label)).length===8, 'S8-S11 eight direct business menus, not generic catalog tabs');
  check(await text('#page-title') === 'Resumen', 'Initial dashboard');
  check(await page.locator('[data-kpi]').count() === 4, 'Four KPIs');
  check((await snapshotKPIs()).join('|') === 'Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'Initial coherent totals');
  check(await page.locator('header').count() === 1 && await page.locator('aside').count() === 1 && await page.locator('main:visible').count() === 1, 'One shell');
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
  const cashPaidRow=page.locator('#order-results tr').filter({hasText:'ORD-102'});
  check(await cashPaidRow.locator('[data-pay],[data-qr]').count()===0 && !(await cashPaidRow.innerText()).includes('Sin saldo pendiente'),'S31 fully cash-paid row has no payment/QR launch or no-balance filler');
  check(await cashPaidRow.locator('[data-order-detail]').count()===1 && await cashPaidRow.locator('[data-receipt]').count()===2,'S31 fully cash-paid order retains detail and both receipts');
  await cashPaidRow.locator('[data-receipt]').last().click();
  check((await text('#receipt-content')).includes('EFECTIVO') && (await text('#receipt-content')).includes('Bs 0,00'),'S31 fully cash-paid receipt still opens with zero remainder');
  await page.keyboard.press('Escape');

  await go('patients');
  await page.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
  await page.locator('#patient-form button[type=submit]').click();
  check((await text('#patient-error')).includes('nombre ficticio'), 'Required patient fields validated');
  await page.locator('#patient-name').fill('Nombre de prueba');
  await page.locator('#patient-document').fill('900001');
  await page.locator('#patient-form button[type=submit]').click();
  check((await text('#patient-error')).includes('ya existe'), 'Duplicate document rejected');
  check((await text('#patient-results')).includes('3 registros ficticios'), 'Rejected patients leave directory unchanged');
  const safeName = '<img onerror=throw(1)> Ejemplo';
  await page.locator('#patient-name').fill(safeName);
  await page.locator('#patient-document').fill('DEMO-004');
  await page.locator('#patient-form button[type=submit]').click();
  check(!await page.locator('#patient-dialog').isVisible(), 'Patient created');
  const createdPatientId=await page.locator('#patient-results tbody tr').filter({hasText:'DEMO-004'}).locator('[data-chart]').getAttribute('data-chart');
  check(createdPatientId!=='DEMO-004','New internal patient ID differs from submitted document');
  await page.locator('#patient-search').fill('DEMO-004');
  check(await rows('#patient-results').count() === 1 && (await text('#patient-results')).includes(safeName), 'Safe literal user text and patient search');
  check(await page.locator('#patient-results img').count() === 0, 'No HTML execution');
  await page.locator('#patient-search').fill('missing');
  check((await text('#patient-results')).includes('No se encontraron'), 'Patient empty state');
  await page.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
  await page.keyboard.press('Escape');
  check(await page.getByRole('button',{name:'Agregar Paciente',exact:true}).evaluate(node=>node===document.activeElement), 'Patient Escape focus restoration');

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
  await page.locator('#clinical-patient').selectOption(createdPatientId);
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
  const catalogRoutes={physicians:'physicians',specialties:'specialties',rooms:'rooms',procedures:'catalogs',diseases:'diseases',allergyCatalog:'allergyCatalog',medications:'medications'};
  async function selectCatalog(target,kind,mode='LABORATORIO') {
    const route=catalogRoutes[kind] || (mode==='IMAGEN'?'imaging':'laboratory');
    if(await target.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await target.locator('#menu-toggle').click();
    await target.locator(`#navigation [data-page="${route}"]`).click();
    // Each study modality now opens its CRUD directly.
    await noProviderUI(target);
  }
  async function catalogTab(kind,mode) { await selectCatalog(page,kind,mode); }
  async function catalogForm(values, edit=false) {
    await page.locator(edit ? '#catalog-results [data-catalog-edit]' : '#catalog-add').last().click();
    for(const [field,value] of Object.entries(values)) await page.locator(`#cat-${field}`).fill(value);
    await noProviderUI(page);
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
  check((await page.locator('#catalog-results tbody tr').filter({hasText:'Consultorio 3'}).locator('td').allTextContents()).slice(0,3).join('|')==='Consultorio 3|Ubicación editada|Inactivo','Edit consultorio location/status in distinct typed cells');
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
  await go('catalogs'); await catalogTab('studyTypes');
  for(const [mode,name] of [['LABORATORIO','Hemograma demo'],['IMAGEN','Radiografía demo']]) {
    await catalogTab('studyTypes',mode);
    await catalogForm({name,description:`Descripción ${mode}`}); await saveCatalog();
    check((await text('#catalog-results')).includes(name) && (await text('#catalog-results')).includes(`Descripción ${mode}`) && !/\bBs\b|Precio/.test(await text('#catalog-results')),`Study ${mode} has description and no price`);
  }
  await catalogForm({description:'Descripción editada'},true); await saveCatalog();
  check((await text('#catalog-results')).includes('Descripción editada'),'Edit study description');
  before=await text('#catalog-results');
  await catalogForm({name:'Radiografía demo'}); await rejectCatalog('ya existe',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Descripción inválida'});
  await page.locator('#cat-description').evaluate(node=>node.removeAttribute('maxlength'));
  await page.locator('#cat-description').fill('x'.repeat(121)); await rejectCatalog('120',before); await page.keyboard.press('Escape');
  await catalogForm({name:'Descartar catálogo'}); await page.locator('#catalog-dialog [data-close]').click();
  check(await text('#catalog-results')===before, 'Catalog Cancel preserves list');
  await go('overview'); await catalogTab('studyTypes','IMAGEN');
  check((await text('#catalog-results')).includes('Radiografía demo') && (await text('#catalog-results')).includes('Descripción editada'),'Study description edits persist across views');
  await catalogTab('physicians');
  await page.setViewportSize({width:390,height:844});
  await noOverflow(page);
  check(await page.locator('#catalog-results .table-wrap').evaluate(node=>node.scrollWidth>node.clientWidth), 'Populated catalog overflow stays inside table region');
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
  const coordinationID=await page.locator('[data-role="Coordinación"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  await page.getByRole('tab',{name:'Navegación',exact:true}).click(); await page.locator('#navigation-role').selectOption(coordinationID);
  await page.getByRole('checkbox',{name:'Acceder Agenda',exact:true}).check();
  await page.locator('#settings-form button[type=submit]').click();
  await page.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  await go('overview');
  await go('settings');
  await page.getByRole('tab',{name:'Roles',exact:true}).click();
  await page.getByRole('tab',{name:'Navegación',exact:true}).click(); await page.locator('#navigation-role').selectOption(coordinationID);
  check(await page.getByRole('checkbox',{name:'Acceder Agenda',exact:true}).isChecked(), 'Local role menu grant saved across views');
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
  await mobile.locator('#navigation [data-page="physicians"]').click();
  await mobile.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  await mobile.locator('#catalog-add').click();
  check(await mobile.locator('#catalog-dialog').isVisible(), 'Mobile physician form opens');
  check(await mobile.locator('#catalog-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile physician form has no internal horizontal overflow');
  await mobile.keyboard.press('Escape');
  await noOverflow(mobile);
  await page.reload();
  check(await page.locator('#login-screen').isVisible(), 'Reload returns to login');
  await enterDemo(page);
  check((await snapshotKPIs()).join('|') === 'Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'Reload resets all payments');
  await catalogTab('physicians');
  check(!(await text('#catalog-results')).includes('Dra. Este editada'), 'Reload resets created catalogs');
  await go('clinical'); await page.locator('#clinical-patient').selectOption('DEMO-002');
  check((await clinicalList('familyHistory').innerText()).includes('Sin registrar'), 'Reload resets clinical context');
  // T3 acceptance starts with independent fixtures, not the earlier mutation scenario.
  const flow = await openPage({width:1440,height:1000});
  const ft = selector => flow.locator(selector).innerText();
  const fg = async id => {
    if(await flow.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await flow.locator('#menu-toggle').click();
    await flow.locator(`#navigation [data-page="${id}"]`).click();
    await noProviderUI(flow);
  };
  await fg('agenda');
  check(await flow.getByRole('button',{name:'Agregar cita',exact:true}).count()===1, 'T3 discoverable appointment creation');
  await fg('patients');
  await flow.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
  await flow.locator('#patient-name').fill('Dalia Flujo demo');
  await flow.locator('#patient-document').fill('FLOW-001');
  await flow.locator('#patient-form button[type=submit]').click();
  const flowPatientId=await flow.locator('#patient-results tr').filter({hasText:'FLOW-001'}).locator('[data-chart]').getAttribute('data-chart');
  check(flowPatientId!=='FLOW-001','Flow captures generated patient ID through public DOM');
  await flow.locator(`[data-chart="${flowPatientId}"]`).click();
  for(const kind of ['allergies','familyHistory','personalHistory']) check(await flow.locator(`#context-${kind}`).innerText()==='Sin registrar', `New patient has no seeded ${kind}`);
  check(await flow.locator('[data-habits-summary]').innerText()==='Sin registrar', 'New patient habits remain empty');
  for(const [kind,values] of [['allergies',{substance:'Alergia Dalia',reaction:'Reacción ficticia'}],['familyHistory',{relation:'Hermana',condition:'Antecedente Dalia'}]]) {
    await flow.locator(`[data-context-add="${kind}"]`).click();
    for(const [key,value] of Object.entries(values)) await flow.locator(`#context-${key}`).fill(value);
    await flow.locator('#context-form button[type=submit]').click();
  }
  await fg('catalogs');
  const fcTab = (kind,mode) => selectCatalog(flow,kind,mode);
  async function fcCreate(kind,values,configure=async()=>{},mode) {
    await fcTab(kind,mode); await flow.locator('#catalog-add').click();
    for(const [key,value] of Object.entries(values)) await flow.locator(`#cat-${key}`).fill(value);
    await configure(); await flow.locator('#catalog-form button[type=submit]').click();
    check(!await flow.locator('#catalog-dialog').isVisible(), `Flow catalog created: ${kind}`);
  }
  await fcCreate('specialties',{name:'Especialidad flujo'});
  // Retain the exact-cent 600.30/QR/cash regression legitimately: studies are
  // free; only these two additional explicitly selected clinic services charge.
  await fcCreate('procedures',{name:'Servicio adicional A',price:'100.10'});
  await fcCreate('procedures',{name:'Servicio adicional B',price:'200.20'});
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
  const flowTypeIds=new Map();
  for(const [mode,study] of [['LABORATORIO','Estudio lab flujo'],['IMAGEN','Estudio imagen flujo']]) {
    await fcCreate('studyTypes',{name:study,description:`Descripción ${study}`},async()=>{},mode);
    flowTypeIds.set(study,await flow.locator('#catalog-results tbody tr').filter({hasText:study}).locator('[data-catalog-edit]').getAttribute('data-catalog-edit'));
  }
  await fg('agenda');
  const appointmentBefore=await ft('#agenda-results');
  await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
  await flow.locator('#appointment-patient').selectOption(flowPatientId);
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
  check(await flow.getByRole('button',{name:'Agregar cita',exact:true}).evaluate(node=>node===document.activeElement), 'Appointment Escape restores focus');
  await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
  await flow.locator('#appointment-reason').fill('Borrador descartado');
  await flow.locator('#appointment-dialog [data-close]').click();
  check(await ft('#agenda-results')===appointmentBefore, 'Appointment Cancel leaves records unchanged');
  await fg('catalogs'); await fcTab('rooms');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Sala flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-active').uncheck(); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('agenda'); await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
  check(await flow.locator('#appointment-room option').filter({hasText:'Sala flujo'}).count()===0, 'Inactive room excluded from new appointment choices');
  await flow.keyboard.press('Escape');
  await fg('catalogs'); await fcTab('rooms');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Sala flujo'}).getByRole('button',{name:'Editar',exact:true}).click();
  await flow.locator('#cat-active').check(); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('agenda');
  await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
  await flow.locator('#appointment-patient').selectOption(flowPatientId);
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
    await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
    await flow.locator('#appointment-patient').selectOption(flowPatientId);
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
  await adding(flow,flow.locator('#request-study'),'Agregar Laboratorio / Imagen');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Starting consultation marks linked appointment En atención');
  await fg('overview');
  check((await flow.locator('[data-overview-status]').allTextContents()).join('|')==='3|1|0','S28 operational indicators derive started appointment lifecycle, not fixed counts');
  await fg('agenda'); await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check(await flow.getByRole('heading',{name:'Citas y consultas',exact:true}).count()===1, 'Clinical heading includes all appointment lifecycle states');
  await flow.locator('#complete-consultation').click();
  check((await ft('#consultation-error')).includes('Completa') && (await ft('#consultation-status'))==='EN_CURSO', 'Incomplete consultation rejected');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Invalid completion leaves linked appointment En atención');
  for(const [field,value] of Object.entries({reason:'Motivo documentado',anamnesis:'Anamnesis ficticia',exploration:'Exploración ficticia',diagnosis:'Texto humano ficticio <sin IA>'})) await flow.locator(`#consultation-${field}`).fill(value);
  // S37: this textarea is now separate notes, never the diagnosis requirement.
  await addDiagnosis(flow);
  await flow.locator('#complete-consultation').click();
  check((await ft('#consultation-error')).includes('facturable'), 'Completion requires billables');
  check(await clinicalAppointmentBadge().innerText()==='En atención', 'Missing billables do not mark appointment attended');
  await flow.locator('input[name=procedure]').first().check();
  await flow.getByLabel('Servicio adicional A · Bs 100,10',{exact:true}).check();
  await flow.getByLabel('Servicio adicional B · Bs 200,20',{exact:true}).check();
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
  check(await ft('#study-error')==='Selecciona un Laboratorio o Imagen válido en una consulta activa.' && await ft('#consultation-studies')===noStudies, 'Empty study type rejected without request mutation');
  await flow.locator('#study-type').evaluate(node=>node.add(new Option('Tipo inexistente','UNKNOWN-TYPE')));
  await flow.locator('#study-type').selectOption('UNKNOWN-TYPE'); await flow.locator('#study-form button[type=submit]').click();
  check(await ft('#study-error')==='Selecciona un Laboratorio o Imagen válido en una consulta activa.' && await ft('#consultation-studies')===noStudies, 'Unknown type rejected without request mutation or unrelated dependency');
  await flow.keyboard.press('Escape');
  for(const study of ['Estudio lab flujo','Estudio imagen flujo']) {
    await flow.locator('#request-study').click();
    await flow.locator('#study-type').selectOption({label:study});
    await noProviderUI(flow);
    check(await flow.locator('#study-form select').count()===1 && await flow.locator('#study-type').inputValue()===flowTypeIds.get(study), 'Request uses catalog stable type ID with no provider selector');
    await flow.locator('#study-form button[type=submit]').click();
    check((await ft('#consultation-studies')).includes(study) && (await ft('#consultation-studies')).includes('PENDIENTE'), `Request ${study}`);
    check((await ft('#consultation-studies')).includes(study.includes('lab')?'LABORATORIO':'IMAGEN') && !/proveedor|provider|Sin registrar/.test(await ft('#consultation-studies')), 'Requested study shows type/modality/status without missing-resource placeholder');
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
  // Free studies alone may never become billable lines or create an order.
  for(const control of await flow.locator('input[name=procedure]').all()) await control.uncheck();
  const beforeFreeStudyReject=await ft('#consultation-studies');
  await flow.locator('#complete-consultation').click();
  check(await ft('#consultation-status')==='EN_CURSO' && (await ft('#consultation-error')).length>0 && await ft('#consultation-studies')===beforeFreeStudyReject && !await flow.locator('#consultation-order').count(),'S34 free requested/resulted Lab/Imagen alone reject completion atomically, without order');
  await flow.locator('input[name=procedure]').first().check();
  await flow.getByLabel('Servicio adicional A · Bs 100,10',{exact:true}).check();
  await flow.getByLabel('Servicio adicional B · Bs 200,20',{exact:true}).check();
  await flow.locator('#complete-consultation').click();
  check(await ft('#consultation-status')==='CERRADA' && !await flow.locator('#consultation-form').count(), 'Completed consultation read-only');
  check(await clinicalAppointmentBadge().innerText()==='Atendida', 'Successful completion marks clinical appointment Atendida');
  await fg('overview');
  check((await flow.locator('[data-overview-status]').allTextContents()).join('|')==='3|0|1','S28 operational indicators derive completed appointment lifecycle');
  await fg('agenda'); await flow.locator('#agenda-status').selectOption('attended');
  check(await flow.locator('#agenda-results tbody tr').count()===1 && await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count()===1 && await appointmentRow.locator('.badge').innerText()==='Atendida', 'Agenda Atendida filter selects the linked completed appointment');
  await flow.locator('#agenda-status').selectOption('in_progress');
  check(!await flow.locator(`#agenda-results [data-attend="${appointmentId}"]`).count(), 'Completed appointment no longer appears En atención');
  await flow.locator('#agenda-status').selectOption('attended');
  await flow.locator(`[data-attend="${appointmentId}"]`).click();
  check(await clinicalAppointmentBadge().innerText()==='Atendida', 'Reopening closed consultation cannot regress appointment state');
  const issuedOrder=await flow.locator('#consultation-order').getAttribute('data-order-id');
  await flow.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-3');
  await flow.locator('#consultation-order').click();
  check(await ft('#page-title')==='Atención clínica' && !await flow.locator('#order-search').count() && await ft('#consultation-status')==='CERRADA', 'Restricted clinical-to-Cobros crosslink preserves closed consultation without target DOM errors');
  await flow.getByRole('combobox',{name:'Simular rol',exact:true}).selectOption('ROLE-1');
  await flow.locator('#consultation-order').click();
  const flowOrder=()=>flow.locator('#order-results tbody tr').filter({hasText:issuedOrder});
  check((await flowOrder().innerText()).includes('Bs 600,30'), 'Selected services 300 + 100.10 + 200.20 exact order sum; Lab/Imagen free');
  await flowOrder().locator('[data-order-detail]').click();
  const immutableLines=await ft('#order-detail-lines');
  check(!immutableLines.includes('Estudio lab flujo') && !immutableLines.includes('Estudio imagen flujo') && immutableLines.includes('Bs 300,00') && immutableLines.includes('Servicio adicional A') && immutableLines.includes('Servicio adicional B') && await flow.locator('#order-detail-lines tbody tr').count()===3, 'S34/S36 only three explicitly selected service snapshots; no study lines even at zero price');
  await flow.keyboard.press('Escape');
  await fg('overview');
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 700,00|Bs 250,00|Bs 450,00|Bs 2.000,30', 'Order increases pending, not income');
  await flow.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await fg('catalogs'); await fcTab('studyTypes');
  await flow.locator('#catalog-results tbody tr').filter({hasText:'Estudio lab flujo'}).getByRole('button',{name:'Editar Laboratorio',exact:true}).click();
  await flow.locator('#cat-name').fill('Estudio lab renombrado'); await flow.locator('#cat-description').fill('Descripción actualizada, sin arancel');
  await flow.locator('#catalog-form button[type=submit]').click();
  await fcTab('procedures');
  await flow.locator('#catalog-results tr').filter({hasText:'Servicio adicional A'}).locator('[data-catalog-edit]').click();
  await flow.locator('#cat-name').fill('Servicio A renombrado'); await flow.locator('#cat-price').fill('999'); await flow.locator('#catalog-form button[type=submit]').click();
  await fg('payments'); await flowOrder().locator('[data-order-detail]').click();
  check(await ft('#order-detail-lines')===immutableLines, 'Historic order unchanged after catalog edits'); await flow.keyboard.press('Escape');
  async function openQr() { await flowOrder().locator('[data-qr]').click(); await noProviderUI(flow); }
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
  check(!/Estudio lab|Estudio imagen|LABORATORIO|IMAGEN/.test(qrReceipt) && await flow.locator('#receipt-content tbody tr').count()===3,'S34 receipts retain selected services only, never free study lines');
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
  check(await flowOrder().locator('[data-qr],[data-pay]').count()===0 && !(await flowOrder().innerText()).includes('Sin saldo pendiente') && await flowOrder().locator('[data-order-detail]').count()===1,'S31 mixed QR/cash settlement removes all payment entry actions/filler, retaining detail/receipts');
  const receiptIds=await flowOrder().locator('[data-receipt]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
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
    // QR remains usable on an unpaid order, never reintroduced on the paid one.
    const mobileOrder=selector==='[data-qr]'?flow.locator('#order-results tr').filter({hasText:'ORD-101'}):flowOrder();
    await mobileOrder.locator(selector).first().click();
    check(await flow.locator(dialog).evaluate(node=>node.scrollWidth<=node.clientWidth), `Mobile ${dialog} internal width`);
    await noOverflow(flow); await flow.keyboard.press('Escape');
  }
  await fg('agenda'); await flow.getByRole('button',{name:'Agregar cita',exact:true}).click();
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
  await addDiagnosis(flow);
  await flow.locator('input[name=procedure]').first().check();
  await flow.locator('#complete-consultation').click();
  check(await ft('#consultation-status')==='CERRADA' && (await ft('#consultation-studies')).includes('PENDIENTE'), 'Pending studies explicitly allowed at completion without invented results');
  await noOverflow(flow);
  // Referenced deletions must not alter any connected business record or money.
  await flow.setViewportSize({width:1440,height:1000});
  await flow.waitForFunction(()=>document.querySelector('#menu-toggle').getAttribute('aria-expanded')==='true');
  async function businessSnapshot() {
    await fg('overview'); const kpis=await flow.locator('[data-kpi]').allTextContents();
    await fg('payments'); const payments=await ft('#order-results');
    await fg('agenda'); await flow.locator('#agenda-period').selectOption('week'); const agenda=await ft('#agenda-results');
    await fg('clinical'); await flow.locator('#clinical-patient').selectOption(flowPatientId); const clinical=await ft('#clinical-results');
    return JSON.stringify({kpis,payments,agenda,clinical});
  }
  const protectedBusiness=await businessSnapshot();
  for(const [kind,name,mode] of [['specialties','Especialidad flujo'],['rooms','Sala renombrada'],['physicians','Dra. Flujo renombrada'],['studyTypes','Estudio lab renombrado','LABORATORIO'],['studyTypes','Estudio imagen flujo','IMAGEN'],['procedures','Consulta demo']]) {
    await fcTab(kind,mode);
    const listBefore=await ft('#catalog-results');
    await flow.locator('#catalog-results tbody tr').filter({hasText:name}).locator('[data-master-delete]').click();
    await flow.locator('#master-delete-confirm').click();
    check((await ft('#master-delete-error')).includes('No eliminado') && await ft('#catalog-results')===listBefore, `Referenced ${kind}/${name} deletion rejects with exact list unchanged`);
    await flow.keyboard.press('Escape');
    check(await businessSnapshot()===protectedBusiness, `Referenced ${kind}/${name} deletion preserves patients, history, appointments, studies, orders, receipts and money`);
  }
  await fg('patients');
  const protectedDirectory=await ft('#patient-results');
  await flow.locator(`[data-master-delete="${flowPatientId}"]`).click(); await flow.locator('#master-delete-confirm').click();
  check((await ft('#master-delete-error')).includes('Paciente con') && await ft('#patient-results')===protectedDirectory, 'Patient with linked clinical/financial records cannot be deleted');
  await flow.keyboard.press('Escape');
  check(await businessSnapshot()===protectedBusiness, 'Blocked patient deletion leaves complete business snapshot unchanged');
  // Patient labels are live, issued orders and receipts remain snapshots.
  await fg('payments'); await flowOrder().locator('[data-order-detail]').click(); const orderPatientSnapshot=await ft('#order-detail-lines'); await flow.keyboard.press('Escape');
  await flowOrder().locator('[data-receipt]').first().click(); const receiptPatientSnapshot=await ft('#receipt-content'); await flow.keyboard.press('Escape');
  await fg('patients'); await flow.locator(`[data-catalog-edit="${flowPatientId}"]`).click();
  check((await ft('#catalog-fields')).includes('ID interno inmutable') && await flow.locator('#cat-document').isEditable(),'Patient link ID immutable, document independently editable');
  await flow.locator('#cat-name').fill('Dalia renombrada'); await flow.locator('#cat-document').fill('FLOW-EDITADO'); await flow.locator('#cat-note').fill('Nota editada'); await flow.locator('#catalog-form button[type=submit]').click();
  check(await flow.locator('#patient-results tr').filter({hasText:'FLOW-EDITADO'}).locator('[data-chart]').getAttribute('data-chart')===flowPatientId,'Document edit preserves original link ID');
  await fg('clinical'); await flow.locator('#clinical-patient').selectOption(flowPatientId);
  check((await flow.locator('#clinical-patient option:checked').innerText()).includes('Dalia renombrada') && (await ft('#clinical-results')).includes('Alergia Dalia'), 'Patient rename retains stable selector/history links');
  await fg('agenda'); check((await ft('#agenda-results')).includes('Dalia renombrada'), 'Patient rename updates linked appointments');
  await fg('payments'); await flowOrder().locator('[data-order-detail]').click();
  check(await ft('#order-detail-lines')===orderPatientSnapshot, 'Patient edit cannot rewrite issued order snapshot'); await flow.keyboard.press('Escape');
  await flowOrder().locator('[data-receipt]').first().click();
  check(await ft('#receipt-content')===receiptPatientSnapshot, 'Patient edit cannot rewrite issued receipt snapshot'); await flow.keyboard.press('Escape');
  await flow.reload(); await enterDemo(flow);
  check((await flow.locator('[data-kpi]').allTextContents()).join('|')==='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'T3 reload resets financial state');
  await fg('agenda'); check(!await flow.locator(`[data-attend="${appointmentId}"]`).count(), 'Reload removes new appointments and consultations');
  // S8-S11 use a fresh public UI scenario, independent of the connected cash/QR flow above.
  const expanded=await openPage({width:1440,height:1000});
  const et=selector=>expanded.locator(selector).innerText();
  const eg=async id=>{
    if(await expanded.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await expanded.locator('#menu-toggle').click();
    await expanded.locator(`#navigation [data-page="${id}"]`).click();
    await noProviderUI(expanded);
  };
  for(const [id,label] of Object.entries(resourceMenus)) {
    await eg(id);
    check(await et('#page-title')===label && await et('#breadcrumb')===`Clínica / ${label}` && await expanded.locator(`#navigation [data-page="${id}"]`).getAttribute('aria-current')==='page', `Own title, breadcrumb and active menu: ${label}`);
  }
  const modalityIds=new Map();
  for(const [route,mode,other] of [['laboratory','LABORATORIO','IMAGEN'],['imaging','IMAGEN','LABORATORIO']]) {
    await eg(route);
    // Free fictional fixtures are removed via the public confirmation to retain empty/CRUD coverage.
    await expanded.locator('[data-master-delete]').click(); await expanded.locator('#master-delete-confirm').click();
    check(await expanded.locator('#view [role="tab"]').count()===0, `No resource subtabs in ${mode}`);
    await expanded.locator('#catalog-add').click();
    await expanded.locator('#cat-name').fill(`Estudio ${mode}`); await expanded.locator('#cat-description').fill(`Descripción ${mode}`);
    check(await expanded.locator('#catalog-fields select,#cat-price').count()===0 && await expanded.locator('#cat-description').count()===1,`Study fields only name/description; menu fixes modality: ${mode}`);
    await expanded.locator('#catalog-form button[type=submit]').click();
    check((await et('#catalog-results')).includes(`Estudio ${mode}`) && !(await et('#catalog-results')).includes(`Estudio ${other}`), `Own study list filters modality: ${mode}`);
    modalityIds.set(mode,await expanded.locator('[data-catalog-edit]').getAttribute('data-catalog-edit'));
    await expanded.locator('[data-master-view]').click();
    check((await et('#master-detail-content')).includes(`Estudio ${mode}`) && (await et('#master-detail-content')).includes(`Descripción ${mode}`) && !/Modalidad:|Precio:|\bBs\b/.test(await et('#master-detail-content')),`Study detail contains saved name/description and ID, no modality/price fields: ${mode}`);
    check(await et('#master-detail-title')===`Detalle · ${mode==='IMAGEN'?'Imagen':'Laboratorio'}`, 'Entity-specific detail title');
    await noProviderUI(expanded); await expanded.keyboard.press('Escape');
    await expanded.locator('[data-master-delete]').click();
    check(await et('#master-delete-title')===`Eliminar · ${mode==='IMAGEN'?'Imagen':'Laboratorio'}` && (await et('#master-delete-summary')).includes(`Eliminar ${mode==='IMAGEN'?'Imagen':'Laboratorio'}:`), 'Entity-specific delete confirmation');
    await expanded.keyboard.press('Escape');
  }
  check(new Set(modalityIds.values()).size===2, 'Both modality records have distinct stable IDs');
  for(const [route,mode,other] of [['laboratory','LABORATORIO','IMAGEN'],['imaging','IMAGEN','LABORATORIO']]) {
    await eg(route);
    check((await et('#catalog-results')).includes(mode) && !(await et('#catalog-results')).includes(other), `Own study modality isolated: ${mode}`);
    check((await et('#catalog-results')).includes(`Estudio ${mode}`) && !(await et('#catalog-results')).includes(`Estudio ${other}`), `Both studies retained after route switches: ${mode}`);
    check(await expanded.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===modalityIds.get(mode) && await expanded.locator(`[data-catalog-edit="${modalityIds.get(other)}"]`).count()===0, `Modality route retains only its own stable IDs: ${mode}`);
  }
  await eg('catalogs');
  const tariffCount=await expanded.locator('[data-catalog-edit]').count();
  await expanded.locator('[data-catalog-edit]').first().click(); await expanded.locator('#cat-price').fill('301');
  await expanded.locator('#catalog-form button[type=submit]').click();
  check(tariffCount===2 && (await et('#catalog-results')).includes('Bs 301,00'), 'Existing procedure tariffs remain editable via Aranceles');
  await eg('patients'); await expanded.locator('[data-chart="DEMO-001"]').click();
  for(const [kind,fields] of [['allergies',{substance:'Alergia ficticia Alba',reaction:'Reacción humana'}],['familyHistory',{relation:'Madre',condition:'Antecedente familiar ficticio'}],['personalHistory',{notes:'Nota personal ficticia Alba'}]]) {
    await expanded.locator(`[data-context-add="${kind}"]`).click();
    for(const [key,value] of Object.entries(fields)) await expanded.locator(`#context-${key}`).fill(value);
    await expanded.locator('#context-form button[type=submit]').click();
  }
  const historyBefore=await expanded.locator('[data-context-history]').innerText();
  const habits=()=>expanded.locator('[data-habits-summary]');
  const editHabits=async value=>{
    await expanded.getByRole('button',{name:'Editar hábitos',exact:true}).click();
    await expanded.getByRole('textbox',{name:'Hábitos',exact:true}).fill(value);
  };
  check(await habits().innerText()==='Sin registrar', 'S9 habits start undocumented');
  for(const dismissal of ['cancel','escape']) {
    await editHabits('Borrador no guardado');
    if(dismissal==='cancel') await expanded.locator('#habits-dialog [data-close]').click(); else await expanded.keyboard.press('Escape');
    check(await habits().innerText()==='Sin registrar', `Habits ${dismissal} discards draft`);
  }
  await editHabits('x'.repeat(1000)); await expanded.locator('#habits-form button[type=submit]').click();
  check((await habits().innerText()).length===1000, 'Habits accepts the documented 1000-character boundary');
  const habitText='Lectura y paseo <img src=x onerror=throw(1)>';
  await editHabits(habitText);
  check(await expanded.getByRole('textbox',{name:'Hábitos',exact:true}).getAttribute('maxlength')==='1000' && (await et('#habits-dialog')).includes('Máximo 1000 caracteres'), 'Habits visible length limit');
  await expanded.locator('#habits-form button[type=submit]').click();
  check(await habits().innerText()===habitText && await expanded.locator('[data-habits-summary] img').count()===0, 'Habits explicitly save literal text');
  for(const dismissal of ['cancel','escape']) {
    await editHabits('Edición descartada');
    if(dismissal==='cancel') await expanded.locator('#habits-dialog [data-close]').click(); else await expanded.keyboard.press('Escape');
    await eg('overview'); await eg('clinical'); await expanded.locator('#clinical-patient').selectOption('DEMO-001');
    check(await habits().innerText()===habitText, `Unsaved habits ${dismissal} then navigation preserves saved field`);
  }
  await expanded.locator('#clinical-patient').selectOption('DEMO-002');
  check(await habits().innerText()==='Sin registrar', 'Habits isolated from second patient');
  await editHabits('Solo Bruno'); await expanded.locator('#habits-form button[type=submit]').click();
  await eg('overview'); await eg('clinical');
  await expanded.locator('#clinical-patient').selectOption('DEMO-001');
  check(await habits().innerText()===habitText && await expanded.locator('[data-context-history]').innerText()===historyBefore, 'Habits persist navigation without changing antecedents');
  await editHabits('Texto editado'); await expanded.locator('#habits-form button[type=submit]').click();
  check(await habits().innerText()==='Texto editado', 'Habits edit replaces saved text');
  await editHabits(''); await expanded.locator('#habits-form button[type=submit]').click();
  check(await habits().innerText()==='Sin registrar', 'Clearing habits explicitly restores undocumented');
  await editHabits(habitText); await expanded.locator('#habits-form button[type=submit]').click();
  await eg('medications');
  await expanded.locator('[data-master-delete="FIX-MED"]').click(); await expanded.locator('#master-delete-confirm').click();
  check((await et('#catalog-results')).includes('Sin registrar'),'Medicamentos reference empty state');
  const medicationCreate=async(name,description)=>{
    await expanded.locator('#catalog-add').click();
    await expanded.locator('#cat-name').fill(name); await expanded.locator('#cat-description').fill(description);
    await expanded.locator('#catalog-form button[type=submit]').click();
  };
  for(const [name,description] of [['','Descripción'],['',''],['   ','   ']]) {
    const before=await et('#catalog-results'); await medicationCreate(name,description);
    check(await expanded.locator('#catalog-dialog').isVisible() && await et('#catalog-results')===before && (await et('#catalog-error')).length>0,'Medicamentos required name rejects without mutation');
    await expanded.keyboard.press('Escape');
  }
  for(const dismissal of ['cancel','escape']) {
    const before=await et('#catalog-results'); await expanded.locator('#catalog-add').click();
    await expanded.locator('#cat-name').fill('Descartar medicamento'); await expanded.locator('#cat-description').fill('Descartar descripción');
    if(dismissal==='cancel') await expanded.locator('#catalog-dialog [data-close]').click(); else await expanded.keyboard.press('Escape');
    check(await et('#catalog-results')===before,`Medicamentos create ${dismissal} preserves empty list/count`);
  }
  await expanded.locator('#catalog-add').click();
  for(const [key,value] of [['name','x'.repeat(121)],['description','y'.repeat(121)]]) {
    await expanded.locator('#cat-name').fill('Medicamento válido'); await expanded.locator('#cat-description').fill('Descripción válida');
    await expanded.locator(`#cat-${key}`).evaluate(node=>node.removeAttribute('maxlength'));
    await expanded.locator(`#cat-${key}`).fill(value); const before=await et('#catalog-results');
    await expanded.locator('#catalog-form button[type=submit]').click();
    check((await et('#catalog-error')).includes('120') && await et('#catalog-results')===before,`Medicamentos ${key} rejects 121 characters without mutation`);
  }
  await expanded.keyboard.press('Escape');
  await medicationCreate('x'.repeat(120),'y'.repeat(120));
  check(await expanded.locator('[data-catalog-edit]').count()===1,'Medicamentos accepts both exact 120-character boundaries');
  await expanded.locator('[data-master-delete]').click(); await expanded.locator('#master-delete-confirm').click();
  const literalMedicine='<img onerror=throw(1)>', literalDescription='Texto <script>throw(1)</script>';
  await medicationCreate(literalMedicine,literalDescription);
  check((await et('#catalog-results')).includes(literalMedicine) && await expanded.locator('#catalog-results img,#catalog-results script').count()===0,'Medicamentos plain text create is literal');
  const medicationSaved=await et('#catalog-results');
  await medicationCreate(` ${literalMedicine.toUpperCase()} `,'Duplicado');
  check((await et('#catalog-error')).includes('ya existe') && await et('#catalog-results')===medicationSaved,'Medicamentos trimmed case-insensitive duplicate rejects without mutation');
  await expanded.keyboard.press('Escape');
  await expanded.locator('[data-master-view]').click();
  check((await et('#master-detail-content')).includes(literalMedicine) && (await et('#master-detail-content')).includes(literalDescription),'Medicamentos actual detail contains name and description');
  await expanded.keyboard.press('Escape');
  for(const dismissal of ['cancel','escape']) {
    const before=await et('#catalog-results'); await expanded.locator('[data-catalog-edit]').click();
    await expanded.locator('#cat-description').fill('No guardar');
    if(dismissal==='cancel') await expanded.locator('#catalog-dialog [data-close]').click(); else await expanded.keyboard.press('Escape');
    check(await et('#catalog-results')===before,`Medicamentos edit ${dismissal} preserves saved list/count`);
  }
  const medicationId=await expanded.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
  await expanded.locator('[data-catalog-edit]').click(); await expanded.locator('#cat-description').fill('Descripción editada');
  check(await expanded.locator('#cat-name').getAttribute('maxlength')==='120' && await expanded.locator('#cat-description').getAttribute('maxlength')==='120','Medicamentos bounded name and description');
  await expanded.locator('#catalog-form button[type=submit]').click();
  check(await expanded.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===medicationId && (await et('#catalog-results')).includes('Descripción editada'),'Medicamentos update keeps stable identity');
  for(const dismiss of ['cancel','escape']) {
    const before=await et('#catalog-results'); await expanded.locator('[data-master-delete]').click();
    await expanded.locator('#master-delete-confirm').focus(); await expanded.keyboard.press('Tab');
    check(await expanded.locator('#master-delete-dialog [data-close]').evaluate(node=>node===document.activeElement),'Delete confirmation Tab wraps');
    if(dismiss==='cancel') await expanded.locator('#master-delete-dialog [data-close]').click(); else await expanded.keyboard.press('Escape');
    check(await et('#catalog-results')===before && await expanded.locator('[data-master-delete]').evaluate(node=>node===document.activeElement),`Medicamentos delete ${dismiss} preserves data and focus`);
  }
  await expanded.locator('[data-master-delete]').click(); await expanded.locator('#master-delete-confirm').click();
  check((await et('#catalog-results')).includes('Sin registrar'),'Medicamentos confirmed delete restores empty state');
  for(const id of ['diseases','allergyCatalog']) {
    await eg(id);
    await expanded.locator('[data-master-delete]').click(); await expanded.locator('#master-delete-confirm').click();
    check((await et('#view')).includes('no se aplican al paciente'), `Reference catalog distinguished: ${id}`);
    const create=async(name,description)=>{
      await expanded.locator('#catalog-add').click(); await expanded.locator('#cat-name').fill(name);
      await expanded.locator('#cat-description').fill(description); await expanded.locator('#catalog-form button[type=submit]').click();
    };
    const initial=await et('#catalog-results');
    await create('','');
    check((await et('#catalog-error')).includes('nombre') && await et('#catalog-results')===initial, `Reference required name rejects without mutation: ${id}`);
    await expanded.keyboard.press('Escape');
    await create('Referencia <demo>','Texto <b>literal</b>');
    check((await et('#catalog-results')).includes('Texto <b>literal</b>') && await expanded.locator('#catalog-results b').count()===0, `Safe reference create: ${id}`);
    const saved=await et('#catalog-results');
    await create(' referencia <DEMO> ','Duplicado');
    check((await et('#catalog-error')).includes('ya existe') && await et('#catalog-results')===saved, `Reference duplicate does not mutate: ${id}`);
    await expanded.keyboard.press('Escape');
    await expanded.locator('[data-catalog-edit]').click(); await expanded.locator('#cat-description').fill('Descripción editada');
    await expanded.locator('#catalog-form button[type=submit]').click();
    check((await et('#catalog-results')).includes('Descripción editada') && await expanded.locator('[data-catalog-edit]').count()===1, `Reference edit retains identity: ${id}`);
  }
  await eg('clinical'); await expanded.locator('#clinical-patient').selectOption('DEMO-001');
  check(await expanded.locator('[data-context-history]').innerText()===historyBefore && await habits().innerText()===habitText, 'Reference catalog edits never apply to patient data');
  await eg('settings'); await expanded.getByRole('tab',{name:'Navegación',exact:true}).click();
  for(const id of Object.keys(resourceMenus)) {
    check(await expanded.locator(`[data-nav-id="${id}"] input`).isChecked(), `New menu configurable: ${id}`);
    await expanded.locator(`[data-nav-id="${id}"] input`).uncheck();
  }
  await expanded.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  check(await expanded.locator('#navigation button').count()===9, 'Hide all eight new menus without hiding core, Pagos or tariffs');
  for(const id of Object.keys(resourceMenus)) await expanded.locator(`[data-nav-id="${id}"] input`).check();
  await expanded.locator('[data-nav-id="medications"] [data-move="up"]').click();
  await expanded.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  const menuOrder=await expanded.locator('#navigation button').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
  check(Object.keys(resourceMenus).every(id=>menuOrder.includes(id)) && menuOrder.indexOf('medications')<menuOrder.indexOf('allergyCatalog'), 'Show and reorder new menus');
  await eg('physicians'); await expanded.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await expanded.setViewportSize({width:390,height:844});
  await expanded.waitForFunction(()=>document.querySelector('#menu-toggle').getAttribute('aria-expanded')==='false');
  await expanded.locator('#menu-toggle').click();
  check(await expanded.locator('#sidebar').evaluate(node=>node.getBoundingClientRect().height<=innerHeight && node.scrollHeight>node.clientHeight), 'Long mobile navigation scrolls within viewport');
  await expanded.locator('#navigation button').last().focus(); await expanded.keyboard.press('Tab');
  check(await expanded.locator('#navigation button').first().evaluate(node=>node===document.activeElement), 'Expanded mobile navigation wraps from last menu to first');
  await expanded.keyboard.press('Escape');
  for(const id of Object.keys(resourceMenus)) {
    await eg(id); await noOverflow(expanded);
    {
      await adding(expanded,expanded.locator('#catalog-add'),`Agregar ${id==='laboratory'?'Laboratorio':id==='imaging'?'Imagen':id==='physicians'?'Médicos':id==='specialties'?'Especialidades':id==='rooms'?'Consultorios':id==='diseases'?'Enfermedades':id==='allergyCatalog'?'Alergias':'Medicamentos'}`);
      await expanded.locator('#catalog-add').click();
      await iconButtons(expanded);
      check(await expanded.locator('#catalog-form .dialog-actions').evaluate(node=>[...node.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect(), d=node.closest('dialog').getBoundingClientRect(); return button.textContent.trim() && r.left>=d.left && r.right<=d.right && button.scrollWidth<=button.clientWidth;})), `Mobile text modal footer wraps without clipping: ${id}`);
      check(await expanded.locator('#catalog-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), `Mobile narrow form: ${id}`);
      await expanded.locator('#catalog-form button[type=submit]').focus(); await expanded.keyboard.press('Tab');
      check(await expanded.locator('#cat-name').evaluate(node=>node===document.activeElement), `Mobile form keyboard wrap: ${id}`);
      await expanded.keyboard.press('Escape');
    }
  }
  await eg('clinical'); await expanded.locator('#clinical-patient').selectOption('DEMO-001');
  await editHabits('Borrador móvil'); await noOverflow(expanded);
  check(await expanded.locator('#habits-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile habits dialog fits');
  await expanded.keyboard.press('Escape');
  await eg('medications');
  await expanded.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  check(await expanded.locator('[id]').evaluateAll(nodes=>new Set(nodes.map(node=>node.id)).size===nodes.length), 'Context rendering has no duplicate DOM IDs');
  await expanded.reload(); await enterDemo(expanded); await eg('clinical');
  check(await habits().innerText()==='Sin registrar', 'Reload resets habits');
  // Full S13 CRUD on free records; public DOM only, independent fixtures.
  const masters=await openPage({width:1440,height:1000});
  const mt=selector=>masters.locator(selector).innerText();
  async function mg(route) { await masters.locator(`#navigation [data-page="${route}"]`).click(); await noProviderUI(masters); }
  async function mc(kind,mode) { await selectCatalog(masters,kind,mode); }
  async function submitMaster() { await masters.locator('#catalog-form button[type=submit]').click(); }
  async function detailMaster(row,name,detail) {
    await row.locator('[data-master-view]').click();
    const content=await mt('#master-detail-content');
    check(content.includes(name) && content.includes(detail), `Actual read/detail for ${name}: ${detail}`);
    await masters.locator('#master-detail-dialog [data-close]').focus(); await masters.keyboard.press('Tab');
    check(await masters.locator('#master-detail-dialog [data-close]').evaluate(node=>node===document.activeElement), 'Shared detail traps Tab');
    await masters.keyboard.press('Escape');
    check(await row.locator('[data-master-view]').evaluate(node=>node===document.activeElement), 'Shared detail restores initiating focus');
  }
  async function deleteFree(row,result,name) {
    const before=await mt(result);
    for(const dismiss of ['cancel','escape']) {
      await row.locator('[data-master-delete]').click();
      if(dismiss==='cancel') await masters.locator('#master-delete-dialog [data-close]').click(); else await masters.keyboard.press('Escape');
      check(await mt(result)===before, `${name} delete ${dismiss} does not mutate list/counter`);
    }
    await row.locator('[data-master-delete]').click(); await masters.locator('#master-delete-confirm').click();
    check(!await row.count() && !(await mt(result)).includes(name), `${name} confirmed free record deletion`);
  }
  const freeCases=[
    ['specialties','Libre especialidad',{},'ID interno:'],
    ['rooms','Libre consultorio',{location:'Ubicación libre'},'Ubicación libre'],
    ['physicians','Libre médico',{document:'LIBRE-MED'},'LIBRE-MED'],
    ['studyTypes','Libre laboratorio',{description:'Descripción libre'},'Descripción libre','LABORATORIO'],
    ['studyTypes','Libre imagen',{description:'Descripción libre'},'Descripción libre','IMAGEN'],
    ['procedures','Libre arancel',{price:'12.34'},'Bs 12,34'],
    ['diseases','Libre enfermedad',{description:'Referencia libre'},'Referencia libre'],
    ['allergyCatalog','Libre alergia',{description:'Referencia libre'},'Referencia libre']
  ];
  // Use the clinic references directly; no patient allergy data is inferred.
  for(const [kind,name,values,detail,mode] of freeCases) {
    if(kind==='physicians') {
      await mc('rooms'); await masters.locator('#catalog-add').click(); await masters.locator('#cat-name').fill('Sala de horario libre'); await submitMaster();
    }
    if(['diseases','allergyCatalog'].includes(kind)) await mg(kind); else await mc(kind,mode);
    const before=await mt('#catalog-results');
    await masters.locator('#catalog-add').click();
    await submitMaster();
    check(await masters.locator('#catalog-dialog').isVisible() && await mt('#catalog-results')===before, `${kind} invalid create preserves list and counter`);
    await masters.locator('#cat-name').fill(name);
    for(const [key,value] of Object.entries(values)) await masters.locator(`#cat-${key}`).fill(value);
    if(kind==='physicians') {
      await masters.getByLabel('Odontología general',{exact:true}).check();
      await masters.locator('.slot-room').selectOption({label:'Sala de horario libre'});
    }
    await submitMaster();
    const row=masters.locator('#catalog-results tbody tr').filter({hasText:name});
    check(await row.count()===1, `${kind} free record created`);
    const id=await row.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
    await detailMaster(row,name,detail);
    const created=await mt('#catalog-results');
    await row.locator('[data-catalog-edit]').click(); await masters.locator('#cat-name').fill(''); await submitMaster();
    check(await masters.locator('#catalog-dialog').isVisible() && await mt('#catalog-results')===created, `${kind} invalid edit retains exact list/count`);
    await masters.locator('#cat-name').fill(`${name} editado`); await submitMaster();
    check(await row.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===id && (await row.innerText()).includes('editado'), `${kind} update preserves stable ID`);
    await detailMaster(row,`${name} editado`,detail);
    await deleteFree(row,'#catalog-results',name);
    check(await mt('#catalog-results')===before, `${kind} CRUD cycle restores original list and count`);
    if(kind==='physicians') {
      // The free doctor's owned availability must not leave a dangling room dependency.
      await mc('rooms');
      const ownedRoom=masters.locator('#catalog-results tbody tr').filter({hasText:'Sala de horario libre'});
      await deleteFree(ownedRoom,'#catalog-results','Sala de horario libre');
      check((await mt('#catalog-results')).includes('Consultorio 1'), 'Free physician deletion cleans only owned availability, leaving other rooms and doctors');
    }
  }
  // Counter proof through consecutive publicly visible IDs around rejected operations.
  await mc('specialties');
  async function createCounter(name) {
    await masters.locator('#catalog-add').click(); await masters.locator('#cat-name').fill(name); await submitMaster();
    return Number((await masters.locator('#catalog-results tbody tr').filter({hasText:name}).locator('[data-catalog-edit]').getAttribute('data-catalog-edit')).split('-').at(-1));
  }
  const firstCounter=await createCounter('Contador A');
  await masters.locator('#catalog-add').click(); await masters.locator('#cat-name').fill(' contador a '); await submitMaster(); await masters.keyboard.press('Escape');
  await masters.locator('#catalog-add').click(); await masters.locator('#cat-name').fill('Descartado'); await masters.keyboard.press('Escape');
  await masters.locator('#catalog-results tbody tr').filter({hasText:'Odontología general'}).locator('[data-master-delete]').click(); await masters.locator('#master-delete-confirm').click(); await masters.keyboard.press('Escape');
  check(await createCounter('Contador B')===firstCounter+1, 'Rejected/abandoned saves and referenced deletion allocate no IDs');
  // Patient CRUD includes an empty stored context (the only permitted context cleanup).
  await mg('patients'); const directoryBefore=await mt('#patient-results');
  await masters.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
  await masters.locator('#patient-name').fill('Paciente libre'); await masters.locator('#patient-document').fill('FREE-001'); await masters.locator('#patient-form button[type=submit]').click();
  let patientRow=masters.locator('#patient-results tbody tr').filter({hasText:'FREE-001'});
  await detailMaster(patientRow,'Paciente libre','FREE-001');
  await patientRow.locator('[data-catalog-edit]').click(); await masters.locator('#cat-name').fill('P'); await submitMaster();
  check((await mt('#catalog-error')).includes('2 y 80') && (await mt('#patient-results')).includes('Paciente libre'), 'Patient invalid edit preserves directory');
  await masters.locator('#cat-name').fill('Paciente libre editado'); await masters.locator('#cat-note').fill('Nota libre'); await submitMaster();
  await detailMaster(patientRow,'Paciente libre editado','Nota libre');
  await patientRow.locator('[data-chart]').click(); await masters.locator('[data-habits-edit]').click(); await masters.locator('#habits-form button[type=submit]').click();
  await mg('patients'); await deleteFree(patientRow,'#patient-results','Paciente libre editado');
  check(await mt('#patient-results')===directoryBefore, 'Free patient CRUD restores original directory');
  // Context-only dependency blocks deletion even without appointments or orders.
  await masters.getByRole('button',{name:'Agregar Paciente',exact:true}).click(); await masters.locator('#patient-name').fill('Solo contexto'); await masters.locator('#patient-document').fill('CONTEXT-001'); await masters.locator('#patient-form button[type=submit]').click();
  const contextPatientId=await masters.locator('#patient-results tr').filter({hasText:'CONTEXT-001'}).locator('[data-chart]').getAttribute('data-chart');
  await masters.locator(`[data-chart="${contextPatientId}"]`).click(); await masters.locator('[data-habits-edit]').click(); await masters.locator('#habits-text').fill('Hábito humano'); await masters.locator('#habits-form button[type=submit]').click();
  await mg('patients'); const contextDirectory=await mt('#patient-results'); await masters.locator(`[data-master-delete="${contextPatientId}"]`).click(); await masters.locator('#master-delete-confirm').click();
  check((await mt('#master-delete-error')).includes('contexto') && await mt('#patient-results')===contextDirectory, 'Context-only patient deletion is protected'); await masters.keyboard.press('Escape');
  await masters.locator(`[data-chart="${contextPatientId}"]`).click(); check((await mt('[data-habits-summary]'))==='Hábito humano', 'Blocked deletion retains patient habits');
  await mg('inventory'); const inventoryBefore=await mt('#inventory-results');
  await masters.getByRole('button',{name:'Agregar insumo',exact:true}).click();
  await masters.locator('#cat-name').fill('Insumo <demo>'); await masters.locator('#cat-code').fill('FREE-INS');
  for(const [key,value] of [['stock','-1'],['stock','1.5'],['min','-1'],['min','2.5']]) {
    await masters.locator('#cat-stock').fill('2'); await masters.locator('#cat-min').fill('3'); await masters.locator(`#cat-${key}`).fill(value); await submitMaster();
    check((await mt('#catalog-error')).includes('enteros') && await mt('#inventory-results')===inventoryBefore, `Inventory invalid ${key}/${value} leaves rows and low count unchanged`);
  }
  await masters.locator('#cat-min').fill('3'); await masters.locator('#cat-stock').fill('2'); await masters.locator('#cat-code').fill('INS-01'); await submitMaster();
  check((await mt('#catalog-error')).includes('ya existe') && await mt('#inventory-results')===inventoryBefore, 'Inventory duplicate code rejected without mutation');
  await masters.locator('#cat-code').fill('FREE-INS'); await submitMaster();
  const itemRow=masters.locator('#inventory-results tbody tr').filter({hasText:'FREE-INS'});
  const itemId=await itemRow.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
  await detailMaster(itemRow,'Insumo <demo>','Cantidad: 2 · Umbral: 3');
  await itemRow.locator('[data-catalog-edit]').click(); await masters.locator('#cat-stock').fill('8'); await masters.locator('#cat-min').fill('4'); await masters.locator('#cat-name').fill('Insumo editado'); await submitMaster();
  check(await itemRow.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===itemId && (await itemRow.innerText()).includes('Disponible'), 'Inventory update retains ID and recomputes availability');
  await detailMaster(itemRow,'Insumo editado','Cantidad: 8 · Umbral: 4');
  await deleteFree(itemRow,'#inventory-results','Insumo editado'); check(await mt('#inventory-results')===inventoryBefore, 'Inventory CRUD restores original quantities/low count');
  await mg('settings'); await masters.getByRole('tab',{name:'Roles',exact:true}).click();
  const rolesBefore=await mt('#role-list');
  await masters.locator('[data-role="Administrador"] [data-master-delete]').click(); await masters.locator('#master-delete-confirm').click();
  check((await mt('#master-delete-error')).includes('Administrador activo') && await mt('#role-list')===rolesBefore, 'Active demo administrator removal protected'); await masters.keyboard.press('Escape');
  await masters.locator('#new-role').fill('Rol libre'); await masters.locator('#add-role').click();
  const roleRow=masters.locator('.role').filter({hasText:'Rol libre'});
  const roleId=await roleRow.locator('[data-catalog-edit]').getAttribute('data-catalog-edit');
  await detailMaster(roleRow,'Rol libre','Ninguno');
  await roleRow.locator('[data-catalog-edit]').click(); await masters.locator('#cat-name').fill('Paciente'); await submitMaster();
  check((await mt('#catalog-error')).includes('no un rol') && (await mt('#role-list')).includes('Rol libre'), 'Role edit rejects patient login role');
  await masters.locator('#cat-name').fill('Rol libre editado'); await submitMaster();
  await masters.getByRole('tab',{name:'Navegación',exact:true}).click(); await masters.locator('#navigation-role').selectOption(roleId);
  await masters.getByRole('checkbox',{name:'Acceder Agenda',exact:true}).check(); await masters.locator('#settings-form button[type=submit]').click();
  await masters.getByRole('tab',{name:'Roles',exact:true}).click();
  check(await roleRow.locator('[data-catalog-edit]').getAttribute('data-catalog-edit')===roleId && (await roleRow.innerText()).includes('1 / 17'), 'Role edit preserves stable ID and saves simulated menu grant');
  await detailMaster(roleRow,'Rol libre editado','Agenda'); await deleteFree(roleRow,'#role-list','Rol libre editado');
  check(await mt('#role-list')===rolesBefore, 'Role CRUD restores original staff roles');
  await mg('overview'); check((await masters.locator('[data-kpi]').allTextContents()).join('|')==='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00', 'All master CRUD leaves financial fixture untouched');
  await mg('medications'); await masters.locator('#catalog-add').click();
  await masters.locator('#cat-name').fill('Medicamento de ejemplo'); await masters.locator('#cat-description').fill('Referencia ficticia sin dosis ni indicaciones automáticas.'); await submitMaster();
  await mc('studyTypes','LABORATORIO'); await masters.locator('#catalog-add').click();
  await masters.locator('#cat-name').fill('Hemograma de ejemplo'); await masters.locator('#cat-description').fill('Solicitud ficticia sin cobro.'); await submitMaster();
  await iconButtons(masters);
  await masters.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await mc('studyTypes','IMAGEN'); await masters.locator('#catalog-add').click();
  await masters.locator('#cat-name').fill('Imagen de ejemplo'); await masters.locator('#cat-description').fill('Solicitud ficticia sin cobro.'); await submitMaster();
  check((await mt('#catalog-results')).includes('Imagen de ejemplo') && !(await mt('#catalog-results')).includes('Hemograma de ejemplo'), 'Final modality catalog isolation');
  await mg('medications');
  await masters.setViewportSize({width:390,height:844}); await noOverflow(masters);
  await iconButtons(masters);
  await masters.locator('.table-wrap').evaluate(node=>node.scrollLeft=node.scrollWidth);
  await tooltip(masters,masters.locator('[data-master-delete]').last(),'Eliminar');
  await noOverflow(masters);
  await masters.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  // S17/S19/S20 independent public-UI acceptance; legacy journeys above still enter visibly.
  const session=await openPage({width:1440,height:1000},{signedIn:false});
  const st=selector=>session.locator(selector).innerText();
  const sg=async route=>{
    if(await session.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await session.locator('#menu-toggle').click();
    await session.locator(`#navigation [data-page="${route}"]`).click();
    await noProviderUI(session);
  };
  const baseline='Bs 700,00|Bs 250,00|Bs 450,00|Bs 1.400,00';
  check(await session.locator('#login-screen').isVisible() && !await session.locator('#workspace').isVisible() && await session.locator('#workspace').getAttribute('inert')!==null, 'Initial login hides and makes workspace inert');
  check((await st('#login-screen')).includes('Inicio de sesión simulado · No ingreses credenciales reales') && await session.locator('#login-screen input').count()===0, 'No-credential login never solicits credentials');
  check(await session.getByRole('main').count()===1 && await session.getByRole('navigation').count()===0, 'Only login landmark exposed initially');
  await iconButtons(session); await noOverflow(session);
  await tooltip(session,session.getByRole('button',{name:'Entrar a la demo',exact:true}),'Entrar a la demo');
  await session.mouse.move(0,0); await session.locator('#login-title').focus(); await session.locator('#login-title').evaluate(node=>node.blur());
  await session.screenshot({path:fileURLToPath(new URL('login-desktop.png',import.meta.url)),fullPage:true});
  await session.setViewportSize({width:390,height:844}); await noOverflow(session);
  await session.screenshot({path:fileURLToPath(new URL('login-mobile.png',import.meta.url)),fullPage:true});
  await session.getByRole('button',{name:'Entrar a la demo',exact:true}).focus(); await session.keyboard.press('Enter');
  check(!await session.locator('#login-screen').isVisible() && await session.locator('#main').evaluate(node=>node===document.activeElement), 'Keyboard login enters workspace and focuses main');
  check(await session.getByRole('main').count()===1 && await session.getByRole('banner').count()===1 && await session.getByRole('navigation').count()===0, 'Mobile workspace exposes one main/header with drawer initially hidden');
  await session.locator('#menu-toggle').click();
  check(await session.getByRole('navigation').count()===1, 'Open mobile drawer exposes exactly one sidebar navigation');
  await session.keyboard.press('Escape');
  check(await session.getByRole('button',{name:'Cerrar sesión',exact:true}).isVisible(), 'Logout remains visible on mobile');
  await session.setViewportSize({width:1440,height:1000});
  await tooltip(session,session.getByRole('button',{name:'Cerrar sesión',exact:true}),'Cerrar sesión');
  await sg('expenses');
  check(await st('#page-title')==='Pagos' && (await st('#expense-results')).includes('Bs 250,00') && await session.locator('[data-expense-detail]').count()===1, 'Pagos has exactly one seeded outgoing fixture, separate from Cobros');
  const expenseOpen=async(concept='Gasto ficticio',amount='100',category='INSUMOS',note='')=>{
    await session.getByRole('button',{name:'Agregar egreso',exact:true}).click();
    await session.locator('#expense-concept').fill(concept); await session.locator('#expense-amount').fill(amount);
    if(category==='UNKNOWN') await session.locator('#expense-category').evaluate(node=>node.add(new Option('Desconocida','UNKNOWN')));
    await session.locator('#expense-category').selectOption(category); await session.locator('#expense-note').fill(note);
  };
  const expenseSubmit=()=>session.locator('#expense-form button[type=submit]').click();
  const expenseSnapshot=async()=>{
    await sg('overview'); const kpis=await session.locator('[data-kpi]').allTextContents(); const chart=await session.locator('.chart').getAttribute('aria-label');
    await sg('expenses'); return JSON.stringify({kpis,chart,rows:await st('#expense-results')});
  };
  async function expectTotals(expected,expenseBs) {
    await sg('overview');
    check((await session.locator('[data-kpi]').allTextContents()).join('|')===expected, 'Expense ledger updates only outgoing and net KPIs with exact cents');
    check((await session.locator('.chart').getAttribute('aria-label')).includes(`18 mayo, ingresos 700 Bs, egresos ${expenseBs} Bs`), 'Current chart bar uses same expense ledger');
    check(await session.locator('.chart rect').evaluateAll(nodes=>nodes.every(node=>Number(node.getAttribute('height'))>=0 && Number(node.getAttribute('y'))>=19)), 'Chart scale contains every outgoing bar without negative geometry');
    await noOverflow(session); await sg('expenses');
  }
  await expectTotals(baseline,250);
  await tooltip(session,session.getByRole('button',{name:'Agregar egreso',exact:true}),'Agregar egreso');
  await expenseOpen('<img onerror=throw(1)> Insumos','100','INSUMOS','Nota <b>literal</b>');
  check(await session.locator('#expense-date').inputValue()==='2026-05-18' && await session.locator('#expense-date').getAttribute('readonly')!==null, 'Expense date is visibly fixed and readonly');
  check(await session.locator('#expense-concept').getAttribute('maxlength')==='120' && await session.locator('#expense-note').getAttribute('maxlength')==='500', 'Concept and optional note have visible bounds');
  await iconButtons(session);
  await tooltip(session,session.locator('#expense-dialog [data-close]'),'Cancelar');
  check(await session.getByRole('button',{name:'Agregar egreso',exact:true}).evaluate(node=>node===document.activeElement), 'Expense Escape restores initiating focus');
  await expenseOpen('<img onerror=throw(1)> Insumos','100','INSUMOS','Nota <b>literal</b>');
  await session.locator('#expense-form button[type=submit]').dblclick();
  check(await st('#announcement')==='Egreso simulado registrado. Solo en memoria; sin dinero real.' && !await session.locator('#expense-dialog').isVisible(), 'Posting has exact simulated status and closes dialog');
  check(await session.locator('[data-expense-detail]').count()===2 && await session.locator('#expense-results img').count()===0, 'Duplicate posted submit cannot duplicate ledger; concept is literal');
  const firstExpenseId=await session.locator('[data-expense-detail]').last().getAttribute('data-expense-detail');
  await expectTotals('Bs 700,00|Bs 350,00|Bs 350,00|Bs 1.400,00',350);
  const savedExpense=await expenseSnapshot();
  for(const [concept,amount,category,note,error] of [
    ['Gasto','0','INSUMOS','','Introduce un importe positivo, con máximo dos decimales.'],
    ['Gasto','-1','INSUMOS','','Introduce un importe positivo, con máximo dos decimales.'],
    ['Gasto','1.001','INSUMOS','','Introduce un importe positivo, con máximo dos decimales.'],
    ['  ','10','INSUMOS','','Introduce un concepto de 1 a 120 caracteres.'],
    ['Gasto','10','UNKNOWN','','Selecciona una categoría válida.'],
    ['Gasto','90071992547409.91','INSUMOS','','El total de egresos excede el límite seguro de centavos.'],
    ['Gasto','90071992547410','INSUMOS','','Introduce un importe positivo, con máximo dos decimales.'],
    ['x'.repeat(121),'10','OTROS','','Introduce un concepto de 1 a 120 caracteres.'],
    ['Gasto','10','OTROS','n'.repeat(501),'La nota admite hasta 500 caracteres.']
  ]) {
    // Remove only public field length constraints to exercise submit-time validation.
    await session.getByRole('button',{name:'Agregar egreso',exact:true}).click();
    await session.locator('#expense-concept,#expense-note').evaluateAll(nodes=>nodes.forEach(node=>node.removeAttribute('maxlength')));
    await session.locator('#expense-concept').fill(concept); await session.locator('#expense-amount').fill(amount);
    if(category==='UNKNOWN') await session.locator('#expense-category').evaluate(node=>node.add(new Option('Desconocida','UNKNOWN')));
    await session.locator('#expense-category').selectOption(category); await session.locator('#expense-note').fill(note); await expenseSubmit();
    check(await session.locator('#expense-dialog').isVisible() && await st('#expense-error')===error, `Exact expense rejection: ${concept.slice(0,10)}/${amount}/${category}`);
    await session.keyboard.press('Escape');
    check(await expenseSnapshot()===savedExpense, 'Rejected expense preserves rows/count, current chart, income, outgoing, net and pending');
  }
  for(const dismissal of ['cancel','escape']) {
    await expenseOpen('Descartar egreso','25');
    await session.locator('#expense-form button[type=submit]').focus(); await session.keyboard.press('Tab');
    check(await session.locator('#expense-concept').evaluate(node=>node===document.activeElement), 'Expense dialog Tab wraps');
    await session.keyboard.press('Shift+Tab');
    check(await session.locator('#expense-form button[type=submit]').evaluate(node=>node===document.activeElement), 'Expense dialog reverse Tab wraps');
    if(dismissal==='cancel') await session.locator('#expense-dialog [data-close]').click(); else await session.keyboard.press('Escape');
    check(await expenseSnapshot()===savedExpense, `Expense ${dismissal} leaves ledger and money unchanged`);
  }
  await expenseOpen('Servicios ficticios','50.25','SERVICIOS_BASICOS'); await expenseSubmit();
  const secondExpenseId=await session.locator('[data-expense-detail]').last().getAttribute('data-expense-detail');
  check(Number(secondExpenseId.split('-').at(-1))===Number(firstExpenseId.split('-').at(-1))+1, 'Rejected/canceled/duplicate expense submissions allocate no IDs');
  await expectTotals('Bs 700,00|Bs 400,25|Bs 299,75|Bs 1.400,00',400.25);
  await session.locator('#expense-category-filter').selectOption('SERVICIOS_BASICOS'); await session.locator('#expense-search').fill('servicios');
  check(await session.locator('[data-expense-detail]').count()===1 && (await st('#expense-results')).includes('Bs 50,25'), 'Expense search and category filter combine');
  await session.locator('[data-expense-detail]').click();
  check((await st('#expense-detail-content')).includes(secondExpenseId) && (await st('#expense-detail-content')).includes('2026-05-18') && (await st('#expense-detail-content')).includes('Servicios básicos') && (await st('#expense-detail-content')).includes('Bs 50,25'), 'Expense details expose stable ID, date, category and exact amount');
  await iconButtons(session); await session.keyboard.press('Escape');
  check(await session.locator('[data-expense-detail]').evaluate(node=>node===document.activeElement), 'Expense detail restores focus');
  await session.locator('#expense-search').fill('missing'); check((await st('#expense-results')).includes('No hay egresos'), 'Expense filtered empty state');
  await sg('expenses'); await session.locator('[data-expense-detail]').nth(1).click();
  check((await st('#expense-detail-content')).includes('Nota <b>literal</b>') && await session.locator('#expense-detail-content b,#expense-detail-content img').count()===0, 'Expense detail safely displays optional note'); await session.keyboard.press('Escape');
  check(await session.locator('#view [data-master-delete],#view [data-catalog-edit]').count()===0, 'Posted expenses have no generic edit/delete');
  await session.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await session.setViewportSize({width:390,height:844}); await noOverflow(session);
  await expenseOpen('Borrador móvil','20'); await iconButtons(session); await noOverflow(session);
  check(await session.locator('#expense-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile expense dialog fits');
  check(await session.locator('#expense-dialog .dialog-actions').evaluate(node=>[...node.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect(), d=node.closest('dialog').getBoundingClientRect();return r.left>=d.left&&r.right<=d.right&&button.textContent.trim()===button.getAttribute('aria-label')&&button.scrollWidth<=button.clientWidth;})), 'Mobile financial footer retains readable text with no clipping');
  check(await session.locator('#expense-form button[type=submit]').evaluate(node=>{const r=node.getBoundingClientRect(),d=node.closest('dialog').getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom&&r.width>=44&&r.height>=44;}), 'Mobile expense confirmation remains visible with a touch-sized sticky action bar');
  await session.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true}); await session.keyboard.press('Escape');
  await session.setViewportSize({width:1440,height:1000});
  await expenseOpen('x'.repeat(120),'1000','ALQUILER','n'.repeat(500)); await expenseSubmit();
  await expectTotals('Bs 700,00|Bs 1.400,25|Bs -700,25|Bs 1.400,00',1400.25);
  await expenseOpen('Alto egreso','5000','OTROS'); await expenseSubmit();
  await expectTotals('Bs 700,00|Bs 6.400,25|Bs -5.700,25|Bs 1.400,00',6400.25);
  // Mutate each major state family, then logout must discard everything, including pending QR.
  await sg('patients'); await session.getByRole('button',{name:'Agregar Paciente',exact:true}).click();
  await session.locator('#patient-name').fill('Sesión ficticia'); await session.locator('#patient-document').fill('SESSION-001'); await session.locator('#patient-form button[type=submit]').click();
  await sg('laboratory'); await session.locator('#catalog-add').click(); await session.locator('#cat-name').fill('Laboratorio sesión'); await session.locator('#catalog-form button[type=submit]').click();
  await sg('settings'); await session.locator('#setting-clinic').fill('Clínica sesión');
  await session.getByRole('tab',{name:'Apariencia',exact:true}).click(); await session.locator('#setting-brand').selectOption('#0f766e'); await session.locator('#setting-density').selectOption('compact');
  await session.getByRole('tab',{name:'Roles',exact:true}).click(); await session.locator('#new-role').fill('Rol sesión'); await session.locator('#add-role').click();
  await session.getByRole('tab',{name:'Navegación',exact:true}).click(); await session.locator('[data-nav-id="inventory"] input').uncheck();
  await session.getByRole('button',{name:'Guardar cambios de demo',exact:true}).click();
  await sg('payments'); await session.locator('[data-pay="ORD-102"]').click(); await session.locator('#payment-amount').fill('200'); await session.locator('#payment-form button[type=submit]').click();
  await session.locator('[data-qr="ORD-102"]').click(); await session.locator('#qr-amount').fill('100'); await session.locator('#qr-form button[type=submit]').click();
  check((await st('#qr-state')).includes('PENDIENTE'), 'Session has pending QR before logout'); await session.keyboard.press('Escape');
  await session.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await session.waitForURL(htmlURL.href); await session.locator('#login-screen').waitFor();
  check(!await session.locator('#workspace').isVisible() && await session.locator('dialog[open]').count()===0 && await session.locator('#view').innerHTML()==='', 'Logout resets document with no previous workspace content or open dialog');
  await enterDemo(session);
  check((await session.locator('[data-kpi]').allTextContents()).join('|')===baseline && await st('#clinic-name')==='Clínica Dental Andina' && await session.locator('#navigation button').count()===17, 'Re-entry restores money, clinic and full menu fixtures');
  check(await session.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--action').trim()==='#0369a1' && !document.body.dataset.density), 'Logout resets theme and density preferences');
  await sg('settings'); await session.getByRole('tab',{name:'Roles',exact:true}).click();
  check((await session.locator('.role h3').allTextContents()).join('|')==='Administrador|Recepcionista|Médico', 'Logout resets custom roles and preserves baseline administrator');
  await sg('expenses'); check(await session.locator('[data-expense-detail]').count()===1, 'Logout discards all posted expenses');
  await sg('patients'); check(!(await st('#patient-results')).includes('SESSION-001') && await session.locator('#patient-results tbody tr').count()===3, 'Logout discards patient creation');
  await sg('laboratory'); check(!(await st('#catalog-results')).includes('Laboratorio sesión') && await session.locator('[data-catalog-edit="FIX-LAB"]').count()===1, 'Logout discards changes and restores the fictional catalog baseline');
  await sg('payments'); check(await session.locator('[data-receipt]').count()===0 && (await st('#order-results')).includes('Bs 800,00'), 'Logout discards cash payments and receipts');
  await session.locator('[data-qr="ORD-102"]').click(); check(await session.locator('#qr-intent-id').count()===0 && (await st('#qr-state')).includes('No hay un intento'), 'Logout discards pending QR without confirming it'); await session.keyboard.press('Escape');
  await session.setViewportSize({width:390,height:844});
  check(await session.getByRole('button',{name:'Cerrar sesión',exact:true}).isVisible(), 'Mobile logout still available after re-entry');
  await session.getByRole('button',{name:'Cerrar sesión',exact:true}).click(); await session.locator('#login-screen').waitFor();
  await enterDemo(session); await session.reload();
  check(await session.locator('#login-screen').isVisible() && !await session.locator('#workspace').isVisible(), 'Ordinary HTTP reload returns to simulated login');
  // S27 independent public-UI journey, preserving every business scenario above.
  const access=await openPage({width:1440,height:1000});
  const at=selector=>access.locator(selector).innerText();
  const profile=()=>access.getByRole('combobox',{name:'Simular rol',exact:true});
  const ag=async route=>{
    if(await access.locator('#menu-toggle').getAttribute('aria-expanded')==='false') await access.locator('#menu-toggle').click();
    await access.locator(`#navigation [data-page="${route}"]`).click();
  };
  const roleTab=async()=>{await ag('settings');await access.getByRole('tab',{name:'Roles',exact:true}).click();};
  const editRole=async id=>{
    await access.getByRole('tab',{name:'Navegación',exact:true}).click();
    await access.locator('#navigation-role').selectOption(id);
  };
  const grant=id=>access.locator(`#navigation-permissions input[name="menu-access"][value="${id}"]`);
  const saveRole=async()=>{
    await access.locator('#settings-form button[type=submit]').click();
    if(await access.locator('#settings-form').count() && !await at('#settings-error')) await access.getByRole('tab',{name:'Roles',exact:true}).click();
  };
  const visibleMenus=()=>access.locator('#navigation button').evaluateAll(nodes=>nodes.map(node=>node.dataset.page));
  const roleSnapshot=async()=>{
    await roleTab(); await editRole('ROLE-1');
    const snapshot=JSON.stringify({name:await profile().locator('option[value="ROLE-1"]').innerText(),matrix:await access.locator('#navigation-permissions [name="menu-access"]').evaluateAll(nodes=>nodes.map(node=>[node.value,node.checked]))});
    await access.getByRole('tab',{name:'Roles',exact:true}).click(); return snapshot;
  };
  check(await profile().inputValue()==='ROLE-1' && await access.locator('#navigation button').count()===17, 'Initial simulated Administrator sees all 17 menus');
  check((await at('#profile-help')).includes('No es autenticación') && await profile().getAttribute('aria-describedby')==='profile-help', 'Profile selector explicitly describes demo-only inspection');
  await roleTab();
  for(const [id,count] of [['ROLE-1',17],['ROLE-2',5],['ROLE-3',4]]) {
    await editRole(id);
    check(await access.locator('#navigation-permissions [name="menu-access"]').count()===17 && await access.locator('#navigation-permissions [name="menu-access"]:checked').count()===count, `All 17 explicit menu grants for ${id}`);
    const menuIDs=await access.locator('#navigation-permissions [name="menu-access"]').evaluateAll(nodes=>nodes.map(node=>node.value));
    check(new Set(menuIDs).size===17 && menuIDs.every(id=>Object.hasOwn(navMotifs,id)), 'Matrix uses unique stable menu IDs');
    for(const control of await access.locator('#navigation-permissions [name="menu-access"]').all()) check((await control.getAttribute('aria-label')).startsWith('Acceder '), 'Each menu checkbox is explicitly labeled Acceder');
    await iconButtons(access); await access.keyboard.press('Escape');
  }
  const unchangedRole=await roleSnapshot();
  for(const dismissal of ['target-switch','navigate-away']) {
    await editRole('ROLE-1'); await grant('inventory').uncheck();
    if(dismissal==='target-switch') await access.locator('#navigation-role').selectOption('ROLE-2'); else await ag('overview');
    check(await roleSnapshot()===unchangedRole && await access.locator('#navigation button').count()===17, `Permission draft ${dismissal} preserves matrix and navigation`);
  }
  await editRole('ROLE-1'); await grant('inventory').uncheck(); await saveRole();
  check(await access.locator('#navigation [data-page="inventory"]').count()===0 && await at('#page-title')==='Configuración', 'Saved revocation immediately filters navigation without losing allowed current view');
  await editRole('ROLE-1'); await grant('inventory').check(); await saveRole();
  check(await access.locator('#navigation [data-page="inventory"]').count()===1, 'Saved grant immediately restores a personally visible menu');
  // Counter proof surrounds last-Administrator rejection and abandoned saves.
  await access.locator('#new-role').fill('Contador acceso A'); await access.locator('#add-role').click();
  const counterA=await access.locator('[data-role="Contador acceso A"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  const protectedRoles=await access.locator('#role-list').textContent(), protectedProfile=await profile().innerHTML(), adminBefore=await roleSnapshot();
  await editRole('ROLE-1'); await grant('settings').uncheck(); await saveRole();
  check(await at('#settings-error')==='El último Administrador debe conservar Acceder a Configuración.' && await access.locator('#panel-navigation').isVisible() && !await grant('settings').isChecked(), 'Last Administrator revocation explicitly rejects, never silently rechecks draft');
  check(await access.locator('#role-list').textContent()===protectedRoles && await profile().innerHTML()===protectedProfile && await access.locator('#navigation button').count()===17, 'Rejected revocation leaves records, role IDs, profile and navigation unchanged');
  await access.keyboard.press('Escape'); check(await roleSnapshot()===adminBefore, 'Rejected save leaves the stored complete matrix unchanged');
  await access.locator('#new-role').fill('Contador acceso B'); await access.locator('#add-role').click();
  const counterB=await access.locator('[data-role="Contador acceso B"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  check(Number(counterB.split('-').at(-1))===Number(counterA.split('-').at(-1))+1, 'Rejected role save consumes no public IDs');
  await ag('overview'); check((await access.locator('[data-kpi]').allTextContents()).join('|')===baseline, 'Role validation and grant edits leave money unchanged');
  for(const [id,menus] of [['ROLE-2',['overview','payments','expenses','patients','agenda']],['ROLE-3',['overview','patients','agenda','clinical']]]) {
    await profile().selectOption(id);
    check(JSON.stringify(await visibleMenus())===JSON.stringify(menus) && !await access.locator('#navigation [data-page="settings"]').count(), `Conservative configurable demo seeds: ${id}`);
  }
  // S28 removes forbidden financial shortcuts entirely. Preserve the S27 central
  // crosslink guard proof with the independently authorized agenda content block.
  check(!await access.locator('#view [data-page="payments"]').count(),'S28 Médico has no financial shortcut to invoke');
  await profile().selectOption('ROLE-1'); await roleTab(); await editRole('ROLE-3'); await grant('agenda').uncheck(); await saveRole();
  await profile().selectOption('ROLE-3'); await ag('overview');
  await access.locator('#view [data-page="agenda"]').click();
  check(await at('#page-title')==='Resumen' && await at('#announcement')==='Menú no disponible para este perfil de demostración.', 'Central guard rejects overview-to-Agenda crosslink despite agenda content capability');
  await profile().selectOption('ROLE-1'); await roleTab(); await editRole('ROLE-3'); await grant('agenda').check(); await saveRole();
  await profile().selectOption('ROLE-2'); await ag('patients');
  const directory=await at('#patient-results');
  await access.locator('[data-chart="DEMO-001"]').click();
  check(await at('#page-title')==='Pacientes' && await at('#patient-results')===directory && !await access.locator('#clinical-patient').count(), 'Restricted patient chart crosslink neither renders clinical page nor throws');
  await ag('agenda'); const agendaBefore=await at('#agenda-results');
  await access.locator('[data-attend="AP-1"]').click();
  check(await at('#agenda-results')===agendaBefore && !await access.locator('#consultation-record').count(), 'Restricted start-consultation crosslink leaves appointment and consultation unchanged');
  await profile().selectOption('ROLE-1'); await roleTab();
  await access.locator('#new-role').fill('Inspector sin módulos'); await access.locator('#add-role').click();
  const customID=await access.locator('[data-role="Inspector sin módulos"] [data-catalog-edit]').getAttribute('data-catalog-edit');
  await editRole(customID); check(await access.locator('#navigation-permissions [name="menu-access"]:checked').count()===0, 'New custom role defaults to all false; no inherited grants'); await access.keyboard.press('Escape');
  await profile().selectOption(customID);
  check(await at('#page-title')==='Sin módulos disponibles' && await access.locator('#navigation button,#page-actions button').count()===0 && (await at('#view')).includes('Simular rol'), 'Empty role clears stale settings/actions and offers selector recovery, not forbidden Resumen');
  await noOverflow(access);
  await access.setViewportSize({width:390,height:844}); await profile().focus();
  await access.locator('#menu-toggle').click();
  check(await access.locator('#menu-toggle').getAttribute('aria-expanded')==='false' && await profile().evaluate(node=>node===document.activeElement), 'Empty mobile drawer safely returns focus to always-available profile selector');
  await noOverflow(access); await profile().selectOption('ROLE-1');
  check(await access.locator('#navigation button').count()===17 && await at('#page-title')==='Resumen', 'Mobile selector intentionally restores demo Administrator');
  await access.setViewportSize({width:1440,height:1000});
  await access.waitForFunction(()=>document.querySelector('#menu-toggle').getAttribute('aria-expanded')==='true');
  await roleTab();
  await access.locator(`[data-catalog-edit="${customID}"]`).click();
  await access.locator('#cat-name').fill('Inspector renombrado'); await access.locator('#catalog-form button[type=submit]').click();
  await editRole(customID); await grant('settings').check(); await grant('patients').check(); await saveRole();
  check(await access.locator('[data-role="Inspector renombrado"] [data-catalog-edit]').getAttribute('data-catalog-edit')===customID && await profile().locator(`option[value="${customID}"]`).innerText()==='Inspector renombrado', 'Rename preserves stable ID and updates profile options');
  await profile().selectOption(customID);
  check(JSON.stringify(await visibleMenus())===JSON.stringify(['patients','settings']) && await at('#page-title')==='Configuración', 'Role switching preserves permitted current view, no implicit missing grants');
  await access.getByRole('tab',{name:'Roles',exact:true}).click();
  const activeRoleList=await at('#role-list');
  await access.locator(`[data-master-delete="${customID}"]`).click(); await access.locator('#master-delete-confirm').click();
  check((await at('#master-delete-error')).includes('perfil actualmente simulado') && await profile().inputValue()===customID && await at('#role-list')===activeRoleList, 'Deleting the actively simulated custom role rejects without switching profile');
  await access.keyboard.press('Escape');
  await editRole(customID); await grant('settings').uncheck(); await saveRole();
  check(await at('#page-title')==='Pacientes' && JSON.stringify(await visibleMenus())===JSON.stringify(['patients']) && !await access.locator('#settings-form').count(), 'Revoking current Configuration routes to first permitted page; never force-visible');
  await profile().selectOption('ROLE-1'); await roleTab();
  await editRole(customID); await grant('settings').check(); await grant('inventory').check(); await saveRole();
  await access.getByRole('tab',{name:'Navegación',exact:true}).click(); await access.locator('[data-nav-id="inventory"] input').uncheck(); await access.locator('#settings-form button[type=submit]').click();
  await profile().selectOption(customID);
  check(!await access.locator('#navigation [data-page="inventory"]').count(), 'Role grant cannot unhide personal hidden menu');
  await access.getByRole('tab',{name:'Roles',exact:true}).click(); await editRole(customID); await grant('inventory').uncheck(); await saveRole();
  await access.getByRole('tab',{name:'Navegación',exact:true}).click(); await access.locator('[data-nav-id="inventory"] input').check(); await access.locator('#settings-form button[type=submit]').click();
  check(!await access.locator('#navigation [data-page="inventory"]').count(), 'Personal visible preference cannot bypass false role grant');
  await access.getByRole('tab',{name:'Roles',exact:true}).click(); await editRole(customID); await grant('patients').uncheck(); await grant('settings').uncheck(); await saveRole();
  check(await at('#page-title')==='Sin módulos disponibles' && await access.locator('#navigation button').count()===0, 'Revoking final current role grants enters no-modules state');
  await profile().selectOption('ROLE-1'); await roleTab();
  await access.locator(`[data-master-view="${customID}"]`).click();
  check(await access.locator('#master-detail-content [data-menu-access]').count()===17 && (await at('#master-detail-content')).includes(customID), 'Role detail shows every menu grant and stable ID');
  await access.keyboard.press('Escape');
  await access.locator(`[data-master-delete="${customID}"]`).click(); await access.locator('#master-delete-confirm').click();
  check(!await profile().locator(`option[value="${customID}"]`).count(), 'Confirmed inactive custom role deletion refreshes selector');
  await editRole('ROLE-2'); await grant('laboratory').check(); await saveRole();
  await profile().selectOption('ROLE-2'); await access.reload(); await enterDemo(access);
  check(await profile().inputValue()==='ROLE-1' && await access.locator('#navigation button').count()===17, 'Reload restores initial Administrator and all menu grants');
  await roleTab(); await editRole('ROLE-2'); check(!await grant('laboratory').isChecked(), 'Reload resets edited seeded role matrix'); await access.keyboard.press('Escape');
  await editRole('ROLE-1'); await grant('inventory').uncheck(); await saveRole(); await profile().selectOption('ROLE-3');
  await access.locator('#logout').click(); await access.locator('#login-screen').waitFor(); await enterDemo(access);
  check(await profile().inputValue()==='ROLE-1' && await access.locator('#navigation button').count()===17 && (await access.locator('[data-kpi]').allTextContents()).join('|')===baseline, 'Logout/re-entry resets profile, grants and money together');
  await roleTab(); await editRole('ROLE-2'); await iconButtons(access);
  await access.screenshot({path:fileURLToPath(new URL('desktop.png',import.meta.url)),fullPage:true});
  await access.setViewportSize({width:390,height:844}); await noOverflow(access);
  check(await access.locator('#navigation-permissions').evaluate(node=>node.scrollWidth<=node.clientWidth), 'Mobile 17-menu matrix fits Navigation width');
  await access.getByRole('tab',{name:'Roles',exact:true}).click(); await access.locator('[data-catalog-edit="ROLE-2"]').click();
  await access.locator('#catalog-form button[type=submit]').scrollIntoViewIfNeeded();
  check(await access.locator('#catalog-form .dialog-actions').evaluate(node=>[...node.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect(),d=node.closest('dialog').getBoundingClientRect();return button.textContent.trim()===button.getAttribute('aria-label') && r.left>=d.left && r.right<=d.right && button.scrollWidth<=button.clientWidth;})), 'Mobile role footer has readable, unclipped Guardar/Cancelar text');
  await access.locator('#catalog-form button[type=submit]').focus(); await access.keyboard.press('Tab');
  check(await access.locator('#cat-name').evaluate(node=>node===document.activeElement), 'Mobile identity-only role modal Tab wraps to name');
  await access.keyboard.press('Shift+Tab');
  check(await access.locator('#catalog-form button[type=submit]').evaluate(node=>node===document.activeElement), 'Mobile identity-only role modal reverse Tab wraps to Guardar');
  await access.screenshot({path:fileURLToPath(new URL('mobile.png',import.meta.url)),fullPage:true});
  await access.keyboard.press('Escape');
  for (const context of contexts) for (const item of context.pages()) check(await item.evaluate(()=>window.demoViolations.length) === 0, 'No API or storage writes');
  check(documents.length > 0, 'Full business suite loaded documents through owned HTTP preview');
  check(network.length === 0 && operations.length === 0, `No external/API requests or storage writes: ${network.join(', ')} ${operations.join(', ')}`);
  check(errors.length === 0, `No page errors: ${errors.join(', ')}`);
  console.log(`PASS ${checks} checks · 1440×1000 + 390×844 · screenshots: desktop.png, mobile.png, login-desktop.png, login-mobile.png · allowed local HTML document loads: ${documents.length} · external/API/storage writes: 0 · page errors: 0`);
} finally {
  try {
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
  } finally {
    if (preview) await preview.close();
  }
}
