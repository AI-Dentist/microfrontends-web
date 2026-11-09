# Verify a PagoFácil QR from localhost

Generate a QR normally, then click **Verificar pago QR** after paying. This explicit action sends `verificarPagoQrPagoFacil(pagofacilTransactionId: String!): Recibo` through the configured Gateway GraphQL endpoint with the bound transaction ID and current owner context. MS1 queries PagoFácil; localhost does not require a public callback tunnel for this action. No provider secrets enter the browser.

- A non-null confirmed receipt is passed unchanged to the existing receipt view/payment completion output.
- A null result means **Pago aún no confirmado**: the modal stays pending, emits no receipt and claims no successful payment.
- Provider errors remain visible without producing success. Repeated clicks while checking, offline sessions and closed/retired views send nothing; a response from an old principal cannot publish a receipt. An expired image alone is never proof of payment; explicit status checks remain available for late bank confirmations.
- Existing **Verificar pago** reads the ERP quota (passive readback), automatic quota polling and the standalone development simulation remain available without changing their behavior. Active verification is online-only, not queued.

The notice explains the real-provider boundary: PagoFácil bills the quota amount **/ 1000**, rounded by the backend with a minimum of **Bs 0,01** for positive amounts. ERP accounting and `Recibo.montoTotalBs` retain the full quota amount. The frontend never rescales accounting or changes mock values, offline queues, replay registries or idempotency logic.
