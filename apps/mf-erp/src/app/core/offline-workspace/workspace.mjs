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
  async status() {
    const meta = await this.#device();
    if (!meta?.scopeId) return Object.freeze({status: 'unconfigured', capabilities: Object.freeze([]), actorVerified: false});
    if (this.#vault) return Object.freeze({...this.#vault.state(), ...(this.#identity() ? {actorVerified: true} : {actorVerified: false})});
    return Object.freeze({status: 'locked', capabilities: Object.freeze([]), actorVerified: false, requiresPin: true});
  }
  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  /** Explicit online activation. Requires a live authenticated host session. */
  async activate(pin, {durationSeconds = 28800, workspaceId, deviceId} = {}) {
    const online = this.#getOnlineContext();
    if (!online) throw coded('OFFLINE_ACTIVATION_REQUIRED');
    const device = (await this.#device()) ?? {
      workspaceId: workspaceId ?? newId(), deviceId: deviceId ?? newId(),
    };
    const provisioned = await activateOnlineGrant({
      endpoint: this.#endpoint, getOnlineContext: this.#getOnlineContext, workspaceId: device.workspaceId,
      deviceId: device.deviceId, durationSeconds, nowMs: () => this.#clock.wall(), fetcher: this.#fetcher,
    });
    const scopeId = await workspaceScopeId(provisioned.binding);
    await writeDeviceMeta(this.#indexedDB, {workspaceId: device.workspaceId, deviceId: device.deviceId, scopeId});
    this.#meta = {...device, scopeId};
    const vault = new OfflineVault({store: createIndexedStore(this.#indexedDB, scopeId), scopeId, clock: this.#clock, getIdentity: () => this.#identity()});
    await vault.activate(provisioned, pin);
    this.#vault = vault;
    const state = await this.status(); this.#emit(state); return state;
  }
  async unlock(pin) {
    const meta = await this.#device();
    if (!meta?.scopeId) throw coded('OFFLINE_UNCONFIGURED');
    const vault = new OfflineVault({store: createIndexedStore(this.#indexedDB, meta.scopeId), scopeId: meta.scopeId, clock: this.#clock, getIdentity: () => this.#identity()});
    await vault.unlock(pin);
    this.#vault = vault;
    const state = await this.status(); this.#emit(state); return state;
  }
  lock() { const state = this.#vault?.lock() ?? {status: 'locked', capabilities: []}; this.#emit(state); return state; }
  async retire() {
    const state = this.#vault ? await this.#vault.retire() : {status: 'locked', capabilities: []};
    // Clear the locator so the encrypted record is not silently reused; ciphertext stays.
    await writeDeviceMeta(this.#indexedDB, {workspaceId: this.#meta?.workspaceId ?? null, deviceId: this.#meta?.deviceId ?? null, scopeId: null});
    this.#meta = null; this.#vault = null; this.#emit(state); return state;
  }
}
export function createOfflineWorkspace(options) {
  if (!options || !UUID.test(String(options.workspaceId ?? '00000000-0000-4000-8000-000000000000'))) { /* ids are created internally */ }
  return new OfflineWorkspace({...options, indexedDB: options?.indexedDB ?? globalThis.indexedDB, clock: options?.clock ?? {wall: () => Math.floor(Date.now()), mono: () => Math.floor(performance.now())}});
}
