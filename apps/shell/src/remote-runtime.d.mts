import type { RemoteContextV1, RemoteModuleV1 } from '../../../packages/mfe-contract/index.js';
export function confinedPath(value: unknown, basePath: string, origin: string): string | null;
export function bounded<T>(work: Promise<T>, timeoutMs?: number): Promise<T>;
export function loadStyles(root: ShadowRoot | HTMLElement, href: string, timeoutMs?: number): Promise<() => void>;
export function createRemoteSession(options: {
  container: HTMLElement;
  loadModule: () => Promise<RemoteModuleV1>;
  loadStyle: () => Promise<() => void>;
  onState: (state: 'loading' | 'ready' | 'error') => void;
  timeoutMs?: number;
}): { start(context: RemoteContextV1): Promise<void>; update(context: RemoteContextV1): Promise<void>; destroy(): Promise<void> };
