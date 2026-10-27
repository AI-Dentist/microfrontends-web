import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthContextService } from './auth-context.service';

// The Angular test build selects environment.development.ts through fileReplacements.
// Resolve AuthContextService through TestBed; Angular does not support relative vi.mock.

const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;

describe('AuthContextService identity boundaries', () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => stored.get(key) ?? null });
    vi.stubGlobal('localStorage', { getItem: () => null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the explicitly configured real local admin UUID and header', () => {
    const auth = TestBed.inject(AuthContextService);
    expect(auth.user()).toMatchObject({ id: 'a1000000-0000-0000-0000-000000000001', username: 'admin-scz', rol: 'ADMIN' });
    expect(environment.devUserHeader).toBe('admin-scz');
    expect(auth.devUserHeader()).toBe('admin-scz');
    expect(auth.financialUserId()).toBe('a1000000-0000-0000-0000-000000000001');
    expect(auth.requireFinancialUserId()).toBe(auth.financialUserId());
    expect(auth.principalKey()).not.toBeNull();
  });

  it('preserves a stable issuer/subject principal across token refresh, never treating sub as an ERP UUID', () => {
    stored.set('access_token', jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles: ['default-roles', 'RECEPCIONISTA'] } }));
    const auth = TestBed.inject(AuthContextService);
    const owner = auth.principalKey();
    expect(owner).toBe(JSON.stringify(['jwt', 'https://issuer', 'keycloak-subject']));
    expect(auth.roles()).toEqual(['RECEPCIONISTA']);
    expect(auth.user()?.rol).toBe('RECEPCIONISTA');
    expect(auth.user()?.id).toBe('');
    expect(auth.financialUserId()).toBeNull();
    expect(() => auth.requireFinancialUserId()).toThrow('No hay un usuario cajero ERP confirmado');
    stored.set('access_token', jwt({ iss: 'https://issuer', sub: 'keycloak-subject', exp: 9999999999 }));
    auth.refresh();
    expect(auth.principalKey()).toBe(owner);
    stored.set('access_token', jwt({ iss: 'https://other-issuer', sub: 'keycloak-subject' }));
    auth.refresh();
    expect(auth.principalKey()).not.toBe(owner);
  });

  it('never grants a financial mapping to JWT ADMIN without a configured ERP mapping', () => {
    stored.set('access_token', jwt({ iss: 'https://issuer', sub: 'a1000000-0000-0000-0000-000000000001', realm_access: { roles: ['ADMIN'] } }));
    const auth = TestBed.inject(AuthContextService);
    expect(auth.isDevMock()).toBe(false);
    expect(auth.devUserHeader()).toBeNull();
    expect(auth.financialUserId()).toBeNull();
    expect(() => auth.requireFinancialUserId()).toThrow('No hay un usuario cajero ERP confirmado');
  });

  it('does not invent an identity for malformed or incomplete tokens', () => {
    stored.set('access_token', 'invalid');
    const auth = TestBed.inject(AuthContextService);
    expect(auth.principalKey()).toBeNull();
    expect(auth.isDevMock()).toBe(false);
    expect(auth.roles()).toEqual([]);
    stored.set('access_token', jwt({ sub: 'no-issuer' }));
    expect(() => auth.refresh()).toThrow('Credencial ERP inválida o expirada.');
    expect(auth.principalKey()).toBeNull();
  });

  it('prefers localStorage kc_token over all legacy session token sources', () => {
    const token = jwt({ iss: 'https://preferred', sub: 'owner', realm_access: { roles: ['ADMIN'] } });
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'kc_token' ? token : null });
    stored.set('access_token', jwt({ iss: 'https://legacy', sub: 'other' }));
    const auth = TestBed.inject(AuthContextService);
    expect(auth.refresh()).toBe(token);
    expect(auth.principalKey()).toBe(JSON.stringify(['jwt', 'https://preferred', 'owner']));
    expect(auth.financialUserId()).toBeNull();
  });

  it.each(['invalid', jwt({ iss: 'issuer', sub: 'owner', exp: 1 })])(
    'rejects supplied invalid/expired kc_token without legacy or privileged dev fallback: %s', (token) => {
      vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'kc_token' ? token : null });
      stored.set('access_token', jwt({ iss: 'legacy', sub: 'other' }));
      const auth = TestBed.inject(AuthContextService);
      expect(() => auth.refresh()).toThrow('Credencial ERP inválida o expirada.');
      expect(auth.isDevMock()).toBe(false);
      expect(auth.devUserHeader()).toBeNull();
      expect(auth.principalKey()).toBeNull();
      expect(auth.roles()).toEqual([]);
      expect(auth.financialUserId()).toBeNull();
      expect(stored.size).toBe(1);
    },
  );

  it('does not enable dev headers in production even with the mock flag set', () => {
    const production = environment.production;
    environment.production = true;
    try {
      const auth = TestBed.inject(AuthContextService);
      expect(auth.isDevMock()).toBe(false);
      expect(auth.devUserHeader()).toBeNull();
      expect(auth.principalKey()).toBeNull();
    } finally { environment.production = production; }
  });
});
