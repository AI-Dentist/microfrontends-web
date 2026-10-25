import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Alert } from '../common/Alert.jsx';
import { Badge } from '../common/Badge.jsx';
import { Spinner } from '../common/Spinner.jsx';

/**
 * Modal accesible para la cancelación motivada de una Consulta Odontológica (Iteración 6F-3).
 *
 * Requisitos y validaciones de dominio:
 * - INV-CONS-04: Consulta en estado EN_CURSO.
 * - INV-CONS-06: Justificación médica u operativa obligatoria de al menos 10 caracteres
 *   (Nota: el DTO HTTP valida >= 5, pero la entidad del aggregate root exige >= 10;
 *   la interfaz valida >= 10 para garantizar aceptación en dominio).
 * - Longitud máxima de 500 caracteres.
 * - INV-CONS-09: Control de concurrencia optimista mediante versionEsperada.
 * - Integridad: La cancelación no elimina ningún documento ni registro histórico.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.consulta - ConsultaOdontologicaResponseDto
 * @param {Function} props.onClose
 * @param {Function} props.onConfirmar - ({ versionEsperada, motivoCancelacion }) => Promise<any>
 * @param {Function} props.onRecargar - Callback para recargar datos frescos ante 409
 */
export function CancelarConsultaModal({
  isOpen,
  consulta,
  onClose,
  onConfirmar,
  onRecargar,
}) {
  const [motivo, setMotivo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (!isOpen || !consulta) return null;

  const { id, version, estado, pacienteId } = consulta;

  const motivoLimpio = motivo.trim();
  const longitudValida = motivoLimpio.length >= 10 && motivoLimpio.length <= 500;
  const estaEnCurso = estado === 'EN_CURSO';
  const puedeCancelar = estaEnCurso && longitudValida;

  const handleConfirmar = async () => {
    if (!puedeCancelar || isSubmitting) return;

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const res = await onConfirmar({
        versionEsperada: version,
        motivoCancelacion: motivoLimpio,
      });
      if (res) {
        setMotivo('');
        onClose();
      }
    } catch (err) {
      setLocalError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecargarServidor = async () => {
    setLocalError(null);
    if (onRecargar) {
      await onRecargar();
    }
  };

  return (
    <Modal isOpen={isOpen} title="Cancelar Consulta Odontológica" onClose={isSubmitting ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Identificación de la consulta */}
        <div
          style={{
            background: 'var(--neutral-50)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <strong>Consulta: <code>{id}</code></strong>
            <Badge variant="neutral">Versión esperada: v{version}</Badge>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Paciente: <code>{pacienteId}</code> | Estado actual: <strong>{estado}</strong>
          </div>
        </div>

        {/* Advertencia de irreversibilidad y preservación documental */}
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: '13px',
            lineHeight: 1.45,
          }}
        >
          <strong>⚠️ Cancelación Irreversible:</strong>
          <p style={{ margin: '4px 0 0' }}>
            La consulta pasará a estado terminal <strong>CANCELADA</strong>. Esta acción es definitiva y no podrá reactivarse.
            Los datos registrados y el motivo de cancelación se preservarán íntegros en base de datos para trazabilidad y auditoría clínica legal. No se eliminará ningún documento.
          </p>
        </div>

        {/* Campo de motivo de cancelación */}
        <div>
          <label
            htmlFor="motivo-cancelacion-input"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Motivo o Justificación Clínica/Administrativa de la Cancelación: *
          </label>
          <textarea
            id="motivo-cancelacion-input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={isSubmitting}
            placeholder="Describa el motivo clínico o administrativo justificado (ej. Paciente desiste del tratamiento por urgencia personal, reacción adversa previa al procedimiento, etc.). Mínimo 10 caracteres."
            rows={4}
            maxLength={500}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '4px',
              fontSize: '12px',
              color: motivoLimpio.length < 10 ? 'var(--danger)' : 'var(--text-muted)',
            }}
          >
            <span>
              {motivoLimpio.length < 10
                ? `Faltan ${10 - motivoLimpio.length} caracteres para el mínimo requerido (10)`
                : 'Justificación válida'}
            </span>
            <span>{motivoLimpio.length} / 500 caracteres</span>
          </div>
        </div>

        {/* Estado no cancelable */}
        {!estaEnCurso && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--neutral-100)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              fontSize: '13px',
            }}
          >
            Solo es posible cancelar consultas que se encuentren en estado <strong>EN_CURSO</strong>.
          </div>
        )}

        {/* Error local / Problem Details */}
        {localError && (
          <div>
            <Alert
              title={localError.title || 'Error al cancelar la consulta'}
              detail={localError.detail || 'No se pudo registrar la cancelación de la consulta odontológica.'}
              status={localError.status}
              invalidParams={localError.invalidParams}
              onClose={() => setLocalError(null)}
            />

            {/* Manejo explícito ante HTTP 409 Conflicto de Versión */}
            {localError.status === 409 && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px 14px',
                  background: 'var(--neutral-100)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span>La consulta fue modificada concurrentemente. Recargue la ficha para revisar su estado antes de cancelar:</span>
                <Button variant="secondary" onClick={handleRecargarServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                  🔄 Recargar del Servidor
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Botones de acción */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Volver
          </Button>

          <Button
            variant="danger"
            onClick={handleConfirmar}
            disabled={!puedeCancelar || isSubmitting}
            style={{
              background: puedeCancelar ? 'var(--danger)' : undefined,
              borderColor: puedeCancelar ? 'var(--danger-border)' : undefined,
              color: 'white',
            }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Spinner /> Cancelando consulta...
              </span>
            ) : (
              '🚫 Confirmar Cancelación Definitiva'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
