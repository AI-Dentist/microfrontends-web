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
on demand; tokens are never serialized or stored.

Hosted mounts are online-only and fail closed. The remote builds its client
with `createMs3Service({ hosted: true, apiBaseUrl, getAccessToken })`: there is
no default base and no anonymous request. A `null`, empty or throwing getter
rejects with `Ms3CapabilityError` before any HTTP and retires that client for
good, even if the same getter later returns a token. Replacing the getter or
the API base, or unmounting, retires the previous client: its new requests send
nothing, and responses that arrive later are discarded instead of updating
citas, errors or the follow-up resync. Requests already sent cannot be recalled.
A refresh behind the same getter needs no remount. Appointment creation sends both
idempotency headers (see Idempotency below). Absolute and relative API bases retain their query suffix
when endpoints are appended: `/api/?tenant=one` becomes
`/api/citas?tenant=one`. Query encoding and repeated keys are preserved.
The named `ms3Service` export remains the default standalone factory instance;
use `createMs3Service` for isolated runtime/session configuration. Standalone
(no `hosted` flag) keeps its defaults: optional token, no retirement.
Every non-2xx response rejects with `Ms3ApiError` and the UI shows a local
error rather than reporting a failed write as successful.

Only trusted deployment/host code may supply API bases and token capabilities.
Remote code has host-page privileges: Shadow DOM is style isolation, not a
security sandbox. Operators own HTTPS, API CORS, CSP and real authentication.
Do not put tokens in manifests, environment files, URLs or logs.

## Agenda, hours and stock flows

Route authority is the MS3 backend source (`routes/web.php`, controllers and
use cases under `api/agendamiento`), not the historical REST YAML. Success
bodies are `{ success, data, mensaje, timestamp }` (lists also repeat their key
at the top level; the client reads `data` first). Stock rows use the backend
names `stock_actual`, `stock_minimo`, `unidad_medida`, `alerta_reposicion`.

- Appointments: create (`POST citas`), cancel (`PATCH citas/{id}/cancelar`),
  reschedule (`PUT citas/{id}/reprogramar`, `nueva_fecha_hora`), complete
  (`PATCH citas/{id}/completar`) and no-show (`PATCH citas/{id}/no-asistio`).
  Closed appointments (`COMPLETADA`, `CANCELADA`, `NO_ASISTIO`) offer no actions.
- Completion is explicit: stock is consumed only for the `insumos`
  (`{ insumo_id, cantidad }`) the user lists in the completion form. With none
  listed, the appointment is completed and the inventory is untouched.
  Nothing in this module decrements stock automatically.
- Hours: the create form is shown only when the token carries the `ADMIN` role
  (a UI hint read from the unverified token payload; the MS3 guard stays
  authoritative and answers 403 `FORBIDDEN_ROLE`). Other roles see the list
  read-only. Standalone has no token and always shows the form.
- Stock movements are explicit (`POST stock/movimientos`) with the backend
  types `ENTRADA_COMPRA`, `SALIDA_PROCEDIMIENTO` and `AJUSTE` (plus
  `direccion` `INCREMENTO`/`DECREMENTO` for `AJUSTE`). The movement endpoint has
  no idempotency key, so the submit button is disabled while a request is in
  flight; check the kardex before re-submitting after a network failure.

### Hosted vs standalone

Hosted: doctor, room and patient come from the ERP catalogs
(`listarOdontologos(soloActivos: true)`, `listarConsultorios`,
`listarPacientes(busqueda)` in `ms1-erp.graphql`) through
`context.serviceBaseUrls.erp`, used verbatim as the GraphQL endpoint with the
same current-token, fail-closed and retirement rules as the MS3 client
(`src/api/erpCatalogApi.js`). The forms submit the canonical ERP IDs from
selects; there are no free-text IDs. If the host passes no
`serviceBaseUrls.erp`, the catalog fails closed: no request is sent, the forms
show "ERP catalog URL is not configured for this host" and stay disabled, and
agenda/stock lists keep working. Standalone keeps its original free-text ID
inputs and never calls the ERP.

### Idempotency

`POST citas` needs `Idempotency-Key` (or `X-Idempotency-Key`; both are sent).
One `crypto.randomUUID()` is created per form intent and reused on every retry
of the same payload, so a retry after a timeout or a 409/5xx returns the same
appointment instead of a duplicate (`idempotente: true`, HTTP 200). Editing the
payload or finishing the intent (successful create) starts a new intent with a
new key.

### Errors

Backend error bodies carry `error`/`message`, `code` and sometimes `errors`
(field messages). The UI shows them instead of a bare HTTP status:
`Conflict (SCHEDULE_COLLISION): ...` for 409,
`Validation failed (INVALID_APPOINTMENT_DATA): ... — field: message` for 422
(Laravel's own validation answers 422 without a code and is shown as
`HTTP_422`), and `Request failed (HTTP n, CODE): ...` otherwise, for example
403 `FORBIDDEN_ROLE` or 401 `UNAUTHORIZED`. An unreadable body falls back to
the status. After a failed write the form keeps its values and idempotency
intent.

## Checks

`node --test test/*.test.mjs` covers public API requests, standalone defaults,
hosted fail-closed capabilities and retirement for MS3 and the ERP catalogs,
MS3 response shapes and error codes, idempotency intents, instance lifecycle
and navigation. `test/app-wiring.test.mjs` builds the remote bundle into a
temporary directory and mounts it in jsdom (borrowed from `apps/mf-erp`'s dev
tooling; the test skips if it is unavailable) with a scripted fetch.
Run `npm run build` and `npm run build:remote` too. The host integration owns
real-browser standalone/Shadow DOM mount-update-unmount verification.
