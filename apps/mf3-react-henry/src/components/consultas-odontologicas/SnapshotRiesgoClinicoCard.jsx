import { Card } from '../common/Card.jsx';
import { Badge } from '../common/Badge.jsx';

/**
 * Tarjeta de alerta clínica prominente que visualiza el Snapshot de Riesgo Clínico
 * inmutable capturado en el momento de la apertura de la consulta.
 *
 * @param {object} props
 * @param {object} props.snapshot - SnapshotRiesgoClinicoDto
 */
export function SnapshotRiesgoClinicoCard({ snapshot }) {
  if (!snapshot) {
    return (
      <Card title="🛡️ Snapshot de Riesgo Clínico">
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
          No se dispone de snapshot de riesgo clínico congelado para esta consulta.
        </p>
      </Card>
    );
  }

  const {
    alergiasCriticas = [],
    condicionesMedicas = [],
    medicacionHabitual = [],
    capturadoEn,
  } = snapshot;

  const tieneRiesgo =
    alergiasCriticas.length > 0 ||
    condicionesMedicas.length > 0 ||
    medicacionHabitual.length > 0;

  return (
    <Card
      title="🛡️ Snapshot de Riesgo Clínico Inmutable"
      style={{
        border: tieneRiesgo ? '2px solid var(--warning)' : '1px solid var(--border-color)',
        backgroundColor: tieneRiesgo ? 'rgba(254, 243, 199, 0.15)' : 'var(--bg-surface)',
      }}
    >
      <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span>📅 Congelado al momento de apertura: </span>
        <strong>{capturadoEn ? new Date(capturadoEn).toLocaleString() : 'No registrado'}</strong>
        <span style={{ marginLeft: '12px' }}>
          <em>(Fotografía clínica inmutable del expediente para seguridad del paciente)</em>
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
        }}
      >
        {/* 1. Alergias Críticas */}
        <div
          style={{
            padding: '12px',
            background: alergiasCriticas.length > 0 ? 'var(--danger-bg)' : 'var(--neutral-50)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${alergiasCriticas.length > 0 ? 'var(--danger-border)' : 'var(--border-color)'}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', color: 'var(--danger)' }}>
            ⚠️ Alergias Críticas ({alergiasCriticas.length})
          </div>
          {alergiasCriticas.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Sin alergias críticas registradas al abrir la consulta.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
              {alergiasCriticas.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  <strong>{item.sustancia}</strong>{' '}
                  <Badge variant="danger" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {item.severidad || 'GRAVE'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 2. Condiciones Médicas Preexistentes */}
        <div
          style={{
            padding: '12px',
            background: condicionesMedicas.length > 0 ? 'var(--warning-bg)' : 'var(--neutral-50)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${condicionesMedicas.length > 0 ? 'var(--warning-border)' : 'var(--border-color)'}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', color: 'var(--warning)' }}>
            🩺 Condiciones Médicas ({condicionesMedicas.length})
          </div>
          {condicionesMedicas.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Sin antecedentes médicos crónicos reportados.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
              {condicionesMedicas.map((cond, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  {cond}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Medicación Habitual */}
        <div
          style={{
            padding: '12px',
            background: medicacionHabitual.length > 0 ? 'var(--primary-light)' : 'var(--neutral-50)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${medicacionHabitual.length > 0 ? 'var(--primary)' : 'var(--border-color)'}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', color: 'var(--primary-dark)' }}>
            💊 Medicación Habitual ({medicacionHabitual.length})
          </div>
          {medicacionHabitual.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Sin medicación habitual activa al momento de apertura.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
              {medicacionHabitual.map((med, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  {med}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
