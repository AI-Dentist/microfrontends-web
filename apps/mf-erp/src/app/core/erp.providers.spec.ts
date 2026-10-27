import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideErp } from './erp.providers';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { CriticalMutationService } from './offline/critical-mutation.service';
import { NetworkStatusService } from './offline/network-status.service';
import { OfflineSyncService } from './offline/offline-sync.service';
import { ReceiptPdfService } from '../shared/components/receipt-preview-modal/receipt-pdf.service';

describe('federated ERP route providers', () => {
  it('passes a per-route endpoint without changing standalone defaults', async () => {
    TestBed.configureTestingModule({});
    const route = createEnvironmentInjector([
      ...provideErp({ graphqlUrl: 'https://shell.example/api/erp/graphql' }), provideHttpClientTesting(),
    ], TestBed.inject(EnvironmentInjector));
    try {
      const done = firstValueFrom(route.get(Apollo).query({ query: gql`query EndpointProbe { probe }` }));
      for (let n = 0; n < 30; n++) await Promise.resolve();
      const http = route.get(HttpTestingController);
      const request = http.expectOne('https://shell.example/api/erp/graphql');
      request.flush({ data: { probe: true } });
      expect((await done).data).toEqual({ probe: true });
      http.verify();
    } finally { route.destroy(); }
  });
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
