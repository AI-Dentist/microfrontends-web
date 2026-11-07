// Offline workspace orchestration: activation, unlock and retirement.
// No API credential is stored; the PIN never leaves this device.
import {activateOnlineGrant} from './activation.mjs';
import {OfflineVault, workspaceScopeId} from './vault.mjs';
import {createIndexedStore, readDeviceMeta, writeDeviceMeta} from './indexed-store.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const newId = () => crypto.randomUUID();
const coded = code => Object.assign(Error(code), { code });
export class OfflineWorkspace {
  #indexedDB; #clock; #getOnlineContext; #endpoint; #fetcher; #meta = null; #vault = null; #listeners = new Set();
  constructor({indexedDB, clock, getOnlineContext, endpoint, fetcher = globalThis.fetch}) {
    if (!indexedDB || typeof getOnlineContext !== 'function' || typeof clock?.wall !== 'function' || typeof clock?.mono !== 'function') throw Error('InvalidOfflineWorkspace');
    this.#indexedDB = indexedDB; this.#clock = clock; this.#getOnlineContext = getOnlineContext; this.#endpoint = endpoint; this.#fetcher = fetcher;
  }
  #emit(state) { for (const listener of this.#listeners) { try { listener(state); } catch { /* a listener cannot break the vault */ } } }
  #identity() {
    try {
      const value = this.#getOnlineContext();
      return value && typeof value.identityIssuer === 'string' && typeof value.identitySubject === 'string'
        ? {issuer: value.identityIssuer, subject: value.identitySubject, epoch: value.epoch} : null;
    } catch { return null; }
  }
  /** Device meta is a non-secret locator; it never contains identity, tokens or plaintext. */
  async #device() {
    if (!this.#meta) this.#meta = await readDeviceMeta(this.#indexedDB);
    return this.#meta;
  }
  /** The record is the source of truth: repair a locator that disagrees with it. */
  async #reconcile(meta) {
    if (!meta?.scopeId) return meta;
    let record = null;
    try { record = await createIndexedStore(this.#indexedDB, meta.scopeId).load(); } catch { return meta; }
    if (!record) return meta;
    if (Boolean(record.retired) !== Boolean(meta.retired)) {
      const repaired = { ...meta, retired: Boolean(record.retired) };
      try { await writeDeviceMeta(this.#indexedDB, repaired); this.#meta = repaired; return repaired; } catch { return meta; }
    }
    return meta;
  }
  async status() {
    const meta = await this.#reconcile(await this.#device());
    if (!meta?.scopeId) return Object.freeze({status: 'unconfigured', capabilities: Object.freeze([]), actorVerified: false});
    if (meta.retired && !this.#vault) return Object.freeze({status: 'retired', capabilities: Object.freeze([]), actorVerified: false});
    if (this.#vault) return Object.freeze({...this.#vault.state(), ...(this.#identity() ? {actorVerified: true} : {actorVerified: false})});
    return Object.freeze({status: 'locked', capabilities: Object.freeze([]), actorVerified: false, requiresPin: true, expiresAtMs: this.#vault?.expiresAtMs ?? null});
  }
  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  /** Explicit online activation. Requires a live authenticated host session. */
  async activate(pin, {durationSeconds = 28800, workspaceId, deviceId} = {}) {
    const online = this.#getOnlineContext();
    if (!online) throw coded('OFFLINE_ACTIVATION_REQUIRED');
    const existing = await this.#device();
    // A retained record must go through the documented recovery path.
    if (existing?.retired) throw coded('OFFLINE_RETIRED');
    const device = (await this.#device()) ?? {
      workspaceId: workspaceId ?? newId(), deviceId: deviceId ?? newId(),
    };
    const provisioned = await activateOnlineGrant({
      endpoint: this.#endpoint, getOnlineContext: this.#getOnlineContext, workspaceId: device.workspaceId,
      deviceId: device.deviceId, durationSeconds, nowMs: () => this.#clock.wall(), fetcher: this.#fetcher,
    });
    const scopeId = await workspaceScopeId(provisioned.binding);
    const vault = new OfflineVault({store: createIndexedStore(this.#indexedDB, scopeId), scopeId, clock: this.#clock, getIdentity: () => this.#identity()});
    try { await vault.activate(provisioned, pin); }
    catch (error) {
      // Never orphan existing ciphertext: keep the linkage and let reconcile fix the flag.
      this.#meta = null; this.#vault = null;
      const record = await createIndexedStore(this.#indexedDB, scopeId).load().catch(() => null);
      if (record) {
        await writeDeviceMeta(this.#indexedDB, { workspaceId: device.workspaceId, deviceId: device.deviceId, scopeId, retired: Boolean(record.retired) }).catch(() => {});
      } else {
        await writeDeviceMeta(this.#indexedDB, { workspaceId: device.workspaceId, deviceId: device.deviceId, scopeId: null, retired: false }).catch(() => {});
      }
      throw error;
    }
    await writeDeviceMeta(this.#indexedDB, { workspaceId: device.workspaceId, deviceId: device.deviceId, scopeId, retired: false });
    this.#meta = {...device, scopeId, retired: false};
    this.#vault = vault;
    const state = await this.status(); this.#emit(state); return state;
  }
  async unlock(pin) {
    const meta = await this.#device();
    if (!meta?.scopeId) throw coded('OFFLINE_UNCONFIGURED');
    if (meta.retired) throw coded('OFFLINE_RETIRED');
    const vault = new OfflineVault({store: createIndexedStore(this.#indexedDB, meta.scopeId), scopeId: meta.scopeId, clock: this.#clock, getIdentity: () => this.#identity()});
    await vault.unlock(pin);
    this.#vault = vault;
    const state = await this.status(); this.#emit(state); return state;
  }
  /** Re-links a retained record after the original owner authenticates again online. */
  async reactivate(pin, { durationSeconds = 28800 } = {}) {
    const online = this.#getOnlineContext();
    if (!online) throw coded('OFFLINE_ACTIVATION_REQUIRED');
    const device = await this.#reconcile(await this.#device());
    if (!device?.scopeId || !device.retired) throw coded('OFFLINE_UNCONFIGURED');
    const provisioned = await activateOnlineGrant({
      endpoint: this.#endpoint, getOnlineContext: this.#getOnlineContext, workspaceId: device.workspaceId,
      deviceId: device.deviceId, durationSeconds, nowMs: () => this.#clock.wall(), fetcher: this.#fetcher,
    });
    const scopeId = await workspaceScopeId(provisioned.binding);
    if (scopeId !== device.scopeId) throw coded('OFFLINE_GRANT_INVALID');
    const vault = new OfflineVault({ store: createIndexedStore(this.#indexedDB, scopeId), scopeId, clock: this.#clock, getIdentity: () => this.#identity() });
    await vault.relink(provisioned, pin);
    await writeDeviceMeta(this.#indexedDB, { workspaceId: device.workspaceId, deviceId: device.deviceId, scopeId, retired: false });
    this.#meta = { ...device, retired: false };
    this.#vault = vault;
    const state = await this.status(); this.#emit(state); return state;
  }
  /** Explicit destructive action: destroys the encrypted record. */
  async purge() {
    const meta = await this.#device();
    if (meta?.scopeId) await new OfflineVault({ store: createIndexedStore(this.#indexedDB, meta.scopeId), scopeId: meta.scopeId, clock: this.#clock, getIdentity: () => this.#identity() }).purge();
    await writeDeviceMeta(this.#indexedDB, { workspaceId: meta?.workspaceId ?? null, deviceId: meta?.deviceId ?? null, scopeId: null, retired: false });
    this.#meta = null; this.#vault = null;
    const state = await this.status(); this.#emit(state); return state;
  }
  lock() { const state = this.#vault?.lock() ?? {status: 'locked', capabilities: []}; this.#emit(state); return state; }
  async retire() {
    const persisted = await this.#device();
    const scope = persisted?.scopeId;
    // Retire by the persisted scope even without a loaded vault instance.
    const target = this.#vault ?? (scope ? new OfflineVault({ store: createIndexedStore(this.#indexedDB, scope), scopeId: scope, clock: this.#clock, getIdentity: () => this.#identity() }) : null);
    const state = target ? await target.retire() : {status: 'locked', capabilities: []};
    // Clear the locator so the encrypted record is not silently reused; ciphertext stays.
    await writeDeviceMeta(this.#indexedDB, { workspaceId: persisted?.workspaceId ?? null, deviceId: persisted?.deviceId ?? null, scopeId: scope ?? null, retired: true });
    this.#meta = persisted ? { ...persisted, retired: true } : null; this.#vault = null;
    const finalState = await this.status(); this.#emit(finalState); return finalState;
  }
}
export function createOfflineWorkspace(options) {
  if (!options || !UUID.test(String(options.workspaceId ?? '00000000-0000-4000-8000-000000000000'))) { /* ids are created internally */ }
  return new OfflineWorkspace({...options, indexedDB: options?.indexedDB ?? globalThis.indexedDB, clock: options?.clock ?? {wall: () => Math.floor(Date.now()), mono: () => Math.floor(performance.now())}});
}
