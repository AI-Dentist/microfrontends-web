import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { Alert } from '../common/Alert.jsx';
import {
  ETIQUETAS_ESTADO_ANATOMICO,
  ETIQUETAS_SUPERFICIE,
  ETIQUETAS_CONDICION_SUPERFICIE,
  ETIQUETAS_TRATAMIENTO_ESTRUCTURAL,
} from '../../constants/odontograma.constants.js';

/**
 * Modal para la revisión y confirmación controlada de ENMIENDAS CORRECTIVAS (Iteración 7F-4B).
 *
 * Características:
 * - Tipo forzado e inmutable: ENMIENDA_CORRECTIVA.
 * - Referencia estricta e inmutable a la revisión corregida (`revisionCorregidaId`).
 * - Invariante clínica: `aplicaAlEstadoActual = false` (retrospectiva pura).
 * - Justificación clínica obligatoria con mínimo 10 caracteres (INV-ODO-05).
 * - Control de concurrencia optimista: `versionEsperada` vinculada al maestro consolidado.
 * - Previsualización del payload DTO conforme a `RegistrarRevisionOdontogramaHttpDto`.
 * - Bloqueo de persistencia real en MongoDB Standalone.
 * - Botón de simulación restringido a entornos de desarrollo/test con aviso claro "No guardado".
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {object} props.odontograma - OdontogramaActualDto del maestro actual
 * @param {object} props.revisionCorregida - Revisión histórica que se rectifica
 * @param {Array<object>} props.deltas - Deltas atómicos calculados contra el snapshot histórico
 * @param {object} props.resumen - Métricas del borrador
 * @param {string} props.motivoRevision - Justificación clínica
 * @param {Function} props.onMotivoChange - (val) => void
 * @param {string} props.fechaObservacion - Fecha ISO local
 * @param {Function} props.onFechaObservacionChange - (val) => void
 * @param {string} props.consultaId - ID de la consulta asociada
 * @param {Function} props.onConsultaIdChange - (val) => void
 * @param {object} props.validacionMetadatos - Resultado de validarMetadatosRevision
 * @param {object|null} props.payloadGenerado - Payload DTO final congelado
 * @param {Function} [props.onConfirmar] - Callback de despacho real (deshabilitado por bloqueo)
 * @param {boolean} [props.isSubmitting=false]
 * @param {object|null} [props.error=null]
 * @param {boolean} [props.escrituraHabilitada=false]
 * @param {Function} [props.onSimularEnvio] - Callback de simulación para desarrollo
 */
export function ModalRegistrarEnmienda({
  isOpen,
  onClose,
  odontograma,
  revisionCorregida,
  deltas = [],
  resumen = {},
  motivoRevision,
  onMotivoChange,
  fechaObservacion,
  onFechaObservacionChange,
  consultaId,
  validacionMetadatos,
  payloadGenerado,
  versionActualCambio = false,
  versionEsperadaOriginal = null,
  onResolverConflicto,
  onConfirmar,
  isSubmitting = false,
  error = null,
  escrituraHabilitada = false,
  onSimularEnvio,
}) {
  const [mostrarPayloadJson, setMostrarPayloadJson] = useState(false);
  const [errorLocal, setErrorLocal] = useState(null);
  const [mensajeSimulacion, setMensajeSimulacion] = useState(null);
  const [confirmacionConsciente, setConfirmacionConsciente] = useState(false);

  // Verificar entorno de desarrollo para mostrar controles mock
  const esEntornoDesarrollo = Boolean(
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV,
  );

  if (!isOpen) return null;

  const handleConfirmarEnvio = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    setErrorLocal(null);
    setMensajeSimulacion(null);

    if (versionActualCambio) {
      setErrorLocal(`Conflicto concurrente (INV-ODO-06): El odontograma cambió a la v${odontograma?.version}. Debe revisar y resolver el conflicto antes de confirmar.`);
      return;
    }

    if (!validacionMetadatos.esValido) {
      const msg = Object.values(validacionMetadatos.errores)[0];
      setErrorLocal(msg);
      return;
    }

    if (!payloadGenerado) {
      setErrorLocal('No fue posible construir un payload válido para la enmienda.');
      return;
    }

    if (onConfirmar) {
      await onConfirmar(payloadGenerado);
    }
  };

  const handleSimularMock = async () => {
    if (!payloadGenerado) {
      setErrorLocal('Complete los campos obligatorios antes de simular.');
      return;
    }
    setErrorLocal(null);
    setMensajeSimulacion('Simulación ejecutada: el payload es válido, pero ningún dato fue persistido en MongoDB.');
    if (onSimularEnvio) {
      await onSimularEnvio(payloadGenerado);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Preparar Enmienda Correctiva Histórica"
      onClose={isSubmitting ? () => {} : onClose}
    >
      <div className="modal-revision-content">
        {/* Cabecera auditada de la enmienda */}
        <div className="modal-revision-header-card" style={{ borderColor: '#d97706', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                ⚖️ Rectificación Formal de Registro Previo
              </span>
              <h4 style={{ margin: '2px 0 0', fontSize: '15px', color: '#78350f' }}>
                Revisión Corregida #{revisionCorregida?.numeroRevision || '—'} (<code>{revisionCorregida?.id}</code>)
              </h4>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Badge variant="warning">ENMIENDA_CORRECTIVA</Badge>
              <Badge variant="secondary">v{versionEsperadaOriginal || odontograma?.version || 1} esperada</Badge>
              <Badge variant="primary">{deltas.length} deltas calculados</Badge>
            </div>
          </div>
        </div>

        {/* Alerta de Conflicto de Concurrencia Optimista (INV-ODO-06) */}
        {versionActualCambio && (
          <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '14px', color: '#991b1b' }} role="alert">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>
                  Conflicto de Concurrencia Optimista (INV-ODO-06)
                </strong>
                <p style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: 1.4 }}>
                  Esta enmienda fue preparada sobre la versión <strong>v{versionEsperadaOriginal}</strong>, pero el odontograma maestro en el servidor avanzó a la versión <strong>v{odontograma?.version}</strong>.
                  La confirmación se encuentra <strong>bloqueada</strong> para prevenir sobrescrituras concurrentes no deseadas.
                </p>
                <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '4px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>Versión Base Borrador:</span> <strong>v{versionEsperadaOriginal}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Versión Vigente Servidor:</span> <strong>v{odontograma?.version}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Deltas Preparados:</span> <strong>{deltas.length} piezas</strong>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Revisión Rectificada:</span> <strong>#{revisionCorregida?.numeroRevision}</strong>
                    </div>
                  </div>
                </div>

                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={confirmacionConsciente}
                    onChange={(e) => setConfirmacionConsciente(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    He contrastado el estado vigente del odontograma (v{odontograma?.version}) y ratifico conscientemente que los {deltas.length} deltas preparados sobre el snapshot histórico de la Rev #{revisionCorregida?.numeroRevision} siguen siendo clínicamente pertinentes.
                  </span>
                </label>

                {onResolverConflicto && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!confirmacionConsciente) return;
                      onResolverConflicto();
                      setConfirmacionConsciente(false);
                    }}
                    disabled={!confirmacionConsciente}
                    style={{
                      fontSize: '12px',
                      padding: '4px 12px',
                      borderColor: confirmacionConsciente ? '#b91c1c' : '#d1d5db',
                      color: confirmacionConsciente ? '#b91c1c' : '#9ca3af',
                    }}
                    title={confirmacionConsciente ? 'Actualiza la versión esperada a la versión vigente del servidor' : 'Marque la casilla de revisión consciente para habilitar'}
                  >
                    🔄 Aceptar y Alinear a Versión Vigente (v{odontograma?.version})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notificación de Bloqueo Seguro de Escritura Standalone */}
        <div className="alerta-escritura-segura" role="region" aria-label="Aviso de persistencia segura">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '20px' }}>🛡️</span>
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: '#b45309' }}>
                Persistencia Real Deshabilitada (MongoDB Standalone en 127.0.0.1:27017)
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#92400e', lineHeight: 1.4 }}>
                La enmienda correctiva se prepara y valida en memoria con los DTOs exactos del backend. El botón de
                escritura real permanece <strong>bloqueado</strong> para proteger la base clínica.
              </p>
            </div>
          </div>
        </div>

        {/* Mensaje de simulación de desarrollo */}
        {mensajeSimulacion && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '8px 12px', borderRadius: '4px', fontSize: '12px', color: '#166534', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span>🧪</span>
            <span><strong>Simulación — No guardado:</strong> {mensajeSimulacion}</span>
          </div>
        )}

        {/* Errores de API o validación local */}
        {error && (
          <Alert
            title={error.title || 'Error en la solicitud de enmienda'}
            detail={error.detail || 'Ocurrió un error al procesar la enmienda correctiva.'}
            status={error.status}
            invalidParams={error.invalidParams}
          />
        )}

        {errorLocal && (
          <div className="form-error-banner" role="alert">
            <span>❌</span>
            <span>{errorLocal}</span>
          </div>
        )}

        {/* Formulario de Enmienda */}
        <form onSubmit={handleConfirmarEnvio} className="modal-revision-form" noValidate>
          {/* Revisión histórica referenciada (solo lectura) */}
          <div className="form-group">
            <label className="form-label" htmlFor="revisionCorregidaIdReadonly">
              Revisión Previa Rectificada (revisionCorregidaId) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="revisionCorregidaIdReadonly"
              type="text"
              className="form-input"
              value={revisionCorregida?.id || ''}
              readOnly
              disabled
              style={{ background: '#f3f4f6', cursor: 'not-allowed', color: '#374151' }}
            />
            <span className="form-help-text">
              Referencia inmutable de auditoría clínica (INV-ODO-05). La enmienda se vincula de manera permanente a este ID.
            </span>
          </div>

          {/* Fecha de Observación Clínica */}
          <div className="form-group">
            <label className="form-label" htmlFor="fechaObservacionEnmienda">
              Fecha de Observación Clínica Real <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="fechaObservacionEnmienda"
              type="datetime-local"
              className="form-input"
              value={fechaObservacion}
              onChange={(e) => onFechaObservacionChange(e.target.value)}
              required
              disabled={isSubmitting}
            />
            {validacionMetadatos.errores.fechaObservacionClinica && (
              <span className="field-error-text">{validacionMetadatos.errores.fechaObservacionClinica}</span>
            )}
            <span className="form-help-text">
              Fecha y hora en que ocurrió el acto clínico o la observación que se rectifica.
            </span>
          </div>

          {/* Consulta Asociada */}
          <div className="form-group">
            <label className="form-label" htmlFor="consultaIdEnmienda">
              Consulta Odontológica Asociada (Opcional)
            </label>
            <input
              id="consultaIdEnmienda"
              type="text"
              className="form-input"
              placeholder="Ej. cons_12345678-aaaa-bbbb"
              value={consultaId}
              onChange={(e) => onConsultaIdChange(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Motivo Obligatorio de Corrección (Mínimo 10 caracteres) */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="motivoEnmiendaInput">
                Justificación Clínica Obligatoria de la Enmienda <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <span style={{ fontSize: '11px', color: motivoRevision.length < 10 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {motivoRevision.length} / 500 caracteres (mínimo 10 requerido)
              </span>
            </div>
            <textarea
              id="motivoEnmiendaInput"
              className="form-textarea"
              rows={3}
              placeholder="Describa explícitamente el motivo clínico de la rectificación (ej. Rectificación de diagnóstico en pieza 16: se constató caries profunda y no obturación previa)..."
              value={motivoRevision}
              onChange={(e) => onMotivoChange(e.target.value)}
              maxLength={500}
              required
              disabled={isSubmitting}
            />
            {validacionMetadatos.errores.motivoRevision && (
              <span className="field-error-text">{validacionMetadatos.errores.motivoRevision}</span>
            )}
            <span className="form-help-text">
              Por norma de auditoría (INV-ODO-05), las enmiendas correctivas requieren una justificación de al menos 10 caracteres.
            </span>
          </div>

          {/* Invariante: aplicaAlEstadoActual = false */}
          <div className="form-group">
            <label className="checkbox-label" style={{ opacity: 0.85 }}>
              <input
                type="checkbox"
                checked={false}
                readOnly
                disabled
              />
              <span><strong>Enmienda retrospectiva pura:</strong> No altera el estado actual consolidado</span>
            </label>
            <span className="form-help-text" style={{ marginLeft: '24px' }}>
              🔒 <code>aplicaAlEstadoActual = false</code>. Esta enmienda rectifica únicamente la trayectoria histórica sellando
              un nuevo snapshot histórico, preservando intacto el estado actual del paciente.
            </span>
          </div>

          {/* Resumen de Deltas Calculados contra el Snapshot Histórico */}
          <div className="resumen-deltas-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                📊 Cambios Comparados contra el Snapshot de la Rev #{revisionCorregida?.numeroRevision}
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

            {/* Vista previa de deltas con valores anteriores del snapshot histórico */}
            <div className="deltas-preview-scroll">
              {deltas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No ha realizado modificaciones respecto al snapshot de la revisión corregida.
                </div>
              ) : (
                deltas.map((d) => (
                  <div key={d.numeroFDI} className="delta-preview-row">
                    <strong>FDI {d.numeroFDI}:</strong>{' '}
                    {d.estadoAnatomicoNuevo && (
                      <span>
                        Anatomía: {ETIQUETAS_ESTADO_ANATOMICO[d.estadoAnatomicoAnterior] || d.estadoAnatomicoAnterior} →{' '}
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
                        Tratamiento: {ETIQUETAS_TRATAMIENTO_ESTRUCTURAL[d.tratamientoEstructuralAgregado] || d.tratamientoEstructuralAgregado};{' '}
                      </span>
                    )}
                    {d.observaciones && <em>«{d.observaciones}»</em>}
                  </div>
                ))
              )}
            </div>

            {/* Inspección de Payload JSON */}
            {mostrarPayloadJson && (
              <div className="payload-json-viewer" aria-label="Visualizador JSON de Enmienda HTTP">
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  POST /odontogramas/{odontograma?.id || ':id'}/revisiones (ENMIENDA_CORRECTIVA)
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

            {/* Botón de simulación para desarrollo */}
            {esEntornoDesarrollo && onSimularEnvio && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleSimularMock}
                disabled={isSubmitting || !validacionMetadatos.esValido}
                style={{ fontSize: '12px', border: '1px dashed #6b7280' }}
                title="Valida la estructura del payload en desarrollo sin alterar MongoDB ni vaciar el borrador"
              >
                🧪 Simulación — No guardado
              </Button>
            )}

            {/* Botón de envío real — Bloqueado ante conflicto o standalone */}
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={versionActualCambio || !escrituraHabilitada || !validacionMetadatos.esValido || isSubmitting}
              title={
                versionActualCambio
                  ? 'Confirmación bloqueada: resuelva el conflicto de versión antes de registrar'
                  : !escrituraHabilitada
                  ? 'Persistencia real deshabilitada en MongoDB Standalone (solo réplica transaccional segura)'
                  : 'Registrar enmienda en el servidor'
              }
            >
              {versionActualCambio
                ? '⚠️ Conflicto de Versión'
                : escrituraHabilitada
                ? '💾 Confirmar Enmienda'
                : '🔒 Envío Bloqueado (Standalone)'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
