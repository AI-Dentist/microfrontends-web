# Frontend AI, ML, MCP and reports
Worker scope T6–T8; branch feat/ai-ml-mcp-reports. Canonical requirements: platform-infrastructure/odd/tasks/ai-ml-mcp-reports.md (read in full).

## Specs
- S0: "NO tocar ni reescribir la lógica de colas offline ni idempotencia".
- S12: "ai-local.worker.ts"; "INSUMOS", "SERVICIOS_BASICOS", "ALQUILER", "MANTENIMIENTO", "OTROS"; enable hosted local inference.
- S13: "Monitorea mi negocio"; "BARRAS", "LINEAS", "TORTA"; canonical MS1 GraphQL fields per coordinator response msg_e99210f6fcc7.
- S14: "Analizar Radiografía con IA (TensorFlow)"; injected client; image preview, normalized overlays and assisted history.
- S15: "BAJO", "MEDIO", "ALTO"; risk filtering and patient/stock clustering.
- S16: "Do NOT push and do NOT merge"; gateway public routes; four builds.

## Tasks
- T6 [done] S12-S13 route:inline commit:9ec2dac
- T7 [done] S14 route:inline commit:c6a874d
- T8 [done] S15 route:inline commit:8449d57
- T9 [done] S0,S16 route:inline commit:6830ec9 (four builds exit0; Angular497/497; Vue105/105; Shell/scripts293 pass+1 Windows symlink skip; React365 pass+15 main-proven pre-existing failures)

## Log
- L1: Original full dispatch and authoritative exact quotes live in canonical coordinator document, Log L1–L21; worker dispatch task_535c74beaed1 / ctx_364567c61a3e. Preserve unrelated pre-existing working tree changes; stage only owned files.
- L2: Coordinator confirmed toolsMcpInvocadas and notificacionN8nEnviada; clusters data.pacientes/data.insumos contain centroides, distribucion, asignaciones with paciente_id/insumo_id and cluster. No guessed aliases in GraphQL queries.
- L3: RED observed before implementations: hosted inference2 failures, categories1, report/cards3, WhatsApp3, studies API2, missing radiograph UI module1, Vue ML UI3/API1, Gateway defaults1 each and development proxy1. Focused GREEN: Angular158/158; Gateway40/40; React API+legacy12/12 and JPEG/PNG/WebP+invalid-image UI4/4; Vue focused9/9. Intermediate fixture/config failures were corrected; no skipped RED claimed.
- L4: Final full Angular command `cd apps/mf-erp && pnpm test --watch=false`: Test Files59 passed / Tests497 passed, exit0. Vue `node --test apps/mf2-vue-wendy/test/*.test.mjs`:105 tests/pass105/fail0. Shell+scripts:294 tests/pass293/fail0/skip1 (Windows symlink EPERM). Four-app production build via `node scripts/platform.mjs build` exit0, includes both remote bundles.
- L5: Full React `node --test apps/mf3-react-henry/test/*.test.js apps/mf3-react-henry/test/*.test.mjs`:380 tests/pass365/fail15. Identical command on isolated exact main853fd5036fcbf2e26c2044df652c83753184a94e:374 tests/pass359/fail15; exact same15 failing audit test names (live backend unavailable and dependent missing-ID errors). Six new tests add six passes. Proof .git/ai-react-main-baseline.log; no main checkout or changes.
- L6: Chromium built React/Vue remote checks10/10, errors0, synthetic HTTP only; normalized overlay geometry, upload, save/history, risk filter, clusters and live host Bearer verified (.git/ai-ui-browser.log). Angular browser smoke exit0: canonical title/summary/matrix, real ECharts BARRAS/LINEAS/TORTA switching, MCP cards and affirmative n8n confirmation; existing patient/cash/reception/offline-read checks preserved (.git/ai-angular-browser.log). No real inference, charges, Mongo persistence or WhatsApp delivery claimed.
- L7: Work units:9ec2dac156 authored lines; c6a874d214; 8449d57137; 6830ec974. All source work is committed on feat/ai-ml-mcp-reports; no push/merge. No offline queue/workspace/service-worker/idempotency implementation changed. Route assertions in existing tests updated only for requested Gateway defaults.
- L8: Native assessment unavailable due unrelated pre-existing untracked selection, including committed-only request; no native authority/approval claimed. No subagents/helpers launched (dispatch restriction). Risk:item5 (development Gateway routing/environment defaults); independent coordinator integration verification remains T9 owner responsibility. Pre-existing README/ODD/untracked docs untouched and unstaged. Full report .git/ai-frontend-delivery-report.md.
