import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { LocalAiService } from '../../../core/ai-local/local-ai.service';
import { OfflineSyncService } from '../../../core/offline/offline-sync.service';
import { NetworkAiStatusBar } from '../network-ai-status-bar/network-ai-status-bar.component';

export interface ErpNavItem {
  path: string;
  label: string;
}

// Relative links so they work both standalone (/erp/...) and inside the shell.
export const ERP_NAV_ITEMS: ErpNavItem[] = [
  { path: 'dashboard', label: 'Dashboard' },
  { path: 'billing', label: 'Cobros' },
  { path: 'agent-console', label: 'Agente ERP' },
  { path: 'catalogs', label: 'Catálogos' },
];

/** Single shared frame for standalone and federated route trees. */
@Component({
  selector: 'erp-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule, NetworkAiStatusBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Global on purpose: carries the Tailwind utilities when the shell hosts this remote.
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../erp-styles.css',
  template: `
    <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header><erp-network-ai-status-bar /></header>
      <div class="flex flex-1 flex-col md:flex-row">
      <aside class="w-full shrink-0 border-b border-slate-200 bg-white p-4 md:w-52 md:border-r md:border-b-0" aria-label="Navegación ERP">
        <span class="mb-4 block text-lg font-semibold text-teal-700">Dental ERP</span>
        <nav class="flex flex-wrap gap-1 text-sm md:flex-col">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-teal-50 text-teal-700"
              class="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
            >
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>
      <main class="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 md:p-6">
        <router-outlet />
      </main>
      </div>
      <p-toast position="bottom-right" />
    </div>
  `,
})
export class ErpLayout implements OnInit {
  private readonly ai = inject(LocalAiService);
  // Instantiated here so the outbox starts listening for reconnection as soon as the ERP opens.
  private readonly offlineSync = inject(OfflineSyncService);
  protected readonly navItems = ERP_NAV_ITEMS;

  ngOnInit(): void {
    void this.ai.start();
  }
}
