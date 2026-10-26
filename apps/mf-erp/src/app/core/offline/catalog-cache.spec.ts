import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { erpLocalDb } from './dexie.db';
import { cachedCatalog } from './catalog-cache';

describe('cachedCatalog', () => {
  beforeEach(async () => {
    await erpLocalDb().catalogCache.clear();
  });

  it('returns fresh data and stores it while online', async () => {
    const result = await cachedCatalog('especialidades', async () => [{ id: '1' }], { online: true });
    expect(result).toEqual({ data: [{ id: '1' }], fromCache: false });
    expect((await erpLocalDb().catalogCache.get('especialidades'))?.data).toEqual([{ id: '1' }]);
  });

  it('serves the stored copy when offline without calling the server', async () => {
    await cachedCatalog('consultorios', async () => [{ id: 'a' }], { online: true });
    const fetcher = vi.fn(async () => [{ id: 'b' }]);
    expect(await cachedCatalog('consultorios', fetcher, { online: false })).toEqual({ data: [{ id: 'a' }], fromCache: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the stored copy when the server call fails', async () => {
    await cachedCatalog('odontologos', async () => [{ id: 'x' }], { online: true });
    const result = await cachedCatalog('odontologos', async () => Promise.reject(new Error('down')), { online: true });
    expect(result).toEqual({ data: [{ id: 'x' }], fromCache: true });
  });

  it('rethrows when there is nothing cached', async () => {
    await expect(cachedCatalog('logs', async () => Promise.reject(new Error('down')), { online: true, identity: 'admin' })).rejects.toThrow('down');
  });

  it('returns the fresh response even when storage is full', async () => {
    vi.spyOn(erpLocalDb().catalogCache, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));
    expect(await cachedCatalog('x', async () => ['fresh'], { online: true })).toEqual({ data: ['fresh'], fromCache: false });
  });

  it('invalidates cache rather than falling back after authorization rejection', async () => {
    await cachedCatalog('x', async () => ['private'], { online: true });
    await expect(cachedCatalog('x', async () => { throw { status: 403 }; }, { online: true })).rejects.toEqual({ status: 403 });
    expect(await erpLocalDb().catalogCache.get('x')).toBeUndefined();
  });

  it.each(['FORBIDDEN', 'BAD_REQUEST'])('never serves protected stale data after GraphQL classification %s', async (classification) => {
    await cachedCatalog('usuarios', async () => ['private'], { online: true, identity: 'admin' });
    const error = new CombinedGraphQLErrors({ errors: [{ message: 'rechazado', extensions: { classification, code: 'BAD_REQUEST' } }] });
    await expect(cachedCatalog('usuarios', async () => { throw error; }, { online: true, identity: 'admin' })).rejects.toBe(error);
    await expect(cachedCatalog('usuarios', async () => [], { online: false, identity: 'admin' })).rejects.toThrow();
  });

  it('isolates protected catalogs by authenticated identity and denies anonymous access', async () => {
    await cachedCatalog('usuarios', async () => ['private'], { online: true, identity: 'admin' });
    await expect(cachedCatalog('usuarios', async () => [], { online: false, identity: 'other' })).rejects.toThrow();
    await expect(cachedCatalog('usuarios', async () => [], { online: false })).rejects.toThrow();
    expect((await cachedCatalog('usuarios', async () => [], { online: false, identity: 'admin' })).data).toEqual(['private']);
  });

  it('keeps the v1 tables of the spec untouched', () => {
    const tables = erpLocalDb().tables.map((t) => [t.name, t.schema.primKey.src, t.schema.indexes.map((i) => i.src)]);
    expect(tables).toEqual(
      expect.arrayContaining([
        ['pacientes', 'id', ['ciNit', 'nombres', 'apellidos']],
        ['serviciosOdontologicos', 'id', ['codigo', 'nombre']],
        ['ordenesCobro', 'id', ['pacienteId', 'estado']],
        ['offlineQueue', 'idempotencyKey', ['mutationName', 'status', 'createdAt']],
      ]),
    );
  });
});
