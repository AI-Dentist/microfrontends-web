import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Reactive view of `navigator.onLine` plus a hook to react when connectivity comes back. */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly onlineSignal = signal(globalThis.navigator?.onLine ?? true);
  private readonly reconnectHandlers = new Set<() => void>();

  readonly online = this.onlineSignal.asReadonly();

  constructor() {
    const onOnline = () => {
      this.onlineSignal.set(true);
      this.reconnectHandlers.forEach((handler) => handler());
    };
    const onOffline = () => this.onlineSignal.set(false);
    globalThis.addEventListener?.('online', onOnline);
    globalThis.addEventListener?.('offline', onOffline);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener?.('online', onOnline);
      globalThis.removeEventListener?.('offline', onOffline);
    });
  }

  isOnline(): boolean {
    const online = globalThis.navigator?.onLine ?? true;
    if (online !== this.onlineSignal()) {
      this.onlineSignal.set(online);
    }
    return online;
  }

  onReconnect(handler: () => void): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }
}
