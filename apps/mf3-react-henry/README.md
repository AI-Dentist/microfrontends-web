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

## Hosted clinical attention (no AI)

The classic flow is: history (MS2) -> open a consulta from an appointment ->
update the attention -> complete or cancel. Everything goes through the host
token capability and the T4 transport rules; nothing here calls AI, diagnosis
or provider endpoints.

- **Appointments.** The host passes `context.serviceBaseUrls.agenda` (MS3 base,
  e.g. `https://host/api/agendamiento`) next to `apiBaseUrl` (MS2). Hosted "open
  consulta" lists `GET {agenda}/citas` and the user picks one; typing a `citaId`
  exists only in standalone. The picker keeps the states MS2 accepts when
  opening: `RESERVADA`, `CONFIRMADA`, `EN_ATENCION`, `PROGRAMADA`, `PENDIENTE`
  and `REPROGRAMADA` (a rescheduled appointment can open a consulta);
  `CANCELADA`, `COMPLETADA` and `NO_ASISTIO` are hidden. Picking one fills the
  appointment's patient. MS3 does not filter by doctor, so the list is the
  clinic's open appointments, each showing the doctor id MS3 returned.
  Without an agenda base only the picker fails closed (clear message, zero
  HTTP, no free-text fallback); the other clinical screens keep working. The
  agenda client follows the same rules as every client: current token per
  request, null/revoked means no HTTP, permanent retirement, late results
  inert; changing the agenda base replaces the mount's services.
- **Identity.** MS2 derives the doctor from the JWT. Hosted never shows or sends
  a guessed doctor id (`od_henry_principal`, `od_dev_henry`): the open form says
  the server decides, the create-history form omits `odontologoResponsableId`,
  and the doctor appears only where an API response returns it. Standalone dev
  identities are unchanged.
- **Bodies.** The consultation service sends exactly the MS2 DTO fields (open,
  update attention, complete, cancel) and drops anything else (doctor, state,
  version). Complete and cancel carry `versionEsperada`; a 409 version conflict
  and 422 closure errors show MS2's problem details. MS3 errors
  (`{ success: false, error, code }`) surface their `error` text as the detail.
- **Billing.** The frontend never creates a billing order. The completion modal
  reads the billable catalog (`GET /consultas-odontologicas/catalogo-servicios`,
  `{ id, codigo, nombre, precioBaseBs, ... }`) through the injected service and
  lets the doctor enter a quantity per service. It sends
  `{ versionEsperada, serviciosFacturables: [{ servicioId, cantidad }] }`
  (integer `cantidad >= 1`; `piezaDental` is optional and not collected here).
  With services selected, MS2 writes the `clinica.consulta.finalizada` outbox
  event and the ERP creates one billing order, which shows in the ERP billing
  inbox. With none selected the modal says no order will be created, the
  request carries no services and MS2 completes the consulta as no-charge
  without an event. The total shown is only an estimate from base prices; MS2
  returns the real `totalFacturableBs`. After completing, the detail page states
  which of the two outcomes applies. The catalog read follows the same hosted
  rules (current token, zero HTTP when null/revoked, late results inert).

## Rechazo de facturación: corregir y volver a cerrar

Si MS2 devuelve `rechazoFacturacion`, el listado y el detalle muestran un aviso
accesible con la explicación del código, el `motivo` recibido y la fecha
`rechazadaEn` (ISO en `<time>`, también visible). El texto del servidor se muestra
como texto React, nunca como HTML. Se contemplan `PACIENTE_INEXISTENTE`,
`ODONTOLOGO_INEXISTENTE`, `SERVICIO_INEXISTENTE`, `SERVICIO_INACTIVO`,
`MONTO_INVALIDO`, `PAYLOAD_INVALIDO` y `REINTENTOS_AGOTADOS`.

1. En el listado, **Corregir servicios y volver a cerrar** abre el detalle.
2. En el detalle, la misma acción abre el modal de cierre existente. Corrija los
   servicios/cantidades y confirme: se conserva el POST `/consultas-odontologicas/:id/completar`
   con `versionEsperada` y `serviciosFacturables`, sin nuevos endpoints.
3. Use **Cargar Ficha** para releer MS2. Solo un GET exitoso vigente con rechazo
   null o ausente retira el aviso; un GET con rechazo lo conserva o actualiza.
   Durante carga, errores, cierre del modal o respuesta del POST, el aviso permanece.
   Si la lectura falla o la consulta ya figura completada, relea la ficha antes de
   intentar otra corrección.

El aviso no es descartable. Cambiar/limpiar la consulta no confirma ni modifica
el rechazo de otra ficha; las lecturas fuera de orden o de una sesión retirada
no actualizan su aviso. MS2 viejo (campo ausente) y rechazo null conservan el flujo
normal. La compensación a `EN_CURSO` con `cerradaEn: null` pertenece al backend:
el frontend no revierte estados, borra datos clínicos ni crea órdenes de cobro.
Estas pruebas de UI no demuestran la saga real ERP/MS2.

## Selección canónica de pacientes (hosted)

El host debe configurar `context.serviceBaseUrls.erp` con la URL GraphQL ERP
(por ejemplo `/api/erp/graphql`), además de la base MS2 y la agenda MS3.
Crear historia, buscar historia por paciente y abrir una urgencia usan el catálogo;
no aceptan IDs de paciente escritos a mano. Buscar por ID de historia sigue siendo
una operación distinta. Sin base ERP se muestra un error, nunca un campo manual.
Standalone conserva sus campos y casos sintéticos de desarrollo.

- **Catálogo.** `listarPacientes(busqueda)` solicita solamente
  `id,nombres,apellidos,activo` y muestra activos. La URL ERP se conserva exacta,
  incluida su query; cada petición lee el token vivo de la capacidad existente.
  No hay carga automática al montar ni persistencia de pacientes o tokens.
- **Selección.** Cambiar la búsqueda o elegir otra opción invalida inmediatamente
  la selección anterior. La última intención gana, incluso si el transporte ignora
  la cancelación. Vacío, 403, errores GraphQL y fallos de conexión son visibles.
  Seleccionar y enviar vuelven a validar `obtenerPacientePorId`; UUID inválido no
  envía HTTP, y null/inactivo se rechaza como `PacienteInexistente` (422).
- **Envío.** Abrir consulta verifica también que la historia y la cita elegida
  correspondan al mismo paciente (`PacienteNoCoincide`). Paciente, odontólogo y
  sujeto autenticado son identidades distintas. MS2 mantiene la autoridad final:
  historia duplicada (409), sin historia (404) y sus demás errores no se ocultan.
- **Retiro.** Cambiar la base ERP retira toda la sesión clínica, igual que cambiar
  la base MS2 o el getter. Una actualización de navegación o token con getter
  estable conserva la sesión. Resultados y callbacks retirados quedan inertes;
  no se pueden deshacer escrituras ya enviadas al servidor.

## Checks

From this app directory, run the bounded transport checks:

```sh
node --test --test-concurrency=1 --test-timeout=30000 test/rechazo-facturacion.test.mjs
node --test test/paciente-selector.test.mjs
node --test test/remote.test.mjs test/api-query.test.mjs test/host-clients.test.mjs test/clinical-flows.test.mjs
node --test test/atencion-odontologica.test.js test/cierre-consultas.test.js test/consultas-odontologicas.test.js test/estudios-api.test.js test/iteracion-5c.test.js test/odontograma-api.test.js test/odontograma-component-integration.test.js test/odontograma-editor.test.js test/odontograma-enmiendas.test.js test/odontograma-historial.test.js test/odontograma-revisiones.test.js test/odontograma-viewer.test.js
```

Do not use a JS wildcard or the current package `test` script for this bounded
check: `e2e-audit-functional.test.js` mutates data and belongs only to isolated
T10 acceptance. The 5C test now uses scripted synthetic fetch responses, retains
its assertions and rejects unexpected requests; it is no longer backend proof.
All transport mocks are opaque synthetic data, not identity-provider evidence.
`npm run build`, `npm run build:remote` and `npm run lint` are separate owner checks.
`paciente-selector.test.mjs` monta ReactDOM en el JSDOM ya instalado en
`apps/mf-erp/node_modules/jsdom`; no requiere instalar ni iniciar servicios.
Ejercita búsquedas fuera de orden, selección, validación y los envíos reales de
las tres páginas con fetch simulado. Es prueba interactiva DOM aislada, no prueba
de backend, CORS, OIDC ni del despliegue multi-origen en un navegador real.

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
