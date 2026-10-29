# Complete connected ERP prototype workflows
Branch: `feat/erp-prototype-full-workflows`, base `9aa287b`. Scope: extend the existing self-contained artboard only; fictional in-memory data, no backend or production application changes.
Delivery: local coherent work-unit commits, no publication. Preserve the inherited prototype first; new authored work forecast ~1000–1600 lines across two connected slices plus browser checks. Runner: `node design/erp-workspace/smoke.mjs`.

## Specs
S1. "Faltan varias cosas en tu demo:" / "No veo dónde poner las alergias y antecedentes familiares" → editable patient allergy and family-history records.
S2. "No veo dónde crear el médico con su configuración de especialidades, horarios, etc" → physician creation with specialty and availability configuration visible in the scheduling workflow.
S3. "No veo dónde crear el consultorio" → consultorio creation and selection in scheduling.
S4. "No veo dónde crear el laboratorio e imagen" → laboratory/provider and laboratory/imaging study catalogs connected to consultation requests/results.
S5. "No veo el flujo completo de la consulta" → connected appointment, patient context, clinical documentation, procedures, studies and consultation completion.
S6. "No veo el flujo del cobro con QR" → demonstrable QR pending/confirmation/failure-or-expiry flow, updated order/cash state and receipt.
S7. "¿O es que realmente no querías mostrarme todo el ERP sino el diseño en general?" / "Dale" → expand the agreed prototype rather than only show visual layout. Accepted scope: "Configurar clínica y recursos → registrar paciente y antecedentes → agendar → atender consulta → solicitar estudios → generar cobro → pagar en efectivo o QR → emitir recibo."

## Tasks
T1 | S7 | inline | in_progress | Preserve inherited design/prototype and define connected scope. Commit: pending.
T2 | S1-S4,S7 | delegated | pending | Patient clinical context plus physicians/specialties/availability, consultorios and study-provider/type catalogs; preserve existing demo workflows and styles. Commit: pending.
T3 | S4-S7 | delegated | pending | Appointment creation, consultation lifecycle, study requests/results, generated charges, QR/cash settlement and demo receipts; all same shared in-memory records. Commit: pending.
T4 | S1-S7 | inline | pending | Browser acceptance for connected and rejected workflows, desktop/mobile, updated docs/screenshots/manifest, canvas refresh and final evidence. Commit: pending.

## Log
L1. User: "Faltan varias cosas en tu demo:\n- No veo dónde poner las alergias y antecedentes familiares\n- No veo dónde crear el médico con su configuración de especialidades, horarios, etc\n- No veo dónde crear el consultorio\n- No veo dónde crear el laboratorio e imagen\n- No veo el flujo completo de la consulta\n- No veo el flujo del cobro con QR\n\n¿O es que realmente no querías mostrarme todo el ERP sino el diseño en general?"
L2. Parent explained the previous prototype was visual/navigation only and proposed a connected, still-simulated full workflow. User authorized: "Dale".
L3. Constraints retained: one clinic, staff roles Administrador/Recepcionista/Médico configurable; patients remain business records and never ERP login roles. Shared shell header/sidebar; business views only. Existing sourced design/system.md tokens and light accessible visual direction remain. Same `erp-workspace/01-unified-workspace.html` artboard and manifest entry; no alternative-board rewrites. No real QR provider, webhook, payment, diagnosis/ML service, user credentials or backend/API traffic. All changes vanish on reload, keep that visible. No app/source, infrastructure or architecture-document changes in this feature; preserve unrelated untracked files.
L4. Implementation assumptions: one shared in-memory model drives catalogs, patient context, agenda, consultation and financial rows. Money represented in integer cents, settled only on explicit simulated confirmation. QR is visibly non-payable demo art, not a real encoded payment. Repeated confirmation must not duplicate receipts or money. Empty clinical information remains undocumented, never auto-filled as a clinical conclusion. Closed consultations do not create a second order on repeated completion.
L5. Local work units are reviewable by behavior; inherited single-file prototype is a baseline snapshot, not newly authored production code. Do not split or minify HTML merely to fit ~400 lines. Two coherent extensions may exceed that advisory budget because UI/data/tests for connected workflows belong together; no oversized PR is being opened.
