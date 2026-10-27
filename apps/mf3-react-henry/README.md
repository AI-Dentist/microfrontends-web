# Clinical React application

## Standalone

`npm ci`, then `npm run dev` (port 5173). `npm run build` and
`npm run preview` retain the standalone entry and DevAuthProvider flow.
The API defaults to `/api/expediente`; set `VITE_API_BASE_URL` at build time
to override it. Development synthetic identities remain local/in-memory;
they are not production authentication.

## Independent remote (lifecycle v1)

`npm run build:remote` emits self-contained ESM `dist-remote/remote.js` and
`remote.css`, bundling React rather than importing a host framework/runtime.
Deploy both under the same immutable release URL. Vite uses `base: './'` for
release-relative assets. The standalone build does not import the remote.

The trusted host imports `{ contractVersion, mount }`, creates a ShadowRoot,
links `remote.css` inside it, and passes a child HTMLElement to
`mount(container, context)`. Importing the module never mounts it or reads the
host root. Context matches `packages/mfe-contract/index.d.ts` v1: `basePath`,
`path`, `apiBaseUrl`, `getAccessToken`, `onNavigate`, `contractVersion: 1`.
Use base path `/clinical`; tabs map to `/consulta`, `/crear`, `/actualizar`,
`/conectividad` beneath it. Host updates reflect navigation without emitting
another event; each user tab action requests one `onNavigate` call. Host owns
history and validates requests.

The returned instance supports `update(nextContext)` without remounting and
idempotent `unmount()`. Version/base-path changes reject; updates after teardown
are ignored. The host serializes lifecycle calls, unmounts before container reuse,
and owns stylesheet cleanup and failure fallbacks. React render errors are
asynchronous; host browser verification must also check rendering.

Each remote instance injects its own API client; tokens are read on demand for
each request, never persisted or serialized. No DevAuthProvider or dev identity
controls run remotely. Only trusted host code supplies token capabilities and API
bases; no URL/user-controlled configuration or fake production auth is accepted.
Remote scripts execute with host privileges: Shadow DOM isolates CSS, not trust.
Operators own HTTPS, artifact integrity, CORS, CSP/connect-src and real identity
provider configuration. Deploy APIs separately without rebuilding via runtime
`apiBaseUrl`; trailing slashes are normalized. Absolute and relative bases retain
queries after the endpoint path: `/api/?tenant=one` plus `/health?view=full`
becomes `/api/health?tenant=one&view=full`. Base parameters precede endpoint
parameters; encoding, order and repeated keys are preserved (not overwritten).
The legacy default remains exactly `/api/expediente/health` for health requests.
HTTP non-OK responses keep the
existing ProblemDetailsError behavior, including health requests.

## Checks

Run `node --test test/*.test.mjs`, `npm run build`, `npm run build:remote`,
and `npm run lint`. Node tests cover request/session isolation, legacy client
behavior, lifecycle and navigation through pure public adapters. The host's
multi-origin browser smoke must verify actual React mount/update/unmount in a
ShadowRoot, CSS loading and all clinical pages; Node tests do not replace it.
