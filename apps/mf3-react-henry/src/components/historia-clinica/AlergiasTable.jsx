import { Badge } from '../common/Badge.jsx';

export function AlergiasTable({ alergias = [] }) {
  if (!alergias || alergias.length === 0) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
        No hay alergias registradas en este expediente clínico.
      </div>
    );
  }

  const tieneAlergiasGraves = alergias.some((a) => a.severidad === 'GRAVE');

  return (
    <div>
      {tieneAlergiasGraves && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--danger)',
            fontWeight: 600,
          }}
        >
          <span>⚠️</span>
          <span>
            ATENCIÓN CLÍNICA: El paciente tiene registrada al menos una alergia de severidad GRAVE. Verificar antes de prescribir o aplicar anestésicos o fármacos.
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="clinic-table">
          <thead>
            <tr>
              <th>Sustancia</th>
              <th>Tipo de Reacción</th>
              <th>Severidad</th>
              <th>Notas Adicionales</th>
              <th>Fecha Registro</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
