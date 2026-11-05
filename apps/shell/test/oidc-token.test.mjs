import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyTokenSet, trustedMetadata } from '../src/oidc-token.mjs';

// Synthetic keys never leave RAM. Assertions deliberately never print token material.
const crypto = webcrypto;
const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', key.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
const oidc = { issuer: 'https://login.example/realm', clientId: 'mf-erp', apiAudiences: ['ms-erp', 'ms2-clinico-ia', 'ms3-agenda-stock'] };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(claims, header = {}) {
  const data = `${encode({ alg: 'RS256', kid: 'test', ...header })}.${encode(claims)}`;
  return data + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(data))).toString('base64url');
}
const base = { iss: oidc.issuer, sub: 'synthetic-person', exp: 2000, iat: 900 };
const id = () => ({ ...base, aud: 'mf-erp', nonce: 'expected-nonce', auth_time: 800 });
const access = () => ({ ...base, aud: ['ms-erp', 'ms2-clinico-ia', 'ms3-agenda-stock'], azp: 'mf-erp', realm_access: { roles: ['ODONTOLOGO', 'unknown', 'RECEPCIONISTA', 'ODONTOLOGO'] } });
async function verify(i = id(), a = access(), options = {}, keys = [jwk], header = {}) {
  return verifyTokenSet({ id_token: await sign(i, header), access_token: await sign(a), refresh_token: 'synthetic-refresh', token_type: 'Bearer' }, { oidc, jwks: { keys }, crypto, now: 1000, nonce: 'expected-nonce', ...options });
}
test('RS256 verified pair exposes only known access realm roles', async () => {
  const result = await verify();
  assert.equal(result.subject, base.sub);
  assert.deepEqual(result.roles, ['ODONTOLOGO', 'RECEPCIONISTA']);
});
for (const [name, mutate] of [
  ['ID issuer exact', (i) => { i.iss += '/'; }],
  ['access issuer exact', (_, a) => { a.iss = 'https://evil.example/realm'; }],
  ['missing ID subject', i => { delete i.sub; }],
  ['subject mismatch', (_, a) => { a.sub = 'other'; }],
  ['ID expiry boundary', i => { i.exp = 1000; }],
  ['access expiry boundary', (_, a) => { a.exp = 1000; }],
  ['invalid expiry', i => { i.exp = '2000'; }],
  ['future issued at beyond clock tolerance', i => { i.iat = 1061; }],
  ['future nbf beyond clock tolerance', (_, a) => { a.nbf = 1061; }],
  ['ID audience', i => { i.aud = 'other'; }],
  ['multi audience requires azp', i => { i.aud = ['mf-erp', 'other']; }],
  ['ID azp mismatch', i => { i.azp = 'other'; }],
  ['access missing resource', (_, a) => { a.aud = ['mf-erp']; }],
  ['access azp mismatch', (_, a) => { a.azp = 'other'; }],
  ['initial nonce missing', i => { delete i.nonce; }],
  ['initial nonce mismatch', i => { i.nonce = 'other'; }],
]) test(`reject ${name}`, async () => {
  const i = id(), a = access(); mutate(i, a);
  let rejected = false; try { await verify(i, a); } catch { rejected = true; }
  assert.equal(rejected, true, 'invalid claims must not yield an authenticated result');
});
for (const [name, header, keys] of [
  ['none', { alg: 'none' }, [jwk]], ['HMAC', { alg: 'HS256' }, [jwk]],
  ['header URL', { jku: 'https://evil.example/jwks' }, [jwk]],
  ['certificate URL', { x5u: 'https://evil.example/cert' }, [jwk]],
  ['critical header', { crit: ['other'] }, [jwk]],
  ['JWK alg', {}, [{ ...jwk, alg: 'HS256' }]],
  ['JWK use', {}, [{ ...jwk, use: 'enc' }]],
  ['ambiguous kid', {}, [jwk, jwk]],
]) test(`reject unsupported trust: ${name}`, async () => {
  let rejected = false; try { await verify(id(), access(), {}, keys, header); } catch { rejected = true; }
  assert.equal(rejected, true);
});
test('signature tampering cannot authenticate', async () => {
  const token = await sign(id());
  let rejected = false;
  try { await verifyTokenSet({ id_token: token.slice(0, -8) + 'AAAAAAAA', access_token: await sign(access()), token_type: 'Bearer' }, { oidc, jwks: { keys: [jwk] }, crypto, now: 1000, nonce: 'expected-nonce' }); } catch { rejected = true; }
  assert.equal(rejected, true);
});
test('refresh nonce may be absent, but subject/auth_time and present nonce remain bound', async () => {
  const previous = await verify();
  const i = id(); delete i.nonce;
  assert.equal((await verify(i, access(), { refresh: true, previous })).subject, base.sub);
  for (const change of [x => { x.nonce = 'other'; }, x => { x.auth_time = 801; }, x => { x.sub = 'other'; }]) {
    const claims = { ...i }; change(claims);
    let rejected = false; try { await verify(claims, access(), { refresh: true, previous }); } catch { rejected = true; }
    assert.equal(rejected, true);
  }
});
test('renewed ID audience and authorized party stay identical to original verified ID', async () => {
  const initial = id(); initial.aud = ['mf-erp', 'other']; initial.azp = 'mf-erp';
  const previous = await verify(initial);
  for (const claims of [{ ...initial, aud: 'mf-erp' }, { ...initial, azp: undefined }]) {
    let rejected = false; try { await verify(claims, access(), { refresh: true, previous }); } catch { rejected = true; }
    assert.equal(rejected, true, 'renewal cannot silently change original ID claims');
  }
});
test('refresh without ID token retains previously verified ID claims, not an initial-login bypass', async () => {
  const previous = await verify();
  const tokens = { access_token: await sign(access()), token_type: 'Bearer' };
  const options = { oidc, jwks: { keys: [jwk] }, crypto, now: 1000, nonce: 'expected-nonce' };
  assert.equal((await verifyTokenSet(tokens, { ...options, refresh: true, previous })).subject, base.sub);
  await assert.rejects(verifyTokenSet(tokens, options));
});
test('metadata pins exact issuer and every endpoint to configured issuer origin', () => {
  const metadata = { issuer: oidc.issuer, authorization_endpoint: 'https://login.example/auth', token_endpoint: 'https://login.example/token', jwks_uri: 'https://login.example/certs', end_session_endpoint: 'https://login.example/logout' };
  assert.equal(trustedMetadata(oidc, metadata).issuer, oidc.issuer);
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint']) {
    for (const value of ['https://evil.example/path', 'https://u:p@login.example/path', 'http://login.example/path', 'https://login.example/path#fragment']) {
      assert.throws(() => trustedMetadata(oidc, { ...metadata, [field]: value }));
    }
  }
  assert.throws(() => trustedMetadata(oidc, { ...metadata, issuer: oidc.issuer + '/' }));
});

// Real RS256 signatures exercise the public verifier; the permitted clock lead
// never extends token expiry or changes the authenticated subject and roles.
for (const token of ['ID', 'access']) {
  for (const claim of ['iat', 'nbf']) {
    for (const lead of [1, 60]) {
      test(`clock tolerance: accepts ${token} ${claim} at now+${lead}`, async () => {
        const i = id(), a = access();
        (token === 'ID' ? i : a)[claim] = 1000 + lead;
        const result = await verify(i, a);
        assert.equal(result.subject, base.sub);
        assert.equal(result.expiresAt, base.exp * 1000);
        assert.deepEqual(result.roles, ['ODONTOLOGO', 'RECEPCIONISTA']);
      });
    }
    test(`clock tolerance: rejects ${token} ${claim} at now+61`, async () => {
      const i = id(), a = access();
      (token === 'ID' ? i : a)[claim] = 1061;
      await assert.rejects(verify(i, a), /OIDC token validation failed/);
    });
  }
  test(`clock tolerance: rejects expired ${token} without expiry leeway`, async () => {
    const i = id(), a = access();
    (token === 'ID' ? i : a).exp = 999;
    await assert.rejects(verify(i, a), /OIDC token validation failed/);
  });
}
for (const lead of [1, 60]) {
  test(`clock tolerance: accepts ID auth_time at now+${lead}`, async () => {
    const result = await verify({ ...id(), auth_time: 1000 + lead });
    assert.equal(result.subject, base.sub);
    assert.equal(result.idClaims.auth_time, 1000 + lead);
    assert.equal(result.expiresAt, base.exp * 1000);
  });
}
test('clock tolerance: rejects ID auth_time at now+61', async () => {
  await assert.rejects(verify({ ...id(), auth_time: 1061 }), /OIDC token validation failed/);
});

for (const [label, now] of [
  ['numeric string', '1000'], ['undefined', undefined], ['null', null],
  ['fraction', 1000.5], ['NaN', NaN], ['infinity', Infinity],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1], ['boolean', true],
]) {
  test(`minor adjustments: OIDC clock ${label} is invalid`, async () => {
    await assert.rejects(verify(id(), access(), { now }), /OIDC token validation failed/);
  });
}

for (const [label, now] of [['BigInt', 1000n], ['array', [1000]], ['Number object', new Number(1000)]]) {
  test(`follow-up: OIDC rejects ${label} clocks`, async () => {
    await assert.rejects(verify(id(), access(), { now }), /OIDC token validation failed/);
  });
}
test('follow-up: OIDC rejects an absent clock', async () => {
  const tokens = { id_token: await sign(id()), access_token: await sign(access()), token_type: 'Bearer' };
  await assert.rejects(verifyTokenSet(tokens, { oidc, jwks: { keys: [jwk] }, crypto,
    nonce: 'expected-nonce' }), /OIDC token validation failed/);
});
