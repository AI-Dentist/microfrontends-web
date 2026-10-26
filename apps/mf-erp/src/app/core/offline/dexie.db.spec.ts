import Dexie from 'dexie';
import { ErpLocalDatabase, OfflineMutationRecord } from './dexie.db';

const legacySchema = {
  pacientes: 'id, ciNit, nombres, apellidos',
  serviciosOdontologicos: 'id, codigo, nombre',
  ordenesCobro: 'id, pacienteId, estado',
  offlineQueue: 'idempotencyKey, mutationName, status, createdAt',
};
const patients = [{ id: 'p1', ciNit: '123', nombres: 'Ana', apellidos: 'Perez', custom: { retained: true } }];
const services = [{ id: 's1', codigo: 'EXT', nombre: 'Extracción', precio: '120.50' }];
const orders = [{ id: 'o1', pacienteId: 'p1', estado: 'PENDIENTE', saldo: '120.50' }];
const catalogs = [{ key: 'consultorios', data: [{ id: 'c1', nombre: 'A' }], updatedAt: '2026-01-01' }];
const records: OfflineMutationRecord[] = ['PENDING_SYNC', 'FAILED', 'SYNCED'].map((status, i) => ({
  idempotencyKey: `00000000-0000-4000-8000-00000000000${i}`,
  mutationName: i === 1 ? 'RegistrarEgresoCaja' : 'CobrarCuotaEnEfectivo',
  variables: { input: { cuotaId: `q${i}`, monto: '120.50', nested: [1, null, 'original'] } },
  createdAt: `2026-01-0${i + 1}T00:00:00Z`,
  status: status as OfflineMutationRecord['status'],
  ...(i === 0 ? {} : { ownerPrincipal: `user:${i}` }),
  lastError: i === 1 ? 'rechazado' : undefined,
  syncedAt: i === 2 ? '2026-01-04T00:00:00Z' : undefined,
  attempts: i + 1,
}));

describe('ErpLocalDatabase canonical migration (real IndexedDB)', () => {
  let name: string;
  let connections: Dexie[];
  function current() {
    // The optional name isolates fixtures; production retains DentalErpOfflineDB.
    const db = new ErpLocalDatabase(name);
    connections.push(db);
    return db;
  }
  async function legacy(version: number) {
    const db = new Dexie(name);
    connections.push(db);
    db.version(1).stores(legacySchema);
    if (version === 2) db.version(2).stores({ catalogCache: 'key' });
    await db.open();
    await db.table('pacientes').bulkAdd(patients);
    await db.table('serviciosOdontologicos').bulkAdd(services);
    await db.table('ordenesCobro').bulkAdd(orders);
    await db.table('offlineQueue').bulkAdd(records);
    if (version === 2) await db.table('catalogCache').bulkAdd(catalogs);
    db.close();
  }
  beforeEach(() => {
    name = `t3-fixture-${crypto.randomUUID()}`;
    connections = [];
  });
  afterEach(async () => {
    connections.forEach((db) => db.close());
    // Disposable fake-indexeddb fixture only; never the application database.
    await new Dexie(name).delete();
  });

  it.each([1, 2])('copies v%s intact, retains historical backups and never recopies on reopen', async (version) => {
    await legacy(version);
    let db = current();
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.pacientesCache.toArray()).toEqual(patients);
    expect(await db.serviciosCache.toArray()).toEqual(services);
    expect(await db.offlineMutationQueue.toArray()).toEqual(records);
    expect(await db.offlineMutationQueue.where('status').equals('PENDING_SYNC').count()).toBe(1);
    expect(await db.offlineMutationQueue.where('status').equals('FAILED').count()).toBe(1);
    expect(await db.table('pacientes').toArray()).toEqual(patients);
    expect(await db.table('serviciosOdontologicos').toArray()).toEqual(services);
    expect(await db.table('offlineQueue').toArray()).toEqual(records);
    expect(await db.ordenesCobro.toArray()).toEqual(orders);
    expect(await db.catalogCache.toArray()).toEqual(version === 2 ? catalogs : []);
    await db.offlineMutationQueue.update(records[0].idempotencyKey, { status: 'SYNCED' });
    const active = await db.offlineMutationQueue.toArray();
    db.close();
    db = current();
    await db.open();
    expect(await db.offlineMutationQueue.toArray()).toEqual(active);
    expect(await db.table('offlineQueue').toArray()).toEqual(records);
    expect(await db.offlineMutationQueue.count()).toBe(3);
  });

  it.each([1, 2])('opens an empty historical v%s database without inventing financial records', async (version) => {
    const old = new Dexie(name);
    connections.push(old);
    old.version(1).stores(legacySchema);
    if (version === 2) old.version(2).stores({ catalogCache: 'key' });
    await old.open();
    old.close();
    const db = current();
    await db.open();
    expect(await db.offlineMutationQueue.toArray()).toEqual([]);
    expect(await db.pacientesCache.toArray()).toEqual([]);
    expect(await db.serviciosCache.toArray()).toEqual([]);
    expect(await db.catalogCache.toArray()).toEqual([]);
    expect(await db.ordenesCobro.toArray()).toEqual([]);
  });

  it('creates real canonical stores with indexes and routes both property APIs to the same active tables', async () => {
    const db = current();
    await db.open();
    expect(db.name).toBe(name);
    expect(db.tables.map((t) => [t.name, t.schema.primKey.src, t.schema.indexes.map((i) => i.src)])).toEqual(expect.arrayContaining([
      ['pacientesCache', 'id', ['ciNit', 'nombres', 'apellidos']],
      ['serviciosCache', 'id', ['codigo', 'nombre']],
      ['offlineMutationQueue', 'idempotencyKey', ['mutationName', 'status', 'createdAt']],
    ]));
    expect(db.pacientes).toBe(db.pacientesCache);
    expect(db.serviciosOdontologicos).toBe(db.serviciosCache);
    expect(db.offlineQueue).toBe(db.offlineMutationQueue);
    await db.pacientes.bulkAdd(patients);
    await db.serviciosCache.bulkAdd(services);
    await db.transaction('rw', db.offlineQueue, () => db.offlineQueue.bulkAdd(records));
    expect(await db.pacientesCache.toArray()).toEqual(patients);
    expect(await db.serviciosOdontologicos.toArray()).toEqual(services);
    expect(await db.offlineMutationQueue.toArray()).toEqual(records);
    await db.offlineMutationQueue.update(records[0].idempotencyKey, { lastError: 'same active row' });
    expect(await db.offlineQueue.get(records[0].idempotencyKey)).toEqual({ ...records[0], lastError: 'same active row' });
    expect(await db.table('offlineQueue').count()).toBe(0);
    db.close();
    await db.open();
    expect(db.offlineQueue).toBe(db.offlineMutationQueue);
    expect(await db.offlineQueue.count()).toBe(3);
  });

  it('rolls back every copy and preserves v2 after a failure inside the upgrade transaction', async () => {
    await legacy(2);
    const db = current();
    // Public table hook injects a storage failure after the other cache copies started.
    db.table('offlineMutationQueue').hook('creating', () => { throw new Error('fixture upgrade failure'); });
    await expect(db.open()).rejects.toThrow('fixture upgrade failure');
    db.close();
    const old = new Dexie(name);
    connections.push(old);
    await old.open();
    expect(old.verno).toBe(2);
    expect(old.tables.map((t) => t.name).sort()).toEqual([...Object.keys(legacySchema), 'catalogCache'].sort());
    expect(await old.table('offlineQueue').toArray()).toEqual(records);
    expect(await old.table('pacientes').toArray()).toEqual(patients);
    expect(await old.table('serviciosOdontologicos').toArray()).toEqual(services);
    expect(await old.table('ordenesCobro').toArray()).toEqual(orders);
    expect(await old.table('catalogCache').toArray()).toEqual(catalogs);
    old.close();
    const retry = current();
    await retry.open();
    expect(await retry.offlineMutationQueue.toArray()).toEqual(records);
  });
});
