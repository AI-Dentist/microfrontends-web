import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { validateConfig } from '../../apps/shell/src/runtime-config.mjs';
import { createRemoteSession } from '../../apps/shell/src/remote-runtime.mjs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const origin = 'https://20-83-242-208.sslip.io';
function fixture(t, styles = ['styles-REAL123.css']) {
  const root = mkdtempSync(resolve(tmpdir(), 'deploy-fixture-'));
  const erp = resolve(root, 'erp'), shell = resolve(root, 'shell');
  mkdirSync(erp); mkdirSync(shell);
  writeFileSync(resolve(erp, 'remoteEntry.json'), '{}');
  for (const name of styles) writeFileSync(resolve(erp, name), 'body{}');
  const output = resolve(shell, 'platform-config.json');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, ['deploy/azure/write-platform-config.mjs', erp, shell], { encoding: 'utf8' });
  return { output, run };
}
test('container manifest generation discovers the actual hashed stylesheet and keeps HTTPS schema v1', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Wrote production platform-config.json using styles-REAL123.css\n');
  const raw = JSON.parse(readFileSync(f.output, 'utf8'));
  const config = validateConfig(raw, origin);
  assert.equal(config.schemaVersion, 1); assert.equal(config.remotes.length, 3);
  assert.equal(config.remotes[0].entry, `${origin}/remotes/erp/remoteEntry.json`);
  assert.equal(config.remotes[0].styles, `${origin}/remotes/erp/styles-REAL123.css`);
  assert.equal(config.remotes[1].entry, 'https://100-60-248-245.sslip.io/remotes/operations/remote.js');
  assert.equal(config.remotes[1].styles, 'https://100-60-248-245.sslip.io/remotes/operations/remote.css');
  assert.deepEqual(raw.remotes.map(r => r.apiBaseUrl), ['/api/erp/graphql', '/api/agendamiento', '/api/expediente']);
  assert.equal(config.remotes[2].entry, 'https://35-237-1-132.sslip.io/remotes/clinical/remote.js');
  assert.equal(config.remotes[2].styles, 'https://35-237-1-132.sslip.io/remotes/clinical/remote.css');
  assert.deepEqual(raw.oidc, { issuer: 'https://auth.35-237-1-132.sslip.io/realms/dental-erp', clientId: 'mf-erp', redirectUri: `${origin}/auth/callback`, postLogoutRedirectUri: `${origin}/`, scopes: ['openid', 'profile'], apiAudiences: ['ms-erp', 'ms2-clinico-ia', 'ms3-agenda-stock'] });
  const insecure = structuredClone(raw); insecure.remotes[0].entry = insecure.remotes[0].entry.replace('https:', 'http:');
  assert.throws(() => validateConfig(insecure, origin), /requires HTTPS/);
});
for (const styles of [[], ['styles.css'], ['styles-A.css', 'styles-B.css']]) {
  test(`missing or ambiguous hashed CSS fails without overwriting config: ${styles}`, t => {
    const f = fixture(t, styles); writeFileSync(f.output, 'retained manifest');
    const result = f.run(); assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Expected exactly one hashed ERP stylesheet\n');
    assert.equal(readFileSync(f.output, 'utf8'), 'retained manifest');
  });
}
test('missing ERP entry rejects without overwriting an existing manifest', t => {
  const f = fixture(t);
  const entry = resolve(f.output, '..', '..', 'erp', 'remoteEntry.json');
  rmSync(entry); writeFileSync(f.output, 'retained manifest');
  const result = f.run(); assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, `ENOENT: no such file or directory, access '${entry}'\n`);
  assert.equal(readFileSync(f.output, 'utf8'), 'retained manifest');
});

test('required Clinical remote fails in its own session; shell and healthy remotes remain usable', async t => {
  const f = fixture(t); assert.equal(f.run().status, 0);
  const config = validateConfig(JSON.parse(readFileSync(f.output)), origin);
  const events = {}, updates = [], sessions = [];
  for (const remote of config.remotes) {
    events[remote.id] = [];
    const session = createRemoteSession({ container: {},
      loadModule: async () => {
        if (remote.id === 'clinical') { assert.equal(remote.entry, 'https://35-237-1-132.sslip.io/remotes/clinical/remote.js'); throw Error('HTTP 503: GCP pending'); }
        return { contractVersion: 1, mount: async () => ({ update: c => updates.push(c.path), unmount() {} }) };
      }, loadStyle: async () => () => {}, onState: state => events[remote.id].push(state) });
    sessions.push(session); await session.start({ contractVersion: 1, basePath: remote.basePath, path: remote.basePath });
  }
  assert.deepEqual(events, { erp: ['loading', 'ready'], operations: ['loading', 'ready'], clinical: ['loading', 'error'] });
  await sessions[2].destroy(); await sessions[1].update({ path: '/operations/stock' });
  assert.deepEqual(updates, ['/operations/stock']);
  assert.deepEqual(events.erp, ['loading', 'ready']); assert.deepEqual(events.operations, ['loading', 'ready']);
  await Promise.all(sessions.map(s => s.destroy()));
});
test('Azure Docker targets include full outputs and generate runtime config during the shell build', () => {
  const source = read('deploy/azure/Dockerfile');
  for (const value of ['pnpm install --frozen-lockfile', 'pnpm run build', 'AS shell-web', 'AS mf-erp-web', 'write-platform-config.mjs', '/remotes/erp/', 'dist/shell/browser', 'dist/dental-erp-mfe1/browser']) assert.ok(source.includes(value), value);
  assert.match(source, /FROM node:24-bookworm-slim/); assert.match(source, /FROM nginx:1\.28-alpine/);
  assert.match(source, /HEALTHCHECK/);
  const compose = read('deploy/azure/compose.yml');
  for (const value of ['name: dental-frontends', 'shell-web:', 'mf-erp-web:', 'context: ../..', 'external: true', 'dental-net', 'unless-stopped']) assert.ok(compose.includes(value), value);
  assert.doesNotMatch(compose, /\bports:/);
  assert.equal(read('deploy/azure/env.template'), 'COMPOSE_FILE=deploy/azure/compose.yml\n');
  const ignore = read('.dockerignore');
  for (const value of ['**/node_modules', '**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/secrets', '.git']) assert.ok(ignore.includes(value), value);
});
test('Azure nginx serves SPA routes, explicit unavailable Clinical, no-store manifest and real asset 404s', () => {
  const shell = read('deploy/azure/shell.nginx.conf'), erp = read('deploy/azure/erp.nginx.conf');
  assert.match(shell, /location = \/platform-config\.json/); assert.match(shell, /Cache-Control "no-store"/);
  assert.match(shell, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(shell, /location \^~ \/remotes\/clinical\/\s*\{\s*return 503/);
  assert.match(shell, /try_files \$uri =404/); assert.match(erp, /location \^~ \/remotes\/erp\//);
  assert.match(erp, /try_files \$uri =404/); assert.doesNotMatch(erp, /\/index\.html/);
});
test('Azure CI uses dedicated key and public repo fast-forward deploy including orphan removal', () => {
  const workflow = read('.github/workflows/deploy-azure.yml');
  for (const value of ['branches: [main, master]', 'workflow_dispatch:', 'secrets.AZURE_SSH_KEY', 'chmod 600', 'ssh-keyscan', 'StrictHostKeyChecking=yes', 'BatchMode=yes', 'azureuser@20.83.242.208', 'cd /home/azureuser/deploy/microfrontends-web && git pull --ff-only && docker compose up -d --build --remove-orphans']) assert.ok(workflow.includes(value), value);
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=no|rsync|\.pem/);
});
