const tabs = ['citas', 'horarios', 'stock'];

function validateContext(context, basePath = context?.basePath) {
  if (context?.contractVersion !== 1) throw new Error('Unsupported contract version');
  if (context.basePath !== basePath || !/^\/[a-zA-Z0-9_-]+$/.test(basePath)) {
    throw new Error('Invalid or changed basePath');
  }
  const path = context.path;
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
      /[\\\s#]|%(?:2e|2f|5c|25)/i.test(path)) throw new Error('Invalid remote path');
  const pathname = path.split('?')[0];
  if (new URL(path, 'https://remote.invalid').pathname !== pathname ||
      !(pathname === basePath || pathname.startsWith(basePath + '/'))) {
    throw new Error('Path outside remote basePath');
  }
  if (typeof context.apiBaseUrl !== 'string' || !context.apiBaseUrl ||
      typeof context.getAccessToken !== 'function' || typeof context.onNavigate !== 'function') {
    throw new Error('Invalid remote capabilities');
  }
}

// The root adapter is injected so lifecycle behavior is testable without a DOM.
export function createLifecycle(createRoot) {
  return function mount(container, context) {
    validateContext(context);
    const basePath = context.basePath;
    const root = createRoot(context);
    try { root.mount(container); }
    catch (error) { root.unmount(); throw error; }
    let active = true;
    return {
      update(nextContext) {
        if (!active) return;
        validateContext(nextContext, basePath);
        root.update(nextContext);
      },
      unmount() {
        if (!active) return;
        active = false;
        root.unmount();
      },
    };
  };
}

export function tabForContext(context) {
  if (!context) return 'citas';
  const tab = context.path.split('?')[0].slice(context.basePath.length + 1);
  return tabs.includes(tab) ? tab : 'citas';
}

export function navigateTab(context, tab) {
  if (!tabs.includes(tab)) throw new Error('Unknown tab');
  if (context?.onNavigate) context.onNavigate(`${context.basePath}/${tab}`);
  else return tab;
}
