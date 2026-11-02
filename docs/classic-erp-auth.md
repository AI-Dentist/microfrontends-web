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
| Claims | Exact issuer; nonempty opaque subject; integer expiry strictly after now; issued-at and optional not-before not in future. ID audience includes client, multi-audience requires matching azp; any ID azp must match. Access audience includes **every** configured resource (extra audiences are allowed), and access azp equals client. Subjects must agree. Initial ID nonce must match; access nonce is not required. |
| Refresh | One in-flight Promise, ten-second total protocol/verification deadline, generation/principal bound; refresh token rotation stays in RAM. Auto-refresh before access expiry; expiry still clears grants even if refresh hangs. Late or rejected responses cannot restore/replace an old user or clear a new login. |
| Renewed ID | When returned, validate its signature/expiry/issuer/client and unchanged subject, audience set, azp and auth_time. Nonce may be omitted; if present it must match the original transaction. Core permits no refreshed ID: only an existing verified session may retain its original ID claims/token, while newly verifying the access token and its subject. This is never an initial-login bypass or a new assertion that the retained ID is unexpired. |
| Roles | Only verified access `realm_access.roles`: ADMIN, CAJERO, ODONTOLOGO, RECEPCIONISTA; unknowns removed and duplicates collapsed. No role-driven financial identity inference or obligatory finance query for ODONTOLOGO/RECEPCIONISTA. |
| Remote ownership | Each mount owns a permanently revocable lease. Logout, expiry, refresh rejection, principal loss or component destruction retire the page and its mount; retry retires only the previous mount. Retained getters return null and navigation/state callbacks become inert, even after same-subject login. Only the current mount can update state or synchronously read refreshed tokens. |

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
  requires JWKS from that trusted URL; it is not a discovery trust shortcut. Its
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
