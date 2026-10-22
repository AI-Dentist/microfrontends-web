import { useState } from 'react';
import { historiasClinicasService } from '../../api/historias-clinicas.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';
import { Card } from '../common/Card.jsx';
import { Input } from '../common/Input.jsx';
import { Button } from '../common/Button.jsx';
import { Badge } from '../common/Badge.jsx';
import { Alert } from '../common/Alert.jsx';
import { Modal } from '../common/Modal.jsx';

const SEVERIDADES = [
  { value: 'LEVE', label: 'LEVE (Reacción menor, erupción localizada)' },
  { value: 'MODERADA', label: 'MODERADA (Urticaria generalizada, angioedema leve)' },
  { value: 'GRAVE', label: 'GRAVE (Anafilaxia, shock, compromiso respiratorio)' },
];

export function AlergiasManager({ historia, onAlergiasActualizadas, onRecargarExpediente }) {
  const { token } = useDevAuth();

  // Estado del formulario de agregar alergia
  const [nuevaSustancia, setNuevaSustancia] = useState('');
  const [nuevoTipoReaccion, setNuevoTipoReaccion] = useState('');
  const [nuevaSeveridad, setNuevaSeveridad] = useState('LEVE');
  const [nuevasNotas, setNuevasNotas] = useState('');
  const [descripcionAuditoria, setDescripcionAuditoria] = useState('');

  // Estados de operación y modal
  const [submitting, setSubmitting] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState(null);
  const [alergiaAEliminar, setAlergiaAEliminar] = useState(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [eliminando, setEliminando] = useState(false);

  if (!historia) return null;

  const isEditable = historia.estado === 'ACTIVA';
  const alergias = historia.alergias || [];
  const tieneAlergiaGrave = alergias.some((a) => a.severidad === 'GRAVE');

  // Agregar Alergia
  const handleAgregarAlergia = async (e) => {
    e.preventDefault();
    setErrorOperacion(null);

    const sustanciaLimpia = nuevaSustancia.trim();
    const reaccionLimpia = nuevoTipoReaccion.trim();

    if (!sustanciaLimpia) {
      setErrorOperacion({
        title: 'Campo Requerido',
        detail: 'Debe especificar el nombre de la sustancia alérgena.',
      });
      return;
    }

    if (!reaccionLimpia) {
      setErrorOperacion({
        title: 'Campo Requerido',
        detail: 'Debe especificar la manifestación clínica o tipo de reacción observada.',
      });
      return;
    }

    // Validación preliminar en React para evitar duplicado evidente
    const yaExiste = alergias.some(
      (a) => a.sustancia.toLowerCase() === sustanciaLimpia.toLowerCase(),
    );
    if (yaExiste) {
      setErrorOperacion({
        status: 422,
        title: 'Alergia Duplicada',
        detail: `Ya existe una alergia registrada para la sustancia '${sustanciaLimpia}' en este expediente clínico.`,
      });
      return;
    }

    const payload = {
      versionEsperada: historia.version,
      sustancia: sustanciaLimpia,
      tipoReaccion: reaccionLimpia,
      severidad: nuevaSeveridad,
      notasAdicionales: nuevasNotas.trim() || null,
      descripcion: descripcionAuditoria.trim() || null,
    };

    setSubmitting(true);
    try {
      const historiaActualizada = await historiasClinicasService.agregarAlergia(
        historia.id,
        payload,
        token,
      );
      // Limpiar formulario tras éxito
      setNuevaSustancia('');
      setNuevoTipoReaccion('');
      setNuevaSeveridad('LEVE');
      setNuevasNotas('');
      setDescripcionAuditoria('');
      if (onAlergiasActualizadas) {
        onAlergiasActualizadas(historiaActualizada);
      }
    } catch (err) {
      setErrorOperacion(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir confirmación de eliminación
  const handleSolicitarEliminar = (alergia) => {
    setAlergiaAEliminar(alergia);
    setMotivoEliminacion('');
    setErrorOperacion(null);
  };

  // Confirmar eliminación
  const handleConfirmarEliminar = async () => {
    if (!alergiaAEliminar) return;

    setEliminando(true);
    setErrorOperacion(null);

    const payload = {
      versionEsperada: historia.version,
      descripcion: motivoEliminacion.trim() || null,
    };

    try {
      const historiaActualizada = await historiasClinicasService.eliminarAlergia(
        historia.id,
        alergiaAEliminar.sustancia,
        payload,
        token,
      );
      setAlergiaAEliminar(null);
      if (onAlergiasActualizadas) {
        onAlergiasActualizadas(historiaActualizada);
      }
    } catch (err) {
      setErrorOperacion(err);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Alerta de no editable si el expediente no está activo */}
      {!isEditable && (
        <div
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--warning)',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          🔒 Expediente en estado <strong>{historia.estado}</strong>: Modo de solo lectura clínica.
          No se permite agregar ni eliminar alergias a menos que el expediente sea reactivado a estado ACTIVA.
        </div>
      )}

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

      {/* Alerta de alergia grave si existe */}
      {tieneAlergiaGrave && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: 'var(--danger)',
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>
            ATENCIÓN CLÍNICA CRÍTICA: El paciente tiene registrada al menos una alergia de severidad
            GRAVE. Verifique cuidadosamente las sustancias contraindicadas antes de cualquier procedimiento
            odontológico o farmacoterapia.
          </span>
        </div>
      )}

      {/* Listado de Alergias Actuales */}
      <Card title={`Alergias Registradas en el Expediente (${alergias.length})`}>
        {alergias.length === 0 ? (
          <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
            No hay alergias registradas en este expediente clínico.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="clinic-table">
              <thead>
                <tr>
                  <th>Sustancia</th>
                  <th>Tipo de Reacción</th>
                  <th>Severidad</th>
                  <th>Notas Adicionales</th>
                  <th>Registrada En</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {alergias.map((alergia, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{alergia.sustancia}</td>
                    <td>{alergia.tipoReaccion}</td>
                    <td>
                      <Badge variant={alergia.severidad}>{alergia.severidad}</Badge>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {alergia.notasAdicionales || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {alergia.registradaEn
                        ? new Date(alergia.registradaEn).toLocaleDateString()
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        variant="danger"
                        disabled={!isEditable || submitting || eliminando}
                        onClick={() => handleSolicitarEliminar(alergia)}
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                      >
                        🗑️ Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Formulario para Agregar Alergia */}
      <Card title="Registrar Nueva Alergia">
        <form onSubmit={handleAgregarAlergia} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <Input
              label="Sustancia Alérgena *"
              value={nuevaSustancia}
              onChange={(e) => setNuevaSustancia(e.target.value)}
              placeholder="Ej. Penicilina, Látex, AINEs"
              disabled={!isEditable || submitting}
              required
            />

            <Input
              label="Tipo de Reacción Clínica *"
              value={nuevoTipoReaccion}
              onChange={(e) => setNuevoTipoReaccion(e.target.value)}
              placeholder="Ej. Urticaria, Shock anafiláctico"
              disabled={!isEditable || submitting}
              required
            />

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                Severidad Clínica *
              </label>
              <select
                value={nuevaSeveridad}
                onChange={(e) => setNuevaSeveridad(e.target.value)}
                disabled={!isEditable || submitting}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                {SEVERIDADES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Notas Adicionales (Opcional)"
            value={nuevasNotas}
            onChange={(e) => setNuevasNotas(e.target.value)}
            placeholder="Ej. Diagnosticado en la infancia. Evitar derivados betalactámicos."
            disabled={!isEditable || submitting}
          />

          <Input
            label="Justificación de Auditoría Clínica (Opcional)"
            value={descripcionAuditoria}
            onChange={(e) => setDescripcionAuditoria(e.target.value)}
            placeholder="Ej. Reportado por el paciente durante la anamnesis periódica."
            disabled={!isEditable || submitting}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Button
              type="submit"
              loading={submitting}
              disabled={!isEditable || submitting || !nuevaSustancia.trim() || !nuevoTipoReaccion.trim()}
            >
              ➕ Registrar Alergia en Expediente (v{historia.version})
            </Button>
          </div>
        </form>
      </Card>

      {/* Modal de confirmación para eliminar alergia */}
      <Modal
        isOpen={Boolean(alergiaAEliminar)}
        title="Confirmar Eliminación de Alergia"
        onClose={() => setAlergiaAEliminar(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
            ¿Confirma que desea eliminar la alergia a{' '}
            <strong style={{ color: 'var(--danger)' }}>{alergiaAEliminar?.sustancia}</strong>{' '}
            del expediente clínico?
          </p>

          <div
            style={{
              padding: '10px 14px',
              background: 'var(--neutral-50)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              borderLeft: '4px solid var(--warning)',
            }}
          >
            <strong>Reacción actual:</strong> {alergiaAEliminar?.tipoReaccion} |{' '}
            <strong>Severidad:</strong> {alergiaAEliminar?.severidad}
          </div>

          <Input
            label="Motivo o Justificación de la Eliminación (Auditoría)"
            value={motivoEliminacion}
            onChange={(e) => setMotivoEliminacion(e.target.value)}
            placeholder="Ej. Prueba cutánea posterior descartó hipersensibilidad a la sustancia."
            disabled={eliminando}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <Button
              variant="secondary"
              onClick={() => setAlergiaAEliminar(null)}
              disabled={eliminando}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={eliminando}
              onClick={handleConfirmarEliminar}
            >
              Confirmar Eliminación
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
