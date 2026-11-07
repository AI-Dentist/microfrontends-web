import { createHash } from 'node:crypto';
import { readFile, realpath, stat, readdir, mkdir, copyFile, lstat } from 'node:fs/promises';
import { extname, resolve, sep, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Explicit publisher operation: copy only the cached SDK's fixed public runtime
// artifacts into a rebuildable ERP dist root. Never modifies the dependency.
export async function publishOwnedOrtRuntime(erpDir) {
  const project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const target = await realpath(resolve(project, erpDir));
  if (!target.startsWith(project + sep) || !target.split(sep).includes('dist')) throw Error('Expected project build output');
  const metadata = JSON.parse(await readFile(resolve(target, 'remoteEntry.json'), 'utf8'));
  if (metadata.$version !== 'v4' || metadata.name !== 'dental-erp-mfe1') throw Error('Expected ERP build');
  const require = createRequire(resolve(project, 'apps/mf-erp/package.json'));
  const sdk = dirname(await realpath(require.resolve('onnxruntime-web')));
  const sdkVersion = JSON.parse(await readFile(resolve(sdk, '../package.json'), 'utf8')).version;
  const workers = (await readdir(target)).filter(n => /^worker-[\w-]+\.js$/u.test(n));
  let matching = 0;
  for (const worker of workers) {
    const text = await readFile(resolve(target, worker), 'utf8');
    if (text.includes('ort-wasm-proxy-worker') && text.includes('ONNX Runtime Web v' + sdkVersion)) matching++;
  }
  if (matching !== 1) throw Error('Cached SDK does not match owned worker build');
  const folder = resolve(target, 'onnx');
  await mkdir(folder, { recursive: true });
  if (!(await realpath(folder)).startsWith(target + sep)) throw Error('Runtime output escapes build');
  const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
  const outputs = [];
  for (const filename of files) outputs.push([resolve(sdk, filename), resolve(folder, filename)]);
  outputs.push([resolve(sdk, files[3]), resolve(target, files[3])]);
  for (const [from, to] of outputs) {
    try { if ((await lstat(to)).isSymbolicLink()) throw Error('Runtime output is a symlink'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await copyFile(from, to);
  }
  return outputs.map(([, to]) => to.slice(target.length + 1).split(sep).join('/'));
}

// Diagnostic target declaration, not proof that a worker is bound to these paths.
export function ownedOrtPublicAssetPaths() {
  return ['onnx/ort-wasm-simd-threaded.mjs', 'onnx/ort-wasm-simd-threaded.wasm',
    'onnx/ort-wasm-simd-threaded.asyncify.mjs', 'onnx/ort-wasm-simd-threaded.asyncify.wasm',
    'ort-wasm-simd-threaded.asyncify.wasm'];
}

export const publicAttestation = 'publisher-public-complete-v1';
export const runtimeAdapter = 'native-federation-load-module-v1';
export const runtimeContracts = [runtimeAdapter, 'es-module-shims-fetch-v1', 'configured-module-remotes-v1', 'owned-ort-wasm-paths-v1'];
// Audited emitted implementations, not inventory-supplied authority. These pins
// identify code; readiness additionally requires the supported runtime guards.
const reviewed = {
  e58472cf02eee136fa5d455ff6893bbf75be4f4449c2454a874df9146a186015: { root:'shell', adapter:'es-module-shims-fetch-v1', expressions:[
    '0ddc3f873f635e9e7c44b89c9ed1312033c32408ca4c9e363ac0dc940969d7f4',
    'e794b18871dfae156502f9ad4647da7627dd9d8324d09605662bffcba0492c0e',
    '4470a6ecca172d4bc29f41d3451308f3116772673b404b94b98bf0119a59d156',
    '9e76f3cfa5963e05ca913cd53e9ae1c0dcb1c4a53acb4bc2d5dcd6125e1948fa',
    'e3fb315675a59fea2ae5eadfa4f7c1e0a781fa0510804a8d60aa46130b84eef0',
    'd646d60d6808c32a0a9b01d078f2f5b412e9a969f275b4563e7f7a43b7bde298',
    '60c21b872da393f9e6c0087a5aaef2f12b5a273c6f3caa70e96c907ad13db1b4'] },
  e1f90709d486cdb65a502f532ab2a944cf8a723465c67ef55786ebeadac6e778: {root:'shell',adapter:'configured-module-remotes-v1',expressions:['ec0649c24ca93a4e8c82784d28ecfd1fd58e765ed3e5295c2f85bb1b9b5b5bbf']},
  f529a1be17c97404a932dd90ec27e6e46900904116ae8106bfab9d890cf00fb7: {root:'erp',adapter:'owned-ort-wasm-paths-v1',expressions:['4bbdec37cc76f91eda7a44be508fc2222145d558a547e0ed7a6ac55ee671736c']},
};
export function reviewedLoaderContract(site) {
  const entry=reviewed[site.moduleSha256];
  return entry && entry.root===site.root && entry.expressions.includes(site.expressionSha256) ? entry.adapter : null;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const types = { '.wasm': 'application/wasm', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject' };
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) throw Error('Invalid inventory schema');
}
function pathType(path) {
  if (typeof path !== 'string' || !path || /[\\%?#\s]/u.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..') || /(?:^|\/)(?:api|graphql|auth|token)(?:\/|$)/iu.test(path) || /(?:^|\/|[-_.])(?:private|secret|credentials?)(?:\/|[-_.]|$)/iu.test(path) || /\.map$/iu.test(path)) throw Error('Forbidden inventory path');
  const type = types[extname(path).toLowerCase()];
  if (!type || (type === 'application/json' && path !== 'remoteEntry.json')) throw Error('Unsupported inventory type');
  return type;
}
async function readAsset(directory, path) {
  const root = await realpath(resolve(directory));
  const file = await realpath(resolve(root, path));
  if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw Error('Inventory asset escapes root');
  return readFile(file);
}
function contentType(path, bytes) {
  const type = pathType(path), text = bytes.toString('utf8');
  if (['text/javascript', 'text/css'].includes(type) && /^\s*(?:<!doctype\s+html|<html\b)/iu.test(text)) throw Error('Inventory MIME content mismatch');
  if (type === 'application/json') {
    let value; try { value = JSON.parse(text); } catch { throw Error('Invalid inventory federation metadata'); }
    if (!value || Object.keys(value).some(k => !['$version', 'name', 'shared', 'exposes'].includes(k))) throw Error('Invalid inventory federation metadata field');
    keys(value, ['$version', 'name', 'shared', 'exposes']);
    if (value?.$version !== 'v4' || typeof value.name !== 'string' || !Array.isArray(value.shared) || !Array.isArray(value.exposes)) throw Error('Invalid inventory federation metadata');
    for (const shared of value.shared) {
      if (!shared || Object.keys(shared).some(k => !['requiredVersion', 'singleton', 'strictVersion', 'version', 'packageName', 'entries'].includes(k)) || !shared.entries || typeof shared.entries !== 'object' || Array.isArray(shared.entries)) throw Error('Invalid inventory federation metadata');
    }
    for (const exposed of value.exposes) keys(exposed, ['key', 'outFileName']);
  }
  if (type === 'application/manifest+json') {
    let value; try { value = JSON.parse(text); } catch { throw Error('Invalid inventory webmanifest'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid inventory webmanifest');
  }
  const starts = signature => bytes.subarray(0, signature.length).equals(Buffer.from(signature));
  const signatures = { 'image/png': [137,80,78,71,13,10,26,10], 'image/jpeg': [255,216,255], 'image/gif': [71,73,70,56], 'image/x-icon': [0,0,1,0], 'font/woff': [119,79,70,70], 'font/woff2': [119,79,70,50], 'font/ttf': [0,1,0,0], 'font/otf': [79,84,84,79] };
  if (signatures[type] && !starts(signatures[type])) throw Error('Inventory MIME content mismatch');
  if (type === 'application/wasm' && !starts([0,97,115,109,1,0,0,0])) throw Error('Inventory MIME content mismatch');
  if (type === 'image/webp' && !(bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP')) throw Error('Inventory MIME content mismatch');
  if (type === 'image/svg+xml' && !/^\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE svg PUBLIC "-\/\/W3C\/\/DTD SVG 1\.1\/\/EN" "http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd"\s*>\s*)?<svg\b/iu.test(text)) throw Error('Inventory MIME content mismatch');
  if (type === 'application/vnd.ms-fontobject' && (bytes.length < 36 || bytes.readUInt16LE(34) !== 0x504c)) throw Error('Inventory MIME content mismatch');
  return type;
}
function canonical(inventory) {
  return JSON.stringify({ schemaVersion: inventory.schemaVersion, attestation: inventory.attestation, roots: inventory.roots, loaderSites: inventory.loaderSites });
}

// The caller supplies exact public paths from one controlled build, not a scan.
export async function createPublicInventory({ roots, loaderSites, attestation }) {
  if (attestation !== publicAttestation || !Array.isArray(roots) || !Array.isArray(loaderSites)) throw Error('Invalid inventory attestation');
  const resultRoots = [];
  for (const entry of roots) {
    keys(entry, ['root', 'baseUrl', 'directory', 'files']);
    if (!Array.isArray(entry.files)) throw Error('Invalid inventory schema');
    const files = [];
    for (const path of entry.files) {
      pathType(path);
      const bytes = await readAsset(entry.directory, path);
      files.push({ path, sha256: hash(bytes), mime: contentType(path, bytes) });
    }
    resultRoots.push({ root: entry.root, baseUrl: entry.baseUrl, files });
  }
  const inventory = { schemaVersion: 1, attestation, roots: resultRoots, loaderSites };
  inventory.buildId = hash(canonical(inventory));
  await validatePublicInventory(inventory, roots.map(({ root, baseUrl, directory }) => ({ root, baseUrl, directory })));
  return inventory;
}

export async function validatePublicInventory(inventory, contexts) {
  keys(inventory, ['schemaVersion', 'attestation', 'roots', 'loaderSites', 'buildId']);
  if (inventory.schemaVersion !== 1 || inventory.attestation !== publicAttestation) throw Error('Invalid inventory attestation');
  if (!Array.isArray(inventory.roots) || inventory.roots.length !== 2 || !Array.isArray(inventory.loaderSites) || !digest(inventory.buildId) || hash(canonical(inventory)) !== inventory.buildId) throw Error('Invalid inventory build digest');
  if (contexts.length !== 2 || new Set(contexts.map(c => c.root)).size !== 2 || !contexts.some(c => c.root === 'shell') || !contexts.some(c => c.root === 'erp')) throw Error('Invalid inventory roots');
  for (const context of contexts) {
    let url;
    try { url = new URL(context.baseUrl); } catch { throw Error('Invalid inventory roots'); }
    if (typeof context.baseUrl !== 'string' || /[\\\\%?#\s]/u.test(context.baseUrl) || url.href !== context.baseUrl || !url.pathname.endsWith('/') || url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('Invalid inventory roots');
  }
  const directories = await Promise.all(contexts.map(c => realpath(resolve(c.directory))));
  if (contexts[0].baseUrl.startsWith(contexts[1].baseUrl) || contexts[1].baseUrl.startsWith(contexts[0].baseUrl) || directories[0] === directories[1] || directories[0].startsWith(directories[1] + sep) || directories[1].startsWith(directories[0] + sep)) throw Error('Invalid inventory roots');
  const declared = new Map(), verifiedBytes = new Map(), seenRoots = new Set(), sites = new Map(), browserSdk = new Set();
  for (const entry of inventory.roots) {
    keys(entry, ['root', 'baseUrl', 'files']);
    const context = contexts.find(c => c.root === entry.root);
    if (!context || seenRoots.has(entry.root) || entry.baseUrl !== context.baseUrl || !Array.isArray(entry.files)) throw Error('Invalid inventory roots');
    seenRoots.add(entry.root);
    for (const file of entry.files) {
      keys(file, ['path', 'sha256', 'mime']);
      const type = pathType(file.path), url = entry.baseUrl + file.path;
      if (declared.has(url) || !digest(file.sha256) || file.mime !== type) throw Error('Invalid inventory file');
      const bytes = await readAsset(context.directory, file.path);
      if (hash(bytes) !== file.sha256) throw Error('Inventory asset digest mismatch');
      contentType(file.path, bytes);
      if (entry.root === 'erp' && /^onnx\/ort-wasm-simd-threaded(?:\.asyncify)?\.mjs$/u.test(file.path)) {
        const require = createRequire(fileURLToPath(new URL('../apps/mf-erp/package.json', import.meta.url)));
        const sdk = dirname(await realpath(require.resolve('onnxruntime-web')));
        const original = await readFile(resolve(sdk, file.path.slice('onnx/'.length)));
        if (!original.equals(bytes)) throw Error('SDK browser artifact provenance mismatch');
        browserSdk.add(url);
      }
      declared.set(url, file);
      verifiedBytes.set(url, bytes);
    }
  }
  for (const site of inventory.loaderSites) {
    keys(site, ['root', 'path', 'moduleSha256', 'expressionSha256', 'adapter']);
    const context = contexts.find(c => c.root === site.root), file = context && declared.get(context.baseUrl + site.path);
    if (!file || file.mime !== 'text/javascript' || file.sha256 !== site.moduleSha256 || !digest(site.expressionSha256) || !runtimeContracts.includes(site.adapter)) throw Error('Invalid inventory loader site');
    const key = `${context.baseUrl + site.path}\n${site.expressionSha256}`;
    if (sites.has(key)) throw Error('Duplicate inventory loader site');
    sites.set(key, site);
  }
  return { declared, sites, verifiedBytes, browserSdk };
}
