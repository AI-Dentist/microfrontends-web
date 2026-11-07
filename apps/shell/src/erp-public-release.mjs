import { validateConfig } from './runtime-config.mjs';

const digestPattern = /^[a-f0-9]{64}$/u;
const adapter = 'native-federation-load-module-v1';
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Only canonical public URLs are accepted: no encoded path tricks, queries,
// fragments, userinfo, private endpoints or insecure non-loopback origins.
function publicAssetUrl(value, page, erpBase) {
  if (typeof value !== 'string' || /[\\%?#\s]/u.test(value)) throw Error('Invalid public asset URL');
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  if (url.href !== value || url.username || url.password || (url.protocol !== 'https:' && !(page.protocol === 'http:' && loopback.includes(page.hostname) && url.protocol === 'http:' && loopback.includes(url.hostname)))) throw Error('Invalid public asset origin');
  if (!(url.origin === page.origin || value.startsWith(erpBase)) || /(?:^|\/)(?:api|graphql|auth|token|private)(?:\/|$)/iu.test(url.pathname) || /(?:^|\/)platform-config\.json$/iu.test(url.pathname) || /\.map$/iu.test(url.pathname)) throw Error('Forbidden public asset');
  return url;
}

/** Validate the generator's public, content-addressed release format. */
export async function validatePublicRelease(release, currentConfig, pageUrl = location.href) {
  if (!exactKeys(release, ['schemaVersion', 'version', 'publicBootConfig', 'assets', 'runtimePolicy']) || release.schemaVersion !== 1 || !digestPattern.test(release.version)) throw Error('Invalid public release');
  const page = new URL(pageUrl);
  const config = validateConfig(release.publicBootConfig, page.href);
  if (JSON.stringify(config) !== JSON.stringify(release.publicBootConfig) || JSON.stringify(config) !== JSON.stringify(currentConfig)) throw Error('Public configuration mismatch');
  for (const remote of config.remotes) for (const value of [remote.entry, remote.styles, remote.apiBaseUrl, ...Object.values(remote.serviceBaseUrls ?? {})].filter(Boolean)) {
    if (value.includes('?')) throw Error('Public configuration query');
  }
  const erpEntry = new URL(config.remotes.find(remote => remote.id === 'erp').entry);
  const erpBase = new URL('.', erpEntry).href;
  if (!Array.isArray(release.assets) || !release.assets.length) throw Error('Missing public assets');
  const targets = [];
  let previous = '';
  for (const asset of release.assets) {
    if (!exactKeys(asset, ['url', 'sha256', 'kind']) || typeof asset.sha256 !== 'string' || !digestPattern.test(asset.sha256) || typeof asset.kind !== 'string') throw Error('Invalid public asset');
    const url = publicAssetUrl(asset.url, page, erpBase);
    const ext = /\.([a-z0-9]+)$/u.exec(url.pathname)?.[1];
    if (!ext || asset.kind !== ext || asset.url <= previous) throw Error('Invalid public asset order or kind');
    previous = asset.url;
    if (ext === 'js' || ext === 'mjs') targets.push(asset.url);
  }
  const policy = release.runtimePolicy;
  const policyKeys = policy && Object.hasOwn(policy, 'contracts') ? ['adapter', 'targets', 'contracts'] : ['adapter', 'targets'];
  if (!exactKeys(policy, policyKeys) || policy.adapter !== adapter || !Array.isArray(policy.targets) || !targets.length || JSON.stringify(policy.targets) !== JSON.stringify(targets)) throw Error('Invalid public runtime policy');
  const supported = ['native-federation-load-module-v1', 'es-module-shims-fetch-v1', 'configured-module-remotes-v1', 'owned-ort-wasm-paths-v1'];
  if (policy.contracts !== undefined && (!Array.isArray(policy.contracts) || new Set(policy.contracts).size !== policy.contracts.length || policy.contracts.some(value => !supported.includes(value)))) throw Error('Unsupported public runtime contract');
  const payload = { schemaVersion: 1, publicBootConfig: release.publicBootConfig, assets: release.assets, runtimePolicy: policy };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const version = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
  if (version !== release.version) throw Error('Public release digest mismatch');
  return release;
}

/** A candidate can request installation, never establish active readiness. */
export async function registerPublicCandidate(config) {
  const sw = navigator.serviceWorker;
  const page = new URL(location.href);
  if (!sw?.register || !(page.protocol === 'https:' || (page.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname)))) return;
  try {
    const response = await fetch('/erp-public-release.json?update=1', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok || response.type === 'opaque') return;
    const release = await validatePublicRelease(await response.json(), config);
    await sw.register(`/erp-sw.js?release=${release.version}`, { scope: '/' });
  } catch { /* No candidate is normal for online deployments. */ }
}

/** Bind metadata only to the worker currently controlling this client. */
export async function activePublicRelease(config) {
  const serviceWorker = navigator.serviceWorker;
  const controller = serviceWorker?.controller;
  if (!controller) return null;
  let changed = false;
  const onChange = () => { changed = true; };
  serviceWorker.addEventListener('controllerchange', onChange);
  try {
    const scriptURL = controller.scriptURL;
    const page = new URL(location.href), worker = new URL(scriptURL, page);
    if (worker.origin !== page.origin || worker.pathname !== '/erp-sw.js' || worker.hash || [...worker.searchParams.keys()].length !== 1 || !digestPattern.test(worker.searchParams.get('release') ?? '')) return null;
    const version = worker.searchParams.get('release');
    const status = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(Error('Public status timeout')); }, 1000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      try { controller.postMessage({ type: 'ERP_PUBLIC_STATUS' }, [channel.port2]); }
      catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
    });
    if (navigator.serviceWorker.controller !== controller || !exactKeys(status, ['version', 'complete', 'assets', 'publicBootConfig', 'runtimePolicy']) || status.complete !== true || status.version !== version) return null;
    const release = await validatePublicRelease({ schemaVersion: 1, version, publicBootConfig: status.publicBootConfig, assets: status.assets, runtimePolicy: status.runtimePolicy }, config);
    if (changed || serviceWorker.controller !== controller || controller.scriptURL !== scriptURL) return null;
    return { release, controller, scriptURL };
  } catch { return null; }
  finally { serviceWorker.removeEventListener('controllerchange', onChange); }
}
