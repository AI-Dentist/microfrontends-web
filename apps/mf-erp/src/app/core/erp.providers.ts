import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEchartsCore } from 'ngx-echarts';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideErpGraphql, ErpGraphqlConfig } from './graphql/graphql.provider';
import { HttpLink } from 'apollo-angular/http';
import { CriticalMutationService } from './offline/critical-mutation.service';
import { OfflineSyncService } from './offline/offline-sync.service';
import { ReceiptPdfService } from '../shared/components/receipt-preview-modal/receipt-pdf.service';
import { FinancialIdentityService } from './auth/financial-identity.service';
import { ReportExportService } from '../features/generative-reports/report-export.service';
import { KpiAgendaService } from '../features/kpis/kpi-agenda.service';
import { KpiDataLoaderService } from '../features/kpis/kpi-data-loader.service';

/**
 * Everything the ERP needs, provided on the federated route so the Application Shell
 * gets Apollo, PrimeNG and ECharts without configuring them itself.
 */
export function provideErp(config: ErpGraphqlConfig = {}): (Provider | EnvironmentProviders)[] {
  return [
    ...provideErpGraphql(config),
    // These services consume route-provided Apollo/HttpClient. Root instances cannot see
    // child-route providers when the ERP is hosted by an otherwise unconfigured shell.
    HttpLink,
    OfflineSyncService,
    CriticalMutationService,
    ReceiptPdfService,
    FinancialIdentityService,
    ReportExportService,
    // KPI reads use the route's runtime, host token and Apollo; the loader state is shared
    // by the KPI grid and drill-down within one ERP mount.
    KpiAgendaService,
    KpiDataLoaderService,
    providePrimeNG({
      ripple: true,
      theme: {
        preset: Aura,
        options: { darkModeSelector: '.erp-dark', cssLayer: { name: 'primeng', order: 'theme, base, primeng' } },
      },
    }),
    provideEchartsCore({ echarts: () => import('echarts') }),
    MessageService,
  ];
}
