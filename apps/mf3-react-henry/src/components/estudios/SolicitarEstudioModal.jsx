/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Alert } from '../common/Alert.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { estudiosService } from '../../api/estudios.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';

export function SolicitarEstudioModal({
  isOpen,
  onClose,
  initialConsultaId = '',
  onSolicitudCreada,
}) {
  const { token } = useDevAuth();
  const [consultaId, setConsultaId] = useState(initialConsultaId || '');
  const [tipoEstudioId, setTipoEstudioId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [prioridad, setPrioridad] = useState('RUTINA');
  const [indicaciones, setIndicaciones] = useState('');

  const [tiposEstudios, setTiposEstudios] = useState([]);
  const [loadingTipos, setLoadingTipos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialConsultaId) {
      setConsultaId(initialConsultaId);
    }
  }, [initialConsultaId]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchTipos = async () => {
      setLoadingTipos(true);
      setError(null);
      try {
        const data = await estudiosService.listarTiposEstudio({ soloActivos: true }, token);
        if (isMounted) {
          setTiposEstudios(Array.isArray(data) ? data : []);
          if (Array.isArray(data) && data.length > 0 && !tipoEstudioId) {
            setTipoEstudioId(data[0].id);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoadingTipos(false);
        }
      }
    };

    void fetchTipos();

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consultaId.trim()) {
      setError({ title: 'Campo requerido', detail: 'El ID de la consulta odontológica es obligatorio.' });
      return;
    }
    if (!tipoEstudioId) {
      setError({ title: 'Campo requerido', detail: 'Debe seleccionar un tipo de estudio activo.' });
      return;
    }
    if (!motivo.trim()) {
      setError({ title: 'Campo requerido', detail: 'El motivo clínico de la solicitud es obligatorio.' });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        consultaId: consultaId.trim(),
        tipoEstudioId,
        motivo: motivo.trim(),
        prioridad,
        indicaciones: indicaciones.trim() || undefined,
      };

      const result = await estudiosService.crearSolicitud(payload, token);
      if (onSolicitudCreada) {
        onSolicitudCreada(result);
      }
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔬 Solicitar Estudio Clínico / Imagenología"
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

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            ID de Consulta Odontológica (Debe estar EN_CURSO):
          </label>
          <Input
            value={consultaId}
            onChange={(e) => setConsultaId(e.target.value)}
            placeholder="ej. cons_12345678-1111-2222-3333-444455556666"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Tipo de Estudio Activo:
          </label>
          {loadingTipos ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
              <Spinner dark />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Cargando catálogo...</span>
            </div>
          ) : tiposEstudios.length === 0 ? (
            <div style={{ color: 'var(--color-danger, #ef4444)', fontSize: '13px' }}>
              No existen tipos de estudios activos. Registre uno primero en el catálogo.
            </div>
          ) : (
            <select
              value={tipoEstudioId}
              onChange={(e) => setTipoEstudioId(e.target.value)}
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
              {tiposEstudios.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.categoria === 'IMAGENOLOGIA' ? '🩻 IMAGEN' : '🔬 LAB'}] {t.codigo} - {t.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Prioridad Clínica:
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="radio"
                name="prioridad"
                value="RUTINA"
                checked={prioridad === 'RUTINA'}
                onChange={() => setPrioridad('RUTINA')}
              />
              Normal / Rutina
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="radio"
                name="prioridad"
                value="URGENTE"
                checked={prioridad === 'URGENTE'}
                onChange={() => setPrioridad('URGENTE')}
              />
              🚨 Urgente
            </label>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Motivo Clínico de la Solicitud:
          </label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Evaluación de tercer molar impactado en pieza 38, descarte de foco infeccioso"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Indicaciones Específicas / Observaciones (Opcional):
          </label>
          <textarea
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Ej. Enfoque periapical en cuadrante inferior izquierdo, corte milimétrico en zona radicular..."
            rows={3}
            disabled={submitting}
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
          <Button
            variant="primary"
            type="submit"
            loading={submitting}
            disabled={tiposEstudios.length === 0}
          >
            Emitir Solicitud
          </Button>
        </div>
      </form>
    </Modal>
  );
}
