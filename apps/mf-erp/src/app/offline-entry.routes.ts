import { Routes } from '@angular/router';
import { OFFLINE_ENTRY, OfflineWorkspacePage, type OfflineEntryConfig } from './features/offline-workspace/offline-workspace.component';

/**
 * Offline-only ERP entry exposed through Native Federation as `./OfflineRoutes`.
 * It intentionally provides no hosted GraphQL capability, no auth guard revival and
 * no business route: the signed grant only authorises unlocking local ciphertext.
 */
export function createOfflineRoutes(config: OfflineEntryConfig): Routes {
  return [{ path: '', component: OfflineWorkspacePage, providers: [{ provide: OFFLINE_ENTRY, useValue: config }] }];
}

/**
 * Factory used by the entry and by the real-browser proof to seed a synthetic
 * workspace. It is the same local-only implementation the page mounts.
 */
export async function createOfflineWorkspace(options: Record<string, unknown>) {
  const module = await import('./core/offline-workspace/workspace.mjs' as string) as {
    createOfflineWorkspace(values: Record<string, unknown>): unknown;
  };
  return module.createOfflineWorkspace(options);
}
