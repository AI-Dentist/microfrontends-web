import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideErp } from './erp.providers';
import { CriticalMutationService } from './offline/critical-mutation.service';
import { NetworkStatusService } from './offline/network-status.service';
import { OfflineSyncService } from './offline/offline-sync.service';
import { ReceiptPdfService } from '../shared/components/receipt-preview-modal/receipt-pdf.service';

describe('federated ERP route providers', () => {
  it('resolves ERP services with no Apollo or HttpClient installed in the host root', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: NetworkStatusService, useValue: { isOnline: () => false, onReconnect: () => () => undefined } },
    ] });
    const route = createEnvironmentInjector(provideErp(), TestBed.inject(EnvironmentInjector));
    try {
      expect(() => route.get(OfflineSyncService)).not.toThrow();
      expect(() => route.get(CriticalMutationService)).not.toThrow();
      expect(() => route.get(ReceiptPdfService)).not.toThrow();
    } finally { route.destroy(); }
  });
});
