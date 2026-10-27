import type { DefaultContext } from '@apollo/client/core';
import { HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { provideErpGraphql } from './graphql.provider';

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
