# ERP workspace prototype

One interactive artboard: **Unified business workspace** (`erp-workspace/01-unified-workspace.html`). Spanish UI, fictional clinic and records, fixed date **18 May 2026**. Patient antecedents and editable resource/study catalogs now extend the inherited workspace. Tradeoff: connected in-memory demo, not a production ERP; consultation completion, study requests/results and QR payment remain pending (T3, S4–S6). Feature: [`../../odd/tasks/erp-prototype-full-workflows.md`](../../odd/tasks/erp-prototype-full-workflows.md).

## Open it

Open [`01-unified-workspace.html`](01-unified-workspace.html) directly in a modern browser. No build, installation, server or internet connection is needed. The same file is suitable for the design canvas: `/gentle:design open erp-workspace` (the parent opens the canvas).

The manifest describes one 1440 × 1000 artboard. The layout also adapts to 390px mobile screens; long tables scroll inside their own labeled regions, not across the page.

## Try the workflows

- **Resumen / Flujo de caja:** four Bs indicators, five-day income/expense chart, today's appointments and pending orders. Initial income Bs 700, expenses Bs 250, net Bs 450 and pending Bs 1,400. The day includes Bs 400 already paid on ORD-102 and Bs 300 on ORD-103. Prior-day chart values are independent fixtures.
- **Cobros:** combine order/patient search with pending, partial or paid status. On ORD-102, register Bs 200: its balance falls from Bs 800 to Bs 600; dashboard income becomes Bs 900, net Bs 650 and pending Bs 1,200. Cancel or Escape leaves balances unchanged. Empty, zero, negative, over-balance and fractional-cent amounts are rejected. A full-balance payment changes the status to paid. Only simulated cash is supported; no QR or provider integration.
- **Pacientes → Ver expediente:** search or register a fictional patient, then open that patient's clinical context directly. Names require 2–80 characters; unique demo documents require 3–30 Unicode letters, digits or hyphens. Inputs render as literal text. New records also appear in the clinical selector.
- **Atención clínica:** choose a patient, then add/edit/remove allergies (substance, reaction, recorded severity), family history (relation, condition) or personal-history notes. Empty sections say **Sin registrar**, never assert an absence of allergies. Each patient's entries remain separate across view changes. Required empty fields are rejected; Cancel/Escape discard form drafts. No odontogram, diagnostic conclusions, prescribing or consultation completion.
- **Agenda:** switch day/week and combine professional, consultorio and status filters. New or edited catalog resources immediately appear in selectors; inherited appointments retain stable resource references. Appointment creation is pending T3.
- **Catálogos:** tabs expose create/edit forms for Médicos, Especialidades, Consultorios, Laboratorio e imagen and Tipos de estudio. Names are required and case-insensitively unique within each catalog; optional physician documents are unique. A physician needs at least one specialty and availability window. Add multiple weekday/start/end/consultorio windows; the end must follow the start, same-physician windows cannot overlap, and adjacent windows are allowed. Consultorios have optional location and an active flag. Providers have LABORATORIO/IMAGEN mode, name and optional fictional contact. Study types have mode, optional matching default provider and a nonnegative Bs price with at most two decimals. A provider mode cannot change while incompatible study defaults reference it. Rejected or canceled forms leave catalog lists unchanged. No provider integration, image upload or image analysis.
- **Inventario:** combine name/code search and availability filter. The low-stock warning count reflects the filtered results. Stock quantities are fixtures, not editable.
- **Configuración → Clínica:** change the synthetic clinic name/contact; saving updates the header name.
- **Apariencia:** choose sourced blue `#0369a1` or teal `#0f766e` and comfortable/compact spacing. Save applies the theme and table/card density immediately.
- **Navegación:** hide/show sections and reorder with labeled up/down buttons, then save. Configuration cannot be hidden, so the demo cannot lock itself out.
- **Roles:** Administrador, Recepcionista and Médico start the demo. Add a unique local staff role and toggle its simulated permissions. Adding a role is immediately local; the save button retains checkbox edits across view changes. Patient is a business record, not a role. Permissions do **not** authorize or block any real action.

Use **Guardar cambios de demo** to apply settings. The status explicitly says **Solo en memoria; se pierde al recargar**. Reloading restores all original fixtures and settings. There is no durable draft, appointment-creation or persistence mode.

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

The smoke opens the file URL in fresh desktop/mobile contexts, blocks HTTP requests, traps API/storage writes and collects page errors. **207 checks** retain the original 121 assertions and add patient-specific clinical create/edit/remove/isolation, required-field rejection, Cancel/Escape and modal focus wrapping; specialty/physician/consultorio/provider/study creation and editing; duplicate/price/availability validation with unchanged public rows; agenda resource selectors, settings menu inclusion, mobile forms/internal table overflow and reload reset. It tests only public UI behavior, never closure state or Git history. Browser contexts close in `finally`; browser scratch is outside the repository. It never changes app/source data.

Generated full-page screenshots: [`desktop.png`](desktop.png), patient clinical context with edited fictional antecedents (1440 × 1000 viewport), and [`mobile.png`](mobile.png), physician catalog (390 × 844 viewport). Image heights may exceed the viewport. These are reference renders, not a pixel-diff baseline.

Observed T2 verification, exact command **`node design/erp-workspace/smoke.mjs`**:
- RED: exit 1, timeout waiting for `[data-chart="DEMO-001"]`, confirming the requested expediente entry point was absent.
- GREEN: first implementation passed 180 checks; expanded cases passed 201; final run **PASS 207 checks**, zero HTTP/API/storage writes and zero page errors. Palette/font and overlay/shadow self-check passed on every run. No visual RED/GREEN baseline is claimed.

## Shared model / next unit

All records live inside the existing HTML closure's `state`, never a global fake service. `patients[].id` remains the unique demo document; `patientContexts[]` links by `patientId`, with `allergies[]`, `familyHistory[]` and `personalHistory[]` containing stable entry IDs. Contexts are allocated only on successful save, not on view/cancel.

Catalog arrays are `specialties`, `physicians` (`specialtyIds`, optional `document`), `rooms` (`location`, `active`), `availability` (`physicianId`, `weekday` 0–6, `start`, `end`, `roomId`), `providers` (`mode`, `contact`) and `studyTypes` (`mode`, nullable `providerId`, integer `priceCents`). IDs survive edits; `newId` allocates only after validation. `saveCatalog` is the single catalog validation/mutation path. `addPatient` and `registerPayment` remain the inherited patient/cash mutation paths.

Inherited appointments now also have stable `id`, `physicianId` and `roomId`; agenda and clinical labels resolve through the catalog IDs. Original `professional`/`room` strings remain legacy fixture metadata, not the authoritative display references. Existing cash `orders.total`, `orders.paid` and `paymentTotal` still use the inherited Bs representation; T3 must explicitly reconcile that boundary before connecting new cents-based study prices to billing.

Coverage: **S1–S3** implemented; **S4** catalogs implemented but consultation requests/results remain pending; **S7** advances the same interactive artboard. **S5/S6** connected consultation/QR flows are not implemented or claimed. No real authentication, clinical decision-making or backend integration is introduced.
