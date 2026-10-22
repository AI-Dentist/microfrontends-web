export function MedicamentosList({ medicamentos = [] }) {
  if (!medicamentos || medicamentos.length === 0) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
        El paciente no refiere medicamentos de consumo habitual en la actualidad.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="clinic-table">
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Principio Activo</th>
            <th>Dosis y Frecuencia</th>
            <th>Motivo de Uso</th>
            <th>Desde</th>
          </tr>
        </thead>
        <tbody>
          {medicamentos.map((med, idx) => (
            <tr key={idx}>
              <td style={{ fontWeight: 600 }}>{med.nombre}</td>
              <td style={{ color: 'var(--text-secondary)' }}>
                {med.principioActivo || '—'}
              </td>
              <td>
                <span
                  style={{
                    background: 'var(--neutral-100)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                  }}
                >
                  {med.dosis}
                </span>
              </td>
              <td>{med.motivoUso || '—'}</td>
              <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {med.prescritoDesde
                  ? new Date(med.prescritoDesde).toLocaleDateString()
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
