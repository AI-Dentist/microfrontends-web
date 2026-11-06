# ERP public release manifest (in progress)

This generator does not install a service worker, make the application offline-ready,
cache responses, or authorize offline operations. Do not deploy it as an offline
release until the real build graph and the later service-worker verification pass.

After producing shell and ERP browser builds and preparing a validated **public**
platform configuration, the additive command is:

```text
node scripts/platform-artifacts.mjs --shell-dir <shell-browser-dir> --erp-dir <erp-browser-dir> --shell-base-url <shell-url/> --erp-base-url <erp-url/> --config <public-config.json> --output <new-erp-public-release.json>
```

All arguments are required. The output must not already exist. Deploy the generated
file as `/erp-public-release.json` on the shell origin alongside the exact build
assets it describes. Base URLs are explicit HTTPS URLs, or HTTP loopback URLs for
development. ERP cross-origin asset responses must permit the shell origin via
CORS; do not use opaque responses. A release must be generated again when public
configuration or any asset changes.

The JSON contract is `{schemaVersion: 1, version, publicBootConfig, assets}`.
`version` is lowercase SHA-256 of UTF-8 JSON for the object containing, in order,
`schemaVersion`, `publicBootConfig`, and URL-sorted `assets`. Each asset is
`{url, sha256, kind}`, with an absolute URL, lowercase SHA-256 of its bytes, and
lowercase filename extension (without the dot) as kind. The snapshot is produced
by the existing strict runtime validator; unknown fields and URL queries are
rejected. It retains the three remote configurations for normal validation, but
only shell and ERP resources belong to the asset graph. Do not put credentials or
private data in build assets or configuration.

Federation v4 shared entries and exposed files are roots. HTML references, JS
literal imports and import-meta asset URLs, CSS imports/URLs, and webmanifest icons
are traversed; unresolved computed imports and unsafe or missing references fail.
This is not yet proof of completeness for every emitter or HTML/CSS syntax.
Legacy PrimeIcons `.eot?#iefix` and `.svg?#primeicons` references are normalized
only to their HTTP asset URLs; their empty query and client-side selector are not
sent to the server. Nonempty queries and JS fragments remain rejected. CSS
references are analyzed with the cached Angular build's Lightning CSS parser;
discovered references must pass the same public asset checks. The real cached graph still fails on a
computed import in shell `chunk-KM4DOMOI.js`, the native federation runtime loader.
Neither a same-named helper nor its hash proves that all possible target URLs are
covered. Do not bypass this rejection or deploy a release as offline-ready.

The coordinator approved the publisher-owned inventory and bounded loader direction;
it is not yet implemented or accepted. This strict generator supports literal graphs
only, and continues to reject computed imports even if an inventory argument is
supplied. A same-build authoritative inventory and verified finite runtime targets
remain engineering work, not a product-decision blocker. No SW or bootstrap integration,
production build, real-browser offline proof, or independent security/delivery
approval is provided by this partial generator. Additional publisher integration
paths must be reported and authorized before editing outside the stated scope.
