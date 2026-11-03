import type { DefaultContext } from '@apollo/client/core';
import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { provideErpGraphql } from './graphql.provider';
import { provideErp } from '../erp.providers';

const mutation = gql`mutation TransportProbe { probe }`;
const query = gql`query TransportProbe { probe }`;
const token = `e30.${btoa(JSON.stringify({ iss: 'issuer', sub: 'owner', realm_access: { roles: ['ADMIN'] } }))}.signature`;
let http: HttpTestingController;
let apollo: Apollo;
const drain = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const snapshot = (context: DefaultContext) => {
  const headers = context.headers;
  return { ...context, headers: headers instanceof HttpHeaders
    ? Object.fromEntries(headers.keys().map((key) => [key, headers.getAll(key)]))
    : headers ? { ...headers } : undefined };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'kc_token' ? token : null });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  TestBed.configureTestingModule({ providers: [...provideErpGraphql(), provideHttpClientTesting()] });
  http = TestBed.inject(HttpTestingController);
  apollo = TestBed.inject(Apollo);
});
afterEach(() => { http.verify(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([
  ['generated', {}, undefined],
  ['context', { idempotencyKey: 'retry-key' }, 'retry-key'],
  ['lowercase header', { headers: Object.freeze({ 'idempotency-key': 'retry-key', 'X-Custom': 'kept', authorization: 'stale', 'x-dev-user': 'not-current' }) }, 'retry-key'],
  ['HttpHeaders', { headers: new HttpHeaders({ 'iDeMpOtEnCy-KeY': 'retry-key', 'X-Custom': 'kept' }) }, 'retry-key'],
  ['matching sources', { idempotencyKey: 'retry-key', headers: { 'IDEMPOTENCY-KEY': 'retry-key' } }, 'retry-key'],
] as const)('sends a mutation with %s key through the actual HttpLink', async (_, context, explicit) => {
  const factory = vi.spyOn(crypto, 'randomUUID');
  const before = snapshot(context);
  const done = firstValueFrom(apollo.mutate({ mutation, context }));
  await drain();
  const request = http.expectOne('http://localhost:8080/graphql');
  expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
  expect(request.request.headers.has('X-Dev-User')).toBe(false);
  expect(request.request.headers.keys().filter((key) => key.toLowerCase() === 'idempotency-key')).toHaveLength(1);
  const key = request.request.headers.get('Idempotency-Key');
  if (explicit) { expect(key).toBe(explicit); expect(factory).not.toHaveBeenCalled(); }
  else { expect(key).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i); expect(factory).toHaveBeenCalledTimes(1); }
  if ('headers' in context && (context.headers instanceof HttpHeaders || 'X-Custom' in context.headers)) {
    expect(request.request.headers.get('X-Custom')).toBe('kept');
  }
  expect(snapshot(context)).toEqual(before);
  request.flush({ data: { probe: true } });
  expect((await done).data).toEqual({ probe: true });
});

it('uses an optional validated host endpoint without changing per-request credentials', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    ...provideErpGraphql({ graphqlUrl: 'https://shell.example/api/erp/graphql' }), provideHttpClientTesting(),
  ] });
  http = TestBed.inject(HttpTestingController);
  apollo = TestBed.inject(Apollo);
  const done = firstValueFrom(apollo.query({ query }));
  await drain();
  const request = http.expectOne('https://shell.example/api/erp/graphql');
  expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
  expect(request.request.headers.has('Idempotency-Key')).toBe(false);
  request.flush({ data: { probe: true } });
  expect((await done).data).toEqual({ probe: true });
});

describe('hosted online-first transport capability', () => {
  const endpoint = 'https://host.example/nondefault/erp?tenant=synthetic';
  const credential = (sub: string, revision = 1) =>
    `e30.${btoa(JSON.stringify({ iss: 'verified-host', sub, revision, realm_access: { roles: ['ODONTOLOGO'] } }))}.signature`;

  function hosted(getAccessToken: () => string | null) {
    TestBed.resetTestingModule();
    // Extra fields deliberately use structural typing: these tests compile against the
    // existing public provider, so ignored capability fields yield behavioral RED.
    const config = { mode: 'hosted' as const, graphqlUrl: endpoint, getAccessToken };
    TestBed.configureTestingModule({ providers: [
      ...provideErp(config), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpTestingController);
    apollo = TestBed.inject(Apollo);
    return config;
  }

  const settleUnexpected = () => {
    const requests = http.match(() => true);
    requests.forEach(request => request.flush({ data: { probe: 'unexpected' } }));
    return requests;
  };

  it('reads the CURRENT synchronous host getter on every request at the verbatim endpoint', async () => {
    let current = credential('actor-A');
    const getter = vi.fn(() => current);
    hosted(getter);
    const storageRead = vi.fn(() => token);
    vi.stubGlobal('localStorage', { getItem: storageRead });
    vi.stubGlobal('sessionStorage', { getItem: storageRead });
    for (const revision of [1, 2]) {
      current = credential('actor-A', revision);
      const done = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only', context: {
        uri: 'https://caller.invalid/override',
        headers: { authorization: 'Bearer stale-caller', 'x-dev-user': 'prototype' },
      } }));
      await drain();
      const requests = http.match(() => true);
      requests.forEach(request => request.flush({ data: { probe: revision } }));
      expect(requests).toHaveLength(1);
      expect(requests[0].request.urlWithParams).toBe(endpoint);
      expect(requests[0].request.headers.get('Authorization')).toBe(`Bearer ${current}`);
      expect(requests[0].request.headers.has('X-Dev-User')).toBe(false);
      expect((await done).data).toEqual({ probe: revision });
    }
    expect(getter.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(storageRead).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthContextService).financialUserId()).toBeNull();
  });

  it.each(['missing', 'rejected'] as const)('fails closed with %s capability despite a valid legacy storage token', async kind => {
    const getter = vi.fn(() => {
      if (kind === 'rejected') throw new Error('host capability rejected');
      return null;
    });
    hosted(getter);
    const before = apollo.client.cache.extract();
    const done = firstValueFrom(apollo.query({ query })).catch(error => error);
    await drain();
    const requests = settleUnexpected();
    const result = await done;
    expect(requests).toHaveLength(0);
    expect(result).toBeInstanceOf(Error);
    expect(getter).toHaveBeenCalled();
    expect(apollo.client.cache.extract()).toEqual(before);
  });

  it('permanently retires an old provider after revocation even if the same actor getter returns again', async () => {
    let current: string | null = credential('actor-A');
    hosted(() => current);
    const initial = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only' }));
    await drain();
    http.expectOne(endpoint).flush({ data: { probe: 'active' } });
    await initial;
    current = null;
    const revoked = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only' })).catch(error => error);
    await drain();
    const revokedRequests = settleUnexpected();
    expect(await revoked).toBeInstanceOf(Error);
    expect(revokedRequests).toHaveLength(0);
    current = credential('actor-A', 2);
    const revived = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only' })).catch(error => error);
    await drain();
    const revivedRequests = settleUnexpected();
    expect(await revived).toBeInstanceOf(Error);
    expect(revivedRequests).toHaveLength(0);
    expect(apollo.client.cache.extract()).not.toEqual(expect.objectContaining({ ROOT_QUERY: expect.objectContaining({ probe: 'unexpected' }) }));
  });

  it.each(['principal', 'backend', 'revocation'] as const)('suppresses already-issued results and cache effects after %s switch', async boundary => {
    let current: string | null = credential('actor-A');
    const config = hosted(() => current);
    const before = apollo.client.cache.extract();
    const done = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only' }))
      .then(value => ({ value }), error => ({ error }));
    await drain();
    const issued = http.expectOne(endpoint);
    if (boundary === 'principal') current = credential('actor-B');
    else if (boundary === 'backend') config.graphqlUrl = 'https://other.example/erp';
    else current = null;
    // The server request already exists; the boundary can only suppress its effects.
    issued.flush({ data: { probe: 'old-principal-result' } });
    const result = await done;
    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('value');
    expect(apollo.client.cache.extract()).toEqual(before);
    const next = firstValueFrom(apollo.query({ query, fetchPolicy: 'network-only' })).catch(error => error);
    await drain();
    const requests = settleUnexpected();
    expect(await next).toBeInstanceOf(Error);
    expect(requests).toHaveLength(0);
  });
});

it('does not generate a key for existing queries', async () => {
  const factory = vi.spyOn(crypto, 'randomUUID');
  const done = firstValueFrom(apollo.query({ query, context: { idempotencyKey: 'ignored' } }));
  await drain();
  const request = http.expectOne('http://localhost:8080/graphql');
  expect(request.request.headers.has('Idempotency-Key')).toBe(false);
  expect(factory).not.toHaveBeenCalled();
  request.flush({ data: { probe: true } });
  await done;
});

it.each([
  { idempotencyKey: 'action-A', headers: { 'idempotency-key': 'action-B' } },
  { headers: { 'Idempotency-Key': 'action-A', 'idempotency-key': 'action-B' } },
  { headers: new HttpHeaders({ 'Idempotency-Key': ['action-A', 'action-B'] }) },
  { headers: { 'Idempotency-Key': '' } },
] as DefaultContext[])('rejects conflicting or empty explicit action identity before HTTP', async (context) => {
  const factory = vi.spyOn(crypto, 'randomUUID');
  const before = snapshot(context);
  const done = firstValueFrom(apollo.mutate({ mutation, context })).catch((error) => error);
  await drain();
  const forwarded = http.match(() => true);
  forwarded.forEach((request) => request.flush({ data: { probe: true } }));
  const result = await done;
  expect(forwarded).toHaveLength(0);
  expect(result).toBeInstanceOf(Error);
  http.expectNone(() => true);
  expect(factory).not.toHaveBeenCalled();
  expect(snapshot(context)).toEqual(before);
});

it.each(['invalid', `e30.${btoa(JSON.stringify({ iss: 'issuer', sub: 'owner', exp: 1 }))}.signature`])(
  'rejects supplied bad credentials without HTTP or credential storage writes: %s', async (credential) => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => credential, setItem });
    TestBed.inject(AuthContextService);
    const done = firstValueFrom(apollo.mutate({ mutation })).catch((error) => error);
    await drain();
    const forwarded = http.match(() => true);
    forwarded.forEach((request) => request.flush({ data: { probe: true } }));
    const result = await done;
    expect(forwarded).toHaveLength(0);
    expect(result).toBeInstanceOf(Error);
    http.expectNone(() => true);
    expect(setItem).not.toHaveBeenCalled();
  },
);
