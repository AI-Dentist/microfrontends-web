# Agenda, horarios y stock (Vue)

## Standalone

`npm ci`, then `npm run dev`. `npm run build` produces the original `dist/`
application; `npm run preview` serves it. Tabs work locally without a host.
The API defaults to `http://localhost:8001/api/agendamiento`; optionally set
`VITE_MS3_API_BASE_URL` in the standalone build environment. Standalone has no fabricated login,
persisted token or Authorization header by default.

## Independently deployed remote

`npm run build:remote` produces `dist-remote/remote.js` and `remote.css`.
Publish both together at an immutable HTTPS release URL. The ESM includes Vue,
has no shared runtime dependency and never imports the standalone entrypoint.
`base: './'` keeps emitted asset references release-relative. Retain old releases
for rollback; the build does not delete previous output, so publish only the
current release's artifacts from a clean build workspace.

The module does not auto-mount. A trusted host imports `contractVersion` (`1`)
and `mount(container, context)` and links `remote.css` inside its own ShadowRoot.
The supplied container must be an HTMLElement inside that root. Existing scoped
App styles are extracted into the stylesheet; no document/global root is used.

Context v1: `{ contractVersion: 1, basePath, path, apiBaseUrl, getAccessToken,
onNavigate }`. See `../../packages/mfe-contract/README.md` for the exact contract.
`mount` returns `{ update(nextContext), unmount() }`. Updates apply the full
context, reject incompatible versions, changed base paths and paths outside the
assigned prefix. Unmount releases Vue, its DOM and pending refresh timer;
repeated unmount and subsequent updates are no-ops. In-flight responses are
ignored after teardown. The host must unmount before reusing a container.

Tabs request `${basePath}/citas`, `/horarios` or `/stock` via `onNavigate`;
`context.path` selects the tab, including after updates. The host owns history.
Runtime API base changes reload data. Every request reads `getAccessToken()`
on demand; tokens are never serialized or stored. POST retains both existing
idempotency headers. Absolute and relative API bases retain their query suffix
when endpoints are appended: `/api/?tenant=one` becomes
`/api/citas?tenant=one`. Query encoding and repeated keys are preserved.
The named `ms3Service` export remains the default standalone factory instance;
use `createMs3Service` for isolated runtime/session configuration.
Every non-2xx response rejects before JSON parsing and the
UI shows a local error rather than reporting a failed write as successful.

Only trusted deployment/host code may supply API bases and token capabilities.
Remote code has host-page privileges: Shadow DOM is style isolation, not a
security sandbox. Operators own HTTPS, API CORS, CSP and real authentication.
Do not put tokens in manifests, environment files, URLs or logs.

## Checks

`node --test test/*.test.mjs` covers public API requests, standalone defaults,
HTTP failures, instance lifecycle and navigation without backend writes.
Run `npm run build` and `npm run build:remote` too. The host integration owns
real-browser standalone/Shadow DOM mount-update-unmount verification.
