# Constructor manual de reportes

Acceso y generación de reportes tabulares estructurados a partir del catálogo de entidades de negocio del ERP (MS1) y Agendamiento (MS3), con previsualización segura y exportación autenticada a PDF y Excel (.xlsx).

## Acceso y permisos

| Característica | Regla |
|---|---|
| Permisos | Exclusivo para usuarios con rol `ADMIN`. |
| Conectividad | Exclusivamente online (requiere conexión activa; no se encola ni almacena en Dexie offline). |
| Ubicación | Integrado en `erp-agent-console` mediante el botón **Constructor manual**. |
| Retorno | Botón **Volver al agente** restaura la consola de instrucciones conservando texto, respuestas y estado previo. |

## Catálogo de entidades soportadas (S1)

| Clave | Entidad | Origen | Filtro Estado | Filtro Fecha | Notas / Restricciones |
|---|---|---|---|---|---|
| `citas` | Reservas / Citas | MS3 | Sí | Sí | Incluye probabilidad y nivel de riesgo No-Show. |
| `pacientes` | Pacientes | MS1 | No | No | Catálogo de pacientes y CI/NIT. |
| `cuotas` | Planes de Pago y Cuotas | MS1 | Sí | Sí | Montos y estados de cuotas de cobranza. |
| `pagos` | Pagos y Recibos | MS1 | No | Sí | Montos QR corresponden a valores nominales (demo PagoFácil /1000). |
| `egresos` | Egresos de Caja Chica | MS1 | No | Sí | Movimientos y conceptos de caja chica. |
| `servicios` | Catálogo de Servicios (Arancel) | MS1 | No | No | Aranceles y precios base de prestaciones. |
| `insumos` | Inventario / Stock de Insumos | MS3 | No | No | Stock actual, mínimo y alertas de bajo mínimo. |

## Reglas de interacción y validación

- **Orden de columnas**: Los selectores muestran las columnas en el orden del servidor (`listarEntidadesReporte`). La solicitud enviada a MS1 (`ReporteManualInput.columnas`) preserva estrictamente el orden de los metadatos del catálogo, independientemente del orden de selección del usuario.
- **Filtros condicionales**:
  - El selector de estado solo se muestra si la entidad define `filtrosEstado` no vacío.
  - Los campos de fecha (inicio y fin) solo se muestran si `filtroFecha === true`. Las fechas son opcionales según S2. Si se ingresan, se validan formato `YYYY-MM-DD`, que inicio no supere fin y rango máximo de 366 días. Se convierten a límites horarios explícitos de clínica La Paz (`-04:00`): `${fechaInicio}T00:00:00-04:00` y `${fechaFin}T23:59:59.999-04:00`.
- **Limpieza de estado**: Cambiar de entidad o modificar cualquier parámetro limpia inmediatamente la previsualización y cualquier mensaje de error anterior.
- **Previsualización y límites**:
  - Invoca la mutación `generarReporteManual` (S2) en MS1. No se ejecutan consultas SQL ni peticiones directas a MS3 desde el navegador.
  - Si el backend reporta `filasTruncadas: true`, se muestra una advertencia explícita informando el tope de 500 filas.
  - La tabla presenta un mensaje de `Sin resultados` si la respuesta carece de filas.
- **Exportación**:
  - Los botones accesibles con etiquetas `Exportar PDF` y `Exportar Excel (.xlsx)` delegan en `ReportExportService.download(report, 'pdf' | 'xlsx')`.
  - Se reutiliza la ruta canónica segura de MS1 `/api/v1/reports/export/{reporteId}/{format}` validando origen y autenticación activa.
