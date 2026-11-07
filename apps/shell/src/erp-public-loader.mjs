/** Confine the federation instance to its verified controlling worker. */
export function createPublicLoader(binding, state) {
  const { release, controller, scriptURL } = binding;
  const serviceWorker = navigator.serviceWorker;
  const targets = new Set(release.runtimePolicy.targets);
  let violated = false, stale = false;
  function invalidate() {
    stale = true;
    state.ready = false;
    serviceWorker.removeEventListener('controllerchange', invalidate);
  }
  serviceWorker.addEventListener('controllerchange', invalidate);
  function current() {
    if (stale || serviceWorker.controller !== controller || controller.scriptURL !== scriptURL) {
      invalidate();
      return false;
    }
    return true;
  }
  function assertTarget(target) {
    if (!current() || typeof target !== 'string' || !targets.has(target)) {
      violated = true;
      state.ready = false;
      throw Error('Public federation target unavailable');
    }
  }
  const needsShim = release.runtimePolicy.contracts?.includes('es-module-shims-fetch-v1');
  const onlineBases = release.runtimePolicy.contracts?.includes('configured-module-remotes-v1')
    ? (release.publicBootConfig?.remotes ?? []).filter(r => r.kind === 'module').map(r => new URL('.', r.entry).href) : [];
  function assertShimTarget(target) {
    if (targets.has(target)) return assertTarget(target);
    if (current() && typeof target === 'string') {
      const url = new URL(target);
      // Other platform modules retain their original online-only public roots.
      // They are neither added to the ERP cache nor admitted by loadModuleFn.
      if (!/[\\%?#\s]/u.test(target) && !url.username && !url.password && /\.(?:m?js|css)$/u.test(url.pathname)
        && !/(?:^|\/)(?:api|graphql|auth|oauth|token|private)(?:\/|$)/iu.test(url.pathname)
        && onlineBases.some(base => url.href.startsWith(base))) return;
    }
    violated = true; state.ready = false;
    throw Error('Public module target unavailable');
  }
  if (globalThis.__erpPublicShimFetchHook === true) globalThis.__erpPublicModuleTarget = assertShimTarget;
  return {
    async loadModuleFn(target) {
      assertTarget(target);
      if (typeof globalThis.importShim !== 'function') { violated = true; state.ready = false; throw Error('Public shim unavailable'); }
      try {
        const module = await globalThis.importShim(target);
        assertTarget(target);
        return module;
      } catch (error) {
        violated = true; state.ready = false;
        throw error;
      }
    },
    markReady() {
      const shimBound = !needsShim || (globalThis.__erpPublicShimFetchHook === true && globalThis.__erpPublicModuleTarget === assertShimTarget);
      if (current() && !violated && shimBound) state.ready = true;
    },
    dispose: invalidate,
  };
}
