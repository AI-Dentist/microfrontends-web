import { initFederation } from '@angular-architects/native-federation';
import { validateConfig } from './runtime-config.mjs';
import { bounded } from './remote-runtime.mjs';

// Typed interop stays local: these browser JS modules have runtime validators,
// while the project's TS program intentionally excludes JavaScript sources.
type PublicState = { ready: boolean; version: string | null };
type PublicBinding = { release: { version: string; runtimePolicy: { targets: string[]; contracts?: string[] } }; controller: ServiceWorker; scriptURL: string };
type PublicReleaseApi = {
  activePublicRelease(config: ReturnType<typeof validateConfig>): Promise<PublicBinding | null>;
  registerPublicCandidate(config: ReturnType<typeof validateConfig>): Promise<void>;
};
type PublicLoaderApi = {
  createPublicLoader(binding: PublicBinding, state: PublicState): { loadModuleFn(target: string): Promise<unknown>; markReady(): void; dispose(): void };
};

async function start() {
  // The literals remain statically bundled after TS erases these type assertions.
  const { activePublicRelease, registerPublicCandidate } = await import('./erp-public-release.mjs' as string) as PublicReleaseApi;
  const { createPublicLoader } = await import('./erp-public-loader.mjs' as string) as PublicLoaderApi;
  const response = await bounded(fetch('/platform-config.json', { cache: 'no-store' }));
  if (!response.ok) throw Error('Configuration unavailable');
  const config = validateConfig(await bounded(response.json()));
  // Resource completion alone is not active-client runtime readiness.
  const state = { ready: false, version: null as string | null };
  (window as any).erpPublicRuntime = state;
  void registerPublicCandidate(config);
  const binding = await activePublicRelease(config);
  const guard = binding ? createPublicLoader(binding, state) : null;
  if (binding) state.version = binding.release.version;
  // Empty remote manifest: an ERP outage must not block bootstrap or other apps.
  if (guard) {
    try {
      await bounded(initFederation({}, { loadModuleFn: guard.loadModuleFn }));
      guard.markReady();
    } catch (error) {
      guard.dispose();
      throw error;
    }
  } else {
    await bounded(initFederation({}));
  }
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
