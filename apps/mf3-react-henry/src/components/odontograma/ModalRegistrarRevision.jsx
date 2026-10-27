import { useState, useMemo } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { Alert } from '../common/Alert.jsx';
import {
  TIPO_REVISION_ODONTOGRAMA,
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
} from '../../constants/odontograma.constants.js';
import {
  construirPayloadRevision,
  validarMetadatosRevision,
} from '../../utils/odontograma-payloads.js';

// Función auxiliar pura para obtener fecha actual en formato YYYY-MM-DDTHH:mm
function obtenerFechaActualLocal() {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  return ahora.toISOString().slice(0, 16);
}

/**
 * Modal para el Registro Controlado de Revisiones del Odontograma (Iteración 7F-3B).
 *
 * Características:
 * - Formulario de metadatos clínicos (tipo de revisión, consulta, fecha clínica, motivo, proyección).
 * - Distinción estricta: NUEVA_OBSERVACION permitida; ENMIENDA_CORRECTIVA deshabilitada hasta 7F-4.
 * - Validación exhaustiva de invariantes antes del despacho.
 * - Resumen visual de diferencias y previsualización del payload JSON conforme al DTO backend.
 * - Bloqueo seguro de persistencia real en MongoDB Standalone (127.0.0.1:27017).
 * - Manejo especializado de códigos de respuesta HTTP (201, 400, 401, 404, 409, 422, 503).
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Si el modal está abierto
 * @param {Function} props.onClose - Callback de cierre
 * @param {object} props.odontograma - OdontogramaActualDto del servidor
 * @param {Array<object>} props.deltas - Cambios atómicos preparados en el borrador
 * @param {object} props.resumen - Resumen de métricas del borrador
 * @param {Function} props.onConfirmar - Callback para enviar el payload al backend (mock o real)
 * @param {boolean} [props.isSubmitting=false] - Indicador de envío en curso
 * @param {object|null} [props.error=null] - Error de la solicitud (ProblemDetailsError)
 * @param {object|null} [props.conflict=null] - Detalle del conflicto de concurrencia optimista (409)
 * @param {Function} [props.onRecargarConsolidado] - Callback para recargar el odontograma tras conflicto
 * @param {boolean} [props.escrituraHabilitada=false] - Restricción de persistencia en standalone
 * @param {Function} [props.onSimularEnvio] - Callback para pruebas de integración con mocks
 */
export function ModalRegistrarRevision({
  isOpen,
  onClose,
  odontograma,
  deltas = [],
  resumen = {},
  onConfirmar,
  isSubmitting = false,
  error = null,
  conflict = null,
  onRecargarConsolidado,
  escrituraHabilitada = false,
  onSimularEnvio,
}) {
  // Estados del formulario inicializados de forma limpia
  const [tipoRevision, setTipoRevision] = useState(TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION);
  const [consultaId, setConsultaId] = useState('');
  const [fechaObservacion, setFechaObservacion] = useState(obtenerFechaActualLocal);
  const [motivoRevision, setMotivoRevision] = useState('');
  const [aplicaAlEstadoActual, setAplicaAlEstadoActual] = useState(true);
  const [mostrarPayloadJson, setMostrarPayloadJson] = useState(false);
  const [errorLocal, setErrorLocal] = useState(null);

  // Metadatos actuales en memoria
  const metadatosActuales = useMemo(() => {
    const fechaISO = fechaObservacion ? new Date(fechaObservacion).toISOString() : '';
    return {
      tipoRevision,
      consultaId: consultaId.trim() || null,
      fechaObservacionClinica: fechaISO,
      motivoRevision: motivoRevision.trim(),
      revisionCorregidaId: null,
      aplicaAlEstadoActual,
    };
  }, [tipoRevision, consultaId, fechaObservacion, motivoRevision, aplicaAlEstadoActual]);

  // Validación pura previa
  const validacionMetadatos = useMemo(() => {
    return validarMetadatosRevision(metadatosActuales, deltas, {
      soporteSnapshotHistorico: false, // 7F-3B: Bloqueo de enmiendas retrospectivas sin snapshot
    });
  }, [metadatosActuales, deltas]);

  // Payload generado para inspección y auditoría clínica
  const payloadGenerado = useMemo(() => {
    if (!odontograma || !validacionMetadatos.esValido) {
      return null;
    }
    try {
      return construirPayloadRevision({
        odontogramaActual: odontograma,
        metadatos: metadatosActuales,
        deltas,
        opciones: { soporteSnapshotHistorico: false },
      });
    } catch {
      return null;
    }
  }, [odontograma, metadatosActuales, deltas, validacionMetadatos.esValido]);

  // Manejo de envío
  const handleConfirmarEnvio = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    setErrorLocal(null);

    if (!validacionMetadatos.esValido) {
      const msg = Object.values(validacionMetadatos.errores)[0];
      setErrorLocal(msg);
      return;
    }

    if (!payloadGenerado) {
      setErrorLocal('No fue posible construir un payload válido para el registro de la revisión.');
      return;
    }

    if (onConfirmar) {
      await onConfirmar(payloadGenerado);
    }
  };

  // Manejo de prueba/simulación (para validar flujo sin tocar base de datos principal)
  const handleProbarConMock = async () => {
    if (!payloadGenerado) {
      setErrorLocal('Primero complete los campos obligatorios del formulario.');
      return;
    }
    if (onSimularEnvio) {
      await onSimularEnvio(payloadGenerado);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="Registrar Revisión Odontográfica"
      onClose={isSubmitting ? () => {} : onClose}
    >
      <div className="modal-revision-content">
        {/* Encabezado informativo */}
        <div className="modal-revision-header-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Expediente Odontológico</span>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                {odontograma?.historiaClinicaId || 'Sin historia activa'}
              </h4>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Badge variant="primary">v{odontograma?.version || 1} del servidor</Badge>
              <Badge variant="warning">{deltas.length} piezas con deltas</Badge>
            </div>
          </div>
        </div>

        {/* Notificación de Bloqueo Seguro de Escritura Standalone */}
        <div className="alerta-escritura-segura" role="region" aria-label="Aviso de persistencia segura">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '20px' }}>🛡️</span>
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: '#b45309' }}>
                Entorno Local Principal Protegido (Standalone MongoDB)
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                La base de datos actual (<code>127.0.0.1:27017</code> - <code>clinica-dentalDB</code>) se ejecuta en modo
                independiente sin réplica transaccional. Para proteger la integridad del expediente clínico, el botón de
                escritura real permanece <strong>deshabilitado</strong>. Puede validar los metadatos clínicos, inspeccionar
                el DTO y evaluar el flujo con mocks controlados.
              </p>
            </div>
          </div>
        </div>

        {/* Manejo de Conflicto Concurrente 409 */}
        {conflict && (
          <div className="alerta-conflicto-concurrente" role="alert">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '13px', color: 'var(--danger)' }}>
                  {conflict.title || 'Conflicto de Concurrencia Optimista (HTTP 409)'}
                </strong>
                <p style={{ margin: '4px 0 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {conflict.detail ||
                    'El odontograma fue actualizado en el servidor por otro proceso concurrente. Su borrador no se ha sobrescrito automáticamente.'}
                </p>
                {onRecargarConsolidado && (
                  <Button
                    variant="secondary"
                    onClick={onRecargarConsolidado}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    🔄 Recargar Odontograma Consolidado
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Errores de API (400, 401, 404, 422, 503) */}
        {error && !conflict && (
          <Alert
            title={error.title || 'Error al registrar la revisión'}
            detail={error.detail || 'Ocurrió un error en el procesamiento de la solicitud clínica.'}
            status={error.status}
            invalidParams={error.invalidParams}
          />
        )}

        {/* Error local de validación previa */}
        {errorLocal && (
          <div className="form-error-banner" role="alert">
            <span>❌</span>
            <span>{errorLocal}</span>
          </div>
        )}

        {/* Formulario de Metadatos Clínicos */}
        <form onSubmit={handleConfirmarEnvio} className="modal-revision-form" noValidate>
          {/* Tipo de Revisión */}
          <div className="form-group">
            <label className="form-label" htmlFor="tipoRevisionSelect">
              Tipo de Revisión Clínica <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="tipo-revision-selector">
              <label className={`tipo-revision-opcion ${tipoRevision === TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipoRevision"
                  value={TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION}
                  checked={tipoRevision === TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION}
                  onChange={() => setTipoRevision(TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION)}
                  disabled={isSubmitting}
                />
                <div>
                  <strong>Nueva observación clínica</strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Registra nuevos diagnósticos, patologías y tratamientos observados en consulta.
                  </span>
                </div>
              </label>

              <label className="tipo-revision-opcion disabled" title="Requiere carga de snapshot histórico base (programado para Iteración 7F-4)">
                <input
                  type="radio"
                  name="tipoRevision"
                  value={TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA}
                  checked={tipoRevision === TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA}
                  disabled
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>Enmienda correctiva formal</strong>
                    <Badge variant="secondary" style={{ fontSize: '10px' }}>Bloqueado (7F-4)</Badge>
                  </div>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Rectificación retroactiva de un registro anterior. Requiere carga del snapshot histórico original.
                  </span>
                </div>
              </label>
            </div>
            {validacionMetadatos.errores.tipoRevision && (
              <span className="field-error-text">{validacionMetadatos.errores.tipoRevision}</span>
            )}
          </div>

          {/* Consulta Odontológica Asociada */}
          <div className="form-group">
            <label className="form-label" htmlFor="consultaIdInput">
              Consulta Odontológica Asociada (Opcional)
            </label>
            <input
              id="consultaIdInput"
              type="text"
              className="form-input"
              placeholder="Ej. cons_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a"
              value={consultaId}
              onChange={(e) => setConsultaId(e.target.value)}
              disabled={isSubmitting}
            />
            <span className="form-help-text">
              Vincule esta revisión al acto clínico odontológico en curso (estado EN_CURSO).
            </span>
          </div>

          {/* Fecha de Observación Clínica */}
          <div className="form-group">
            <label className="form-label" htmlFor="fechaObservacionInput">
              Fecha de Observación Clínica <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="fechaObservacionInput"
              type="datetime-local"
              className="form-input"
              value={fechaObservacion}
              onChange={(e) => setFechaObservacion(e.target.value)}
              required
              disabled={isSubmitting}
            />
            {validacionMetadatos.errores.fechaObservacionClinica && (
              <span className="field-error-text">{validacionMetadatos.errores.fechaObservacionClinica}</span>
            )}
            <span className="form-help-text">
              Momento cronológico real en que se efectuó la inspección estomatológica.
            </span>
          </div>

          {/* Motivo o Justificación Clínica de la Revisión */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="motivoRevisionInput">
                Motivo / Justificación Clínica de la Revisión <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <span style={{ fontSize: '11px', color: motivoRevision.length > 500 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {motivoRevision.length} / 500 caracteres
              </span>
            </div>
            <textarea
              id="motivoRevisionInput"
              className="form-textarea"
              rows={3}
              placeholder="Describa los hallazgos clínicos observados o la justificación del registro (ej. Obturación oclusal pieza 16 y diagnóstico de caries en pieza 21)..."
              value={motivoRevision}
              onChange={(e) => setMotivoRevision(e.target.value)}
              maxLength={500}
              required
              disabled={isSubmitting}
            />
            {validacionMetadatos.errores.motivoRevision && (
              <span className="field-error-text">{validacionMetadatos.errores.motivoRevision}</span>
            )}
          </div>

          {/* Proyección al estado actual */}
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={aplicaAlEstadoActual}
                onChange={(e) => setAplicaAlEstadoActual(e.target.checked)}
                disabled={tipoRevision === TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION || isSubmitting}
              />
              <span>Proyectar y actualizar el estado consolidado actual del odontograma</span>
            </label>
            <span className="form-help-text" style={{ marginLeft: '24px' }}>
              Las nuevas observaciones siempre se proyectan sobre el estado vigente.
            </span>
          </div>

          {/* Resumen de cambios dentales a enviar */}
          <div className="resumen-deltas-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                📊 Resumen de Cambios a Sellar ({deltas.length} piezas)
              </span>
              <button
                type="button"
                className="btn-toggle-json"
                onClick={() => setMostrarPayloadJson(!mostrarPayloadJson)}
              >
                {mostrarPayloadJson ? 'Ocultar JSON DTO' : '🔍 Inspeccionar Payload HTTP'}
              </button>
            </div>

            <div className="metricas-resumen-grid">
              <div className="metrica-chip">
                <strong>{resumen.totalPiezasModificadas || deltas.length}</strong>
                <span>Piezas</span>
              </div>
              <div className="metrica-chip">
                <strong>{resumen.totalSuperficiesModificadas || 0}</strong>
                <span>Superficies</span>
              </div>
              <div className="metrica-chip">
                <strong>{resumen.totalCambiosAnatomicos || 0}</strong>
                <span>Anatómicos</span>
              </div>
              <div className="metrica-chip">
                <strong>{resumen.totalTratamientosAgregados || 0}</strong>
                <span>Tratamientos</span>
              </div>
            </div>

            {/* Vista Previa de Deltas */}
            <div className="deltas-preview-scroll">
              {deltas.map((d) => (
                <div key={d.numeroFDI} className="delta-preview-row">
                  <strong>FDI {d.numeroFDI}:</strong>{' '}
                  {d.estadoAnatomicoNuevo && (
                    <span>
                      {ETIQUETAS_ESTADO_ANATOMICO[d.estadoAnatomicoAnterior] || d.estadoAnatomicoAnterior} →{' '}
                      <strong>{ETIQUETAS_ESTADO_ANATOMICO[d.estadoAnatomicoNuevo] || d.estadoAnatomicoNuevo}</strong>;{' '}
                    </span>
                  )}
                  {d.superficiesModificadas?.map((s) => (
                    <span key={s.superficie}>
                      {ETIQUETAS_SUPERFICIE[s.superficie] || s.superficie}:{' '}
                      {ETIQUETAS_CONDICION_SUPERFICIE[s.condicionAnterior] || s.condicionAnterior} →{' '}
                      <strong>{ETIQUETAS_CONDICION_SUPERFICIE[s.condicionNueva] || s.condicionNueva}</strong>;{' '}
                    </span>
                  ))}
                  {d.tratamientoEstructuralAgregado && (
                    <span>
                      {ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[d.tratamientoEstructuralAgregado] || d.tratamientoEstructuralAgregado};{' '}
                    </span>
                  )}
                  {d.observaciones && <em>«{d.observaciones}»</em>}
                </div>
              ))}
            </div>

            {/* Inspección de Payload JSON */}
            {mostrarPayloadJson && (
              <div className="payload-json-viewer" aria-label="Visualizador JSON de Payload HTTP">
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  POST /odontogramas/{odontograma?.id || ':id'}/revisiones
                </div>
                <pre>{JSON.stringify(payloadGenerado, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="modal-revision-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar / Volver
            </Button>

            {/* Botón de prueba con mock (para validar el flujo sin base de datos) */}
            {onSimularEnvio && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleProbarConMock}
                disabled={isSubmitting || !validacionMetadatos.esValido}
                style={{ fontSize: '12px' }}
                title="Valida la ejecución con respuesta 201 simulada sin escribir en MongoDB"
              >
                🧪 Simular HTTP 201 (Mock)
              </Button>
            )}

            {/* Botón de envío real — Deshabilitado con explicación si la persistencia está bloqueada */}
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={!escrituraHabilitada || !validacionMetadatos.esValido || isSubmitting}
              title={
                !escrituraHabilitada
                  ? 'Persistencia real deshabilitada en MongoDB Standalone (solo réplica transaccional segura)'
                  : 'Registrar revisión y persistir en servidor'
              }
            >
              {escrituraHabilitada ? '💾 Confirmar y Registrar Revisión' : '🔒 Envío Bloqueado (Standalone)'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
