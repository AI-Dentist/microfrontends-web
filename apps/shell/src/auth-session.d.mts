import type { OidcConfigV1 } from '../../../packages/mfe-contract/index.js';
export interface AuthSnapshot {
  readonly status: 'unconfigured' | 'unauthenticated' | 'authenticated';
  /** Verified opaque subject, never a domain user/doctor/financial ID. */
  readonly subject: string | null;
  readonly roles: readonly string[];
}
export interface AuthSession {
  snapshot(): AuthSnapshot;
  getAccessToken(): string | null;
  subscribe(listener: (snapshot: AuthSnapshot) => void): () => void;
  login(returnPath?: string): Promise<void>;
  callback(href: string): Promise<string>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}
export function createAuthSession(options: {
  oidc?: OidcConfigV1;
  pageUrl?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  history?: Pick<History, 'replaceState'>;
  crypto?: Crypto;
  fetch?: typeof fetch;
  now?: () => number;
  navigate?: (href: string) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  timeoutMs?: number;
}): AuthSession;
