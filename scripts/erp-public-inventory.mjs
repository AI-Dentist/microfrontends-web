import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const publicAttestation = 'publisher-public-complete-v1';
export const runtimeAdapter = 'native-federation-load-module-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject' };
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) throw Error('Invalid inventory schema');
}
function pathType(path) {
  if (typeof path !== 'string' || !path || /[\\%?#\s]/u.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..') || /(?:^|\/|[-_.])(?:api|graphql|auth|token|private|secret|credentials?|config)(?:\/|[-_.]|$)/iu.test(path) || /\.map$/iu.test(path)) throw Error('Forbidden inventory path');
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
    if (value?.$version !== 'v4' || !Array.isArray(value.shared) || !Array.isArray(value.exposes)) throw Error('Invalid inventory federation metadata');
  }
  if (type === 'application/manifest+json') {
    let value; try { value = JSON.parse(text); } catch { throw Error('Invalid inventory webmanifest'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid inventory webmanifest');
  }
  const starts = signature => bytes.subarray(0, signature.length).equals(Buffer.from(signature));
  const signatures = { 'image/png': [137,80,78,71,13,10,26,10], 'image/jpeg': [255,216,255], 'image/gif': [71,73,70,56], 'image/x-icon': [0,0,1,0], 'font/woff': [119,79,70,70], 'font/woff2': [119,79,70,50], 'font/ttf': [0,1,0,0], 'font/otf': [79,84,84,79] };
  if (signatures[type] && !starts(signatures[type])) throw Error('Inventory MIME content mismatch');
  if (type === 'image/webp' && !(bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP')) throw Error('Inventory MIME content mismatch');
  if (type === 'image/svg+xml' && !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/iu.test(text)) throw Error('Inventory MIME content mismatch');
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
  const declared = new Map(), verifiedBytes = new Map(), seenRoots = new Set(), sites = new Map();
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
      declared.set(url, file);
      verifiedBytes.set(url, bytes);
    }
  }
  for (const site of inventory.loaderSites) {
    keys(site, ['root', 'path', 'moduleSha256', 'expressionSha256', 'adapter']);
    const context = contexts.find(c => c.root === site.root), file = context && declared.get(context.baseUrl + site.path);
    if (!file || file.mime !== 'text/javascript' || file.sha256 !== site.moduleSha256 || !digest(site.expressionSha256) || site.adapter !== runtimeAdapter) throw Error('Invalid inventory loader site');
    const key = `${context.baseUrl + site.path}\n${site.expressionSha256}`;
    if (sites.has(key)) throw Error('Duplicate inventory loader site');
    sites.set(key, site);
  }
  return { declared, sites, verifiedBytes };
}
