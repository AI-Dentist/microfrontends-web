import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_ENTRY, OfflineWorkspacePage } from './offline-workspace.component';

type State = { status: string; capabilities: readonly string[]; actorVerified: boolean };
const calls: string[] = [];
let status: State = { status: 'locked', capabilities: [], actorVerified: false };
const workspace = {
  status: async () => status,
  activate: async () => status,
  unlock: async () => status,
  reactivate: async () => (calls.push('reactivate'), status),
  purge: async () => (calls.push('purge'), (status = { status: 'unconfigured', capabilities: [], actorVerified: false })),
  lock: () => status,
  subscribe: () => () => {},
};

describe('OfflineWorkspacePage', () => {
  beforeEach(() => {
    calls.length = 0;
    status = { status: 'locked', capabilities: [], actorVerified: false };
    TestBed.configureTestingModule({
      providers: [{ provide: OFFLINE_ENTRY, useValue: { endpoint: 'https://shell.example/api/erp/graphql', getOnlineContext: () => ({ token: 'T', identityIssuer: 'i', identitySubject: 's', epoch: 1 }) } }],
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const page = () => {
    const component = TestBed.runInInjectionContext(() => new OfflineWorkspacePage());
    (component as unknown as { engine: () => Promise<unknown> }).engine = async () => workspace;
    (component as unknown as { workspace: unknown }).workspace = workspace;
    return component;
  };

  it('never destroys ciphertext without an explicit confirmation', async () => {
    const component = page();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    component.purge();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledOnce();
    expect(calls).not.toContain('purge');
    (component as unknown as { workspace: unknown }).workspace = workspace;
    vi.stubGlobal('confirm', () => true);
    component.purge();
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toContain('purge');
  });

  it('maps clock and grant failures to their own messages instead of a wrong PIN', () => {
    const component = page();
    const run = (code: string) => (component as unknown as { run: (f: () => Promise<State>) => Promise<void> }).run(async () => { throw Object.assign(new Error(code), { code }); });
    const read = async (code: string) => { await run(code); return component.message(); };
    return Promise.all([read('OFFLINE_CLOCK_ROLLBACK'), read('OFFLINE_GRANT_INVALID'), read('OFFLINE_UNLOCK_FAILED')]).then(([clock, grant, wrong]) => {
      expect(clock).toContain('reloj');
      expect(grant).toContain('activación');
      expect(wrong).toContain('PIN');
      expect(new Set([clock, grant, wrong]).size).toBe(3);
    });
  });

  it('refreshes state on a timer and clears it on destroy', async () => {
    vi.useFakeTimers();
    const component = page();
    let reads = 0;
    const counted = { ...workspace, status: async () => (reads++, status) };
    (component as unknown as { engine: () => Promise<unknown> }).engine = async () => counted;
    component.ngAfterViewInit();
    await Promise.resolve(); await Promise.resolve();
    const initial = reads;
    vi.advanceTimersByTime(15000);
    await Promise.resolve(); await Promise.resolve();
    expect(reads).toBeGreaterThan(initial);
    component.ngOnDestroy();
    const afterDestroy = reads;
    vi.advanceTimersByTime(45000);
    await Promise.resolve();
    expect(reads).toBe(afterDestroy);
  });
});
