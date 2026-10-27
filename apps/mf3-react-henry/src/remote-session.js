const tabs = ['consulta', 'crear', 'actualizar', 'conectividad'];

export function tabFromContext(context) {
  if (context.contractVersion !== 1) throw new Error('Unsupported contract version');
  const { basePath, path } = context;
  if (typeof basePath !== 'string' || !/^\/[a-z0-9-]+$/i.test(basePath)) throw new Error('Invalid basePath');
  if (typeof path !== 'string' || /[\\#\s]|%2e|%2f|%5c/i.test(path) || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid path');
  const pathname = new URL(path, 'https://remote.invalid').pathname;
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) throw new Error('Invalid path outside basePath');
  const tab = pathname.slice(basePath.length + 1);
  return tabs.includes(tab) ? tab : 'consulta';
}

export function navigateTab(context, tab) {
  tabFromContext(context);
  if (!tabs.includes(tab)) throw new Error('Invalid tab');
  context.onNavigate(`${context.basePath}/${tab}`);
}

// Renderer injection keeps lifecycle semantics testable without a browser/global DOM.
export function mountRemote(container, context, createRenderer) {
  tabFromContext(context);
  const basePath = context.basePath;
  const renderer = createRenderer(container);
  let disposed = false;
  try { renderer.render(context); } catch (error) { renderer.unmount(); throw error; }
  return {
    update(nextContext) {
      if (disposed) return;
      if (nextContext.basePath !== basePath) throw new Error('Cannot change basePath');
      tabFromContext(nextContext);
      renderer.render(nextContext);
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      renderer.unmount();
    },
  };
}
