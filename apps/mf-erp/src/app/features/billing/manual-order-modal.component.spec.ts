import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import Dexie from 'dexie';
import { IDBDatabase, IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { ManualOrderModal } from './manual-order-modal.component';

const patient = { id: 'p-1', ciNit: '123', nombres: 'Synthetic', apellidos: 'Patient', activo: true };
const service = { id: 's-1', codigo: 'SYN', nombre: 'Synthetic service', precioBaseBs: '10.00' };
const hostToken = `e30.${btoa(JSON.stringify({ iss: 'host', sub: 'actor-A', realm_access: { roles: ['ADMIN'] } }))}.signature`;

describe('ManualOrderModal catalog loading', () => {
  const isolatedIndexedDB = new IDBFactory();
  const originalIndexedDB = Dexie.dependencies.indexedDB;
  const originalKeyRange = Dexie.dependencies.IDBKeyRange;
  const openedConnections = new Set<IDBDatabase>();
  let activity: { opens: unknown[][]; transactions: unknown[][] };
  let query: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    // Memory-only factory: no real user database is opened by this spec.
    vi.stubGlobal('indexedDB', isolatedIndexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    Dexie.dependencies.indexedDB = isolatedIndexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  });

  afterAll(() => {
    for (const connection of openedConnections) connection.close();
    Dexie.dependencies.indexedDB = originalIndexedDB;
    Dexie.dependencies.IDBKeyRange = originalKeyRange;
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    activity = { opens: [], transactions: [] };
    const open = isolatedIndexedDB.open.bind(isolatedIndexedDB);
    vi.spyOn(isolatedIndexedDB, 'open').mockImplementation((...args) => {
      activity.opens.push(args);
      const request = open(...args);
      request.addEventListener('success', () => openedConnections.add(request.result));
      return request;
    });
    const transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      activity.transactions.push(args);
      return transaction.apply(this, args);
    });
    query = vi.fn(() => of({ data: {} }));
  });

  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  async function create(runtime?: ErpRuntimeContext) {
    await TestBed.configureTestingModule({ imports: [ManualOrderModal], providers: [
      { provide: MessageService, useValue: { add: vi.fn() } },
      { provide: Apollo, useValue: { query } },
      { provide: CriticalMutationService, useValue: { run: vi.fn() } },
      { provide: AuthContextService, useValue: { refresh: () => null, roles: () => ['ADMIN'], principalKey: () => 'owner' } },
      // Offline: any server call would be a different rule than the catalog source under test.
      { provide: NetworkStatusService, useValue: { isOnline: () => false, online: () => false } },
      ...(runtime ? [{ provide: ERP_RUNTIME, useValue: runtime }] : []),
    ] }).compileComponents();
    return TestBed.createComponent(ManualOrderModal).componentInstance as any;
  }

  it('hosted mode does not open, read or transact on the persistent database when initialised', async () => {
    const component = await create(new ErpRuntimeContext({
      mode: 'hosted', graphqlUrl: 'https://host.example/erp', getAccessToken: () => hostToken,
    }));
    await component.ngOnInit();
    expect(activity).toEqual({ opens: [], transactions: [] });
    expect(component.patients()).toEqual([]);
    expect(component.services()).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('standalone mode still reads patients and services from the local catalog', async () => {
    // Seeded through the public database facade with synthetic rows; nothing is deleted or migrated.
    await erpLocalDb().pacientes.bulkPut([patient]);
    await erpLocalDb().serviciosOdontologicos.bulkPut([service]);
    const component = await create();
    await component.ngOnInit();
    expect(component.patients()).toEqual(expect.arrayContaining([expect.objectContaining({ id: patient.id })]));
    expect(component.services()).toEqual(expect.arrayContaining([expect.objectContaining({ id: service.id })]));
    expect(query).not.toHaveBeenCalled();
  });
});
