# ERP workspace prototype

**One connected, offline demo**, in Spanish, for the fictional Clínica Dental Andina. The same artboard now connects resource catalogs → patient antecedents → appointment → consultation → laboratory/imaging studies → order → cash/QR simulation → DEMO receipt. Fixed reference date: **Monday 18 May 2026**. All changes disappear on reload.

Open [`01-unified-workspace.html`](01-unified-workspace.html) directly in a modern browser: no build, server, installation or internet connection. The parent controls canvas opening with `/gentle:design open erp-workspace`. Feature: [`../../odd/tasks/erp-prototype-full-workflows.md`](../../odd/tasks/erp-prototype-full-workflows.md).

Tradeoff: a coherent single-clinic workflow in one self-contained HTML file, **not** production clinical, accounting, payment or authorization software. Never enter real personal or medical information.

## Find the new areas (S8–S11)

| Sidebar entry | What it opens |
| --- | --- |
| **Médicos / Especialidades / Consultorios** | Each resource's existing catalog directly; physician specialties and availability still feed Agenda. |
| **Laboratorio / Imagen** | Separate modality-filtered pages, each with **Proveedores / Tipos de estudio** subviews. Both reuse the original arrays and stable IDs used by consultation requests. Forms default to the page's modality; cross-modality saves are rejected without moving or losing the record. |
| **Enfermedades / Alergias** | Separate, initially empty clinic reference lists: required unique name and optional description, each up to 120 characters. Create/edit only; no medical codes, diagnosis inference or automatic application to patients. Actual patient allergies remain in the chart. |
| **Triage** | **Vista inicial de Triage · campos y protocolo por definir**. Select a patient to read their saved allergies, family/personal history and habits. Empty selection is safe. No urgency, score, recommendations, vitals or clinical-decision save workflow. |
| **Aranceles** | Existing procedures and editable tariffs (legacy internal route `catalogs`). |

**Hábitos:** open **Pacientes → Ver expediente** or the patient context in **Atención clínica**, then **Editar hábitos → Guardar hábitos**. Free text, maximum 1000 characters; clear and save to show **Sin registrar**. It is patient-specific and persists only until reload. Cancel/Escape discard edits; navigating afterward never applies the discarded draft. No presets, interpretation or automatic risk classification. Triage reads this same saved field, not another copy.

All new entries participate in **Configuración → Navegación** hide/show/reorder. One shared header/sidebar remains; the long sidebar scrolls within the viewport and the mobile drawer retains keyboard trapping/Escape. No new permissions or patient login role.

## Try the complete workflow

1. **Especialidades / Consultorios / Médicos:** create a specialty and active consultorio. Create a physician, select the specialty and configure weekday/start/end/consultorio availability. Multiple windows are supported; adjacent windows are allowed, overlapping same-physician windows are rejected. The default new window is Monday 08:00–12:00. Names are required and case-insensitively unique within each catalog; optional physician documents are unique. Rooms have optional location and an active flag.
2. **Laboratorio / Imagen:** open each menu's **Proveedores** and **Tipos de estudio** to create one provider and matching study types/prices per modality. A matching default provider is optional in the catalog but a compatible provider is required when requesting a study. **Aranceles → Procedimientos** exposes editable demo tariffs (initial Consulta demo Bs 300 and Control demo Bs 600).
3. **Pacientes:** register a fictional patient (name 2–80 characters; unique demo document 3–30 Unicode letters, digits or hyphens), then **Ver expediente**. Add/edit/remove allergies (substance, reaction, recorded severity), family history (relation, condition) and personal-history notes. Empty information says **Sin registrar**, never asserts an absence of allergies. Each patient's records remain separate.
4. **Agenda → Agendar cita:** select that patient, physician and active consultorio; use **2026-05-18**, a time inside the configured Monday window, duration 15–240 integer minutes and a reason. The entire appointment must fit one matching availability window. Doctor/room overlaps, unknown records, inactive rooms and invalid availability are rejected without creating records. Day/week, professional, consultorio and status filters remain available. A reference-date field supports other dates without consulting the current clock.
5. **Iniciar consulta / Continuar atención:** the appointment opens its own patient context and one EN_CURSO consultation. Its linked appointment becomes **En atención** (`in_progress`) in clinical rows and the agenda filter; untouched fixtures retain Programada/Confirmada. Enter fictional human-written motivo, anamnesis, exploración and diagnóstico; select procedures. **Guardar progreso** explicitly saves fields and selections across navigation. No text or diagnosis is invented. Save before navigating away: unsaved text is not a durable draft.
6. **Solicitar laboratorio / imagen:** select a catalog study and compatible provider. Requests show patient, consultation and PENDIENTE status. **Registrar resultado** accepts human-written fictional text and optional reference metadata; it changes the request to COMPLETADO. No file upload, provider call or image/AI analysis occurs. Duplicate requests for the same type in one consultation are rejected. Cancel/Escape discard dialog drafts.
7. **Completar consulta demo:** requires all four documentation fields and at least one priced procedure/study line with a positive total. Pending studies are explicitly allowed and remain pending; no invented medical blocking rule or result is applied. Completion closes the consultation read-only, marks its linked appointment **Atendida** (`attended`) and issues **one** order. Reopening the closed record keeps Atendida and cannot issue another order. The clinical section is **Citas y consultas**; agenda filters include En atención and Atendida. Invalid completion and canceled dialogs do not advance the appointment; occupied appointment times still participate in conflict checks. **Ver cobro** opens the associated order.
8. **Cobros → Ver detalle:** verify the procedure/study line snapshots. With Consulta demo Bs 300 plus studies Bs 100.10 and Bs 200.20, the order is exactly **Bs 600.30**. Later catalog name/price edits do not change the issued order or its receipts. Order creation increases pending money, never income.
9. **QR demo:** enter a positive amount up to the remaining balance and **Generar QR demo**. The inline pattern is **QR de demostración · NO PAGABLE**, not an encoded payment instruction. The intent remains PENDIENTE until **Simular confirmación (demo)**. Confirmation settles that amount and emits one receipt; repeat clicks, Enter or reopening cannot settle it twice. **Simular vencimiento** and **Cancelar intento** are terminal without money/receipt changes. A cash/other payment changes the order revision, so confirming an older pending intent is rejected as obsolete. Generate a new intent for the current balance.
10. **Registrar cobro:** simulated cash shares the same settlement path and emits a receipt for every confirmed payment, including inherited fixture orders. Each order links its uniquely identified DEMO receipts, showing clinic, patient, date, lines, method, this payment, accumulated payment and remaining balance, with **Sin validez fiscal · DEMO**. No download or external service is involved.

## Preserved workspace

- **Resumen / Flujo de caja:** initial Bs 700 income, Bs 250 expenses, Bs 450 net and Bs 1,400 pending. Fixture paid amounts (Bs 400 on ORD-102, Bs 300 on ORD-103) are explicitly labeled prior fixture payments without historical receipts. The five-day chart's earlier values remain independent fixtures. Only confirmed cash/QR adds income.
- **Cobros:** search by order/patient and combine pending, partial or paid filters. On ORD-102, a Bs 200 cash payment reduces its Bs 800 balance to Bs 600 and updates income/net/pending to Bs 900/650/1,200. Empty, zero, negative, over-balance and fractional-cent payments are rejected; Cancel/Escape leave balances unchanged. Full settlement removes the cash action.
- **Inventario:** name/code and availability filters retain coherent low-stock counts. Stock is not editable.
- **Configuración:** clinic/contact, sourced blue/teal action color and comfortable/compact density remain editable. Navigation includes all eight direct new menus plus Aranceles; hide/show/reorder controls work and Configuration cannot be hidden. Staff roles remain Administrador, Recepcionista and Médico; custom local roles and simulated permission checkboxes persist until reload. **Paciente is a record, never a login role.** Permissions are not real authorization.

## Accessibility and boundaries

One header/sidebar/main shell; labeled fields, semantic tables with captions, status/error announcements, visible focus and keyboard-operable tabs. Native dialogs wrap Tab/Shift+Tab (including result textareas), close with Escape and restore initiating focus when the control survives. The desktop sidebar collapses; the mobile drawer traps focus and supports Escape. Long tables scroll inside labeled regions, not across the page. Light-only approved colors/fonts, no animation and reduced-motion support.

All HTML/CSS/JS/SVG are inline. No external assets/fonts, backend, HTTP/API calls, authentication, credentials, cookies, localStorage, service workers or durable storage. The header session is simulated. No real QR encoding, webhook, payment-provider confirmation, medical diagnosis/ML, prescription, legal receipt, accounting/auditing or inventory movement is claimed. Advanced tools remain explicitly unimplemented. Source authority: [`../system.md`](../system.md).

## Verify

From the repository root, run in the foreground with an adequate tool timeout (180 seconds used for T3):

```sh
node design/erp-workspace/smoke.mjs
```

The script resolves existing Playwright using `createRequire` at `apps/mf-erp/package.json` and the existing Chromium cache at `apps/mf-erp/node_modules/.cache/playwright`. It does not install/download anything. Browser contexts close in `finally`; browser scratch stays outside the repository. Tests use file URLs and public DOM controls, never closure arrays or Git history. HTTP is blocked; API/storage writes and browser errors are trapped.

Observed evidence for that exact command:

| Run | Actual result |
| --- | --- |
| RED, expanded candidate | Exit 1: `T3 discoverable appointment creation` assertion; no final count printed. Missing Agendar cita control. |
| First implementation | Exit 1: new duplicate-order test counted a search-filtered table as if all rows were visible. Test corrected to clear search before requiring exactly four orders; no business assertion removed. |
| GREEN after correction | Exit 0: **PASS 279 checks**. |
| Expanded mobile/rejection coverage | Exit 0: **PASS 304 checks**, zero HTTP/API/storage writes and zero page errors. |
| S5 lifecycle correction RED | Exit 1: `Starting consultation marks linked appointment En atención`; no final count printed. The linked appointment still showed Programada. |
| S5 lifecycle correction GREEN | Exit 0: **PASS 319 checks**, preserving all 304 assertions and adding linked appointment states, clinical labels, agenda filters, invalid/canceled-form invariance and reopen/order/income preservation. Zero HTTP/API/storage writes and page errors. |
| S8–S11 RED | Exit 1 on `S8-S11 eight direct business menus, not generic catalog tabs`; discovery printed menus **0/8**, habits **0**, references **0/2**, Triage **0/1**. No final count printed. |
| S8–S11 implementation checks | Two test-only corrections: disambiguate the Hábitos textbox from its labeled region; await the responsive menu state after resizing before opening the drawer. Existing business assertions were not removed. |
| S8–S11 GREEN | Exit 0: **PASS 406 checks**, including all prior 319 business checks (obsolete tab-navigation helpers now click real menus). Zero HTTP/API/storage writes and page errors. |

The inherited 207 checks remain, including all original 121 business/source checks. T3 adds a fresh independent context that creates patient/history/resources, rejects invalid/conflicting appointments, follows correct clinical context, saves/reopens one consultation, requests both modalities, records results, checks billing snapshots, exercises invalid/expired/canceled/confirmed/repeated/stale QR, finishes with cash and unique receipts, checks exact KPIs, reopens the closed consultation without duplicate billing, tests mobile forms/dialogs and allows pending-study completion without invented results. Reload resets everything. Palette/font plus overlay/shadow self-checks pass. No visual RED/GREEN baseline or pixel-diff test is claimed.

T2 historical evidence remains: its author RED waited for absent `[data-chart="DEMO-001"]`, then GREEN passed 207 checks. The parent's old combined command printed PASS207 but timed out during shutdown; that old-candidate command was not replayed. T3 results above are separate expanded-candidate executions with observed exit codes.

Current full-page screenshots: [`desktop.png`](desktop.png), Médicos with the expanded direct sidebar (1440×1000 viewport), and [`mobile.png`](mobile.png), initial Triage reading saved patient habits and antecedents (390×844 viewport). Heights can exceed the viewport. Live catalog labels can change; order/receipt lines retain their issued snapshots.

## Shared model / handoff

Everything lives inside the existing artboard closure's `state`, not a global fake API. Stable-ID arrays:

| Records | Links / representation |
| --- | --- |
| `patients`, `patientContexts` | Patient ID remains the demo document; per-patient allergies/familyHistory/personalHistory have stable entry IDs; `habits` is optional plain text on the same context. Contexts allocate only on successful save through `storedPatientContext`. |
| `diseases`, `allergyCatalog` | Independent clinic reference lists with stable IDs, name and optional description; no patient mapping or clinical decisions. |
| `specialties`, `physicians`, `rooms`, `availability` | Physician specialtyIds; windows carry physicianId, weekday 0–6, start/end and roomId. Catalog edits preserve IDs. |
| `providers`, `studyTypes`, `procedures` | Provider mode/contact; study mode/nullable default providerId/priceCents; procedure name/priceCents. |
| `appointments` | Stable id, patient, physicianId, roomId, ISO date, HH:mm time, duration, reason in service and status: scheduled/confirmed until started, in_progress during consultation, attended after completion. Closed-consultation reopening never regresses the linked status. Inherited professional/room strings are legacy metadata only. |
| `consultations`, `studies` | One consultation per appointment, patientId, human documentation, procedureIds, EN_CURSO/CERRADA and orderId. Study links consultationId/patientId/typeId/providerId plus mode, PENDIENTE/COMPLETADO, result/reference. |
| `orders`, `payments`, `receipts`, `qrIntents` | Orders contain immutable issued line snapshots, totalCents, paidCents, revision. Payments/receipts are created only by registerPayment. QR holds orderId, amountCents, orderRevision and terminal/pending status; it cannot mutate money directly. |

**All internal money is now integer cents**, including inherited orders, expenses, confirmed payment totals, new study/procedure prices and receipt amounts. `money` converts only for display; `parseCents` validates decimal inputs. Prior fixture income is 70000 cents; `paymentTotalCents` adds only new confirmed settlements. `newId` allocates after validation. Reuse `addPatient`, `saveCatalog`, `createAppointment`, `startConsultation`, `saveConsultation` and especially the single `registerPayment` ledger/receipt path rather than adding parallel mutation shapes.

Coverage: **S1–S7 preserved; S8 direct resource menus and modality isolation; S9 saved per-patient habits; S10 separate clinic reference catalogs; S11 initial read-only Triage**. New public-UI checks cover menu titles/breadcrumb/active state, modality default/filter/rejection and retained studies, editable tariffs, habits save/edit/clear/1000-character boundary/cancel/navigation/isolation/reload, real antecedent summaries in Triage, safe reference create/edit/duplicate validation without patient changes, settings hide/show/order and all eight mobile pages/forms plus long-drawer keyboard/viewport containment. T4 parent verification/canvas and all real production integrations remain outside this unit.
