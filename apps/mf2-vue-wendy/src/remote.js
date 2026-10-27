import { createApp, shallowReactive } from 'vue';
import App from './App.vue';
import { createLifecycle } from './lifecycle.js';

export const contractVersion = 1;
export const mount = createLifecycle((context) => {
  const runtimeContext = shallowReactive({ ...context });
  const app = createApp(App, { context: runtimeContext });
  let mounted = false;
  let target;
  return {
    mount(container) {
      target = container;
      app.mount(container);
      mounted = true;
    },
    update(nextContext) { Object.assign(runtimeContext, nextContext); },
    unmount() {
      if (mounted) app.unmount();
      target?.replaceChildren();
    },
  };
});
