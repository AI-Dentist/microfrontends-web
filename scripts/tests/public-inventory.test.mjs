import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generatePublicRelease } from '../platform-artifacts.mjs';
import { createPublicInventory } from '../erp-public-inventory.mjs';

// Publisher declaration is not a security boundary against its publisher.
// This fixture models the supported init option; it does not prove production
// runtime binding. Resource completion and active-client guard readiness are
// separate gates; a release candidate must never claim runtime readiness.
const hash = value => createHash('sha256').update(value).digest('hex');
const shellBaseUrl = 'https://shell.example/';
const erpBaseUrl = 'https://erp.example/v1/';
const expression = 'import(TrustedTypes.createScriptURL(target))';
const files = {
  shell: {
    'index.html': '<script type="module" src="main.js"></script>',
    'main.js': 'import { initFederation } from "./runtime.js"; import { guard } from "./guard.js"; initFederation({}, { loadModuleFn: guard });',
    'guard.js': `const targets = new Set([${JSON.stringify(shellBaseUrl + 'main.js')}, ${JSON.stringify(shellBaseUrl + 'runtime.js')}, ${JSON.stringify(shellBaseUrl + 'guard.js')}, ${JSON.stringify(shellBaseUrl + 'extra.js')}, ${JSON.stringify(erpBaseUrl + 'routes.js')}, ${JSON.stringify(erpBaseUrl + 'shared.js')}]); export const guard = target => { if (!targets.has(target)) throw Error('Unknown target'); return globalThis.importShim(target); };`,
    'runtime.js': `export function initFederation(remotes, options = {}) { const fallback = target => ${expression}; return { loadModuleFn: options.loadModuleFn ?? fallback }; }`,
    'extra.js': 'export const extra = true;',
    'remoteEntry.json': JSON.stringify({ $version: 'v4', name: 'shell', shared: [], exposes: [] }),
  },
  erp: {
    'remoteEntry.json': JSON.stringify({ $version: 'v4', name: 'erp', shared: [{ packageName: 'shared', entries: { shared: 'shared.js' } }], exposes: [{ key: './Routes', outFileName: 'routes.js' }] }),
    'routes.js': 'import "./shared.js";', 'shared.js': 'export {};', 'styles.css': 'body { color: red }',
  },
};
const config = () => ({ schemaVersion: 1, remotes: [
  { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation', entry: `${erpBaseUrl}remoteEntry.json`, styles: `${erpBaseUrl}styles.css`, apiBaseUrl: '/api/erp/graphql' },
  { id: 'operations', label: 'Operations', basePath: '/operations', kind: 'module', entry: 'https://ops.example/remote.js', styles: 'https://ops.example/remote.css', apiBaseUrl: '/api/operations' },
  { id: 'clinical', label: 'Clinical', basePath: '/clinical', kind: 'module', entry: 'https://clinical.example/remote.js', styles: 'https://clinical.example/remote.css', apiBaseUrl: '/api/clinical' },
] });
const mime = name => name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript';
const canonical = inventory => JSON.stringify({ schemaVersion: inventory.schemaVersion, attestation: inventory.attestation, roots: inventory.roots, loaderSites: inventory.loaderSites });
function sign(inventory) { inventory.buildId = hash(canonical(inventory)); }
async function fixture(t) {
  const base = await mkdtemp(fileURLToPath(new URL('./.public-inventory-', import.meta.url)));
  t.after(() => rm(base, { recursive: true, force: true }));
  const shellDir = join(base, 'shell'), erpDir = join(base, 'erp');
  await Promise.all([mkdir(shellDir), mkdir(erpDir)]);
  for (const [root, directory] of [['shell', shellDir], ['erp', erpDir]]) {
    for (const [name, contents] of Object.entries(files[root])) await writeFile(join(directory, name), contents);
  }
  const roots = ['shell', 'erp'].map(root => ({ root, baseUrl: root === 'shell' ? shellBaseUrl : erpBaseUrl,
    files: Object.entries(files[root]).map(([path, contents]) => ({ path, sha256: hash(contents), mime: mime(path) })) }));
  const inventory = { schemaVersion: 1, attestation: 'publisher-public-complete-v1', roots, loaderSites: [{ root: 'shell', path: 'runtime.js', moduleSha256: hash(files.shell['runtime.js']), expressionSha256: hash(expression), adapter: 'native-federation-load-module-v1' }] };
  sign(inventory);
  return { base, shellDir, erpDir, shellBaseUrl, erpBaseUrl, config: config(), inventory };
}
async function snapshot(dir) {
  const result = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(path) : entry.isSymbolicLink() ? 'symlink' : hash(await readFile(path));
  }
  return result;
}
async function rejectsUnchanged(options) {
  const before = await snapshot(options.base);
  await assert.rejects(() => generatePublicRelease(options));
  assert.deepEqual(await snapshot(options.base), before, 'rejection must not alter build files');
}

test('attested finite native graph includes declared assets and has deterministic content-bound version', async t => {
  const o = await fixture(t);
  const result = await generatePublicRelease(o);
  assert.match(result.version, /^[a-f0-9]{64}$/);
  assert.deepEqual(await generatePublicRelease(o), result);
  for (const root of o.inventory.roots) for (const file of root.files) {
    const asset = result.assets.find(a => a.url === root.baseUrl + file.path);
    assert.ok(asset, `${root.root}/${file.path}`);
    assert.equal(asset.sha256, file.sha256);
  }
  assert.ok(result.assets.some(a => a.url === shellBaseUrl + 'extra.js'));
  const targets = o.inventory.roots.flatMap(root => root.files.filter(file => file.mime === 'text/javascript').map(file => root.baseUrl + file.path)).sort();
  assert.deepEqual(result.runtimePolicy, { adapter: 'native-federation-load-module-v1', targets });
  assert.equal(Object.hasOwn(result, 'runtimeReady'), false);
  const changed = structuredClone(o);
  changed.config.remotes[0].label = 'ERP changed';
  assert.notEqual((await generatePublicRelease(changed)).version, result.version);
});

test('publisher creates inventory from explicit files of both build roots', async t => {
  const o = await fixture(t);
  const roots = o.inventory.roots.map(root => ({ root: root.root, baseUrl: root.baseUrl, directory: root.root === 'shell' ? o.shellDir : o.erpDir, files: root.files.map(file => file.path) }));
  const inventory = await createPublicInventory({ roots, loaderSites: o.inventory.loaderSites, attestation: 'publisher-public-complete-v1' });
  assert.deepEqual(inventory, o.inventory);
  assert.deepEqual(await generatePublicRelease({ ...o, inventory }), await generatePublicRelease(o));
  await assert.rejects(() => createPublicInventory({ roots, loaderSites: [], attestation: 'not-attested' }), /attestation/);
});

test('invalid inventory rejects before literal graph traversal', async t => {
  const o = await fixture(t);
  await writeFile(join(o.shellDir, 'runtime.js'), 'export {};');
  o.inventory.roots[0].files.find(f => f.path === 'runtime.js').sha256 = hash('export {};');
  o.inventory.loaderSites = [];
  o.inventory.attestation = 'not-attested'; sign(o.inventory);
  const before = await snapshot(o.base);
  await assert.rejects(() => generatePublicRelease(o), /inventory attestation/i);
  assert.deepEqual(await snapshot(o.base), before);
});

test('native options-provider factory declared fallback yields conditional candidate', async t => {
  const o = await fixture(t);
  const expression = 'import(policy(name).createScriptURL(target))';
  const contents = `export const provider = (name = 'nfo') => ({ loadModuleFn: target => ${expression}, setImportMapFn: map => map, reloadBrowserFn: () => {} });`;
  await writeFile(join(o.shellDir, 'runtime.js'), contents);
  o.inventory.roots[0].files.find(f => f.path === 'runtime.js').sha256 = hash(contents);
  Object.assign(o.inventory.loaderSites[0], { moduleSha256: hash(contents), expressionSha256: hash(expression) }); sign(o.inventory);
  const result = await generatePublicRelease(o);
  assert.equal(result.runtimePolicy.adapter, 'native-federation-load-module-v1');
  assert.equal(Object.hasOwn(result, 'runtimeReady'), false);
});

test('CLI accepts inventory candidate and rejects invalid inventory before output', async t => {
  const o = await fixture(t), configPath = join(o.base, 'config.json'), inventoryPath = join(o.base, 'inventory.json'), output = join(o.base, 'release.json');
  await writeFile(configPath, JSON.stringify(o.config)); await writeFile(inventoryPath, JSON.stringify(o.inventory));
  const args = ['scripts/platform-artifacts.mjs', '--shell-dir', o.shellDir, '--erp-dir', o.erpDir, '--shell-base-url', shellBaseUrl, '--erp-base-url', erpBaseUrl, '--config', configPath, '--output', output, '--inventory', inventoryPath];
  const run = () => spawnSync(process.execPath, args, { encoding: 'utf8' });
  const success = run(); assert.equal(success.status, 0, success.stderr); assert.equal(success.stdout, ''); assert.equal(success.stderr, '');
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), await generatePublicRelease(o));
  const badOutput = join(o.base, 'invalid-release.json'); args[args.indexOf(output)] = badOutput;
  o.inventory.attestation = 'invalid'; sign(o.inventory); await writeFile(inventoryPath, JSON.stringify(o.inventory));
  const rejected = run(); assert.equal(rejected.status, 1); assert.equal(rejected.stdout, ''); assert.match(rejected.stderr, /inventory attestation/i);
  await assert.rejects(() => readFile(badOutput), { code: 'ENOENT' });
});

test('strict baseline rejects computed imports without inventory', async t => {
  const o = await fixture(t); delete o.inventory;
  await rejectsUnchanged(o);
});

test('inventory does not authorize an undesignated computed import', async t => {
  const o = await fixture(t);
  const contents = 'export const arbitrary = x => import(x);';
  await writeFile(join(o.erpDir, 'routes.js'), contents);
  o.inventory.roots[1].files.find(f => f.path === 'routes.js').sha256 = hash(contents);
  sign(o.inventory);
  await rejectsUnchanged(o);
});

test('inventory rejects a declared computed site without the adapter option contract', async t => {
  const o = await fixture(t);
  const contents = `export const load = target => ${expression};`;
  await writeFile(join(o.shellDir, 'runtime.js'), contents);
  o.inventory.roots[0].files.find(f => f.path === 'runtime.js').sha256 = hash(contents);
  o.inventory.loaderSites[0].moduleSha256 = hash(contents);
  sign(o.inventory);
  await rejectsUnchanged(o);
});

for (const [name, mutate] of [
  ['missing publisher attestation', o => { delete o.inventory.attestation; sign(o.inventory); }],
  ['stale file digest', o => { o.inventory.roots[0].files[0].sha256 = '0'.repeat(64); sign(o.inventory); }],
  ['arbitrary build id', o => { o.inventory.buildId = '1'.repeat(64); }],
  ['duplicate root', o => { o.inventory.roots.push(structuredClone(o.inventory.roots[0])); sign(o.inventory); }],
  ['unknown schema key', o => { o.inventory.token = 'synthetic'; sign(o.inventory); }],
  ['unknown external base', o => { o.inventory.roots[1].baseUrl = 'https://unknown.example/'; sign(o.inventory); }],
  ['authentication path', o => { o.inventory.roots[1].files[1].path = 'auth/session.js'; sign(o.inventory); }],
  ['API path', o => { o.inventory.roots[1].files[1].path = 'api/data.js'; sign(o.inventory); }],
  ['source map', o => { o.inventory.roots[1].files[1].path = 'routes.js.map'; sign(o.inventory); }],
  ['private filename', o => { o.inventory.roots[1].files[1].path = 'private-config.js'; sign(o.inventory); }],
  ['MIME masquerade', o => { o.inventory.roots[1].files[1].mime = 'image/png'; sign(o.inventory); }],
  ['missing declared federation target', o => { o.inventory.roots[1].files = o.inventory.roots[1].files.filter(f => f.path !== 'shared.js'); sign(o.inventory); }],
  ['mismatched loader module digest', o => { o.inventory.loaderSites[0].moduleSha256 = '0'.repeat(64); sign(o.inventory); }],
  ['mismatched loader expression digest', o => { o.inventory.loaderSites[0].expressionSha256 = '0'.repeat(64); sign(o.inventory); }],
]) test(`inventory rejects ${name} without output changes`, async t => {
  const o = await fixture(t); mutate(o);
  const before = await snapshot(o.base);
  await assert.rejects(() => generatePublicRelease(o), error => {
    assert.doesNotMatch(error.message, /Unresolved computed import/);
    return true;
  });
  assert.deepEqual(await snapshot(o.base), before);
});

test('inventory rejects a declared symlink escaping its root', async t => {
  const o = await fixture(t);
  try { await symlink(join(o.shellDir, 'extra.js'), join(o.erpDir, 'escape.js')); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip(`symlink unavailable: ${error.code}`); return; } throw error; }
  o.inventory.roots[1].files.push({ path: 'escape.js', sha256: hash(files.shell['extra.js']), mime: 'text/javascript' });
  sign(o.inventory); await rejectsUnchanged(o);
});
