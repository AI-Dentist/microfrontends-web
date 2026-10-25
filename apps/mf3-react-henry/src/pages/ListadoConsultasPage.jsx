import { useState, useEffect } from 'react';
import { useConsultasOdontologicas } from '../hooks/useConsultasOdontologicas.js';
import { Card } from '../components/common/Card.jsx';
import { Input } from '../components/common/Input.jsx';
import { Button } from '../components/common/Button.jsx';
import { Alert } from '../components/common/Alert.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { ConsultaCard } from '../components/consultas-odontologicas/ConsultaCard.jsx';

const PAGE_SIZE = 10;

// Identificadores sintéticos verificados para facilitar la navegación
const SUGGESTED_HISTORIAS = [
  { label: 'Historia Activa E2E', valor: 'hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a' },
  { label: 'Historia Dennis 001', valor: 'hc_12345678-aaaa-bbbb' },
  { label: 'Historia Inexistente (404)', valor: 'hc_00000000-0000-0000-0000-000000000000' },
];

export function ListadoConsultasPage({
  initialHistoriaId = '',
  onVerDetalle,
  onAbrirConsulta,
  onEditarAtencion,
}) {
  const [historiaId, setHistoriaId] = useState(initialHistoriaId);
  const [searchedId, setSearchedId] = useState(initialHistoriaId);
  const [currentPage, setCurrentPage] = useState(0);

  const {
    loading,
    error,
    listData,
    listarPorHistoria,
    resetError,
    limpiar,
  } = useConsultasOdontologicas();

  // Si recibimos un ID inicial por prop (ej. desde Historia Clínica), buscar automáticamente
  useEffect(() => {
    if (initialHistoriaId && initialHistoriaId.trim()) {
      void listarPorHistoria(initialHistoriaId, { limite: PAGE_SIZE, offset: 0 });
    }
  }, [initialHistoriaId, listarPorHistoria]);

  const handleBuscar = (e) => {
    if (e) e.preventDefault();
    if (!historiaId.trim()) return;

    setSearchedId(historiaId.trim());
    setCurrentPage(0);
    void listarPorHistoria(historiaId.trim(), { limite: PAGE_SIZE, offset: 0 });
  };

  const handlePageChange = (newPage) => {
    const newOffset = newPage * PAGE_SIZE;
    setCurrentPage(newPage);
    void listarPorHistoria(searchedId, { limite: PAGE_SIZE, offset: newOffset });
  };

  const handleSelectChip = (chipValor) => {
    setHistoriaId(chipValor);
    setSearchedId(chipValor);
    setCurrentPage(0);
    void listarPorHistoria(chipValor, { limite: PAGE_SIZE, offset: 0 });
  };

  const handleLimpiar = () => {
    setHistoriaId('');
    setSearchedId('');
    setCurrentPage(0);
    limpiar();
  };

  const { consultas = [], total = 0, offset = 0, limite = PAGE_SIZE } = listData;
  const totalPages = Math.ceil(total / limite);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="Consultas Odontológicas por Historia Clínica">
        <form onSubmit={handleBuscar} className="search-bar-container">
          <Input
            value={historiaId}
            onChange={(e) => setHistoriaId(e.target.value)}
            placeholder="Ingrese el ID canónico de la Historia Clínica (ej. hc_8af2ae02-5a6a-4bb0-8da1-1c9e23cff07a)"
            aria-label="Identificador de la Historia Clínica"
            disabled={loading}
          />

          <Button type="submit" loading={loading} disabled={!historiaId.trim()}>
            Buscar Atenciones
          </Button>

          {(searchedId || error || consultas.length > 0) && (
            <Button variant="secondary" onClick={handleLimpiar} disabled={loading}>
              Limpiar
            </Button>
          )}

          {onAbrirConsulta && (
            <Button
              variant="primary"
              onClick={() => onAbrirConsulta(historiaId.trim())}
              style={{ marginLeft: 'auto' }}
            >
              ➕ Nueva Consulta
            </Button>
          )}
        </form>

        {/* Chips sugeridos */}
        <div className="quick-chips-container">
          <span>Accesos rápidos de prueba:</span>
          {SUGGESTED_HISTORIAS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="quick-chip"
              onClick={() => handleSelectChip(chip.valor)}
              disabled={loading}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Indicador de Carga */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
            Consultando atenciones odontológicas en MS2...
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

      {/* Listado con Resultados */}
      {!loading && !error && searchedId && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
              Atenciones registradas para <code>{searchedId}</code>{' '}
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 400 }}>
                ({total} {total === 1 ? 'consulta encontrada' : 'consultas encontradas'})
              </span>
            </h3>

            {onAbrirConsulta && (
              <Button
                variant="secondary"
                onClick={() => onAbrirConsulta(searchedId)}
                style={{ fontSize: '13px', padding: '6px 12px' }}
              >
                ➕ Abrir Consulta en este Expediente
              </Button>
            )}
          </div>

          {consultas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🦷</div>
              <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
                Sin consultas odontológicas
              </h4>
              <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto 16px' }}>
                Este expediente clínico aún no tiene atenciones odontológicas registradas en el sillón dental.
              </p>
              {onAbrirConsulta && (
                <Button variant="primary" onClick={() => onAbrirConsulta(searchedId)}>
                  Iniciar Primera Consulta
                </Button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {consultas.map((consulta) => (
                <ConsultaCard
                  key={consulta.id}
                  consulta={consulta}
                  onVerDetalle={onVerDetalle}
                  onEditarAtencion={onEditarAtencion}
                />
              ))}

              {/* Paginación real */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '16px',
                    marginTop: '20px',
                    padding: '12px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <Button
                    variant="secondary"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 0 || loading}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    ← Anterior
                  </Button>

                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Página <strong>{currentPage + 1}</strong> de <strong>{totalPages}</strong> (Mostrando {offset + 1} - {Math.min(offset + limite, total)} de {total})
                  </span>

                  <Button
                    variant="secondary"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1 || loading}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Siguiente →
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Estado Inicial vacío */}
      {!loading && !error && !searchedId && (
        <div className="empty-state">
          <div className="empty-state-icon">🦷</div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Historial de Consultas Odontológicas
          </h3>
          <p style={{ fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
            Ingrese el identificador de la historia clínica para recuperar la cronología completa de atenciones, diagnósticos y procedimientos realizados.
          </p>
        </div>
      )}
    </div>
  );
}
