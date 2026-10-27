# Deploy independent frontend releases

Publish immutable application artifacts first, then atomically switch the shell's
trusted `/platform-config.json`. Roll back by restoring the previous manifest;
keep every referenced release available. A shell rebuild is not required to select
a compatible remote release.

## Build and publish

Run commands from the directory shown. Root orchestration delegates these same
commands; it does not create a workspace or migrate lockfiles. `install` uses
`pnpm install` for ERP/shell and `npm ci` for Vue/React. `build` builds both standalone
and remote Vue/React artifacts. Existing app commands remain usable independently.

| Directory | Install | Build | Artifact directory |
| --- | --- | --- | --- |
| `apps/shell` | `pnpm install` | `pnpm run build` | `dist/shell/browser` |
| `apps/mf-erp` | `pnpm install` | `pnpm run build` | `dist/dental-erp-mfe1/browser` |
| `apps/mf2-vue-wendy` | `npm ci` | `npm run build:remote` | `dist-remote` |
| `apps/mf3-react-henry` | `npm ci` | `npm run build:remote` | `dist-remote` |

Vue/React `npm run build` separately produces standalone `dist` pages. Remote
`dist-remote` is an ESM/CSS library, **not** a standalone site. Publish complete
directories, including chunks, workers, fonts, WASM and other referenced assets;
do not copy only entrypoints. Serve standalone and remote outputs separately.

Tests: from ERP use `pnpm test --watch=false`; from shell, Vue or React use
`node --test test/*.test.mjs`. Root `node scripts/platform.mjs test [app]` delegates
these checks sequentially. Use `node --test scripts/test/*.test.mjs` for the runner
and artifact server, then `node scripts/platform-smoke.mjs` for built integration.
No install, build, browser provisioning, or backend setup occurs inside the smoke.

## Trusted runtime configuration

Schema v1 accepts only `{schemaVersion: 1, remotes: [...]}` with exactly one ERP,
Operations and Clinical entry. The [contract](../packages/mfe-contract/README.md)
is authoritative for field validation; unknown fields, credentials, fragments,
unsafe schemes and incompatible ID/kind/basePath combinations reject visibly.
Labels are required; module CSS is required; ERP CSS is optional in the schema
but must be supplied for this ERP UI. Entry/style URLs are absolute HTTPS (loopback
HTTP is development-only). API bases are absolute HTTPS or same-origin `/api`
paths. Release URLs must not derive from route/query/user input.

| ID | kind | basePath | Entry and stylesheet |
| --- | --- | --- | --- |
| `erp` | `native-federation` | `/erp` | `remoteEntry.json`, actual emitted global stylesheet |
| `operations` | `module` | `/operations` | `remote.js`, `remote.css` |
| `clinical` | `module` | `/clinical` | `remote.js`, `remote.css` |

An operator-authored manifest might select ERP
`https://erp.example/releases/erp-42/remoteEntry.json`, Operations
`https://operations.example/releases/ops-17/remote.js`, and Clinical
`https://clinical.example/releases/clinical-9/remote.js`. Use each release's matching
stylesheet at the same immutable prefix, and gateway bases `/api/erp/graphql`,
`/api/agendamiento`, `/api/expediente` (or explicitly configured HTTPS gateways).
These example domains do not represent deployed services.

**ERP production CSS is hashed.** The native development manifest's `styles.css`
is not a production filename. List the actual `styles-*.css` in
`apps/mf-erp/dist/dental-erp-mfe1/browser`, then put its exact release URL in ERP's
`styles` field. Do not guess or strip its hash. The local artifact runner discovers
the single emitted `styles.css` or `styles-*.css` and renders that path into its HTTP
manifest. Every app gets its own loopback origin and `/releases/smoke/` prefix.

Manifest delivery is executable-code authority: restrict deployment permissions,
validate candidate JSON, protect transport, and audit changes. Do not put tokens,
secrets, session values or login credentials in it. No fixed origin allowlist in
the parser replaces operator policy. Shadow DOM is not a security sandbox: trusted
remote JavaScript can access host-origin storage and page capabilities.

## Release, cache and rollback contract

1. Build/test a new release independently. Check Angular/federation compatibility
   for ERP against the shell. Shared Angular singletons currently require matching
   Angular 22.2.3 / Native Federation 22.2.3; coordinate Angular upgrades, not every
   business deployment. Vue/React bundle their own framework runtimes.
2. Upload the complete release under a new immutable versioned directory. Never
   overwrite files at a published release URL. Check entry, CSS and lazy chunk
   URLs over HTTP with correct content types and CORS before changing the manifest.
3. Atomically replace `/platform-config.json` only after all referenced assets
   exist. Serve it with `Cache-Control: no-store`; shell fetches it with `no-store`.
   Serve shell/standalone HTML with `no-cache` (revalidate). Versioned immutable
   assets can use `Cache-Control: public, max-age=31536000, immutable`.
4. Retain the old manifest and all releases it references for rollback and open
   tabs. On regression atomically restore it and reload affected clients. Existing
   documents retain already-loaded modules; there is no hot release replacement.
   Test rollback using a fresh browser context as well as an existing tab.

For shell and standalone route paths, return their `index.html` on application deep
links. Do **not** return HTML for missing `.js`, `.css`, `.json`, WASM or font files:
return 404. Serve JavaScript as `text/javascript`, JSON as `application/json`, CSS
as `text/css`, and WASM as `application/wasm`. Release-relative chunk paths must
resolve under the same release prefix. Remote entry and CSS are not SPA routes.

Configure CORS on every remote artifact (including federation shared chunks and
fonts) for the explicit shell origin; use `Vary: Origin` when varying responses.
Configure gateway CORS/preflight separately when APIs are cross-origin. Avoid
wildcard credentialed CORS. The local server uses no-store everywhere for testing,
not the production immutable cache policy, and is not a production web server.

## Security and readiness boundaries

- Use HTTPS throughout. Define CSP `script-src`, `connect-src`, `style-src`, font
  and image sources for actual shell, remote and gateway origins. Native Federation
  uses module shims/import maps: validate your nonce/hash/inline policy against the
  built HTML, not a blanket permissive example. Remote CSS may fetch nested assets.
- ERP's local AI runtime may use blob Workers: evaluate `worker-src 'self' blob:`
  and WASM execution requirements (`wasm-unsafe-eval` where supported) against your
  threat model. Do not blindly allow remote model/CDN fetches or `unsafe-eval`.
  The smoke blocks external models; it does not certify production AI readiness.
- Do not enable service workers until a versioned manifest/asset cache and rollback
  contract is designed. The shell registers none; smoke blocks them explicitly.
- Gateway routing, authorization, identity provider integration, token audience,
  refresh/logout and CSRF/CORS policy are operator-owned. The current shell only
  reads existing `kc_token` from localStorage on demand; it does not authenticate
  or validate a session. Standalone origins do not share shell storage. Treat the
  current storage integration as a limitation to review, not production auth.
- The smoke injects a synthetic token into isolated browser storage and fulfills
  only read fixtures. It never sends real credentials, performs clinical/financial
  writes, forwards a request to a backend, or proves real gateway authorization.
- A failed remote must show a visible local failure while Home and other apps stay
  usable. Retry cannot undo the browser's immutable module cache; use a fresh page
  or a new operator-selected release URL, not automatic cache-busting loops.

Before deployment, verify real gateway contracts and identity in your own approved
environment, CSP in enforcement mode, supported browsers, keyboard/responsive
flows, observability, rollback and retention. Local artifact checks are integration
evidence only; this repository change neither deploys services nor provisions auth.
