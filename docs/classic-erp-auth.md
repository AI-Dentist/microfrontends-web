# Shell authentication foundation (T2.B)

The shell now uses a public OIDC client with authorization code + native WebCrypto
PKCE/S256 and RS256 verification. No OIDC configuration means **unconfigured and
unauthenticated**. `kc_token`, unsigned demo JWTs and standalone remote mocks are
not real-shell credentials. Backend authorization remains authoritative.

## Configure the public client

`apps/shell/public/platform-config.json` is a **template, not a running endpoint
claim**. Its optional `oidc` object has exactly these public fields:

```json
{
  "issuer": "http://localhost:8180/realms/dental-platform",
  "clientId": "mf-erp",
  "redirectUri": "http://localhost:4200/auth/callback",
  "postLogoutRedirectUri": "http://localhost:4200/",
  "scopes": ["openid", "profile"],
  "apiAudiences": ["ms-erp", "ms2-clinico-ia", "ms3-agenda-stock"]
}
```

Configure a public Keycloak client (no secret), standard authorization code flow,
S256, exact redirect/logout URIs and shell web origin. Do not enable implicit or
password grants. Use HTTPS except explicit loopback HTTP development. Changing
the shell port requires changing both public redirect fields; foreign origins,
URL credentials, fragments, issuer queries and duplicate/empty lists are rejected.
T8 owns real deployment alignment, not this example.

## User flow

1. Open `/login` and choose **Sign in**. Unconfigured shells explain why applications
   are unavailable. All three remote route trees require an authenticated session.
2. Keycloak returns to `/auth/callback`. The shell consumes the one-use transaction,
   removes callback credentials from history on success or failure, exchanges the
   code, validates discovery/JWKS and both signed tokens, then opens the return path.
   Errors show a generic retry message without printing protocol material.
3. **Sign out** clears local grants and remote ownership first, then navigates to
   the discovered `end_session_endpoint` using `id_token_hint`, `client_id` and
   `post_logout_redirect_uri`. It never uses deprecated `redirect_uri` for logout.

## Security and lifecycle

| Boundary | Policy |
|---|---|
| Persistence | Only `platform.oidc.pkce.v1` in sessionStorage: verifier, state, nonce, return path and expiry, at most five minutes. Consumed once, including rejected callbacks. No tokens in either browser storage or logs. |
| Endpoint trust | Exact configured issuer; discovery endpoints and JWKS must share its origin. Fetch redirects are rejected and cookies omitted. Header `jku`, `x5u`, embedded keys/certificates and critical/alternative encodings are rejected, never fetched. |
| Signing | Native WebCrypto RSASSA-PKCS1-v1_5 / SHA-256, RSA >=2048 bits, unique matching kid and signature-use/algorithm-compatible JWK. No unsigned, HMAC or decode-only trust. JWKS is fetched for each exchange to observe issuer rotation. |
| Claims | Exact issuer; nonempty opaque subject; integer expiry strictly after now (no expiry leeway); issued-at, optional not-before and optional ID auth_time may lead the browser clock by at most 60 seconds (inclusive); larger leads are rejected. ID audience includes client, multi-audience requires matching azp; any ID azp must match. Access audience includes **every** configured resource (extra audiences are allowed), and access azp equals client. Subjects must agree. Initial ID nonce must match; access nonce is not required. |
| Refresh | One in-flight Promise, ten-second total protocol/verification deadline, generation/principal bound; refresh token rotation stays in RAM. Auto-refresh before access expiry; expiry still clears grants even if refresh hangs. Late or rejected responses cannot restore/replace an old user or clear a new login. |
| Renewed ID | When returned, validate its signature/expiry/issuer/client and unchanged subject, audience set, azp and auth_time. Nonce may be omitted; if present it must match the original transaction. Core permits no refreshed ID: only an existing verified session may retain its original ID claims/token, while newly verifying the access token and its subject. This is never an initial-login bypass or a new assertion that the retained ID is unexpired. |
| Roles | Only verified access `realm_access.roles`: ADMIN, CAJERO, ODONTOLOGO, RECEPCIONISTA; unknowns removed and duplicates collapsed. No role-driven financial identity inference or obligatory finance query for ODONTOLOGO/RECEPCIONISTA. |
| Remote ownership | Each mount owns a permanently revocable lease and one stable token-getter function. In-module navigation preserves that function's identity (and remote form state); each call still reads the current token. Retry creates a different lease/getter.  Logout, expiry, refresh rejection, principal loss or component destruction retire the page and its mount; retry retires only the previous mount. Retained getters return null and navigation/state callbacks become inert, even after same-subject login. Only the current mount can update state or synchronously read refreshed tokens. |

No browser-only mechanism protects against same-origin malicious JavaScript; deploy
with appropriate CSP and protect script supply chains. Server guards still decide
API access. Domain user/doctor/cashier IDs must never be guessed from JWT subject.

## Public verification entry points

- `validateConfig(input, pageUrl?)`, `validateOidc(input, pageUrl)` validate public
  configuration without side effects. Old manifests retain their original result shape.
- `createAuthSession(options)` accepts public config and injectable browser capabilities
  for deterministic tests. Returns `login(returnPath?)`, `callback(href): Promise<string>`,
  `refresh(): Promise<void>`, `logout()`, `snapshot()`, `subscribe(listener)` and
  **synchronous** `getAccessToken(): string | null`. Snapshots contain status, subject
  and roles, never token material. `refresh()` shares the exact pending Promise.
- `trustedMetadata(oidc, metadata)` validates discovery. `verifyTokenSet(tokens, options)`
  requires JWKS from that trusted URL and a safe-integer `options.now` in Unix seconds;
  nonnumeric, fractional or unsafe clocks fail validation without coercion. It is not
  a discovery trust shortcut. Its
  credential-bearing return value is internal to the session, never a UI snapshot.
- `AuthService` connects session signals, login/logout UI and callback navigation.
  `platform.ts` retains the existing synchronous getter; it never yields a Promise.

Run finite synthetic protocol tests with Node 22:

```sh
node --test apps/shell/test/remote-auth-revocation.test.mjs
node --test apps/shell/test/runtime-config.test.mjs apps/shell/test/oidc-token.test.mjs apps/shell/test/auth-session.test.mjs
node --test apps/shell/test/*.test.mjs
node --test scripts/test/*.test.mjs
```

Synthetic RS256 keys are generated once per test file in RAM. No private-key
fixtures, real credentials, real issuer or patient data are used. Controlled
promises/timers test concurrency, cancellation, replay, malformed claims and expiry.
These are protocol/unit checks, **not** real Keycloak/browser PKCE acceptance.

## Observed checks

- Writer focused Node checks: 135 passed. Initial RED was 81/84 with missing
  session/verifier modules and rejected OIDC config: compilation absence, **not
  per-rule behavioral RED**. Subsequent behavioral RED caught changed renewed-ID
  audience (29/30) and storage-denied logout notification (22/23); both were fixed.
- Owner final shell/root command `node --test apps/shell/test/*.test.mjs scripts/test/*.test.mjs`:
  exit 0, 150 passed, 0 failed/skipped/cancelled, 4.416 seconds.
- Cached Angular CLI build: exit 0, 33 seconds; no dependency installation.
- Owner compiled-browser check on an owned ephemeral loopback fixture: direct
  `/erp`, `/operations` and `/clinical` visits redirect to login; a malformed
  callback clears credentials from history and leaves no session/grants. A legacy
  synthetic storage marker cannot authenticate. No external/API/remote requests or
  page errors were observed; browser and fixture were closed. This is **not** a
  successful real-Keycloak login/refresh/logout test.
- Native assessment was unavailable because of unrelated untracked declarations;
  security/concurrency escalation requires independent verification. No native
  START, receipt or approval is claimed.

### C1 retirement correction

The parent-owned independent verifier found one retirement blocker on source
`cee530f`: a held remote context regained token/navigation access after logout,
destruction and same-subject login. It also reproduced on baseline; this is not
claimed as a newly introduced defect.

`remote-auth-revocation.test.mjs` imports the actual production `ModulePage` using
Node's experimental `stripTypeScriptTypes`. Only framework metadata/import wiring
is adapted: Angular injection/signals and DOM are inert, while remote lifecycle
and signed synthetic authentication use the real runtime/session/token modules.
The harness retains callbacks and holds mount promises without sleeps. No
permission method is replaced or imitated; key pairs remain in RAM and failure
diagnostics expose only token-presence booleans and navigation counts.

Observed focused RED: exit 1, 0/7 passed; the exact logout/destroy/relogin case
reported `{staleGetterReturnedNewToken:true,staleNavigation:1}`. After the lease
fix, focused GREEN: exit 0, 7/7 passed, no skipped/cancelled tests. Both runs
emitted Node's experimental type-stripping warning. Cases assert retired getters,
navigation, stale state, late unmount/container disposal, and preservation of
active replacement navigation, updates and synchronous refreshed tokens.
Owner final regression command `node --test apps/shell/test/*.test.mjs scripts/test/*.test.mjs`
passed 157/157, exit 0, 4.303 seconds, with no failures/skips/cancellations.
The experimental type-stripping warning was emitted; stderr is not claimed empty.
The cached Angular shell build passed, exit 0 in 26 seconds, without dependency
installation. The same parent-owned verifier's blocker-targeted recheck remains
pending; these author/owner checks do not constitute independent acceptance.

## Hosted ERP transport (T4.A, online-first)

The shell mounts the Angular ERP through `createErpRoutes({ mode: 'hosted', graphqlUrl,
getAccessToken })`; `graphqlUrl` is the manifest `apiBaseUrl` and `getAccessToken` is a
per-load lease from `createErpHostCapability(session)` in `apps/shell/src/bootstrap.ts`.
Online means connected to the real API in a local bounded environment, not a deployment.

| Aspect | Hosted ERP | Explicit standalone ERP (unchanged) |
|---|---|---|
| Credential | Host getter read synchronously for every request and again when a response arrives. No storage, `kc_token`, mock profile or `X-Dev-User`. | Browser-stored token or development mock. |
| Endpoint | Configured URL used **verbatim** (no `/graphql` appended, query kept); a per-call `uri` override is dropped. A missing URL fails closed, never the prototype URL. | `graphqlUrl` option or `environment.graphqlUrl`. |
| Lost capability | Missing, empty or throwing getter retires the scope: zero HTTP/GraphQL requests. | Existing behavior. |
| Retirement | Permanent per provider scope. A logout, expiry or different subject revokes the shell lease, so a retained getter cannot revive after a same-subject login. The shell replaces its route tree on session end, so the next login builds new lazy injectors. | Not applicable. |
| Switches | A principal switch or a changed `graphqlUrl` retires the scope; a response that arrives afterwards is rejected before it reaches the Apollo cache or the caller. | Existing owner checks. |
| Persistence | No IndexedDB open/read/write/transaction, no outbox enqueue/replay/claim/delete, no reconnect or `liveQuery` subscription, no catalog or patient/service/order copies, no global queue counters. | Existing offline cache and outbox. |
| Errors | Real API or connection errors are surfaced; nothing is reported as queued or served from a stale copy. | Existing fallbacks. |

A token refresh with the same subject keeps the mounted ERP working without a remount.
Existing IndexedDB records, schema and legacy financial queue entries are neither read
nor migrated, cleared, reassigned or replayed by the hosted ERP: this suspends unsafe
hosted offline reuse, it does not destroy offline data. S2 defers isolated offline; it
does **not** claim safe offline affinity. A request already sent to the server cannot be
recalled; only its effects in the hosted client are suppressed. Server guards stay the
authority and no doctor or finance identifier is guessed.

Native shell tests: `node --test apps/shell/test/erp-host-capabilities.test.mjs` (lease
executed from the production bootstrap source). Angular specs cover the transport, outbox
and catalog boundaries; real-service and browser acceptance remain T10.

## Classic finance identity and export (T5)

**Cashier identity.** A JWT subject identifies the login, never an ERP `Usuario`. In a hosted
scope the cash payment, expense and QR modals resolve the canonical financial `Usuario.id`
with `obtenerMiUsuarioId` (no arguments, ADMIN/CAJERO) through the route's Apollo client, so
the request uses the same per-request host token and endpoint as every other operation.
`FinancialIdentityService` asks once per lease: concurrent callers share one request and the
answer is cached for that lease only (keyed by the route's runtime, so it dies with the route
injector and is never shared with another lease or principal). Retirement, a principal switch
or a late answer after either clears it. A failure (forbidden, not found, network, malformed
UUID) is not cached; the modal shows the error and sends **no** financial mutation. There is no
fallback to the dev default id, the JWT subject or a doctor id. Standalone keeps
`requireFinancialUserId` and the configured dev-mock mapping unchanged.

**Admin linking.** A cashier exists for the backend only after an ADMIN links the ERP user to the
Keycloak subject. In *Seguridad* the ADMIN-only **Vincular identidad** card calls
`vincularIdentidadUsuario(input: { usuarioId, keycloakSubject })`. The subject is opaque: it is
trimmed only to reject an empty value and is sent exactly as typed. Backend errors (conflict,
inactive target, reassignment) are shown as plain text, unchanged. Onboard doctors with the
existing paired doctor provisioner, not this user-only link.

**QR simulation.** `simularConfirmacionQrDev` is a development simulator. In a hosted scope the
button is not rendered and the handler refuses to run, so no fake provider confirmation can be
produced. Generating and polling use the real API; real provider activation is out of scope.
Standalone development is unchanged.

**Export transport.** `ReportExportService` validates the download URL against the hosted
endpoint origin and sends the host's current token per request (never `kc_token`). A null,
revoked or switched-principal capability rejects the promise with zero HTTP requests and never
revives. Standalone keeps `environment.graphqlUrl` and the stored token.
`provideErp()` registers `FinancialIdentityService` and `ReportExportService` per route so
consumers resolve the hosted instances instead of root-scoped ones.
No AI or agent activation is part of this path.

**Local AI.** A hosted scope never starts the browser-local AI: `ErpLayout` skips `start()`,
so no worker is created and no model is downloaded from an external provider. The tariff
semantic search shows "Búsqueda semántica no disponible en este entorno" and the expense
category stays a manual choice; no fake AI results are produced. The hosted status badge
reads "IA Navegador deshabilitada en este entorno" rather than suggesting startup is pending.
Standalone retains its existing startup and all local AI status labels.

## Remaining stages

Corrected risk-2/risk-4 acceptance remains pending on the actual work-unit
commit/diff and the same parent-owned verifier's targeted C1 recheck. T4 still owns all remotes' service-level token/client
propagation (including native-federation ERP); gating a route does not make its
legacy service clients integrated. T5 owns the lazy authorized financial identity
lookup. T10 owns bounded real-Keycloak browser login/refresh/logout and classic ERP
flows. Existing unsigned-auth artifact smoke assumptions must not weaken this policy.

## References

- [OAuth security best current practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OIDC Core ID token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
- [OIDC Core refresh response validation](https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokenResponse)
- [Keycloak securing applications](https://www.keycloak.org/securing-apps/oidc-layers)
  (parent consulted official Keycloak 26.8.1 Context7 documentation; Keycloak 25+
  places nonce in ID tokens and normally omits it from refreshed ID tokens).
