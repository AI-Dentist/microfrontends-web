import { useDevAuth } from '../../hooks/useDevAuth.js';

export function Header() {
  const { isDev, token, setToken, identities, currentIdentity } = useDevAuth();

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon">🦷</div>
        <div>
          <h1 className="brand-title">OdontoClinic — Expediente Clínico</h1>
          <p className="brand-subtitle">
            Microfrontend React (MF3) • Módulo Historia Clínica
          </p>
        </div>
      </div>

      {isDev && (
        <div className="dev-auth-bar" title="Identidad sintética activa para llamadas REST locales">
          <span className="dev-badge">DEV AUTH</span>
          <span style={{ color: 'var(--text-secondary)' }}>Operador:</span>
          <select
            className="dev-select"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="Seleccionar operador de desarrollo"
          >
            {identities.map((id) => (
              <option key={id.token} value={id.token}>
                {id.nombre} ({id.rol})
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: '11px',
              color: currentIdentity.valido ? 'var(--success)' : 'var(--danger)',
              fontWeight: 600,
            }}
          >
            {currentIdentity.valido ? '● Autorizado' : '✕ Inválido (401)'}
          </span>
        </div>
      )}
    </header>
  );
}
