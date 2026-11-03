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

Each remote mount injects all four service families (histories, consultations,
odontograms and studies), including their hooks, pages and mutation forms.
Tokens are read synchronously on demand for each request, never persisted or
serialized. Hosted calls require a nonempty current token and a configured base;
a missing, throwing, asynchronous or retired capability rejects with `AbortError`
before HTTP. Caller bearer headers, token arguments and base overrides cannot
replace host configuration. This also applies to health requests.

Navigation-only `update` keeps the service lease and local state. Replacing the
host getter or API base retires the previous lease immediately and keys a fresh
React tree. `unmount` permanently retires its clients and navigation callbacks;
same-subject reauthentication cannot revive them. An observed null/rejected
capability also permanently retires the client. Legitimate refresh keeps the same
getter and reads its new token without remounting. The host must retire its own
getter on session change, as required by the shell mount contract.

Late success/error results are rejected after retirement; consumer state setters
and async form callbacks additionally check the active view. This cannot undo
writes already sent to the server. There is no hosted persistence, offline queue
or automatic replay. Odontogram prototype URL/query/localStorage controls are
standalone-only and never read in hosted mode. Hosted writes use the configured
service and its authorization/errors, not a fabricated isolated-backend status.

Standalone retains the exported singleton signatures and optional token arguments.
Factories `createHistoriasClinicasService`, `createConsultasOdontologicasService`,
`createOdontogramasService` and `createEstudiosService` accept an injected client;
their default is explicitly the legacy standalone transport. `createHttpClient`
without a getter keeps that behavior; hosted mounts always request hosted mode.
`ClinicalServicesContext` provides the four named services and `isActive`; the
no-provider default belongs only to the standalone application. No DevAuthProvider or dev identity
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

From this app directory, run the bounded transport checks:

```sh
node --test test/remote.test.mjs test/api-query.test.mjs test/host-clients.test.mjs
node --test test/atencion-odontologica.test.js test/cierre-consultas.test.js test/consultas-odontologicas.test.js test/estudios-api.test.js test/iteracion-5c.test.js test/odontograma-api.test.js test/odontograma-component-integration.test.js test/odontograma-editor.test.js test/odontograma-enmiendas.test.js test/odontograma-historial.test.js test/odontograma-revisiones.test.js test/odontograma-viewer.test.js
```

Do not use a JS wildcard or the current package `test` script for this bounded
check: `e2e-audit-functional.test.js` mutates data and belongs only to isolated
T10 acceptance. The 5C test now uses scripted synthetic fetch responses, retains
its assertions and rejects unexpected requests; it is no longer backend proof.
All transport mocks are opaque synthetic data, not identity-provider evidence.
`npm run build`, `npm run build:remote` and `npm run lint` are separate owner checks.
Node tests cover real client/service/mount APIs, provider-driven public hooks,
standalone compatibility and structural pins for every named consumer. SSR checks
do not prove browser state cleanup. The host's
multi-origin browser smoke must verify actual React mount/update/unmount in a
ShadowRoot, CSS loading and all clinical pages; Node tests do not replace it.
Use an owned fake API fixture with a nondefault query-bearing base and synthetic
in-memory bearer getter. Refresh it without replacing the getter, then hold a
history/consultation/odontogram/studies response while switching the getter/base
or unmounting. Verify no old success/error/loading effect or callback reaches the
replacement tree, old callbacks/getters stay retired, and null capability sends
zero HTTP. Seed prototype URL markers only in the browser fixture and verify no
hosted access to them. Clean up the fixture/browser/server. Actual backend and
OIDC/browser acceptance remains T10, not this transport test.
