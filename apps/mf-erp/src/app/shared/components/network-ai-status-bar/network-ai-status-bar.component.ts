import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideBrainCircuit, LucideCloudOff, LucideRefreshCw, LucideWifi } from '@lucide/angular';
import { LocalAiService } from '../../../core/ai-local/local-ai.service';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../../core/offline/network-status.service';
import { OfflineSyncService } from '../../../core/offline/offline-sync.service';

const AI_STATUS_LABELS = {
  idle: 'IA Navegador sin iniciar',
  downloading: 'IA Navegador Descargando',
  loading: 'IA Navegador cargando',
  ready: 'IA Navegador Lista',
  unavailable: 'IA Navegador no disponible',
  error: 'IA Navegador: error',
} as const;

/** Header indicator: [Online/Offline | Sync queue | Local AI model state]. */
@Component({
  selector: 'erp-network-ai-status-bar',
  imports: [DatePipe, LucideWifi, LucideCloudOff, LucideRefreshCw, LucideBrainCircuit],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600">
      @if (network.online()) {
        <span class="inline-flex items-center gap-1 font-medium text-emerald-700" data-testid="network-status">
          <svg lucideWifi class="size-3.5"></svg> Online
        </span>
      } @else {
        <span class="inline-flex items-center gap-1 font-medium text-amber-700" data-testid="network-status">
          <svg lucideCloudOff class="size-3.5"></svg> Offline
        </span>
      }

      <span class="h-3 w-px bg-slate-200"></span>

      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1 hover:bg-slate-100 disabled:opacity-60"
        [disabled]="!network.online() || sync.syncing()"
        (click)="sync.flush()"
        title="Sincronizar ahora"
        data-testid="sync-status"
      >
        <svg lucideRefreshCw class="size-3.5" [class.animate-spin]="sync.syncing()"></svg>
        @if (sync.pendingCount() > 0) {
          <strong>{{ sync.pendingCount() }}</strong> pendientes
        } @else {
          Sin pendientes
        }
        @if (sync.failedCount() > 0) {
          <span class="text-red-600">· {{ sync.failedCount() }} con error</span>
        }
        @if (sync.lastSyncAt(); as last) {
          <span class="text-slate-400">· {{ last | date: 'HH:mm' }}</span>
        }
      </button>

      <span class="h-3 w-px bg-slate-200"></span>

      <span class="inline-flex items-center gap-1" data-testid="ai-status" [title]="ai.lastError() ?? ''">
        <svg lucideBrainCircuit class="size-3.5" [class.text-emerald-600]="ai.ready()"></svg>
        {{ aiLabel() }}
        @if (ai.device(); as device) {
          <span class="rounded bg-slate-100 px-1 uppercase text-slate-500">{{ device }}</span>
        }
      </span>
      @if (ai.status() === 'downloading') {
        <span class="h-1 w-24 overflow-hidden rounded bg-slate-200" role="progressbar" [attr.aria-valuenow]="ai.progress()">
          <span class="block h-full bg-teal-600 transition-all" [style.width.%]="ai.progress()"></span>
        </span>
        <span>{{ ai.progress() }}%</span>
      }

      <span class="ml-auto text-slate-500">
        {{ auth.user()?.nombreCompleto ?? 'Sin sesión' }}
        @if (auth.isDevMock()) {
          <span class="ml-1 rounded bg-amber-100 px-1 text-amber-800">DEV</span>
        }
      </span>
    </div>
  `,
})
export class NetworkAiStatusBar {
  protected readonly network = inject(NetworkStatusService);
  protected readonly sync = inject(OfflineSyncService);
  protected readonly ai = inject(LocalAiService);
  protected readonly auth = inject(AuthContextService);
  protected readonly aiLabel = computed(() => AI_STATUS_LABELS[this.ai.status()]);
}
