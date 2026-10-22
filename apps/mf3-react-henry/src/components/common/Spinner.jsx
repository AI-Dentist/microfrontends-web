export function Spinner({ dark = false, className = '' }) {
  return <div className={`spinner ${dark ? 'dark' : ''} ${className}`} role="status" aria-label="Cargando" />;
}
