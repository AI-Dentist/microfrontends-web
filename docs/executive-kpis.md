# Executive KPIs in the web ERP

The ERP has a **KPIs** sidebar item. It shows ten executive KPIs for one period and opens a detail view per KPI. The data is read-only and comes from two existing backends: MS1 (GraphQL) for financial KPIs and MS3 (REST) for agenda and stock KPIs.

Canonical specification: `platform-infrastructure/odd/tasks/executive-kpis.md` (S1 list, S5 GraphQL contract, S6 REST contract).

## Quick path

1. Sign in as a user with the `ADMIN` role.
2. Open **KPIs** in the ERP sidebar (`/erp/kpis` both in the Shell and standalone).
3. Change **Desde** / **Hasta** and press **Aplicar**. The default period is the current month in `America/La_Paz`.
4. Click a card to open its detail (`kpis/<id>`): chart, backing table and the same period filter.

## Routes

| Route | Content |
|-------|---------|
| `kpis` | Heading "KPIs ejecutivos", period filter, ten cards in the S1 order |
| `kpis/:kpi` | KPI title, period filter, ECharts chart, "Datos del período" table, link back to the grid |

The period is kept in the `desde` and `hasta` query parameters (`YYYY-MM-DD`), so the grid, the detail view and the back link share it. An unknown `:kpi` shows "KPI no encontrado" and sends no request.

| # | KPI | Route id | Source |
|---|-----|----------|--------|
| 1 | Ingresos del período (Bs) | `ingresos` | MS1 |
| 2 | Morosidad: cuotas vencidas (% y Bs) | `morosidad` | MS1 |
| 3 | Pacientes más frecuentes (ranking) | `pacientes-frecuentes` | MS3 |
| 4 | Servicios más solicitados | `servicios` | MS1 |
| 5 | Tasa de inasistencia (%) | `inasistencia` | MS3 |
| 6 | Horarios pico | `horarios-pico` | MS3 |
| 7 | Insumos críticos (bajo mínimo y mayor rotación) | `insumos-criticos` | MS3 |
| 8 | Flujo de caja neto (ingresos − egresos) | `flujo-caja` | MS1 |
| 9 | Cobranza por método (efectivo vs QR) | `cobranza-metodo` | MS1 |
| 10 | Productividad por odontólogo | `productividad` | MS3 |

## Data sources

| Source | Request | Notes |
|--------|---------|-------|
| MS1 GraphQL | `obtenerKpisFinancieros(fechaInicio: DateTime!, fechaFin: DateTime!)` | Variables are La Paz day boundaries: `<desde>T00:00:00-04:00` and `<hasta>T23:59:59.999-04:00`. |
| MS3 REST | `GET <agenda base>/kpis?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Validated against the S6 envelope; malformed bodies are treated as unavailable. |
| MS1 names | Existing `listarPacientes` and `listarOdontologos(soloActivos: false)` | Patient and dentist names for KPIs 3, 5 and 10. A missing id shows "Paciente no encontrado (…)" or the dentist equivalent, never an invented name. |

The **agenda base URL** is resolved without Shell changes:

1. `agendaApiUrl` passed to `createErpRoutes({ ... })`, when the host supplies it (optional, additive).
2. Hosted: the origin of the bound GraphQL endpoint plus `/api/agendamiento` (same-origin Gateway, see [frontend gateway routing](frontend-gateway-routing.md)).
3. Standalone: `environment.agendaApiUrl` (`/api/agendamiento`), forwarded by the `/api` development proxy.

Requests carry the current host token (hosted) or the standalone credential, use `GET` only with no body, `redirect: 'error'`, `credentials: 'omit'` and a bounded timeout.

## States

| Situation | Behavior |
|-----------|----------|
| User without `ADMIN` | "Los KPIs ejecutivos requieren el rol ADMIN." No request is sent. Backends also deny it (S3). |
| Offline | Online-only notice. No request, no offline queue, no Dexie. The blocked period loads automatically when the connection returns. |
| Invalid period (start after end, more than 366 days) | Visible validation message. No request. |
| One source fails | Only that source's cards show "Fuente no disponible" (or "Acceso no autorizado" for 401/403); the other source still renders. |
| Empty period | Zeros and empty lists from the backend; tables show "Sin datos en el período". |
| Older response arrives after a new period | Discarded. |
| Host session revoked or principal changed while an MS3 request was in flight | The response is discarded (the request already sent cannot be recalled). |

KPIs 1 and 9 show the QR note: QR (`QR_PAGOFACIL`) amounts are the nominal installment amount, because the PagoFácil demo charges `/1000`. KPI 5 notes that it is the observed rate, not the model prediction.

## Limits

- The backends (MS1 T1, MS3 T2) were built in parallel. Frontend tests use fixtures that match S5 and S6 exactly; they are not live backend proof.
- The local MS1 SDL snapshot (`apps/mf-erp/src/app/core/graphql/ms1-schema.ts`) mirrors the approved S5 block until it is refreshed from the backend source.
- The existing dashboard cash-flow cards are unchanged.
