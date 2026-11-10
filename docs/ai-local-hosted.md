# Browser-local AI: standalone capability and hosted limitations

**Automatic local-AI initialization is disabled in the Shell-hosted ERP.** Standalone and hosted mode must not be advertised as equivalent, working AI deployments. This document records existing behavior; it does not enable a model, worker, download or runtime feature.

## What the current code does

| Path | Standalone ERP | Shell-hosted ERP |
| --- | --- | --- |
| Layout startup | `ErpLayout.ngOnInit()` calls `ai.start()` under `if (!this.runtime.hosted)`. | That automatic startup call is skipped. |
| Status badge | Uses the actual local service status labels. | Always reads `IA Navegador deshabilitada en este entorno`; it is not worker-readiness evidence. |
| Tariff search and expense suggestions | Existing browser-local search/classification implementations remain available, subject to model/browser/network availability. | Consumers still contain on-demand calls; the service can lazily call `start()` when an inference request is not ready. This is not a verified, consistently reported hosted-AI capability. |

Skipping layout initialization is **not** a service-wide prohibition: `LocalAiService.request()` can call `start()`, and its reconnect callback can retry an unavailable/error session. Therefore neither "fully working inside the Shell" nor "no hosted path can ever create a worker/download" is supported by this startup guard. No such guard or behavior is changed by this documentation correction.

## Preserved standalone implementation and proof limits

The canonical `ai-local.worker.ts` entry imports the compatible `local-ai.worker.ts` implementation. Quantized q8 Transformers inference uses browser WASM rather than backend inference; first-use model artifacts require connectivity, and missing resources produce an unavailable/error state rather than fabricated predictions. Expense labels remain INSUMOS, SERVICIOS_BASICOS, ALQUILER, MANTENIMIENTO and OTROS; manual selection overrides late suggestions.

Existing layout/service/worker and consumer tests cover startup selection, messaging, mocked pipeline results, errors and manual fallbacks. They do not prove successful real-model downloads, semantic accuracy, production hosted inference, or complete/durable offline model availability. Standalone support is preserved, not newly enabled or certified beyond that evidence. Hosted tariff reads still use the authorized in-memory tariff, not the standalone persistent cache; that cache boundary is separate from AI startup.

## Source evidence

- [Layout startup](../apps/mf-erp/src/app/shared/components/erp-layout/erp-layout.component.ts) and [layout tests](../apps/mf-erp/src/app/shared/components/erp-layout/erp-layout.component.spec.ts).
- [Hosted status badge](../apps/mf-erp/src/app/shared/components/network-ai-status-bar/network-ai-status-bar.component.ts).
- [Service lazy startup/reconnect](../apps/mf-erp/src/app/core/ai-local/local-ai.service.ts), [tariff consumer](../apps/mf-erp/src/app/features/catalogs/services-tariff.component.ts), and [expense consumer](../apps/mf-erp/src/app/features/cash-flow/expense-modal.component.ts).
- [Worker contract tests](../apps/mf-erp/src/app/core/ai-local/local-ai.worker.spec.ts) explicitly use mocked pipelines without downloading model artifacts.

Offline PWA, Dexie, Idempotency-Key, accounting and synchronization behavior are unchanged. Backend agent/n8n notifications are separate from this local inference path.
