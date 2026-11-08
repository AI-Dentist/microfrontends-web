# Browser-local AI

Tariff search in `/erp/catalogs` and expense suggestions in `/erp/dashboard` run in hosted and standalone mode. The canonical `ai-local.worker.ts` entry imports the compatible `local-ai.worker.ts` implementation: quantized q8 Transformers models run on WASM, never backend inference. Initial model downloads require connectivity; missing models produce an explicit unavailable state, not invented predictions.

Expense labels are INSUMOS, SERVICIOS_BASICOS, ALQUILER, MANTENIMIENTO and OTROS. Manual selection overrides late AI suggestions. Hosted search uses only its current in-memory authorized tariff, not the standalone persistent cache. Offline queue, workspace and idempotency logic are unchanged.
