export function Navigation({ activeTab, onSelectTab }) {
  return (
    <nav className="nav-tabs" aria-label="Navegación del módulo">
      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'consulta' ? 'active' : ''}`}
        onClick={() => onSelectTab('consulta')}
      >
        <span>🔍</span>
        <span>Consultar Historia Clínica</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'conectividad' ? 'active' : ''}`}
        onClick={() => onSelectTab('conectividad')}
      >
        <span>⚡</span>
        <span>Estado de Conectividad</span>
      </button>

      <button
        type="button"
        className="nav-tab-btn disabled"
        disabled
        title="Formulario de apertura disponible en Iteración 5B"
      >
        <span>➕</span>
        <span>Nueva Historia Clínica (Iteración 5B)</span>
      </button>

      <button
        type="button"
        className="nav-tab-btn disabled"
        disabled
        title="Formularios de edición disponibles en Iteración 5C"
      >
        <span>✏️</span>
        <span>Actualizar Datos (Iteración 5C)</span>
      </button>
    </nav>
  );
}
