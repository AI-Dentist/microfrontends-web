import { initFederation } from '@angular-architects/native-federation';
import { validateConfig } from './runtime-config.mjs';
import { bounded } from './remote-runtime.mjs';

async function start() {
  const response = await bounded(fetch('/platform-config.json', { cache: 'no-store' }));
  if (!response.ok) throw Error('Configuration unavailable');
  const config = validateConfig(await bounded(response.json()));
  // Empty remote manifest: an ERP outage must not block bootstrap or other apps.
  await bounded(initFederation({}));
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(config);
}
void start().catch(() => {
  const root = document.querySelector('platform-shell')!;
  const title = document.createElement('h1'); title.textContent = 'Platform configuration unavailable';
  const message = document.createElement('p'); message.textContent = 'The platform could not start. Contact your deployment operator or retry.';
  const retry = document.createElement('button'); retry.textContent = 'Reload'; retry.onclick = () => location.reload();
  root.replaceChildren(title, message, retry); root.setAttribute('role', 'alert');
});
