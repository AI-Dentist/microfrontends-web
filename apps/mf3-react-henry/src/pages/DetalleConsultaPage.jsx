import { useState, useEffect } from 'react';
import { useConsultasOdontologicas } from '../hooks/useConsultasOdontologicas.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { ConsultaDetailView } from '../components/consultas-odontologicas/ConsultaDetailView.jsx';

export function DetalleConsultaPage({
  initialConsultaId = '',
  onVolver,
  onVerHistoria,
}) {
  const [consultaIdInput, setConsultaIdInput] = useState(initialConsultaId);
  const {
    loading,
    error,
    selectedConsulta,
    obtenerPorId,
    resetError,
    limpiar,
  } = useConsultasOdontologicas();

  useEffect(() => {
    if (initialConsultaId && initialConsultaId.trim()) {
      void obtenerPorId(initialConsultaId.trim());
    }
  }, [initialConsultaId, obtenerPorId]);

  const handleBuscar = (e) => {
    if (e) e.preventDefault();
    if (!consultaIdInput.trim()) return;
    void obtenerPorId(consultaIdInput.trim());
  };

  const handleLimpiar = () => {
    setConsultaIdInput('');
    limpiar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Buscador de Consulta por ID */}
      <Card title="Ficha Clínica de Consulta Odontológica">
        <form onSubmit={handleBuscar} className="search-bar-container">
          <Input
            value={consultaIdInput}
            onChange={(e) => setConsultaIdInput(e.target.value)}
            placeholder="Ingrese el ID canónico de la consulta (ej. cons_12345678-1111-2222-3333-444455556666)"
            aria-label="Identificador de la consulta odontológica"
            disabled={loading}
          />

          <Button type="submit" loading={loading} disabled={!consultaIdInput.trim()}>
            Cargar Ficha
          </Button>

          {(consultaIdInput || selectedConsulta || error) && (
            <Button variant="secondary" onClick={handleLimpiar} disabled={loading}>
              Limpiar
            </Button>
          )}

          {onVolver && (
            <Button variant="secondary" onClick={onVolver} style={{ marginLeft: 'auto' }}>
              ← Ir al Listado
            </Button>
          )}
        </form>
      </Card>

      {/* Indicador de Carga */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Recuperando ficha clínica completa y snapshot de riesgo en MS2...
          </p>
        </div>
      )}

      {/* Manejo de Error RFC 7807 */}
      {error && !loading && (
        <Alert
          title={error.title}
          detail={error.detail}
          status={error.status}
          invalidParams={error.invalidParams}
          onClose={resetError}
        />
      )}

      {/* Renderizado de la ficha clínica */}
      {!loading && !error && selectedConsulta && (
        <ConsultaDetailView
          consulta={selectedConsulta}
          onVolver={onVolver}
          onVerHistoria={onVerHistoria}
        />
      )}

      {/* Estado vacío inicial */}
      {!loading && !error && !selectedConsulta && (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Consulte una Ficha Odontológica
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
            Ingrese el identificador canónico de la consulta para revisar diagnósticos CIE-10, procedimientos realizados, evolución SOAP y el snapshot de riesgo clínico inmutable.
          </p>
        </div>
      )}
    </div>
  );
}
