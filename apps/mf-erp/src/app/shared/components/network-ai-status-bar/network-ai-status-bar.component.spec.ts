import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAiService } from '../../../core/ai-local/local-ai.service';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../../core/offline/network-status.service';
import { OfflineSyncService } from '../../../core/offline/offline-sync.service';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../../core/runtime/erp-runtime-context';
import { ErpLayout } from '../erp-layout/erp-layout.component';

describe('local AI status badge environment copy', () => {
  afterEach(() => vi.restoreAllMocks());

  function render(hosted: boolean) {
    const status = signal('idle');
    const progress = signal(0);
    const start = vi.fn(async () => {});
    const runtime = hosted
      ? new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: '/fixture/graphql',
        getAccessToken: () => 'synthetic-host-capability' })
      : new ErpRuntimeContext();
    TestBed.configureTestingModule({
      imports: [ErpLayout],
      providers: [
        provideRouter([]), MessageService,
        { provide: ERP_RUNTIME, useValue: runtime },
        { provide: LocalAiService, useValue: { status, progress, start,
          ready: computed(() => status() === 'ready'),
          device: signal(null), lastError: signal(null) } },
        { provide: NetworkStatusService, useValue: { online: signal(true) } },
        { provide: OfflineSyncService, useValue: { pendingCount: signal(0),
          failedCount: signal(0), lastSyncAt: signal(null), syncing: signal(false),
          flush: vi.fn(async () => {}) } },
        { provide: AuthContextService, useValue: { user: signal(null),
          isDevMock: signal(false) } },
      ],
    });
    const fixture = TestBed.createComponent(ErpLayout);
    fixture.detectChanges();
    const badge = () => fixture.nativeElement.querySelector('[data-testid="ai-status"]')
      .textContent.replace(/\s+/g, ' ').trim();
    return { fixture, badge, status, progress, start };
  }

  it('shows disabled-in-this-environment in hosted without starting AI or fetching a model', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected download'));
    const { badge, start, fixture } = render(true);
    expect(badge()).toBe('IA Navegador deshabilitada en este entorno');
    expect(start).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('preserves standalone startup and every existing local AI status label', () => {
    const { fixture, badge, status, progress, start } = render(false);
    expect(start).toHaveBeenCalledTimes(1);
    for (const [state, label] of [
      ['idle', 'IA Navegador sin iniciar'],
      ['downloading', 'IA Navegador Descargando'],
      ['loading', 'IA Navegador cargando'],
      ['ready', 'IA Navegador Lista'],
      ['unavailable', 'IA Navegador no disponible'],
      ['error', 'IA Navegador: error'],
    ]) {
      status.set(state); progress.set(42); fixture.detectChanges();
      expect(badge()).toBe(label);
      expect(!!fixture.nativeElement.querySelector('[role="progressbar"]'))
        .toBe(state === 'downloading');
    }
    expect(start).toHaveBeenCalledTimes(1);
  });
});
