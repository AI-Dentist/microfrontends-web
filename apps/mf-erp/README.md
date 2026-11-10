# ERP standalone and federated routes

## Browser-local AI by runtime mode

Standalone keeps its existing automatic layout startup and browser-local tariff search /
expense-classification implementation, subject to worker/model availability. Shell-hosted
layout startup skips `ai.start()` via `if (!this.runtime.hosted)`, and its badge reports
`IA Navegador deshabilitada en este entorno`. Existing consumers can still request lazy
service startup; this does not establish verified hosted AI or a service-wide startup ban.
See [the source-backed capability limits](../../docs/ai-local-hosted.md). This correction
changes documentation only, not AI, offline, Dexie, idempotency or accounting behavior.

## Executive KPIs

The **KPIs** sidebar item opens `kpis` (ten ADMIN-only executive KPIs with a shared
`America/La_Paz` period filter) and `kpis/:kpi` (chart and backing table). Financial KPIs
use the MS1 query `obtenerKpisFinancieros`; agenda and stock KPIs use MS3
`GET /api/agendamiento/kpis`. `createErpRoutes` accepts an optional `agendaApiUrl`;
without it, hosted mounts use the same-origin Gateway and standalone uses
`environment.agendaApiUrl`. See [Executive KPIs](../../docs/executive-kpis.md).

## Manual Report Builder

Within `/erp/agent-console`, ADMIN users can toggle to **Constructor manual** mode.
This provides interactive entity exploration (`citas`, `pacientes`, `cuotas`, `pagos`,
`egresos`, `servicios`, `insumos`), column selection in server metadata order,
conditional status/date filtering (with explicit `America/La_Paz` boundaries),
tabular preview with 500-row cap warning (`filasTruncadas`), and authenticated
PDF/XLSX downloads via `ReportExportService`. Returning to agent mode preserves
active commands, text and interaction history. See [Manual Report Builder](../../docs/manual-report-builder.md).

## Standalone and federation entrypoints

Run the existing standalone application with `pnpm start`; `pnpm build` publishes
Native Federation `remoteEntry.json` exposing `./Routes`.

A compatible Angular shell must initialize Native Federation before bootstrap and
load `./Routes` on demand, not execute ERP's standalone bootstrap. The exposed module
exports `ERP_ROUTES` (also default) and `createErpRoutes({ graphqlUrl? })`. The factory
returns fresh host-relative routes with ERP providers at the route boundary:

```ts
const remote = await loadRemoteModule({ remoteEntry, exposedModule: './Routes' });
return remote.createErpRoutes({ graphqlUrl: validatedManifest.apiBaseUrl });
```

The optional URL flows through `provideErp(config)` to `provideErpGraphql(config)`.
Omitting it retains the standalone environment endpoint; no environment/global
mutation occurs. The host must validate operator configuration before passing it.
Existing per-request `kc_token` auth, permissions and financial behavior are unchanged.
ERP owns business navigation and styles; the shell owns global app navigation and
must load ERP's published global stylesheet (including its actual hashed filename
for production releases). Keep shared Angular and Native Federation versions
compatible with the shell. See `../shell/README.md` for runtime manifest and identity
limitations; production sign-in/logout infrastructure is not supplied here.
