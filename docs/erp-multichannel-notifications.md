# Trace multichannel collection notifications

In `/erp/agent-console`, **Notificar cobro pendiente por WhatsApp, Telegram y Gmail** submits that exact instruction once through the existing agent command path (`modoAutonomoMonitoreo: false`). Dictation can enter the same instruction; voice transcripts still require deliberate submission. Existing role, network and pending-command behavior is unchanged.

Execution and history select the additive `notificacionMulticanal { exito modoEjecucion resultadosPorCanal { canal proveedor estado destino } }` object. Existing `notificacionN8nEnviada` and tool names remain compatible. Both `AgenteInteraccionResponse` and `RespuestaAgenteErp` expose the object.

The MCP notification card shows three separate destinations and badges: WhatsApp (Meta Test API), Telegram Bot and Gmail, plus execution mode. `SIMULADO_OK` or `SIMULADO_SIN_N8N` displays **SIMULADO**, never a claim of real delivery. A live `ENVIADO` result displays **ENVIADO**; other statuses are retained without converting them to success. Missing channel results or tool-only responses display **SIN_CONFIRMACION** and an unspecified destination. The legacy WhatsApp confirmation is used only when no structured payload exists, so simulation cannot produce the old sent badge.

The frontend does not contact Meta, Telegram, Gmail or n8n directly: MS1 returns channel evidence over the Gateway GraphQL contract. No credentials, offline queue or idempotency changes are required.
