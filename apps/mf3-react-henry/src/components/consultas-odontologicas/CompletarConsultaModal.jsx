import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Alert } from '../common/Alert.jsx';
import { Badge } from '../common/Badge.jsx';
import { Spinner } from '../common/Spinner.jsx';

/**
 * Modal accesible para la confirmación y sellado formal de una Consulta Odontológica (Iteración 6F-3).
 *
 * Valida los requisitos clínicos del dominio antes del envío:
 * - INV-CONS-04: Consulta en estado EN_CURSO.
 * - INV-CONS-05: Motivo de consulta >= 5 caracteres.
 * - INV-CONS-05: Al menos 1 diagnóstico clínico registrado.
 * - INV-CONS-06: Exploración física con inspección intraoral documentada (>= 5 caracteres).
 * - INV-CONS-09: Control de concurrencia optimista con versionEsperada.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.consulta - ConsultaOdontologicaResponseDto
 * @param {Function} props.onClose
 * @param {Function} props.onConfirmar - ({ versionEsperada }) => Promise<any>
 * @param {Function} props.onRecargar - Callback para recargar datos frescos ante 409
 * @param {Function} [props.onIrAEditar] - Callback para abrir la pantalla de atención si faltan requisitos
 */
export function CompletarConsultaModal({
  isOpen,
  consulta,
  onClose,
  onConfirmar,
  onRecargar,
  onIrAEditar,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (!isOpen || !consulta) return null;

  const {
    id,
    version,
    estado,
    pacienteId,
    historiaClinicaId,
    motivoConsulta,
    exploracionFisica,
    diagnosticos = [],
    procedimientosRealizados = [],
  } = consulta;

  // Verificación de requisitos clínicos para el cierre (INV-CONS-04, 05, 06)
  const tieneMotivoValido = Boolean(motivoConsulta && motivoConsulta.trim().length >= 5);
  const tieneInspeccionIntraoral = Boolean(
    exploracionFisica?.inspeccionIntraoral &&
    exploracionFisica.inspeccionIntraoral.trim().length >= 5
  );
  const tieneDiagnosticos = Boolean(diagnosticos && diagnosticos.length >= 1);
  const estaEnCurso = estado === 'EN_CURSO';

  const requisitosFaltantes = [];
  if (!estaEnCurso) {
    requisitosFaltantes.push(`La consulta no está en curso (estado actual: ${estado}).`);
  }
  if (!tieneMotivoValido) {
    requisitosFaltantes.push('El motivo de consulta debe contar con al menos 5 caracteres.');
  }
  if (!tieneInspeccionIntraoral) {
    requisitosFaltantes.push('La exploración física debe incluir la inspección intraoral (mínimo 5 caracteres).');
  }
  if (!tieneDiagnosticos) {
    requisitosFaltantes.push('Debe registrarse al menos un diagnóstico clínico (presuntivo o definitivo).');
  }

  const puedeCompletar = requisitosFaltantes.length === 0;

  const handleConfirmar = async () => {
    if (!puedeCompletar || isSubmitting) return;

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const res = await onConfirmar({ versionEsperada: version });
      if (res) {
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
    <Modal isOpen={isOpen} title="Sellar y Completar Consulta Odontológica" onClose={isSubmitting ? undefined : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Encabezado y resumen de identidad */}
        <div
          style={{
            background: 'var(--neutral-50)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>Consulta: <code>{id}</code></strong>
            <Badge variant="neutral">Versión esperada: v{version}</Badge>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Paciente: <code>{pacienteId}</code> | Historia: <code>{historiaClinicaId}</code>
          </div>
        </div>

        {/* Resumen clínico previo al cierre */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            VERIFICACIÓN DE REQUISITOS CLÍNICOS PREVIOS AL CIERRE:
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>
              <span>Motivo de consulta: </span>
              {tieneMotivoValido ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Registrado ({motivoConsulta})</span>
              ) : (
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Incompleto o ausente</span>
              )}
            </li>
            <li>
              <span>Inspección intraoral: </span>
              {tieneInspeccionIntraoral ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Documentada ({exploracionFisica.inspeccionIntraoral})</span>
              ) : (
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Pendiente de documentar</span>
              )}
            </li>
            <li>
              <span>Diagnósticos registrados: </span>
              {tieneDiagnosticos ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ {diagnosticos.length} diagnóstico(s) registrado(s)
                </span>
              ) : (
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Sin diagnósticos</span>
              )}
            </li>
            <li>
              <span>Procedimientos en sillón: </span>
              <strong>{procedimientosRealizados.length} procedimiento(s)</strong>
            </li>
          </ul>
        </div>

        {/* Advertencia si faltan requisitos clínicos */}
        {!puedeCompletar && (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '13px',
            }}
          >
            <strong>No es posible sellar la consulta por requisitos clínicos pendientes:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {requisitosFaltantes.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
            {onIrAEditar && estaEnCurso && (
              <div style={{ marginTop: '10px' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    onIrAEditar(id);
                  }}
                  style={{ fontSize: '12px', padding: '4px 10px' }}
                >
                  ✏️ Ir a Atención en Sillón para registrar datos faltantes
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Advertencia de irreversibilidad */}
        {puedeCompletar && (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--warning)',
              fontSize: '13px',
              lineHeight: 1.45,
            }}
          >
            <strong>⚠️ Confirmación de Cierre Irreversible:</strong>
            <p style={{ margin: '4px 0 0' }}>
              Al confirmar, la consulta pasará de forma irrevocable al estado <strong>COMPLETADA</strong>.
              Los datos clínicos quedarán sellados para garantizar la integridad del expediente odontológico y no podrán ser modificados ni cancelados.
            </p>
          </div>
        )}

        {/* Error local / Problem Details */}
        {localError && (
          <div>
            <Alert
              title={localError.title || 'Error al completar la consulta'}
              detail={localError.detail || 'No se pudo sellar la consulta odontológica.'}
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
                <span>La consulta fue actualizada en otra sesión. Recargue los datos para revisar la versión vigente:</span>
                <Button variant="secondary" onClick={handleRecargarServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                  🔄 Recargar del Servidor
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Acciones del Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Volver
          </Button>

          <Button
            variant="primary"
            onClick={handleConfirmar}
            disabled={!puedeCompletar || isSubmitting}
            style={{
              background: puedeCompletar ? 'var(--success)' : undefined,
              borderColor: puedeCompletar ? 'var(--success-border)' : undefined,
            }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Spinner /> Sellando consulta...
              </span>
            ) : (
              '✓ Confirmar y Sellar Consulta'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
