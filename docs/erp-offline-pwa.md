# Hosted ERP public offline boot

T2 caches **public build resources only**. It does not authenticate a user, grant
offline permissions, cache API responses, or enable financial operations offline.
The future PIN/vault/workspace and synchronization remain separate work.

## Build and publish

1. Build shell and ERP from the intended source. Preserve their federation v4
   metadata, shared modules, chunks, styles and referenced public resources.
2. For this ERP's owned ONNX worker, call `publishOwnedOrtRuntime(erpBrowserDir)`
   from `scripts/erp-public-inventory.mjs` after the ERP build. This copies the
   matching **already installed** SDK's two MJS/two WASM files and root asyncify
   fallback. It checks output ownership and compiled SDK version; it installs
   nothing and does not activate AI or download a model.
3. Supply a validated public platform configuration and an explicit same-build
   publisher inventory. Never include credentials, identities or private data.
4. Generate a new release file, then publish its exact assets and manifest together.

```text
node scripts/platform-artifacts.mjs --shell-dir <shell-browser-dir> --erp-dir <erp-browser-dir> --shell-base-url <shell-url/> --erp-base-url <erp-url/> --config <public-config.json> --output <new-erp-public-release.json> [--inventory <inventory.json>]
```

All six main inputs are required; output must not already exist. Deploy that file
as `/erp-public-release.json` on the shell origin. Angular copies the worker,
webmanifest and icons from `apps/shell/public/`. Include `erp-sw.js` explicitly in
the publisher inventory. Keep old immutable assets available during rollout.

Use HTTPS in production or HTTP loopback for development. ERP asset responses
must allow the shell origin through CORS and have the correct MIME type. Opaque,
redirected, failed, missing or digest-mismatched responses cannot publish a cache.
The webmanifest starts at `/erp`; no private ERP operation becomes available just
because the public shell can open there.

## Inventory and diagnostic API

`inspectPublicReleaseDraft(options)` emits
`{kind:'publisher-draft', assets, computedSites, issues}` without a version or
readiness. The CLI equivalent takes the five build/config inputs, no output:

```text
node scripts/platform-artifacts.mjs --inspect-draft --shell-dir <dir> --erp-dir <dir> --shell-base-url <url/> --erp-base-url <url/> --config <public-config.json>
```

This is a static graph diagnostic, **not** an attestation or an extension scan.
Resolve every issue and classify every actual computed site. Explicitly add any
owned resources that static traversal cannot discover.

`createPublicInventory({attestation:'publisher-public-complete-v1', roots,
loaderSites})` takes exactly two roots `{root,baseUrl,directory,files}` for shell
and ERP. The publisher supplies exact public relative paths from the same build.
Each loader site names its root/path, module and expression SHA-256, and supported
adapter. The returned inventory binds verified file content and sites to `buildId`.
Pass it as `inventory` to `generatePublicRelease(options)` or through `--inventory`.
Verified bytes are reused for parsing and hashing. This is not an atomic filesystem
snapshot or a security claim against a malicious publisher.

Without an inventory, strict literal-only generation still rejects computed imports.
Literal JS/import-meta URLs, federation roots, HTML, CSS imports/URLs and manifest
icons must resolve within the declared public roots. Only the standard empty-query
PrimeIcons EOT/SVG selectors are normalized; nonempty queries remain forbidden.
Raw platform configuration, arbitrary JSON, API paths and private metadata fields
are excluded. Public compiled `graphql.*.js` and `primeng_config.*.js` are code,
not GraphQL responses or private configuration files.

## Bounded runtime contracts

The conditional candidate carries `runtimePolicy` with adapter
`native-federation-load-module-v1`, sorted exact JS target URLs, and the required
`contracts` when additional implementations are involved:

- **Native federation:** the official `initFederation` options hook guards the
  active loader and delegates the original `importShim`, not raw `import()`.
- **`es-module-shims-fetch-v1`:** the reviewed 2.8.4 emitted implementation has
  seven recorded computed sites. Its official fetch hook checks targets before
  transport; `shimMode:true` and `nativePassthrough:false` prevent bypass.
- **`configured-module-remotes-v1`:** the reviewed module-page lookup uses validated
  platform configuration. Other configured modules retain their online-only public
  JS/CSS roots, without entering the ERP cache or widening the native loader set.
- **`owned-ort-wasm-paths-v1`:** the reviewed owned worker initializer fixes the
  two `onnx/` variants, one thread and no proxy. Its message API cannot supply
  module paths. All five owned resources are declared; raw SDK MJS bytes must
  match the cached SDK before browser-unreachable Node imports are classified.

Reviewed module/expression fingerprints identify these particular implementations;
**they are not exemptions or readiness by themselves**. Unknown implementations,
wrong roles/contracts, unconsumed declarations and missing targets fail generation.
A changed emitted implementation requires a new source/dataflow audit, not a
publisher-authored hash whitelist. `ownedOrtPublicAssetPaths()` is just the explicit
resource list, not proof that an arbitrary worker is confined.

The schema is `{schemaVersion:1,version,publicBootConfig,assets,runtimePolicy?}`.
Assets are URL-sorted `{url,sha256,kind}` records. `version` hashes UTF-8 JSON with
fields in order: `schemaVersion`, `publicBootConfig`, `assets`, then `runtimePolicy`
when present. There is deliberately no `runtimeReady` declaration.

## Worker lifecycle and client boundary

The shell probes `/erp-public-release.json?update=1` without caching it and registers
`/erp-sw.js?release=<version>` at scope `/`. No `skipWaiting` or `clients.claim`:
close existing controlled clients before a complete waiting update activates.

The worker validates metadata and its published source, verifies each response,
and writes the completion marker **last**. A failed new generation deletes only
its incomplete candidate. Same-version maintenance checks fresh metadata/source
before reuse and never destroys a prior complete generation on failure. Cached
resource responses remain digest-checked; status audits exact cache membership.

API/auth/GraphQL endpoints, authorization-bearing requests, non-GET requests and
queries remain network-only. Public platform configuration is network-first;
only a network exception permits its validated public snapshot. HTTP or validation
errors are not masked as offline success. Navigations can use the pinned public
shell, never an authenticated snapshot.

`ERP_PUBLIC_STATUS` through a MessageChannel reports resource version/completion,
asset records, public configuration and policy. Client validation additionally binds
the exact current controller and script URL. `window.erpPublicRuntime` is a volatile
`{ready,version}` diagnostic after supported active guards are installed. Controller
changes and delegated import failures invalidate readiness. It is **not** an API
credential, permission, identity, activation record or future vault authorization.
Existing hosted expiry/retirement, standalone behavior and legacy databases remain
unchanged. Public CacheStorage is not a place for PINs, tokens or business records.

## Acceptance status

Current-source builds, final293 Node checks and actual-browser8 checks passed;
independent risks2/5 inspection found no severe candidate-caused findings.
The next scoped acceptance unit preserves the runnable browser harness, exact
evidence and excluded/unavailable checks. No production deployment is claimed.
