import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as platform from '../platform-artifacts.mjs';

// Contract: generatePublicRelease(options) returns {schemaVersion: 1, version,
// publicBootConfig, assets: [{url, sha256, kind}]}. version and sha256 are
// lowercase SHA-256 hex strings; assets have unique absolute URLs. The version
// is deterministic for a graph and validated public configuration. Assets
// include only the shell and ERP public graph, not config or API responses.
const shellBaseUrl = 'https://shell.example/';
const erpBaseUrl = 'https://erp.example/releases/v1/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const config = () => ({ schemaVersion: 1, remotes: [
  { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation', entry: `${erpBaseUrl}remoteEntry.json`, styles: `${erpBaseUrl}styles.css`, apiBaseUrl: '/api/erp/graphql' },
  { id: 'operations', label: 'Operations', basePath: '/operations', kind: 'module', entry: 'https://ops.example/remote.js', styles: 'https://ops.example/remote.css', apiBaseUrl: '/api/operations' },
  { id: 'clinical', label: 'Clinical', basePath: '/clinical', kind: 'module', entry: 'https://clinical.example/remote.js', styles: 'https://clinical.example/remote.css', apiBaseUrl: '/api/clinical' },
] });

async function fixture(t) {
  const base = await mkdtemp(fileURLToPath(new URL('./.public-release-test-', import.meta.url)));
  t.after(() => rm(base, { recursive: true, force: true }));
  const shellDir = join(base, 'shell'); const erpDir = join(base, 'erp');
  await Promise.all([mkdir(shellDir), mkdir(erpDir)]);
  const shell = {
    'index.html': '<base href="/"><link rel="stylesheet" href="styles.css"><link rel="modulepreload" href="preload.js"><script type="module" src="main.js"></script>',
    'styles.css': '@import "./nested.css"; body{background:url("./logo.svg")}',
    'nested.css': 'body{color:red}', 'logo.svg': '<svg/>',
    'main.js': 'import "./chunk.js"; import("./lazy.js"); new URL("./image.svg", import.meta.url);',
    'chunk.js': 'export const x = 1;', 'lazy.js': 'export default 2;', 'image.svg': '<svg/>', 'preload.js': 'export {};',
    'remoteEntry.json': JSON.stringify({ $version: 'v4', name: 'shell', shared: [{ packageName: 'rxjs', entries: { rxjs: 'shared.js' } }], exposes: [] }),
    'shared.js': 'import "./shared-chunk.js";', 'shared-chunk.js': 'export {};',
    'platform-config.json': '{"token":"must-not-be-cached"}', 'unreferenced.js': 'not part of graph',
  };
  const erp = {
    'remoteEntry.json': JSON.stringify({ $version: 'v4', name: 'dental-erp-mfe1', shared: [{ packageName: '@angular/common', entries: { '@angular/common': 'shared.js', '@angular/common/http': 'secondary.js' } }], exposes: [{ key: './Routes', outFileName: 'Routes.js' }] }),
    'shared.js': 'import "./transitive.js";', 'secondary.js': 'export {};', 'transitive.js': 'export {};',
    'Routes.js': 'import("./lazy.js");', 'lazy.js': 'export {};',
    'styles.css': '@import "./theme.css"; .logo{background:url(./font.woff2)}',
    'theme.css': 'body{color:blue}', 'font.woff2': 'font', 'unreferenced.js': 'not part of graph',
  };
  await Promise.all(Object.entries(shell).map(([name, text]) => writeFile(join(shellDir, name), text)));
  await Promise.all(Object.entries(erp).map(([name, text]) => writeFile(join(erpDir, name), text)));
  return { shellDir, erpDir, shellBaseUrl, erpBaseUrl, config: config() };
}
function generator() {
  assert.equal(typeof platform.generatePublicRelease, 'function', 'additive generatePublicRelease export is required');
  return platform.generatePublicRelease;
}
async function generate(options) { return generator()(options); }

test('strict release must not omit a CSS URL containing quoted whitespace', async t => {
  const options = await fixture(t);
  await writeFile(join(options.shellDir, 'styles.css'), 'body{background:url("./missing image.svg")}');
  await assert.rejects(() => generate(options));
});

for (const [name, html, prepare] of [
  ['raw configuration asset', '<link rel="preload" href="platform-config.json">'],
  ['encoded private API path', '<script src="%61pi/secret.js"></script>', async options => {
    await mkdir(join(options.shellDir, 'api'));
    await writeFile(join(options.shellDir, 'api/secret.js'), 'export {};');
  }],
  ['inline computed import', '<script type="module">import(target)</script>'],
  ['unquoted missing script', '<script src=missing.js></script>'],
]) {
  test(`strict release rejects ${name}`, async t => {
    const options = await fixture(t);
    if (prepare) await prepare(options);
    await writeFile(join(options.shellDir, 'index.html'), html);
    await assert.rejects(() => generate(options));
  });
}

test('strict release rejects unsupported inline references and ambiguous paths', async t => {
  const options = await fixture(t);
  for (const html of [
    '<script>import(target)</script>',
    '<style>body{background:url(missing.png)}</style>',
    '<script type="importmap">{"imports":{"x":"missing.js"}}</script>',
    '<base href="/wrong/"><script src="main.js"></script>',
    '<link rel="preload" href="%2570latform-config.json">',
    '<link rel="preload" href="unknown.json">',
  ]) {
    await writeFile(join(options.shellDir, 'index.html'), html);
    await assert.rejects(() => generate(options), html);
  }
});

test('release closes native federation, HTML, JS and CSS public references with content digests', async t => {
  const options = await fixture(t); const release = await generate(options);
  assert.equal(release.schemaVersion, 1);
  assert.match(release.version, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(release.assets));
  const assets = new Map(release.assets.map(asset => [asset.url, asset]));
  assert.equal(assets.size, release.assets.length, 'asset URLs are unique');
  const expected = {
    [shellBaseUrl]: ['index.html', 'styles.css', 'nested.css', 'logo.svg', 'main.js', 'chunk.js', 'lazy.js', 'image.svg', 'preload.js', 'remoteEntry.json', 'shared.js', 'shared-chunk.js'],
    [erpBaseUrl]: ['remoteEntry.json', 'shared.js', 'secondary.js', 'transitive.js', 'Routes.js', 'lazy.js', 'styles.css', 'theme.css', 'font.woff2'],
  };
  for (const [base, names] of Object.entries(expected)) for (const name of names) {
    const asset = assets.get(base + name);
    assert.ok(asset, `missing ${base + name}`);
    assert.equal(asset.sha256, sha(await readFile(join(base === shellBaseUrl ? options.shellDir : options.erpDir, name))));
    assert.equal(typeof asset.kind, 'string'); assert.ok(asset.kind.length);
  }
  for (const asset of release.assets) {
    assert.ok(asset.url.startsWith(shellBaseUrl) || asset.url.startsWith(erpBaseUrl));
    assert.doesNotMatch(asset.url, /platform-config|\/api\/|unreferenced/);
  }
  assert.deepEqual(await generate(options), release);
  assert.equal(release.publicBootConfig.remotes.length, 3);
  assert.equal(release.publicBootConfig.remotes[0].apiBaseUrl, 'https://shell.example/api/erp/graphql');
  assert.doesNotMatch(JSON.stringify(release.publicBootConfig), /must-not-be-cached|accessToken|clientSecret/);
  await writeFile(join(options.erpDir, 'transitive.js'), 'export const changed = true;');
  const changed = await generate(options);
  assert.notEqual(changed.version, release.version);
  assert.notEqual(changed.assets.find(a => a.url === `${erpBaseUrl}transitive.js`).sha256, assets.get(`${erpBaseUrl}transitive.js`).sha256);
});

for (const [file, fragment] of [['legacy.eot', 'iefix'], ['legacy.svg', 'primeicons']]) {
  test(`release canonicalizes CSS font ${file} empty-query fragment to its HTTP asset`, async t => {
    const options = await fixture(t);
    await writeFile(join(options.erpDir, file), 'synthetic font');
    await writeFile(join(options.erpDir, 'styles.css'), `@font-face{src:url("./${file}?#${fragment}")}`);
    const release = await generate(options);
    assert.ok(release.assets.some(a => a.url === erpBaseUrl + file));
    assert.ok(release.assets.every(a => !a.url.includes('?') && !a.url.includes('#')));
  });
}
test('release still rejects a credential-bearing CSS font query', async t => {
  const options = await fixture(t);
  await writeFile(join(options.erpDir, 'styles.css'), '@font-face{src:url("./legacy.eot?token=synthetic#iefix")}');
  await assert.rejects(() => generate(options));
});

for (const [name, file, contents] of [
  ['missing transitive chunk', 'Routes.js', 'import "./missing.js";'],
  ['unknown external origin', 'Routes.js', 'import "https://evil.example/chunk.js";'],
  ['URL credentials', 'Routes.js', 'import "https://user:pass@erp.example/releases/v1/chunk.js";'],
  ['authentication query', 'Routes.js', 'import "./lazy.js?token=synthetic";'],
  ['fragment', 'Routes.js', 'import "./lazy.js#fragment";'],
  ['path traversal', 'Routes.js', 'import "../private.js";'],
  ['private API path', 'Routes.js', 'import "/api/erp/graphql";'],
  ['missing CSS dependency', 'styles.css', '@import "./missing.css";'],
]) test(`release rejects ${name}`, async t => {
  const options = await fixture(t); await writeFile(join(options.erpDir, file), contents);
  const run = generator();
  await assert.rejects(async () => run(options));
});

for (const [name, mutate] of [
  ['unsupported schema', o => { o.config.schemaVersion = 2; }],
  ['unknown sensitive config field', o => { o.config.token = 'synthetic'; }],
  ['unknown sensitive remote field', o => { o.config.remotes[0].accessToken = 'synthetic'; }],
  ['non-loopback HTTP shell', o => { o.shellBaseUrl = 'http://shell.example/'; }],
  ['non-loopback HTTP ERP', o => { o.erpBaseUrl = 'http://erp.example/'; }],
  ['base URL credentials', o => { o.erpBaseUrl = 'https://user:pass@erp.example/'; }],
  ['base URL query', o => { o.erpBaseUrl += '?token=synthetic'; }],
]) test(`release rejects ${name}`, async t => {
  const options = await fixture(t); mutate(options);
  const run = generator();
  await assert.rejects(async () => run(options));
});

test('CLI help documents explicit public release inputs without writing output', () => {
  const cli = spawnSync(process.execPath, ['scripts/platform-artifacts.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /--shell-dir/);
  assert.match(cli.stdout, /--erp-dir/);
  assert.match(cli.stdout, /--shell-base-url/);
  assert.match(cli.stdout, /--erp-base-url/);
  assert.match(cli.stdout, /--config/);
  assert.match(cli.stdout, /--output/);
  assert.equal(cli.stderr, '');
});

test('legacy serve retains prefix, CORS, missing asset, SPA and API override behavior', async t => {
  const options = await fixture(t);
  const server = await platform.serve(options.shellDir, { prefix: '/release/', spa: true, corsOrigin: () => 'https://shell.example', override: path => path.startsWith('/api/') ? { status: 503, body: { error: 'offline' } } : null });
  t.after(() => server.close());
  const asset = await fetch(`${server.origin}/release/main.js`);
  assert.equal(asset.status, 200); assert.equal(asset.headers.get('access-control-allow-origin'), 'https://shell.example');
  assert.equal(asset.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${server.origin}/release/missing.js`)).status, 404);
  assert.equal((await fetch(`${server.origin}/outside.js`)).status, 404);
  const route = await fetch(`${server.origin}/release/erp`);
  assert.equal(route.status, 200); assert.match(await route.text(), /<base/);
  const api = await fetch(`${server.origin}/api/erp/graphql`);
  assert.equal(api.status, 503); assert.deepEqual(await api.json(), { error: 'offline' });
});
