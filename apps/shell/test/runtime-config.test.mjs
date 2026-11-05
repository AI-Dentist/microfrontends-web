import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../src/runtime-config.mjs';

const page = 'https://shell.example/app?from=test';
function manifest() {
  return { schemaVersion: 1, remotes: [
    { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation', entry: 'https://erp.example/releases/v1/remoteEntry.json', apiBaseUrl: '/api/erp' },
    { id: 'operations', label: 'Operations', basePath: '/operations', kind: 'module', entry: 'https://ops.example/v2/remote.js', styles: 'https://cdn.example/v2/remote.css', apiBaseUrl: 'https://api.example/operations' },
    { id: 'clinical', label: 'Clinical', basePath: '/clinical', kind: 'module', entry: 'https://clinical.example/v3/remote.js', styles: 'https://clinical.example/v3/remote.css', apiBaseUrl: '/api/clinical' },
  ] };
}

test('independent origins, release URLs and API normalization without mutating input', () => {
  const input = manifest();
  input.remotes[1].entry = 'https://OPS.example:443/v2/../v3/remote.js?release=2';
  const before = structuredClone(input);
  const result = validateConfig(input, page);
  const expected = structuredClone(input);
  expected.remotes[0].apiBaseUrl = 'https://shell.example/api/erp';
  expected.remotes[1].entry = 'https://ops.example/v3/remote.js?release=2';
  expected.remotes[2].apiBaseUrl = 'https://shell.example/api/clinical';
  assert.deepEqual(result, expected);
  assert.deepEqual(input, before);
  assert.notEqual(result, input);
  assert.notEqual(result.remotes[0], input.remotes[0]);
});

test('optional ERP stylesheet, ordering and default page URL', () => {
  const input = manifest();
  input.remotes.reverse();
  input.remotes[2].styles = 'https://erp.example/theme.css';
  for (const remote of input.remotes) remote.apiBaseUrl = 'https://api.example/api';
  assert.deepEqual(validateConfig(input), input);
});

test('optional service base URLs are normalized per remote and omitted when absent', () => {
  const input = manifest();
  input.remotes[1].serviceBaseUrls = { erp: '/api/erp/graphql?tenant=a' };
  input.remotes[2].serviceBaseUrls = { agenda: 'https://api.example/api/agendamiento', erp: '/api/erp/graphql' };
  const before = structuredClone(input);
  const result = validateConfig(input, page);
  assert.deepEqual(result.remotes[1].serviceBaseUrls, { erp: 'https://shell.example/api/erp/graphql?tenant=a' });
  assert.deepEqual(result.remotes[2].serviceBaseUrls, { agenda: 'https://api.example/api/agendamiento', erp: 'https://shell.example/api/erp/graphql' });
  assert.equal(Object.hasOwn(result.remotes[0], 'serviceBaseUrls'), false);
  assert.notEqual(result.remotes[1].serviceBaseUrls, input.remotes[1].serviceBaseUrls);
  assert.deepEqual(input, before);
});

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`HTTP development URLs allowed only from loopback HTTP page: ${host}`, () => {
    const input = manifest();
    input.remotes[0].entry = `http://${host}:4201/remoteEntry.json`;
    input.remotes[1].styles = `http://${host}:4202/remote.css`;
    input.remotes[2].apiBaseUrl = '/api';
    assert.equal(validateConfig(input, `http://${host}:4300/`).remotes[2].apiBaseUrl, `http://${host}:4300/api`);
    assert.throws(() => validateConfig(input, page), /HTTPS/);
    assert.throws(() => validateConfig(input, `https://${host}/`), /HTTPS/);
  });
}

const invalid = [
  ['null config', () => null, /config must be an object/],
  ['array config', () => [], /config must be an object/],
  ['schema version', c => { c.schemaVersion = 2; }, /schemaVersion must be 1/],
  ['missing version', c => { delete c.schemaVersion; }, /schemaVersion must be 1/],
  ['unknown config key', c => { c.token = 'not-a-secret'; }, /unknown field: token/],
  ['non-array remotes', c => { c.remotes = {}; }, /remotes must contain exactly/],
  ['missing remote', c => { c.remotes.pop(); }, /remotes must contain exactly/],
  ['extra remote', c => { c.remotes.push(c.remotes[0]); }, /remotes must contain exactly/],
  ['null remote', c => { c.remotes[0] = null; }, /must be an object/],
  ['sparse remote list', c => { delete c.remotes[0]; }, /must be an object/],
  ['non-string id', c => { c.remotes[0].id = ['erp']; }, /id must be/],
  ['unknown remote key', c => { c.remotes[0].accessToken = 'not-a-secret'; }, /unknown field: accessToken/],
  ['unknown id', c => { c.remotes[0].id = 'other'; }, /id must be/],
  ['non-object service URLs', c => { c.remotes[1].serviceBaseUrls = ['/api/erp']; }, /serviceBaseUrls must be an object/],
  ['empty service URLs', c => { c.remotes[1].serviceBaseUrls = {}; }, /serviceBaseUrls must name at least one service/],
  ['unknown service', c => { c.remotes[1].serviceBaseUrls = { billing: '/api/erp' }; }, /serviceBaseUrls unknown field: billing/],
  ['relative non-API service URL', c => { c.remotes[1].serviceBaseUrls = { erp: '/graphql' }; }, /serviceBaseUrls\.erp relative path must be \/api/],
  ['service URL with credentials', c => { c.remotes[2].serviceBaseUrls = { agenda: 'https://user:pass@api.example/api' }; }, /serviceBaseUrls\.agenda must not contain credentials/],
  ['duplicate id', c => { c.remotes[2] = { ...c.remotes[1] }; }, /duplicate id/],
  ['duplicate path', c => { c.remotes[1].basePath = '/erp'; }, /basePath/],
  ['path collision', c => { c.remotes[1].basePath = '/erp/operations'; }, /basePath/],
  ['wrong path', c => { c.remotes[0].basePath = '/clinical'; }, /basePath/],
  ['wrong ERP kind', c => { c.remotes[0].kind = 'module'; }, /kind/],
  ['wrong module kind', c => { c.remotes[1].kind = 'native-federation'; }, /kind/],
  ['empty label', c => { c.remotes[0].label = '  '; }, /label/],
  ['non-string label', c => { c.remotes[0].label = 1; }, /label/],
  ['missing entry', c => { delete c.remotes[0].entry; }, /entry/],
  ['relative entry', c => { c.remotes[0].entry = '/remoteEntry.json'; }, /absolute/],
  ['wrong native filename', c => { c.remotes[0].entry = 'https://erp.example/other.json'; }, /remoteEntry.json/],
  ['wrong module extension', c => { c.remotes[1].entry = 'https://ops.example/remote.json'; }, /\.js/],
  ['missing styles', c => { delete c.remotes[1].styles; }, /styles/],
  ['wrong style extension', c => { c.remotes[1].styles = 'https://ops.example/theme.js'; }, /\.css/],
  ['non-string API', c => { c.remotes[0].apiBaseUrl = 3; }, /apiBaseUrl/],
  ['relative non-API path', c => { c.remotes[0].apiBaseUrl = '/service'; }, /\/api/],
  ['relative API collision', c => { c.remotes[0].apiBaseUrl = '/api-other'; }, /\/api/],
  ['relative API traversal', c => { c.remotes[0].apiBaseUrl = '/api/../private'; }, /\/api/],
];
for (const field of ['entry', 'styles', 'apiBaseUrl']) {
  for (const url of ['//evil.example/remote.js', 'javascript:alert(1)', 'data:text/javascript,0', 'https://user:pass@evil.example/remote.js', 'https://evil.example/remote.js#', 'http://remote.example/remote.js', 'http://localhost.evil.example/remote.js', 'https://evil.example/remote.js\\bad', ' https://evil.example/remote.js', 'not a URL']) {
    invalid.push([`${field} rejects ${url}`, c => { c.remotes[1][field] = url; }, /remotes\[1\]/]);
  }
}
for (const [name, change, error] of invalid) {
  test(`fail closed: ${name}`, () => {
    let input = manifest();
    const replacement = change(input);
    if (replacement !== undefined) input = replacement;
    const before = structuredClone(input);
    assert.throws(() => validateConfig(input, page), error);
    assert.deepEqual(input, before);
  });
}

test('HTTP remote forbidden even on loopback page when remote is not loopback', () => {
  const input = manifest();
  input.remotes[1].entry = 'http://ops.example/remote.js';
  assert.throws(() => validateConfig(input, 'http://localhost:4300/'), /HTTPS/);
});

const oidc = () => ({ issuer: 'https://login.example/realms/dental-platform', clientId: 'mf-erp', redirectUri: 'https://shell.example/auth/callback', postLogoutRedirectUri: 'https://shell.example/', scopes: ['openid', 'profile'], apiAudiences: ['ms-erp', 'ms2-clinico-ia', 'ms3-agenda-stock'] });
test('optional public OIDC is copied without changing legacy parser output', () => {
  const input = manifest();
  assert.equal(Object.hasOwn(validateConfig(input, page), 'oidc'), false);
  input.oidc = oidc();
  const before = structuredClone(input);
  assert.deepEqual(validateConfig(input, page).oidc, input.oidc);
  assert.deepEqual(input, before);
  assert.notEqual(validateConfig(input, page).oidc.scopes, input.oidc.scopes);
});
for (const [name, change] of [
  ['unknown field', o => { o.clientSecret = 'forbidden'; }],
  ['missing field', o => { delete o.apiAudiences; }],
  ['empty client', o => { o.clientId = ' '; }],
  ['missing openid', o => { o.scopes = ['profile']; }],
  ['duplicate scopes', o => { o.scopes = ['openid', 'openid']; }],
  ['empty audiences', o => { o.apiAudiences = []; }],
  ['duplicate audiences', o => { o.apiAudiences = ['ms-erp', 'ms-erp']; }],
  ['HTTP issuer', o => { o.issuer = 'http://login.example/realm'; }],
  ['issuer credentials', o => { o.issuer = 'https://user:pass@login.example/realm'; }],
  ['issuer query', o => { o.issuer += '?realm=other'; }],
  ['callback origin', o => { o.redirectUri = 'https://other.example/auth/callback'; }],
  ['logout origin', o => { o.postLogoutRedirectUri = 'https://other.example/'; }],
  ['callback query', o => { o.redirectUri += '?code=other'; }],
]) test(`OIDC rejects ${name} without mutating config`, () => {
  const input = manifest(); input.oidc = oidc(); change(input.oidc);
  const before = structuredClone(input);
  assert.throws(() => validateConfig(input, page), /Invalid platform config/);
  assert.deepEqual(input, before);
});

test('example platform config validates with independent local origins', () => {
  const input = JSON.parse(readFileSync(new URL('../public/platform-config.json', import.meta.url), 'utf8'));
  const parsed = validateConfig(input, 'http://localhost:4200/');
  assert.equal(parsed.remotes.length, 3);
  assert.equal(parsed.oidc.issuer, 'http://localhost:8180/realms/dental-platform');
  assert.equal(parsed.oidc.redirectUri, 'http://localhost:4200/auth/callback');
  assert.deepEqual(parsed.remotes.map(r => r.serviceBaseUrls), [undefined, { erp: 'http://localhost:4200/api/erp/graphql' }, { agenda: 'http://localhost:4200/api/agendamiento', erp: 'http://localhost:4200/api/erp/graphql' }]);
  assert.throws(() => validateConfig(input, 'http://localhost:4300/'), /shell origin/);
});
