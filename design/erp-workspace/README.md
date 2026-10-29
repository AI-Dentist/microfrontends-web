# ERP workspace prototype

**One connected local demo**, in Spanish, for fictional Clínica Dental Andina. For the interactive ERP, run from repository root:

```sh
node design/erp-workspace/preview.mjs
```

Open the printed `http://127.0.0.1:<port>/` URL in a normal browser, then click **Entrar a la demo**: **Resumen** opens. Keep the terminal running; Ctrl+C stops the server. No build, install or internet is needed. All records are fictional and in memory: **logout or reload clears every change and returns to login**. Fixed date: Monday 18 May 2026.

The **review/annotation canvas is for visual feedback**, not functional acceptance: its provider-owned sandbox can block native login/form interaction. The direct canvas `/files/` URL has the same restriction. Use the separate HTTP URL above; do not weaken canvas security. Alternatively, open [`01-unified-workspace.html`](01-unified-workspace.html) as a normal standalone `file://` document outside the canvas. The HTTP mode is the regression-tested interactive delivery.

The prototype contains **S1–S28** at demo scope (S28 runtime proof and combined S27/S28 independent verification passed), including **configuration-only Triage, complete editable-master CRUD, provider-free Laboratorio / Imagenología, Pagos outgoing expenses and simulated login/logout**. The first menu/page is **Resumen**; its outgoing totals now derive from the Pagos ledger, while Cobros remains incoming money. Each study menu opens its own CRUD directly, with no subtabs, provider records or provider request dependency. The appointment → consultation → cash/QR → receipt flow is preserved.

Feature: [`../../odd/tasks/erp-prototype-full-workflows.md`](../../odd/tasks/erp-prototype-full-workflows.md). The parent owns tracking, commits, review and canvas opening. This is not production medical, accounting, inventory or authorization software. Never enter real personal or medical information.

## Enter and reset the demo

The initial screen is **Inicio de sesión simulado · No ingreses credenciales reales**. Use the entry-arrow icon beside **Entrar a la demo**, or focus it and press Enter. No username/password fields are presented or read; this is a no-credential visual simulation, not authentication. The workspace stays hidden and inert until entry.

**Cerrar sesión** is the exit-arrow icon in the header, visible on desktop and mobile. It immediately hides the workspace and reloads the same document: every record, preference, custom role, draft, pending QR, payment and receipt is discarded. Re-entry restores the original fixtures, clinic, menu, theme and totals. Ordinary browser reload also returns to login. No cookies, storage, session tokens, auth query parameters or external service are involved. Real application authentication and role authorization remain unimplemented.

## Inspect menu access (S27)

Use the header's **Simular rol** selector on desktop or mobile. This is explicitly **Perfil de demostración**, not authentication: switching back to Administrator is intentionally allowed, even from **Sin módulos disponibles**. No credentials, storage or services are involved.

1. As Administrador, open **Configuración → Roles**. The list shows stable IDs and granted-menu counts, plus Ver / Editar / Eliminar.
2. **Editar** opens one scrollable matrix with **Acceder for each of all 17 menus**, plus the role name. **Guardar registro** applies immediately; Cancelar/Escape discard the draft. Ver lists every saved Sí/No grant and stable role ID.
3. Switch **Simular rol** to inspect the result. Effective navigation is **personal/clinic menu visible AND that role's explicit Acceder = true**. Preferences only narrow access; a grant does not unhide a personally hidden menu.

| Initial fictional profile | Menus with Acceder |
| --- | --- |
| Administrador (`ROLE-1`) | All 17 |
| Recepcionista (`ROLE-2`) | Resumen, Pacientes, Agenda, Cobros, Pagos |
| Médico (`ROLE-3`) | Resumen, Pacientes, Agenda, Atención clínica |
| New custom role | None until explicitly granted |

These are configurable **demo examples**, not a production authorization policy. The old three generic permission checkboxes are replaced, not retained as a second model. Unknown roles/menus, absent grants and non-boolean-true grants fail closed; there is no implicit Administrator fallback.

Revoking the current view redirects to the first permitted, personally visible menu in configured order. If none remains, the view and actions clear and **Sin módulos disponibles** explains selector recovery. Configuration is hidden for roles without its grant; the protected Configuration *preference* does not bypass Acceder. The same central route guard rejects internal chart/agenda/Cobros crosslinks without target-DOM errors or starting a denied consultation.

Removing Administrator's Configuration grant rejects explicitly: **El último Administrador debe conservar Acceder a Configuración.** It does not silently recheck the draft or mutate stored grants/IDs/counters/money. `ROLE-1` keeps its existing name/delete protection; deleting the currently simulated custom role also rejects until another profile is selected. Inactive free roles retain confirmed deletion. Reload/logout restores initial Administrator, grants, preferences, fictional data and money.

This is **UI visibility and route simulation only**, not backend/resource authorization or fine-grained business-action security. Independent item2 verification and persistent-URL acceptance passed; no native approval is claimed here.

## Configure and personalize Resumen (S28)

**Permissions and presentation are different controls.** As Administrador, open **Configuración → Roles → Editar**. After the 17-menu Acceder matrix, **Contenido de Resumen** grants **Finanzas**, **Agenda** and **Indicadores de consulta** independently. Acceder a Resumen is still required. Ver displays the saved Sí/No content grants without editable controls.

| Initial role ID | Resumen content grants |
| --- | --- |
| Administrador / `ROLE-1` | Finance, agenda, consultation indicators |
| Recepcionista / `ROLE-2` | Agenda only; conservative editable demo example |
| Médico / `ROLE-3` | Agenda and consultation indicators; no finance |
| New custom role | None, even when Acceder a Resumen is granted |

Grants use stable keys `finance / agenda / clinical`, never role-name matching. Rename preserves both grants and personal view preferences. Missing/unknown grants are false. Saving is atomic: Cancel/Escape or a rejected protected-Administrator edit cannot change saved grants, view preferences, IDs or money.

In **Resumen**, use the appearance/palette icon (**Personalizar Resumen**, hover/focus tooltip). The modal lists only permitted blocks. **Mostrar**, **Subir** and **Bajar** hide/order them; **Guardar vista** applies. **Cancelar/Escape** discard the draft and restore focus. **Restablecer vista permitida** resets the modal draft to visible permitted blocks in finance → agenda → clinical order; save to apply, cancel to discard. These preferences belong to the **simulated role ID in this browser closure**, not real multi-user personal settings.

Personalization can only narrow permissions. Revocation immediately removes a block and its stored preference; reset never restores a revoked block. All-hidden views keep personalization available. Zero-grant views explain recovery via **Simular rol → Administrador → Configuración → Roles**; no financial fallback appears. Other roles' view preferences remain isolated. Logout/reload resets role names, content grants and views with every other fictional record.

Finance includes all four monetary KPIs, chart, financial prose, pending-order table and financial shortcuts. Without its grant, none of that markup or accessible financial labeling is inserted into rendered Resumen—not merely hidden with CSS. Agenda retains the existing reference-day appointments. Consultation indicators count that day's scheduled/confirmed, in-progress and attended appointments from their actual lifecycle; they are clinic-wide operational counts, not diagnoses or a physician's own patient scope (profile-to-physician linkage is absent). Granted Administrator financial calculations remain integer cents and baseline **700 / 250 / 450 / 1400**.

**This client simulation is not a security boundary.** Fictional financial fixtures still exist in the downloaded HTML. There is no backend to withhold its payload; real API/resource authorization and authenticated per-user settings remain future work. No API, storage or transport changes were made.

S28 tests-first evidence supplied by the parent: actual HTTP job8 exited **1 after 51 passing checks** (about 5 seconds), failing `S28 Médico: financial KPI/chart/labels/shortcuts/attributes are absent from rendered Resumen, not CSS-hidden`. S21 and the focused S27 contract passed first. GREEN job9 exited **0** in 87 seconds: **PASS 1920 checks**, **20 allowed local HTML document loads**, **0 external/API/storage writes**, **0 page errors**. All four HTTP screenshots were refreshed. Independent read-only verification passed **60 checks**, exit **0**, with **2 owned baseline/candidate HTML GETs**, zero forbidden operations and page errors. It confirmed S27/S28 and affected S22–S26; unknown/missing-grant cases were explicitly source-only checks. Two verifier setup commands failed parsing before candidate execution; a dependency-size inspection timed out at 30 seconds. The final browser probe passed without source edits. Parent also verified the actual persistent URL with native login, Administrator totals, Doctor-only agenda/clinical blocks, authorized-only personalization, mobile no-overflow and logout.

## Pagos: simulated outgoing expenses

**Pagos** is separate from **Cobros**. Search its ledger by concept/ID, combine the category filter, and use the eye icon to view stable ID, date, concept, category, amount and optional note. Its distinct sidebar icon depicts a document with an outgoing arrow.

Use **Agregar +** at the upper right (accessible name **Agregar egreso**) to post a fictional outgoing amount:

- Concept: required after trimming, **1–120 characters**. Optional note: **up to 500 characters**, literal text only.
- Category: **Insumos, Servicios básicos, Alquiler or Otros**.
- Amount: positive Bs, at most two decimals, stored as safe integer cents. Individual or aggregate overflow rejects before ID allocation or ledger mutation.
- Date: readonly **2026-05-18**, the fixed reference day. No cross-date accounting is implied.
- Cancel/Escape discard drafts. Rejected or repeated posted submissions do not change records, IDs or money. Confirmation explicitly announces **Egreso simulado registrado. Solo en memoria; sin dinero real.**

The ledger starts with **one Bs 250 fixture**, not an additional fixed charge. Resumen outgoing KPI, net and current chart bar share that ledger. Starting totals are **700 / 250 / 450 / 1400**; posting Bs 100 gives **700 / 350 / 350 / 1400**, then Bs 50.25 gives **700 / 400.25 / 299.75 / 1400**. Expenses never change income or pending collections. Net may be negative: there is no insufficient-cash rule. The chart rescales for high outgoing amounts; earlier days remain fixtures.

Expenses are posted transactions with registration/list/detail, **not editable/deletable master data**. No bank connection, approval, reversal, audit framework or real payment is implemented. Mobile form actions stay visible in a sticky footer; long dialog content and tables scroll locally.

## Quick path: editable master data

| Sidebar / location | Editable fields and actions |
| --- | --- |
| **Médicos** | Name, optional unique demo document, specialties and multiple availability windows. |
| **Especialidades** | Specialty name. |
| **Consultorios** | Name, optional location and active flag. |
| **Laboratorio / Imagenología** | Direct, modality-filtered study CRUD: name and price only. Modality is fixed by the current menu and visible in the form/detail. No provider fields or subtabs. |
| **Enfermedades / Alergias** | Clinic reference name and optional description, at most 120 characters each. These never populate actual patient allergies or diagnoses. |
| **Triage** | **Clasificación** and **Descripción**, both required after trimming, each 1–120 characters. Classification is case-insensitively unique after trimming. Plain literal text only. No patient selector, history readout, vitals, scoring, diagnosis or assessment. |
| **Aranceles** | Procedure name and nonnegative price in cents (initial Consulta demo Bs 300 / Control demo Bs 600). |
| **Pacientes** | Create a fictional patient; edit name (2–80 characters) and follow-up notes (up to 120). The unique demo document / ID stays immutable, visibly explained. |
| **Inventario** | Create/edit code (1–30 letters, digits or hyphens; unique ignoring case), name (1–120), quantity and threshold (safe nonnegative integers). No stock ledger or inventory movements. |
| **Configuración → Roles** | Add a local role, then Ver / Editar / Eliminar. Name 2–40 characters, unique ignoring case; one explicit Acceder boolean per each of 17 stable menu IDs, edited in the shared modal. Paciente is a business record, never a login role. |

Every listed master has **Agregar +, actual Ver/detail, Editar and Eliminar**. Details show its stable ID and saved configuration. Eliminar opens an explicit confirmation: Cancel/Escape do not mutate data. Empty catalogs show **Sin registrar**. Failed validation leaves displayed records, counters and money unchanged; IDs allocate only after successful validation.

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
| Demo roles | `ROLE-1` cannot be deleted/renamed or lose Configuration access. The currently simulated custom role cannot be deleted. |

Blocked confirmation explains the reference and leaves dependent records and financial totals untouched. Reference diseases/allergies/Triage have no automatic patient mapping. There is **no generic delete for consultations, historical appointments, orders, payments or receipts**. Fixed clinic identity/preferences are direct singleton editing, not fabricated create/delete-clinic operations. No actual security is changed.

## Try the complete connected workflow

1. **Especialidades / Consultorios / Médicos:** create resources; choose a specialty and weekday/start/end/active-room availability. New windows default to Monday 08:00–12:00, not to clinical information. Adjacent windows are allowed; overlapping same-doctor windows are rejected.
2. **Laboratorio / Imagenología:** open either direct menu and create a study with name and price. Modality is implicit in the menu, not editable. Ver shows its stable ID, name, modality and saved price; Editar preserves the ID; Eliminar confirms and protects referenced studies. Each menu shows only its own records, including after navigation and edits. Newly created types are immediately available for consultation requests, with no intermediate configuration.
3. **Pacientes → Ver expediente:** add/edit/remove actual patient allergy entries (substance, reaction, recorded severity), family history (relation, condition), personal-history notes and **Hábitos**. Habits is explicitly saved plain text up to 1000 characters; clear/save gives **Sin registrar**. Empty information never asserts absence of allergies. Cancel/Escape discard drafts; records remain patient-specific. Triage is now an unrelated configuration catalog, not another patient chart.
4. **Agenda → Agendar cita:** choose patient, doctor, active room, date/time, integer duration 15–240 minutes and a reason. Use 2026-05-18 within the configured Monday window. The entire appointment must fit one matching availability window. Doctor/room conflicts, invalid references, inactive rooms and invalid windows reject without mutation. Day/week, professional, room and status filters remain.
5. **Iniciar consulta / Continuar atención:** opens that appointment's patient and exactly one EN_CURSO consultation. Appointment becomes **En atención**. Enter human fictional motivo, anamnesis, exploración and diagnóstico; select procedures; **Guardar progreso** explicitly saves. No diagnosis or other clinical default is invented. Save before navigating: unsaved text is not a durable draft.
6. **Solicitar laboratorio / imagen:** choose an existing catalog type; no provider is selected or required. Empty/unknown types reject without adding requests. Requests show type, modality, patient/consultation and PENDIENTE. **Registrar resultado** saves human-written fictional text plus optional reference and marks COMPLETADO. No file upload, analysis or service call. Duplicate same-type requests within one consultation reject without mutation.
7. **Completar consulta demo:** requires all four documentation fields plus at least one billable procedure/study with a positive total. Pending studies may remain pending; no medical blocking rule or result is invented. Completion closes read-only, marks appointment **Atendida** and issues **one order**. Reopening cannot regress lifecycle or issue another order. Invalid/canceled actions do not advance lifecycle.
8. **Cobros → Ver detalle:** issued names/prices/patient are snapshots. Consulta Bs 300 + lab Bs 100.10 + image Bs 200.20 gives exactly **Bs 600.30**. Master edits update live patient/doctor/room selectors and linked labels, but do not rewrite issued order/receipt snapshots. Issuing an order increases pending money, never income.
9. **QR demo:** generate a positive amount up to the remaining balance. **QR de demostración · NO PAGABLE** is illustrative, not an encoded payment instruction. Only explicit **Simular confirmación (demo)** settles money and issues a receipt. Repeat click/Enter/reopen cannot settle twice. Expiry/cancellation are terminal with no money/receipt change. Cash changes the order revision, making an older pending intent obsolete; generate a new one.
10. **Registrar cobro:** simulated cash shares the single settlement path. Each confirmed payment has a unique DEMO receipt with clinic/patient/date/lines/method/payment/accumulated amount/remaining balance and **Sin validez fiscal · DEMO**. No real money, legal receipt or external service.

## Preserved workspace and accessibility

- Initial dashboard: Bs 700 income, Bs 250 expenses, Bs 450 net, Bs 1,400 pending. Prior fixture payments are labeled without historical receipts. Earlier chart days remain independent fixtures. Only confirmed cash/QR adds income.
- ORD-102 starts Bs 800 pending. A Bs 200 cash payment leaves Bs 600 and changes income/net/pending to Bs 900/650/1,200. Invalid/zero/negative/over-balance/fractional-cent payments, Cancel and Escape leave balances unchanged. Filters/empty states and low-stock counts remain coherent.
- One sourced light shell, palette and font stack; one header/sidebar/main. Clinic/contact, sourced blue/teal, comfortable/compact density and navigation hide/show/reorder remain configurable; the Configuration preference stays protected, but its role grant is required for visibility. No new framework.
- Every sidebar menu retains its readable name and its own semantic inline SVG geometry (17 distinct icons). Row actions stay SVG-only with accessible names and 44×44px targets. Patient **Ver** uses an eye; **Ver expediente** uses a clinical file. Hover/focus tooltips remain viewport-clamped, in the dialog top layer when applicable; Escape preserves focus restoration.
- **Agregar +** appears at the upper right of module/section headers, including catalogs, patients, agenda, inventory, expenses, roles, clinical history and consultation study requests. Accessible names identify the context, e.g. **Agregar Laboratorio**, **Agregar Imagen**, **Agregar Paciente**. The availability dialog uses **Agregar horario +**. There is no bare plus or generic tipo de estudio/provider UI.
- Modal buttons show readable text, including **Cancelar**, **Cerrar**, **Guardar registro**, destructive confirmations and financial confirmations. Configuration tabs **Clínica / Apariencia / Navegación / Roles** and **Guardar cambios de demo** also show text. Text buttons are not constrained to icon squares; mobile footers wrap without clipped labels. Other actions retain icons/tooltips.
- Labeled fields, semantic tables/captions, status/error announcements and visible focus. Shared native detail/edit/delete dialogs trap Tab/Shift+Tab, support Escape/Cancel and restore initiating focus when it survives. Keyboard tabs and mobile drawer trapping/Escape remain. Long tables scroll inside labeled regions, never across the page. Reduced motion supported.
- All HTML/CSS/JS/SVG inline. Only local HTML document loads use HTTP; no external assets/fonts, external/API/backend calls, authentication, credentials, cookies, localStorage, service worker or durable storage. The header session and permissions are simulated. No medical diagnosis/ML, prescription, real QR/provider integration or accounting certification. Source authority: [`../system.md`](../system.md).

## Preview boundary

`preview.mjs` exports **`startPreview()` → `{ url, close }`** for ephemeral test ownership; importing it does not listen. CLI invocation binds only **127.0.0.1**, on an OS-assigned port, and prints readiness. SIGINT/SIGTERM close owned connections. Tests always close the server in `finally`; no persistent worker server is left running.

Only GET/HEAD `/` and `/01-unified-workspace.html` serve the fixed artifact resolved relative to the module. GET reads the latest source. All other raw paths (including queries/traversal) return 404; mutating/unsupported methods return 405. There is no directory mapping, proxy, upload, configuration/secrets lookup, dependency or request-input logging. Responses use `no-store`, HTML UTF-8, `nosniff` and `no-referrer`. CSP allows only inline JS/CSS, denies network connections/external assets, base URLs, native form navigation and embedding, **without CSP sandbox**. Existing handlers prevent native form navigation; the HTML itself is unchanged.

## Verify

Run in the foreground from repository root with a timeout **at least 360 seconds**:

```sh
node design/erp-workspace/smoke.mjs
```

Uses existing Playwright via `apps/mf-erp/package.json` and its existing Chromium cache; never downloads or installs. The suite starts `startPreview()` and navigates **all journeys through actual HTTP**, using public DOM controls, never internal arrays or Git history. Browser routing permits only the owned server's GET/HEAD document loads/reloads; all other requests are blocked and reported. Fetch/API/storage writes and page errors are trapped across reloads. Own HTML loads are reported separately, not falsely counted as zero HTTP. Browser contexts and the ephemeral server close in `finally`; no test scratch is created in the worktree.

S21 RED evidence is the parent's actual delivered-canvas reproduction (feature log L25–L26): native click left the workspace hidden under the served sandbox; scripted handler invocation opened Resumen. No HTML fix or provider-security change was justified. Focused HTTP login/server-boundary regression passes with native button clicks. Boundary checks cover exact GET/HEAD bodies/headers, loopback URL, restrictive non-sandbox CSP, unknown/arbitrary/traversal paths, no directory exposure and 405 methods.

Historical pre-S28 S27 HTTP result: `node design/erp-workspace/smoke.mjs` exited **0**, **PASS 1825 checks**, **17 allowed local HTML document loads**, **0 external/API/storage writes**, **0 page errors**. Desktop 1440×1000 and mobile 390×844 screenshots were refreshed. A first HTTP run exposed a test-only post-submit Enter reopening the focused launch button; native double-click corrected the duplicate-submit stimulus without changing the HTML.

S27 tests-first RED: the same command exited **1 after 50 passing checks**, failing the public Simular rol / 17-menu matrix / restricted-navigation contract. First full implementation run passed the focused contract but timed out in the new test's mobile-to-desktop transition; waiting for the existing public expanded-state attribute fixed the test race. First GREEN: **1822** checks; final expanded GREEN: **1825**. All previous **1718** checks remain, with only the obsolete three-checkbox role mock adapted to modal menu grants/counts. Added coverage includes all 17 rows per seed role, role switches, immediate grant/revoke, empty-role recovery/mobile drawer focus, current-page revocation, preference/grant intersection, last-Administrator no-mutation validation and public consecutive-ID proof, restricted patient/agenda/clinical/payment crosslinks, role stable-ID rename/detail/active-delete protection, and profile/grant reset on reload/logout. The final mobile matrix checks readable footer labels and both keyboard-wrap directions. Unknown-role/missing-property behavior is source-inspectable fail-closed logic, not a fabricated dropdown/state mutation test. Parent independent verification is pending.

Historical S22–S26 tests-first RED: the same command exited **1**, naming missing visible Agregar controls, five empty catalog menus, equal patient SVGs, icon-only Configuration and modal actions; it stopped at that combined assertion, with no final count. First GREEN passed **1388** checks. Expanded text-label audit initially rejected the deliberate availability plus suffix; correcting that test expectation gave final **1718** checks. All prior 1266 business checks remain, with intentional label/presentation expectations updated. Free seed examples are deleted through public confirmation before the existing isolated empty-state scenarios; no internal arrays are cleared. New-patient histories/habits remain **Sin registrar**, and cross-patient isolation, exact money, clinical/QR/receipt flow and logout reset still pass.

The historical file-only counts below are prior business evidence, **not proof of canvas interactivity**. Current HTTP verification retains those 1240 checks, with only intentional transport/message changes and a native double-click replacing synthetic repeated submission. It also captures all four screenshots over HTTP.

| Run | Observed evidence |
| --- | --- |
| Previous T2 CRUD candidate | Exit 0: **PASS 608 checks**; configuration Triage and complete master CRUD. |
| S12 RED, tests first | Exit 1: `S12 laboratory is direct study CRUD without providers`. No final count. |
| S12 first GREEN | Exit 0: **PASS 804 checks**, zero HTTP/API/storage writes/page errors. Provider-free requests/results still issue the exact Bs 600.30 order and cash/QR receipts. |
| Previous S12 expanded GREEN | Exit 0: **PASS 812 checks**, including unknown-type rejection, saved study details and stable-ID isolation. |
| S14–S16/S18 RED | `node design/erp-workspace/smoke.mjs`, exit 1: combined presentation assertion named missing Resumen, distinct navigation geometries, entity-specific create labels and icon-only actions. No final count. |
| First implementation check | Exit 1: Escape restored dialog focus but reopened its tooltip. Fixed by suppressing tooltip reopening during Escape focus restoration. |
| First GREEN | Same command, exit 0: **PASS 838 checks**. |
| Previous T2 expanded GREEN | Same command, exit 0: **PASS 1044 checks**. All 812 business/regression checks retained with intentional accessible-name/startup-label adaptations; added entity titles/delete confirmation, reviewed semantic SVG motifs, visible-button audits throughout navigation/dialog journeys, hover/focus/Escape tooltips in dialog and scrolled mobile table. Zero HTTP/API/storage writes/page errors. |

T3 verification used the same command in the foreground with a 360-second timeout:

| Run | Observed evidence |
| --- | --- |
| S17/S19/S20 RED | Exit 1: combined public-UI assertion identified missing initial login, hidden/inert workspace, logout and Pagos menu. No final count. No visual-baseline RED claimed. |
| First implementation check | Exit 1: a new test incorrectly expected exposed navigation while the mobile drawer was closed; corrected to assert hidden navigation, then exactly one navigation landmark after opening the drawer. |
| First GREEN | Exit 0: **PASS 1229 checks**. |
| Final expanded GREEN | Exit 0: **PASS 1240 checks**, zero HTTP/API/storage writes/page errors. Includes all previous 1044 checks with intentional login-entry, visible-main and 17-menu adaptations. |

New acceptance covers no-credential startup, hidden/inert workspace, mouse/keyboard entry, login/logout tooltips, mobile logout, expense categories/search/detail, exact KPI/chart updates, literal text and bounds, invalid amounts/category/concept/note and aggregate overflow, Cancel/Escape/focus, duplicate clicks/submit, consecutive public IDs, negative net and chart rescaling. Logout tests mutate cash, expenses, patients, catalogs, clinic/menu/theme/density/roles and pending QR, then verify baseline restoration and empty drafts/receipts/QR. Login and workspace screenshots are refreshed. No internal-state or Git-history test access is used.

All unaffected business and CRUD assertions from the 608-check candidate remain. Obsolete provider creation/default/selector/dependency checks are replaced by direct study CRUD, implicit modality, provider-free requests and source/runtime absence checks, not weakened clinical or monetary expectations. Navigation and dialog checks assert no visible provider text throughout the journey; a structural check rejects any provider concept in the artboard source. The earlier five obsolete patient-context Triage assertions remain replaced by real configuration CRUD. Coverage includes required/duplicate/blank/bounded Triage fields, literal malicious text, exact 120-character boundaries and rejection at 121, actual details, edits with stable IDs, Cancel/Escape no-ops, confirmed deletion/empty states; complete free-record CRUD per master; reference-deletion business snapshots; patient/context protection and live labels versus issued snapshots; role protection/CRUD; inventory typed validation and counts; public ID-allocation no-op proof; owned availability cleanup; mobile forms/focus/overflow. Existing patient history/habits isolation, complete appointments/consultations/studies, cent money, cash/QR idempotency, receipts, settings and reload-reset tests remain.

## Fictional starting examples (S25)

Every default module has examples. Previously populated doctors, rooms, specialties, procedures, inventory, patients, appointments, orders, expenses and three staff roles are unchanged. Laboratorio, Imagenología, Enfermedades, Alergias and Triage each add **one free fictional catalog fixture**, with stable `FIX-*` IDs that do not consume `newId`. Triage is configuration only; reference diseases/allergies never auto-apply to a patient.

Only **Celia Prueba / DEMO-003** has one explicit fictional entry in each clinical history collection. The existing `storedPatientContext` allocator owns that context. Alba, Bruno and every newly created patient remain undocumented unless explicitly edited. No seeded consultation is needed: the clinical menu already shows appointments/history. No new order, study request, diagnosis, receipt or payment is created. Money stays **700 / 250 / 450 / 1400**. Reload/logout restores these fictional examples, not future backend data.

**S27 Acceder is implemented as simulated UI navigation**, with the role seeds listed above. Combined S27/S28 independent verification passed; this is not real authentication or server authorization.

Current HTTP screenshots: [`login-desktop.png`](login-desktop.png), [`login-mobile.png`](login-mobile.png), [`desktop.png`](desktop.png) and [`mobile.png`](mobile.png) were refreshed by the passing suite at 1440×1000 / 390×844. They show simulated entry and role configuration with scrollable content and readable modal controls. Functional tests additionally cover each Resumen profile and personalization. No pixel-diff baseline is claimed.

## Shared model / maintenance handoff

Everything stays in the artboard closure's `state`, not a fake global API:

- `patients` uses immutable demo document IDs; `patientContexts` holds stable-ID allergy/family/personal entries and optional `habits`. Allocate contexts only through `storedPatientContext`; create patients through `addPatient`.
- `specialties`, `physicians`, `rooms`, `availability` retain stable links. `diseases`, `allergyCatalog` and new `triage` are independent clinic references (`name`, `description`). Roles have stable IDs and one `menuAccess` boolean map; `activeRoleId` controls demo inspection, with `ROLE-1` protected. Inventory retains stable IDs and supports editable `code` (fallback to inherited ID), `name`, `stock`, `min`.
- Reuse **`saveCatalog`** for validated master edits/creation, **`masterActions`**, **`openMasterEditor`**, **`openMasterDetail`**, **`deletionBlock`** and **`refreshMaster`** for public controls. Delete validation runs before mutation; only free physician availability / empty patient context cleanup is allowed. `validateRoleName` is shared with existing `addRole`.
- **Provider layer removed entirely:** `studyTypes` contains stable ID, name, mode and `priceCents`; `studies` links type/consultation/patient IDs plus mode, status and human result/reference. No provider collection, ID, default, selector or validation remains. Both direct modality routes reuse the same catalog save/detail/delete helpers; requested types remain protected. Modality is taken from the catalog draft's current menu and existing types cannot move between modalities.
- `appointments` connects patient/physician/room/date/time/duration/status; `consultations` has one appointment/patient, human documentation, procedure IDs and order ID. Reuse `createAppointment`, `startConsultation`, `saveConsultation`.
- **`registerExpense`** is the sole expense validation/ID-allocation/posting path. `expenseTotal` derives current-day outgoing totals from `state.expenses`, seeded once with EXP-1/Bs 250. `renderExpenses` handles filters; `openExpenseDetail` is read-only. Reuse `parseCents`, `money`, `newId` and shared native dialog helpers; do not introduce a second expense mutation path.
- All money is integer cents. `parseCents` validates input, `money` formats output. Issued orders now include a patient-name snapshot alongside immutable issued lines; receipts retain their own snapshots. Only **`registerPayment`** creates ledger/receipt records. QR holds order revision and cannot mutate money directly. `newId` allocates only after validation.

- Presentation uses **`decorateActions` / `actionPresentation` / `actionIcon`** as a shared adapter for static and dynamically rendered buttons. It preserves existing nodes, types, handlers and tab state; `actionPresentation` is the single contextual-exception policy for Agregar, dialogs and Configuration text; it keeps visible text distinct from contextual accessible names and avoids MutationObserver rewriting loops via `presentationText`. Other new action vocabulary must map through `actionIcon` to a semantic SVG rather than a fallback. S27 reuses this adapter and `saveCatalog`, `validateRoleName`, `addRole`, `roleMarkup`, `refreshMaster` for role CRUD instead of parallel mutation/presentation paths. A narrow MutationObserver decorates inserted controls and changed accessible menu labels. The shared manual-popover tooltip is owned by the active dialog when needed, clamps to the viewport and dismisses on Escape, scrolling, click or resize.

- S27 navigation uses **`menuAccess`** for complete boolean maps, **`roleAllows`** for strict known-menu/own-property/true checks, **`canNavigate` / `permittedMenus`** for the preference/grant intersection, **`navigate`** as the returning-boolean central guard and **`reconcileAccess`** for current-view fallback/no-modules clearing. Reuse these helpers for future links; target-DOM follow-up requires successful navigation. `startConsultation` checks before allocating IDs or mutating appointments. **`renderProfile`** preserves stable selection without any unknown-role fallback; role saves/add/delete refresh it. Native dialog and tooltip ownership are unchanged.

S28 maintenance: `overviewAccess` creates complete boolean maps; `overviewAllows` checks known keys/own-property/strict true. `overviewRole`, `defaultOverviewPreferences`, `allowedOverviewPreferences` and `reconcileOverviewPreferences` keep per-role-ID view preferences subordinate to grants. `renderOverview` composes only permitted visible `overviewFinance / overviewAgenda / overviewClinical` renderers. The personalization modal edits an isolated draft, commits only on save, and reuses shared native dialog focus/Cancel/Escape behavior and the presentation adapter. Role capability updates reuse `saveCatalog`, after validation and before its existing single commit; new roles reuse `addRole`. `reconcileAccess` refreshes Resumen on role changes without bypassing its menu guard. Deleting a free inactive role removes only its own preference entry.

Coverage: **S1–S28 verified at prototype scope: HTTP 1920 plus independent focused 60 checks. All prior CRUD/reference and clinical/payment invariants retained in regression tests. Pagos is outgoing posting/read-only history; login/logout is an explicit no-credential simulation with full reload reset.** Native review assessment remains unavailable because unrelated untracked files need declaration; no native approval is claimed. Local tracking/commits do not authorize publication.
