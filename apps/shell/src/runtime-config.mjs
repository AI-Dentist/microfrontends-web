// Pure validation: no fetching, imports, storage, or credential handling.
const paths = { erp: '/erp', operations: '/operations', clinical: '/clinical' };
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function fail(message) {
  throw new Error(`Invalid platform config: ${message}`);
}

function object(value, allowed, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${at} unknown field: ${key}`);
  }
}

function text(value, at) {
  if (typeof value !== 'string' || !value.trim()) fail(`${at} must be a non-empty string`);
  return value;
}

function url(value, at, page, api = false) {
  text(value, at);
  // Reject ambiguous syntax before URL parsing can silently normalize it.
  if (/[\s\\#]/u.test(value) || value.startsWith('//')) fail(`${at} has forbidden URL syntax`);
  const relative = api && value.startsWith('/');
  if (!relative && !/^https?:\/\//i.test(value)) fail(`${at} must be an absolute HTTP(S) URL`);
  let parsed;
  try {
    parsed = new URL(value, page.origin);
  } catch {
    fail(`${at} must be a valid URL`);
  }
  if (parsed.username || parsed.password || parsed.hash) fail(`${at} must not contain credentials or fragments`);
  const development = page.protocol === 'http:' && loopback.has(page.hostname);
  if (parsed.protocol !== 'https:' && !(development && parsed.protocol === 'http:' && loopback.has(parsed.hostname))) {
    fail(`${at} requires HTTPS (HTTP is only allowed between loopback development origins)`);
  }
  if (relative && !(parsed.pathname === '/api' || parsed.pathname.startsWith('/api/'))) {
    fail(`${at} relative path must be /api or within /api/`);
  }
  return parsed;
}

/** Validate operator-controlled JSON and return a fresh normalized manifest. */
export function validateConfig(input, pageUrl = globalThis.location?.href ?? 'https://localhost/') {
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    fail('pageUrl must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password) {
    fail('pageUrl must be an HTTP(S) URL without credentials');
  }
  object(input, ['schemaVersion', 'remotes'], 'config');
  if (input.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!Array.isArray(input.remotes) || input.remotes.length !== 3) {
    fail('remotes must contain exactly erp, operations and clinical');
  }
  const ids = new Set();
  const remotes = Array.from(input.remotes, (remote, index) => {
    const at = `remotes[${index}]`;
    object(remote, ['id', 'label', 'basePath', 'kind', 'entry', 'styles', 'apiBaseUrl'], at);
    if (typeof remote.id !== 'string' || !Object.hasOwn(paths, remote.id)) {
      fail(`${at}.id must be erp, operations or clinical`);
    }
    if (ids.has(remote.id)) fail(`${at} duplicate id: ${remote.id}`);
    ids.add(remote.id);
    // Exact ID/path mapping also prevents duplicate, nested and overlapping routes.
    if (remote.basePath !== paths[remote.id]) fail(`${at}.basePath must be ${paths[remote.id]}`);
    const kind = remote.id === 'erp' ? 'native-federation' : 'module';
    if (remote.kind !== kind) fail(`${at}.kind must be ${kind}`);
    const label = text(remote.label, `${at}.label`);
    const entry = url(remote.entry, `${at}.entry`, page);
    if (kind === 'native-federation' ? !entry.pathname.endsWith('/remoteEntry.json') : !entry.pathname.endsWith('.js')) {
      fail(`${at}.entry must end in ${kind === 'module' ? '.js' : '/remoteEntry.json'}`);
    }
    const result = { id: remote.id, label, basePath: remote.basePath, kind, entry: entry.href };
    if (kind === 'module' || Object.hasOwn(remote, 'styles')) {
      const styles = url(remote.styles, `${at}.styles`, page);
      if (!styles.pathname.endsWith('.css')) fail(`${at}.styles must end in .css`);
      result.styles = styles.href;
    }
    result.apiBaseUrl = url(remote.apiBaseUrl, `${at}.apiBaseUrl`, page, true).href;
    return result;
  });
  return { schemaVersion: 1, remotes };
}
