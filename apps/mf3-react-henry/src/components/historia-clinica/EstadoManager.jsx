import { useState } from 'react';
import { historiasClinicasService } from '../../api/historias-clinicas.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { EstadoBadge } from './EstadoBadge.jsx';
import { Alert } from '../common/Alert.jsx';
import { Modal } from '../common/Modal.jsx';

// Reglas de la máquina de estados del backend NestJS
const TRANSICIONES_VALIDAS = {
  ACTIVA: [
    {
      destino: 'CERRADA',
      label: 'Cerrar Expediente',
      icono: '🔒',
      descripcion: 'Cierre de ciclo clínico. Deshabilita la edición pero permite reapertura futura.',
      variant: 'secondary',
    },
    {
      destino: 'ARCHIVADA',
      label: 'Archivar Expediente (Irreversible)',
      icono: '📁',
      descripcion: 'Cierre definitivo por egreso legal o custodia. Bloqueo total irreversible.',
      variant: 'danger',
    },
  ],
  CERRADA: [
    {
      destino: 'ACTIVA',
      label: 'Reactivar Expediente',
      icono: '🔓',
      descripcion: 'Reapertura del expediente clínico para reanudar tratamientos y ediciones.',
      variant: 'primary',
    },
    {
      destino: 'ARCHIVADA',
      label: 'Archivar Expediente (Irreversible)',
      icono: '📁',
      descripcion: 'Cierre definitivo por egreso legal o custodia. Bloqueo total irreversible.',
      variant: 'danger',
    },
  ],
  ARCHIVADA: [], // Sin transiciones permitidas (nodo terminal)
};

export function EstadoManager({ historia, onEstadoCambiado, onRecargarExpediente }) {
  const { token } = useDevAuth();

  const [transicionObjetivo, setTransicionObjetivo] = useState(null);
  const [motivoCambio, setMotivoCambio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState(null);
  const [mensajeExito, setMensajeExito] = useState('');

  if (!historia) return null;

  const estadoActual = String(historia.estado || '').toUpperCase();
  const transicionesDisponibles = TRANSICIONES_VALIDAS[estadoActual] || [];

  const handleIniciarTransicion = (transicion) => {
    setTransicionObjetivo(transicion);
    setMotivoCambio('');
    setErrorOperacion(null);
    setMensajeExito('');
  };

  const handleConfirmarTransicion = async () => {
    if (!transicionObjetivo) return;

    setSubmitting(true);
    setErrorOperacion(null);
    setMensajeExito('');

    const payload = {
      versionEsperada: historia.version,
      nuevoEstado: transicionObjetivo.destino,
      descripcion: motivoCambio.trim() || null,
    };

    try {
      const historiaActualizada = await historiasClinicasService.cambiarEstado(
        historia.id,
        payload,
        token,
      );
      setMensajeExito(
        `Estado del expediente cambiado exitosamente a '${historiaActualizada.estado}' (Versión: v${historiaActualizada.version}).`,
      );
      setTransicionObjetivo(null);
      if (onEstadoCambiado) {
        onEstadoCambiado(historiaActualizada);
      }
    } catch (err) {
      setErrorOperacion(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Manejo de errores */}
      {errorOperacion && (
        <div>
          <Alert
            title={errorOperacion.title}
            detail={errorOperacion.detail}
            status={errorOperacion.status}
            invalidParams={errorOperacion.invalidParams}
            onClose={() => setErrorOperacion(null)}
          />
          {errorOperacion.status === 409 && onRecargarExpediente && (
            <div style={{ marginTop: '10px' }}>
              <Button variant="secondary" onClick={onRecargarExpediente}>
                🔄 Recargar versión más reciente del expediente
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Mensaje de éxito */}
      {mensajeExito && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--success)',
            fontWeight: 600,
          }}
        >
          ✓ {mensajeExito}
        </div>
      )}

      {/* Tarjeta de Estado Actual */}
      <Card title="Estado Clínico del Expediente">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Estado Actual:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <EstadoBadge estado={historia.estado} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>
                {estadoActual === 'ACTIVA' && '🟢 Expediente Activo y Modificable'}
                {estadoActual === 'CERRADA' && '🟡 Expediente Cerrado (Reapertura permitida)'}
                {estadoActual === 'ARCHIVADA' && '🔴 Expediente Archivado (Permanente e Inmodificable)'}
              </span>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block' }}>
              Control de Concurrencia
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--primary-dark)',
                background: 'var(--primary-light)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              v{historia.version}
            </span>
          </div>
        </div>

        {/* Explicación de invariantes */}
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'var(--neutral-50)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          {estadoActual === 'ACTIVA' && (
            <p style={{ margin: 0 }}>
              El expediente se encuentra <strong>ACTIVO</strong>. Se permite el registro de antecedentes,
              alergias y esquemas de medicamentos. Puede solicitar el cierre del tratamiento o su archivo legal.
            </p>
          )}
          {estadoActual === 'CERRADA' && (
            <p style={{ margin: 0 }}>
              El expediente se encuentra <strong>CERRADO</strong> por culminación de tratamiento o alta médica.
              Las modificaciones clínicas están bloqueadas. Si el paciente regresa a consulta, puede{' '}
              <strong>reactivar</strong> el expediente a estado ACTIVA.
            </p>
          )}
          {estadoActual === 'ARCHIVADA' && (
            <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>
              El expediente se encuentra <strong>ARCHIVADO</strong> de manera definitiva. Conforme a las reglas
              del agregado HistoriaClinica (invariante INV-03), no se admite ninguna transición adicional ni
              modificación alguna.
            </p>
          )}
        </div>
      </Card>

      {/* Tarjeta de Transiciones Permitidas */}
      <Card title="Transiciones de Estado Disponibles">
        {transicionesDisponibles.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🚫</span>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
              No existen transiciones de estado permitidas desde el estado '{estadoActual}'.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
              El expediente se encuentra en su estado terminal definitivo.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {transicionesDisponibles.map((t) => (
              <div
                key={t.destino}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  background: 'var(--bg-surface)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{t.icono}</span>
                    <strong style={{ fontSize: '15px' }}>{t.label}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {t.descripcion}
                  </p>
                </div>

                <Button
                  variant={t.variant}
                  disabled={submitting}
                  onClick={() => handleIniciarTransicion(t)}
                  style={{ width: '100%' }}
                >
                  Solicitar cambio a {t.destino}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de confirmación para cambio de estado */}
      <Modal
        isOpen={Boolean(transicionObjetivo)}
        title={`Confirmar Transición a '${transicionObjetivo?.destino}'`}
        onClose={() => setTransicionObjetivo(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
            ¿Confirma que desea cambiar el estado del expediente clínico de{' '}
            <strong>{estadoActual}</strong> a{' '}
            <strong style={{ color: transicionObjetivo?.destino === 'ARCHIVADA' ? 'var(--danger)' : 'var(--primary)' }}>
              {transicionObjetivo?.destino}
            </strong>
            ?
          </p>

          {transicionObjetivo?.destino === 'ARCHIVADA' && (
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                color: 'var(--danger)',
                fontWeight: 600,
              }}
            >
              ⚠️ ACCIÓN IRREVERSIBLE: Una vez archivado, el expediente NO PODRÁ ser reactivado,
              editado ni eliminado. Asegúrese de que todos los tratamientos y auditorías estén concluidos.
            </div>
          )}

          {transicionObjetivo?.destino === 'CERRADA' && (
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                color: 'var(--warning)',
              }}
            >
              ℹ️ Al cerrar el expediente, se inhabilita la edición de antecedentes, alergias y medicamentos.
              Podrá ser reactivado en cualquier momento si el paciente reinicia tratamiento.
            </div>
          )}

          <Input
            label="Motivo o Justificación del Cambio de Estado (Auditoría)"
            value={motivoCambio}
            onChange={(e) => setMotivoCambio(e.target.value)}
            placeholder="Ej. Alta médica tras finalización de rehabilitación oral."
            disabled={submitting}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              variant="secondary"
              onClick={() => setTransicionObjetivo(null)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant={transicionObjetivo?.variant || 'primary'}
              loading={submitting}
              onClick={handleConfirmarTransicion}
            >
              Confirmar Cambio a {transicionObjetivo?.destino}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
