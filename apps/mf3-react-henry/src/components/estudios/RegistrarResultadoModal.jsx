/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Alert } from '../common/Alert.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { estudiosService } from '../../api/estudios.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';

export function RegistrarResultadoModal({
  isOpen,
  onClose,
  solicitud,
  onResultadoRegistrado,
}) {
  const { token } = useDevAuth();
  const [resumen, setResumen] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [laboratorioId, setLaboratorioId] = useState('');
  const [fechaResultado, setFechaResultado] = useState('');

  const [laboratorios, setLaboratorios] = useState([]);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setResumen('');
      setObservaciones('');
      setLaboratorioId('');
      // default ISO now (YYYY-MM-DDTHH:mm)
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setFechaResultado(now.toISOString().slice(0, 16));
      setError(null);

      let isMounted = true;
      const fetchLabs = async () => {
        setLoadingLabs(true);
        try {
          const data = await estudiosService.listarLaboratorios({ soloActivos: true }, token);
          if (isMounted) {
            setLaboratorios(Array.isArray(data) ? data : []);
          }
        } catch {
          // Si falla, el campo laboratorio es opcional de todos modos
        } finally {
          if (isMounted) {
            setLoadingLabs(false);
          }
        }
      };

      void fetchLabs();

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resumen.trim()) {
      setError({ title: 'Campo requerido', detail: 'El resumen clínico del resultado es obligatorio.' });
      return;
    }

    if (!solicitud?.id) {
      setError({ title: 'Error interno', detail: 'No se ha proporcionado la solicitud de estudio.' });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        resumen: resumen.trim(),
        observaciones: observaciones.trim() || undefined,
        laboratorioId: laboratorioId ? laboratorioId.trim() : undefined,
        fechaResultado: fechaResultado ? new Date(fechaResultado).toISOString() : undefined,
      };

      const result = await estudiosService.registrarResultado(solicitud.id, payload, token);
      if (onResultadoRegistrado) {
        onResultadoRegistrado(result);
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
      title={`📋 Registrar Resultado Clínico (${solicitud.id})`}
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
          <div><strong>Estudio:</strong> [{solicitud.categoria}] {solicitud.codigoEstudio} - {solicitud.nombreEstudio}</div>
          <div><strong>Motivo:</strong> {solicitud.motivo}</div>
          <div><strong>Consulta:</strong> {solicitud.consultaId}</div>
          <div><strong>Historia Clínica:</strong> {solicitud.historiaClinicaId}</div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Laboratorio o Centro de Diagnóstico (Opcional):
          </label>
          {loadingLabs ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
              <Spinner dark />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Cargando laboratorios...</span>
            </div>
          ) : (
            <select
              value={laboratorioId}
              onChange={(e) => setLaboratorioId(e.target.value)}
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
              <option value="">-- Sin laboratorio externo / Realizado en consultorio --</option>
              {laboratorios.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.nombre} {lab.contacto ? `(${lab.contacto})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Fecha y Hora de Emisión del Informe:
          </label>
          <Input
            type="datetime-local"
            value={fechaResultado}
            onChange={(e) => setFechaResultado(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Resumen Diagnóstico del Resultado:
          </label>
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            placeholder="Ej. Se observa inclusión ósea parcial en pieza 38 con raíz mesioangulada en íntima relación con el conducto dentario inferior. Sin reabsorción en pieza 37."
            rows={4}
            disabled={submitting}
            required
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

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Observaciones o Recomendaciones Clínicas:
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej. Se recomienda tomografía cone-beam prequirúrgica para valorar espesor cortical lingual."
            rows={2}
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
          <Button variant="primary" type="submit" loading={submitting}>
            Registrar y Completar Estudio
          </Button>
        </div>
      </form>
    </Modal>
  );
}
