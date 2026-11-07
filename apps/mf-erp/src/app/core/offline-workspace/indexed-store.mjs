// IndexedDB adapter for the encrypted vault port. Records are opaque ciphertext.
const DB = 'erp-offline-vault-v1';
function open(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('vaults')) db.createObjectStore('vaults', { keyPath: 'scopeId' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function run(db, stores, mode, body) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
    tx.onabort = () => reject(tx.error ?? Error('indexeddb-abort'));
    value = body(tx);
  });
}
const read = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
/** Device-local, non-secret locator. It is not a credential and holds no identity. */
export async function readDeviceMeta(indexedDB) {
  const db = await open(indexedDB);
  try { return (await run(db, ['meta'], 'readonly', tx => read(tx.objectStore('meta').get('device')))) ?? null; }
  finally { db.close(); }
}
export async function writeDeviceMeta(indexedDB, value) {
  const db = await open(indexedDB);
  try {
    return await run(db, ['meta'], 'readwrite', tx => { tx.objectStore('meta').put({ id: 'device', ...value }); });
  } finally { db.close(); }
}
export function createIndexedStore(indexedDB, scopeId) {
  if (!indexedDB || typeof scopeId !== 'string') throw Error('Invalid storage');
  const envelope = async () => {
    const db = await open(indexedDB);
    try { return (await run(db, ['vaults'], 'readonly', tx => read(tx.objectStore('vaults').get(scopeId)))) ?? null; }
    finally { db.close(); }
  };
  return {
    async load() {
      const record = await envelope();
      if (!record) return null;
      const { scopeId: _ignored, ...value } = record;
      return value;
    },
    async create(value) {
      const db = await open(indexedDB);
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
          tx.onabort = () => reject(tx.error ?? Error('indexeddb-abort'));
          // A duplicate scope raises ConstraintError and aborts; the vault never
          // overwrites an existing workspace for the same scope.
          tx.objectStore('vaults').add({ scopeId, ...value });
        });
      } finally { db.close(); }
    },
    async replaceContext(keyId, revision, context, clock) {
      const db = await open(indexedDB);
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          const store = tx.objectStore('vaults');
          let next;
          tx.oncomplete = () => resolve(next);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? Error('stale'));
          const current = store.get(scopeId);
          current.onsuccess = () => {
            const record = current.result;
            if (!record || record.keyId !== keyId || record.revision !== revision || record.retired) { tx.abort(); return; }
            next = revision + 1;
            store.put({ ...record, context: structuredClone(context), clock: clock ? structuredClone(clock) : record.clock, revision: next });
          };
        });
      } finally { db.close(); }
    },
    async relink(keyId, revision, context, clock) {
      const db = await open(indexedDB);
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          const store = tx.objectStore('vaults');
          let next;
          tx.oncomplete = () => resolve(next);
          tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
          tx.onabort = () => reject(tx.error ?? Error('indexeddb-abort'));
          const current = store.get(scopeId);
          current.onsuccess = () => {
            const record = current.result;
            if (!record || record.keyId !== keyId || record.revision !== revision || !record.retired) { tx.abort(); return; }
            next = revision + 1;
            store.put({ ...record, retired: false, context: structuredClone(context), clock: clock ? structuredClone(clock) : record.clock, revision: next });
          };
        });
      } finally { db.close(); }
    },
    /**
     * Atomic attempt claim: the counter read, the increment and the wait stamp happen
     * inside one readwrite transaction, so concurrent attempts serialize. Only the
     * first attempt of a wait window is allowed to derive; a denied claim changes
     * nothing. Charging BEFORE key derivation is what makes the throttle burst-safe.
     */
    async chargeAttempt(nowWall) {
      const db = await open(indexedDB);
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          const store = tx.objectStore('vaults');
          let claim = { allowed: false, missing: true, clock: null };
          tx.oncomplete = () => resolve(claim);
          tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
          tx.onabort = () => reject(tx.error ?? Error('indexeddb-abort'));
          const current = store.get(scopeId);
          current.onsuccess = () => {
            const record = current.result;
            if (!record) return;
            const clock = record.clock ?? {};
            const waiting = Number.isFinite(clock.nextAttemptAt) ? clock.nextAttemptAt : 0;
            if (waiting > nowWall) { claim = { allowed: false, clock: { ...clock } }; return; }
            const fails = (clock.fails ?? 0) + 1;
            const waitMs = Math.min(1000 * 2 ** (fails - 1), 300000);
            claim = { allowed: true, clock: { ...clock, fails, nextAttemptAt: nowWall + waitMs } };
            store.put({ ...record, clock: claim.clock });
          };
        });
      } finally { db.close(); }
    },
    async clearPenalty() {
      const db = await open(indexedDB);
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          const store = tx.objectStore('vaults');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
          const current = store.get(scopeId);
          current.onsuccess = () => {
            const record = current.result;
            if (!record || (!record.clock?.fails && !record.clock?.nextAttemptAt)) return;
            store.put({ ...record, clock: { ...record.clock, fails: 0, nextAttemptAt: 0 } });
          };
        });
      } finally { db.close(); }
    },
    async destroy() {
      const db = await open(indexedDB);
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error ?? Error('indexeddb-error'));
          tx.objectStore('vaults').delete(scopeId);
        });
      } finally { db.close(); }
    },
    async retire() {
      const db = await open(indexedDB);
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['vaults'], 'readwrite');
          const store = tx.objectStore('vaults');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          const current = store.get(scopeId);
          current.onsuccess = () => {
            if (!current.result) return;
            if (current.result.retired) return;
            store.put({ ...current.result, retired: true, revision: current.result.revision + 1 });
          };
        });
      } finally { db.close(); }
    },
  };
}
