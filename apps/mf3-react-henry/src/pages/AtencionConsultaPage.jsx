import { useState, useEffect } from 'react';
import { useConsultasOdontologicas } from '../hooks/useConsultasOdontologicas.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { AtencionConsultaForm } from '../components/consultas-odontologicas/AtencionConsultaForm.jsx';

/**
 * Página principal para la atención clínica en sillón dental (Iteración 6F-2).
 * Permite buscar/precargar una consulta odontológica en curso,
 * editar la información clínica completa y guardar con concurrencia optimista.
 *
 * @param {object} props
 * @param {string} [props.initialConsultaId] - Identificador canónico de la consulta
 * @param {Function} [props.onVolver] - Callback para regresar al listado o detalle
 * @param {Function} [props.onVerDetalle] - Callback para navegar a la ficha completa
 */
export function AtencionConsultaPage({
  initialConsultaId = '',
  onVolver,
  onVerDetalle,
}) {
  const [consultaIdInput, setConsultaIdInput] = useState(initialConsultaId);
  const {
    loading,
    error,
    selectedConsulta,
    obtenerPorId,
    consultarEstadoServidor,
    actualizarAtencion,
    resetError,
    limpiar,
    setSelectedConsulta,
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

  const handleGuardarAtencion = async (payload) => {
    if (!selectedConsulta?.id) return null;
    return actualizarAtencion(selectedConsulta.id, payload);
  };

  const handleRecargar = () => {
    if (selectedConsulta?.id) {
      void obtenerPorId(selectedConsulta.id);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Buscador de consulta si no se seleccionó ninguna */}
      <Card title="Atención Odontológica en Sillón Dental">
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: 0, marginBottom: '16px' }}>
          Registro y actualización de anamnesis, exploración física, diagnósticos CIE-10, procedimientos realizados bajo nomenclatura FDI y notas SOAP para consultas en estado <strong>EN_CURSO</strong>.
        </p>

        <form onSubmit={handleBuscar} className="search-bar-container">
          <Input
            value={consultaIdInput}
            onChange={(e) => setConsultaIdInput(e.target.value)}
            placeholder="Ingrese el ID canónico de la consulta (ej. cons_12345678-1111-2222-3333-444455556666)"
            aria-label="Identificador de la consulta odontológica a atender"
            disabled={loading}
          />

          <Button type="submit" loading={loading} disabled={!consultaIdInput.trim()}>
            Cargar Consulta
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
      {loading && !selectedConsulta && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Cargando expediente y datos clínicos de la consulta...
          </p>
        </div>
      )}

      {/* Error de búsqueda inicial RFC 7807 */}
      {error && !selectedConsulta && !loading && (
        <Alert
          title={error.title}
          detail={error.detail}
          status={error.status}
          invalidParams={error.invalidParams}
          onClose={resetError}
        />
      )}

      {/* Formulario de Atención Clínica */}
      {selectedConsulta && (
        <AtencionConsultaForm
          consulta={selectedConsulta}
          onGuardar={handleGuardarAtencion}
          onRecargar={handleRecargar}
          onConsultarServidor={consultarEstadoServidor}
          onActualizarConsulta={setSelectedConsulta}
          onVolver={onVerDetalle ? () => onVerDetalle(selectedConsulta.id) : onVolver}
          loading={loading}
          externalError={error}
          onResetError={resetError}
        />
      )}

      {/* Estado vacío inicial */}
      {!loading && !selectedConsulta && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🦷</div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Seleccione una Consulta para Atender
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
            Ingrese el identificador canónico de una consulta odontológica o navegue desde el listado de consultas para registrar la evolución en sillón, procedimientos y diagnósticos.
          </p>
        </div>
      )}
    </div>
  );
}
