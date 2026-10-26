import Dexie, { Table } from 'dexie';

export type OfflineMutationStatus = 'PENDING_SYNC' | 'SYNCED' | 'FAILED';

export interface OfflineMutationRecord {
  /** Absent on legacy records: those remain quarantined in place, never claimed. */
  ownerPrincipal?: string;
  idempotencyKey: string; // Unique UUID generated when the user clicked the button
  mutationName: string; // e.g. 'CobrarCuotaEnEfectivo' | 'RegistrarEgresoCaja'
  variables: any;
  createdAt: string;
  status: OfflineMutationStatus;
  lastError?: string;
  syncedAt?: string;
}

/** Last known copy of a catalog without its own table (doctors, specialties, offices, company...). */
export interface CatalogCacheRecord {
  key: string;
  data: unknown;
  updatedAt: string;
}

export class ErpLocalDatabase extends Dexie {
  pacientesCache!: Table<any, string>;
  serviciosCache!: Table<any, string>;
  offlineMutationQueue!: Table<OfflineMutationRecord, string>;
  ordenesCobro!: Table<any, string>;
  catalogCache!: Table<CatalogCacheRecord, string>;

  // Prototype getters prevent Dexie from installing own legacy table properties.
  // Existing consumers use the canonical stores; table('offlineQueue') is backup only.
  get pacientes(): Table<any, string> { return this.pacientesCache; }
  get serviciosOdontologicos(): Table<any, string> { return this.serviciosCache; }
  get offlineQueue(): Table<OfflineMutationRecord, string> { return this.offlineMutationQueue; }

  constructor(name = 'DentalErpOfflineDB') {
    super(name);
    this.version(1).stores({
      pacientes: 'id, ciNit, nombres, apellidos',
      serviciosOdontologicos: 'id, codigo, nombre',
      ordenesCobro: 'id, pacienteId, estado',
      offlineQueue: 'idempotencyKey, mutationName, status, createdAt',
    });
    // Additive migration: v1 stores stay exactly as specified.
    this.version(2).stores({
      catalogCache: 'key',
    });
    // Keep historical definitions and stores intact. Copy complete records, including
    // unknown operational metadata and ownerless entries, in the upgrade transaction.
    // bulkAdd deliberately aborts on conflicts rather than overwriting financial data.
    this.version(3).stores({
      pacientesCache: 'id, ciNit, nombres, apellidos',
      serviciosCache: 'id, codigo, nombre',
      offlineMutationQueue: 'idempotencyKey, mutationName, status, createdAt',
    }).upgrade(async (tx) => {
      await tx.table('pacientesCache').bulkAdd(await tx.table('pacientes').toArray());
      await tx.table('serviciosCache').bulkAdd(await tx.table('serviciosOdontologicos').toArray());
      await tx.table('offlineMutationQueue').bulkAdd(await tx.table('offlineQueue').toArray());
    });
  }
}

let database: ErpLocalDatabase | undefined;

/** Lazily opens the single IndexedDB connection shared by the ERP. */
export function erpLocalDb(): ErpLocalDatabase {
  database ??= new ErpLocalDatabase();
  return database;
}
