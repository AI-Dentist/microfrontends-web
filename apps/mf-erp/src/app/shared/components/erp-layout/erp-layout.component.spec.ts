import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAiService } from '../../../core/ai-local/local-ai.service';
import { AuthContextService } from '../../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../../core/offline/network-status.service';
import { OfflineSyncService } from '../../../core/offline/offline-sync.service';
import { ErpLayout } from './erp-layout.component';

describe('ERP shared standalone/federated frame', () => {
  const status = signal('idle');
  const online = signal(true);
  const pending = signal(0);
  const progress = signal(0);
  const flush = vi.fn(async () => {});
  beforeEach(() => {
    status.set('idle'); online.set(true); pending.set(0); progress.set(0); flush.mockClear();
    TestBed.configureTestingModule({
      imports: [ErpLayout],
      providers: [
        provideRouter([]), MessageService,
        { provide: LocalAiService, useValue: { status, progress, ready: computed(() => status() === 'ready'), device: signal(null), lastError: signal(null), start: vi.fn(async () => {}) } },
        { provide: NetworkStatusService, useValue: { online } },
        { provide: OfflineSyncService, useValue: { pendingCount: pending, failedCount: signal(0), lastSyncAt: signal(null), syncing: signal(false), flush } },
        { provide: AuthContextService, useValue: { user: signal(null), isDevMock: signal(false) } },
      ],
    });
  });
  function render() {
    const fixture = TestBed.createComponent(ErpLayout);
    fixture.detectChanges();
    return fixture;
  }
  function text(node: Element | null) { return node?.textContent?.replace(/\s+/g, ' ').trim() ?? ''; }

  it('renders one minimal sidebar with the four canonical relative destinations', () => {
    const f = render();
    const sidebars = f.nativeElement.querySelectorAll('aside');
    expect(sidebars.length).toBe(1);
    const links = [...sidebars[0].querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/dashboard', '/billing', '/agent-console', '/catalogs']);
  });

  it('updates network and queue badges and preserves manual safe synchronization', () => {
    const f = render();
    const badge = () => f.nativeElement.querySelector('[data-testid="network-status"]');
    const queue = () => f.nativeElement.querySelector('[data-testid="sync-status"]') as HTMLButtonElement;
    expect(text(badge())).toBe('Online');
    expect(text(queue())).toContain('Sin pendientes');
    pending.set(3); f.detectChanges();
    expect(text(queue())).toContain('3 pendientes');
    queue().click(); expect(flush).toHaveBeenCalledTimes(1);
    online.set(false); f.detectChanges();
    expect(text(badge())).toBe('Offline');
    expect(queue().disabled).toBe(true);
    queue().click(); expect(flush).toHaveBeenCalledTimes(1);
  });

  it('reports only actual readiness and never advertises a keyword fallback', () => {
    const f = render();
    const badge = () => f.nativeElement.querySelector('[data-testid="ai-status"]');
    for (const [state, expected] of [
      ['idle', 'sin iniciar'], ['downloading', 'Descargando'], ['loading', 'cargando'],
      ['ready', 'IA Navegador Lista'], ['unavailable', 'no disponible'], ['error', 'error'],
    ]) {
      status.set(state); progress.set(42); f.detectChanges();
      expect(text(badge())).toContain(expected);
      expect(text(badge())).not.toContain('palabras clave');
      expect(!!f.nativeElement.querySelector('[role="progressbar"]')).toBe(state === 'downloading');
    }
  });
});
