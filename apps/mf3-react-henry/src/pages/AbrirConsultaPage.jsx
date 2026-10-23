import { useState } from 'react';
import { useDevAuth } from '../hooks/useDevAuth.js';
import { useConsultasOdontologicas } from '../hooks/useConsultasOdontologicas.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';

export function AbrirConsultaPage({
  initialHistoriaId = '',
  initialPacienteId = '',
  onConsultaCreada,
  onCancelar,
}) {
  const { operadorId } = useDevAuth();
  const { loading, error, abrirConsulta, resetError } = useConsultasOdontologicas();

  const [historiaClinicaId, setHistoriaClinicaId] = useState(initialHistoriaId);
  const [pacienteId, setPacienteId] = useState(initialPacienteId);
  const [tieneCita, setTieneCita] = useState(false);
  const [citaId, setCitaId] = useState('');
  const [fechaAtencion, setFechaAtencion] = useState(() => {
    const now = new Date();
    // Formato local YYYY-MM-DDTHH:mm para input datetime-local
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [motivoConsulta, setMotivoConsulta] = useState('');

  // Sección opcional de anamnesis inicial en apertura
  const [incluirAnamnesis, setIncluirAnamnesis] = useState(false);
  const [anamnesisDescripcion, setAnamnesisDescripcion] = useState('');
  const [tiempoEvolucion, setTiempoEvolucion] = useState('');
  const [escalaDolorEVA, setEscalaDolorEVA] = useState('0');

  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!historiaClinicaId.trim()) {
      setValidationError('El ID de la historia clínica es obligatorio.');
      return;
    }
    if (!pacienteId.trim()) {
      setValidationError('El ID del paciente es obligatorio.');
      return;
    }
    if (!motivoConsulta.trim()) {
      setValidationError('El motivo principal de consulta es obligatorio.');
      return;
    }
    if (tieneCita && !citaId.trim()) {
      setValidationError('Debe ingresar el identificador de la cita o marcar como atención de urgencia.');
      return;
    }

    const payload = {
      historiaClinicaId: historiaClinicaId.trim(),
      pacienteId: pacienteId.trim(),
      motivoConsulta: motivoConsulta.trim(),
      citaId: tieneCita && citaId.trim() ? citaId.trim() : null,
      fechaAtencion: fechaAtencion ? new Date(fechaAtencion).toISOString() : new Date().toISOString(),
    };

    if (incluirAnamnesis && anamnesisDescripcion.trim()) {
      payload.anamnesisActual = {
        descripcion: anamnesisDescripcion.trim(),
        tiempoEvolucion: tiempoEvolucion.trim() || null,
        escalaDolorEVA: escalaDolorEVA !== '' ? Number(escalaDolorEVA) : null,
      };
    }

    const resultado = await abrirConsulta(payload);
    if (resultado && resultado.id) {
      if (onConsultaCreada) {
        onConsultaCreada(resultado.id, resultado.historiaClinicaId);
      }
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Card title="Apertura de Consulta Odontológica (Sillón Dental)">
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: 0, marginBottom: '20px' }}>
          Inicia un nuevo encuentro clínico en estado <strong>EN_CURSO</strong>. En este momento se congelará
          un snapshot de riesgo inmutable (alergias críticas y patologías de base) a partir del expediente del paciente.
        </p>

        {validationError && (
          <div style={{ marginBottom: '16px' }}>
            <Alert
              title="Datos incompletos"
              detail={validationError}
              status={400}
              onClose={() => setValidationError('')}
            />
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '16px' }}>
            <Alert
              title={error.title}
              detail={error.detail}
              status={error.status}
              invalidParams={error.invalidParams}
              onClose={resetError}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Identificación del Expediente y Paciente */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label htmlFor="hcIdInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Historia Clínica (ID canónico) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <Input
                id="hcIdInput"
                value={historiaClinicaId}
                onChange={(e) => setHistoriaClinicaId(e.target.value)}
                placeholder="ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label htmlFor="pacIdInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Identificador del Paciente (MS1) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <Input
                id="pacIdInput"
                value={pacienteId}
                onChange={(e) => setPacienteId(e.target.value)}
                placeholder="ej. pac_e2e_05f25861"
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Profesional y Fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label htmlFor="fechaInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Fecha y Hora de la Atención
              </label>
              <Input
                id="fechaInput"
                type="datetime-local"
                value={fechaAtencion}
                onChange={(e) => setFechaAtencion(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                Odontólogo Responsable (Derivado de Sesión)
              </label>
              <div
                style={{
                  padding: '9px 12px',
                  background: 'var(--neutral-100)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                👨‍⚕️ <code>{operadorId || 'od_henry_principal'}</code>
              </div>
            </div>
          </div>

          {/* Asociación con Cita previa o Urgencia */}
          <div
            style={{
              padding: '14px',
              background: 'var(--neutral-50)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                id="tieneCitaCheck"
                checked={tieneCita}
                onChange={(e) => setTieneCita(e.target.checked)}
                disabled={loading}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="tieneCitaCheck" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                Atención programada con Cita previa de MS3
              </label>
            </div>

            {tieneCita ? (
              <div style={{ marginTop: '8px' }}>
                <label htmlFor="citaIdInput" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Identificador canónico de la cita programada:
                </label>
                <Input
                  id="citaIdInput"
                  value={citaId}
                  onChange={(e) => setCitaId(e.target.value)}
                  placeholder="ej. cita_dev_001 o cita_fdi_002"
                  disabled={loading}
                />
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ⚡ <em>Se registrará como consulta no agendada / urgencia dental (sin vinculación a cita previa).</em>
              </div>
            )}
          </div>

          {/* Motivo de la Consulta (Obligatorio) */}
          <div>
            <label htmlFor="motivoInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
              Motivo Principal de Consulta <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              id="motivoInput"
              value={motivoConsulta}
              onChange={(e) => setMotivoConsulta(e.target.value)}
              placeholder="Describa el motivo expresado por el paciente (ej. Dolor punzante en primer molar inferior izquierdo al masticar)"
              disabled={loading}
              required
            />
          </div>

          {/* Anamnesis actual inicial opcional */}
          <div
            style={{
              padding: '14px',
              background: 'var(--neutral-50)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                id="incluirAnamnesisCheck"
                checked={incluirAnamnesis}
                onChange={(e) => setIncluirAnamnesis(e.target.checked)}
                disabled={loading}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="incluirAnamnesisCheck" style={{ fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                Registrar datos de Anamnesis Inicial en este momento (Opcional, puede completarse después en 6F-2)
              </label>
            </div>

            {incluirAnamnesis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <div>
                  <label htmlFor="anamnesisDesc" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Descripción del cuadro actual:
                  </label>
                  <textarea
                    id="anamnesisDesc"
                    value={anamnesisDescripcion}
                    onChange={(e) => setAnamnesisDescripcion(e.target.value)}
                    placeholder="Detalle clínico del dolor o síntoma referido..."
                    rows={2}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div>
                    <label htmlFor="tiempoEvol" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Tiempo de evolución:
                    </label>
                    <Input
                      id="tiempoEvol"
                      value={tiempoEvolucion}
                      onChange={(e) => setTiempoEvolucion(e.target.value)}
                      placeholder="ej. 48 horas, 3 días"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="escalaEva" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Escala de Dolor (EVA 0 a 10):
                    </label>
                    <select
                      id="escalaEva"
                      value={escalaDolorEVA}
                      onChange={(e) => setEscalaDolorEVA(e.target.value)}
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        fontSize: '13px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="0">0 - Sin dolor</option>
                      <option value="1">1 - Dolor muy leve</option>
                      <option value="2">2 - Dolor leve</option>
                      <option value="3">3 - Dolor moderado leve</option>
                      <option value="4">4 - Dolor moderado</option>
                      <option value="5">5 - Dolor moderado notable</option>
                      <option value="6">6 - Dolor intenso</option>
                      <option value="7">7 - Dolor muy intenso</option>
                      <option value="8">8 - Dolor severo</option>
                      <option value="9">9 - Dolor casi insoportable</option>
                      <option value="10">10 - Dolor máximo insoportable</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            {onCancelar && (
              <Button type="button" variant="secondary" onClick={onCancelar} disabled={loading}>
                Cancelar
              </Button>
            )}

            <Button type="submit" variant="primary" loading={loading} disabled={loading}>
              🚀 Abrir Consulta en Sillón
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
