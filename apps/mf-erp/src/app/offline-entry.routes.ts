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
