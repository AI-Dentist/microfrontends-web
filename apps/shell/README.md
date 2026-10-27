# Independently deployed dental platform

Angular owns application navigation and loads ERP (Angular), Operations (Vue), and
Clinical (React) on demand. A failed remote does not prevent using the other apps.

## Run and verify

From `apps/shell` with Node supported by Angular 22 and pnpm 10.32.1:

```sh
pnpm install
pnpm start
node --test test/*.test.mjs
pnpm build
pnpm exec tsc --noEmit -p tsconfig.app.json
```

Open `http://localhost:4200`. Run ERP on 4201; separately serve the Vue and React
`dist-remote` directories on 4202 and 4203 with cross-origin module/CSS access.
Their `remote.js` and `remote.css` are remote entrypoints, not standalone pages.
The shell build is `dist/shell/browser`; configure its server to serve shell deep
links as `index.html`, while preserving actual asset and manifest responses.
No service worker is installed. Backend gateway/proxy setup is operator-owned.

## Runtime manifest

Edit `public/platform-config.json` for local development, or replace the deployed
`/platform-config.json` without rebuilding. The shell fetches it with `no-store`,
validates all three entries before loading any remote, and fails visibly/closed
on fetch, JSON, or validation errors. No remote URLs come from route input.

| Application | Entry | API gateway path |
| --- | --- | --- |
| ERP | Native Federation `remoteEntry.json`, exposes `./Routes` | `/api/erp/graphql` |
| Operations | lifecycle v1 `remote.js` + `remote.css` | `/api/agendamiento` |
| Clinical | lifecycle v1 `remote.js` + `remote.css` | `/api/expediente` |

Manifest entry/style URLs must be absolute HTTPS; loopback HTTP is permitted only
on a loopback HTTP shell page. API URLs may be absolute or `/api` paths. Use
immutable release URLs and deploy CSS alongside its matching module. If ERP emits
a hashed global stylesheet, replace its example `styles.css` URL with that exact
asset URL. ERP styles load only on its first navigation and remain available for
subsequent ERP views. See `../../packages/mfe-contract/README.md` for the schema.

**The manifest is executable-code authority.** Restrict who can update it. Configure
remote CORS, CSP script/style/connect sources, and API gateway routing explicitly.
Shadow DOM isolates styles, not untrusted JavaScript: every remote has page privileges.
Never place secrets or session values in the manifest, URLs, or diagnostics.

## Federation compatibility

Shell pins Angular 22.2.3 and Native Federation 22.2.3, matching ERP's installed
runtime; TypeScript is 6.0.x. The shell has its own pnpm lock. Upgrade Angular shared
singletons and federation tooling together with ERP, not independently across
incompatible framework versions. Vue/React bundle their own runtimes and do not
participate in Angular singleton sharing.

`initFederation({})` finishes before Angular bootstrap; it does not register/fetch
ERP at startup. The public `loadRemoteModule({remoteEntry, exposedModule:'./Routes'})`
API registers ERP only when `/erp` is requested. The optional `createErpRoutes`
factory supplies the validated GraphQL URL; legacy `ERP_ROUTES`/default remains a
compatibility fallback. The remote's standalone bootstrap is never invoked.
Dependency pruning is disabled because its Sheriff scanner cannot traverse the
compile-time contract outside this standalone workspace. Unused optional Angular
animation entrypoints are skipped rather than installing an unused runtime.

## Lifecycle and failures

Module pages create a host-owned ShadowRoot, load and await CSS inside it, and
mount into a child element. Context includes full pathname + search, API URL,
stable on-demand token callback, and confined navigation callback. Nested routes
and browser history update the existing instance without importing/remounting it
or removing CSS. Remote navigation must be an absolute path in its own base path;
external URLs, fragments, traversal, encoded escapes and prefix collisions reject.

Import, CSS, mount, update and ERP route loading have a 15-second bound. Failures
show a generic local fallback and Retry, without logging URLs/credentials. Module
retry uses the same immutable URL and a fresh container. Browsers may cache failed
module imports: retry cannot guarantee recovery without a page reload or a new
operator-provided release URL. There is no automatic cache-busting loop.

Generation cancellation prevents stale ready/error state; late mounts are disposed.
Updates serialize, and unmount waits for in-flight lifecycle work rather than racing
it. Cleanup is idempotent and catches remote cleanup rejection. The native navigation
fallback retries the original requested URL. Home/navigation remain available.

## Identity limitation

The stable `getAccessToken` capability reads the existing `kc_token` from localStorage
on each call. It does not create, validate, persist or refresh credentials, provide a
token form, or implement login/logout. ERP retains its existing per-request auth and
permission checks. Remote standalone origins do not share localStorage with the
shell: sign-in/session provisioning on the shell origin and production identity,
logout, token audience and gateway authorization remain separate infrastructure work.
This shell is not a claim of production authentication readiness.

Real-browser multi-origin, keyboard/responsive navigation, gateway authorization
and deployment rollback checks remain part of integration verification.
