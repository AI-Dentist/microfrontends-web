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
        className={`nav-tab-btn ${activeTab === 'gestion' ? 'active' : ''}`}
        onClick={() => onSelectTab('gestion')}
      >
        <span>💊</span>
        <span>Gestión Clínica (Iteración 5C)</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'consultas' || activeTab === 'detalle-consulta' ? 'active' : ''}`}
        onClick={() => onSelectTab('consultas')}
      >
        <span>🦷</span>
        <span>Consultas Odontológicas (6F-1)</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'abrir-consulta' ? 'active' : ''}`}
        onClick={() => onSelectTab('abrir-consulta')}
      >
        <span>➕</span>
        <span>Abrir Consulta</span>
      </button>

      <button
        type="button"
        className={`nav-tab-btn ${activeTab === 'atencion-consulta' ? 'active' : ''}`}
        onClick={() => onSelectTab('atencion-consulta')}
      >
        <span>🪑</span>
        <span>Atención en Sillón (6F-2)</span>
      </button>
    </nav>
  );
}
