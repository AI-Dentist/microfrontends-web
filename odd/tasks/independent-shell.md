# Independently deployable microfrontend shell
Branch: `feat/independent-microfrontend-shell`, base `746925b`. Delivery: local work-unit commits, no publication; forecast ~1800 authored lines across cohesive slices (generated locks excluded).
Checks: Node contract tests, app builds, Angular tests, real-browser multi-origin smoke and independent verification. Deployment credentials and identity-provider provisioning are outside this frontend implementation.

## Specs
S1. "Quiero que analices cómo podemos hacer la shell para los microfrontends" → implement the shell following the subsequent authorization.
S2. "Ya hice git pull, revisa de nuevo, porque son 3 microfrontends, hay uno de vue igual" → integrate the Angular, Vue and React applications from origin/main.
S3. "Quiero que lo hagas sin parar hasta acabar todo, quiero lo mejor, preparado para la posibilidad de que cada microfrontend se despliegue por separado, las mejores prácticas de la industria, que sea entendible, mantenible, escalable"
S4. "Continúa sin parar hasta acabar todo"

## Tasks
T1 | S2-S3 | inline | in_progress | Define versioned framework-neutral lifecycle, runtime deployment configuration and contract tests. Risk: item 5 (runtime deployment boundary). Commit: pending.
T2 | S2-S3 | delegated | pending | Vue standalone + remote lifecycle, configurable API/session, tests and docs. Risk: item 2 (session propagation). Commit: pending.
T3 | S2-S3 | delegated | pending | React standalone + remote lifecycle, configurable API/session, tests and docs. Risk: item 2 (session propagation). Commit: pending.
T4 | S1-S3 | inline | pending | Angular shell, ERP federation, isolated Vue/React loading, navigation and failure handling. Risk: item 5 (independent runtime loading). Commit: pending.
T5 | S2-S4 | inline | pending | Local orchestration, deploy/rollback/security guide and multi-origin browser verification; independent verification and native review per offered authority. Risk: item 5 (deployment examples). Commit: pending.

## Log
L1. User: "Quiero que analices cómo podemos hacer la shell para los microfrontends"
L2. User: "Ya hice git pull, revisa de nuevo, porque son 3 microfrontends, hay uno de vue igual"
L3. User: "Quiero que lo hagas sin parar hasta acabar todo, quiero lo mejor, preparado para la posibilidad de que cada microfrontend se despliegue por separado, las mejores prácticas de la industria, que sea entendible, mantenible, escalable"
L4. User: "Continúa sin parar hasta acabar todo"
L5. Assumptions: Angular host reuses ERP ./Routes; Vue/React expose self-contained ESM lifecycle v1 (not incompatible federation dialects), with host-owned Shadow DOM and no cross-framework shared state. One runtime manifest selects immutable release URLs and API bases. Existing standalone flows remain. No backend changes, fabricated production auth, automatic pushes/PRs or deployments. Actual production identity/gateway/CSP configuration is documented as operator-owned.
L6. Incident resolved read-only: active feat/mf-erp-angular was stale; switched to new branch from origin/main. Existing untracked ERP odd files and .angular cache preserved and excluded from commits. Read-only explorer lacked Git execution; parent inspected committed refs.
