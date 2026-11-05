import { ErpRuntimeContext } from './erp-runtime-context';

describe('ErpRuntimeContext retirement controls', () => {
  const endpoint = 'https://api.example/graphql';
  const retiredMessage = 'La sesión del host ya no autoriza este ERP. Vuelva a abrir la aplicación.';

  it.each(['missing', 'throwing'])('permanently retires after a %s host capability', (failure) => {
    let valid = false;
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => {
      if (valid) return 'synthetic-credential';
      if (failure === 'throwing') throw new Error('synthetic failure');
      return null;
    } });
    expect(runtime.retired).toBe(false);
    expect(() => runtime.credential()).toThrow(retiredMessage);
    expect(runtime.retired).toBe(true);
    valid = true;
    expect(() => runtime.credential()).toThrow(retiredMessage);
    expect(() => runtime.bind('owner')).toThrow(retiredMessage);
  });

  it('permanently retires when a different principal is bound', () => {
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => 'synthetic-credential' });
    runtime.bind('owner');
    runtime.bind('owner');
    expect(runtime.credential()).toBe('synthetic-credential');
    expect(() => runtime.bind('other-owner')).toThrow(retiredMessage);
    expect(runtime.retired).toBe(true);
    expect(() => runtime.bind('owner')).toThrow(retiredMessage);
    expect(() => runtime.credential()).toThrow(retiredMessage);
  });

  it('keeps standalone mode explicit without a host credential or hosted cache mode', () => {
    const runtime = new ErpRuntimeContext();
    expect(runtime.hosted).toBe(false);
    expect(runtime.cacheMode).toBeUndefined();
    expect(runtime.retired).toBe(false);
    expect(() => runtime.credential()).toThrow('Runtime ERP independiente: no hay capacidad de host.');
    expect(runtime.retired).toBe(false);
  });

  it('notifies each subscription once, allows unsubscribe, and immediately notifies late subscribers', () => {
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => 'synthetic-credential' });
    const listener = vi.fn();
    const removed = vi.fn();
    runtime.onRetire(listener);
    runtime.onRetire(listener);
    const unsubscribe = runtime.onRetire(removed);
    unsubscribe();
    runtime.retire();
    runtime.retire();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(removed).not.toHaveBeenCalled();
    const late = vi.fn();
    runtime.onRetire(late);
    expect(late).toHaveBeenCalledOnce();
    expect(runtime.retired).toBe(true);
    expect(() => runtime.credential()).toThrow(retiredMessage);
  });

  it('isolates listener failures and preserves the credential error and other notifications', () => {
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => null });
    const next = vi.fn();
    runtime.onRetire(() => { throw new Error('synthetic listener error'); });
    runtime.onRetire(next);
    expect(() => runtime.credential()).toThrow(retiredMessage);
    expect(next).toHaveBeenCalledOnce();
    expect(runtime.retired).toBe(true);
    expect(() => runtime.onRetire(() => { throw new Error('synthetic late error'); })).not.toThrow();
    expect(() => runtime.credential()).toThrow(retiredMessage);
  });

  it('remains retired after repeated explicit retirement', () => {
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: endpoint, getAccessToken: () => 'synthetic-credential' });
    runtime.bind('owner');
    runtime.retire();
    runtime.retire();
    expect(runtime.retired).toBe(true);
    expect(() => runtime.credential()).toThrow(retiredMessage);
    expect(() => runtime.bind('owner')).toThrow(retiredMessage);
  });
});
