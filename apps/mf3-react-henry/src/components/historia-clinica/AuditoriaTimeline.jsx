export function AuditoriaTimeline({ historial = [] }) {
  if (!historial || historial.length === 0) {
    return (
      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
        No hay registros de auditoría disponibles.
      </div>
    );
  }

  // Ordenar de más reciente a más antiguo
  const cronologico = [...historial].reverse();

  return (
    <ul className="timeline-list">
      {cronologico.map((entry, idx) => (
        <li key={idx} className="timeline-item">
          <div className="timeline-point" />
          <div className="timeline-content">
            <div className="timeline-header">
              <span className="timeline-title">
                {entry.accion?.replace(/_/g, ' ') || 'MODIFICACIÓN'}
              </span>
              <span className="timeline-date">
                {entry.fechaHora
                  ? new Date(entry.fechaHora).toLocaleString()
                  : 'Fecha no registrada'}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>Profesional interviniente:</strong> {entry.odontologoId}
            </div>

            {entry.descripcion && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  marginTop: '6px',
                  fontStyle: 'italic',
                }}
              >
                "{entry.descripcion}"
              </div>
            )}

            {entry.camposModificados && entry.camposModificados.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Campos afectados: </span>
                {entry.camposModificados.map((campo, cIdx) => (
                  <code
                    key={cIdx}
                    style={{
                      fontSize: '11px',
                      marginRight: '4px',
                      background: 'var(--neutral-100)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {campo}
                  </code>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
