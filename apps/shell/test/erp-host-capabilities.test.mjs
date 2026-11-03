import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// The lease factory is executed from the production bootstrap source (type-stripped, markers
// delimit it); only the session is a deterministic stand-in for the real auth-session module,
// whose protocol rules are covered by auth-session.test.mjs.
const source = (await readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const block = source.match(/\/\/ <erp-host-capability>\n([\s\S]*?)\/\/ <\/erp-host-capability>/)?.[1];
assert.ok(block, 'bootstrap must keep its ERP host capability block');
const { createErpHostCapability } = await import('data:text/javascript;base64,' +
  Buffer.from(stripTypeScriptTypes(block, { mode: 'transform' })).toString('base64'));

function fakeSession(subject = 'actor-A') {
  const listeners = new Set();
  let state = { status: 'authenticated', subject, roles: ['ODONTOLOGO'] };
  let token = `token-1-${subject}`;
  return {
    reads: 0,
    snapshot: () => state,
    getAccessToken() { this.reads++; return state.status === 'authenticated' ? token : null; },
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    set(next, nextToken = token) { state = next; token = nextToken; listeners.forEach(listener => listener(state)); },
    // Same subject logs out and in again without any capability read between both events.
    relogin(nextToken) {
      this.set({ status: 'unauthenticated', subject: null, roles: [] });
      this.set({ status: 'authenticated', subject: state.subject ?? subject, roles: ['ODONTOLOGO'] }, nextToken);
    },
    listenerCount: () => listeners.size,
  };
}
const authenticated = (subject, roles = ['ODONTOLOGO']) => ({ status: 'authenticated', subject, roles });
const signedOut = { status: 'unauthenticated', subject: null, roles: [] };

test('reads the current synchronous session token on every call, including refresh without remount', () => {
  const session = fakeSession();
  const lease = createErpHostCapability(session);
  assert.equal(lease.getAccessToken(), 'token-1-actor-A');
  session.set(authenticated('actor-A'), 'token-2-actor-A');
  const token = lease.getAccessToken();
  assert.equal(token, 'token-2-actor-A');
  assert.equal(typeof token, 'string', 'the capability must never return a Promise');
  assert.equal(session.reads, 2);
});

test('logout retires the lease permanently and a same-subject login only serves a NEW lease', () => {
  const session = fakeSession();
  const old = createErpHostCapability(session);
  session.set(signedOut);
  assert.equal(old.getAccessToken(), null);
  session.set(authenticated('actor-A'), 'token-2-actor-A');
  assert.equal(old.getAccessToken(), null);
  assert.equal(createErpHostCapability(session).getAccessToken(), 'token-2-actor-A');
});

test('logout and same-subject login between two reads still cannot revive the old lease', () => {
  const session = fakeSession();
  const old = createErpHostCapability(session);
  session.relogin('token-2-actor-A');
  assert.equal(old.getAccessToken(), null);
});

test('a different subject never receives the old lease token', () => {
  const session = fakeSession();
  const old = createErpHostCapability(session);
  session.set(authenticated('actor-B'), 'token-1-actor-B');
  assert.equal(old.getAccessToken(), null);
  session.set(authenticated('actor-A'), 'token-3-actor-A');
  assert.equal(old.getAccessToken(), null);
});

test('a lease created without a verified session is dead and stops listening once revoked', () => {
  const session = fakeSession();
  session.set(signedOut);
  const dead = createErpHostCapability(session);
  assert.equal(session.listenerCount(), 0);
  session.set(authenticated('actor-A'), 'token-2-actor-A');
  assert.equal(dead.getAccessToken(), null);
  const session2 = fakeSession();
  const lease = createErpHostCapability(session2);
  assert.equal(session2.listenerCount(), 1);
  session2.set(signedOut);
  assert.equal(session2.listenerCount(), 0);
  assert.equal(lease.getAccessToken(), null);
});

test('bootstrap hands the hosted ERP a per-load lease and verbatim endpoint, never storage or standalone routes', () => {
  assert.match(source, /createErpRoutes\(\{\s*mode: 'hosted', graphqlUrl: erp\.apiBaseUrl, getAccessToken: createErpHostCapability\(authSession\)\.getAccessToken,?\s*\}\)/);
  assert.doesNotMatch(source, /graphqlUrl:[^\n]*\/graphql/);
  assert.doesNotMatch(source, /ERP_ROUTES|module\.default|localStorage|kc_token/);
  assert.match(source, /resetConfig\(this\.routes\(\)\)/, 'ending the session must replace cached lazy ERP injectors');
});
