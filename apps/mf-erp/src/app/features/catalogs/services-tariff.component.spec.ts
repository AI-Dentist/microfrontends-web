import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { LocalAiService } from '../../core/ai-local/local-ai.service';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { ServicesTariff } from './services-tariff.component';

const service = { id: 'semantic-s1', codigo: 'ENDO', nombre: 'Endodoncia', precioBaseBs: 150,
  descripcion: 'Tratamiento de conducto', especialidad: null, activo: true };
function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
async function setup() {
  const timers: (() => void)[] = [], native = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms: number, ...args: any[]) => {
    if (ms === 300) { timers.push(fn); return -timers.length; }
    return native(fn, ms, ...args);
  }) as any);
  await erpLocalDb().serviciosCache.clear();
  await erpLocalDb().serviciosCache.put(service);
  const first = deferred(), search = vi.fn((..._args: any[]) => first.promise), query = vi.fn();
  await TestBed.configureTestingModule({ imports: [ServicesTariff], providers: [
    { provide: Apollo, useValue: { query, mutate: vi.fn() } },
    { provide: LocalAiService, useValue: { ready: signal(false), semanticSearch: search } },
    { provide: AuthContextService, useValue: { roles: () => ['ADMIN'], principalKey: () => 'owner' } },
    { provide: NetworkStatusService, useValue: { online: () => false, isOnline: () => false } },
    { provide: MessageService, useValue: { add: vi.fn() } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(ServicesTariff);
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('Endodoncia'));
  const type = (value: string) => { const el = fixture.nativeElement.querySelector('input[type="search"]'); el.value = value; el.dispatchEvent(new Event('input')); };
  return { fixture, type, timers, first, search, query };
}
afterEach(async () => { TestBed.resetTestingModule(); vi.restoreAllMocks(); await erpLocalDb().serviciosCache.clear(); });

it('labels successful lazy-start inference as genuine local AI and uses cached services without backend search', async () => {
  const s = await setup(); s.type('Sacar dolor'); s.timers[0]();
  s.first.resolve([{ id: service.id, score: 0.9 }]);
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.fixture.nativeElement.querySelector('[data-testid="search-mode"]').textContent).toContain('similitud semántica');
  expect(s.fixture.nativeElement.querySelector('ul').textContent).toContain('Endodoncia');
  expect(s.query).not.toHaveBeenCalled();
});
it('invalidates an older result on the next keystroke, before the next debounce starts', async () => {
  const s = await setup(); s.type('Conducto'); s.timers[0]();
  s.type('Ortodoncia');
  s.first.resolve([{ id: service.id, score: 0.9 }]);
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.fixture.nativeElement.querySelector('ul')?.textContent ?? '').not.toContain('Endodoncia');
});
it('shows unavailable semantic AI instead of fabricated keyword results, preserving the manual tariff', async () => {
  const s = await setup(); s.search.mockRejectedValueOnce(new Error('Unavailable'));
  s.type('Conducto'); s.timers[0]();
  await vi.waitFor(() => expect(s.fixture.nativeElement.querySelector('[data-testid="search-error"]')?.textContent).toContain('no disponible'));
  expect(s.fixture.nativeElement.querySelector('p-table').textContent).toContain('Endodoncia');
  expect(s.fixture.nativeElement.querySelector('ul')?.textContent ?? '').not.toContain('Endodoncia');
  expect(s.query).not.toHaveBeenCalled();
});
