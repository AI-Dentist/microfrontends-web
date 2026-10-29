# ERP workspace prototype

One interactive artboard: **Unified business workspace** (`erp-workspace/01-unified-workspace.html`). Tradeoff: unified business workspace; simulated data, no real backend. Spanish UI, fictional clinic and records, fixed date **18 May 2026**. This is a design prototype, not a production ERP implementation.

## Open it

Open [`01-unified-workspace.html`](01-unified-workspace.html) directly in a modern browser. No build, installation, server or internet connection is needed. The same file is suitable for the design canvas: `/gentle:design open erp-workspace` (the parent opens the canvas).

The manifest describes one 1440 × 1000 artboard. The layout also adapts to 390px mobile screens; long tables scroll inside their own labeled regions, not across the page.

## Try the workflows

- **Resumen / Flujo de caja:** four Bs indicators, five-day income/expense chart, today's appointments and pending orders. Initial income Bs 700, expenses Bs 250, net Bs 450 and pending Bs 1,400. The day includes Bs 400 already paid on ORD-102 and Bs 300 on ORD-103. Prior-day chart values are independent fixtures.
- **Cobros:** combine order/patient search with pending, partial or paid status. On ORD-102, register Bs 200: its balance falls from Bs 800 to Bs 600; dashboard income becomes Bs 900, net Bs 650 and pending Bs 1,200. Cancel or Escape leaves balances unchanged. Empty, zero, negative, over-balance and fractional-cent amounts are rejected. A full-balance payment changes the status to paid. Only simulated cash is supported; no QR or provider integration.
- **Pacientes:** search synthetic patient names/documents. Register a fictional name (2–80 characters) and unique demo document (3–30 Unicode letters, digits or hyphens). Inputs render as literal text. New records appear in the clinical selector, with an explicit no-consultations state.
- **Agenda:** switch day/week and combine professional/status filters. Rows identify date, time, professional and consultorio.
- **Atención clínica:** select a patient to see coherent scheduled consultations. No odontogram, diagnoses, prescribing or clinical editing is implemented.
- **Inventario:** combine name/code search and availability filter. The low-stock warning count reflects the filtered results. Stock quantities are fixtures, not editable.
- **Configuración → Clínica:** change the synthetic clinic name/contact; saving updates the header name.
- **Apariencia:** choose sourced blue `#0369a1` or teal `#0f766e` and comfortable/compact spacing. Save applies the theme and table/card density immediately.
- **Navegación:** hide/show sections and reorder with labeled up/down buttons, then save. Configuration cannot be hidden, so the demo cannot lock itself out.
- **Roles:** Administrador, Recepcionista and Médico start the demo. Add a unique local staff role and toggle its simulated permissions. Adding a role is immediately local; the save button retains checkbox edits across view changes. Patient is a business record, not a role. Permissions do **not** authorize or block any real action.

Use **Guardar cambios de demo** to apply settings. The status explicitly says **Solo en memoria; se pierde al recargar**. Reloading restores all original fixtures and settings. There is no draft/preview, scheduling or persistence mode.

## Accessibility and boundaries

One header/sidebar/main shell; semantic navigation, tables with captions, labeled inputs, visible focus, status/error announcements, keyboard-operable configuration tabs and native modal dialogs with explicit Tab trapping, Escape and trigger focus restoration. Desktop sidebar collapses; mobile uses an overlay drawer with focus trapping and Escape dismissal. Light-only styling, no animation, reduced-motion support. Advanced tools are explicitly labeled collapsed and not implemented, rather than presented as a fake expansion control.

All HTML, CSS, JavaScript and SVG are inline. No external fonts/assets, requests, backend, login, tokens, cookies, localStorage, service worker or durable data storage. Never enter real personal or clinical information. Production authorization, clinical logic, accounting/auditing, inventory movements and integrations are out of scope. The fixed header session is simulated, not authentication.

The source uses only the approved clinical palette, system sans stack, geometry and component rules from [`../system.md`](../system.md). Main/action/status text uses opaque AA-compatible colors; light decorative borders are not field boundaries.

## Verify

From the repository root:

```sh
node design/erp-workspace/smoke.mjs
```

The script resolves **existing** Playwright with `createRequire` anchored to the project-root `apps/mf-erp/package.json`. It uses the existing Chromium cache at `apps/mf-erp/node_modules/.cache/playwright` and does not download browsers. If that environment lacks Chromium/Playwright, report the prerequisite; do not install dependencies for this prototype.

The smoke opens the file URL in fresh desktop/mobile contexts, blocks HTTP requests, traps API/storage writes, collects page errors and checks 121 assertions including source palette/font inventory, shell, coherent payment updates and rejection/cancel behavior, patient validation/safe rendering, navigation, agenda, clinical empty state, inventory warning/filter consistency, saved clinic/theme/density, menu hiding/reordering, roles, keyboard focus, reload reset and no horizontal page overflow across mobile views. Browser contexts close in `finally`; browser scratch is outside the repository. It never changes app/source data.

Generated initial-state screenshots: [`desktop.png`](desktop.png) (1440 × 1000 viewport) and [`mobile.png`](mobile.png) (390 × 844 viewport). Screenshots capture the full page, so image height may exceed the viewport. These are reference renders, not a pre-existing visual baseline or a pixel-diff test.

Observed verification: first run exposed a modal Shift+Tab focus escape; explicit first/last-control wrapping fixed it. Second run: **PASS 121 checks**, zero HTTP/API/storage writes, zero page errors. No visual RED/GREEN baseline is claimed.
