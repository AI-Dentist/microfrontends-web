# Dental microfrontend platform

One Angular shell composes three independently built and deployed applications:
Angular ERP, Vue Operations, and React Clinical. A trusted HTTP runtime manifest
selects their releases and API gateway URLs without rebuilding the shell.

## Quick start

Use a Node version supported by Angular 22 and pnpm 10.32.1, plus npm.
No root dependencies or root lockfile are needed.

```sh
node scripts/platform.mjs install
node scripts/platform.mjs build
node scripts/platform.mjs dev
```

Open the ephemeral loopback URL printed by `dev`. This serves **built artifacts**,
not hot reload; rebuild to change code. Ctrl+C closes all owned listeners. API
requests return 503 until you configure a gateway; this server never proxies to a
backend. Use each application's own development command for hot reload.

Commands can target one app, for example `node scripts/platform.mjs build operations`.
IDs are `erp`, `shell`, `operations`, and `clinical`. Omit the ID to run sequentially
for all apps; failures stop immediately and return a nonzero exit code. `dev`
always composes all four. `node scripts/platform.mjs help` shows usage.

## Architecture

| App | Runtime boundary | Source |
| --- | --- | --- |
| Shell | Angular navigation, manifest validation, failure UI | [apps/shell](apps/shell/README.md) |
| ERP | Angular Native Federation `./Routes`, compatible shared singletons | [apps/mf-erp](apps/mf-erp/README.md) |
| Operations | Self-contained Vue ESM lifecycle in host Shadow DOM | [apps/mf2-vue-wendy](apps/mf2-vue-wendy/README.md) |
| Clinical | Self-contained React ESM lifecycle in host Shadow DOM | [apps/mf3-react-henry](apps/mf3-react-henry/README.md) |

The [v1 contract](packages/mfe-contract/README.md) shares compile-time declarations,
not framework state. Shell owns URLs/history and passes navigation, API, and an
on-demand token capability. Shadow DOM isolates Vue/React styles, not privileges.
Each remote is trusted code with host-page capabilities. ERP styles are global.

## Verify

```sh
node --test scripts/test/*.test.mjs
node scripts/platform.mjs test
node scripts/platform-smoke.mjs
```

Build all artifacts before the browser smoke. It uses the ERP-installed Playwright
and browser under `apps/mf-erp/node_modules/.cache/playwright`; it never downloads
browsers. Missing artifacts or a missing browser fail, not skip. It owns ephemeral
HTTP servers and fresh browser contexts, blocks external models/service workers,
and fulfills API reads locally. No real backend requests or writes are permitted.
It checks real remote rendering, release origins, shell style isolation, navigation,
deep-link reloads, repeated mounts, an unavailable remote, and standalone headings.

See the [deployment and rollback guide](docs/platform-deployment.md) for per-app
commands, artifact paths, cache/CORS/CSP rules, and identity/readiness limitations.
No deployment or production authentication is implied by local smoke results.
