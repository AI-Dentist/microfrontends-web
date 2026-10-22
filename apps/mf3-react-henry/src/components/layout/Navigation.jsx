export function Navigation({ activeTab, onSelectTab }) {
  return (
    <nav className="nav-tabs" aria-label="Navegación del módulo">
      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'consulta' ? 'active' : ''}`}
        onClick={() => onSelectTab('consulta')}
      >
        <span>🔍</span>
        <span>Consultar Expediente</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'crear' ? 'active' : ''}`}
        onClick={() => onSelectTab('crear')}
      >
        <span>➕</span>
        <span>Nueva Historia Clínica</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'actualizar' ? 'active' : ''}`}
        onClick={() => onSelectTab('actualizar')}
      >
        <span>✏️</span>
        <span>Actualizar Antecedentes</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'conectividad' ? 'active' : ''}`}
        onClick={() => onSelectTab('conectividad')}
      >
        <span>⚡</span>
        <span>Conectividad</span>
      </button>

      <button
        type="button"
        className="nav-tab-btn disabled"
        disabled
        title="Gestión de alergias, medicamentos y cambios de estado en Iteración 5C"
      >
        <span>💊</span>
        <span>Alergias & Fármacos (Iteración 5C)</span>
      </button>
    </nav>
  );
}
