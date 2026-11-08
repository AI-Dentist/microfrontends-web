# Assisted radiograph studies

The Estudios view includes an additive radiograph panel; existing study requests, laboratories and result registration remain available. Upload JPEG, PNG or WebP to preview it locally, then select **Analizar Radiografía con IA (TensorFlow)**. The panel POSTs JSON `{imagenBase64, mimeType}` to `/api/expediente/estudios/analizar-imagen` through the Gateway.

Results show model/version, confidence percentages, severity, suggested zone, normalized bounding-box overlays, clinical recommendations, backend disclaimer and unsupported labels. This is decision support for a qualified dentist, not a clinical clearance; unsupported conditions are never presented as absent.

Enter patient and consultation IDs, review findings and add an observation before saving: POST `/api/expediente/estudios` with `{pacienteId, consultaId, analisisIa: {...response, observacionMedico}}`. The backend derives the dentist from JWT and persists to MongoDB. GET `/api/expediente/estudios/paciente/:pacienteId` reloads assisted history after a confirmed save or on explicit request. Save/inference failures are visible; failed inference never saves a record. Images and analysis are held in memory only.

`createEstudiosService(client)` accepts an injected HTTP client; its compatible standalone export uses `createHttpClient()`, not the static singleton. Hosted `remote-session.js` supplies `apiBaseUrl` and the Shell's live `getAccessToken`. Existing methods and routes are retained. Session retirement suppresses late UI writes.
