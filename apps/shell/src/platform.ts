import { InjectionToken, Injectable, signal } from '@angular/core';
import type { PlatformConfigV1 } from '../../../packages/mfe-contract/index.js';
import { createAuthSession, type AuthSession } from './auth-session.mjs';
export const PLATFORM_CONFIG = new InjectionToken<PlatformConfigV1>('platform manifest');
export const AUTH_SESSION = new InjectionToken<AuthSession>('platform authentication');
let session: AuthSession | undefined;
/** Bootstrap owns the one tab-local session; no legacy storage fallback. */
export function initializeAuthentication(config: PlatformConfigV1): AuthSession {
  session = createAuthSession({ oidc: config.oidc, pageUrl: location.href });
  return session;
}
/** Existing consumers remain synchronous, including after expiry/logout. */
export const getAccessToken = (): string | null => session?.getAccessToken() ?? null;
@Injectable({ providedIn: 'root' })
export class NavigationStatus {
  readonly loading = signal(false);
  readonly failedUrl = signal<string | null>(null);
}
