# Independent remote contract v1

Build each framework independently. Share these declarations at compile time only
(`index.d.ts`); no shared runtime package, framework singleton or serialized session
is required. Standalone application entrypoints remain separate and unchanged.

## Lifecycle

A module remote exports `contractVersion = 1` and
`mount(container: HTMLElement, context: RemoteContextV1)`. Mount may return a promise
of `{ update(nextContext), unmount() }`; both methods may also be async. The host
checks the version and callable exports before mounting. ERP uses native federation
and its `remoteEntry.json`; a host adapter supplies this lifecycle for its routes,
not a direct ESM import of that JSON.

The context contains `contractVersion: 1`, `basePath`, `path` (full current pathname
plus search), `apiBaseUrl`, `getAccessToken: () => string | null`, and
`onNavigate: (path: string) => void`. Read the token when making a request so session
changes do not require remounting. Never put credentials in JSON, URLs, storage,
logs, or module globals. Do not retain a token captured at mount time.

| Responsibility | Required behavior |
| --- | --- |
| Host DOM | Create a ShadowRoot and pass a child HTMLElement as container. Own stylesheet links inside the shadow root and remove them on teardown. |
| Remote DOM | Mount only within the supplied container; no global DOM, styles, history or shared framework assumptions. |
| Mount | One active instance per container. Host unmounts before reusing it. Remote cleans partially allocated resources if mounting fails. |
| Update | Apply the complete next context without another mount. Serialize updates; do not race update with unmount. Reject incompatible versions or basePath changes. |
| Unmount | Idempotent, including repeated calls; release listeners, subscriptions, timers and framework roots. An update after unmount is a no-op. |
| Late resolution | Host uses an activation generation. If navigation/unmount invalidates a pending mount, immediately unmount its eventual result; never attach stale UI. |
| Failures | Catch import, stylesheet, mount and update errors per remote, clean up and show a retryable local fallback; keep host navigation usable. Handle rejected unmount without reviving an instance. |

Navigation and updates must remain within the remote's assigned `basePath`:
`/operations` and `/operations/orders?status=open` are valid for operations;
`/operations-other`, `/erp`, `//other.example`, fragments and absolute URLs are not.
Compare pathname at segment boundaries (`pathname === basePath` or starts with
`basePath + '/'`), after URL normalization; reject encoded separator/traversal tricks.
The remote requests navigation through `onNavigate`, never writes browser history.
The host validates every request, owns history/popstate and delivers the resulting
path via `update`. Invalid requests do not change history or the active remote.
These are lifecycle obligations, not functionality implemented by the config parser.

## Runtime deployment configuration

Host reads the same-origin `/platform-config.json`, validates before loading any
remote, and fails closed with a visible configuration error on invalid JSON or
validation failure. `validateConfig(input, pageUrl?)` in
`apps/shell/src/runtime-config.mjs` is pure and returns fresh normalized URL strings.
Its default page URL is browser location, or `https://localhost/` in Node; pass an
explicit page URL in tests or server-side tools.

Manifest v1 has only `{ schemaVersion: 1, remotes: [...] }`, containing exactly one
of each ID. Unknown root/remote fields reject (including session/token fields).
Order and labels are preserved. Each ID has one fixed basePath and kind:

| ID | basePath | kind | entry pathname | styles |
| --- | --- | --- | --- | --- |
| erp | /erp | native-federation | ends `/remoteEntry.json` | optional `.css` |
| operations | /operations | module | ends `.js` | required `.css` |
| clinical | /clinical | module | ends `.js` | required `.css` |

Entries/styles are absolute URLs. API bases are absolute or same-origin `/api`
paths (`/api` or `/api/...`), resolved against the page origin, not its current path.
Queries are permitted (for release identifiers); fragments, credentials, whitespace,
backslashes, protocol-relative URLs, and non-HTTP(S) protocols reject. HTTPS is
required except HTTP to `localhost`, `127.0.0.1` or `[::1]` while the shell page is
itself loopback HTTP. Remote origins may differ from each other and from the shell.

**This manifest is executable-code authority.** Only trusted deployment operators
may change it; it must never come from user input. There is intentionally no fixed
origin allowlist in the validator. Protect manifest delivery and remote artifacts,
configure CSP/connect-src and CORS at deployment, and use immutable release URLs.
No secrets belong in config. Shadow DOM is style isolation, not a security sandbox:
remote scripts execute with host-page privileges. This is Risk item 5's runtime
trust boundary, not a claim of isolation from malicious code.

`apps/shell/public/platform-config.json` is a local development example (ERP 4201,
operations 4202, clinical 4203). Serve the shell over loopback HTTP for this example;
production operators replace all URLs with actual HTTPS release/API locations.
For example, operations can independently use
`https://ops.example/releases/2026-01/remote.js` and
`https://ops.example/releases/2026-01/remote.css` with API
`https://api.example/operations`, without rebuilding the shell. Server routing must
serve entry assets as assets and deep links as application pages, not interchangeably.

## Verify this slice

Run `node --test apps/shell/test/runtime-config.test.mjs`. Tests are deterministic,
use only the public validator and local example JSON, and do not start servers.
Lifecycle implementation, federation adaptation, browser routing, CORS/CSP and
standalone smoke tests belong to the consuming app/host work, not these declarations.
