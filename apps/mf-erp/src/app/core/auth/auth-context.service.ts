import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ErpUser {
  id: string;
  username: string;
  nombreCompleto: string;
  rol: string;
}

/** Storage keys where the Keycloak Application Shell may leave the access token. */
export const TOKEN_STORAGE_KEYS = ['kc_access_token', 'access_token', 'token'] as const;

interface JwtClaims {
  sub?: string;
  iss?: string;
  exp?: number;
  preferred_username?: string;
  name?: string;
  realm_access?: { roles?: string[] };
}

export function decodeJwtClaims(token: string): JwtClaims | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(atob(base64), (char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    const claims: unknown = JSON.parse(json);
    return claims !== null && typeof claims === 'object' && !Array.isArray(claims) ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

/**
 * Reads the JWT shared by the Keycloak shell. In development, when no token exists, it
 * activates the mock profile and the `X-Dev-User` header so MS1 can be used without a gateway.
 */
@Injectable({ providedIn: 'root' })
export class AuthContextService {
  private readonly tokenSignal = signal<string | null>(this.readStoredToken());

  readonly token = this.tokenSignal.asReadonly();
  readonly isDevMock = computed(() => this.tokenSignal() === null && !environment.production && environment.enableDevMockAuth);
  private readonly claims = signal(this.validClaims(this.tokenSignal()));
  readonly devUserHeader = computed(() => (this.isDevMock() ? environment.devUserHeader : null));
  /** Stable authentication identity, never a bearer token or an assumed ERP UUID. */
  readonly principalKey = computed<string | null>(() => {
    if (this.isDevMock()) {
      return environment.defaultDevUser.id && environment.devUserHeader
        ? JSON.stringify(['local', environment.defaultDevUser.id, environment.devUserHeader]) : null;
    }
    const claims = this.claims();
    return claims?.iss && claims.sub ? JSON.stringify(['jwt', claims.iss, claims.sub]) : null;
  });
  readonly roles = computed(() => {
    if (this.isDevMock()) return [environment.defaultDevUser.rol];
    const roles = this.claims()?.realm_access?.roles;
    return Array.isArray(roles) ? roles.filter((role) =>
      ['ADMIN', 'CAJERO', 'RECEPCIONISTA', 'ODONTOLOGO'].includes(role)) : [];
  });
  /** Only the configured local mapping is confirmed. Keycloak/ERP mapping is not configured. */
  readonly financialUserId = computed<string | null>(() =>
    this.isDevMock() && this.roles().some((role) => ['ADMIN', 'CAJERO'].includes(role))
      ? environment.defaultDevUser.id || null : null);

  requireFinancialUserId(): string {
    this.refresh();
    const id = this.financialUserId();
    if (!id) throw new Error('No hay un usuario cajero ERP confirmado para esta sesión. Configure la vinculación antes de realizar operaciones financieras.');
    return id;
  }

  readonly user = computed<ErpUser | null>(() => {
    const token = this.tokenSignal();
    if (!token) {
      return this.isDevMock() ? environment.defaultDevUser : null;
    }
    const claims = this.claims();
    if (!claims) return null;
    return {
      // A JWT subject identifies the login, not an ERP Usuario row.
      id: '',
      username: claims?.preferred_username ?? '',
      nombreCompleto: claims?.name ?? claims?.preferred_username ?? '',
      rol: this.roles()[0] ?? '',
    };
  });

  constructor() {
    // The shell may refresh the token in another tab or after a silent renew.
    globalThis.addEventListener?.('storage', () => this.refresh());
  }

  /** Re-reads storage; cheap enough to call before every request. */
  refresh(): string | null {
    const token = this.readStoredToken();
    if (token !== this.tokenSignal()) {
      this.tokenSignal.set(token);
    }
    this.claims.set(this.validClaims(token));
    if (token !== null && !this.claims()) {
      throw new Error('Credencial ERP inválida o expirada.');
    }
    return token;
  }

  private readStoredToken(): string | null {
    // A supplied credential is authoritative even when invalid: never fall through
    // to a different owner or the privileged local mock after a failed credential.
    const preferred = globalThis.localStorage?.getItem('kc_token');
    if (preferred !== null && preferred !== undefined) return preferred;
    for (const storage of [globalThis.sessionStorage, globalThis.localStorage]) {
      for (const key of TOKEN_STORAGE_KEYS) {
        const token = storage?.getItem(key);
        if (token !== null && token !== undefined) {
          return token;
        }
      }
    }
    return null;
  }

  private validClaims(token: string | null): JwtClaims | null {
    if (!token || token.split('.').length !== 3) return null;
    const claims = decodeJwtClaims(token);
    if (!claims || typeof claims.iss !== 'string' || !claims.iss.trim() ||
        typeof claims.sub !== 'string' || !claims.sub.trim()) return null;
    if (claims.exp !== undefined && (typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now())) return null;
    return claims;
  }
}
