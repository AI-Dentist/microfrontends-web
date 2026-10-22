export function Alert({
  title,
  detail,
  status,
  type = 'error',
  invalidParams = [],
  onClose,
  className = '',
}) {
  let severityClass = 'error';
  if (type === 'warning' || status === 409 || status === 422) {
    severityClass = 'warning';
  } else if (type === 'info') {
    severityClass = 'info';
  }

  return (
    <div className={`problem-alert ${severityClass} ${className}`} role="alert">
      <div style={{ flex: 1 }}>
        <h4 className="problem-alert-title">
          {title || 'Aviso del Sistema'}
          {status ? ` (HTTP ${status})` : ''}
        </h4>
        {detail && <p className="problem-alert-detail">{detail}</p>}
        {invalidParams && invalidParams.length > 0 && (
          <ul className="invalid-params-list">
            {invalidParams.map((param, index) => (
              <li key={index}>
                <strong>{param.name}:</strong> {param.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'inherit',
            padding: '2px 6px',
          }}
          aria-label="Cerrar alerta"
        >
          ✕
        </button>
      )}
    </div>
  );
}
