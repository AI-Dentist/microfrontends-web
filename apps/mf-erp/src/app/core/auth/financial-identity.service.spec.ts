import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { Subject, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ERP_RUNTIME, ErpRuntimeContext } from '../runtime/erp-runtime-context';
import { FinancialIdentityService } from './financial-identity.service';

const CASHIER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;
const token = (sub = 'keycloak-subject', roles = ['CAJERO']) => jwt({ iss: 'https://issuer', sub, realm_access: { roles } });

function setup(options: { hosted?: boolean; roles?: string[]; reply?: () => any } = {}) {
  let current: string | null = token('keycloak-subject', options.roles);
  const runtime = options.hosted === false ? new ErpRuntimeContext()
    : new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/graphql', getAccessToken: () => current });
  const query = vi.fn((_options: any) => (options.reply ?? (() => of({ data: { obtenerMiUsuarioId: CASHIER } })))());
  TestBed.configureTestingModule({ providers: [
    FinancialIdentityService, { provide: ERP_RUNTIME, useValue: runtime }, { provide: Apollo, useValue: { query } },
  ] });
  return { service: TestBed.inject(FinancialIdentityService), runtime, query, setToken: (value: string | null) => { current = value; } };
}
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('FinancialIdentityService', () => {
  it('resolves the canonical id through the argument-free self query, owned by the current principal', async () => {
    const s = setup();
    await expect(s.service.resolve()).resolves.toBe(CASHIER);
    expect(s.query).toHaveBeenCalledOnce();
    const options = s.query.mock.calls[0][0];
    expect(options.query.definitions[0].name.value).toBe('ObtenerMiUsuarioId');
    expect(options.variables ?? {}).toEqual({});
    expect(options.fetchPolicy).toBe('network-only');
    expect(options.context).toEqual({ ownerPrincipal: JSON.stringify(['jwt', 'https://issuer', 'keycloak-subject']) });
  });
  it('is single-flight and cached for the lease, even across service instances', async () => {
    const reply = new Subject<any>();
    const s = setup({ reply: () => reply });
    const first = s.service.resolve(), second = s.service.resolve();
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    await expect(Promise.all([first, second])).resolves.toEqual([CASHIER, CASHIER]);
    const another = TestBed.runInInjectionContext(() => new FinancialIdentityService());
    await expect(another.resolve()).resolves.toBe(CASHIER);
    expect(s.query).toHaveBeenCalledOnce();
  });
  it('does not share the cache with another lease', async () => {
    const a = setup();
    await a.service.resolve();
    TestBed.resetTestingModule();
    const b = setup();
    await b.service.resolve();
    expect(b.query).toHaveBeenCalledOnce();
  });
  it('is cleared on retirement: no cached id and no request afterwards, even when the getter recovers', async () => {
    const s = setup();
    await s.service.resolve();
    s.setToken(null);
    await expect(s.service.resolve()).rejects.toThrow();
    s.setToken(token());
    await expect(s.service.resolve()).rejects.toThrow();
    expect(s.query).toHaveBeenCalledOnce();
  });
  it('rejects a principal switch before reusing the cached id', async () => {
    const s = setup();
    await s.service.resolve();
    s.setToken(token('another-subject'));
    await expect(s.service.resolve()).rejects.toThrow();
    expect(s.query).toHaveBeenCalledOnce();
  });
  it('discards a late answer when the principal switched while it was in flight', async () => {
    const reply = new Subject<any>();
    const s = setup({ reply: () => reply });
    const pending = s.service.resolve();
    s.setToken(token('another-subject'));
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    await expect(pending).rejects.toThrow();
  });
  it('rejects a same-subject finance-role downgrade while lookup is pending', async () => {
    const reply = new Subject<any>();
    const s = setup({ reply: () => reply });
    const pending = s.service.resolve();
    s.setToken(token('keycloak-subject', ['RECEPCIONISTA']));
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    await expect(pending).rejects.toThrow('Solo ADMIN o CAJERO pueden realizar operaciones financieras.');
    await expect(s.service.resolve()).rejects.toThrow();
    expect(s.query).toHaveBeenCalledOnce();
  });
  it.each([
    ['forbidden', () => throwError(() => new Error('Acceso denegado'))],
    ['not found', () => throwError(() => new Error('Usuario no encontrado'))],
    ['empty', () => of({ data: null })],
    ['a JWT subject', () => of({ data: { obtenerMiUsuarioId: 'keycloak-subject' } })],
    ['blank', () => of({ data: { obtenerMiUsuarioId: ' ' } })],
  ])('fails closed on %s and never falls back to the dev id, the JWT sub or a doctor id', async (_name, reply) => {
    const s = setup({ reply });
    await expect(s.service.resolve()).rejects.toThrow();
    expect(s.query).toHaveBeenCalledOnce();
  });
  it('does not cache a failure: the next attempt asks again', async () => {
    const replies = [() => throwError(() => new Error('network down')), () => of({ data: { obtenerMiUsuarioId: CASHIER } })];
    const s = setup({ reply: () => replies.shift()!() });
    await expect(s.service.resolve()).rejects.toThrow('network down');
    await expect(s.service.resolve()).resolves.toBe(CASHIER);
    expect(s.query).toHaveBeenCalledTimes(2);
  });
  it.each([['RECEPCIONISTA'], ['ODONTOLOGO']])('does not ask the backend for %s', async (role) => {
    const s = setup({ roles: [role] });
    await expect(s.service.resolve()).rejects.toThrow();
    expect(s.query).not.toHaveBeenCalled();
  });
  it('keeps the standalone behavior: the configured dev-mock id, with no query', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    vi.stubGlobal('localStorage', { getItem: () => null });
    const s = setup({ hosted: false });
    await expect(s.service.resolve()).resolves.toBe(environment.defaultDevUser.id);
    expect(s.query).not.toHaveBeenCalled();
  });
});
