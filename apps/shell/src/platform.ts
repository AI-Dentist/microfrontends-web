import { InjectionToken, Injectable, signal } from '@angular/core';
import type { PlatformConfigV1 } from '../../../packages/mfe-contract/index.js';
export const PLATFORM_CONFIG = new InjectionToken<PlatformConfigV1>('platform manifest');
export const getAccessToken = () => { try { return localStorage.getItem('kc_token'); } catch { return null; } };
@Injectable({ providedIn: 'root' })
export class NavigationStatus {
  readonly loading = signal(false);
  readonly failedUrl = signal<string | null>(null);
}
