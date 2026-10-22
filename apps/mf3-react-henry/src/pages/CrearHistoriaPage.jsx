import { useState } from 'react';
import { historiasClinicasService } from '../api/historias-clinicas.service.js';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { AntecedentesForm } from '../components/historia-clinica/AntecedentesForm.jsx';
import { HistoriaClinicaDetail } from '../components/historia-clinica/HistoriaClinicaDetail.jsx';
import { validateAntecedentes, serializeAntecedentes } from '../components/historia-clinica/antecedentes-utils.js';

export function CrearHistoriaPage({ onVerHistoria }) {
  const { token, currentIdentity } = useDevAuth();

  const [pacienteId, setPacienteId] = useState('');
  const [odontologoResponsableId, setOdontologoResponsableId] = useState('od_dev_henry');
  const [observacionesGenerales, setObservacionesGenerales] = useState('Apertura de expediente clínico en consulta inicial.');
  const [antecedentes, setAntecedentes] = useState({
    antecedentesOdontologicos: {
      tratamientoPrevio: { estado: 'NO_EVALUADO', detalle: '' },
      protesisActual: { estado: 'NEGADO', detalle: '' },
      sangradoGingival: { estado: 'NO_EVALUADO', detalle: '' },
      bruxismo: { estado: 'NO_EVALUADO', detalle: '' },
    },
    enfermedadesCronicas: [],
    antecedentesMedicos: [],
    antecedentesFamiliares: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [createdHistoria, setCreatedHistoria] = useState(null);

  const handleQuickSynthetic = () => {
    const idAleatorio = `pac_dev_${Date.now().toString(36)}`;
    setPacienteId(idAleatorio);
    setError(null);
    setValidationErrors([]);
  };

  const handleTestInexistente = () => {
    setPacienteId('pac_no_existe');
    setError(null);
    setValidationErrors([]);
  };

  const handleTestDuplicado = () => {
    // ID que ya existe en clinica-dentalDB
    setPacienteId('pac_e2e_05f25861');
    setError(null);
    setValidationErrors([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setValidationErrors([]);

    if (!pacienteId || !pacienteId.trim()) {
      setValidationErrors(['El identificador del paciente (pacienteId) es obligatorio.']);
      return;
    }

    // Validación de reglas clínicas
    const antecedentesErrors = validateAntecedentes(antecedentes);
    if (antecedentesErrors.length > 0) {
      setValidationErrors(antecedentesErrors);
      return;
    }

    setLoading(true);

    const payload = {
      pacienteId: pacienteId.trim(),
      odontologoResponsableId: odontologoResponsableId?.trim() || undefined,
      observacionesGenerales: observacionesGenerales?.trim() || undefined,
      antecedentes: serializeAntecedentes(antecedentes),
    };

    try {
      const response = await historiasClinicasService.create(payload, token);
      setCreatedHistoria(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetForm = () => {
    setPacienteId('');
    setCreatedHistoria(null);
    setError(null);
    setValidationErrors([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {createdHistoria ? (
        <div>
          <div
            style={{
              background: 'var(--success-bg)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 24px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px', color: 'var(--success)', fontSize: '18px', fontWeight: 700 }}>
                ✓ Expediente Clínico Creado Exitosamente
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                Se asignó el identificador canónico <code>{createdHistoria.id}</code> al paciente <code>{createdHistoria.pacienteId}</code>.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {onVerHistoria && (
                <Button
                  onClick={() => onVerHistoria(createdHistoria.id)}
                  variant="primary"
                >
                  Ver en Pantalla de Consulta
                </Button>
              )}
              <Button onClick={handleResetForm} variant="secondary">
                Aperturar Otro Expediente
              </Button>
            </div>
          </div>

          <HistoriaClinicaDetail historia={createdHistoria} />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card title="Apertura de Nuevo Expediente Clínico Odontológico">
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Complete los datos del paciente y el bloque de antecedentes iniciales para aperturar el expediente clínico.
              <br />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Operador autenticado actual: <strong>{currentIdentity?.nombre || 'Dr. Henry'}</strong>
              </span>
            </p>

            {/* Chips de prueba rápida */}
            <div className="quick-chips-container" style={{ marginBottom: '16px' }}>
              <span>Casos de prueba de desarrollo:</span>
              <button type="button" className="quick-chip" onClick={handleQuickSynthetic}>
                ⚡ Generar Paciente Sintético Único
              </button>
              <button type="button" className="quick-chip" onClick={handleTestDuplicado}>
                ⚠️ Probar Paciente Duplicado (409)
              </button>
              <button type="button" className="quick-chip" onClick={handleTestInexistente}>
                ⚠️ Probar Paciente Inexistente en MS1 (422)
              </button>
            </div>

            {/* Errores de validación cliente */}
            {validationErrors.length > 0 && (
              <Alert
                title="Inconsistencias en el Formulario"
                detail="Por favor subsane los siguientes requerimientos clínicos antes de guardar:"
                type="warning"
                invalidParams={validationErrors.map((msg, i) => ({ name: `Regla ${i + 1}`, reason: msg }))}
                onClose={() => setValidationErrors([])}
              />
            )}

            {/* Error RFC 7807 del servidor */}
            {error && (
              <Alert
                title={error.title}
                detail={error.detail}
                status={error.status}
                invalidParams={error.invalidParams}
                onClose={() => setError(null)}
              />
            )}

            {/* Campos principales */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              <Input
                label="Identificador del Paciente en MS1 *"
                id="pacienteId"
                value={pacienteId}
                disabled={loading}
                onChange={(e) => setPacienteId(e.target.value)}
                placeholder="ej. a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
              />

              <Input
                label="Odontólogo Responsable Clínico"
                id="odontologoResponsableId"
                value={odontologoResponsableId}
                disabled={loading}
                onChange={(e) => setOdontologoResponsableId(e.target.value)}
                placeholder="ej. od_dev_henry"
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                htmlFor="observacionesGenerales"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}
              >
                Observaciones Generales de Apertura (opcional)
              </label>
              <textarea
                id="observacionesGenerales"
                rows={3}
                value={observacionesGenerales}
                disabled={loading}
                onChange={(e) => setObservacionesGenerales(e.target.value)}
                placeholder="Notas adicionales sobre la anamnesis o motivo de consulta..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px' }}>
                Antecedentes Personales, Médicos y Odontológicos Iniciales
              </h3>
              <AntecedentesForm
                value={antecedentes}
                onChange={setAntecedentes}
                disabled={loading}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <Button type="submit" loading={loading}>
                Guardar y Aperturar Historia Clínica
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
