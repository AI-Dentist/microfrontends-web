import { erpLocalDb } from './dexie.db';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

function authorizationRejected(error: any): boolean {
  if (CombinedGraphQLErrors.is(error)) {
    // A GraphQL rejection is not an outage. Never mask BAD_REQUEST as stale success,
    // including responses where code and classification disagree.
    return true;
  }
  return [401, 403].includes(error?.status ?? error?.statusCode) ||
    !!error?.cause && authorizationRejected(error.cause) ||
    !!error?.errorType && authorizationRejected(error.errorType);
}

export interface CachedCatalog<T> {
  data: T;
  fromCache: boolean;
}

/**
 * Network-first read of a catalog with its last copy kept in IndexedDB, so screens keep
 * showing data offline or when MS1 is down. Offline it never calls the server.
 */
export async function cachedCatalog<T>(
  key: string,
  fetcher: () => Promise<T>,
  { online, identity }: { online: boolean; identity?: string },
): Promise<CachedCatalog<T>> {
  const table = erpLocalDb().catalogCache;
  if (['empresa', 'usuarios', 'logs'].includes(key)) {
    if (!identity) throw new Error('Se requiere una sesión vigente para acceder al catálogo');
    key = JSON.stringify([identity, key]);
  }
  if (online) {
    let data: T;
    try {
      data = await fetcher();
    } catch (error) {
      if (authorizationRejected(error)) {
        await table.delete(key).catch(() => undefined);
        throw error;
      }
      const cached = await table.get(key);
      if (!cached) {
        throw error;
      }
      return { data: cached.data as T, fromCache: true };
    }
    // Persistence failure must not discard a successful network response.
    await table.put({ key, data, updatedAt: new Date().toISOString() }).catch(() => undefined);
    return { data, fromCache: false };
  }
  const cached = await table.get(key);
  if (!cached) {
    throw new Error('Sin conexión y sin copia local de este catálogo');
  }
  return { data: cached.data as T, fromCache: true };
}
