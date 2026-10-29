# ERP workspace prototype

**One connected offline demo**, in Spanish, for fictional Clínica Dental Andina. Open [`01-unified-workspace.html`](01-unified-workspace.html) directly in a modern browser; no build, server, install or internet. All records are fictional and in memory: **reload clears every change**. Fixed date: Monday 18 May 2026.

This T2 iteration implements **S11 configuration Triage and S13 editable-master CRUD**, preserving S1–S10 and the appointment → consultation → cash/QR → receipt flow. **Provider removal (S12) is still pending in the next T3 unit.** Laboratory/imaging providers, defaults and compatible-provider request selection deliberately still work.

Feature: [`../../odd/tasks/erp-prototype-full-workflows.md`](../../odd/tasks/erp-prototype-full-workflows.md). The parent owns tracking, commits, review and canvas opening. This is not production medical, accounting, inventory or authorization software. Never enter real personal or medical information.

## Quick path: editable master data

| Sidebar / location | Editable fields and actions |
| --- | --- |
| **Médicos** | Name, optional unique demo document, specialties and multiple availability windows. |
| **Especialidades** | Specialty name. |
| **Consultorios** | Name, optional location and active flag. |
| **Laboratorio / Imagen → Tipos de estudio** | Modality-filtered study name, price and optional compatible default provider. Provider removal remains pending. |
| **Enfermedades / Alergias** | Clinic reference name and optional description, at most 120 characters each. These never populate actual patient allergies or diagnoses. |
| **Triage** | **Clasificación** and **Descripción**, both required after trimming, each 1–120 characters. Classification is case-insensitively unique after trimming. Plain literal text only. No patient selector, history readout, vitals, scoring, diagnosis or assessment. |
| **Aranceles** | Procedure name and nonnegative price in cents (initial Consulta demo Bs 300 / Control demo Bs 600). |
| **Pacientes** | Create a fictional patient; edit name (2–80 characters) and follow-up notes (up to 120). The unique demo document / ID stays immutable, visibly explained. |
| **Inventario** | Create/edit code (1–30 letters, digits or hyphens; unique ignoring case), name (1–120), quantity and threshold (safe nonnegative integers). No stock ledger or inventory movements. |
| **Configuración → Roles** | Add a local role, then Ver / Editar / Eliminar. Name 2–40 characters, unique ignoring case; simulated Cobros / Agenda / Clínica permissions. Paciente is a business record, never a login role. |

Every listed master has **create, actual Ver/detail, Editar and Eliminar**. Details show its stable ID and saved configuration. Eliminar opens an explicit confirmation: Cancel/Escape do not mutate data. Empty catalogs show **Sin registrar**. Failed validation leaves displayed records, counters and money unchanged; IDs allocate only after successful validation.

Names are required and case-insensitively unique within resource catalogs. Patients may share a name; their demo documents are unique (3–30 Unicode letters, digits or hyphens). Physician documents are optional but unique. Prices accept at most two decimals, including zero; issued consultation totals must be positive.

### Deletion protection

| Master | Why deletion is blocked |
| --- | --- |
| Specialty | Used by a physician. |
| Consultorio | Used by availability or appointments. |
| Physician | Has appointments. A free physician's own availability alone can be removed with that physician. |
| Patient | Has appointments, consultations/history, study requests, orders or nonempty context, including habits. Only an empty owned context can be removed with a free patient. |
| Study type | Referenced by a requested study. |
| Procedure tariff | Selected in a saved consultation or referenced by issued procedure lines. |
| Active demo Administrator | Its stable `ROLE-1` identity cannot be deleted; its name remains Administrador. |

Blocked confirmation explains the reference and leaves dependent records and financial totals untouched. Reference diseases/allergies/Triage have no automatic patient mapping. There is **no generic delete for consultations, historical appointments, orders, payments or receipts**. Fixed clinic identity/preferences are direct singleton editing, not fabricated create/delete-clinic operations. No actual security is changed.

## Try the complete connected workflow

1. **Especialidades / Consultorios / Médicos:** create resources; choose a specialty and weekday/start/end/active-room availability. New windows default to Monday 08:00–12:00, not to clinical information. Adjacent windows are allowed; overlapping same-doctor windows are rejected.
2. **Laboratorio / Imagen:** each still has modality-filtered **Proveedores / Tipos de estudio**. Create matching providers and studies, or leave the catalog default provider empty. A compatible provider is still required at request time until T3. Cross-modality catalog saves are rejected without moving records.
3. **Pacientes → Ver expediente:** add/edit/remove actual patient allergy entries (substance, reaction, recorded severity), family history (relation, condition), personal-history notes and **Hábitos**. Habits is explicitly saved plain text up to 1000 characters; clear/save gives **Sin registrar**. Empty information never asserts absence of allergies. Cancel/Escape discard drafts; records remain patient-specific. Triage is now an unrelated configuration catalog, not another patient chart.
4. **Agenda → Agendar cita:** choose patient, doctor, active room, date/time, integer duration 15–240 minutes and a reason. Use 2026-05-18 within the configured Monday window. The entire appointment must fit one matching availability window. Doctor/room conflicts, invalid references, inactive rooms and invalid windows reject without mutation. Day/week, professional, room and status filters remain.
5. **Iniciar consulta / Continuar atención:** opens that appointment's patient and exactly one EN_CURSO consultation. Appointment becomes **En atención**. Enter human fictional motivo, anamnesis, exploración and diagnóstico; select procedures; **Guardar progreso** explicitly saves. No diagnosis or other clinical default is invented. Save before navigating: unsaved text is not a durable draft.
6. **Solicitar laboratorio / imagen:** choose a type and compatible provider. Requests show patient/consultation and PENDIENTE. **Registrar resultado** saves human-written fictional text plus optional reference and marks COMPLETADO. No file upload, analysis or service call. Duplicate same-type requests within one consultation reject without mutation.
7. **Completar consulta demo:** requires all four documentation fields plus at least one billable procedure/study with a positive total. Pending studies may remain pending; no medical blocking rule or result is invented. Completion closes read-only, marks appointment **Atendida** and issues **one order**. Reopening cannot regress lifecycle or issue another order. Invalid/canceled actions do not advance lifecycle.
8. **Cobros → Ver detalle:** issued names/prices/patient are snapshots. Consulta Bs 300 + lab Bs 100.10 + image Bs 200.20 gives exactly **Bs 600.30**. Master edits update live patient/doctor/room selectors and linked labels, but do not rewrite issued order/receipt snapshots. Issuing an order increases pending money, never income.
9. **QR demo:** generate a positive amount up to the remaining balance. **QR de demostración · NO PAGABLE** is illustrative, not an encoded payment instruction. Only explicit **Simular confirmación (demo)** settles money and issues a receipt. Repeat click/Enter/reopen cannot settle twice. Expiry/cancellation are terminal with no money/receipt change. Cash changes the order revision, making an older pending intent obsolete; generate a new one.
10. **Registrar cobro:** simulated cash shares the single settlement path. Each confirmed payment has a unique DEMO receipt with clinic/patient/date/lines/method/payment/accumulated amount/remaining balance and **Sin validez fiscal · DEMO**. No real money, legal receipt or external service.

## Preserved workspace and accessibility

- Initial dashboard: Bs 700 income, Bs 250 expenses, Bs 450 net, Bs 1,400 pending. Prior fixture payments are labeled without historical receipts. Earlier chart days remain independent fixtures. Only confirmed cash/QR adds income.
- ORD-102 starts Bs 800 pending. A Bs 200 cash payment leaves Bs 600 and changes income/net/pending to Bs 900/650/1,200. Invalid/zero/negative/over-balance/fractional-cent payments, Cancel and Escape leave balances unchanged. Filters/empty states and low-stock counts remain coherent.
- One sourced light shell, palette and font stack; one header/sidebar/main. Clinic/contact, sourced blue/teal, comfortable/compact density and navigation hide/show/reorder remain configurable; Configuration cannot be hidden. No new framework.
- Labeled fields, semantic tables/captions, status/error announcements and visible focus. Shared native detail/edit/delete dialogs trap Tab/Shift+Tab, support Escape/Cancel and restore initiating focus when it survives. Keyboard tabs and mobile drawer trapping/Escape remain. Long tables scroll inside labeled regions, never across the page. Reduced motion supported.
- All HTML/CSS/JS/SVG inline. No external assets/fonts, HTTP/API/backend, authentication, credentials, cookies, localStorage, service worker or durable storage. The header session and permissions are simulated. No medical diagnosis/ML, prescription, real QR/provider integration or accounting certification. Source authority: [`../system.md`](../system.md).

## Verify

Run in the foreground from repository root with a timeout **at least 240 seconds**:

```sh
node design/erp-workspace/smoke.mjs
```

Uses existing Playwright via `apps/mf-erp/package.json` and its existing Chromium cache; never downloads or installs. Tests use file URLs and **public DOM only**, never internal arrays or Git history. HTTP is blocked; API/storage writes and page errors are trapped. Browser contexts close in `finally`; scratch stays outside the worktree.

| This iteration | Observed evidence |
| --- | --- |
| RED | Exit 1: `S11 Triage is configuration CRUD, not patient assessment`. No final count. |
| First implementation run | Exit 1: test navigation raced the mobile-to-desktop media-query update before the new reference-protection snapshot. Fixed by awaiting the public menu expanded state, without dropping assertions. |
| GREEN | Exit 0: **PASS 595 checks**, zero HTTP/API/storage writes/page errors. |
| Expanded boundaries and owned-availability coverage | Exit 0: **PASS 608 checks**, zero HTTP/API/storage writes/page errors. |

The prior 406-assertion suite is preserved except the **five obsolete patient-context Triage assertions**, intentionally replaced with real configuration CRUD. New checks cover required/duplicate/blank/bounded Triage fields, literal malicious text, exact 120-character boundaries and rejection at 121, actual details, edits with stable IDs, Cancel/Escape no-ops, confirmed deletion/empty states; complete free-record CRUD per master; reference-deletion business snapshots; patient/context protection and live labels versus issued snapshots; role protection/CRUD; inventory typed validation and counts; public ID-allocation no-op proof; owned availability cleanup; mobile forms/focus/overflow. Existing patient history/habits isolation, complete appointments/consultations/studies, cent money, cash/QR idempotency, receipts, settings and reload-reset tests remain.

Current screenshots: [`desktop.png`](desktop.png) at 1440×1000 and [`mobile.png`](mobile.png) at 390×844, both showing a test-created example in the **configuration Triage list**. Tables may scroll locally. No pixel-diff baseline claimed.

## Shared model / next T3 handoff

Everything stays in the artboard closure's `state`, not a fake global API:

- `patients` uses immutable demo document IDs; `patientContexts` holds stable-ID allergy/family/personal entries and optional `habits`. Allocate contexts only through `storedPatientContext`; create patients through `addPatient`.
- `specialties`, `physicians`, `rooms`, `availability` retain stable links. `diseases`, `allergyCatalog` and new `triage` are independent clinic references (`name`, `description`). Roles now have stable IDs, with `ROLE-1` protected. Inventory retains stable IDs and supports editable `code` (fallback to inherited ID), `name`, `stock`, `min`.
- Reuse **`saveCatalog`** for validated master edits/creation, **`masterActions`**, **`openMasterEditor`**, **`openMasterDetail`**, **`deletionBlock`** and **`refreshMaster`** for public controls. Delete validation runs before mutation; only free physician availability / empty patient context cleanup is allowed. `validateRoleName` is shared with existing `addRole`.
- **Provider model deliberately retained:** `providers` has mode/contact; `studyTypes` has mode/default `providerId`/`priceCents`; `studies` has type/provider/consultation/patient IDs and human result. T3 must remove provider UI/data/dependency while reusing study CRUD and protecting requested types. Modality views/routes and public tests still exercise old compatible-provider behavior until that unit.
- `appointments` connects patient/physician/room/date/time/duration/status; `consultations` has one appointment/patient, human documentation, procedure IDs and order ID. Reuse `createAppointment`, `startConsultation`, `saveConsultation`.
- All money is integer cents. `parseCents` validates input, `money` formats output. Issued orders now include a patient-name snapshot alongside immutable issued lines; receipts retain their own snapshots. Only **`registerPayment`** creates ledger/receipt records. QR holds order revision and cannot mutate money directly. `newId` allocates only after validation.

Coverage: **S11 and S13 implemented; S1–S10 preserved. S12 provider removal intentionally unmet/pending T3.** Parent final verification/native review, tracking, commits and canvas remain outside this unit.
