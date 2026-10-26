import { Routes } from '@angular/router';
import { provideErp } from './core/erp.providers';
import { ErpLayout } from './shared/components/erp-layout/erp-layout.component';

/** Routes exposed through Native Federation as `./Routes` (mounted by the shell under /erp). */
export const ERP_ROUTES: Routes = [
  {
    path: '',
    component: ErpLayout,
    providers: [provideErp()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'cash-flow', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'reports', pathMatch: 'full', redirectTo: 'agent-console' },
      {
        path: 'dashboard',
        title: 'Flujo de caja',
        loadComponent: () => import('./features/cash-flow/cash-flow-dashboard.component').then((m) => m.CashFlowDashboard),
      },
      {
        path: 'billing',
        title: 'Órdenes de cobro',
        loadComponent: () => import('./features/billing/billing-inbox.component').then((m) => m.BillingInbox),
      },
      {
        path: 'agent-console',
        title: 'Agente ERP',
        loadComponent: () =>
          import('./features/agent-console/agent-console.component').then((m) => m.AgentConsoleComponent),
      },
      {
        path: 'catalogs',
        children: [
          {
            path: '', pathMatch: 'full', title: 'Catálogos',
            loadComponent: () => import('./features/catalogs/catalogs-page.component').then((m) => m.CatalogsPage),
          },
          {
            path: 'patients',
            title: 'Pacientes',
            loadComponent: () => import('./features/catalogs/patients-catalog.component').then((m) => m.PatientsCatalog),
          },
          {
            path: 'doctors',
            title: 'Odontólogos',
            loadComponent: () => import('./features/catalogs/doctors-catalog.component').then((m) => m.DoctorsCatalog),
          },
          {
            path: 'services',
            title: 'Tarifario',
            loadComponent: () => import('./features/catalogs/services-tariff.component').then((m) => m.ServicesTariff),
          },
          {
            path: 'company',
            title: 'Empresa y seguridad',
            loadComponent: () =>
              import('./features/catalogs/company-security.component').then((m) => m.CompanySecurity),
          },
        ],
      },
    ],
  },
];

export default ERP_ROUTES;
