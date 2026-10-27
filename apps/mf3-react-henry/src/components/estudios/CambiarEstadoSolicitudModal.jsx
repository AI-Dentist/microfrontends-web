/* oxlint-disable react/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Alert } from '../common/Alert.jsx';
import { estudiosService } from '../../api/estudios.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';

export function CambiarEstadoSolicitudModal({
  isOpen,
  onClose,
  solicitud,
  onEstadoCambiado,
}) {
  const { token } = useDevAuth();
  const [nuevoEstado, setNuevoEstado] = useState('EN_PROCESO');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && solicitud) {
      if (solicitud.estado === 'SOLICITADO') setNuevoEstado('EN_PROCESO');
      else if (solicitud.estado === 'EN_PROCESO') setNuevoEstado('COMPLETADO');
      else setNuevoEstado('CANCELADO');
      setObservaciones('');
      setError(null);
    }
  }, [isOpen, solicitud]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!solicitud?.id) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        nuevoEstado,
        observaciones: observaciones.trim() || undefined,
      };
      const result = await estudiosService.cambiarEstadoSolicitud(solicitud.id, payload, token);
      if (onEstadoCambiado) {
        onEstadoCambiado(result);
      }
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !solicitud) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🔄 Cambiar Estado de Solicitud (${solicitud.id})`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <Alert
            title={error.title}
            detail={error.detail}
            status={error.status}
            invalidParams={error.invalidParams}
            onClose={() => setError(null)}
          />
        )}

        <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', fontSize: '13px' }}>
          <div><strong>Estudio:</strong> {solicitud.nombreEstudio} ({solicitud.codigoEstudio})</div>
          <div><strong>Estado Actual:</strong> <span style={{ fontWeight: 600 }}>{solicitud.estado}</span></div>
          <div><strong>Motivo:</strong> {solicitud.motivo}</div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Nuevo Estado Clínico:
          </label>
          <select
            value={nuevoEstado}
            onChange={(e) => setNuevoEstado(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          >
            <option value="SOLICITADO">SOLICITADO (Pendiente de toma/muestra)</option>
            <option value="EN_PROCESO">EN_PROCESO (En procesamiento o laboratorio)</option>
            <option value="COMPLETADO">COMPLETADO (Finalizado formalmente)</option>
            <option value="CANCELADO">CANCELADO (Anulado con justificación)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Justificación / Observaciones del Cambio:
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Motivo del cambio de estado o justificación de cancelación..."
            rows={3}
            disabled={submitting}
            required={nuevoEstado === 'CANCELADO'}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <Button variant="secondary" onClick={onClose} type="button" disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            Confirmar Cambio de Estado
          </Button>
        </div>
      </form>
    </Modal>
  );
}
